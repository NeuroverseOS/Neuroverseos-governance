/**
 * Reputation Engine — Behavioral Profile Tracking with Decay
 *
 * Tracks per-contact behavioral profiles across conversations.
 * Uses weighted exponential decay with dimension-specific half-lives.
 *
 * Decay formula: value(t) = baseline + (value - baseline) * e^(-λt)
 * where λ = ln(2) / half_life_ms
 *
 * Inspired by social credit decay curves (weighted exponential decay)
 * adapted for interpersonal behavioral tracking without authoritarian context.
 *
 * Pure functions. No network. Deterministic given same inputs + timestamps.
 */

import type {
  BehavioralProfile,
  Contact,
  ConversationEvent,
  ConversationSummary,
  DecayConfig,
  PreBrief,
} from '../types';
import { DECAY_CONFIG, DEFAULT_BEHAVIORAL_PROFILE } from '../types';

// ─── Decay Mathematics ──────────────────────────────────────────────────────

/**
 * Apply exponential decay to a single dimension value.
 *
 * value(t) = baseline + (currentValue - baseline) * e^(-λ * elapsedMs)
 * where λ = ln(2) / halfLifeMs
 *
 * This means:
 * - After 1 half-life, the value is halfway back to baseline
 * - After 2 half-lives, it's 75% back
 * - After 5 half-lives, it's ~97% back (effectively reset)
 */
export function applyDecay(
  currentValue: number,
  config: DecayConfig,
  elapsedMs: number,
): number {
  if (elapsedMs <= 0) return currentValue;

  const lambda = Math.LN2 / config.halfLifeMs;
  const decayFactor = Math.exp(-lambda * elapsedMs);
  const decayed = config.baseline + (currentValue - config.baseline) * decayFactor;

  // Clamp to 0-100 range
  return Math.max(0, Math.min(100, Math.round(decayed * 100) / 100));
}

/**
 * Apply decay to all dimensions of a behavioral profile.
 * Call this before reading a contact's profile to get current values.
 */
export function applyProfileDecay(
  profile: BehavioralProfile,
  elapsedMs: number,
): BehavioralProfile {
  const decayed: BehavioralProfile = { ...profile };

  for (const [dim, config] of Object.entries(DECAY_CONFIG) as [keyof BehavioralProfile, DecayConfig][]) {
    decayed[dim] = applyDecay(profile[dim], config, elapsedMs);
  }

  return decayed;
}

// ─── Profile Updates ────────────────────────────────────────────────────────

/**
 * Apply a set of behavioral deltas to a profile.
 * Clamps all values to 0-100.
 */
export function applyDeltas(
  profile: BehavioralProfile,
  deltas: Partial<BehavioralProfile>,
): BehavioralProfile {
  const updated = { ...profile };

  for (const [dim, delta] of Object.entries(deltas) as [keyof BehavioralProfile, number][]) {
    if (delta !== undefined && dim in updated) {
      updated[dim] = Math.max(0, Math.min(100, updated[dim] + delta));
    }
  }

  return updated;
}

/**
 * Calculate the aggregate behavioral deltas from a list of conversation events.
 * Applies diminishing returns for repeated same-type events.
 */
export function aggregateEventDeltas(
  events: ConversationEvent[],
): Partial<BehavioralProfile> {
  const totals: Partial<Record<keyof BehavioralProfile, number>> = {};
  const eventTypeCounts = new Map<string, number>();

  for (const event of events) {
    // Track event type frequency for diminishing returns
    const count = (eventTypeCounts.get(event.type) ?? 0) + 1;
    eventTypeCounts.set(event.type, count);

    // Diminishing returns: 1st occurrence = 100%, 2nd = 70%, 3rd = 50%, etc.
    const diminishingFactor = 1 / (1 + (count - 1) * 0.43);

    // Weight by confidence
    const confidenceWeight = event.confidence;

    for (const [dim, delta] of Object.entries(event.impact)) {
      const key = dim as keyof BehavioralProfile;
      const adjustedDelta = (delta as number) * diminishingFactor * confidenceWeight;
      totals[key] = (totals[key] ?? 0) + adjustedDelta;
    }
  }

  // Round all values
  const rounded: Partial<BehavioralProfile> = {};
  for (const [dim, value] of Object.entries(totals)) {
    rounded[dim as keyof BehavioralProfile] = Math.round(value * 100) / 100;
  }

  return rounded;
}

// ─── Contact Management ─────────────────────────────────────────────────────

/**
 * Create a new contact with default behavioral profile.
 */
export function createContact(
  id: string,
  name: string,
  relationship: string,
): Contact {
  return {
    id,
    name,
    relationship,
    profile: { ...DEFAULT_BEHAVIORAL_PROFILE },
    lastInteraction: Date.now(),
    archetype: null,
    history: [],
    notes: '',
  };
}

/**
 * Get a contact's current profile with decay applied.
 * This is the "truth" — always call this before reading profile values.
 */
