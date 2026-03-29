// Bevia — Signal (People Matching) Engine
//
// Takes user profile/interests + intent
// Returns: matched people based on behavioral dimensions + connection paths
//
// Governed: evaluateAction + logAudit + sanitizeOutput
// Intent-aware: find collaborators, mentors, or community

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, errorResponse, jsonResponse } from '../shared/auth.ts';
import { checkCredits, deductCredits, refundCredits } from '../shared/credits.ts';
import { callGemini } from '../shared/gemini.ts';
import { evaluateAction, logAudit, sanitizeOutput } from '../shared/governance.ts';
import { analyzeIntent, buildIntentPromptAddition, parseFreeTextIntent, DEFAULT_INTENTS } from '../shared/intent.ts';
import { recordUserAction } from '../shared/data-accumulation.ts';

const CREDIT_COST = 5;

interface SignalRequest {
  profile: string;              // user describes themselves, their work, their values
  lookingFor?: string;          // what kind of people they want to find
  intent?: string;
  freeIntent?: string;
}

serve(async (req: Request) => {
  const auth = await authenticate(req);
  if (!auth.ok) return errorResponse(auth.error!, 401);

  const body: SignalRequest = await req.json();
  const { profile, lookingFor } = body;
  const statedIntent = body.intent || DEFAULT_INTENTS.signal;

  if (!profile?.trim()) return errorResponse('Profile description is required', 400);

  // ── Intent ─────────────────────────────────────────────────────────────────
  const intentAnalysis = analyzeIntent(statedIntent, profile, 'signal');
  const parsedFreeIntent = body.freeIntent ? parseFreeTextIntent(body.freeIntent, 'signal') : null;
  const intentAddition = buildIntentPromptAddition(intentAnalysis, null, parsedFreeIntent);

  // ── Governance ─────────────────────────────────────────────────────────────
  const verdict = evaluateAction({
    intent: 'find_matches',
    tool: 'signal',
    userId: auth.userId,
    creditCost: CREDIT_COST,
    metadata: { profileLength: profile.length },
  });
  await logAudit(auth.supabase, { intent: 'find_matches', tool: 'signal', userId: auth.userId, creditCost: CREDIT_COST }, verdict);
  if (verdict.status === 'BLOCK') return errorResponse(verdict.reason || 'Blocked by governance', 403);

  // ── Credits ────────────────────────────────────────────────────────────────
  const creditCheck = await checkCredits(auth.supabase, auth.userId, CREDIT_COST);
  if (!creditCheck.ok) return errorResponse(creditCheck.error!, 402);

  const deduction = await deductCredits(auth.supabase, auth.userId, CREDIT_COST, 'signal_match', 'signal', { intent: statedIntent });
  if (!deduction.ok) return errorResponse(deduction.error!, 402);

  // ── AI Matching ────────────────────────────────────────────────────────────
  const systemPrompt = `You are Signal by Bevia — a people matching engine. You analyze a user's behavioral profile and values to identify what kinds of people would be meaningful connections.

${intentAddition}

RESPOND WITH JSON:
\`\`\`json
{
  "valueVector": {
    "riskTolerance": 0.0-1.0,
    "craftVsEntrepreneur": 0.0-1.0,
    "structureVsAmbiguity": 0.0-1.0,
    "intrinsicVsExtrinsic": 0.0-1.0,
    "depthVsBreadth": 0.0-1.0,
    "lifePhase": "building|rebuilding|maintaining|exploring"
  },
  "matchCriteria": {
    "lookingFor": "summary of who this person should connect with",
    "complementaryTraits": ["traits that would complement their style"],
    "sharedValues": ["values a match should share"],
    "avoidPatterns": ["what would NOT work — be honest about incompatibilities"]
  },
  "archetypeProfiles": [
    {
      "archetype": "a vivid description of the ideal match type",
      "whyTheyMatch": "behavioral reasoning",
      "whereToFind": "communities, platforms, contexts where this person exists",
      "approachStyle": "how to reach out in a way that resonates"
    }
  ]
}
\`\`\`

RULES:
- Be specific. "A senior engineer who got bored of FAANG" is better than "a technical person."
- Name incompatibilities honestly. Not everyone should connect.
- Include avoidPatterns — who would NOT work and why. This is as valuable as matches.
- Where to find: be concrete. Name platforms, communities, events, not generic "networking."`;

  const userMessage = `My profile:\n${profile}${lookingFor ? `\n\nI'm looking for: ${lookingFor}` : ''}`;

  const aiResult = await callGemini({
    systemPrompt,
    messages: [{ role: 'user', parts: [{ text: userMessage }] }],
    model: 'gemini-2.0-flash',
    temperature: 0.6,
    maxTokens: 2048,
  });

  if (!aiResult.ok) {
    await refundCredits(auth.supabase, auth.userId, CREDIT_COST, 'signal_match', 'signal', aiResult.error!);
    return errorResponse('Matching failed. You were not charged.', 500);
  }

  let result: Record<string, unknown>;
  try {
    const jsonMatch = aiResult.text.match(/```json\s*([\s\S]*?)```/) || aiResult.text.match(/\{[\s\S]*"valueVector"[\s\S]*\}/);
    result = jsonMatch ? JSON.parse(jsonMatch[1] || jsonMatch[0]) : { raw: aiResult.text };
  } catch {
    result = { raw: aiResult.text };
  }

  await recordUserAction(auth.supabase, { userId: auth.userId, tool: 'signal', action: 'accepted', resultId: 'signal-' + Date.now(), metadata: { statedIntent } });

  return jsonResponse({ result, intent: { stated: statedIntent, gap: intentAnalysis.gap }, creditsRemaining: deduction.newBalance });
});
