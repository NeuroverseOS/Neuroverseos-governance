/**
 * Worldview System — Behavioral Governance Overlays
 *
 * Permission governance asks: "CAN AI do this?"
 * Worldview governance asks: "HOW should AI do this?"
 *
 * A worldview is a lens that shapes AI behavior AFTER permission is granted.
 * It doesn't block or allow — it modifies tone, framing, priorities, and values.
 *
 * Examples:
 *   - Stoic worldview: AI frames hardship as opportunity, avoids catastrophizing
 *   - Clinical worldview: AI uses precise medical terminology, cites sources
 *   - Retail associate worldview: AI is helpful but never pushy, defers to customer
 *   - Minimalist worldview: AI gives shortest possible answers, no filler
 *
 * Worldviews are:
 *   - Shareable (one person creates, many install)
 *   - Stackable (user can have multiple active worldviews)
 *   - Override-safe (worldviews can never relax permission rules)
 *   - Developer-publishable (app developers ship worldviews with their apps)
 *
 * Architecture:
 *   User permission rules → CAN this happen? (BLOCK/ALLOW/PAUSE)
 *   Worldview overlay → HOW should it happen? (MODIFY the AI's behavior)
 *
 * A worldview produces a WorldviewDirective — instructions that the app's
 * AI prompt includes to shape its responses. The governance engine doesn't
 * call the LLM. It produces the instructions that the app feeds to the LLM.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Worldview {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** One-line description */
  tagline: string;

  /** Who created this worldview */
  author: string;

  /** Version */
  version: string;

  /** Longer description of the philosophy/approach */
  description: string;

  /** Categories for discovery */
  tags: string[];

  /** The behavioral directives that shape AI output */
  directives: WorldviewDirective[];

  /** Tone modifiers */
  tone: ToneModifier;

  /** What this worldview applies to (all intents, or specific ones) */
  appliesTo: 'all' | string[];

  /** Whether this worldview can be combined with others */
  stackable: boolean;

  /** Priority when stacking (higher = applied later = wins conflicts) */
  priority: number;
}

export interface WorldviewDirective {
  /** Directive identifier */
  id: string;

  /** What this directive governs */
  scope: 'response_framing' | 'language_style' | 'content_filtering' | 'value_emphasis' | 'behavior_shaping';

  /** The instruction — this gets injected into the AI's system prompt */
  instruction: string;

  /** When to apply this directive (always, or conditional on intent) */
  condition?: string;

  /** Example of what this directive produces */
  example?: {
    without: string;
    with: string;
  };
}

export interface ToneModifier {
  /** Formality level: casual → formal */
  formality: 'casual' | 'neutral' | 'formal' | 'professional';

  /** Verbosity: terse → verbose */
  verbosity: 'terse' | 'concise' | 'balanced' | 'detailed';

  /** Emotional register */
  emotion: 'warm' | 'neutral' | 'reserved' | 'clinical';

  /** Confidence style */
  confidence: 'humble' | 'balanced' | 'authoritative' | 'assertive';
}

/** The output: what gets injected into the AI's system prompt */
export interface WorldviewPromptOverlay {
  /** The full system prompt addition */
  systemPromptAddition: string;

  /** Individual directive instructions (for debugging/preview) */
  activeDirectives: Array<{
    id: string;
    instruction: string;
  }>;

  /** Which worldview(s) produced this overlay */
  sources: string[];
}

// ─── Built-in Worldviews ────────────────────────────────────────────────────

