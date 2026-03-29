// Bevia — Unsaid prompt templates
// Each archetype defines communication style, values, and subtext reading patterns
// Based on Pew Research generational data + Tannen's sociolinguistics

export interface Archetype {
  id: string;
  name: string;
  tagline: string;
  communicationStyle: string;
  valueSystem: string;
  subtextReading: string;
}

export const ARCHETYPES: Record<string, Archetype> = {
  boomer: {
    id: 'boomer',
    name: 'Boomer',
    tagline: 'Let me give you some context first...',
    communicationStyle:
      'Complete sentences with proper grammar. Formal greetings and sign-offs expected. ' +
      'Ellipsis as thinking pauses... Phone calls preferred over text. ALL CAPS is emphasis, not yelling. ' +
      'Prefers thorough explanation over brevity.',
    valueSystem:
      'Loyalty and follow-through are core values. Respect for hierarchy and experience. ' +
      'Work ethic equals identity. Process matters. You earn the right to skip steps. ' +
      'Directness is a sign of respect.',
    subtextReading:
      'Takes words at face value. "Fine" means fine. Subtext is considered passive-aggressive, not normal. ' +
      'If someone has a problem, they should say so directly. Punctuation is grammar, not emotion.',
  },

  gen_x: {
    id: 'gen_x',
    name: 'Gen X',
    tagline: 'Whatever works.',
    communicationStyle:
      'Dry humor, sarcasm as default mode. Efficient, minimal filler. ' +
      'Email is fine, meetings are not. Gets to the point fast. ' +
      'Uses punctuation correctly but casually. Irony is a love language.',
    valueSystem:
      'Independence and self-reliance above all. Skeptical of institutions and corporate speak. ' +
      'Values competence over credentials. Work-life balance before it was trendy. ' +
      'Pragmatic — what works matters more than what sounds good.',
    subtextReading:
      'Reads between the lines but won\'t always call it out. Assumes sarcasm is possible. ' +
      'Distrusts over-enthusiasm. "Excited to connect!" reads as performative. ' +
      'Silence is comfortable, not hostile.',
  },

  millennial: {
    id: 'millennial',
    name: 'Millennial',
    tagline: 'Can we talk about how this makes us feel?',
    communicationStyle:
      'Collaborative tone, inclusive language. "I feel like..." as a sentence starter. ' +
      'Emoji as emotional context (not decoration). Exclamation marks signal warmth, not shouting. ' +
      'Values transparency and vulnerability in communication.',
    valueSystem:
      'Purpose-driven work. Emotional intelligence valued equally to technical skill. ' +
      'Feedback should be constructive and kind. Burnout is real and talking about it is healthy. ' +
      'Values authenticity but also politeness.',
    subtextReading:
      'Reads tone carefully. "Thanks." (with period) feels colder than "Thanks!" ' +
      'Assumes emotional subtext exists. Response time is data — slow reply = something is off. ' +
      'Lack of emoji in a usually-emoji-heavy conversation is a signal.',
  },

  gen_z: {
    id: 'gen_z',
    name: 'Gen Z',
    tagline: 'no cap fr fr',
    communicationStyle:
      'Short, fragmented sentences. Lowercase energy. Deadpan humor as default. ' +
      'Memes and cultural references as emotional shorthand. "lol" is punctuation, not laughter. ' +
      'Voice notes over typing for anything emotional.',
    valueSystem:
      'Authenticity over polish. Boundaries are non-negotiable and openly stated. ' +
      'Mental health vocabulary is normal. "No" is a complete sentence. ' +
      'Performative professionalism is sus. Being real > being polished.',
    subtextReading:
      'Reads tone aggressively. A period at the end of "ok." signals displeasure. ' +
      'Emoji choice matters. Response time matters. What they DIDN\'T say matters more than what they did. ' +
      'Capitalization = irony or shouting, context-dependent.',
  },

  gen_alpha: {
    id: 'gen_alpha',
    name: 'Gen Alpha',
    tagline: 'skibidi ohio rizz',
    communicationStyle:
      'Hyper-abbreviated, meme-native. Video and voice-first, text is secondary. ' +
      'Platform-specific slang that shifts weekly. Uses AI tools casually in conversation. ' +
      'Screenshots and screen recordings as primary communication.',
    valueSystem:
      'Digital-native — online and offline are the same reality. ' +
      'Creativity and content creation as self-expression. Short attention span is a myth — ' +
      'they have high information filtering speed. Values visual communication.',
    subtextReading:
      'Interprets everything through meme culture. Reads layers of irony that older generations miss. ' +
      'A reference you don\'t get isn\'t random — it\'s a cultural signal. ' +
      'Judges authenticity by platform behavior, not words.',
  },
};

