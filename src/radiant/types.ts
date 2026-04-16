/**
 * @neuroverseos/governance/radiant — core types
 *
 * Encodes the Universal Math frame from radiant/PROJECT-PLAN.md:
 *
 *   - Asymmetric Life/Cyber capability spaces (two distinct native dimension sets,
 *     never mirrored).
 *   - Presence-based averaging — no weights, no coefficients.
 *   - N (coherence) requires a loaded worldmodel; UNAVAILABLE otherwise.
 *   - INSUFFICIENT_EVIDENCE and UNAVAILABLE are first-class sentinel states.
 *     Silence is never scored as neutral.
 *
 * Conceptually: NeuroverseOS is the universe the two gyroscopes exist in.
 * It defines how they can behave and how they can survive. These types
 * describe what the gyroscopes look like when measured from inside that
 * universe.
 */

// ─── Evidence gate ─────────────────────────────────────────────────────────

/**
 * Deterministic presence rule. A dimension or bridging component is
 * considered present iff event_count >= k AND confidence >= c.
 *
 * Tunable per worldmodel via frontmatter. Not per-call — tuning belongs to
 * the constitution, not to the invocation.
 */
export interface EvidenceGate {
  /** Minimum event count in the measurement window. */
  k: number;
  /** Minimum signal extraction confidence (0–1). */
  c: number;
}

/** Default gate: k=3 events, c=0.5 confidence. Overridable per worldmodel. */
export const DEFAULT_EVIDENCE_GATE: EvidenceGate = { k: 3, c: 0.5 };

// ─── Scored observation (shared shape) ─────────────────────────────────────

/**
 * Any item that carries a 0–100 score, an event count, and a 0–1 confidence.
 * `presenceAverage` operates on arrays of this shape, regardless of the
 * domain-specific identity each item carries.
 */
export interface ScoredObservation {
  score: number;
  eventCount: number;
  confidence: number;
}

// ─── Life gyroscope ────────────────────────────────────────────────────────

/**
 * A single observed life-native capability dimension. Defaults declared by
 * the NeuroVerse base worldmodel: Cognition, Creativity, Sensory. A per-org
 * worldmodel can declare more or fewer.
 */
export interface LifeDimension extends ScoredObservation {
  id: string;
}

/**
 * The life gyroscope's measured state across its native dimensions.
 */
export interface LifeCapability {
  dimensions: LifeDimension[];
}

// ─── Cyber gyroscope ───────────────────────────────────────────────────────

/**
 * A single observed cyber-native capability dimension. Defaults declared by
 * the NeuroVerse base worldmodel: AI-reasoning, AR/adaptivity, Spatial.
 *
 * CyberDimension is a distinct type from LifeDimension — the two gyroscopes
 * have independent native vocabularies and must not be mixed at the type
 * level.
 */
export interface CyberDimension extends ScoredObservation {
  id: string;
}

/**
 * The cyber gyroscope's measured state across its native dimensions.
 */
export interface CyberCapability {
  dimensions: CyberDimension[];
}

// ─── Bridging (NeuroVerse coherence) ───────────────────────────────────────

/**
 * The four components of NeuroVerse coherence. Each measures a different
 * kind of translation through an open corridor:
 *
 *   ALIGN        — both sides point at the same mission via shared worldmodel refs
 *   HANDOFF      — life-side output is legibly picked up by cyber-side (or vice versa)
 *   CO_DECISION  — both intelligences contributed interpretable input to a decision
 *   CO_EXECUTION — both intelligences are present in a shipped artifact
 */
export type BridgingComponent = 'ALIGN' | 'HANDOFF' | 'CO_DECISION' | 'CO_EXECUTION';

/**
 * An aggregated score for one of the four bridging components, built from
 * individual corridor-opening events where life-side and cyber-side activity
 * referenced the same worldmodel element (invariant / signal / lens / context).
 */
export interface BridgingComponentScore extends ScoredObservation {
  component: BridgingComponent;
}

// ─── Score sentinels ───────────────────────────────────────────────────────

/**
 * Sentinel states a score can take when no number is meaningful.
 *
 *   INSUFFICIENT_EVIDENCE — the dimension/entity exists in this universe, but
 *     not enough observed evidence passed the presence gate.
 *   UNAVAILABLE — the measurement is structurally undefined. Currently only
 *     used for N when no worldmodel is loaded (no shared universe for the
 *     gyroscopes to register against).
 */
export type ScoreSentinel = 'INSUFFICIENT_EVIDENCE' | 'UNAVAILABLE';

/**
 * An entity or composite score: a number in [0, 100] when computable, or a
 * sentinel explaining why no number is available.
 */
export type Score = number | ScoreSentinel;

/** Type guard: this Score is a usable number. */
export function isScored(s: Score): s is number {
  return typeof s === 'number';
}