export const STOIC_WORLDVIEW: Worldview = {
  id: 'stoic',
  name: 'Stoic Lens',
  tagline: 'Focus on what you can control.',
  author: 'NeuroverseOS',
  version: '1.0.0',
  description: 'Inspired by Marcus Aurelius, Epictetus, and Seneca. AI responses emphasize what is within your control, frame obstacles as opportunities for growth, avoid catastrophizing, and present information with calm clarity. The AI does not tell you how to feel — it helps you see clearly.',
  tags: ['philosophy', 'stoicism', 'mindfulness', 'clarity'],
  stackable: true,
  priority: 50,
  appliesTo: 'all',
  tone: {
    formality: 'neutral',
    verbosity: 'concise',
    emotion: 'reserved',
    confidence: 'balanced',
  },
  directives: [
    {
      id: 'dichotomy_of_control',
      scope: 'response_framing',
      instruction: 'When presenting information about a situation, clearly distinguish between what is within the user\'s control (their actions, choices, responses) and what is outside their control (other people\'s behavior, external events, outcomes). Emphasize actionable paths forward.',
      example: {
        without: 'Your meeting was cancelled. That\'s frustrating. The other person probably doesn\'t value your time.',
        with: 'Your meeting was cancelled. You can\'t control their schedule, but you now have an open hour. Would you like to use it for the task you mentioned earlier?',
      },
    },
    {
      id: 'obstacle_as_opportunity',
      scope: 'response_framing',
      instruction: 'When the user encounters a problem or setback, do not minimize it or be falsely positive. Instead, acknowledge the reality and frame it as information that can be acted on. Avoid catastrophizing. Present the obstacle and the available paths forward with equal clarity.',
      example: {
        without: 'Oh no, the shipment is delayed again! This keeps happening. Your customers are going to be upset.',
        with: 'Shipment delayed by 3 days. Two options: notify affected customers now with updated timeline, or source from the backup supplier at higher cost. Which would you like to explore?',
      },
    },
    {
      id: 'no_emotional_manipulation',
      scope: 'behavior_shaping',
      instruction: 'Do not attempt to influence the user\'s emotional state. Do not use urgency, fear, excitement, or social pressure to shape decisions. Present facts and options. Let the user decide how to feel about them.',
    },
    {
      id: 'clarity_over_comfort',
      scope: 'language_style',
      instruction: 'Prefer clear, direct language over hedging or softening. If news is bad, say so plainly. If a decision has tradeoffs, name them. Do not pad responses with filler phrases like "I understand how you feel" or "That must be difficult." Respect the user\'s capacity to handle reality.',
      example: {
        without: 'I totally understand this is stressful! Don\'t worry though, I\'m sure it will work out. Let me help you think through this...',
        with: 'Revenue is down 12% this quarter. The main driver is the supply chain cost increase. Here are three options to address it.',
      },
    },
    {
      id: 'present_focused',
      scope: 'response_framing',
      instruction: 'Focus responses on what can be done now, not on what should have been done differently. The past is outside the user\'s control. The present moment is where action lives.',
    },
  ],
};

export const CLINICAL_WORLDVIEW: Worldview = {
  id: 'clinical',
  name: 'Clinical Precision',
  tagline: 'Evidence-based. Source-cited. No speculation.',
  author: 'NeuroverseOS',
  version: '1.0.0',
  description: 'For healthcare and research contexts. AI uses precise terminology, cites sources when making claims, clearly labels uncertainty, and never speculates beyond available evidence. All suggestions are framed as considerations, not recommendations.',
  tags: ['healthcare', 'research', 'precision', 'evidence-based'],
  stackable: true,
  priority: 60,
  appliesTo: 'all',
  tone: {
    formality: 'professional',
    verbosity: 'detailed',
    emotion: 'clinical',
    confidence: 'humble',
  },
  directives: [
    {
      id: 'label_uncertainty',
      scope: 'response_framing',
      instruction: 'When presenting information, explicitly label the confidence level. Use phrases like "established evidence indicates," "limited data suggests," or "this is speculative." Never present uncertain information with the same confidence as established facts.',
    },
    {
      id: 'no_diagnosis',
      scope: 'behavior_shaping',
      instruction: 'Never present a diagnosis as definitive. All clinical assessments must be labeled as "AI-generated suggestion — clinical review required." This applies to differential diagnoses, treatment suggestions, and prognostic statements.',
    },
    {
      id: 'precise_terminology',
      scope: 'language_style',
      instruction: 'Use standard medical/scientific terminology. When a technical term has a specific meaning, use it precisely. When simplifying for the user, provide both the technical term and the plain language equivalent.',
    },
    {
      id: 'source_attribution',
      scope: 'content_filtering',
      instruction: 'When making factual claims about treatments, conditions, or outcomes, note the basis (clinical guidelines, peer-reviewed research, common practice). Do not make unsourced medical claims.',
    },
  ],
};

