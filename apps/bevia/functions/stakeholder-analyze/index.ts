// Bevia — Stakeholder (Deal Intelligence) Edge Function
//
// Not a new engine. Orchestrates existing engines around deal analysis:
// - Audit (company alignment checking)
// - Replay (conversation analysis with stakeholders)
// - ToneCheck (check your messages before sending)
// - Intent (what do YOU want from this deal?)
// - Simulation (project outcomes)
// - Contact profiles (stakeholder behavioral profiles)
//
// Input: deal documents + stakeholders + your position
// Output: Reality (stakeholder map, leverage, pressure, alignment gaps, deal score)
//         Action (your moves — push, reframe, walk, accept with conditions)
//
// Credits: 5 per analysis
// Campaign: abcdeals.co → "Always Be Closing — or get closed."

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, errorResponse, jsonResponse } from '../shared/auth.ts';
import { checkCredits, deductCredits, refundCredits } from '../shared/credits.ts';
import { callGemini } from '../shared/gemini.ts';
import { evaluateAction, logAudit, sanitizeOutput } from '../shared/governance.ts';
import { analyzeIntent, parseFreeTextIntent, buildIntentPromptAddition, DEFAULT_INTENTS } from '../shared/intent.ts';
import { recordUserAction } from '../shared/data-accumulation.ts';
import { buildPersonalityContext } from '../shared/personality-frameworks.ts';

const CREDIT_COST = 5;

interface StakeholderRequest {
  dealName: string;
  documents: { name: string; content: string }[];
  stakeholders: {
    name: string;
    role: string;
    notes?: string;
    personalityTags?: Record<string, string>;
  }[];
  userPosition: {
    wants: string;
    accepts: string;
    walksFrom: string;
    leverage: string;
    timeline: string;
  };
  existingDealId?: string;     // if updating an existing deal
  intent?: string;
  freeIntent?: string;
}

