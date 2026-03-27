/**
 * Debrief Engine — Post-Conversation Review + Classification Correction
 *
 * The debrief is where:
 * 1. The AI asks the user for help classifying ambiguous events
 * 2. The user reviews what happened (timeline view)
 * 3. The user can simulate alternative responses
 * 4. Classification corrections train the per-user model
 *
 * The debrief is ALWAYS optional (governance invariant: debrief_never_forced).
 *
 * Pure functions. No network. Deterministic.
 */

import type {
  ConversationEvent,
  ConversationEventType,
  DebriefQuestion,
  DebriefOption,
  DebriefResult,
  BehavioralProfile,
  Contact,
} from '../types';
import { aggregateEventDeltas } from './reputation-engine';

// ─── Debrief Question Generation ────────────────────────────────────────────

/**
 * Generate debrief questions from conversation events.
 *
 * Questions are only generated for:
 * 1. Low-confidence classifications (confidence < 0.6)
 * 2. Events flagged as needing confirmation (phase 3 patterns)
 * 3. Ambiguous events where context matters (sarcasm, tone-dependent)
 *
 * Over time, as the user corrects classifications, the threshold
 * adjusts per-user so fewer questions are asked.
 */
export function generateDebriefQuestions(
  events: ConversationEvent[],
  maxQuestions: number = 5,
): DebriefQuestion[] {
  const needsConfirmation = events
    .filter(e => e.needsConfirmation || e.confidence < 0.6)
    .sort((a, b) => a.confidence - b.confidence) // Least confident first
    .slice(0, maxQuestions);

  return needsConfirmation.map(event => ({
    eventId: event.id,
    question: formatQuestion(event),
    options: generateOptions(event),
    systemClassification: event.type,
  }));
}

function formatQuestion(event: ConversationEvent): string {
  const who = event.speaker === 'user' ? 'You' : 'They';
  const time = formatTimestamp(event.timestamp);
  const shortTranscript = event.transcript.length > 60
    ? event.transcript.substring(0, 57) + '...'
    : event.transcript;

  return `${who} said: "${shortTranscript}" (${time}). How did you mean it?`;
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function generateOptions(event: ConversationEvent): DebriefOption[] {
  // Start with what the system classified it as
  const systemLabel = EVENT_LABELS[event.type] ?? event.type;

  // Generate alternative interpretations based on event type
  const alternatives = getAlternativeClassifications(event.type);

  const options: DebriefOption[] = [
    { label: `${systemLabel} (system's guess)`, value: event.type },
    ...alternatives.map(alt => ({
      label: EVENT_LABELS[alt] ?? alt,
      value: alt,
    })),
    { label: 'Skip this one', value: 'skip' },
  ];

  return options;
}

// ─── Alternative Classification Map ─────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  disagreement: 'Genuine disagreement',
  agreement: 'Real agreement',
  question: 'Honest question',
  interruption: 'Interruption',
  silence: 'Intentional pause',
  escalation: 'Things got heated',
  de_escalation: 'Cooling things down',
  decision_proposal: 'Making a decision',
  concession: 'Giving in',
  redirect: 'Changing the subject',
  emotional_spike: 'Emotional moment',
  negotiation: 'Back-and-forth negotiation',
  vulnerability: 'Opening up',
  humor: 'Just joking',
  praise: 'Giving praise',
  criticism_event: 'Delivering criticism',
  sarcasm: 'Being sarcastic',
  passive_aggression: 'Passive aggressive',
};

/**
 * Get plausible alternative classifications for an event type.
 * These represent common misclassification pairs.
 */
function getAlternativeClassifications(
  type: ConversationEventType,
): ConversationEventType[] {
  const alternatives: Record<string, ConversationEventType[]> = {
    disagreement: ['negotiation', 'question', 'sarcasm'],
    agreement: ['concession', 'sarcasm', 'passive_aggression'],
    escalation: ['emotional_spike', 'humor', 'disagreement'],
    silence: ['de_escalation', 'emotional_spike'],
    concession: ['agreement', 'de_escalation', 'passive_aggression'],
    redirect: ['de_escalation', 'concession'],
    criticism_event: ['disagreement', 'negotiation', 'humor'],
    vulnerability: ['emotional_spike', 'de_escalation'],
    sarcasm: ['humor', 'agreement', 'passive_aggression'],
    praise: ['sarcasm', 'agreement'],
  };

  return alternatives[type] ?? ['unknown'];
}

