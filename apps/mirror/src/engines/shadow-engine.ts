/**
 * Shadow Simulation Engine — Real-Time Consequence Prediction
 *
 * "What happens if you keep going like this?"
 *
 * Takes the current conversation state (recent events, behavioral deltas,
 * ego states) and projects forward to predict consequences.
 *
 * Output is DIRECTIONAL, not precise. "Trust dropping" not "trust: -8".
 * This is a design invariant enforced by the governance world.
 *
 * Pure functions. No network. Deterministic.
 */

import type {
  ConversationEvent,
  BehavioralProfile,
  ShadowResult,
  EgoState,
  GottmanHorseman,
} from '../types.js';

// ─── Trajectory Calculation ─────────────────────────────────────────────────

interface ConversationContext {
  /** Recent events in this conversation */
  events: ConversationEvent[];
  /** Current session behavioral deltas */
  sessionDeltas: Partial<BehavioralProfile>;
  /** Current conflict risk (0-100) */
  conflictRisk: number;
  /** Current emotional intensity (0-100) */
  emotionalIntensity: number;
  /** User ego state */
  userEgoState: EgoState;
  /** Other ego state */
  otherEgoState: EgoState;
  /** Active Gottman horseman (if any) */
  activeHorseman: GottmanHorseman | null;
  /** Conversation energy */
  energy: number;
}

/**
 * Run a shadow simulation on the current conversation state.
 *
 * Projects the behavioral trajectory forward based on:
 * - Recent event patterns (last 5 events weighted by recency)
 * - Current ego state dynamics
 * - Gottman horseman presence
 * - Conflict risk trajectory
 */
export function runShadow(ctx: ConversationContext): ShadowResult {
  const recentEvents = ctx.events.slice(-5);

  // ── Project behavioral impact ──────────────────────────────────────────

  const projectedImpact: Partial<BehavioralProfile> = {};

  // Aggregate recent event impacts with recency weighting
  for (let i = 0; i < recentEvents.length; i++) {
    const weight = (i + 1) / recentEvents.length; // More recent = higher weight
    const event = recentEvents[i];

    for (const [dim, delta] of Object.entries(event.impact)) {
      const key = dim as keyof BehavioralProfile;
      projectedImpact[key] = (projectedImpact[key] ?? 0) + (delta as number) * weight;
    }
  }

  // ── Ego state dynamics modifier ────────────────────────────────────────

  const egoModifier = calculateEgoStateModifier(ctx.userEgoState, ctx.otherEgoState);
  if (egoModifier.trust !== 0) {
    projectedImpact.trust = (projectedImpact.trust ?? 0) + egoModifier.trust;
  }
  if (egoModifier.conflictRisk !== 0) {
    projectedImpact.conflictRisk = (projectedImpact.conflictRisk ?? 0) + egoModifier.conflictRisk;
  }

  // ── Gottman horseman amplifier ─────────────────────────────────────────

  if (ctx.activeHorseman) {
    const horsemanMultiplier = ctx.activeHorseman === 'contempt' ? 1.5 : 1.2;
    if (projectedImpact.trust) {
      projectedImpact.trust *= horsemanMultiplier;
    }
    if (projectedImpact.conflictRisk) {
      projectedImpact.conflictRisk *= horsemanMultiplier;
    }
  }

  // ── Determine trajectories ─────────────────────────────────────────────

  const conflictTrajectory = determineTrajectory(
    recentEvents.map(e => e.impact.conflictRisk ?? 0),
  );

  const energyTrajectory = determineEnergyTrajectory(ctx.energy, recentEvents);

  // ── Generate directional insight ───────────────────────────────────────

  const insight = generateInsight(
    projectedImpact,
    conflictTrajectory,
    energyTrajectory,
    ctx.activeHorseman,
    ctx.userEgoState,
    ctx.otherEgoState,
  );

  // ── Determine if this is worth whispering ──────────────────────────────

  const isWhisperWorthy = evaluateWhisperWorthiness(
    projectedImpact,
    conflictTrajectory,
    ctx.emotionalIntensity,
    ctx.activeHorseman,
    recentEvents,
  );

  return {
    projectedImpact,
    insight,
    isWhisperWorthy,
    conflictTrajectory,
    energyTrajectory,
  };
}

// ─── Ego State Dynamics ─────────────────────────────────────────────────────

function calculateEgoStateModifier(
  userState: EgoState,
  otherState: EgoState,
): { trust: number; conflictRisk: number } {
  // Adult ↔ Adult = healthiest pattern
  if (userState === 'adult' && otherState === 'adult') {
    return { trust: 3, conflictRisk: -5 };
  }

  // Parent ↔ Child = conflict-prone in professional contexts
  if (
    (userState === 'parent' && otherState === 'child') ||
    (userState === 'child' && otherState === 'parent')
  ) {
    return { trust: -2, conflictRisk: 10 };
  }

  // Parent ↔ Parent = power struggle
  if (userState === 'parent' && otherState === 'parent') {
    return { trust: -4, conflictRisk: 15 };
  }

  // Child ↔ Child = unproductive
  if (userState === 'child' && otherState === 'child') {
    return { trust: 0, conflictRisk: 5 };
  }

  return { trust: 0, conflictRisk: 0 };
}

