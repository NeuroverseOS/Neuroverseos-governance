// Bevia — Unsaid Translation Engine
// Takes a message + sender archetype + receiver archetype
// Returns: what they said, what they meant, what you heard, what to say back

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, errorResponse, jsonResponse } from '../shared/auth.ts';
import { checkCredits, deductCredits, refundCredits } from '../shared/credits.ts';
import { callGemini } from '../shared/gemini.ts';
import { buildTranslationPrompt, ARCHETYPES } from './prompts.ts';

const CREDIT_COST = 1;

interface TranslateRequest {
  message: string;
  senderArchetype: string;
  receiverArchetype: string;
}

serve(async (req: Request) => {
  // Auth
  const auth = await authenticate(req);
  if (!auth.ok) return errorResponse(auth.error!, 401);

  // Parse body
  const body: TranslateRequest = await req.json();
  const { message, senderArchetype, receiverArchetype } = body;

  if (!message?.trim()) return errorResponse('Message is required', 400);
  if (!ARCHETYPES[senderArchetype]) return errorResponse(`Unknown sender archetype: ${senderArchetype}`, 400);
  if (!ARCHETYPES[receiverArchetype]) return errorResponse(`Unknown receiver archetype: ${receiverArchetype}`, 400);

  // Check credits
  const creditCheck = await checkCredits(auth.supabase, auth.userId, CREDIT_COST);
  if (!creditCheck.ok) return errorResponse(creditCheck.error!, 402);

  // Deduct credits upfront
  const deduction = await deductCredits(
    auth.supabase, auth.userId, CREDIT_COST,
    'unsaid_translate', 'unsaid',
    { senderArchetype, receiverArchetype, messageLength: message.length },
  );
  if (!deduction.ok) return errorResponse(deduction.error!, 402);

  // Build prompt and call Gemini
  const prompt = buildTranslationPrompt(message, senderArchetype, receiverArchetype);

  const aiResult = await callGemini({
    systemPrompt: prompt.system,
    messages: [{ role: 'user', parts: [{ text: prompt.user }] }],
    model: 'gemini-2.0-flash',
    temperature: 0.7,
    maxTokens: 1024,
  });

  if (!aiResult.ok) {
    // Refund on failure
    await refundCredits(auth.supabase, auth.userId, CREDIT_COST, 'unsaid_translate', 'unsaid', aiResult.error!);
    return errorResponse('Translation failed. You were not charged.', 500);
  }

  // Parse structured response
  const translation = parseTranslationResponse(aiResult.text);

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

/** Parse Gemini's response into structured translation object */
function parseTranslationResponse(text: string): Record<string, string> {
  const sections: Record<string, string> = {
    whatTheySaid: '',
    whatTheyMeant: '',
    whatYouHeard: '',
    whatToSayBack: '',
  };

  // AI is prompted to return labeled sections — parse them
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

  // Fallback: if parsing fails, return the raw text
  if (!sections.whatTheyMeant && !sections.whatYouHeard) {
    sections.whatTheySaid = text;
  }

  return sections;
}