export function getCurrentProfile(contact: Contact): BehavioralProfile {
  const elapsed = Date.now() - contact.lastInteraction;
  return applyProfileDecay(contact.profile, elapsed);
}

/**
 * Update a contact after a conversation ends.
 * Applies deltas, records summary, resets last interaction time.
 */
export function updateContactAfterConversation(
  contact: Contact,
  events: ConversationEvent[],
  energy: number,
  duration: number,
  archetypeAlignment: number | null,
  debriefCompleted: boolean,
): Contact {
  // First, decay the profile to current time
  const elapsed = Date.now() - contact.lastInteraction;
  const decayedProfile = applyProfileDecay(contact.profile, elapsed);

  // Aggregate event deltas
  const deltas = aggregateEventDeltas(events);

  // Apply deltas to the decayed profile
  const updatedProfile = applyDeltas(decayedProfile, deltas);

  // Create conversation summary
  const summary: ConversationSummary = {
    timestamp: Date.now(),
    duration,
    energy,
    events: [...events],
    deltas,
    archetypeAlignment,
    debriefCompleted,
  };

  return {
    ...contact,
    profile: updatedProfile,
    lastInteraction: Date.now(),
    history: [...contact.history, summary].slice(-50), // Keep last 50 conversations
  };
}

// ─── Trend Analysis ─────────────────────────────────────────────────────────

export interface DimensionTrend {
  dimension: keyof BehavioralProfile;
  direction: 'improving' | 'declining' | 'stable';
  /** Average delta over recent conversations */
  avgDelta: number;
  /** Number of conversations analyzed */
  conversationsAnalyzed: number;
}

/**
 * Analyze trends for a specific behavioral dimension across recent conversations.
 */
export function analyzeTrend(
  contact: Contact,
  dimension: keyof BehavioralProfile,
  windowSize: number = 5,
): DimensionTrend {
  const recent = contact.history.slice(-windowSize);

  if (recent.length < 2) {
    return {
      dimension,
      direction: 'stable',
      avgDelta: 0,
      conversationsAnalyzed: recent.length,
    };
  }

  const deltas = recent
    .map(s => s.deltas[dimension] ?? 0)
    .filter(d => d !== 0);

  if (deltas.length === 0) {
    return {
      dimension,
      direction: 'stable',
      avgDelta: 0,
      conversationsAnalyzed: recent.length,
    };
  }

  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;

  let direction: 'improving' | 'declining' | 'stable';
  // For most dimensions, positive = improving. For volatility/conflictRisk, inverse.
  const isInverseDimension = dimension === 'volatility' || dimension === 'conflictRisk';

  if (Math.abs(avgDelta) < 1) {
    direction = 'stable';
  } else if (isInverseDimension) {
    direction = avgDelta < 0 ? 'improving' : 'declining';
  } else {
    direction = avgDelta > 0 ? 'improving' : 'declining';
  }

  return {
    dimension,
    direction,
    avgDelta: Math.round(avgDelta * 100) / 100,
    conversationsAnalyzed: recent.length,
  };
}

/**
 * Get all dimension trends for a contact.
 */
export function getAllTrends(
  contact: Contact,
  windowSize: number = 5,
): DimensionTrend[] {
  const dimensions: (keyof BehavioralProfile)[] = [
    'trust', 'composure', 'influence', 'empathy',
    'volatility', 'assertiveness', 'openness', 'conflictRisk',
  ];

  return dimensions.map(dim => analyzeTrend(contact, dim, windowSize));
}

/**
 * Determine overall relationship health from profile and trends.
 */
export function assessRelationshipHealth(
  contact: Contact,
): 'thriving' | 'stable' | 'strained' | 'critical' {
  const profile = getCurrentProfile(contact);
  const trends = getAllTrends(contact);

  const trustTrend = trends.find(t => t.dimension === 'trust');
  const conflictTrend = trends.find(t => t.dimension === 'conflictRisk');

  // Critical: low trust + high conflict risk
  if (profile.trust < 25 && profile.conflictRisk > 60) return 'critical';

  // Strained: declining trust or rising conflict
  if (
    (trustTrend?.direction === 'declining' && profile.trust < 40) ||
    (conflictTrend?.direction === 'declining' && profile.conflictRisk > 50)
  ) {
    return 'strained';
  }

  // Thriving: high trust + low conflict + improving trends
  if (
    profile.trust > 65 &&
    profile.conflictRisk < 25 &&
    trustTrend?.direction !== 'declining'
  ) {
    return 'thriving';
  }

  return 'stable';
}

// ─── Energy Analysis ────────────────────────────────────────────────────────

/**
 * Analyze which contacts drain vs. energize the user.
 * Returns contacts sorted by average energy (most draining first).
 */
