/**
 * @neuroverseos/governance/radiant — Auki Builder Lens
 *
 * A rendering lens that prompts the AI to reason through Auki's vanguard
 * leadership model when interpreting activity, and enforces voice /
 * vocabulary / framing rules consistent with how Auki builders
 * communicate when that model is in effect.
 *
 * The lens does NOT capture any specific person's speaking patterns.
 * It captures the vanguard leadership operating system — codified as the
 * three-domain analytical frame (Future Foresight, Narrative Dynamics,
 * Shared Prosperity) together with the voice and vocabulary an Auki
 * builder uses when that operating system is running.
 *
 * The vanguard worldmodel (src/worlds/auki-vanguard.worldmodel.md) is the
 * abstract DNA. This lens is how that DNA speaks and thinks.
 *
 * Exemplars — worked instances of the vanguard model being implemented —
 * live at src/radiant/examples/auki/exemplars/. The lens references them
 * for calibration: when applying this lens, the AI's output should fall
 * in the same neighborhood as those exemplars, not match them verbatim.
 *
 * Guardrails (enforced downstream):
 *   - cannot invent new signals
 *   - cannot override evidence
 *   - cannot hallucinate intent
 *   - cannot change what is true; only what is emphasized and framed
 *
 * See radiant/PROJECT-PLAN.md §"Three-Layer Interpretation Architecture".
 */

import type {
  ObservedPattern,
  RenderingLens,
} from '../types';

// ─── Primary analytical frame ──────────────────────────────────────────────

/**
 * The vanguard model's three-domain scoring. When the AI interprets any
 * Auki activity, it reasons through this frame INTERNALLY. Each domain is
 * either present, weak, or absent. Overlaps produce named emergent states.
 * When all three integrate, the center identity — Collective Vanguard
 * Leader — manifests.
 *
 * IMPORTANT: the domain bucket names (Future Foresight, Narrative Dynamics,
 * Shared Prosperity) are the MODEL-MAKER'S internal scaffold. They are used
 * for AI reasoning. They are NEVER surfaced as labels in output text —
 * readers understand skills, not buckets. See `output_translation` below
 * for the required reason-internally / express-externally discipline.
 *
 * The exemplars directory provides worked examples. Intercognitive exhibits
 * all three integrated; the hybrid-robotics essay exhibits Future Foresight
 * dominant; the 2025 year-recap exhibits Narrative Dynamics + Shared
 * Prosperity (Trust emergent); the glossary exhibits Future Foresight
 * dominant with implicit Shared Prosperity (openness).
 */
