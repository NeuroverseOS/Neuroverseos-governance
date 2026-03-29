// Bevia — Report Generation Engine
// Generates monthly/quarterly/on-demand reports from accumulated user data.
// 2 credits (monthly), 5 credits (quarterly), 2 credits (on-demand).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, errorResponse, jsonResponse } from '../shared/auth.ts';
import { checkCredits, deductCredits, refundCredits } from '../shared/credits.ts';
import { callGemini } from '../shared/gemini.ts';
import { evaluateAction, logAudit, sanitizeOutput } from '../shared/governance.ts';
import { analyzeIntent, DEFAULT_INTENTS } from '../shared/intent.ts';
import { computePatterns, buildReportPrompt, recordUserAction } from '../shared/data-accumulation.ts';

const COSTS: Record<string, number> = {
  monthly: 2,
  quarterly: 5,
  on_demand: 2,
};

interface ReportRequest {
  period: 'monthly' | 'quarterly' | 'on_demand';
  question?: string; // for on-demand reports
}

serve(async (req: Request) => {
  const auth = await authenticate(req);
  if (!auth.ok) return errorResponse(auth.error!, 401);

  const body: ReportRequest = await req.json();
  const { period, question } = body;

  if (!COSTS[period]) return errorResponse('Invalid period. Use: monthly, quarterly, on_demand', 400);
  if (period === 'on_demand' && !question?.trim()) return errorResponse('Question required for on-demand report', 400);

  const cost = COSTS[period];

  // ── Governance ─────────────────────────────────────────────────────────────
  const verdict = evaluateAction({
    intent: 'generate_report',
    tool: 'platform',
    userId: auth.userId,
    creditCost: cost,
    metadata: { period, question },
  });
  await logAudit(auth.supabase, { intent: 'generate_report', tool: 'platform', userId: auth.userId, creditCost: cost }, verdict);
  if (verdict.status === 'BLOCK') return errorResponse(verdict.reason || 'Blocked', 403);

  // ── Credits ────────────────────────────────────────────────────────────────
  const creditCheck = await checkCredits(auth.supabase, auth.userId, cost);
  if (!creditCheck.ok) return errorResponse(creditCheck.error!, 402);

  const deduction = await deductCredits(auth.supabase, auth.userId, cost, 'generate_report', 'platform', { period });
  if (!deduction.ok) return errorResponse(deduction.error!, 402);

  // ── Compute patterns from accumulated data ─────────────────────────────────
  const patterns = await computePatterns(auth.supabase, auth.userId);

  // Check if there's enough data for a meaningful report
  const totalActivity = patterns.alignChecksTotal + patterns.reflectConversationsTotal
    + patterns.unsaidTranslationsTotal + patterns.arenaTotal;

  if (totalActivity < 5) {
    await refundCredits(auth.supabase, auth.userId, cost, 'generate_report', 'platform', 'Not enough data for report');
    return errorResponse('Not enough data yet. Use Bevia tools more and come back — you need at least 5 actions across any tools. You were not charged.', 400);
  }

  // ── Build prompt and generate report ───────────────────────────────────────
  const reportPrompt = buildReportPrompt({
    period,
    patterns,
    question,
  });

  const aiResult = await callGemini({
    systemPrompt: `You are Bevia's report generator. You create concise, data-grounded reports from user activity patterns.

ETHICAL RULES (enforced by governance):
- Frame everything as patterns, not predictions. "This tends to..." not "This will..."
- Present recommendations as options with tradeoffs, not single "best" actions.
- Never frame insights as manipulation tactics.
- Cite specific numbers from the data provided.
- If you notice cross-tool patterns (e.g., Align drift correlates with Reflect defensiveness), surface them.`,
    messages: [{ role: 'user', parts: [{ text: reportPrompt }] }],
    model: 'gemini-2.0-flash',
    temperature: 0.5,
    maxTokens: 2048,
  });

  if (!aiResult.ok) {
    await refundCredits(auth.supabase, auth.userId, cost, 'generate_report', 'platform', aiResult.error!);
    return errorResponse('Report generation failed. You were not charged.', 500);
  }

  // ── Governance: sanitize output ────────────────────────────────────────────
  const sanitized = sanitizeOutput(aiResult.text, 'platform');

  await recordUserAction(auth.supabase, { userId: auth.userId, tool: 'platform', action: 'accepted', resultId: 'report-' + Date.now(), metadata: { period, question } });

  return jsonResponse({
    report: sanitized.text,
    period,
    patterns,
    governanceModifications: sanitized.modifications,
    creditsRemaining: deduction.newBalance,
  });
});
