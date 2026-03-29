// Bevia — Replay (Conversation Analysis) Engine
//
// Takes a conversation transcript or description + contact info + intent
// Returns: Reality layer (event timeline, ego states, Gottman detection,
//          behavioral deltas) + Action layer (options based on intent)
//
// Uses Mirror engines: event-detector, shadow-engine, reputation-engine
// Hybrid: deterministic signal detection + AI conceptual analysis
// Governed: evaluateAction + logAudit + sanitizeOutput
// Intent-aware: full spectrum including protective/evidentiary intents

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, errorResponse, jsonResponse } from '../shared/auth.ts';
import { checkCredits, deductCredits, refundCredits } from '../shared/credits.ts';
import { callGemini } from '../shared/gemini.ts';
import { evaluateAction, logAudit, sanitizeOutput } from '../shared/governance.ts';
import { analyzeIntent, getPatternIntent, buildIntentPromptAddition, parseFreeTextIntent, DEFAULT_INTENTS } from '../shared/intent.ts';
import { recordUserAction } from '../shared/data-accumulation.ts';

const CREDIT_COST = 3;

interface ReplayRequest {
  inputText: string;          // conversation transcript OR description
  inputType: 'transcript' | 'description';
  contactName?: string;
  contactRelationship?: string;
  contactId?: string;         // existing contact ID (if returning user)
  intent?: string;            // predefined intent ID
  freeIntent?: string;        // free-text intent
}

