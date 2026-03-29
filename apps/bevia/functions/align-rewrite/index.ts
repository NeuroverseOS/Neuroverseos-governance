// Bevia — Align Rewrite Engine
// Takes a document + verdict + strategy world file
// Returns the document with inline suggestions to improve alignment
// This IS an AI call (2 credits) — Gemini rewrites based on the verdict

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, errorResponse, jsonResponse } from '../shared/auth.ts';
import { checkCredits, deductCredits, refundCredits } from '../shared/credits.ts';
import { callGemini } from '../shared/gemini.ts';
import { evaluateAction, logAudit, sanitizeOutput } from '../shared/governance.ts';
import { analyzeIntent, DEFAULT_INTENTS } from '../shared/intent.ts';
import { recordUserAction } from '../shared/data-accumulation.ts';

const CREDIT_COST = 2;

interface RewriteRequest {
  strategyId: string;
  documentText: string;
  verdict: {
    conflicts: { ruleLabel: string; evidence: string; ruleDescription: string }[];
    gaps: { ruleLabel: string; evidence: string; ruleDescription: string }[];
  };
}

interface RewriteSuggestion {
  original: string;     // the original text to replace
  suggested: string;    // the suggested replacement
  reason: string;       // why this change improves alignment
  ruleLabel: string;    // which rule this addresses
  type: 'replace' | 'insert' | 'remove';
}

serve(async (req: Request) => {
  const auth = await authenticate(req);
  if (!auth.ok) return errorResponse(auth.error!, 401);

  const body: RewriteRequest = await req.json();
  const { strategyId, documentText, verdict } = body;

  if (!documentText?.trim()) return errorResponse('Document text required', 400);
  if (!verdict) return errorResponse('Verdict required', 400);

  // ── Governance ─────────────────────────────────────────────────────────────
  const govVerdict = evaluateAction({
    intent: 'rewrite_document',
    tool: 'align',
    userId: auth.userId,
    creditCost: CREDIT_COST,
    metadata: { strategyId, issueCount: verdict.conflicts?.length + verdict.gaps?.length },
  });
  await logAudit(auth.supabase, { intent: 'rewrite_document', tool: 'align', userId: auth.userId, creditCost: CREDIT_COST }, govVerdict);
  if (govVerdict.status === 'BLOCK') return errorResponse(govVerdict.reason || 'Blocked by governance', 403);

  // ── Credits ────────────────────────────────────────────────────────────────
  const creditCheck = await checkCredits(auth.supabase, auth.userId, CREDIT_COST);
  if (!creditCheck.ok) return errorResponse(creditCheck.error!, 402);

  // Load strategy for context
  const { data: strategy } = await auth.supabase
    .from('align_strategies')
    .select('name, world_file')
    .eq('id', strategyId)
    .eq('user_id', auth.userId)
    .single();

  // Deduct credits
  const deduction = await deductCredits(
    auth.supabase, auth.userId, CREDIT_COST,
    'align_rewrite', 'align',
    { strategyId, issueCount: verdict.conflicts.length + verdict.gaps.length },
  );
  if (!deduction.ok) return errorResponse(deduction.error!, 402);

  // Build the rewrite prompt
  const issuesList = [
    ...verdict.conflicts.map(c => `CONFLICT — ${c.ruleLabel}: ${c.ruleDescription}\n  Found: ${c.evidence}`),
    ...verdict.gaps.map(g => `GAP — ${g.ruleLabel}: ${g.ruleDescription}\n  Issue: ${g.evidence}`),
  ].join('\n\n');

  const strategyContext = strategy
    ? `Strategy name: "${strategy.name}"\n`
    : '';

  const systemPrompt = `You are Align by Bevia — a strategy alignment rewriter. You receive a document that has alignment issues with a company's strategy, and you suggest specific edits to fix them.

${strategyContext}
ALIGNMENT ISSUES FOUND:
${issuesList}

RULES:
- Suggest MINIMAL changes. Don't rewrite the whole document.
- Each suggestion should fix ONE specific alignment issue.
- Preserve the document's voice and style.
- For CONFLICTS: suggest replacement text that removes the misalignment.
- For GAPS: suggest text to INSERT that addresses the missing topic.
- Be specific — quote exact text to replace, and provide exact replacement text.

RESPOND WITH JSON — an array of suggestions:
\`\`\`json
[
  {
    "original": "exact text from the document to replace (or empty string for inserts)",
    "suggested": "the replacement or new text",
    "reason": "why this change improves alignment",
    "ruleLabel": "which strategy rule this addresses",
    "type": "replace" | "insert" | "remove"
  }
]
\`\`\`

For "insert" type: "original" should be the text AFTER which the new text should be inserted.
For "remove" type: "suggested" should be empty string.
Keep suggestions to the most impactful changes — max 10.`;

  const aiResult = await callGemini({
    systemPrompt,
    messages: [{ role: 'user', parts: [{ text: `Suggest alignment edits for this document:\n\n${documentText}` }] }],
    model: 'gemini-2.0-flash',
    temperature: 0.4,
    maxTokens: 3072,
  });

  if (!aiResult.ok) {
    await refundCredits(auth.supabase, auth.userId, CREDIT_COST, 'align_rewrite', 'align', aiResult.error!);
    return errorResponse('Rewrite failed. You were not charged.', 500);
  }

  // Parse suggestions
  const suggestions = parseSuggestions(aiResult.text);

  // Sanitize rewrite suggestions
  for (const s of suggestions) {
    const sanitized = sanitizeOutput(s.reason, 'audit');
    s.reason = sanitized.text;
  }

  await recordUserAction(auth.supabase, { userId: auth.userId, tool: 'audit', action: 'accepted', resultId: body.strategyId || 'rewrite', metadata: { suggestionsCount: suggestions.length } });

  return jsonResponse({
    suggestions,
    issuesAddressed: verdict.conflicts.length + verdict.gaps.length,
    creditsRemaining: deduction.newBalance,
  });
});

function parseSuggestions(text: string): RewriteSuggestion[] {
  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const raw = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, 10).map(s => ({
          original: String(s.original || ''),
          suggested: String(s.suggested || ''),
          reason: String(s.reason || ''),
          ruleLabel: String(s.ruleLabel || ''),
          type: (['replace', 'insert', 'remove'].includes(s.type) ? s.type : 'replace') as 'replace' | 'insert' | 'remove',
        }));
      }
    }
  } catch { /* fall through */ }
  return [];
}