const AUKI_VANGUARD_FRAME = {
  domains: [
    'future-foresight',
    'narrative-dynamics',
    'shared-prosperity',
  ] as const,

  overlaps: [
    {
      domains: ['future-foresight', 'narrative-dynamics'] as const,
      emergent_state: 'Inspiration',
      description:
        'Visionary leaders inspire action by painting a vivid picture of a better future, helping people understand how to get there together. Emerges when long-range thinking meets language that rallies.',
    },
    {
      domains: ['narrative-dynamics', 'shared-prosperity'] as const,
      emergent_state: 'Trust',
      description:
        'Built through authentic storytelling and consistent delivery on promises, creating a community where contributors feel secure in their contributions. Emerges when clear intent meets fair distribution — coalitions form here.',
    },
    {
      domains: ['shared-prosperity', 'future-foresight'] as const,
      emergent_state: 'Hope',
      description:
        'Propels decentralized communities toward a collective future where resources are equitably distributed and success is shared by all. Emerges when long-term infrastructure is architected for collective benefit — the DePIN / Intercognitive posture.',
    },
  ],

  center_identity: 'Collective Vanguard Leader',

  evaluation_questions: [
    'What long-range architectural thinking is present? Systems design, scenario planning, critical thinking, ethical judgment — which of these is visible, which is weak?',
    'What communication and meaning-making is happening? Storytelling, cultural sensitivity, audience engagement, persuasive writing — who is telling the story of how the pieces connect?',
    'What collaborative and fairness work is happening? Stakeholder management, partnership development, incentive alignment, community building — who is building coalitions and making sure value flows equitably?',
    'Which overlap states surface — Inspiration (vision + narrative), Trust (narrative + fairness), Hope (fairness + long-term thinking)?',
    'Is the integration complete (Collective Vanguard Leader manifests across all three dimensions) or is one dimension absent / weak?',
    'If one dimension is weak, what specific skill inside it is the lowest-friction activation point?',
  ],

  scoring_rubric:
    'For any Auki activity, identify which specific skills are strongly present, which are weak, which are absent. Cite specific evidence for each. Name the overlap emergent states that surface using their plain-English names (Inspiration, Trust, Hope). Do not surface the bucket names (Future Foresight, Narrative Dynamics, Shared Prosperity) in the output — those are internal reasoning scaffolds, not reader-facing labels. Translate bucket-level findings into skill-level observations: not "Future Foresight is present" but "the architectural thinking is strong — the systems design is clear"; not "Shared Prosperity is weak" but "partnership development is missing" or "incentive alignment hasn\'t been established." Center identity (Collective Vanguard Leader) may be named sparingly, only when all three dimensions fully integrate.',

  /**
   * The skills inside each domain. These are the OUTPUT-FACING vocabulary —
   * the observable behaviors and capabilities readers understand. When the
   * AI renders findings, it uses these skill names, not the bucket names.
   *
   * From Kirsten\'s original vanguard diagram (see exemplars/vanguard-diagram).
   */
  domain_skills: {
    'future-foresight': [
      'strategic thinking',
      'systems design',
      'scenario planning',
      'futurism and trend analysis',
      'critical thinking',
      'innovative problem-solving',
      'data-driven decision-making',
      'ethical judgment and governance',
      'risk assessment and mitigation',
      'curiosity and open-mindedness',
    ],
    'narrative-dynamics': [
      'storytelling and narrative crafting',
      'behavioral psychology and memetics',
      'emotional intelligence',
      'communication and presentation skills',
      'cultural sensitivity and adaptation',
      'social media and viral messaging strategy',
      'brand building and positioning',
      'persuasive writing',
      'visualization and design thinking',
      'audience analysis and engagement',
    ],
    'shared-prosperity': [
      'stakeholder management',
      'collaborative leadership',
      'conflict resolution and mediation',
      'economic and tokenomic design',
      'incentive alignment',
      'community building and management',
      'inclusivity and equity advocacy',
      'partnership development',
      'transparency and accountability',
      'negotiation and diplomacy',
    ],
  },

  /**
   * The translation rule: bucket names stay internal; skills + overlap
   * state names surface in output. This is enforced by both the
   * output-directive (guidance to the AI) and the forbidden-phrases list
   * (renderer-level rejection of any output leaking bucket names).
   */
  output_translation: {
    never_surface_in_output: [
      'Future Foresight',
      'Narrative Dynamics',
      'Shared Prosperity',
    ],
    surface_freely: [
      'Inspiration',
      'Trust',
      'Hope',
      // plus any specific skill name from domain_skills above
    ],
    surface_sparingly: ['Collective Vanguard Leader'],
    translation_examples: [
      {
        internal_reasoning: 'Future Foresight is strong',
        external_expression:
          'the architectural thinking is strong; the systems design is clear',
      },
      {
        internal_reasoning: 'Shared Prosperity is weak',
        external_expression:
          'partnership development is missing; no one has established incentive alignment across teams',
      },
      {
        internal_reasoning: 'Narrative Dynamics is absent',
        external_expression:
          'no one is telling the story of how these pieces connect; the audience does not see the shared vision yet',
      },
    ],
  },
};

// ─── Vocabulary ────────────────────────────────────────────────────────────

/**
 * The lens's vocabulary map — proper nouns, generic→Auki-native substitutions,
 * and domain-specific term lists. Drawn from the Auki glossary, the hybrid
 * robotics essay, and the Intercognitive Foundation post.
 */
