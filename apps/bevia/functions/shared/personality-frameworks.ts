// Bevia — Personality Framework System
//
// MBTI, zodiac, enneagram, love languages, generational archetypes.
// These are LENSES — ways people already understand each other.
// They layer on top of observed behavioral data, never replace it.
//
// Governance rule: frameworks are cultural models, not science.
// Framed as "through an INTJ lens" not "science says INTJs do this."
// Same rule as generational archetypes (unsaid world invariant: no_science_claims).

// ─── Framework Definitions ───────────────────────────────────────────────────

export interface PersonalityFramework {
  id: string;
  name: string;
  category: 'communication' | 'mbti' | 'zodiac' | 'enneagram' | 'love_language' | 'generational' | 'custom';
  options: FrameworkOption[];
}

export interface FrameworkOption {
  id: string;
  label: string;
  shortLabel?: string;    // for pills/tags (e.g., "INTJ" vs "INTJ — The Architect")
  description: string;    // behavioral description used in AI prompts
}

// ─── Communication Styles (default, no framework needed) ─────────────────────

export const COMMUNICATION_STYLES: PersonalityFramework = {
  id: 'communication',
  name: 'Communication Style',
  category: 'communication',
  options: [
    { id: 'direct', label: 'Direct Communicator', description: 'Says what they mean. Values efficiency and clarity. May come across as blunt. Prefers short, actionable messages.' },
    { id: 'diplomatic', label: 'Diplomatic Communicator', description: 'Focuses on relationship before content. Uses softeners, qualifiers, warm openings. Prioritizes how things land over speed.' },
    { id: 'analytical', label: 'Analytical Thinker', description: 'Leads with data and logic. Asks probing questions. Wants evidence, not feelings. May seem cold but is being thorough.' },
    { id: 'empathic', label: 'Empathic Feeler', description: 'Reads emotional subtext first. Responds to how people feel, not just what they say. Uses emotional vocabulary naturally.' },
    { id: 'visionary', label: 'Big-Picture Visionary', description: 'Skips details for the big picture. Connects dots across topics. May seem scattered but is seeing patterns. Bored by specifics.' },
    { id: 'planner', label: 'Detail-Oriented Planner', description: 'Needs specifics, timelines, action items. Uncomfortable with ambiguity. Asks "what exactly?" and "by when?" a lot.' },
  ],
};

// ─── MBTI ─────────────────────────────────────────────────────────────────────