/** Type guard: this Score is a sentinel. */
export function isSentinel(s: Score): s is ScoreSentinel {
  return typeof s === 'string';
}

// ─── Alignment status (Radiant-level behavioral read) ──────────────────────

/**
 * Radiant's read on whether observed activity aligns with the stated
 * worldmodel. Orthogonal to engine-level ViabilityStatus (which describes
 * whether the worldmodel itself remains structurally coherent). Both surface
 * side-by-side; neither is collapsed into the other.
 *
 * INSUFFICIENT_EVIDENCE is first-class. Silence is never scored as neutral.
 */
export type AlignmentStatus =
  | 'STRONG'
  | 'STABLE'
  | 'WATCHING'
  | 'FRAGILE'
  | 'MISALIGNED'
  | 'INSUFFICIENT_EVIDENCE';

// ─── Observed patterns (consumed by rendering lens, produced by step 5) ────

/**
 * An observed behavioral pattern identified by AI pattern interpretation.
 * Two kinds:
 *
 *   canonical — the worldmodel declared this pattern by name (e.g.
 *     'coordination_drift' as an evolution-layer pattern). The AI
 *     identified it in the activity.
 *   candidate — the AI noticed a pattern the worldmodel hasn't
 *     declared. Surfaces as "emergent," and accumulates across runs as
 *     a potential worldmodel-evolution proposal.
 *
 * Step 5 produces these via AI interpretation + guard-engine governance
 * (evidence gate, invariant check, no-hallucination check). Step 6 (the
 * rendering lens) transforms them by annotating framing + emphasis
 * metadata before the renderer turns them into output text.
 */
export interface ObservedPattern {
  name: string;
  type: 'canonical' | 'candidate';
  /** If canonical, the worldmodel-declared pattern name this matched. */
  declaredAs?: string;
  /** Description of the pattern, in lens voice. */
  description: string;
  /** Evidence the AI cited when naming this pattern. */
  evidence: PatternEvidence;
  /** Rendering-lens annotation: which framing applies. Set by lens.rewrite. */
  framing?: string;
  /** Rendering-lens annotation: what this lens wants weighted. Set by lens.rewrite. */
  emphasis?: string;
  /** Rendering-lens annotation: should the renderer compress? Set by lens.rewrite. */
  compress?: boolean;
  /** AI's confidence in the observation, 0–1. */
  confidence: number;
}

export interface PatternEvidence {
  /** Signal cell refs, e.g. 'alignment.life', 'follow_through.joint'. */
  signals: string[];
  /** Event IDs grounding the pattern. */
  events: string[];
  /** If the pattern cites a worldmodel invariant (especially for candidates). */
  cited_invariant?: string;
}

// ─── Rendering Lens (consumed by renderer, per step 6) ─────────────────────

/**
 * A rendering lens: a deterministic transform applied to patterns + a set
 * of voice / vocabulary / framing rules enforced at the renderer.
 *
 * Three parts:
 *   1. primary_frame — the analytical framework the AI is prompted to
 *      reason through when interpreting activity (e.g. the vanguard
 *      three-domain scoring).
 *   2. vocabulary + voice — terms to prefer, terms to avoid, forbidden
 *      phrasings, preferred phrasings, register directives.
 *   3. rewrite + exemplar refs — the pattern-transform function and
 *      pointers to ground-truth reference material for calibration.
 *
 * Guardrails (enforced by the guard engine + the renderer):
 *   - cannot invent new signals
 *   - cannot override evidence
 *   - cannot hallucinate intent
 *   - cannot change what is true; only what is emphasized or framed
 */
export interface RenderingLens {
  name: string;
  description: string;
  /** The primary analytical framework — what the AI reasons through first. */
  primary_frame: PrimaryFrame;
  /** Vocabulary map — generic → lens-native term substitutions. */
  vocabulary: LensVocabulary;
  /** Register, tone, specificity, and other voice-level directives. */
  voice: VoiceDirectives;
  /** Phrasings that fail the renderer if present in output. */
  forbidden_phrases: readonly string[];
  /** Phrasings/patterns the lens prefers — calibration for the renderer. */
  preferred_patterns: readonly string[];
  /**
   * Strategic decision patterns the lens encodes. When the AI proposes a
   * move, these patterns inform how it frames the recommendation.
   */
  strategic_patterns: readonly string[];
  /**
   * Pointers to exemplar reference material — worked examples of this
   * lens's primary_frame being implemented in practice. Used for:
   *   - few-shot grounding in the AI prompt
   *   - voice calibration against ground-truth output
   *   - evaluation baselines for testing the lens's effect
   */
  exemplar_refs: readonly ExemplarRef[];
  /**
   * Pattern-transform function. Takes an ObservedPattern and annotates
   * it with framing / emphasis / compress metadata. Pure function; no
   * side effects; must not change `evidence` or `name`.
   */
  rewrite: (pattern: ObservedPattern) => ObservedPattern;
}

