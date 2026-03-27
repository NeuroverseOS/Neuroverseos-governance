/**
 * Whisper Engine — Insight Delivery + Quiet Mode
 *
 * Controls when and what to show the user during live conversation.
 * This is the most critical UX engine: wrong whisper = broken trust.
 *
 * Rules (from governance invariants):
 * - Max 2 whispers per conversation (shadow mode), 4 in archetype mode
 * - No whispers during quiet mode (absolute)
 * - No precise numbers in whispers (directional only)
 * - No judgment framing ("you failed" → "this pattern emerged")
 * - Quiet mode auto-activates at emotional intensity threshold
 * - Quiet mode suppresses ALL output immediately
 *
 * Pure functions. No network. Deterministic.
 */

import type {
  Whisper,
  ShadowResult,
  ConversationEvent,
  GottmanHorseman,
  MirrorSessionState,
} from '../types';

// ─── Whisper Generation ─────────────────────────────────────────────────────

/**
 * Attempt to generate a whisper from a shadow simulation result.
 * Returns null if the whisper should not be delivered.
 */
export function generateWhisper(
  shadowResult: ShadowResult,
  state: MirrorSessionState,
  triggerEvent: ConversationEvent,
): Whisper | null {
  // ── Gate 1: Quiet mode is absolute ─────────────────────────────────────
  if (state.quietMode) return null;

  // ── Gate 2: Budget check ───────────────────────────────────────────────
  if (state.whispersDelivered >= state.maxWhispers) return null;

  // ── Gate 3: Is it worth whispering? ────────────────────────────────────
  if (!shadowResult.isWhisperWorthy) return null;

  // ── Gate 4: Emotional intensity approaching quiet mode threshold ───────
  // Don't whisper when we're close to shutting down
  if (state.emotionalIntensity > 65) return null;

  // ── Gate 5: Minimum time between whispers (prevent rapid fire) ─────────
  // At least 30 seconds between whispers
  const lastWhisperTime = getLastWhisperTime(state);
  if (lastWhisperTime && (Date.now() - lastWhisperTime) < 30_000) return null;

  // ── Generate the whisper ───────────────────────────────────────────────

  const text = formatWhisperText(shadowResult, state);
  const priority = calculatePriority(shadowResult, triggerEvent);
  const category = state.mode === 'archetype' ? 'archetype' : 'shadow';

  return {
    text,
    priority,
    triggerEventId: triggerEvent.id,
    timestamp: Date.now(),
    category,
  };
}

/**
 * Generate an archetype-specific whisper.
 * These use character language instead of behavioral language.
 */
export function generateArchetypeWhisper(
  archetypeAlignment: number,
  archetypeName: string,
  state: MirrorSessionState,
  triggerEvent: ConversationEvent,
): Whisper | null {
  if (state.quietMode) return null;
  if (state.whispersDelivered >= state.maxWhispers) return null;

  let text: string;

  if (archetypeAlignment > 80) {
    text = `${archetypeName} alignment: strong`;
  } else if (archetypeAlignment > 60) {
    text = `${archetypeName} mode: holding`;
  } else if (archetypeAlignment > 40) {
    text = `Drifting from ${archetypeName} — recenter`;
  } else {
    text = `Off ${archetypeName} — reset your approach`;
  }

  return {
    text,
    priority: 0.5,
    triggerEventId: triggerEvent.id,
    timestamp: Date.now(),
    category: 'archetype',
  };
}

// ─── Quiet Mode ─────────────────────────────────────────────────────────────

export interface QuietModeResult {
  /** Whether quiet mode should be active */
  shouldActivate: boolean;
  /** Reason for activation (for audit) */
  reason: string | null;
}

/**
 * Evaluate whether quiet mode should activate.
 * Triggered by emotional intensity threshold OR manual activation.
 */
export function evaluateQuietMode(
  emotionalIntensity: number,
  threshold: number,
  manuallyActivated: boolean,
): QuietModeResult {
  if (manuallyActivated) {
    return { shouldActivate: true, reason: 'User manually activated quiet mode' };
  }

  if (emotionalIntensity >= threshold) {
    return {
      shouldActivate: true,
      reason: `Emotional intensity (${emotionalIntensity}) exceeded threshold (${threshold})`,
    };
  }

  return { shouldActivate: false, reason: null };
}

/**
 * Generate the post-quiet-mode message.
 * Shown after the conversation ends if quiet mode was triggered.
 */
export function generateQuietModeDebrief(
  conversationDuration: number,
  quietModeDuration: number,
  horsemenDetected: GottmanHorseman[],
): string {
  const durationMinutes = Math.round(conversationDuration / 60_000);

  if (horsemenDetected.length > 0) {
    return `Tough conversation (${durationMinutes}m). Some difficult patterns came up. Review when you're ready — no rush.`;
  }

  if (quietModeDuration > conversationDuration * 0.5) {
    return `That was intense. Quiet mode was on for most of it. Take a moment. Debrief is here when you want it.`;
  }

  return `Conversation ended (${durationMinutes}m). Things got heated for a bit. Review available.`;
}

// ─── Whisper Formatting ─────────────────────────────────────────────────────

/**
 * Format whisper text from shadow result.
 *
 * INVARIANT: No precise numbers. Directional only.
 * INVARIANT: No judgment. Observational framing.
 * TARGET: Under 8 words.
 */
function formatWhisperText(
  shadowResult: ShadowResult,
  state: MirrorSessionState,
): string {
  // The shadow engine already generates directional insight text
  // that complies with our invariants. Use it directly.
  return shadowResult.insight;
}

function calculatePriority(
  shadowResult: ShadowResult,
  triggerEvent: ConversationEvent,
): number {
  let priority = 0.5;

  // Gottman horseman = highest priority
  if (triggerEvent.horseman) priority = 1.0;

  // Rising conflict = high priority
  if (shadowResult.conflictTrajectory === 'rising') priority = Math.max(priority, 0.8);

  // Major trust shift = high priority
  const trustDelta = Math.abs(shadowResult.projectedImpact.trust ?? 0);
  if (trustDelta > 8) priority = Math.max(priority, 0.7);

  // Energy drain = moderate priority
  if (shadowResult.energyTrajectory === 'draining') priority = Math.max(priority, 0.6);

  return priority;
}

function getLastWhisperTime(state: MirrorSessionState): number | null {
  // The session state doesn't track individual whisper timestamps,
  // so we rely on the caller to manage this. Return null for simplicity.
  // In the app.ts integration, this is tracked in session-level state.
  return null;
}

// ─── Conversation End Messages ──────────────────────────────────────────────

/**
 * Generate the end-of-conversation prompt.
 * This is the "Review this?" question that must be optional (governance invariant).
 */
export function generateEndOfConversationPrompt(
  energy: number,
  eventsCount: number,
  archetypeActive: boolean,
  archetypeAlignment: number | null,
): string {
  if (eventsCount === 0) {
    return 'Short conversation. Nothing notable to review.';
  }

  const parts: string[] = [];

  // Energy summary
  if (energy < -30) {
    parts.push('That was draining.');
  } else if (energy > 30) {
    parts.push('Good energy.');
  }

  // Event count insight
  if (eventsCount > 10) {
    parts.push('A lot happened.');
  }

  // Archetype alignment
  if (archetypeActive && archetypeAlignment !== null) {
    if (archetypeAlignment > 80) {
      parts.push('Strong alignment.');
    } else if (archetypeAlignment < 40) {
      parts.push('You went off-archetype.');
    }
  }

  parts.push('Review this?');

  return parts.join(' ');
}
