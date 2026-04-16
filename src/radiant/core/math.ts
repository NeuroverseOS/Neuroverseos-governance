/**
 * @neuroverseos/governance/radiant — L / C / N / R scoring math
 *
 * Presence-based averaging over asymmetric Life and Cyber capability spaces.
 * No weights. No coefficients. Silence is never scored as neutral.
 *
 * Implements the Universal Math section of radiant/PROJECT-PLAN.md.
 * The canonical formulas live there; this file is their runtime.
 */

import {
  DEFAULT_EVIDENCE_GATE,
  isScored,
  type BridgingComponentScore,
  type CyberCapability,
  type EvidenceGate,
  type LifeCapability,
  type Score,
  type ScoredObservation,
} from '../types';

// ─── Presence rule ─────────────────────────────────────────────────────────

/**
 * A dimension or bridging component is present iff
 *   event_count >= k  AND  confidence >= c.
 *
 * Absent items are excluded from averages — never zero-scored.
 */
export function isPresent(
  o: Pick<ScoredObservation, 'eventCount' | 'confidence'>,
  gate: EvidenceGate = DEFAULT_EVIDENCE_GATE,
): boolean {
  return o.eventCount >= gate.k && o.confidence >= gate.c;
}

// ─── Presence-based average ────────────────────────────────────────────────

/**
 * Average the scores of items that pass the presence gate. Returns
 * INSUFFICIENT_EVIDENCE if none pass.
 *
 * This is the single averaging primitive — all entity scores (L, C, N) and
 * the composite R are built from it.
 */
export function presenceAverage(
  items: ReadonlyArray<ScoredObservation>,
  gate: EvidenceGate = DEFAULT_EVIDENCE_GATE,
): Score {
  const present = items.filter((i) => isPresent(i, gate));
  if (present.length === 0) return 'INSUFFICIENT_EVIDENCE';
  const sum = present.reduce((acc, i) => acc + i.score, 0);
  return sum / present.length;
}

// ─── Entity scorers ────────────────────────────────────────────────────────

/**
 * Life gyroscope score. Averages over present life-native dimensions.
 *
 *   Pure cognition team (only COG present) → L = score(COG) — full 0–100.
 *   All three active → L = avg(COG, CRE, SEN).
 *   No dimension present → L = INSUFFICIENT_EVIDENCE.
 */
export function scoreLife(
  capability: LifeCapability,
  gate: EvidenceGate = DEFAULT_EVIDENCE_GATE,
): Score {
  return presenceAverage(capability.dimensions, gate);
}

/**
 * Cyber gyroscope score. Averages over present cyber-native dimensions.
 *
 * Same shape as scoreLife, but operates on a distinct (asymmetric) dimension
 * set. A human exercising COG while an AI exercises AR are both fully
 * engaged — neither is "off," and this math does not force symmetry.
 */
export function scoreCyber(
  capability: CyberCapability,
  gate: EvidenceGate = DEFAULT_EVIDENCE_GATE,
): Score {
  return presenceAverage(capability.dimensions, gate);
}

/**
 * NeuroVerse coherence. Translation quality through open corridors.
 *
 *   No worldmodel loaded → UNAVAILABLE. There is no shared universe for the
 *     gyroscopes to register against; coherence is undefined, not zero.
 *   Worldmodel loaded, no corridor-opening evidence passes the gate →
 *     INSUFFICIENT_EVIDENCE.
 *   Otherwise → presence-average over the four bridging components.
 *
 * High L and high C can still produce low N: two excellent intelligences
 * working past each other without opening a corridor score low. That is
 * the correct behavior — N is not synchronization.
 */
export function scoreNeuroVerse(
  components: ReadonlyArray<BridgingComponentScore>,
  worldmodelLoaded: boolean,
  gate: EvidenceGate = DEFAULT_EVIDENCE_GATE,
): Score {
  if (!worldmodelLoaded) return 'UNAVAILABLE';
  return presenceAverage(components, gate);
}

/**
 * Composite alignment. Averages over whichever entity alignments are
 * available, excluding any in INSUFFICIENT_EVIDENCE or UNAVAILABLE.
 *
 *   All-human deployment (A_C unavailable) → R = A_L.
 *   All-AI pipeline (A_L unavailable) → R = A_C.
 *   Hybrid with worldmodel loaded → R = avg(A_L, A_C, A_N).
 *   Nothing available → R = INSUFFICIENT_EVIDENCE.
 *
 * Sentinels are excluded, not zeroed. A missing entity does not drag R down.
 */
export function scoreComposite(a_L: Score, a_C: Score, a_N: Score): Score {
  const available: number[] = [];
  if (isScored(a_L)) available.push(a_L);
  if (isScored(a_C)) available.push(a_C);
  if (isScored(a_N)) available.push(a_N);
  if (available.length === 0) return 'INSUFFICIENT_EVIDENCE';
  return available.reduce((a, b) => a + b, 0) / available.length;
}
