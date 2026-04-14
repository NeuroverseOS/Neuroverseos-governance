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
