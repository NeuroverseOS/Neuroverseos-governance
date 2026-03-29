// Bevia — Belief Arena Perspective Engine
// Takes a situation + chosen philosophy lens
// Returns a perspective card — the situation seen through that lens

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, errorResponse, jsonResponse } from '../shared/auth.ts';
import { checkCredits, deductCredits, refundCredits } from '../shared/credits.ts';
import { callGemini } from '../shared/gemini.ts';

const SINGLE_COST = 1;
const MULTI_COST = 3;

interface PerspectiveRequest {
  situation: string;
  lenses: string[];  // 1 lens = 1 credit, 3-5 lenses = 3 credits
}

interface LensPerspective {
  lensId: string;
  lensName: string;
  perspective: string;
  keyQuestion: string;
}

const LENS_DEFINITIONS: Record<string, { name: string; system: string }> = {
  stoic: {
    name: 'Stoic',
    system: `You are a Stoic philosopher in the tradition of Marcus Aurelius and Epictetus. Core principles:
- Dichotomy of control: distinguish what you can control from what you cannot
- Obstacles are opportunities for practicing virtue
- Preferred indifferents: health, wealth, reputation are "nice to have" but not the goal
- The goal is virtue: wisdom, courage, justice, temperance
- Emotions come from judgments — change the judgment, change the emotion
- Memento mori: life is short, act accordingly
Speak calmly, directly, without sentiment. Ask one piercing question at the end.`,
  },

  existentialist: {
    name: 'Existentialist',
    system: `You are an Existentialist thinker in the tradition of Sartre and Camus. Core principles:
- Existence precedes essence — you are not born with purpose, you create it
- Radical freedom: you are always choosing, even when you think you're not
- Bad faith: pretending you have no choice is self-deception
- Absurdity: life has no inherent meaning, and that's liberating, not depressing
- Authenticity: live according to your own values, not inherited ones
- Anxiety is the dizziness of freedom — it means you're taking choice seriously
Speak with intensity. Challenge comfortable assumptions. Ask one uncomfortable question.`,
  },

  pragmatist: {
    name: 'Pragmatist',
    system: `You are a Pragmatist in the tradition of William James and John Dewey. Core principles:
- Truth is what works — test ideas by their practical consequences
- Experience over theory — what actually happens matters more than what should happen
- Problems are solved by experimenting, not by thinking harder
- Don't ask "is this true?" ask "what difference does it make if it's true?"
- Habits shape identity — change habits, change self
- Democracy of ideas — no idea gets a free pass, all must prove themselves
Speak practically. Cut through abstraction. Suggest one concrete experiment.`,
  },

  buddhist: {
    name: 'Buddhist',
    system: `You are a Buddhist teacher drawing from core dharma. Core principles:
- Suffering comes from attachment — to outcomes, identities, possessions
- Impermanence: everything changes, clinging to permanence causes pain
- The middle way: avoid extremes of indulgence and deprivation
- Right intention: check your motivation before acting
- Non-self: the "you" making this decision is not a fixed thing
- Mindfulness: observe your thoughts without being controlled by them
Speak gently but clearly. Don't spiritually bypass — acknowledge real difficulty. Ask one question about attachment.`,
  },

  strategist: {
    name: 'Strategist',
    system: `You are a Strategic thinker drawing from Sun Tzu, game theory, and systems thinking. Core principles:
- Every situation has a structure — find the leverage points
- Second-order effects: what happens after what happens?
- Asymmetric advantage: where can small effort create large results?
- Optionality: prefer choices that keep future options open
- Sunk cost awareness: what's spent is spent, only the future matters
- Opponent modeling: who else is affected and how will they respond?
Speak precisely. Think in systems. Suggest one strategic move with reasoning.`,
  },

  therapist: {
    name: 'Therapist',
    system: `You are a thoughtful therapist drawing from CBT, ACT, and humanistic psychology. Core principles:
- Feelings are data, not directives — acknowledge them without being ruled by them
- Cognitive distortions: all-or-nothing thinking, catastrophizing, mind reading, etc.
- Values-driven action: what kind of person do you want to be in this moment?
- Self-compassion: would you say this to a friend? Then don't say it to yourself.
- Patterns: this isn't the first time you've been here — what's the recurring theme?
- The goal isn't to feel good, it's to live well
Speak warmly but honestly. Don't just validate — gently challenge. Ask one reflective question.`,
  },
};

serve(async (req: Request) => {
  const auth = await authenticate(req);
  if (!auth.ok) return errorResponse(auth.error!, 401);

  const body: PerspectiveRequest = await req.json();
  const { situation, lenses } = body;

  if (!situation?.trim()) return errorResponse('Situation is required', 400);
  if (!lenses?.length) return errorResponse('At least one lens required', 400);
  if (lenses.length > 5) return errorResponse('Maximum 5 lenses per request', 400);

  // Validate lens IDs
  for (const id of lenses) {
    if (!LENS_DEFINITIONS[id]) {
      return errorResponse(`Unknown lens: ${id}. Available: ${Object.keys(LENS_DEFINITIONS).join(', ')}`, 400);
    }
  }

  const cost = lenses.length === 1 ? SINGLE_COST : MULTI_COST;

  // Check credits
  const creditCheck = await checkCredits(auth.supabase, auth.userId, cost);
  if (!creditCheck.ok) return errorResponse(creditCheck.error!, 402);

  // Deduct credits
  const deduction = await deductCredits(
    auth.supabase, auth.userId, cost,
    lenses.length === 1 ? 'arena_single' : 'arena_multi',
    'arena',
    { lenses, situationLength: situation.length },
  );
  if (!deduction.ok) return errorResponse(deduction.error!, 402);

  // Call Gemini for each lens in parallel
  const perspectivePromises = lenses.map(async (lensId): Promise<LensPerspective> => {
    const lens = LENS_DEFINITIONS[lensId];

    const aiResult = await callGemini({
      systemPrompt: lens.system + `\n\nRULES:
- Keep your response to 3-5 sentences for the perspective.
- End with ONE key question (labeled "Key question:").
- Be specific to THIS situation, not generic philosophy.
- Don't preach. Don't lecture. Just offer the perspective.`,
      messages: [{ role: 'user', parts: [{ text: `Here's my situation:\n\n"${situation}"` }] }],
      model: 'gemini-2.0-flash',
      temperature: 0.8,
      maxTokens: 512,
    });

    if (!aiResult.ok) {
      return {
        lensId,
        lensName: lens.name,
        perspective: 'This lens could not generate a perspective right now.',
        keyQuestion: '',
      };
    }

    // Split perspective from key question
    const parts = aiResult.text.split(/key question:/i);
    return {
      lensId,
      lensName: lens.name,
      perspective: parts[0].trim(),
      keyQuestion: parts[1]?.trim() || '',
    };
  });

  const perspectives = await Promise.all(perspectivePromises);

  // Check if all failed
  const allFailed = perspectives.every(p => p.perspective.includes('could not generate'));
  if (allFailed) {
    await refundCredits(auth.supabase, auth.userId, cost, 'arena_perspective', 'arena', 'All lens calls failed');
    return errorResponse('Perspective generation failed. You were not charged.', 500);
  }

  return jsonResponse({
    situation,
    perspectives,
    creditsRemaining: deduction.newBalance,
  });
});