serve(async (req: Request) => {
  const auth = await authenticate(req);
  if (!auth.ok) return errorResponse(auth.error!, 401);

  const body: ReplayRequest = await req.json();
  const { inputText, inputType, contactName, contactRelationship, contactId, freeIntent } = body;
  const statedIntent = body.intent || DEFAULT_INTENTS.replay;

  if (!inputText?.trim()) return errorResponse('Conversation text is required', 400);

  // ── Intent analysis ────────────────────────────────────────────────────────
  const intentAnalysis = analyzeIntent(statedIntent, inputText, 'replay');
  const parsedFreeIntent = freeIntent ? parseFreeTextIntent(freeIntent, 'replay') : null;
  const patternIntent = await getPatternIntent(auth.supabase, auth.userId, 'replay');

  // ── Governance ─────────────────────────────────────────────────────────────
  const verdict = evaluateAction({
    intent: 'analyze_conversation',
    tool: 'replay',
    userId: auth.userId,
    creditCost: CREDIT_COST,
    metadata: { inputType, contactName, intent: statedIntent },
  });
  await logAudit(auth.supabase, { intent: 'analyze_conversation', tool: 'replay', userId: auth.userId, creditCost: CREDIT_COST }, verdict);
  if (verdict.status === 'BLOCK') return errorResponse(verdict.reason || 'Blocked by governance', 403);

  // ── Credits ────────────────────────────────────────────────────────────────
  const creditCheck = await checkCredits(auth.supabase, auth.userId, CREDIT_COST);
  if (!creditCheck.ok) return errorResponse(creditCheck.error!, 402);

  const deduction = await deductCredits(
    auth.supabase, auth.userId, CREDIT_COST,
    'replay_analyze', 'replay',
    { inputType, contactName },
  );
  if (!deduction.ok) return errorResponse(deduction.error!, 402);

  // ── Load existing contact profile (if returning user) ──────────────────────
  let contactProfile = null;
  if (contactId) {
    const { data: contact } = await auth.supabase
      .from('reflect_contacts')
      .select('*')
      .eq('id', contactId)
      .eq('user_id', auth.userId)
      .single();
    if (contact) contactProfile = contact;
  }

  // ── Build intent context for AI prompt ─────────────────────────────────────
  const intentAddition = buildIntentPromptAddition(intentAnalysis, patternIntent.pattern, parsedFreeIntent);

  // Determine if sanitization should be relaxed for this intent
  const skipJudgmentSanitization = parsedFreeIntent?.requiresUnsanitizedOutput
    || ['confirm_this_is_toxic', 'build_evidence', 'detect_manipulation'].includes(statedIntent);

  // ── AI Analysis (governed, intent-aware) ───────────────────────────────────
  const contactContext = contactProfile
    ? `\nEXISTING CONTACT PROFILE (from ${contactProfile.conversations_analyzed} prior conversations):\n` +
      `Trust: ${contactProfile.profile.trust}/100 | Composure: ${contactProfile.profile.composure}/100\n` +
      `What has worked: ${JSON.stringify(contactProfile.what_works)}\n` +
      `What hasn't worked: ${JSON.stringify(contactProfile.what_doesnt_work)}\n` +
      `Gottman history: ${JSON.stringify(contactProfile.gottman_history)}\n`
    : '';

  const systemPrompt = `You are Replay by Bevia — a conversation analysis engine. You analyze conversations to reveal what actually happened.

You operate on TWO LAYERS:

=== REALITY LAYER (never softened, evidence-backed) ===
Show what ACTUALLY happened. Name dynamics truthfully. If someone was hostile, say "hostile." If someone was gaslighting, say "gaslighting" — IF the evidence supports it. Don't soften reality to protect anyone's reputation. The user needs accuracy, not comfort.

=== ACTION LAYER (intent-dependent, full spectrum) ===
Based on the user's goal, present OPTIONS covering the full behavioral spectrum. Always include:
- At least one assertive/confrontational option
- At least one diplomatic option
- At least one boundary/exit/disengage option
Each with honest tradeoffs and likely consequences.

${contactContext}
${intentAddition}

RESPOND WITH JSON:
\`\`\`json
{
  "reality": {
    "summary": "1-2 sentence honest summary of what happened",
    "timeline": [
      {
        "speaker": "user" or "other",
        "moment": "what they said/did",
        "eventType": "disagreement|agreement|escalation|de_escalation|defensiveness|stonewalling|vulnerability|redirect|decision|concession|criticism|contempt|question|silence",
        "egoState": "parent|adult|child|unknown",
        "intensity": 0.0-1.0,
        "significance": "why this moment matters"
      }
    ],
    "gottmanDetections": [
      { "horseman": "criticism|contempt|defensiveness|stonewalling", "speaker": "user|other", "evidence": "specific quote or behavior", "impact": "what this does to the relationship" }
    ],
    "egoStateDynamics": "description of who was in what ego state and how it shifted",
    "trajectory": "where this conversation was heading — honest assessment",
    "energy": "energizing|neutral|draining"
  },
  "action": {
    "givenYourGoal": "restate user's intent and frame options relative to it",
    "options": [
      { "approach": "description", "tradeoff": "what you gain vs what it costs", "intensity": "gentle|firm|aggressive|exit" }
    ]
  },
  "behavioralDeltas": {
    "trust": -10 to 10,
    "composure": -10 to 10,
    "conflictRisk": -10 to 10,
    "empathy": -10 to 10
  },
  "patternNote": "if you see a recurring pattern (user always does X), note it here — or null"
}
\`\`\`

RULES:
- Reality is NEVER softened. If behavior is toxic, say toxic. If it's manipulative, say manipulative. Back it with evidence.
- Action options cover the FULL spectrum. Not just prosocial options.
- Always include an exit/disengage option. Sometimes the right move is to walk away.
- If user intent is protective (build evidence, detect manipulation), prioritize accuracy over diplomacy.
- Timeline should have 3-8 key moments, not every sentence.
- Ego states: Parent = controlling/lecturing, Adult = rational/factual, Child = reactive/emotional.
- Gottman horsemen: criticism, contempt, defensiveness, stonewalling — only flag when clearly present.`;

  const userMessage = inputType === 'transcript'
    ? `Analyze this conversation transcript:\n\n${inputText}`
    : `Analyze this conversation based on my description:\n\n${inputText}`;

  const aiResult = await callGemini({
    systemPrompt,
    messages: [{ role: 'user', parts: [{ text: userMessage }] }],
    model: 'gemini-2.0-flash',
    temperature: 0.4,
    maxTokens: 3072,
  });

  if (!aiResult.ok) {
    await refundCredits(auth.supabase, auth.userId, CREDIT_COST, 'replay_analyze', 'replay', aiResult.error!);
    return errorResponse('Analysis failed. You were not charged.', 500);
  }

  // ── Parse AI response (JSON-first, AI-governed) ────────────────────────────
  let analysis: Record<string, unknown>;
  try {
    const jsonMatch = aiResult.text.match(/```json\s*([\s\S]*?)```/) || aiResult.text.match(/\{[\s\S]*"reality"[\s\S]*\}/);
    if (jsonMatch) {
      analysis = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    } else {
      // Fallback: return raw text (TODO: AI-governed parsing call)
      analysis = { raw: aiResult.text };
    }
  } catch {
    analysis = { raw: aiResult.text };
  }

  // ── Governance: sanitize output (conditional based on intent) ──────────────
  if (analysis.reality && typeof (analysis.reality as any).summary === 'string') {
    const sanitized = sanitizeOutput(
      (analysis.reality as any).summary,
      'replay',
      { skipJudgmentSanitization },
    );
    (analysis.reality as any).summary = sanitized.text;
  }

  // ── Save contact (create or update) ────────────────────────────────────────
  let savedContactId = contactId;
  if (!contactId && contactName) {
    const { data: newContact } = await auth.supabase
      .from('reflect_contacts')
      .insert({
        user_id: auth.userId,
        name: contactName,
        relationship: contactRelationship || '',
        conversations_analyzed: 1,
      })
      .select('id')
      .single();
    savedContactId = newContact?.id;
  } else if (contactId) {
    await auth.supabase
      .from('reflect_contacts')
      .update({ conversations_analyzed: (contactProfile?.conversations_analyzed || 0) + 1, last_interaction: new Date().toISOString() })
      .eq('id', contactId);
  }

  // ── Save conversation ──────────────────────────────────────────────────────
  const { data: savedConv } = await auth.supabase
    .from('reflect_conversations')
    .insert({
      user_id: auth.userId,
      contact_id: savedContactId,
      input_type: inputType,
      input_text: inputText,
      events: (analysis.reality as any)?.timeline || [],
      shadow_result: analysis,
      behavioral_deltas: analysis.behavioralDeltas || {},
      energy: (analysis.reality as any)?.energy === 'energizing' ? 1 : (analysis.reality as any)?.energy === 'draining' ? -1 : 0,
    })
    .select('id')
    .single();

  // ── Track intent for pattern accumulation ──────────────────────────────────
  await recordUserAction(auth.supabase, {
    userId: auth.userId,
    tool: 'replay',
    action: 'accepted',
    resultId: savedConv?.id || 'unknown',
    metadata: {
      statedIntent: intentAnalysis.statedIntent,
      behavioralIntent: intentAnalysis.behavioralIntent,
      intentGap: intentAnalysis.gap ? true : false,
      freeIntent: parsedFreeIntent?.rawText,
    },
  });

  return jsonResponse({
    analysis,
    intent: {
      stated: intentAnalysis.statedIntent,
      behavioral: intentAnalysis.behavioralIntent,
      gap: intentAnalysis.gap,
      pattern: patternIntent.pattern,
      freeIntent: parsedFreeIntent,
    },
    contactId: savedContactId,
    conversationId: savedConv?.id,
    creditsRemaining: deduction.newBalance,
  });
});