/**
 * The primary analytical framework declared by a lens. For the vanguard
 * lens this is the three-domain scoring (Future Foresight, Narrative
 * Dynamics, Shared Prosperity) with its overlap emergent states.
 *
 * The AI is prompted to reason through this framework first when
 * interpreting activity. It answers the evaluation questions and names
 * which domains are present, which are weak, and which overlaps light up.
 */
export interface PrimaryFrame {
  /** Domain identifiers (kebab-case), e.g. ['future-foresight', 'narrative-dynamics', 'shared-prosperity']. */
  domains: readonly string[];
  /** Named emergent states produced when specific pairs of domains overlap. */
  overlaps: readonly OverlapDef[];
  /** The center identity — what the system becomes when all domains integrate. */
  center_identity: string;
  /** Questions the AI is prompted to answer when applying this frame. */
  evaluation_questions: readonly string[];
  /** Description of how to apply the frame to activity. */
  scoring_rubric: string;
}

export interface OverlapDef {
  /** The two domain identifiers this overlap joins. Order-insensitive. */
  domains: readonly [string, string];
  /** The emergent state the overlap produces (e.g. 'Inspiration'). */
  emergent_state: string;
  /** Short description of what this overlap looks like in practice. */
  description: string;
}

export interface LensVocabulary {
  /** Proper nouns the lens expects to appear verbatim (not paraphrased). */
  proper_nouns: readonly string[];
  /**
   * Generic term → lens-native replacement. The renderer substitutes
   * generic phrasings with lens-native ones. E.g. `'device': 'participant'`.
   */
  preferred: Record<string, string>;
  /** Architectural vocabulary specific to this lens's domain. */
  architecture: readonly string[];
  /** Economic / resource vocabulary specific to this lens's domain. */
  economic: readonly string[];
  /** Framing and mission-level vocabulary for this lens. */
  framing: readonly string[];
  /**
   * System-internal concepts → plain English. Applied to OUTPUT only —
   * before the AI surfaces a description, it must translate any of these
   * terms into their right-column equivalent. Readers don't know Radiant's
   * internal vocabulary; speaking it to them creates false precision.
   *
   * E.g. 'worldmodel' → 'your strategy file', 'candidate pattern' →
   * 'something noticed but not yet tracked by name'.
   */
  jargon_translations: Record<string, string>;
}

export interface VoiceDirectives {
  /** Register in which the lens speaks (e.g. 'diagnosis mode'). */
  register: string;
  /** Active-voice requirement. */
  active_voice: 'required' | 'preferred' | 'flexible';
  /** Specificity requirement — names, numbers, places. */
  specificity: 'required' | 'preferred' | 'flexible';
  /** How the lens treats hype vocabulary. */
  hype_vocabulary: 'forbidden' | 'discouraged' | 'allowed';
  /** How the lens treats hedged / qualified phrasing. */
  hedging: 'forbidden' | 'discouraged' | 'allowed';
  /** Whether playfulness is allowed in this register. */
  playfulness: 'allowed' | 'rare' | 'forbidden';
  /** Whether output should close with a strategic-frame sentence. */
  close_with_strategic_frame: 'preferred' | 'required' | 'optional';
  /** Whether the "punchline move" (rhythm-break emphasis) is sanctioned. */
  punchline_move: 'sparing' | 'frequent' | 'avoided';
  /** Whether the lens requires honesty about what isn't working. */
  honesty_about_failure: 'required' | 'preferred' | 'optional';
  /**
   * Reason-internally / express-externally directive.
   *
   * Some lens frames (like the vanguard three-domain scoring) are
   * model-maker scaffolds — useful for AI reasoning, confusing as
   * reader-facing labels. This directive tells the AI to reason
   * through bucket-level concepts but express findings in the
   * skill-level vocabulary inside each bucket. Bucket names live in
   * `forbidden_phrases` so the renderer enforces the rule at build
   * time; this directive gives the AI the "why" to cooperate
   * upstream of the enforcement.
   */
  output_translation: string;
}

/**
 * Pointer to a reference exemplar — a worked example of this lens's
 * primary_frame being implemented. These live under
 * `src/radiant/examples/<org>/exemplars/`.
 */
export interface ExemplarRef {
  /** Path relative to the exemplars directory. */
  path: string;
  /** Short title for this exemplar. */
  title: string;
  /** Which domains from the primary_frame this exemplar exhibits. */
  exhibits: readonly string[];
  /**
   * Integration quality: 'full' (all domains present + integrated),
   * 'partial' (some domains strong, others absent), 'primary-dominant'
   * (one domain dominates), etc. Free-form.
   */
  integration_quality: string;
  /** Notes about what this exemplar teaches for lens calibration. */
  notes: string;
}
