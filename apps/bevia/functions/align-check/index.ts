// Bevia — Align Document Check Engine (Hybrid)
//
// TWO-PASS ARCHITECTURE:
// Pass 1: Deterministic keyword/rule scan (instant, free) — catches obvious hits and red lines
// Pass 2: AI conceptual analysis (Gemini Flash) — understands meaning, not just words
//
// Why hybrid?
// - Keywords alone miss conceptual alignment ("reduce ticket time" IS customer obsession)
// - Keywords alone get fooled by lip service ("customer-centric" in intro, outsource support in body)
// - AI alone is inconsistent (different answer each run) and slow
// - Hybrid: deterministic pass anchors the verdict, AI pass fills in the nuance
//
// Cost: ~$0.01 per check (Gemini Flash). Still 80%+ margin on 1 credit ($0.05).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, errorResponse, jsonResponse } from '../shared/auth.ts';
import { checkCredits, deductCredits, refundCredits } from '../shared/credits.ts';
import { callGemini } from '../shared/gemini.ts';
import { evaluateAction, logAudit, governedAction, sanitizeOutput } from '../shared/governance.ts';
import { analyzeIntent, getPatternIntent, buildIntentPromptAddition, DEFAULT_INTENTS } from '../shared/intent.ts';

const CREDIT_COST = 1;

interface CheckRequest {
  strategyId: string;
  documentName: string;
  documentText: string;
  scope: 'strategy' | 'culture' | 'both';
  intent?: string;
}

export interface AlignVerdict {
  status: 'ALIGN' | 'DRIFT' | 'CONFLICT';
  alignmentScore: number; // 0-100
  strategyScore: number;
  cultureScore: number;
  conflicts: VerdictItem[];
  gaps: VerdictItem[];
  alignments: VerdictItem[];
  summary: string;
}

interface VerdictItem {
  ruleId: string;
  ruleLabel: string;
  type: 'guard' | 'value' | 'redline' | 'priority';
  status: 'aligned' | 'drifted' | 'conflict' | 'missing';
  evidence: string;
  ruleDescription: string;
  source: 'deterministic' | 'ai'; // which pass found this
}