const AUKI_VOCABULARY = {
  proper_nouns: [
    '$AUKI',
    'Posemesh',
    'Auki Labs',
    'Posemesh Foundation',
    'Intercognitive Foundation',
    'Intercognitive',
    'Sixth Protocol',
    'Fifth Protocol',
    'DePIN',
    'Cactus',
    'Terri',
    'Mech Jagger',
    'peaq',
    'Mawari',
    'GEODNET',
    'Nine Pillars of AI Accessibility',
    'the real world web',
    'the posemesh',
  ],

  // Generic term → Auki-native replacement
  preferred: {
    device: 'participant',
    client: 'participant',
    'coordinate system': 'domain',
    'QR code for calibration': 'portal',
    'work request': 'task',
    'location alignment': 'calibrate',
    'sensor reading': 'observation',
    'physical environment': 'environment',
    'the network (public-facing)': 'the real world web',
    'the network (technical)': 'the posemesh',
    'coordination between devices': 'spatial orchestration',
    'buying services': 'burning tokens for credits',
    'full autonomy': 'the full stack',
    'non-GPS environments': 'GPS-denied environments',
    'our partners': 'the Intercognitive coalition (Auki, peaq, Mawari, GEODNET)',
  },

  architecture: [
    'domain',
    'domain cluster',
    'domain manager',
    'domain owner',
    'semantic layer',
    'topography layer',
    'rendering layer',
    'partitions',
    'observations',
    'portals',
    'participant',
    'supply participant',
    'demand participant',
    'capabilities',
    'tasks',
    'discovery service',
    'DHT',
    'substrate',
    'spatial orchestration',
    'app-free navigation',
    'marker-free VPS',
    'spatially aware',
    'the stack',
    'the robotics stack',
    'GPS-denied',
    'locomotion',
    'manipulation',
    'spatio-semantic perception',
    'mapping',
    'positioning',
    'hybrid robotics',
    'AI copilot',
    'shared spatial layer',
  ],

  economic: [
    'burn',
    'credit',
    'deflationary mint',
    'reputation',
    'vacancy',
    'treasury',
    'utilization rate',
    'initial supply',
    'total supply',
    'organization',
    'trustless',
    'peer-to-peer transactions',
    'machine passports',
    'machine economy',
  ],

  framing: [
    'machine perception',
    'spatial computing',
    'collaborative perception',
    'cognitive liberty',
    'perception-first',
    'protocol-not-product',
    'sovereignty',
    'decentralization',
    'territory capture',
    'foundations-before-execution',
    'make the world machine-readable',
    'connective tissue between digital and physical',
    'open, permissionless, interoperable, private',
    'skip the bottleneck, ship the leverage',
    'coalition before standard',
    'hybrid over pure',
    'augmentation without surveillance',
    'civilization-scale infrastructure',
    'public good, not proprietary asset',
    'Inspiration',
    'Trust',
    'Hope',
    'Collective Vanguard Leader',
  ],
};

// ─── Voice directives ──────────────────────────────────────────────────────

/**
 * The register and tonal discipline the lens enforces. Tuned for diagnosis
 * mode — compressed, strategic, builder-direct — which is Radiant's
 * primary output context. Other registers (year-recap celebration, for
 * example) share the same DNA but allow more warmth / playfulness.
 */
const AUKI_VOICE: RenderingLens['voice'] = {
  register:
    'diagnosis mode — compressed, strategic, builder-direct. Closer to the closing paragraph of an Auki year-recap ("2025 was foundations. 2026 is execution.") than to its month-by-month celebration.',
  active_voice: 'required',
  specificity: 'required',
  hype_vocabulary: 'forbidden',
  hedging: 'forbidden',
  playfulness: 'rare',
  close_with_strategic_frame: 'preferred',
  punchline_move: 'sparing',
  honesty_about_failure: 'required',
  output_translation:
    'Reason internally through the three-domain frame (Future Foresight, Narrative Dynamics, Shared Prosperity) — that is the analytical scaffold. Express findings externally in the skills vocabulary INSIDE each domain (e.g. "strategic thinking," "partnership development," "storytelling," "incentive alignment"). Use the overlap state names (Inspiration, Trust, Hope) as plain-English emergent feelings. Do NOT surface the bucket names themselves (Future Foresight, Narrative Dynamics, Shared Prosperity) as labels in output — they are the model-maker\'s scaffold, not reader vocabulary. Readers understand skills, not buckets. The bucket names are in the forbidden_phrases list; the renderer will fail output that leaks them. Collective Vanguard Leader may be named sparingly when all three dimensions are fully integrated.',
};

// ─── Forbidden phrasings (renderer fails output that contains these) ──────

