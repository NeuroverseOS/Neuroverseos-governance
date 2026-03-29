// Bevia — Align Strategy Ingestion Engine (with governance + conflict detection)
//
// GOVERNED: Every action goes through the guard engine.
// CONFLICT-AWARE: Detects contradictions between uploaded docs BEFORE building world file.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, errorResponse, jsonResponse } from '../shared/auth.ts';
import { checkCredits, deductCredits, refundCredits } from '../shared/credits.ts';
import { callGemini } from '../shared/gemini.ts';
import { governedAction, sanitizeOutput, logAudit, evaluateAction } from '../shared/governance.ts';
import { validate, improve, bootstrap, explain } from '../shared/cli-integration.ts';

const CREDIT_COST = 15;

interface IngestRequest {
  strategyName: string;
  documents: { name: string; content: string }[];
}

interface DocumentConflict {
  docA: string;
  docB: string;
  conflictDescription: string;
  severity: 'hard' | 'soft';  // hard = contradictory, soft = tension but resolvable
  resolution: string;  // AI-suggested resolution
}

serve(async (req: Request) => {
  const auth = await authenticate(req);
  if (!auth.ok) return errorResponse(auth.error!, 401);

  const body: IngestRequest = await req.json();
  const { strategyName, documents } = body;

  if (!strategyName?.trim()) return errorResponse('Strategy name required', 400);
  if (!documents?.length) return errorResponse('At least one document required', 400);

  // ── Governance: evaluate the action ────────────────────────────────────────
  const verdict = evaluateAction({
    intent: 'ingest_strategy',
    tool: 'align',
    userId: auth.userId,
    creditCost: CREDIT_COST,
    metadata: { strategyName, docCount: documents.length },
  });

  await logAudit(auth.supabase, {
    intent: 'ingest_strategy',
    tool: 'align',
    userId: auth.userId,
    creditCost: CREDIT_COST,
    metadata: { strategyName, docCount: documents.length },
  }, verdict);

  if (verdict.status === 'BLOCK') {
    return errorResponse(verdict.reason || 'Action blocked by governance', 403);
  }

  // ── Credits ────────────────────────────────────────────────────────────────
  const creditCheck = await checkCredits(auth.supabase, auth.userId, CREDIT_COST);
  if (!creditCheck.ok) return errorResponse(creditCheck.error!, 402);

  const deduction = await deductCredits(
    auth.supabase, auth.userId, CREDIT_COST,
    'align_ingest', 'align',
    { strategyName, docCount: documents.length },
  );
  if (!deduction.ok) return errorResponse(deduction.error!, 402);

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 1: CONFLICT DETECTION (when multiple docs uploaded)
  // Before building the world file, check if the docs contradict each other.
  // If hard conflicts exist, ask the user which takes priority.
  // ════════════════════════════════════════════════════════════════════════════

  let conflicts: DocumentConflict[] = [];

  if (documents.length > 1) {
    conflicts = await detectDocumentConflicts(documents);

    // If hard conflicts exist, return them for user resolution BEFORE building
    const hardConflicts = conflicts.filter(c => c.severity === 'hard');
    if (hardConflicts.length > 0) {
      // Refund credits — we haven't built the world file yet
      await refundCredits(
        auth.supabase, auth.userId, CREDIT_COST,
        'align_ingest', 'align',
        'Hard conflicts detected between documents — user resolution required',
      );

      return jsonResponse({
        status: 'conflicts_detected',
        conflicts: hardConflicts,
        softConflicts: conflicts.filter(c => c.severity === 'soft'),
        message: 'Your documents contain contradictions. Please resolve them before we build your alignment engine.',
        creditsRefunded: true,
      }, 409); // 409 Conflict
    }

    // Soft conflicts get noted but don't block — they're included in the world file as tensions
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 2: WORLD FILE GENERATION
  // ════════════════════════════════════════════════════════════════════════════

  const combinedText = documents
    .map(d => `--- Document: ${d.name} ---\n${d.content}`)
    .join('\n\n');

  const maxChars = 100_000;
  const truncated = combinedText.length > maxChars
    ? combinedText.slice(0, maxChars) + '\n\n[Document truncated — too long for single analysis]'
    : combinedText;

  // Include soft conflict context in the prompt so AI knows about tensions
  const conflictContext = conflicts.length > 0
    ? `\n\nNOTE: The following tensions were detected between documents. Acknowledge these in your rules — they represent real organizational tensions that the alignment engine should track:\n${conflicts.map(c => `- ${c.docA} vs ${c.docB}: ${c.conflictDescription} (suggested resolution: ${c.resolution})`).join('\n')}`
    : '';

  const result = await governedAction(auth.supabase, {
    intent: 'ai_call',
    tool: 'align',
    userId: auth.userId,
    metadata: { phase: 'world_file_generation' },
  }, async () => {
    const aiResult = await callGemini({
      systemPrompt: INGEST_SYSTEM_PROMPT,
      messages: [{ role: 'user', parts: [{ text: `Parse this strategy documentation and extract governance rules:\n\n${truncated}${conflictContext}` }] }],
      model: 'gemini-2.0-flash',
      temperature: 0.3,
      maxTokens: 4096,
    });

    if (!aiResult.ok) throw new Error(aiResult.error);
    return aiResult;
  });

  if (!result.ok) {
    await refundCredits(auth.supabase, auth.userId, CREDIT_COST, 'align_ingest', 'align', result.error!);
    return errorResponse('Strategy parsing failed. You were not charged.', 500);
  }

  // Parse the AI response into a structured world file
  const worldFile = parseWorldFileResponse(result.result!.text);

  if (!worldFile) {
    await refundCredits(auth.supabase, auth.userId, CREDIT_COST, 'align_ingest', 'align', 'Failed to parse world file from AI response');
    return errorResponse('Could not extract rules from your documents. You were not charged.', 500);
  }

  // ── Governance: sanitize output ────────────────────────────────────────────
  const sanitized = sanitizeOutput(worldFile.summary, 'align');
  worldFile.summary = sanitized.text;

  // ════════════════════════════════════════════════════════════════════════════
  // PHASE 3: VALIDATE + IMPROVE (using REAL CLI engine functions)
  // Same as running `neuroverse validate` and `neuroverse improve`
  // ════════════════════════════════════════════════════════════════════════════

  let validationResult = null;
  let improvementSuggestions = null;
  let explanationText = null;

  try {
    // Step 1: Compile the generated world file using bootstrap engine
    // This is `neuroverse bootstrap --input world.nv-world.md`
    const buildStrategyMd = buildWorldMarkdownFromRules(strategyName, worldFile);
    const compiled = bootstrap(buildStrategyMd);

    if (compiled.world) {
      // Step 2: Validate the compiled world
      // This is `neuroverse validate --world <dir>`
      validationResult = validate(compiled.world);

      // Step 3: Suggest improvements
      // This is `neuroverse improve <world>`
      try {
        improvementSuggestions = improve(compiled.world);
      } catch { /* improve is advisory, don't fail on it */ }

      // Step 4: Generate plain-language explanation
      // This is `neuroverse explain <world>`
      try {
        explanationText = explain(compiled.world);
      } catch { /* explain is advisory */ }
    }
  } catch {
    // Validation/improvement failure is non-blocking — strategy still saves
  }

  // Store in Supabase
  const { data: strategy, error: insertError } = await auth.supabase
    .from('align_strategies')
    .insert({
      user_id: auth.userId,
      name: strategyName,
      source_docs: documents.map(d => ({ name: d.name, charCount: d.content.length })),
      world_file: worldFile,
      rules_count: worldFile.guards.length + worldFile.values.length,
      detected_conflicts: conflicts.length > 0 ? conflicts : null,
    })
    .select()
    .single();

  if (insertError) {
    return errorResponse('Failed to save strategy: ' + insertError.message, 500);
  }

  return jsonResponse({
    strategyId: strategy.id,
    name: strategyName,
    rulesExtracted: {
      guards: worldFile.guards.length,
      values: worldFile.values.length,
      redLines: worldFile.redLines.length,
      priorities: worldFile.priorities.length,
    },
    summary: worldFile.summary,
    softConflicts: conflicts.filter(c => c.severity === 'soft'),
    // ── CLI engine outputs (validate, improve, explain) ──────────────────────
    validation: validationResult
      ? { valid: validationResult.valid, summary: validationResult.summary, findings: validationResult.findings }
      : null,
    improvements: improvementSuggestions
      ? { suggestions: improvementSuggestions.text }
      : null,
    explanation: explanationText
      ? { plainLanguage: explanationText.text }
      : null,
    creditsRemaining: deduction.newBalance,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Helper: build .nv-world.md from extracted rules (for bootstrap/validate/improve)
// ═══════════════════════════════════════════════════════════════════════════════

function buildWorldMarkdownFromRules(
  name: string,
  worldFile: Record<string, unknown>,
): string {
  const guards = (worldFile.guards || []) as Record<string, unknown>[];
  const values = (worldFile.values || []) as Record<string, unknown>[];
  const redLines = (worldFile.redLines || []) as Record<string, unknown>[];
  const priorities = (worldFile.priorities || []) as Record<string, unknown>[];

  let md = `---\nworld_id: user-${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}\nname: ${name}\nversion: 1.0.0\nruntime_mode: COMPLIANCE\ndefault_profile: standard\n---\n\n# Thesis\n\nUser strategy: ${worldFile.summary || name}\n\n# Invariants\n\n`;

  for (const rl of redLines) {
    md += `- \`${rl.id}\` — ${rl.description} (structural, immutable)\n`;
  }

  md += `\n# Guards\n\n`;
  for (const g of guards) {
    md += `## ${g.id}\n${g.description}\nWhen intent matches propose AND violates ${g.id}\nThen ${(g.enforcement as string || 'WARN').toUpperCase()}\n\n> ${g.intent || g.description}\n\n`;
  }
  for (const v of values) {
    md += `## ${v.id}\n${v.description}\nWhen intent matches propose AND misaligns with ${v.id}\nThen WARN\n\n> ${v.intent || v.description}\n\n`;
  }
  for (const rl of redLines) {
    md += `## ${rl.id}\n${rl.description}\nWhen intent matches propose AND violates ${rl.id}\nThen BLOCK\n\n> Non-negotiable.\n\n`;
  }

  if (priorities.length) {
    md += `# State\n\n`;
    for (const p of priorities) {
      md += `## ${p.id}\n- type: number\n- min: 0\n- max: 10\n- default: ${p.weight || 5}\n- label: ${p.label}\n- description: ${p.description}\n\n`;
    }
  }

  return md;
}


// ════════════════════════════════════════════════════════════════════════════════
// CONFLICT DETECTION
// When multiple docs are uploaded, compare them for contradictions.
// Uses AI to understand conceptual conflicts (not keyword matching).
// ════════════════════════════════════════════════════════════════════════════════

async function detectDocumentConflicts(
  documents: { name: string; content: string }[],
): Promise<DocumentConflict[]> {
  // Build summaries of each doc (truncated for comparison)
  const summaries = documents.map(d => ({
    name: d.name,
    excerpt: d.content.slice(0, 3000), // first 3K chars per doc
  }));

  const prompt = `You are analyzing multiple corporate documents for CONTRADICTIONS.

Documents:
${summaries.map(s => `--- ${s.name} ---\n${s.excerpt}`).join('\n\n')}

Find any CONTRADICTIONS between these documents. A contradiction is when one document says or implies something that directly conflicts with another document.

Examples of HARD conflicts (contradictory — can't both be true):
- Doc A says "ship fast, iterate" / Doc B says "no release without full QA sign-off"
- Doc A says "flat hierarchy, everyone decides" / Doc B says "all decisions require VP approval"
- Doc A says "remote-first, async communication" / Doc B says "in-office collaboration is core to our culture"

Examples of SOFT conflicts (tension — both can be true but need prioritization):
- Doc A emphasizes "innovation and risk-taking" / Doc B emphasizes "stability and predictability"
- Doc A values "individual autonomy" / Doc B values "team consensus"
- Doc A says "customer obsession" / Doc B says "sustainable pace" (these CAN coexist but create tension)

If there are NO contradictions, return an empty array.

RESPOND WITH JSON:
\`\`\`json
[
  {
    "docA": "name of first document",
    "docB": "name of second document",
    "conflictDescription": "what the contradiction is, specifically",
    "severity": "hard" or "soft",
    "resolution": "suggested way to resolve — e.g., 'Which takes priority: shipping speed or QA completeness?'"
  }
]
\`\`\`

Rules:
- Only flag REAL contradictions, not just different emphasis areas
- If docs cover different topics entirely, they don't conflict
- Hard = they literally can't both be true simultaneously
- Soft = they create tension but an org can hold both with clear prioritization`;

  const aiResult = await callGemini({
    systemPrompt: prompt,
    messages: [{ role: 'user', parts: [{ text: 'Analyze these documents for contradictions.' }] }],
    model: 'gemini-2.0-flash',
    temperature: 0.2,
    maxTokens: 1024,
  });

  if (!aiResult.ok) return []; // If conflict detection fails, proceed without it

  try {
    const jsonMatch = aiResult.text.match(/```json\s*([\s\S]*?)```/) || aiResult.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const raw = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(c => ({
          docA: String(c.docA || ''),
          docB: String(c.docB || ''),
          conflictDescription: String(c.conflictDescription || ''),
          severity: c.severity === 'hard' ? 'hard' : 'soft',
          resolution: String(c.resolution || ''),
        }));
      }
    }
  } catch { /* parse failed */ }

  return [];
}


// ════════════════════════════════════════════════════════════════════════════════
// WORLD FILE PARSING + TYPES
// ════════════════════════════════════════════════════════════════════════════════

interface AlignWorldFile {
  summary: string;
  guards: AlignGuard[];
  values: AlignValue[];
  redLines: AlignRedLine[];
  priorities: AlignPriority[];
}

interface AlignGuard {
  id: string;
  label: string;
  description: string;
  enforcement: 'block' | 'warn' | 'flag';
  intent: string;
  source: string;
}

interface AlignValue {
  id: string;
  label: string;
  description: string;
  intent: string;
  alignedBehaviors: string[];
  misalignedBehaviors: string[];
  source: string;
}

interface AlignRedLine {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  behavioralDescription: string;
  source: string;
}

interface AlignPriority {
  id: string;
  label: string;
  description: string;
  messaging: string;
  weight: number;
  source: string;
}

function parseWorldFileResponse(text: string): AlignWorldFile | null {
  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const raw = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(raw);
      return validateWorldFile(parsed);
    }
    return null;
  } catch {
    return null;
  }
}

function validateWorldFile(raw: Record<string, unknown>): AlignWorldFile | null {
  if (!raw.guards || !raw.values) return null;

  return {
    summary: (raw.summary as string) || 'Strategy parsed successfully',
    guards: Array.isArray(raw.guards) ? raw.guards.map(normalizeGuard) : [],
    values: Array.isArray(raw.values) ? raw.values.map(normalizeValue) : [],
    redLines: Array.isArray(raw.redLines) ? raw.redLines.map(normalizeRedLine) : [],
    priorities: Array.isArray(raw.priorities) ? raw.priorities.map(normalizePriority) : [],
  };
}

function normalizeGuard(g: Record<string, unknown>): AlignGuard {
  return {
    id: String(g.id || crypto.randomUUID().slice(0, 8)),
    label: String(g.label || 'Unnamed rule'),
    description: String(g.description || ''),
    enforcement: (['block', 'warn', 'flag'].includes(g.enforcement as string) ? g.enforcement : 'warn') as 'block' | 'warn' | 'flag',
    intent: String(g.intent || g.description || ''),
    source: String(g.source || 'unknown'),
  };
}

function normalizeValue(v: Record<string, unknown>): AlignValue {
  return {
    id: String(v.id || crypto.randomUUID().slice(0, 8)),
    label: String(v.label || 'Unnamed value'),
    description: String(v.description || ''),
    intent: String(v.intent || v.description || ''),
    alignedBehaviors: Array.isArray(v.alignedBehaviors) ? v.alignedBehaviors.map(String) : [],
    misalignedBehaviors: Array.isArray(v.misalignedBehaviors) ? v.misalignedBehaviors.map(String) : [],
    source: String(v.source || 'unknown'),
  };
}

function normalizeRedLine(r: Record<string, unknown>): AlignRedLine {
  return {
    id: String(r.id || crypto.randomUUID().slice(0, 8)),
    label: String(r.label || 'Unnamed red line'),
    description: String(r.description || ''),
    keywords: Array.isArray(r.keywords) ? r.keywords.map(String) : [],
    behavioralDescription: String(r.behavioralDescription || r.description || ''),
    source: String(r.source || 'unknown'),
  };
}

function normalizePriority(p: Record<string, unknown>): AlignPriority {
  return {
    id: String(p.id || crypto.randomUUID().slice(0, 8)),
    label: String(p.label || 'Unnamed priority'),
    description: String(p.description || ''),
    messaging: String(p.messaging || p.description || ''),
    weight: typeof p.weight === 'number' ? Math.max(1, Math.min(10, p.weight)) : 5,
    source: String(p.source || 'unknown'),
  };
}

const INGEST_SYSTEM_PROMPT = `You are Align by Bevia — a strategy alignment engine. Your job is to read corporate strategy documents, culture documents, and values statements, then extract structured governance rules.

CRITICAL PRINCIPLE: Extract BEHAVIORS and INTENT, not keywords. Someone can use all the right buzzwords ("customer-centric", "data-driven", "innovative") while proposing something that directly contradicts the culture. And someone can express deep alignment using completely different vocabulary. Your rules must catch both cases.

EXTRACT THESE CATEGORIES:

1. GUARDS — Operational rules described as behavioral expectations.
   Example: "All customer-facing changes require QA sign-off" →
     intent: "Protect end-user experience by requiring quality verification before changes go live"

2. VALUES — Cultural values described as OBSERVABLE BEHAVIORS, not word lists.
   Example: "Customer obsession" →
     intent: "Every decision should measurably improve the experience of the people using our product"
     alignedBehaviors: ["Prioritizing end-user outcomes over internal efficiency", "Referencing real user data in decision-making"]
     misalignedBehaviors: ["Optimizing for internal convenience at expense of user experience", "Using customer-centric language while proposing cost cuts that hurt service quality"]

3. RED LINES — Absolute non-negotiables. Keywords ARE appropriate here (concrete prohibitions). Also include behavioral description.
   Example: "We never compromise user data privacy for growth metrics" →
     keywords: ["sell user data", "share personal information"]
     behavioralDescription: "Any proposal that trades user privacy for growth, engagement, or revenue metrics"

4. PRIORITIES — Strategic priorities as messaging intent.
   Example: "Sustainable growth over rapid scaling" →
     weight: 8, messaging: "Proposals should reflect patience and quality over urgency and speed"

RESPOND WITH VALID JSON:
\`\`\`json
{
  "summary": "Brief 1-sentence summary of the strategy",
  "guards": [{ "id": "snake_case", "label": "Name", "description": "What it enforces", "enforcement": "block|warn|flag", "intent": "Behavioral intent", "source": "Document/section" }],
  "values": [{ "id": "snake_case", "label": "Name", "description": "Meaning in practice", "intent": "Core principle, language-agnostic", "alignedBehaviors": ["Observable aligned patterns"], "misalignedBehaviors": ["Observable misaligned patterns INCLUDING lip service"], "source": "Document/section" }],
  "redLines": [{ "id": "snake_case", "label": "Name", "description": "What is not allowed", "keywords": ["trigger phrases"], "behavioralDescription": "What violation looks like in practice", "source": "Document/section" }],
  "priorities": [{ "id": "snake_case", "label": "Name", "description": "What it means", "messaging": "Spirit of aligned work", "weight": 8, "source": "Document/section" }]
}
\`\`\`

RULES:
- Extract what's ACTUALLY in the documents. Don't invent rules.
- Behaviors must be OBSERVABLE PATTERNS, not keyword lists.
- Include misaligned behaviors that use RIGHT vocabulary with WRONG intent (lip service detection).
- Red lines are the ONLY category where keywords are appropriate.
- These rules must work in ANY language.
- Be thorough — 10-20 rules is typical.`;
