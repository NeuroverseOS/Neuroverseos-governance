// Bevia — Consensus (Group Decision) Engine
//
// Takes a group proposal + member preferences + intent
// Returns: Reality layer (who wants what, where conflicts exist)
//          + Action layer (compromise options with tradeoffs)
//
// Uses governance engine for rule conflict resolution
// Governed: evaluateAction + logAudit + sanitizeOutput
// Intent-aware: includes "protect my team" and "block this"

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, errorResponse, jsonResponse } from '../shared/auth.ts';
import { checkCredits, deductCredits, refundCredits } from '../shared/credits.ts';
import { callGemini } from '../shared/gemini.ts';
import { evaluateAction, logAudit, sanitizeOutput } from '../shared/governance.ts';
import { analyzeIntent, buildIntentPromptAddition, parseFreeTextIntent, DEFAULT_INTENTS } from '../shared/intent.ts';
import { recordUserAction } from '../shared/data-accumulation.ts';

const CREDIT_COST = 1;

interface ConsensusRequest {
  proposal: string;                    // what's being decided
  members: { name: string; preferences: string }[]; // who's involved + their constraints
  intent?: string;
  freeIntent?: string;
}

serve(async (req: Request) => {
  const auth = await authenticate(req);
  if (!auth.ok) return errorResponse(auth.error!, 401);

  const body: ConsensusRequest = await req.json();
  const { proposal, members } = body;
  const statedIntent = body.intent || DEFAULT_INTENTS.consensus;

  if (!proposal?.trim()) return errorResponse('Proposal is required', 400);
  if (!members?.length) return errorResponse('At least one group member required', 400);

  // ── Intent ─────────────────────────────────────────────────────────────────
  const intentAnalysis = analyzeIntent(statedIntent, proposal, 'consensus');
  const parsedFreeIntent = body.freeIntent ? parseFreeTextIntent(body.freeIntent, 'consensus') : null;
  const intentAddition = buildIntentPromptAddition(intentAnalysis, null, parsedFreeIntent);
  const skipJudgmentSanitization = parsedFreeIntent?.requiresUnsanitizedOutput
    || ['protect_my_team', 'block_bad_idea'].includes(statedIntent);

  // ── Governance ─────────────────────────────────────────────────────────────
  const verdict = evaluateAction({
    intent: 'find_consensus',
    tool: 'consensus',
    userId: auth.userId,
    creditCost: CREDIT_COST,
    metadata: { memberCount: members.length },
  });
  await logAudit(auth.supabase, { intent: 'find_consensus', tool: 'consensus', userId: auth.userId, creditCost: CREDIT_COST }, verdict);
  if (verdict.status === 'BLOCK') return errorResponse(verdict.reason || 'Blocked by governance', 403);

  // ── Credits ────────────────────────────────────────────────────────────────
  const creditCheck = await checkCredits(auth.supabase, auth.userId, CREDIT_COST);
  if (!creditCheck.ok) return errorResponse(creditCheck.error!, 402);

  const deduction = await deductCredits(auth.supabase, auth.userId, CREDIT_COST, 'consensus_find', 'consensus', { proposal: proposal.slice(0, 100) });
  if (!deduction.ok) return errorResponse(deduction.error!, 402);

  // ── Build member context ───────────────────────────────────────────────────
  const memberContext = members.map(m => `- ${m.name}: ${m.preferences}`).join('\n');

  const systemPrompt = `You are Consensus by Bevia — a group decision engine. You analyze group dynamics to find workable outcomes.

TWO LAYERS:

=== REALITY (never softened) ===
Show the actual group dynamics. Who wants what. Where the real conflicts are. Who has power. Who's being steamrolled. Name it honestly.

=== ACTION (intent-dependent, full spectrum) ===
Based on the user's goal, present options. If they want fairness, show fair options. If they want to protect their team, show how. If they want to block something, show where the leverage is.

${intentAddition}

GROUP MEMBERS:
${memberContext}

RESPOND WITH JSON:
\`\`\`json
{
  "reality": {
    "summary": "What's actually happening in this group decision",
    "conflicts": [{ "between": ["name", "name"], "issue": "what they disagree on", "powerDynamic": "who has leverage and why" }],
    "alignments": [{ "members": ["name", "name"], "on": "what they agree on" }],
    "whoIsBeingSilenced": "name or null — who isn't being heard"
  },
  "action": {
    "givenYourGoal": "restate user's intent",
    "options": [
      { "proposal": "the compromise or strategy", "whoWins": "who benefits most", "whoLoses": "who compromises most", "intensity": "diplomatic|firm|aggressive" }
    ]
  }
}
\`\`\`

RULES:
- Reality names power dynamics. Not everyone is equal in a group.
- Options include non-compromise paths (block, override, exit).
- If someone is being steamrolled, say so — even if the user is the one doing it.
- Always show who wins and who loses in each option. No fake win-wins.`;

  const aiResult = await callGemini({
    systemPrompt,
    messages: [{ role: 'user', parts: [{ text: `Group decision:\n\n"${proposal}"\n\nMembers:\n${memberContext}` }] }],
    model: 'gemini-2.0-flash',
    temperature: 0.5,
    maxTokens: 2048,
  });

  if (!aiResult.ok) {
    await refundCredits(auth.supabase, auth.userId, CREDIT_COST, 'consensus_find', 'consensus', aiResult.error!);
    return errorResponse('Consensus analysis failed. You were not charged.', 500);
  }

  // Parse JSON response
  let result: Record<string, unknown>;
  try {
    const jsonMatch = aiResult.text.match(/```json\s*([\s\S]*?)```/) || aiResult.text.match(/\{[\s\S]*"reality"[\s\S]*\}/);
    result = jsonMatch ? JSON.parse(jsonMatch[1] || jsonMatch[0]) : { raw: aiResult.text };
  } catch {
    result = { raw: aiResult.text };
  }

  // Sanitize (conditional)
  if (result.reality && typeof (result.reality as any).summary === 'string') {
    const sanitized = sanitizeOutput((result.reality as any).summary, 'consensus', { skipJudgmentSanitization });
    (result.reality as any).summary = sanitized.text;
  }

  await recordUserAction(auth.supabase, { userId: auth.userId, tool: 'consensus', action: 'accepted', resultId: 'consensus-' + Date.now(), metadata: { statedIntent, memberCount: members.length } });

  return jsonResponse({ result, intent: { stated: statedIntent, gap: intentAnalysis.gap }, creditsRemaining: deduction.newBalance });
});