serve(async (req: Request) => {
  const auth = await authenticate(req);
  if (!auth.ok) return errorResponse(auth.error!, 401);

  const body: CheckRequest = await req.json();
  const { strategyId, documentName, documentText, scope } = body;

  if (!strategyId) return errorResponse('Strategy ID required', 400);
  if (!documentText?.trim()) return errorResponse('Document text required', 400);

  // ── Governance: evaluate the action ────────────────────────────────────────
  const govVerdict = evaluateAction({
    intent: 'check_alignment',
    tool: 'align',
    userId: auth.userId,
    creditCost: CREDIT_COST,
    metadata: { strategyId, documentName },
  });
  await logAudit(auth.supabase, { intent: 'check_alignment', tool: 'align', userId: auth.userId, creditCost: CREDIT_COST }, govVerdict);
  if (govVerdict.status === 'BLOCK') return errorResponse(govVerdict.reason || 'Blocked by governance', 403);

  // ── Credits ────────────────────────────────────────────────────────────────
  const creditCheck = await checkCredits(auth.supabase, auth.userId, CREDIT_COST);
  if (!creditCheck.ok) return errorResponse(creditCheck.error!, 402);

  // Load the strategy world file
  const { data: strategy, error: loadError } = await auth.supabase
    .from('align_strategies')
    .select('*')
    .eq('id', strategyId)
    .eq('user_id', auth.userId)
    .single();

  if (loadError || !strategy) return errorResponse('Strategy not found', 404);

  // Deduct credit upfront
  const deduction = await deductCredits(
    auth.supabase, auth.userId, CREDIT_COST,
    'align_check', 'align',
    { strategyId, documentName },
  );
  if (!deduction.ok) return errorResponse(deduction.error!, 402);

  // ═══════════════════════════════════════════════════════════════
  // PASS 1: Deterministic scan (instant, free)
  // Catches: exact keyword hits, red line violations, obvious gaps
  // ═══════════════════════════════════════════════════════════════
  const deterministicResults = deterministicPass(strategy.world_file, documentText);

  // ═══════════════════════════════════════════════════════════════
  // PASS 2: AI conceptual analysis (Gemini Flash, ~$0.01)
  // Catches: conceptual alignment, behavioral intent, lip service,
  //          indirect references, tone/spirit alignment
  // ═══════════════════════════════════════════════════════════════
  const aiResults = await aiConceptualPass(strategy.world_file, documentText, scope);

  // ═══════════════════════════════════════════════════════════════
  // MERGE: Combine both passes, dedup, resolve disagreements
  // Deterministic red line violations always win (hard blocks).
  // AI conceptual analysis fills in everything else.
  // ═══════════════════════════════════════════════════════════════
  const verdict = mergeVerdicts(deterministicResults, aiResults);

  // Save check result
  await auth.supabase.from('align_checks').insert({
    user_id: auth.userId,
    strategy_id: strategyId,
    doc_name: documentName || 'Untitled',
    verdict: verdict.status,
    alignment_score: verdict.alignmentScore,
    evidence: verdict,
  });

  // Sanitize AI-generated summary
  const sanitized = sanitizeOutput(verdict.summary, 'audit');
  verdict.summary = sanitized.text;

  return jsonResponse({
    verdict,
    creditsRemaining: deduction.newBalance,
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// PASS 1: DETERMINISTIC
// Fast keyword scan. Good at: red lines, explicit keyword matches, obvious gaps.
// Bad at: conceptual alignment, indirect references, behavioral nuance.
// ═══════════════════════════════════════════════════════════════════════════════

interface PassResult {
  conflicts: VerdictItem[];
  gaps: VerdictItem[];
  alignments: VerdictItem[];
}

function deterministicPass(
  worldFile: Record<string, unknown>,
  docText: string,
): PassResult {
  const redLines = (worldFile.redLines || []) as Record<string, unknown>[];

  const docLower = docText.toLowerCase();
  const conflicts: VerdictItem[] = [];

  // Deterministic pass ONLY handles red line keyword flags.
  // Red lines are explicit non-negotiables ("never do X") — keyword matching
  // is appropriate here because these are specific, concrete prohibitions.
  //
  // Guards, values, and priorities are CONCEPTUAL — someone might say
  // "user" instead of "customer", or express "sustainable growth" as
  // "we're not chasing hockey-stick metrics." Keywords can't catch that.
  // That's the AI pass's job.

  for (const rl of redLines) {
    const keywords = (rl.keywords || []) as string[];
    const found = keywords.find(kw => docLower.includes(kw.toLowerCase()));
    if (found) {
      conflicts.push({
        ruleId: String(rl.id),
        ruleLabel: String(rl.label),
        type: 'redline',
        status: 'conflict',
        evidence: extractQuote(docText, found),
        ruleDescription: String(rl.description),
        source: 'deterministic',
      });
    }
  }

  // Everything else — guards, values, priorities — goes to AI pass.
  // Behavior is not word-specific.

  return { conflicts, gaps: [], alignments: [] };
}


// ═══════════════════════════════════════════════════════════════════════════════
// PASS 2: AI CONCEPTUAL ANALYSIS
// Gemini Flash reads the document against the strategy rules and evaluates
// MEANING, not keywords. This catches:
// - "Reduce support ticket time" aligns with "customer obsession" (no keyword match)
// - "Customer-centric" in intro but outsources support = lip service (keyword would miss)
// - Tone/spirit alignment: aggressive growth language vs "sustainable pace" culture
// - Indirect references and implied positions
// ═══════════════════════════════════════════════════════════════════════════════

async function aiConceptualPass(
  worldFile: Record<string, unknown>,
  docText: string,
  scope: string,
): Promise<PassResult> {
  const guards = (worldFile.guards || []) as Record<string, unknown>[];
  const values = (worldFile.values || []) as Record<string, unknown>[];
  const redLines = (worldFile.redLines || []) as Record<string, unknown>[];
  const priorities = (worldFile.priorities || []) as Record<string, unknown>[];

  // Build a concise rules summary for the AI (don't send the whole world file)
  const rulesSummary = buildRulesSummary(guards, values, redLines, priorities, scope);

  // Truncate doc if too long (keep it under 8K chars for Flash speed)
  const maxDocChars = 8000;
  const truncatedDoc = docText.length > maxDocChars
    ? docText.slice(0, maxDocChars) + '\n\n[Document truncated for analysis]'
    : docText;

  const systemPrompt = `You are Align by Bevia — a strategy alignment analyzer. You evaluate documents against a company's strategy, culture, and values.

You will receive:
1. A set of strategy/culture RULES (guards, values, red lines, priorities)
2. A DOCUMENT to evaluate

Your job: for each rule, determine if the document CONCEPTUALLY aligns, drifts, conflicts, or doesn't address it. Think about MEANING and INTENT, not just keywords.

IMPORTANT DISTINCTIONS:
- A document about "reducing response times" ALIGNS with "customer obsession" even without the word "customer" — evaluate INTENT, not vocabulary
- A document that says "customer-first" in the intro but proposes cost-cutting that hurts customers is a CONFLICT — this is LIP SERVICE and is the #1 thing you must catch
- Someone can use every right keyword while proposing the exact opposite of the culture. Judge by what the document DOES (proposes, recommends, prioritizes), not what it SAYS (claims, promises, declares)
- A document that doesn't mention a topic isn't automatically a gap — only flag it if the document SHOULD address it given its subject matter
- "Sustainable growth" means different things in different contexts — evaluate the SPIRIT, not the words
- Documents may be in any language. The rules describe behaviors, not English words. Evaluate conceptually.

LIP SERVICE DETECTION:
When a document uses aligned vocabulary but the actual proposals/actions contradict the intent, mark it as:
- status: "conflict"
- evidence: quote both the lip service language AND the contradicting action
- This is MORE dangerous than obvious misalignment because it looks aligned on the surface

RESPOND WITH JSON:
\`\`\`json
{
  "assessments": [
    {
      "ruleId": "the rule id",
      "ruleLabel": "the rule label",
      "type": "guard|value|redline|priority",
      "status": "aligned|drifted|conflict|missing",
      "evidence": "specific quote or behavioral observation from the document",
      "reasoning": "1 sentence explaining WHY this is aligned/drifted/conflicting"
    }
  ],
  "overallScore": 0-100,
  "strategySummary": "1 sentence on strategy alignment",
  "cultureSummary": "1 sentence on culture alignment"
}
\`\`\`

RULES:
- Only assess rules that are RELEVANT to this document's subject matter
- A hiring plan doesn't need to address product shipping rules — skip irrelevant ones
- Be honest. Don't inflate scores. Drift is drift. Conflict is conflict.
- Evidence should be specific — quote the document or describe the behavioral pattern
- Keep reasoning to 1 sentence per assessment`;

  const userMessage = `STRATEGY/CULTURE RULES:
${rulesSummary}

---

DOCUMENT TO EVALUATE:
${truncatedDoc}`;

  const aiResult = await callGemini({
    systemPrompt,
    messages: [{ role: 'user', parts: [{ text: userMessage }] }],
    model: 'gemini-2.0-flash',
    temperature: 0.3, // low temp for consistent analysis
    maxTokens: 2048,
  });

  if (!aiResult.ok) {
    // AI pass failed — return empty. Deterministic pass still works.
    return { conflicts: [], gaps: [], alignments: [] };
  }

  return parseAiAssessments(aiResult.text);
}

function buildRulesSummary(
  guards: Record<string, unknown>[],
  values: Record<string, unknown>[],
  redLines: Record<string, unknown>[],
  priorities: Record<string, unknown>[],
  scope: string,
): string {
  const lines: string[] = [];

  if (scope === 'strategy' || scope === 'both') {
    if (guards.length) {
      lines.push('## Strategy Guards');
      for (const g of guards) {
        const intent = g.intent ? ` | Intent: ${g.intent}` : '';
        lines.push(`- [${g.id}] "${g.label}": ${g.description}${intent}`);
      }
    }
    if (priorities.length) {
      lines.push('\n## Strategic Priorities');
      for (const p of priorities) {
        const messaging = p.messaging ? ` | Messaging: ${p.messaging}` : '';
        lines.push(`- [${p.id}] "${p.label}" (weight ${p.weight}/10): ${p.description}${messaging}`);
      }
    }
  }

  if (scope === 'culture' || scope === 'both') {
    if (values.length) {
      lines.push('\n## Cultural Values');
      for (const v of values) {
        lines.push(`- [${v.id}] "${v.label}": ${v.intent || v.description}`);
        if (Array.isArray(v.alignedBehaviors) && v.alignedBehaviors.length) {
          lines.push(`  Aligned behaviors: ${v.alignedBehaviors.join('; ')}`);
        }
        if (Array.isArray(v.misalignedBehaviors) && v.misalignedBehaviors.length) {
          lines.push(`  Misaligned behaviors (including lip service): ${v.misalignedBehaviors.join('; ')}`);
        }
      }
    }
    if (redLines.length) {
      lines.push('\n## Red Lines (absolute non-negotiables)');
      for (const r of redLines) {
        const behavioral = r.behavioralDescription ? ` | Behavioral: ${r.behavioralDescription}` : '';
        lines.push(`- [${r.id}] "${r.label}": ${r.description}${behavioral}`);
      }
    }
  }

  return lines.join('\n');
}

function parseAiAssessments(text: string): PassResult {
  const conflicts: VerdictItem[] = [];
  const gaps: VerdictItem[] = [];
  const alignments: VerdictItem[] = [];

  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { conflicts, gaps, alignments };

    const raw = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(raw);
    const assessments = parsed.assessments || [];

    for (const a of assessments) {
      const item: VerdictItem = {
        ruleId: String(a.ruleId || ''),
        ruleLabel: String(a.ruleLabel || ''),
        type: (['guard', 'value', 'redline', 'priority'].includes(a.type) ? a.type : 'value') as VerdictItem['type'],
        status: a.status || 'missing',
        evidence: a.reasoning
          ? `${a.evidence || ''} — ${a.reasoning}`
          : String(a.evidence || ''),
        ruleDescription: '',
        source: 'ai',
      };

      if (item.status === 'conflict') conflicts.push(item);
      else if (item.status === 'drifted' || item.status === 'missing') gaps.push(item);
      else if (item.status === 'aligned') alignments.push(item);
    }
  } catch { /* parse failed — return empty */ }

  return { conflicts, gaps, alignments };
}


// ═══════════════════════════════════════════════════════════════════════════════
// MERGE: Combine deterministic + AI results
// Rules:
// 1. Deterministic red line hits ALWAYS stay (hard block, can't be overridden)
// 2. For same rule assessed by both passes:
//    - If they agree → use AI's evidence (more detailed)
//    - If deterministic says aligned but AI says conflict → use AI (it caught lip service)
//    - If deterministic says nothing but AI found conceptual alignment → use AI
// 3. Deduplicate by ruleId
// ═══════════════════════════════════════════════════════════════════════════════

function mergeVerdicts(det: PassResult, ai: PassResult): AlignVerdict {
  const merged = new Map<string, VerdictItem>();

  // AI results go in first (baseline)
  for (const item of [...ai.conflicts, ...ai.gaps, ...ai.alignments]) {
    if (item.ruleId) merged.set(item.ruleId, item);
  }

  // Deterministic results override or supplement
  for (const item of [...det.conflicts, ...det.gaps, ...det.alignments]) {
    const existing = merged.get(item.ruleId);

    if (!existing) {
      // AI didn't assess this rule — use deterministic
      merged.set(item.ruleId, item);
    } else if (item.type === 'redline' && item.status === 'conflict') {
      // Deterministic red line hit — ALWAYS wins, add deterministic evidence
      merged.set(item.ruleId, {
        ...item,
        evidence: `${item.evidence} [confirmed by keyword scan]`,
      });
    } else if (existing.source === 'ai' && item.source === 'deterministic') {
      // Both assessed — AI's conceptual analysis takes priority for non-red-lines,
      // but append deterministic evidence if it found something
      if (item.evidence && item.status === existing.status) {
        merged.set(item.ruleId, {
          ...existing,
          evidence: `${existing.evidence} (also: ${item.evidence})`,
        });
      }
      // If they disagree, AI wins (it understands context better)
    }
  }

  // Sort into buckets
  const conflicts: VerdictItem[] = [];
  const gaps: VerdictItem[] = [];
  const alignments: VerdictItem[] = [];

  for (const item of merged.values()) {
    if (item.status === 'conflict') conflicts.push(item);
    else if (item.status === 'drifted' || item.status === 'missing') gaps.push(item);
    else if (item.status === 'aligned') alignments.push(item);
  }

  // Calculate scores
  const total = conflicts.length + gaps.length + alignments.length;
  const alignmentScore = total > 0 ? Math.round((alignments.length / total) * 100) : 50;

  const strategyItems = [...conflicts, ...gaps, ...alignments].filter(
    i => i.type === 'guard' || i.type === 'priority',
  );
  const cultureItems = [...conflicts, ...gaps, ...alignments].filter(
    i => i.type === 'value' || i.type === 'redline',
  );

  const strategyAligned = strategyItems.filter(i => i.status === 'aligned').length;
  const cultureAligned = cultureItems.filter(i => i.status === 'aligned').length;

  const strategyScore = strategyItems.length > 0
    ? Math.round((strategyAligned / strategyItems.length) * 100) : 50;
  const cultureScore = cultureItems.length > 0
    ? Math.round((cultureAligned / cultureItems.length) * 100) : 50;

  // Determine overall status
  let status: 'ALIGN' | 'DRIFT' | 'CONFLICT';
  if (conflicts.length > 0) {
    status = 'CONFLICT';
  } else if (alignmentScore >= 75) {
    status = 'ALIGN';
  } else if (alignmentScore >= 40) {
    status = 'DRIFT';
  } else {
    status = 'CONFLICT';
  }

  const summary = buildSummary(status, alignmentScore, conflicts.length, gaps.length, alignments.length);

  return {
    status,
    alignmentScore,
    strategyScore,
    cultureScore,
    conflicts,
    gaps,
    alignments,
    summary,
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function extractQuote(docText: string, keyword: string): string {
  const idx = docText.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx === -1) return `Contains: "${keyword}"`;

  const start = Math.max(0, idx - 50);
  const end = Math.min(docText.length, idx + keyword.length + 50);
  let quote = docText.slice(start, end).trim();

  if (start > 0) quote = '...' + quote;
  if (end < docText.length) quote = quote + '...';

  return `"${quote}"`;
}

function buildSummary(
  status: string,
  score: number,
  conflictCount: number,
  gapCount: number,
  alignCount: number,
): string {
  if (status === 'ALIGN') {
    return `Strong alignment (${score}%). ${alignCount} rule${alignCount !== 1 ? 's' : ''} matched. No conflicts found.`;
  }
  if (status === 'CONFLICT') {
    return `${conflictCount} conflict${conflictCount > 1 ? 's' : ''} found against your strategy/culture. ${gapCount} additional gap${gapCount !== 1 ? 's' : ''}. Score: ${score}%.`;
  }
  return `Partial alignment (${score}%). ${gapCount} gap${gapCount !== 1 ? 's' : ''} where your strategy expects coverage this document doesn't provide.`;
}
