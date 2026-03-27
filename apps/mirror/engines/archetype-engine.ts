/**
 * Archetype Engine — Identity Training and Alignment Scoring
 *
 * Scores how well the user's conversational behavior aligns with their
 * chosen archetype. Archetypes are contextual — the user can set different
 * archetypes for different contacts.
 *
 * Scoring is event-based: aligned events boost score, misaligned events
 * reduce it. Context sensitivity means the system won't penalize behavior
 * that's appropriate for the situation even if it's "off-archetype."
 *
 * Pure functions. No network. Deterministic.
 */

import type {
  ArchetypeId,
  ArchetypeDefinition,
  ConversationEvent,
  BehavioralProfile,
  ConversationEventType,
} from '../types';
import { ARCHETYPES } from '../types';

// ─── Alignment Scoring ──────────────────────────────────────────────────────

export interface AlignmentResult {
  /** Current alignment score (0-100) */
  score: number;
  /** Breakdown of what helped and what hurt */
  strengths: string[];
  /** Moments where the user broke archetype */
  breakpoints: string[];
  /** Per-event alignment deltas */
  eventScores: Array<{
    eventId: string;
    delta: number;
    reason: string;
  }>;
}

/**
 * Score archetype alignment from a list of conversation events.
 *
 * Algorithm:
 * 1. Start at 50 (neutral)
 * 2. Each aligned event adds points (weighted by archetype reward config)
 * 3. Each misaligned event subtracts points
 * 4. Context-sensitive: if a misaligned event was clearly necessary
 *    (e.g., being direct when directness was needed), reduce penalty
 * 5. Final score clamped to 0-100
 */
export function scoreAlignment(
  archetypeId: ArchetypeId,
  events: ConversationEvent[],
  contextualOverrides: Set<string> = new Set(),
): AlignmentResult {
  const archetype = ARCHETYPES[archetypeId];
  let score = 50; // Start neutral
  const strengths: string[] = [];
  const breakpoints: string[] = [];
  const eventScores: AlignmentResult['eventScores'] = [];

  for (const event of events) {
    // Skip low-confidence events — don't score what we're not sure about
    if (event.confidence < 0.6) continue;

    // Only score user events (not the other person's behavior)
    if (event.speaker !== 'user') continue;

    const isAligned = archetype.alignedEvents.includes(event.type);
    const isMisaligned = archetype.misalignedEvents.includes(event.type);

    if (isAligned) {
      const delta = calculateAlignedDelta(archetype, event);
      score += delta;
      eventScores.push({
        eventId: event.id,
        delta,
        reason: `${formatEventType(event.type)} aligns with ${archetype.name}`,
      });
      strengths.push(describeStrength(archetype, event));
    } else if (isMisaligned) {
      // Check for contextual override
      const isOverridden = contextualOverrides.has(event.id) ||
                           isContextuallyAppropriate(event, events);

      if (isOverridden && archetype.contextSensitive) {
        // Reduced penalty for contextually appropriate behavior
        const delta = -1; // Minimal penalty
        score += delta;
        eventScores.push({
          eventId: event.id,
          delta,
          reason: `${formatEventType(event.type)} breaks ${archetype.name} but was contextually appropriate`,
        });
      } else {
        const delta = calculateMisalignedDelta(archetype, event);
        score += delta;
        eventScores.push({
          eventId: event.id,
          delta,
          reason: `${formatEventType(event.type)} breaks ${archetype.name} alignment`,
        });
        breakpoints.push(describeBreakpoint(archetype, event));
      }
    }
    // Neutral events (not in either list) don't affect score
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    strengths,
    breakpoints,
    eventScores,
  };
}

// ─── Delta Calculation ──────────────────────────────────────────────────────

function calculateAlignedDelta(
  archetype: ArchetypeDefinition,
  event: ConversationEvent,
): number {
  // Base reward: 5 points per aligned event
  let delta = 5;

  // Bonus for high-intensity aligned events (really leaning into the archetype)
  delta += event.intensity * 3;

  // Bonus for high-confidence detection
  delta += (event.confidence - 0.6) * 5;

  return Math.round(delta * 10) / 10;
}

function calculateMisalignedDelta(
  archetype: ArchetypeDefinition,
  event: ConversationEvent,
): number {
  // Base penalty: -4 points per misaligned event
  let delta = -4;

  // Worse for high-intensity misalignment (really going off-archetype)
  delta -= event.intensity * 3;

  return Math.round(delta * 10) / 10;
}

// ─── Context Sensitivity ────────────────────────────────────────────────────