export const MBTI: PersonalityFramework = {
  id: 'mbti',
  name: 'MBTI',
  category: 'mbti',
  options: [
    { id: 'intj', label: 'INTJ — The Architect', shortLabel: 'INTJ', description: 'Strategic, independent, analytical. Plans 10 steps ahead. Values competence over politeness. Communication is efficient and direct. Small talk is painful. Respects people who bring data, not feelings.' },
    { id: 'intp', label: 'INTP — The Logician', shortLabel: 'INTP', description: 'Curious, abstract, logical. Explores ideas for their own sake. Communication is precise but can be tangential. Hates being wrong more than being disliked. Needs space to think before responding.' },
    { id: 'entj', label: 'ENTJ — The Commander', shortLabel: 'ENTJ', description: 'Decisive, direct, takes charge. Natural leader who moves fast. Communication is clear, structured, action-oriented. Impatient with indecision. Respects pushback if it comes with a better plan.' },
    { id: 'entp', label: 'ENTP — The Debater', shortLabel: 'ENTP', description: 'Energetic, argumentative, creative. Loves devil\'s advocate. Communication is rapid, playful, provocative. Debates to explore, not to win (usually). Gets bored with routine.' },
    { id: 'infj', label: 'INFJ — The Advocate', shortLabel: 'INFJ', description: 'Idealistic, private, insightful. Reads people deeply. Communication is warm but measured — shares selectively. Values authenticity above all. Will withdraw if they sense inauthenticity.' },
    { id: 'infp', label: 'INFP — The Mediator', shortLabel: 'INFP', description: 'Creative, empathic, value-driven. Filters everything through personal values. Communication is gentle, metaphorical, sometimes indirect. Conflict-averse but will fight fiercely for what matters to them.' },
    { id: 'enfj', label: 'ENFJ — The Protagonist', shortLabel: 'ENFJ', description: 'Charismatic, empathic, organized. Natural at reading groups. Communication is warm, encouraging, sometimes overly involved. Wants harmony but can be directive. Takes on other people\'s emotions.' },
    { id: 'enfp', label: 'ENFP — The Campaigner', shortLabel: 'ENFP', description: 'Enthusiastic, creative, people-oriented. Connects ideas and people. Communication is energetic, bouncy, sometimes unfocused. Starts more than they finish. Makes everyone feel interesting.' },
    { id: 'istj', label: 'ISTJ — The Logistician', shortLabel: 'ISTJ', description: 'Reliable, thorough, traditional. Does what they say they\'ll do. Communication is factual, structured, no-frills. Respects process and expects others to follow it. Uncomfortable with ambiguity.' },
    { id: 'isfj', label: 'ISFJ — The Defender', shortLabel: 'ISFJ', description: 'Loyal, practical, nurturing. Remembers details about people. Communication is warm but reserved — shows care through actions, not words. Avoids conflict but tracks everything.' },
    { id: 'estj', label: 'ESTJ — The Executive', shortLabel: 'ESTJ', description: 'Organized, decisive, traditional. Runs a tight ship. Communication is clear, direct, expects follow-through. Frustrated by inefficiency. Respects hierarchy and competence.' },
    { id: 'esfj', label: 'ESFJ — The Consul', shortLabel: 'ESFJ', description: 'Social, caring, traditional. Attuned to group dynamics. Communication is warm, inclusive, sometimes overly accommodating. Wants everyone to feel included. Hurt by exclusion.' },
    { id: 'istp', label: 'ISTP — The Virtuoso', shortLabel: 'ISTP', description: 'Quiet, practical, observant. Learns by doing. Communication is minimal — says what\'s needed and nothing more. Independent, doesn\'t need external validation. Dislikes overexplaining.' },
    { id: 'isfp', label: 'ISFP — The Adventurer', shortLabel: 'ISFP', description: 'Gentle, artistic, present. Lives in the moment. Communication is soft-spoken, authentic, avoids confrontation. Expresses through actions and creativity more than words.' },
    { id: 'estp', label: 'ESTP — The Entrepreneur', shortLabel: 'ESTP', description: 'Bold, practical, energetic. Acts first, thinks later. Communication is fast, direct, sometimes blunt. Thrives on action. Bored by theory. Reads a room instantly.' },
    { id: 'esfp', label: 'ESFP — The Entertainer', shortLabel: 'ESFP', description: 'Spontaneous, energetic, social. Center of attention naturally. Communication is lively, warm, humor-driven. Lives for the moment. Avoids heavy conversations but deeply caring.' },
  ],
};

// ─── Zodiac ───────────────────────────────────────────────────────────────────

export const ZODIAC: PersonalityFramework = {
  id: 'zodiac',
  name: 'Zodiac Sign',
  category: 'zodiac',
  options: [
    { id: 'aries', label: 'Aries', description: 'Bold, competitive, direct. Initiates action. Impatient with slowness. Communication is fast, honest, sometimes aggressive. Respects courage.' },
    { id: 'taurus', label: 'Taurus', description: 'Steady, loyal, stubborn. Values security and comfort. Communication is deliberate, resistant to pressure. Once decided, won\'t budge. Shows love through stability.' },
    { id: 'gemini', label: 'Gemini', description: 'Curious, adaptable, talkative. Processes through conversation. Communication is rapid, varied, sometimes inconsistent. Needs intellectual stimulation. Gets bored fast.' },
    { id: 'cancer', label: 'Cancer', description: 'Emotionally intuitive, protective, nurturing. Reads emotional undercurrents. Communication is warm but guarded until trust is established. Withdraws when feeling unsafe. Remembers everything.' },
    { id: 'leo', label: 'Leo', description: 'Confident, generous, dramatic. Needs to be seen and appreciated. Communication is warm, expressive, sometimes dominant. Loyal but hurt by being ignored.' },
    { id: 'virgo', label: 'Virgo', description: 'Analytical, precise, critical. Notices what others miss. Communication is detailed, helpful, sometimes nitpicky. Shows care by improving things. Hard on themselves.' },
    { id: 'libra', label: 'Libra', description: 'Diplomatic, fair-minded, indecisive. Sees all sides. Communication is balanced, charming, avoids conflict. Wants harmony but can be passive. Needs partnership.' },
    { id: 'scorpio', label: 'Scorpio', description: 'Intense, strategic, perceptive. Sees through facades. Communication is measured, powerful, sometimes intimidating. Tests loyalty. Forgives slowly. Deep emotional capacity hidden behind control.' },
    { id: 'sagittarius', label: 'Sagittarius', description: 'Optimistic, blunt, freedom-loving. Says what others think. Communication is honest, enthusiastic, sometimes tactless. Hates being confined. Thinks big.' },
    { id: 'capricorn', label: 'Capricorn', description: 'Disciplined, ambitious, reserved. Plays the long game. Communication is structured, professional, sometimes cold. Respects competence and effort. Warms up slowly.' },
    { id: 'aquarius', label: 'Aquarius', description: 'Independent, unconventional, detached. Values ideas over emotions. Communication is intellectual, progressive, sometimes aloof. Cares about humanity more than individuals.' },
    { id: 'pisces', label: 'Pisces', description: 'Empathic, creative, dreamy. Absorbs others\' emotions. Communication is intuitive, metaphorical, sometimes evasive. Needs creative expression. Escapes when overwhelmed.' },
  ],
};