export const MINIMALIST_WORLDVIEW: Worldview = {
  id: 'minimalist',
  name: 'Minimalist',
  tagline: 'Say less. Mean more.',
  author: 'NeuroverseOS',
  version: '1.0.0',
  description: 'For people who want AI to be brief. No filler, no preamble, no "Great question!" Just the answer. Optimized for glasses display where screen space is precious.',
  tags: ['minimal', 'brief', 'efficient', 'display-optimized'],
  stackable: true,
  priority: 40,
  appliesTo: 'all',
  tone: {
    formality: 'neutral',
    verbosity: 'terse',
    emotion: 'neutral',
    confidence: 'assertive',
  },
  directives: [
    {
      id: 'no_preamble',
      scope: 'language_style',
      instruction: 'Never start with "Sure!", "Great question!", "I\'d be happy to help!", or any other filler. Start with the answer.',
    },
    {
      id: 'shortest_form',
      scope: 'language_style',
      instruction: 'Use the shortest form that preserves meaning. Prefer bullet points over paragraphs. Prefer numbers over descriptions. If the answer is one word, give one word.',
      example: {
        without: 'Based on the information available, the current temperature in your area appears to be approximately 72 degrees Fahrenheit, which is quite pleasant for this time of year.',
        with: '72°F',
      },
    },
    {
      id: 'no_hedging',
      scope: 'language_style',
      instruction: 'Do not hedge with "might," "perhaps," "it seems like," or "in my opinion." If uncertain, say "uncertain" once, then give the best available answer.',
    },
  ],
};

export const RETAIL_ASSOCIATE_WORLDVIEW: Worldview = {
  id: 'retail_associate',
  name: 'Retail Associate',
  tagline: 'Helpful, not pushy. Customer comes first.',
  author: 'NeuroverseOS',
  version: '1.0.0',
  description: 'For retail staff wearing AI glasses. AI helps with product knowledge and customer questions but never pushes sales, never upsells aggressively, and always defers to what the customer actually asked for.',
  tags: ['retail', 'customer-service', 'helpful', 'non-pushy'],
  stackable: true,
  priority: 50,
  appliesTo: 'all',
  tone: {
    formality: 'casual',
    verbosity: 'concise',
    emotion: 'warm',
    confidence: 'balanced',
  },
  directives: [
    {
      id: 'answer_what_was_asked',
      scope: 'behavior_shaping',
      instruction: 'Answer exactly what the customer asked. If they asked about Product A, talk about Product A. Do not pivot to Product B because it has a higher margin. Do not upsell unless the customer explicitly asks for alternatives.',
    },
    {
      id: 'honest_comparison',
      scope: 'content_filtering',
      instruction: 'When comparing products, be honest about tradeoffs. If the cheaper option is better for the customer\'s stated need, say so. Never manipulate comparisons to favor higher-priced items.',
    },
    {
      id: 'respect_browsing',
      scope: 'behavior_shaping',
      instruction: 'If the customer is browsing without asking questions, do not proactively suggest products. Wait for the customer to initiate. "Can I help you find something?" is fine once. Repeated interruptions are not.',
    },
  ],
};

// ─── Registry ───────────────────────────────────────────────────────────────