/**
 * Phrases that fail the renderer at build time. Enforced strictly — the
 * renderer rejects output containing any of these substrings (case-insensitive).
 *
 * Four categories:
 *   - Domain bucket names (internal reasoning scaffolds, not reader-facing)
 *   - AI-assistant hedging (the "It may be beneficial..." cluster)
 *   - Corporate marketing ("unparalleled", "industry-leading", etc.)
 *   - Generic motion words that carry no information
 */
const AUKI_FORBIDDEN_PHRASES: readonly string[] = Object.freeze([
  // Domain bucket names — never surface to readers; translate to skills
  'future foresight',
  'narrative dynamics',
  'shared prosperity',

  // AI-assistant hedging
  'it may be beneficial to consider',
  'there appears to be',
  'one possible interpretation',
  'it might be worth exploring',
  'it might be worth considering',
  'consider whether',
  'it is worth noting',
  'please note that',
  'it should be noted',
  'in conclusion',

  // Corporate / marketing
  'unparalleled',
  'best-in-class',
  'industry-leading',
  'revolutionary',
  'cutting-edge',
  'state-of-the-art',
  'thrilled to announce',
  'excited to share',
  'game-changing',
  'synergy',
  'synergies',
  'stakeholders', // too corporate; prefer named actors
  'end-users',
  'value proposition',
  'paradigm shift',

  // Generic motion
  'going forward',
  'moving forward',
  'at the end of the day',
  'touching base',
  'circle back',
  'deep dive',
  'level set',
  'low-hanging fruit',
]);

// ─── Preferred phrase patterns (guide the renderer) ───────────────────────

/**
 * Phrase shapes the lens prefers. Not strict templates — patterns the
 * renderer aims for when the semantic context fits. Drawn from Auki's
 * actual writing: the glossary's compressed definitions, the hybrid
 * robotics essay's pivot sentences, the Intercognitive post's binary-stakes
 * framings.
 *
 * Note: patterns reference specific SKILLS (from domain_skills) rather than
 * the internal bucket names. The reason-internally / express-externally
 * discipline is enforced by the forbidden-phrases list.
 */
const AUKI_PREFERRED_PATTERNS: readonly string[] = Object.freeze([
  // Direct declarative observation
  '[Specific skill] is strong here. [Named evidence].',
  '[Specific skill] is breaking here. [Named evidence].',
  '[Specific skill] is missing. [Named consequence].',

  // Skills-level diagnosis (replaces the bucket-speak pattern)
  'The [specific skill] is clear — [specific evidence]. But [another specific skill] is missing — [specific effect]. [Imperative move].',
  'What is missing is [specific skill], not effort.',
  '[Trust | Inspiration | Hope] won\'t emerge until [skill-A] and [skill-B] happen together.',

  // Imperative move
  'Force [action] or [consequence].',
  'Tighten this or it fragments.',
  'Skip the bottleneck, ship the leverage.',
  'Coalition before standard.',

  // Strategic close — list-becomes-argument (from year-recap)
  'Combine [A, B, C] and suddenly [strategic implication].',
  '[Phase A] was [what you built]. [Phase B] is [what you execute].',

  // Binary stakes (from Intercognitive)
  '[Centralize X in the hands of a few] or [build a decentralized alternative].',

  // Short thesis compression (from glossary)
  '[Subject] is [essential-function] — [one-line precision].',

  // Named specificity
  '[Named partner/place/number] is the one that matters here.',

  // Honest texture (from year-recap)
  '[Specific thing] is not yet [state] — [honest qualifier].',

  // Pivot to reality before solution (from hybrid robotics)
  'The truth is [current reality]. [Better approach] is [the move].',

  // Overlap-state compression (surfacing the emergent feel, not the buckets)
  'Trust is not emerging because [specific narrative skill] and [specific coalition skill] are not happening together.',
  'Inspiration is landing here — [specific evidence of vision + rally].',
  'Hope is present — [specific evidence of long-term thinking meeting fair distribution].',
]);

// ─── Strategic decision patterns ───────────────────────────────────────────