// ─── Enneagram ────────────────────────────────────────────────────────────────

export const ENNEAGRAM: PersonalityFramework = {
  id: 'enneagram',
  name: 'Enneagram',
  category: 'enneagram',
  options: [
    { id: 'type1', label: 'Type 1 — The Reformer', shortLabel: '1', description: 'Principled, purposeful, self-controlled. Has a strong inner critic. Communication is precise, ethical, sometimes rigid. Motivated by doing things right.' },
    { id: 'type2', label: 'Type 2 — The Helper', shortLabel: '2', description: 'Generous, people-pleasing, possessive. Needs to feel needed. Communication is warm, giving, sometimes intrusive. Struggles to receive help.' },
    { id: 'type3', label: 'Type 3 — The Achiever', shortLabel: '3', description: 'Ambitious, image-conscious, efficient. Adapts to what the audience values. Communication is polished, goal-oriented, sometimes inauthentic. Fears failure deeply.' },
    { id: 'type4', label: 'Type 4 — The Individualist', shortLabel: '4', description: 'Creative, sensitive, moody. Needs to be unique. Communication is expressive, emotional, sometimes dramatic. Feels deeply and needs that acknowledged.' },
    { id: 'type5', label: 'Type 5 — The Investigator', shortLabel: '5', description: 'Perceptive, isolated, cerebral. Needs private space. Communication is minimal, precise, detached. Overwhelmed by emotional demands. Processes internally.' },
    { id: 'type6', label: 'Type 6 — The Loyalist', shortLabel: '6', description: 'Loyal, anxious, responsible. Plans for worst case. Communication is questioning, seeking reassurance, sometimes skeptical. Needs to know who\'s trustworthy.' },
    { id: 'type7', label: 'Type 7 — The Enthusiast', shortLabel: '7', description: 'Spontaneous, scattered, optimistic. Avoids pain through activity. Communication is upbeat, fast, topic-jumping. Reframes everything positively. Fears missing out.' },
    { id: 'type8', label: 'Type 8 — The Challenger', shortLabel: '8', description: 'Powerful, dominating, protective. Takes control of situations. Communication is direct, confrontational, commanding. Tests people\'s strength. Vulnerable underneath but rarely shows it.' },
    { id: 'type9', label: 'Type 9 — The Peacemaker', shortLabel: '9', description: 'Easygoing, complacent, agreeable. Merges with others\' preferences. Communication is gentle, accommodating, sometimes passive. Avoids conflict by going along. Anger builds silently.' },
  ],
};

// ─── Love Languages ───────────────────────────────────────────────────────────

export const LOVE_LANGUAGES: PersonalityFramework = {
  id: 'love_language',
  name: 'Love Language',
  category: 'love_language',
  options: [
    { id: 'words', label: 'Words of Affirmation', description: 'Values verbal praise, encouragement, and explicit "I appreciate you." Silence or criticism hits hard. Needs to hear it, not just see it in actions.' },
    { id: 'acts', label: 'Acts of Service', description: 'Values people who show up and help. "Actions speak louder than words" is literal for them. Frustrated when words don\'t match effort.' },
    { id: 'gifts', label: 'Receiving Gifts', description: 'Values thoughtful gestures and symbols. It\'s not about money — it\'s about "you thought of me." Forgetting occasions feels personal.' },
    { id: 'time', label: 'Quality Time', description: 'Values undivided attention and presence. Phone-checking during conversation is a betrayal. Needs focused, uninterrupted connection.' },
    { id: 'touch', label: 'Physical Touch', description: 'Values physical closeness, hugs, proximity. Physical distance creates emotional distance. Comfort and connection are physical first.' },
  ],
};