serve(async (req: Request) => {
  const auth = await authenticate(req);
  if (!auth.ok) return errorResponse(auth.error!, 401);

  const body: StakeholderRequest = await req.json();
  const { dealName, documents, stakeholders, userPosition } = body;

  if (!dealName?.trim()) return errorResponse('Deal name is required', 400);
  if (!documents?.length) return errorResponse('At least one document is required', 400);
  if (!userPosition?.wants?.trim()) return errorResponse('Your position (what you want) is required', 400);

  const statedIntent = body.intent || 'analyze_deal';
  const parsedFreeIntent = body.freeIntent ? parseFreeTextIntent(body.freeIntent, 'audit') : null;
  const intentAddition = buildIntentPromptAddition(
    analyzeIntent(statedIntent, userPosition.wants, 'audit'),
    null,
    parsedFreeIntent,
  );

  // ── Governance ─────────────────────────────────────────────────────────────
  const verdict = evaluateAction({
    intent: 'analyze_deal',
    tool: 'stakeholder',
    userId: auth.userId,
    creditCost: CREDIT_COST,
    metadata: { dealName, docCount: documents.length, stakeholderCount: stakeholders.length },
  });
  await logAudit(auth.supabase, { intent: 'analyze_deal', tool: 'stakeholder', userId: auth.userId, creditCost: CREDIT_COST }, verdict);
  if (verdict.status === 'BLOCK') return errorResponse(verdict.reason || 'Blocked', 403);

  // ── Credits ────────────────────────────────────────────────────────────────
  const creditCheck = await checkCredits(auth.supabase, auth.userId, CREDIT_COST);
  if (!creditCheck.ok) return errorResponse(creditCheck.error!, 402);

  const deduction = await deductCredits(
    auth.supabase, auth.userId, CREDIT_COST,
    'stakeholder_analyze', 'stakeholder',
    { dealName, stakeholderCount: stakeholders.length },
  );
  if (!deduction.ok) return errorResponse(deduction.error!, 402);

  // ── Build context ──────────────────────────────────────────────────────────

  // Combine all deal documents
  const dealText = documents
    .map(d => `--- ${d.name} ---\n${d.content}`)
    .join('\n\n');

  // Build stakeholder context
  const stakeholderContext = stakeholders.map(s => {
    let context = `- ${s.name} (${s.role})`;
    if (s.notes) context += `: ${s.notes}`;
    if (s.personalityTags) {
      const personalityCtx = buildPersonalityContext(s.personalityTags as any);
      if (personalityCtx) context += `\n  ${personalityCtx}`;
    }
    return context;
  }).join('\n');

  // Build user position context
  const positionContext = `
YOUR POSITION:
- What I want: ${userPosition.wants}
- What I'll accept: ${userPosition.accepts}
- What I'll walk from: ${userPosition.walksFrom}
- My leverage: ${userPosition.leverage}
- My timeline: ${userPosition.timeline}`;

  // Determine if sanitization should be relaxed
  const skipJudgment = parsedFreeIntent?.requiresUnsanitizedOutput
    || ['expose_risk', 'kill_proposal', 'defend_position', 'protect_myself'].includes(statedIntent);

  // ── AI Analysis ────────────────────────────────────────────────────────────

  const systemPrompt = `You are Stakeholder by Bevia — a deal intelligence engine. You analyze deals to reveal the real dynamics that most people miss.

You map POWER across people, companies, and behavior. You find what's hidden, what's pressured, what's misaligned, and what's missing.

${intentAddition}

=== REALITY LAYER (never softened — this is the truth about this deal) ===

1. STAKEHOLDER MAP
For each person involved:
- What they ACTUALLY want (not what they say)
- What pressure they're under (quota, timeline, budget, politics, career)
- Their leverage over the user
- The user's leverage over them
- Hidden dynamics (things neither party is saying out loud)

2. LEVERAGE ANALYSIS
Rate user's leverage (low/medium/high) and their leverage (low/medium/high).
Identify hidden leverage neither side is using.

3. PRESSURE TACTICS
Name every artificial urgency, anchoring, missing information, or manipulation tactic in the deal. Be direct. "The recruiter is manufacturing urgency" — not "there may be time pressure."

4. ALIGNMENT GAP (this is the signature finding)
Compare what the company/person CLAIMS (mission, values, public statements) with what the deal SHOWS (terms, structure, incentives). Surface every contradiction.
"Company claims long-term partnership focus, but deal has no severance and a 2-year non-compete."

5. WHAT'S MISSING
Everything that SHOULD be in this deal but isn't. These are the negotiation leverage points people overlook.

6. DEAL SCORE
Rate 1-10. Be honest. A 4 is a 4. Explain why in one sentence.

=== ACTION LAYER (based on user's stated goals) ===

Provide 3-4 moves covering the full spectrum:

- PUSH (firm): assertive counter, use leverage, name the dynamic
- REFRAME (strategic): reposition without aggression, reset anchors
- WALK (exit): what walking looks like, what it costs, when it's the right move
- ACCEPT WITH CONDITIONS (compromise): what to accept if you stay, what to demand in writing

For each move:
- What to DO (specific, not vague)
- Who to APPROACH (route around pressure if needed — go to the VP, not the recruiter)
- TRADEOFF (what you gain, what it costs)
- PROJECTED RESPONSE (how stakeholders will likely react, based on their incentives)

RESPOND WITH JSON:
\`\`\`json
{
  "reality": {
    "stakeholderMap": [
      {
        "name": "string",
        "role": "string",
        "actuallyWants": "string",
        "pressureUnder": "string",
        "theirLeverage": "string",
        "yourLeverage": "string",
        "hiddenDynamic": "string or null"
      }
    ],
    "leverageAnalysis": {
      "yours": "low|medium|high",
      "theirs": "low|medium|high",
      "hidden": "string — the leverage nobody is talking about"
    },
    "pressureTactics": [
      { "tactic": "string", "evidence": "string", "severity": "low|medium|high" }
    ],
    "alignmentGap": {
      "theyClaim": "string",
      "dealShows": "string",
      "gap": "string — the contradiction"
    },
    "whatssMissing": ["string — each missing item"],
    "dealScore": {
      "score": 1-10,
      "summary": "one sentence why"
    }
  },
  "action": {
    "givenYourGoal": "restate what the user wants",
    "moves": [
      {
        "type": "push|reframe|walk|accept_with_conditions",
        "label": "short label",
        "whatToDo": "specific action",
        "whoToApproach": "route around pressure",
        "tradeoff": "what you gain vs what it costs",
        "projectedResponse": "how they'll likely react"
      }
    ]
  }
}
\`\`\`

RULES:
- Reality is NEVER softened. If the deal is bad, say "this deal is bad for you" and explain why.
- Name pressure tactics directly. "Anchoring" not "they started with a number."
- Alignment gaps are the most powerful finding. Companies hate being caught in contradictions.
- Always include WALK as a move. Sometimes the best deal is no deal.
- Never script exact words. Show the approach and let the user decide how to say it.
- Deal score must be honest. Most deals people ask about score 3-6. A 9 is rare. Don't inflate.
- If user's intent is aggressive, lead with PUSH. If protective, lead with what's missing and WALK.`;

  const userMessage = `DEAL: ${dealName}

DOCUMENTS:
${dealText.slice(0, 15000)}

STAKEHOLDERS:
${stakeholderContext}

${positionContext}`;

  const aiResult = await callGemini({
    systemPrompt,
    messages: [{ role: 'user', parts: [{ text: userMessage }] }],
    model: 'gemini-2.0-flash',
    temperature: 0.4,
    maxTokens: 4096,
  });

  if (!aiResult.ok) {
    await refundCredits(auth.supabase, auth.userId, CREDIT_COST, 'stakeholder_analyze', 'stakeholder', aiResult.error!);
    return errorResponse('Deal analysis failed. You were not charged.', 500);
  }

  // ── Parse AI response ──────────────────────────────────────────────────────
  let analysis: Record<string, unknown>;
  try {
    const jsonMatch = aiResult.text.match(/```json\s*([\s\S]*?)```/) || aiResult.text.match(/\{[\s\S]*"reality"[\s\S]*\}/);
    if (jsonMatch) {
      analysis = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    } else {
      analysis = { raw: aiResult.text };
    }
  } catch {
    analysis = { raw: aiResult.text };
  }

  // ── Sanitize (conditional on intent) ───────────────────────────────────────
  if (analysis.reality) {
    const reality = analysis.reality as Record<string, unknown>;
    if (reality.alignmentGap && typeof (reality.alignmentGap as any).gap === 'string') {
      const sanitized = sanitizeOutput((reality.alignmentGap as any).gap, 'stakeholder', { skipJudgmentSanitization: skipJudgment });
      (reality.alignmentGap as any).gap = sanitized.text;
    }
    if (reality.dealScore && typeof (reality.dealScore as any).summary === 'string') {
      const sanitized = sanitizeOutput((reality.dealScore as any).summary, 'stakeholder', { skipJudgmentSanitization: skipJudgment });
      (reality.dealScore as any).summary = sanitized.text;
    }
  }

  // ── Store deal ─────────────────────────────────────────────────────────────
  const dealData = {
    user_id: auth.userId,
    deal_name: dealName,
    status: 'analyzing',
    stakeholders: stakeholders.map(s => s.name),
    user_position: userPosition,
    deal_score: (analysis.reality as any)?.dealScore?.score || null,
    leverage_analysis: (analysis.reality as any)?.leverageAnalysis || null,
    pressure_tactics: (analysis.reality as any)?.pressureTactics || [],
    alignment_gaps: (analysis.reality as any)?.alignmentGap ? [(analysis.reality as any).alignmentGap] : [],
    missing_items: (analysis.reality as any)?.whatssMissing || [],
    moves: (analysis.action as any)?.moves || [],
  };

  let dealId = body.existingDealId;
  if (dealId) {
    await auth.supabase
      .from('bevia_deals')
      .update({ ...dealData, updated_at: new Date().toISOString() })
      .eq('id', dealId)
      .eq('user_id', auth.userId);
  } else {
    const { data: newDeal } = await auth.supabase
      .from('bevia_deals')
      .insert(dealData)
      .select('id')
      .single();
    dealId = newDeal?.id;
  }

  // ── Create stakeholder contacts in Replay ──────────────────────────────────
  for (const s of stakeholders) {
    const { data: existing } = await auth.supabase
      .from('reflect_contacts')
      .select('id')
      .eq('user_id', auth.userId)
      .eq('name', s.name)
      .single();

    if (!existing) {
      await auth.supabase.from('reflect_contacts').insert({
        user_id: auth.userId,
        name: s.name,
        relationship: s.role,
        personality_tags: s.personalityTags || {},
        notes: s.notes || '',
      });
    }
  }

  await recordUserAction(auth.supabase, {
    userId: auth.userId,
    tool: 'stakeholder',
    action: 'accepted',
    resultId: dealId || 'deal-' + Date.now(),
    metadata: {
      dealName,
      stakeholderCount: stakeholders.length,
      dealScore: (analysis.reality as any)?.dealScore?.score,
    },
  });

  return jsonResponse({
    analysis,
    dealId,
    stakeholderCount: stakeholders.length,
    intent: {
      stated: statedIntent,
      freeIntent: parsedFreeIntent,
    },
    creditsRemaining: deduction.newBalance,
  });
});