// ─── Debrief Processing ─────────────────────────────────────────────────────

/**
 * Process user corrections from debrief and recalculate behavioral deltas.
 *
 * When a user corrects a classification:
 * 1. The original event's impact is reversed
 * 2. The corrected event type's impact is applied
 * 3. Net delta = corrected impact - original impact
 */
export function processDebriefCorrections(
  originalEvents: ConversationEvent[],
  corrections: Array<{
    eventId: string;
    userCorrection: ConversationEventType;
  }>,
): {
  adjustedEvents: ConversationEvent[];
  adjustedDeltas: Partial<BehavioralProfile>;
  correctionCount: number;
} {
  // Build a map of corrections
  const correctionMap = new Map(
    corrections
      .filter(c => c.userCorrection !== 'skip' as ConversationEventType)
      .map(c => [c.eventId, c.userCorrection]),
  );

  // Apply corrections to events
  const adjustedEvents = originalEvents.map(event => {
    const correction = correctionMap.get(event.id);
    if (!correction) return event;

    // Reclassify the event
    return {
      ...event,
      type: correction,
      confidence: 1.0, // User-confirmed = max confidence
      needsConfirmation: false,
      impact: getDefaultImpact(correction),
    };
  });

  // Recalculate deltas with corrected events
  const adjustedDeltas = aggregateEventDeltas(adjustedEvents);

  return {
    adjustedEvents,
    adjustedDeltas,
    correctionCount: correctionMap.size,
  };
}

/**
 * Default impact values per event type.
 * Used when reclassifying events during debrief corrections.
 */
function getDefaultImpact(
  type: ConversationEventType,
): Partial<Record<keyof BehavioralProfile, number>> {
  const impacts: Record<string, Partial<Record<keyof BehavioralProfile, number>>> = {
    disagreement: { trust: -3, conflictRisk: 8, assertiveness: 5 },
    agreement: { trust: 2, empathy: 1, conflictRisk: -3 },
    question: { openness: 2, influence: 1 },
    interruption: { trust: -3, empathy: -2, conflictRisk: 5 },
    silence: { composure: 2, openness: 1 },
    escalation: { volatility: 10, conflictRisk: 15, trust: -5, composure: -8 },
    de_escalation: { composure: 5, trust: 3, conflictRisk: -8, volatility: -5 },
    decision_proposal: { assertiveness: 5, influence: 3 },
    concession: { trust: 3, empathy: 2, assertiveness: -3, conflictRisk: -5 },
    redirect: { influence: 2, openness: -2 },
    praise: { trust: 4, empathy: 3, composure: 2 },
    vulnerability: { trust: 5, empathy: 4, openness: 3, assertiveness: -2 },
    criticism_event: { trust: -5, empathy: -3, conflictRisk: 10, volatility: 5 },
    emotional_spike: { volatility: 8, composure: -5 },
    humor: { trust: 2, composure: 3, conflictRisk: -3 },
    negotiation: { influence: 3, assertiveness: 3, trust: 1 },
    sarcasm: { trust: -2, empathy: -1, volatility: 3 },
    passive_aggression: { trust: -4, empathy: -3, conflictRisk: 8, volatility: 5 },
  };

  return impacts[type] ?? {};
}

// ─── Timeline Generation ────────────────────────────────────────────────────

export interface TimelineEntry {
  timestamp: number;
  formattedTime: string;
  speaker: 'user' | 'other';
  transcript: string;
  eventType: ConversationEventType;
  isHighlight: boolean;
  highlightReason: string | null;
  impact: Partial<Record<keyof BehavioralProfile, number>>;
}

/**
 * Generate a timeline view of the conversation for debrief.
 * Highlights key moments that had significant behavioral impact.
 */