// ─── Generational (original Unsaid archetypes) ───────────────────────────────

export const GENERATIONAL: PersonalityFramework = {
  id: 'generational',
  name: 'Generation',
  category: 'generational',
  options: [
    { id: 'boomer', label: 'Boomer', description: 'Formal, direct, values loyalty and follow-through. Complete sentences, proper grammar. Phone calls preferred. ALL CAPS is emphasis, not yelling.' },
    { id: 'gen_x', label: 'Gen X', description: 'Dry humor, sarcasm, efficiency. Skeptical of institutions. Values competence over credentials. Silence is comfortable, not hostile.' },
    { id: 'millennial', label: 'Millennial', description: 'Collaborative, emoji-driven, emotionally transparent. Exclamation marks signal warmth. Response time is data. Values authenticity.' },
    { id: 'gen_z', label: 'Gen Z', description: 'Lowercase energy, deadpan humor, boundary-forward. "lol" is punctuation. A period at the end of "ok." signals displeasure. Authenticity over polish.' },
    { id: 'gen_alpha', label: 'Gen Alpha', description: 'Meme-native, video-first, hyper-abbreviated. Platform-specific slang. Uses AI tools casually. Screenshots as communication.' },
  ],
};

// ─── All Frameworks ──────────────────────────────────────────────────────────

export const ALL_FRAMEWORKS: PersonalityFramework[] = [
  COMMUNICATION_STYLES,
  MBTI,
  ZODIAC,
  ENNEAGRAM,
  LOVE_LANGUAGES,
  GENERATIONAL,
];

// ─── Contact Profile Personality Tags ────────────────────────────────────────
// Stored on reflect_contacts.personality_tags jsonb field.

export interface PersonalityTags {
  mbti?: string;           // e.g., "intj"
  zodiac?: string;         // e.g., "cancer" — can be "cancer/cancer" for sun/moon
  enneagram?: string;      // e.g., "type8"
  loveLanguage?: string;   // e.g., "acts"
  generational?: string;   // e.g., "gen_x"
  communication?: string;  // e.g., "direct"
  custom?: string[];       // user-defined labels
}

// ─── Build Personality Context for AI Prompts ────────────────────────────────
// When analyzing a conversation or checking tone, include the contact's
// personality tags in the prompt so AI has that context.

export function buildPersonalityContext(tags: PersonalityTags): string {
  if (!tags || Object.keys(tags).length === 0) return '';

  const lines: string[] = ['PERSONALITY CONTEXT (from contact profile):'];

  if (tags.mbti) {
    const option = MBTI.options.find(o => o.id === tags.mbti);
    if (option) lines.push(`MBTI: ${option.label} — ${option.description}`);
  }

  if (tags.zodiac) {
    // Support "cancer/cancer" format for sun/moon
    const parts = tags.zodiac.split('/');
    const sun = ZODIAC.options.find(o => o.id === parts[0]);
    const moon = parts[1] ? ZODIAC.options.find(o => o.id === parts[1]) : null;
    if (sun) lines.push(`Zodiac (Sun): ${sun.label} — ${sun.description}`);
    if (moon) lines.push(`Zodiac (Moon): ${moon.label} — ${moon.description}`);
  }

  if (tags.enneagram) {
    const option = ENNEAGRAM.options.find(o => o.id === tags.enneagram);
    if (option) lines.push(`Enneagram: ${option.label} — ${option.description}`);
  }

  if (tags.loveLanguage) {
    const option = LOVE_LANGUAGES.options.find(o => o.id === tags.loveLanguage);
    if (option) lines.push(`Love Language: ${option.label} — ${option.description}`);
  }

  if (tags.generational) {
    const option = GENERATIONAL.options.find(o => o.id === tags.generational);
    if (option) lines.push(`Generation: ${option.label} — ${option.description}`);
  }

  if (tags.custom?.length) {
    lines.push(`Custom tags: ${tags.custom.join(', ')}`);
  }

  lines.push('');
  lines.push('NOTE: These are personality frameworks the user assigned to this contact. They are cultural models, not scientific diagnoses. Use them as additional context alongside observed behavioral data. When they conflict with observed behavior, note the discrepancy — that is useful information.');

  return lines.join('\n');
}