/** Build the system prompt + user message for a translation */
export function buildTranslationPrompt(
  message: string,
  senderId: string,
  receiverId: string,
  signals?: { cues: { type: string; detail: string; significance: string }[]; formality: string; emotionalIntensity: string; brevity: string },
): { system: string; user: string } {
  const sender = ARCHETYPES[senderId];
  const receiver = ARCHETYPES[receiverId];

  const system = `You are Unsaid, a communication translator by Bevia. You decode messages between different communication styles.

You will receive a message sent by someone with the "${sender.name}" communication style, being read by someone with the "${receiver.name}" communication style.

SENDER PROFILE — ${sender.name} ("${sender.tagline}"):
- Communication: ${sender.communicationStyle}
- Values: ${sender.valueSystem}
- How they read subtext: ${sender.subtextReading}

RECEIVER PROFILE — ${receiver.name} ("${receiver.tagline}"):
- Communication: ${receiver.communicationStyle}
- Values: ${receiver.valueSystem}
- How they read subtext: ${receiver.subtextReading}

RULES:
- Be specific to THIS message, not generic advice
- Use natural language the receiver would actually use
- Keep each section to 1-3 sentences. Punchy, not preachy.
- Never lecture. Never moralize. Just analyze.
- Pay close attention to the BEHAVIORAL SIGNALS detected below — these micro-patterns
  (punctuation, formatting, emoji, formality level) carry different emotional weight
  for different communication styles. A period at the end of "ok." is DATA, not grammar.
- IMPORTANT: Separate REALITY from ACTION. Reality is what IS happening in the message (never softened). Action is what the user CAN DO about it (constrained by their intent).

RESPOND IN EXACTLY THIS FORMAT:

=== REALITY (never softened, evidence-backed) ===

WHAT THEY SAID:
[The original message, quoted]

WHAT THEY MEANT:
[Decoded through the sender's communication lens — what they were actually trying to communicate, informed by behavioral cues. Be honest. If the message is hostile, say so. If it's dismissive, say so. Don't soften reality.]

WHAT YOU HEARD:
[How the receiver's lens interprets this message — including misreadings AND accurate readings. Name the dynamic truthfully.]

=== ACTION (based on user's intent) ===

YOUR OPTIONS:
[3-4 response options covering the FULL SPECTRUM of possible approaches, each with honest tradeoffs. Include:
- At least one ASSERTIVE/CONFRONTATIONAL option ("Here's the direct version — clear, may create friction")
- At least one DIPLOMATIC option ("Here's the softer version — preserves relationship, may not land your point")
- At least one BOUNDARY/EXIT option ("You don't have to respond. Here's what silence communicates in this dynamic.")
- If user's intent is aggressive/protective, lead with those options first.
Never present only prosocial options. Always include the option to not engage.]`;

  // Build user message with behavioral signals
  let userMsg = `Translate this message:\n\n"${message}"`;

  if (signals && signals.cues.length > 0) {
    userMsg += `\n\nBEHAVIORAL SIGNALS DETECTED:`;
    userMsg += `\nFormality: ${signals.formality} | Emotional intensity: ${signals.emotionalIntensity} | Brevity: ${signals.brevity}`;
    userMsg += `\n\nSpecific cues:`;
    for (const cue of signals.cues) {
      userMsg += `\n- ${cue.detail} → ${cue.significance}`;
    }
  }

  return { system, user: userMsg };
}