/**
 * Determine if a misaligned event was contextually appropriate.
 *
 * Examples:
 * - Being direct (misaligned for Ambassador) when the other person
 *   escalated first → contextually appropriate
 * - Staying silent (misaligned for Provocateur) when the other person
 *   is stonewalling → contextually appropriate
 */
function isContextuallyAppropriate(
  event: ConversationEvent,
  allEvents: ConversationEvent[],
): boolean {
  const eventIndex = allEvents.indexOf(event);
  if (eventIndex <= 0) return false;

  // Look at the event immediately before this one
  const precedingEvent = allEvents[eventIndex - 1];

  // If the other person escalated and the user responded firmly, that's okay
  if (
    precedingEvent.speaker === 'other' &&
    precedingEvent.type === 'escalation' &&
    (event.type === 'disagreement' || event.type === 'decision_proposal')
  ) {
    return true;
  }

  // If the other person is stonewalling and the user goes silent, that's okay
  if (
    precedingEvent.speaker === 'other' &&
    precedingEvent.horseman?.horseman === 'stonewalling' &&
    event.type === 'silence'
  ) {
    return true;
  }

  // If someone asked a direct question and user gave a direct answer, that's okay
  if (
    precedingEvent.speaker === 'other' &&
    precedingEvent.type === 'question' &&
    (event.type === 'disagreement' || event.type === 'decision_proposal')
  ) {
    return true;
  }

  return false;
}

// ─── Description Generation ─────────────────────────────────────────────────

function formatEventType(type: ConversationEventType): string {
  const labels: Record<string, string> = {
    disagreement: 'Pushing back',
    agreement: 'Aligning',
    question: 'Asking a question',
    interruption: 'Interrupting',
    silence: 'Staying silent',
    escalation: 'Escalating',
    de_escalation: 'De-escalating',
    decision_proposal: 'Proposing a direction',
    concession: 'Yielding ground',
    redirect: 'Redirecting',
    praise: 'Giving praise',
    vulnerability: 'Opening up',
    criticism_event: 'Delivering criticism',
    emotional_spike: 'Emotional spike',
    humor: 'Using humor',
    negotiation: 'Negotiating',
    sarcasm: 'Being sarcastic',
    passive_aggression: 'Passive aggression',
  };
  return labels[type] ?? type;
}

function describeStrength(
  archetype: ArchetypeDefinition,
  event: ConversationEvent,
): string {
  return `${formatEventType(event.type)} — ${archetype.name} move`;
}

function describeBreakpoint(
  archetype: ArchetypeDefinition,
  event: ConversationEvent,
): string {
  return `${formatEventType(event.type)} — broke ${archetype.name} alignment`;
}

// ─── Streak Management ──────────────────────────────────────────────────────

/**
 * Update streak count based on alignment result.
 * Streak breaks at first conversation below 80% alignment.
 */
export function updateStreak(
  currentStreak: number,
  alignmentScore: number,
  threshold: number = 80,
): { streak: number; streakBroken: boolean } {
  if (alignmentScore >= threshold) {
    return { streak: currentStreak + 1, streakBroken: false };
  }
  return { streak: 0, streakBroken: currentStreak > 0 };
}

/**
 * Generate a streak message for the user.
 */
export function getStreakMessage(
  archetypeId: ArchetypeId,
  streak: number,
): string | null {
  const archetype = ARCHETYPES[archetypeId];
  if (streak === 0) return null;
  if (streak === 1) return `First ${archetype.name} conversation locked in.`;
  if (streak < 5) return `${streak} conversations as ${archetype.name}. Building consistency.`;
  if (streak < 10) return `${streak}-conversation ${archetype.name} streak. You're training this.`;
  return `${streak}-conversation ${archetype.name} streak. This is who you are now.`;
}

// ─── Archetype Summary ──────────────────────────────────────────────────────

export interface ArchetypeSummary {
  archetypeId: ArchetypeId;
  name: string;
  tagline: string;
  score: number;
  strengths: string[];
  breakpoints: string[];
  streak: number;
  streakMessage: string | null;
}

/**
 * Generate a full archetype summary for end-of-conversation display.
 */
export function generateSummary(
  archetypeId: ArchetypeId,
  events: ConversationEvent[],
  currentStreak: number,
): ArchetypeSummary {
  const archetype = ARCHETYPES[archetypeId];
  const alignment = scoreAlignment(archetypeId, events);
  const { streak } = updateStreak(currentStreak, alignment.score);
  const streakMessage = getStreakMessage(archetypeId, streak);

  return {
    archetypeId,
    name: archetype.name,
    tagline: archetype.tagline,
    score: alignment.score,
    strengths: alignment.strengths.slice(0, 3), // Top 3
    breakpoints: alignment.breakpoints.slice(0, 3), // Top 3
    streak,
    streakMessage,
  };
}