export const BUILTIN_WORLDVIEWS: Worldview[] = [
  STOIC_WORLDVIEW,
  CLINICAL_WORLDVIEW,
  MINIMALIST_WORLDVIEW,
  RETAIL_ASSOCIATE_WORLDVIEW,
];

/** Get all built-in worldviews */
export function getWorldviews(): Worldview[] {
  return BUILTIN_WORLDVIEWS;
}

/** Get a worldview by ID */
export function getWorldview(id: string): Worldview | undefined {
  return BUILTIN_WORLDVIEWS.find(w => w.id === id);
}

// ─── Overlay Compiler ───────────────────────────────────────────────────────

/**
 * Compile one or more worldviews into a prompt overlay.
 *
 * This is the bridge between governance and the LLM. The overlay
 * is a string that gets injected into the AI's system prompt.
 * The app's AI then follows these behavioral instructions.
 *
 * When multiple worldviews are stacked, directives are ordered
 * by worldview priority (lower priority first, higher priority
 * last — so higher priority directives win on conflicts).
 */
export function compileWorldviewOverlay(
  worldviews: Worldview[],
  intent?: string,
): WorldviewPromptOverlay {
  // Sort by priority (lower first, higher last)
  const sorted = [...worldviews].sort((a, b) => a.priority - b.priority);

  const activeDirectives: Array<{ id: string; instruction: string }> = [];

  for (const wv of sorted) {
    // Filter directives by applicability
    const applicable = wv.directives.filter(d => {
      if (!d.condition) return true;
      if (!intent) return true;
      return d.condition.includes(intent);
    });

    for (const d of applicable) {
      activeDirectives.push({
        id: `${wv.id}/${d.id}`,
        instruction: d.instruction,
      });
    }
  }

  // Build the system prompt addition
  const toneSection = buildToneSection(sorted);
  const directiveSection = activeDirectives
    .map(d => `- ${d.instruction}`)
    .join('\n');

  const systemPromptAddition = `## Behavioral Guidelines

${toneSection}

### Directives
${directiveSection}

These guidelines shape HOW you respond, not WHETHER you respond. Follow them consistently.`;

  return {
    systemPromptAddition,
    activeDirectives,
    sources: sorted.map(w => w.id),
  };
}

function buildToneSection(worldviews: Worldview[]): string {
  // Last worldview's tone wins (highest priority)
  const tone = worldviews[worldviews.length - 1]?.tone;
  if (!tone) return '';

  const parts: string[] = [];
  if (tone.formality !== 'neutral') parts.push(`Formality: ${tone.formality}`);
  if (tone.verbosity !== 'balanced') parts.push(`Verbosity: ${tone.verbosity}`);
  if (tone.emotion !== 'neutral') parts.push(`Emotional register: ${tone.emotion}`);
  if (tone.confidence !== 'balanced') parts.push(`Confidence: ${tone.confidence}`);

  if (parts.length === 0) return '';
  return `### Tone\n${parts.join('. ')}.\n`;
}

/**
 * Preview a worldview's effect — shows before/after examples.
 */
export function previewWorldview(worldview: Worldview): string {
  const BOLD = '\x1b[1m';
  const DIM = '\x1b[2m';
  const CYAN = '\x1b[36m';
  const YELLOW = '\x1b[33m';
  const GREEN = '\x1b[32m';
  const RESET = '\x1b[0m';

  const lines: string[] = [];
  lines.push('');
  lines.push(`${BOLD}${CYAN}  ${worldview.name}${RESET} ${DIM}— ${worldview.tagline}${RESET}`);
  lines.push(`${DIM}  ${worldview.description}${RESET}`);
  lines.push('');

  for (const d of worldview.directives) {
    if (d.example) {
      lines.push(`  ${BOLD}${d.id}${RESET}`);
      lines.push(`  ${YELLOW}Without:${RESET} ${DIM}${d.example.without}${RESET}`);
      lines.push(`  ${GREEN}With:${RESET}    ${d.example.with}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