export function analyzeContactEnergy(
  contacts: Contact[],
  windowSize: number = 10,
): Array<{ contactId: string; contactName: string; avgEnergy: number; conversations: number }> {
  return contacts
    .map(contact => {
      const recent = contact.history.slice(-windowSize);
      if (recent.length === 0) {
        return { contactId: contact.id, contactName: contact.name, avgEnergy: 0, conversations: 0 };
      }
      const avgEnergy = recent.reduce((sum, s) => sum + s.energy, 0) / recent.length;
      return {
        contactId: contact.id,
        contactName: contact.name,
        avgEnergy: Math.round(avgEnergy * 10) / 10,
        conversations: recent.length,
      };
    })
    .sort((a, b) => a.avgEnergy - b.avgEnergy);
}

// ─── Pre-Brief Generation ───────────────────────────────────────────────────

/**
 * Generate a pre-brief for an upcoming conversation.
 * "Before you walk in" — surfaces relevant context from recent history.
 */
export function generatePreBrief(
  contact: Contact,
  windowSize: number = 3,
): PreBrief {
  const trends = getAllTrends(contact, windowSize);
  const profile = getCurrentProfile(contact);
  const health = assessRelationshipHealth(contact);
  const recent = contact.history.slice(-windowSize);

  // ── Trend summary ──────────────────────────────────────────────────────
  const decliningDimensions = trends
    .filter(t => t.direction === 'declining')
    .map(t => t.dimension);

  const improvingDimensions = trends
    .filter(t => t.direction === 'improving')
    .map(t => t.dimension);

  let trendSummary: string;
  if (decliningDimensions.includes('trust')) {
    trendSummary = `Trust trending down over last ${recent.length} conversations. Tread carefully.`;
  } else if (health === 'thriving') {
    trendSummary = `Relationship strong. ${improvingDimensions.length > 0 ? improvingDimensions.join(', ') + ' improving.' : 'Steady growth.'}`;
  } else if (health === 'strained') {
    trendSummary = `Relationship under pressure. ${decliningDimensions.join(', ')} declining.`;
  } else {
    trendSummary = `Stable ground. No major shifts recently.`;
  }

  // ── Your pattern ───────────────────────────────────────────────────────
  // Identify the user's dominant behavioral pattern with this contact
  let yourPattern: string;
  if (profile.assertiveness < 35) {
    yourPattern = `You tend to hold back with ${contact.name}. Consider being more direct.`;
  } else if (profile.volatility > 60) {
    yourPattern = `Conversations with ${contact.name} get heated. Lead with composure.`;
  } else if (profile.empathy > 70) {
    yourPattern = `You connect well with ${contact.name}. Your empathy is a strength here.`;
  } else {
    yourPattern = `Balanced approach with ${contact.name}. Stay the course.`;
  }

  // ── Archetype tip ──────────────────────────────────────────────────────
  let archetypeTip: string | null = null;
  if (contact.archetype) {
    const archetypeNames: Record<string, string> = {
      ambassador: 'Ambassador',
      spy: 'Spy',
      interrogator: 'Interrogator',
      commander: 'Commander',
      guardian: 'Guardian',
      provocateur: 'Provocateur',
    };
    const name = archetypeNames[contact.archetype] ?? contact.archetype;
    archetypeTip = `${name} mode active. Lead with a question.`;
  }

  return {
    contactId: contact.id,
    contactName: contact.name,
    trendSummary,
    yourPattern,
    archetypeTip,
    conversationsAnalyzed: recent.length,
  };
}

// ─── Causal Explanations ────────────────────────────────────────────────────

/**
 * Generate a "why" explanation for a reputation change.
 * "Trust -8: you interrupted during their key point."
 *
 * This turns abstract numbers into actionable understanding.
 */
export function explainDelta(
  dimension: keyof BehavioralProfile,
  delta: number,
  triggerEvent: ConversationEvent,
): string {
  const direction = delta > 0 ? '+' : '';
  const dimLabels: Record<keyof BehavioralProfile, string> = {
    trust: 'Trust',
    composure: 'Composure',
    influence: 'Influence',
    empathy: 'Empathy',
    volatility: 'Volatility',
    assertiveness: 'Assertiveness',
    openness: 'Openness',
    conflictRisk: 'Conflict risk',
  };

  const eventLabels: Record<string, string> = {
    disagreement: 'you pushed back',
    agreement: 'you aligned with them',
    question: 'you asked a question',
    interruption: 'someone was cut off',
    silence: 'there was a long pause',
    escalation: 'things escalated',
    de_escalation: 'you cooled things down',
    decision_proposal: 'you proposed a direction',
    concession: 'you yielded ground',
    redirect: 'the topic shifted',
    praise: 'positive feedback was given',
    vulnerability: 'someone opened up',
    criticism_event: 'critical feedback was delivered',
    emotional_spike: 'emotions spiked',
  };

  const label = dimLabels[dimension] ?? dimension;
  const eventDesc = eventLabels[triggerEvent.type] ?? triggerEvent.type;
  const rounded = Math.round(delta);

  return `${label} ${direction}${rounded}: ${eventDesc}`;
}