// ─── Trajectory Determination ───────────────────────────────────────────────

function determineTrajectory(
  values: number[],
): 'rising' | 'stable' | 'falling' {
  if (values.length < 2) return 'stable';

  const recentHalf = values.slice(-Math.ceil(values.length / 2));
  const olderHalf = values.slice(0, Math.floor(values.length / 2));

  const recentAvg = recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length;
  const olderAvg = olderHalf.length > 0
    ? olderHalf.reduce((a, b) => a + b, 0) / olderHalf.length
    : 0;

  const delta = recentAvg - olderAvg;

  if (delta > 2) return 'rising';
  if (delta < -2) return 'falling';
  return 'stable';
}

function determineEnergyTrajectory(
  currentEnergy: number,
  recentEvents: ConversationEvent[],
): 'energizing' | 'neutral' | 'draining' {
  // Positive events energize, negative drain
  const energySignals = recentEvents.map(e => {
    const trust = e.impact.trust ?? 0;
    const empathy = e.impact.empathy ?? 0;
    const conflictRisk = e.impact.conflictRisk ?? 0;
    const volatility = e.impact.volatility ?? 0;
    return trust + empathy - conflictRisk * 0.5 - volatility * 0.3;
  });

  const avgSignal = energySignals.length > 0
    ? energySignals.reduce((a, b) => a + b, 0) / energySignals.length
    : 0;

  if (avgSignal > 2) return 'energizing';
  if (avgSignal < -2) return 'draining';
  return 'neutral';
}

// ─── Insight Generation ─────────────────────────────────────────────────────

/**
 * Generate directional insight text.
 *
 * RULES (from governance invariant: no_false_precision):
 * - Never use precise numbers
 * - Use weather/environmental metaphors
 * - Keep it under 10 words
 * - Actionable when possible
 */
function generateInsight(
  impact: Partial<BehavioralProfile>,
  conflictTrajectory: 'rising' | 'stable' | 'falling',
  energyTrajectory: 'energizing' | 'neutral' | 'draining',
  horseman: GottmanHorseman | null,
  userEgo: EgoState,
  otherEgo: EgoState,
): string {
  // Highest priority: Gottman horseman
  if (horseman) {
    switch (horseman) {
      case 'contempt':
        return 'Dangerous territory — pull back now';
      case 'criticism':
        return 'This feels like an attack — try a question';
      case 'defensiveness':
        return 'Walls going up — acknowledge first';
      case 'stonewalling':
        return 'They\'re shutting down — give space';
    }
  }

  // High priority: ego state mismatch
  if (userEgo === 'parent' && otherEgo === 'child') {
    return 'You\'re lecturing — try a question instead';
  }
  if (userEgo === 'parent' && otherEgo === 'parent') {
    return 'Power struggle forming — shift to curiosity';
  }

  // Conflict trajectory
  if (conflictTrajectory === 'rising') {
    const conflictDelta = impact.conflictRisk ?? 0;
    if (conflictDelta > 15) return 'Conflict rising fast — soften your approach';
    return 'Temperature rising — stay composed';
  }

  // Trust trajectory
  const trustDelta = impact.trust ?? 0;
  if (trustDelta < -8) return 'Trust eroding — slow down';
  if (trustDelta > 8) return 'Building trust — keep this energy';

  // Energy
  if (energyTrajectory === 'draining') {
    return 'This is draining — consider wrapping up';
  }
  if (energyTrajectory === 'energizing') {
    return 'Good energy here — lean in';
  }

  // Composure
  const composureDelta = impact.composure ?? 0;
  if (composureDelta < -5) return 'You\'re tensing up — breathe';

  // Stable state
  if (conflictTrajectory === 'falling') {
    return 'Cooling down — good direction';
  }

  return 'Steady — nothing to flag';
}

// ─── Whisper Worthiness ─────────────────────────────────────────────────────

/**
 * Determine if the current shadow result is worth delivering as a whisper.
 *
 * A whisper must be:
 * 1. High impact (something important is happening)
 * 2. Actionable (user can do something about it)
 * 3. Not repetitive (don't say the same thing twice)
 */
function evaluateWhisperWorthiness(
  impact: Partial<BehavioralProfile>,
  conflictTrajectory: 'rising' | 'stable' | 'falling',
  emotionalIntensity: number,
  horseman: GottmanHorseman | null,
  recentEvents: ConversationEvent[],
): boolean {
  // Always whisper-worthy: Gottman horseman detected
  if (horseman) return true;

  // Always whisper-worthy: conflict rising rapidly
  if (conflictTrajectory === 'rising' && (impact.conflictRisk ?? 0) > 10) {
    return true;
  }

  // Always whisper-worthy: major trust shift
  const trustDelta = Math.abs(impact.trust ?? 0);
  if (trustDelta > 8) return true;

  // Not worthy: emotional intensity too high (approaching quiet mode)
  if (emotionalIntensity > 65) return false;

  // Not worthy: nothing significant happening
  const totalImpact = Object.values(impact).reduce(
    (sum, v) => sum + Math.abs(v ?? 0),
    0,
  );
  if (totalImpact < 10) return false;

  // Moderate impact — worth it if there's a clear trend
  return conflictTrajectory !== 'stable';
}
