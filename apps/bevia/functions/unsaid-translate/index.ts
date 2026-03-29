// Bevia — Unsaid Translation Engine (Hybrid)
//
// TWO-PASS ARCHITECTURE:
// Pass 1: Behavioral signal detection (deterministic) — scans message for
//         punctuation patterns, tone markers, formatting cues, response timing
//         signals that carry different meaning across archetypes
// Pass 2: AI contextual translation (Gemini Flash) — interprets the behavioral
//         signals + message content through sender/receiver lenses
//
// Why hybrid?
// - "ok." vs "ok!" vs "Ok" carry VERY different weight depending on who's reading
// - ALL CAPS means emphasis to a Boomer, yelling to Gen Z — that's a signal, not a keyword
// - Ellipsis "..." means thinking to Gen X, passive aggression to Millennials
// - AI alone misses these micro-patterns. Deterministic detection feeds them to AI.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, errorResponse, jsonResponse } from '../shared/auth.ts';
import { checkCredits, deductCredits, refundCredits } from '../shared/credits.ts';
import { callGemini } from '../shared/gemini.ts';
import { evaluateAction, logAudit, governedAction, sanitizeOutput } from '../shared/governance.ts';
import { buildTranslationPrompt, ARCHETYPES } from './prompts.ts';

const CREDIT_COST = 1;

interface TranslateRequest {
  message: string;
  senderArchetype: string;
  receiverArchetype: string;
}