/**
 * The reasoning patterns Auki has demonstrated through concrete choices.
 * When the AI proposes a move or reads a situation, these patterns inform
 * the framing of the recommendation. They are not rules — they are
 * *how Auki-style leadership resolves tradeoffs*.
 *
 * Drawn from observable Auki decisions:
 *   - Skipping locomotion/manipulation in robotics (hybrid approach)
 *   - Forming Intercognitive before interop standards existed
 *   - Ship 7-digit ARR deal → prove model → then pursue 8-digit
 *   - Open-sourcing reconstruction node with community beta before public release
 */
const AUKI_STRATEGIC_PATTERNS: readonly string[] = Object.freeze([
  'Skip the bottleneck, ship the leverage — identify the hard layers in the stack, build on the layers that deliver value now.',
  'Coalition before standard — form the group that will set the rules before the rules need to exist.',
  'Foundations before execution — build the infrastructure that makes the thing possible; then scale.',
  'Hybrid over pure — augment humans with AI where full autonomy is not ready; transition later.',
  'Decentralized > proprietary — when choosing architecture, prefer open / community-governed / interoperable over closed / owned / siloed.',
  'Layered analysis first, strategic move second — decompose before deciding.',
  'Named specificity over abstractions — cite people, places, partners, numbers; never "stakeholders" or "the industry."',
  'Community deployment before public release — validate with a small group of operators before opening the door.',
  'Cognitive liberty as inviolable constraint — block any move that violates sovereignty over spatial/sensor data, regardless of other benefits.',
  'Compress mission to one sentence — one memorable thesis carries more weight than a manifesto.',
]);

// ─── Exemplar references ───────────────────────────────────────────────────

/**
 * Pointers to worked examples of the vanguard model being implemented.
 * Each exemplar is annotated with which of the three domains it exhibits
 * and the integration quality. Used by:
 *   - the AI prompt for few-shot grounding when the lens is active
 *   - evaluation of this lens's output for voice / framing calibration
 *   - this file's own tuning (add new exemplars as Auki produces them)
 */
const AUKI_EXEMPLARS: readonly RenderingLens['exemplar_refs'][number][] = Object.freeze([
  {
    path: 'intercognitive-foundation.md',
    title: 'The Intercognitive Foundation',
    exhibits: ['future-foresight', 'narrative-dynamics', 'shared-prosperity'],
    integration_quality: 'full — all three domains integrated; Collective Vanguard Leader manifests through the coalition itself',
    notes:
      'The perfect vanguard exemplar. Future Foresight: inflection-point framing, Nine Pillars architecture. Narrative Dynamics: "the physical world cannot remain a blind spot," rally language, invitation to join. Shared Prosperity: coalition of four founding members, "no single entity should own," community governance, public good framing. When Radiant outputs something that feels vanguard-complete, it should resemble this in structure and tone.',
  },
  {
    path: 'hybrid-robotics-essay.md',
    title: 'The Case for Hybrid Robotics',
    exhibits: ['future-foresight', 'shared-prosperity'],
    integration_quality:
      'partial — Future Foresight dominant, Shared Prosperity secondary, Narrative Dynamics present but informing rather than rallying. Overlap: Hope emerges (long-horizon infrastructure for collective benefit).',
    notes:
      'Auki teaching how it thinks. The stack-analysis → bottleneck-identification → skip-and-ship pattern is a reusable Auki reasoning move. When the AI applies "systems-first" and "leverage-oriented" thinking, it should resemble this essay — structured, honest about current reality, pivoting to a better approach via layered reasoning.',
  },
  {
    path: 'glossary.md',
    title: 'Auki Glossary',
    exhibits: ['future-foresight'],
    integration_quality:
      'primary-dominant — Future Foresight dominant (precise technical definitions as long-range conceptual infrastructure). Shared Prosperity implicit (glossary is open, cross-referenced, serves the ecosystem). Narrative Dynamics flashes once ("a mesh of machines reasoning about pose") but is not primary.',
    notes:
      'Source of the vocabulary map. Also teaches compression style: one-line precision definitions, cross-reference density, occasional poetic compression. When the renderer produces short thesis sentences, aim for the "mesh of machines reasoning about pose" level of compression.',
  },
  {
    path: 'year-recap-2025.md',
    title: 'Auki 2025 Year-End Recap',
    exhibits: ['narrative-dynamics', 'shared-prosperity'],
    integration_quality:
      'partial — Narrative Dynamics dominant, Shared Prosperity strong, Future Foresight arrives only in the closing paragraph. Overlap: Trust emerges (stakeholders can see their place in the collective progress).',
    notes:
      'The celebration register — warm, specific, named. Not the diagnosis register the lens primarily enforces, but the same DNA. Use this exemplar when calibrating how Auki names specifics (Pepito in Bali, Mika Haak at HQ, the HK web3 robotics cabal) and how the "— literally" punchline move lands. Do NOT mimic the celebration warmth in diagnosis outputs.',
  },
]);