export function generateTimeline(
  events: ConversationEvent[],
): TimelineEntry[] {
  const avgIntensity = events.length > 0
    ? events.reduce((sum, e) => sum + e.intensity, 0) / events.length
    : 0;

  return events.map(event => {
    const isHighlight = event.intensity > avgIntensity * 1.5 ||
                        event.horseman !== undefined ||
                        Math.abs(event.impact.trust ?? 0) > 5 ||
                        Math.abs(event.impact.conflictRisk ?? 0) > 10;

    let highlightReason: string | null = null;
    if (isHighlight) {
      if (event.horseman) {
        highlightReason = `${event.horseman.horseman} detected`;
      } else if (Math.abs(event.impact.trust ?? 0) > 5) {
        highlightReason = (event.impact.trust ?? 0) > 0 ? 'Trust building' : 'Trust erosion';
      } else if ((event.impact.conflictRisk ?? 0) > 10) {
        highlightReason = 'Conflict escalation';
      } else {
        highlightReason = 'High intensity moment';
      }
    }

    return {
      timestamp: event.timestamp,
      formattedTime: formatTimestamp(event.timestamp),
      speaker: event.speaker,
      transcript: event.transcript,
      eventType: event.type,
      isHighlight,
      highlightReason,
      impact: event.impact,
    };
  });
}

// ─── Simulation (Debrief Replay) ────────────────────────────────────────────

export interface SimulationScenario {
  /** Original event being simulated */
  originalEvent: ConversationEvent;
  /** Alternative response the user wants to try */
  alternativeResponse: string;
  /** What category the alternative falls into */
  alternativeType: ConversationEventType;
  /** Projected impact of the alternative */
  alternativeImpact: Partial<Record<keyof BehavioralProfile, number>>;
  /** Comparison: alternative impact vs original impact */
  comparison: {
    dimension: keyof BehavioralProfile;
    original: number;
    alternative: number;
    difference: number;
    direction: 'better' | 'worse' | 'neutral';
  }[];
}

/**
 * Simulate an alternative response to a conversation event.
 * "What if you had said this instead?"
 *
 * The comparison shows the behavioral delta difference.
 */
export function simulateAlternative(
  originalEvent: ConversationEvent,
  alternativeType: ConversationEventType,
  alternativeResponse: string,
): SimulationScenario {
  const alternativeImpact = getDefaultImpact(alternativeType);

  const comparison: SimulationScenario['comparison'] = [];

  // Compare each dimension
  const dimensions: (keyof BehavioralProfile)[] = [
    'trust', 'composure', 'influence', 'empathy',
    'volatility', 'assertiveness', 'openness', 'conflictRisk',
  ];

  for (const dim of dimensions) {
    const original = originalEvent.impact[dim] ?? 0;
    const alternative = alternativeImpact[dim] ?? 0;
    const difference = alternative - original;

    if (Math.abs(difference) < 0.5) continue; // Skip negligible differences

    // For volatility and conflictRisk, lower is better
    const isInverse = dim === 'volatility' || dim === 'conflictRisk';
    const direction: 'better' | 'worse' | 'neutral' =
      Math.abs(difference) < 1 ? 'neutral' :
      isInverse ? (difference < 0 ? 'better' : 'worse') :
      (difference > 0 ? 'better' : 'worse');

    comparison.push({
      dimension: dim,
      original,
      alternative,
      difference: Math.round(difference * 10) / 10,
      direction,
    });
  }

  return {
    originalEvent,
    alternativeResponse,
    alternativeType,
    alternativeImpact,
    comparison,
  };
}

/**
 * Generate a summary of the simulation comparison.
 * Human-readable sentence for the whisper overlay.
 */
export function summarizeSimulation(scenario: SimulationScenario): string {
  const betterDimensions = scenario.comparison
    .filter(c => c.direction === 'better')
    .map(c => c.dimension);

  const worseDimensions = scenario.comparison
    .filter(c => c.direction === 'worse')
    .map(c => c.dimension);

  if (betterDimensions.length === 0 && worseDimensions.length === 0) {
    return 'Similar outcome either way.';
  }

  const parts: string[] = [];

  if (betterDimensions.length > 0) {
    parts.push(`Better for ${betterDimensions.join(', ')}`);
  }
  if (worseDimensions.length > 0) {
    parts.push(`Worse for ${worseDimensions.join(', ')}`);
  }

  return parts.join('. ') + '.';
}