serve(async (req: Request) => {
  const auth = await authenticate(req);
  if (!auth.ok) return errorResponse(auth.error!, 401);

  const body: TranslateRequest = await req.json();
  const { message, senderArchetype, receiverArchetype } = body;

  if (!message?.trim()) return errorResponse('Message is required', 400);
  if (!ARCHETYPES[senderArchetype]) return errorResponse(`Unknown sender archetype: ${senderArchetype}`, 400);
  if (!ARCHETYPES[receiverArchetype]) return errorResponse(`Unknown receiver archetype: ${receiverArchetype}`, 400);

  // ── Governance: evaluate the action ────────────────────────────────────────
  const verdict = evaluateAction({
    intent: 'translate_message',
    tool: 'unsaid',
    userId: auth.userId,
    creditCost: CREDIT_COST,
    metadata: { senderArchetype, receiverArchetype },
  });
  await logAudit(auth.supabase, { intent: 'translate_message', tool: 'unsaid', userId: auth.userId, creditCost: CREDIT_COST }, verdict);
  if (verdict.status === 'BLOCK') return errorResponse(verdict.reason || 'Blocked by governance', 403);

  // ── Credits ────────────────────────────────────────────────────────────────
  const creditCheck = await checkCredits(auth.supabase, auth.userId, CREDIT_COST);
  if (!creditCheck.ok) return errorResponse(creditCheck.error!, 402);

  const deduction = await deductCredits(
    auth.supabase, auth.userId, CREDIT_COST,
    'unsaid_translate', 'unsaid',
    { senderArchetype, receiverArchetype, messageLength: message.length },
  );
  if (!deduction.ok) return errorResponse(deduction.error!, 402);

  // ═══════════════════════════════════════════════════════════════
  // PASS 1: Behavioral signal detection (deterministic, instant)
  // Scans for communication micro-patterns that carry different
  // meaning across archetypes. These signals feed into the AI pass.
  // ═══════════════════════════════════════════════════════════════
  const signals = detectBehavioralSignals(message);

  // ═══════════════════════════════════════════════════════════════
  // PASS 2: AI contextual translation (Gemini Flash)
  // Takes the message + detected signals + archetype profiles
  // and produces the 4-layer translation
  // ═══════════════════════════════════════════════════════════════
  const prompt = buildTranslationPrompt(message, senderArchetype, receiverArchetype, signals);

  const aiResult = await callGemini({
    systemPrompt: prompt.system,
    messages: [{ role: 'user', parts: [{ text: prompt.user }] }],
    model: 'gemini-2.0-flash',
    temperature: 0.7,
    maxTokens: 1024,
  });

  if (!aiResult.ok) {
    await refundCredits(auth.supabase, auth.userId, CREDIT_COST, 'unsaid_translate', 'unsaid', aiResult.error!);
    return errorResponse('Translation failed. You were not charged.', 500);
  }

  // Parse structured response
  const translation = parseTranslationResponse(aiResult.text);

  // Attach detected signals to output (UI can show these as "behavioral cues detected")
  translation.signals = signals;

  // Save for share links
  const shareSlug = crypto.randomUUID().slice(0, 8);
  await auth.supabase.from('unsaid_translations').insert({
    user_id: auth.userId,
    sender_lens: senderArchetype,
    receiver_lens: receiverArchetype,
    original_message: message,
    translation,
    share_slug: shareSlug,
  });

  return jsonResponse({
    translation,
    shareSlug,
    creditsRemaining: deduction.newBalance,
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// PASS 1: BEHAVIORAL SIGNAL DETECTION
// These are the micro-patterns in text that carry different emotional weight
// depending on who's sending and who's reading.
// ═══════════════════════════════════════════════════════════════════════════════

export interface BehavioralSignals {
  cues: BehavioralCue[];
  formality: 'very_casual' | 'casual' | 'neutral' | 'formal' | 'very_formal';
  emotionalIntensity: 'flat' | 'low' | 'medium' | 'high' | 'intense';
  brevity: 'terse' | 'short' | 'medium' | 'detailed' | 'verbose';
}

interface BehavioralCue {
  type: string;
  detail: string;
  significance: string; // why this matters across archetypes
}

function detectBehavioralSignals(message: string): BehavioralSignals {
  const cues: BehavioralCue[] = [];

  // --- Punctuation patterns ---

  // Period at end of short message ("ok." "fine." "sure.")
  if (/^[a-zA-Z]{1,8}\.\s*$/.test(message.trim())) {
    cues.push({
      type: 'terminal_period_short',
      detail: `Short message ending with period: "${message.trim()}"`,
      significance: 'Gen Z/Millennial read this as cold or upset. Boomer/Gen X read it as normal punctuation.',
    });
  }

  // Exclamation marks
  const exclamationCount = (message.match(/!/g) || []).length;
  if (exclamationCount >= 3) {
    cues.push({
      type: 'excessive_exclamation',
      detail: `${exclamationCount} exclamation marks`,
      significance: 'Millennial: genuine enthusiasm. Gen Z: possibly ironic or performative. Boomer: unprofessional.',
    });
  } else if (exclamationCount === 0 && message.length > 20) {
    cues.push({
      type: 'no_exclamation',
      detail: 'No exclamation marks in a substantive message',
      significance: 'Millennial may read this as cold or disengaged. Gen X/Boomer: normal.',
    });
  }

  // Ellipsis
  const ellipsisCount = (message.match(/\.\.\./g) || []).length;
  if (ellipsisCount > 0) {
    cues.push({
      type: 'ellipsis',
      detail: `${ellipsisCount} ellipsis usage(s)`,
      significance: 'Boomer/Gen X: thinking pause or trailing thought. Millennial/Gen Z: passive aggression or awkwardness.',
    });
  }

  // ALL CAPS (more than 2 consecutive cap words)
  const capsWords = message.match(/\b[A-Z]{2,}\b/g) || [];
  const nonAcronymCaps = capsWords.filter(w => w.length > 3);
  if (nonAcronymCaps.length > 0) {
    cues.push({
      type: 'all_caps',
      detail: `ALL CAPS words: ${nonAcronymCaps.join(', ')}`,
      significance: 'Boomer: emphasis. Gen Z: yelling or irony. Millennial: aggressive. Gen X: something is actually wrong.',
    });
  }

  // --- Emoji / emotional markers ---

  const emojiPattern = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  const emojis = message.match(emojiPattern) || [];
  if (emojis.length > 0) {
    cues.push({
      type: 'emoji_usage',
      detail: `${emojis.length} emoji(s): ${emojis.slice(0, 5).join(' ')}`,
      significance: 'Gen Z/Millennial: essential emotional context. Boomer: decorative or confusing. Gen X: used sparingly and deliberately.',
    });
  } else if (message.length > 30) {
    cues.push({
      type: 'no_emoji',
      detail: 'No emoji in a longer message',
      significance: 'Gen Z may read this as serious or upset. Boomer: completely normal.',
    });
  }

  // "lol" / "haha" / "lmao"
  const laughMarkers = message.match(/\b(lol|lmao|haha|hahaha|😂|💀)\b/gi) || [];
  if (laughMarkers.length > 0) {
    cues.push({
      type: 'laugh_markers',
      detail: `Laugh markers: ${laughMarkers.join(', ')}`,
      significance: 'Gen Z: "lol" is punctuation (not laughing). "💀" = actually funny. Millennial: "haha" = polite. Boomer: takes literally.',
    });
  }

  // --- Formality markers ---

  const hasGreeting = /^(hi|hey|hello|dear|good morning|good afternoon)/i.test(message.trim());
  const hasSignoff = /(regards|best|thanks|sincerely|cheers|sent from)/i.test(message);
  const hasPlease = /\bplease\b/i.test(message);
  const hasPerMyLastEmail = /per my (last|previous)/i.test(message);
  const hasJustFollowingUp = /just (following|checking|wanted to)/i.test(message);

  if (hasPerMyLastEmail) {
    cues.push({
      type: 'per_my_last',
      detail: '"Per my last email" or similar',
      significance: 'Universal passive aggression. But Boomer may use it literally. Gen Z reads this as "I already told you."',
    });
  }

  if (hasJustFollowingUp) {
    cues.push({
      type: 'just_following_up',
      detail: '"Just following up" / "Just checking in" / "Just wanted to"',
      significance: 'The word "just" is a softener. Millennial/Gen Z use it to reduce perceived aggression. Boomer/Gen X: unnecessary hedging.',
    });
  }

  // --- Formality score ---
  let formalityScore = 0;
  if (hasGreeting) formalityScore += 2;
  if (hasSignoff) formalityScore += 2;
  if (hasPlease) formalityScore += 1;
  if (/\b(would you|could you|I'd appreciate)\b/i.test(message)) formalityScore += 1;
  if (/^[a-z]/.test(message.trim())) formalityScore -= 1; // lowercase start
  if (laughMarkers.length > 0) formalityScore -= 1;
  if (emojis.length > 0) formalityScore -= 1;

  const formality: BehavioralSignals['formality'] =
    formalityScore >= 4 ? 'very_formal' :
    formalityScore >= 2 ? 'formal' :
    formalityScore >= 0 ? 'neutral' :
    formalityScore >= -2 ? 'casual' : 'very_casual';

  // --- Emotional intensity ---
  let emotionScore = 0;
  emotionScore += exclamationCount;
  emotionScore += nonAcronymCaps.length * 2;
  emotionScore += emojis.length;
  if (/[?!]{2,}/.test(message)) emotionScore += 2; // ?! or !! or ???
  if (/\b(really|very|so|extremely|honestly|literally)\b/gi.test(message)) emotionScore += 1;

  const emotionalIntensity: BehavioralSignals['emotionalIntensity'] =
    emotionScore >= 6 ? 'intense' :
    emotionScore >= 4 ? 'high' :
    emotionScore >= 2 ? 'medium' :
    emotionScore >= 1 ? 'low' : 'flat';

  // --- Brevity ---
  const wordCount = message.trim().split(/\s+/).length;
  const brevity: BehavioralSignals['brevity'] =
    wordCount <= 3 ? 'terse' :
    wordCount <= 10 ? 'short' :
    wordCount <= 30 ? 'medium' :
    wordCount <= 80 ? 'detailed' : 'verbose';

  return { cues, formality, emotionalIntensity, brevity };
}


// ═══════════════════════════════════════════════════════════════════════════════
// PARSE AI RESPONSE
// ═══════════════════════════════════════════════════════════════════════════════

function parseTranslationResponse(text: string): Record<string, unknown> {
  const sections: Record<string, unknown> = {
    whatTheySaid: '',
    whatTheyMeant: '',
    whatYouHeard: '',
    whatToSayBack: '',
  };

  const patterns = [
    { key: 'whatTheySaid', regex: /WHAT THEY SAID:\s*([\s\S]*?)(?=WHAT THEY MEANT:|$)/i },
    { key: 'whatTheyMeant', regex: /WHAT THEY MEANT:\s*([\s\S]*?)(?=WHAT YOU HEARD:|$)/i },
    { key: 'whatYouHeard', regex: /WHAT YOU HEARD:\s*([\s\S]*?)(?=WHAT TO SAY BACK:|$)/i },
    { key: 'whatToSayBack', regex: /WHAT TO SAY BACK:\s*([\s\S]*?)$/i },
  ];

  for (const { key, regex } of patterns) {
    const match = text.match(regex);
    if (match) sections[key] = match[1].trim();
  }

  if (!sections.whatTheyMeant && !sections.whatYouHeard) {
    sections.whatTheySaid = text;
  }

  return sections;
}