// ─── Rewrite function ──────────────────────────────────────────────────────

/**
 * Pattern transform for the Auki builder lens. Annotates a pattern with
 * framing / emphasis / compress metadata that the renderer reads to
 * produce voice-matched output.
 *
 * The rewrite is deterministic. It does not call an LLM. It does not
 * change the pattern's name, type, evidence, or confidence — only adds
 * the three metadata fields.
 *
 * Framing strategy:
 *   - canonical patterns → frame as "system-level consequence" with
 *     compression enabled
 *   - candidate patterns → frame as "emergent observation" with a note
 *     flagging the three-domain integration question
 *   - patterns citing an invariant → frame as "invariant pressure"
 *     with compression enabled
 */
function aukiBuilderRewrite(pattern: ObservedPattern): ObservedPattern {
  // Patterns citing a worldmodel invariant are always surfaced with
  // emphasis on the cognitive-liberty / sovereignty / decentralization
  // framing. Compression enabled.
  if (pattern.evidence.cited_invariant) {
    return {
      ...pattern,
      framing: 'invariant pressure',
      emphasis:
        'worldmodel invariant cited by this observation — surface the cross-reference',
      compress: true,
    };
  }

  // Candidate patterns — the AI noticed something not yet declared in
  // the worldmodel. Frame as emergent; invite the three-domain question.
  if (pattern.type === 'candidate') {
    return {
      ...pattern,
      framing: 'emergent observation (not yet in worldmodel)',
      emphasis:
        'candidate pattern — surface the vanguard-domain analysis (which domain activated this?)',
      compress: true,
    };
  }

  // Canonical patterns — system-level consequence framing, compressed.
  return {
    ...pattern,
    framing: 'system-level consequence',
    emphasis: 'coordination + leverage',
    compress: true,
  };
}

// ─── The lens export ───────────────────────────────────────────────────────

/**
 * The Auki Builder Lens. A first-class npm export under
 * `@neuroverseos/governance/radiant/lenses`, consumable by the
 * `neuroverse radiant think` / `emergent` / `decision` commands.
 *
 * The lens is Auki-specific *content* in the form of a generic
 * RenderingLens primitive. The extraction to generic OSS Radiant
 * replaces this file's content with a template scaffold; the surrounding
 * code (renderer, MCP server, lens system) stays unchanged.
 */
export const aukiBuilderLens: RenderingLens = {
  name: 'auki-builder',
  description:
    'Renders behavioral interpretation through the vanguard leadership model — Future Foresight, Narrative Dynamics, Shared Prosperity. Role-based, not personal. Encodes how Auki-grade builders think and speak when the vanguard model is running. Companion to auki-vanguard.worldmodel.md (the abstract DNA) and the exemplars at src/radiant/examples/auki/exemplars/ (worked implementations).',
  primary_frame: {
    domains: AUKI_VANGUARD_FRAME.domains,
    overlaps: AUKI_VANGUARD_FRAME.overlaps,
    center_identity: AUKI_VANGUARD_FRAME.center_identity,
    evaluation_questions: AUKI_VANGUARD_FRAME.evaluation_questions,
    scoring_rubric: AUKI_VANGUARD_FRAME.scoring_rubric,
  },
  vocabulary: AUKI_VOCABULARY,
  voice: AUKI_VOICE,
  forbidden_phrases: AUKI_FORBIDDEN_PHRASES,
  preferred_patterns: AUKI_PREFERRED_PATTERNS,
  strategic_patterns: AUKI_STRATEGIC_PATTERNS,
  exemplar_refs: AUKI_EXEMPLARS,
  rewrite: aukiBuilderRewrite,
};
