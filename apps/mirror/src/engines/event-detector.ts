/**
 * Event Detection Engine — Conversational Event Classification
 *
 * Detects meaningful moments from transcript segments. NOT every sentence.
 * Phase 1: Only high-confidence patterns (explicit disagreements, questions,
 * silences, escalation). Better to miss moments than misread them.
 *
 * Pure functions. No network. No LLM. Deterministic.
 *
 * Input: transcript segment + speaker + context
 * Output: ConversationEvent (or null if nothing meaningful detected)
 */

import type {
  ConversationEvent,
  ConversationEventType,
  EgoState,
  EgoStateDetection,
  GottmanHorseman,
  HorsemanDetection,
  BehavioralProfile,
  HORSEMAN_IMPACT,
} from '../types.js';

// ─── Pattern Definitions ────────────────────────────────────────────────────

interface DetectionPattern {
  type: ConversationEventType;
  /** Regex patterns that indicate this event */
  patterns: RegExp[];
  /** Base confidence for pattern match */
  baseConfidence: number;
  /** Base intensity for this event type */
  baseIntensity: number;
  /** Phase: 1 = high confidence, 2 = medium, 3 = needs confirmation */
  phase: 1 | 2 | 3;
  /** Default behavioral impact */
  defaultImpact: Partial<Record<keyof BehavioralProfile, number>>;
}

/**
 * Phase 1 patterns — high confidence, low false-positive rate.
 * These are safe to classify without user confirmation.
 */
const DETECTION_PATTERNS: DetectionPattern[] = [
  // ── Disagreement ──────────────────────────────────────────────────────
  {
    type: 'disagreement',
    patterns: [
      /\b(i disagree|i don'?t agree|i don'?t think so|that'?s not right|that'?s wrong|no[,.]?\s+(i think|actually|but))\b/i,
      /\b(i push back on|i challenge that|that doesn'?t work|that won'?t work|i'?m not convinced)\b/i,
      /\b(i don'?t think this|that'?s not how|you'?re wrong|that'?s incorrect)\b/i,
    ],
    baseConfidence: 0.8,
    baseIntensity: 0.5,
    phase: 1,
    defaultImpact: { trust: -3, conflictRisk: 8, assertiveness: 5 },
  },
  // ── Agreement ─────────────────────────────────────────────────────────
  {
    type: 'agreement',
    patterns: [
      /\b(i agree|exactly|absolutely|you'?re right|that'?s right|good point|fair point|makes sense|i'?m with you)\b/i,
      /\b(totally|100 percent|i think so too|same here|well said)\b/i,
    ],
    baseConfidence: 0.75,
    baseIntensity: 0.3,
    phase: 1,
    defaultImpact: { trust: 2, empathy: 1, conflictRisk: -3 },
  },
  // ── Question ──────────────────────────────────────────────────────────
  {
    type: 'question',
    patterns: [
      /\?$/,
      /\b(what do you think|how do you feel|what happened|why did|can you explain|could you)\b/i,
      /\b(what if|how about|wouldn'?t it be|have you considered)\b/i,
    ],
    baseConfidence: 0.85,
    baseIntensity: 0.2,
    phase: 1,
    defaultImpact: { openness: 2, influence: 1 },
  },
  // ── Decision Proposal ─────────────────────────────────────────────────
  {
    type: 'decision_proposal',
    patterns: [
      /\b(i think we should|let'?s|we need to|i propose|my suggestion is|how about we|i recommend)\b/i,
      /\b(the plan is|we'?re going to|i'?ve decided|the decision is|moving forward)\b/i,
    ],
    baseConfidence: 0.75,
    baseIntensity: 0.4,
    phase: 1,
    defaultImpact: { assertiveness: 5, influence: 3 },
  },
  // ── Concession ────────────────────────────────────────────────────────
  {
    type: 'concession',
    patterns: [
      /\b(you'?re right|fair enough|i see your point|okay[,.]?\s*(you win|fine|let'?s do it)|i'?ll give you that)\b/i,
      /\b(i was wrong|my mistake|i stand corrected|i take that back)\b/i,
    ],
    baseConfidence: 0.7,
    baseIntensity: 0.4,
    phase: 1,
    defaultImpact: { trust: 3, empathy: 2, assertiveness: -3, conflictRisk: -5 },
  },
  // ── Escalation ────────────────────────────────────────────────────────
  {
    type: 'escalation',
    patterns: [
      /\b(this is ridiculous|unacceptable|i'?m done|enough|this is bullshit|are you kidding)\b/i,
      /\b(i can'?t believe|what the hell|seriously\?|you always|you never)\b/i,
      /(!{2,}|[A-Z]{5,})/,  // Multiple exclamation marks or ALL CAPS
    ],
    baseConfidence: 0.7,
    baseIntensity: 0.7,
    phase: 1,
    defaultImpact: { volatility: 10, conflictRisk: 15, trust: -5, composure: -8 },
  },
  // ── De-escalation ─────────────────────────────────────────────────────
  {
    type: 'de_escalation',
    patterns: [
      /\b(let'?s calm down|let'?s take a step back|i understand|i hear you|let'?s slow down)\b/i,
      /\b(can we just|let me rephrase|what i meant was|let'?s reset|no offense)\b/i,
      /\b(i appreciate|i respect|i value your|thank you for)\b/i,
    ],
    baseConfidence: 0.75,
    baseIntensity: 0.4,
    phase: 1,
    defaultImpact: { composure: 5, trust: 3, conflictRisk: -8, volatility: -5 },
  },
  // ── Redirect ──────────────────────────────────────────────────────────
  {
    type: 'redirect',
    patterns: [
      /\b(anyway|moving on|let'?s talk about|changing the subject|back to|on another note)\b/i,
      /\b(that aside|regardless|let'?s focus on|the real issue is)\b/i,
    ],
    baseConfidence: 0.65,
    baseIntensity: 0.3,
    phase: 1,
    defaultImpact: { influence: 2, openness: -2 },
  },
  // ── Phase 2: Praise ───────────────────────────────────────────────────
  {
    type: 'praise',
    patterns: [
      /\b(great job|well done|nice work|i'?m impressed|you nailed it|brilliant|excellent work)\b/i,
      /\b(you'?re amazing|so proud|incredible job|you crushed it)\b/i,
    ],
    baseConfidence: 0.7,
    baseIntensity: 0.4,
    phase: 2,
    defaultImpact: { trust: 4, empathy: 3, composure: 2 },
  },
  // ── Phase 2: Vulnerability ────────────────────────────────────────────
  {
    type: 'vulnerability',
    patterns: [
      /\b(i'?m scared|i'?m worried|i'?m afraid|i don'?t know what to do|i need help)\b/i,
      /\b(to be honest|honestly|truthfully|i have to admit|between us)\b/i,
      /\b(i struggle with|it'?s hard for me|i'?m not sure i can)\b/i,
    ],
    baseConfidence: 0.6,
    baseIntensity: 0.5,
    phase: 2,
    defaultImpact: { trust: 5, empathy: 4, openness: 3, assertiveness: -2 },
  },
  // ── Phase 2: Criticism Event ──────────────────────────────────────────
  {
    type: 'criticism_event',
    patterns: [
      /\b(you should have|why didn'?t you|you failed|you dropped the ball|disappointing)\b/i,
      /\b(not good enough|you missed|you forgot|that was careless)\b/i,
    ],
    baseConfidence: 0.65,
    baseIntensity: 0.6,
    phase: 2,
    defaultImpact: { trust: -5, empathy: -3, conflictRisk: 10, volatility: 5 },
  },
];

// ─── Ego State Detection ────────────────────────────────────────────────────

const EGO_STATE_PATTERNS: Record<Exclude<EgoState, 'unknown'>, RegExp[]> = {
  parent: [
    /\b(you should|you must|you need to|you always|you never|how many times)\b/i,
    /\b(i told you|listen to me|because i said so|don'?t you dare|watch your)\b/i,
    /\b(the right way|the proper way|when i was your age|back in my day)\b/i,
  ],
  adult: [
    /\b(the data shows|based on|let'?s analyze|what are the options|logically)\b/i,
    /\b(i think because|the evidence suggests|let'?s consider|objectively)\b/i,
    /\b(what happened|how can we|what do you think about|let'?s figure out)\b/i,
  ],
  child: [
    /\b(it'?s not fair|i can'?t|i don'?t want to|whatever|fine|leave me alone)\b/i,
    /\b(this is so exciting|awesome|oh my god|yay|this is amazing|wow)\b/i,
    /\b(i'?m sorry i'?m sorry|please don'?t|i didn'?t mean to)\b/i,
  ],
};

/**
 * Detect the ego state from a transcript segment.
 * Returns the highest-confidence match, or 'unknown' if no strong signal.
 */
export function detectEgoState(
  text: string,
  speaker: 'user' | 'other',
): EgoStateDetection {
  const scores: Record<Exclude<EgoState, 'unknown'>, { count: number; indicators: string[] }> = {
    parent: { count: 0, indicators: [] },
    adult: { count: 0, indicators: [] },
    child: { count: 0, indicators: [] },
  };

  for (const [state, patterns] of Object.entries(EGO_STATE_PATTERNS) as [Exclude<EgoState, 'unknown'>, RegExp[]][]) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        scores[state].count++;
        scores[state].indicators.push(match[0]);
      }
    }
  }

  const best = (Object.entries(scores) as [Exclude<EgoState, 'unknown'>, { count: number; indicators: string[] }][])
    .sort((a, b) => b[1].count - a[1].count)[0];

  if (best[1].count === 0) {
    return { speaker, state: 'unknown', confidence: 0, indicators: [] };
  }

  const confidence = Math.min(0.9, 0.4 + best[1].count * 0.15);
  return {
    speaker,
    state: best[0],
    confidence,
    indicators: best[1].indicators,
  };
}

// ─── Gottman Horseman Detection ─────────────────────────────────────────────

const HORSEMAN_PATTERNS: Record<GottmanHorseman, RegExp[]> = {
  criticism: [
    /\b(you always|you never|what is wrong with you|what'?s wrong with you|why can'?t you)\b/i,
    /\b(you'?re the kind of person who|you'?re so|every time you)\b/i,
  ],
  contempt: [
    /\b(you'?re pathetic|you'?re worthless|give me a break|rolling my eyes|yeah right)\b/i,
    /\b(whatever|pfft|you call that|how stupid|how dumb|unbelievable)\b/i,
  ],
  defensiveness: [
    /\b(it'?s not my fault|i didn'?t do anything|you'?re the one who|what about you)\b/i,
    /\b(that'?s not what happened|i was only|yes but|you started it)\b/i,
  ],
  stonewalling: [
    /\b(i'?m done talking|i don'?t want to talk|leave me alone|whatever you say)\b/i,
    /\b(i'?m not doing this|talk to the hand|i have nothing to say)\b/i,
  ],
};

/** Horseman impact weights from types.ts */
const HORSEMAN_IMPACT_WEIGHTS: Record<GottmanHorseman, { trust: number; empathy: number; conflictRisk: number }> = {
  criticism:     { trust: -5,  empathy: -3,  conflictRisk: 10 },
  contempt:      { trust: -12, empathy: -8,  conflictRisk: 20 },
  defensiveness: { trust: -4,  empathy: -2,  conflictRisk: 8 },
  stonewalling:  { trust: -8,  empathy: -6,  conflictRisk: 15 },
};

/**
 * Detect Gottman Four Horsemen patterns.
 * Returns the most severe horseman detected, or null.
 */
export function detectHorseman(
  text: string,
  speaker: 'user' | 'other',
): HorsemanDetection | null {
  const detections: HorsemanDetection[] = [];

  for (const [horseman, patterns] of Object.entries(HORSEMAN_PATTERNS) as [GottmanHorseman, RegExp[]][]) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        detections.push({
          horseman,
          speaker,
          confidence: 0.7,
          evidence: match[0],
          impact: HORSEMAN_IMPACT_WEIGHTS[horseman],
        });
        break; // One match per horseman is enough
      }
    }
  }

  if (detections.length === 0) return null;

  // Return the most severe (highest conflict risk impact)
  return detections.sort(
    (a, b) => b.impact.conflictRisk - a.impact.conflictRisk,
  )[0];
}

// ─── Silence Detection ──────────────────────────────────────────────────────

/**
 * Detect meaningful silence from timing gaps between segments.
 * Called with the time delta between segments in milliseconds.
 */
export function detectSilence(
  gapMs: number,
  previousEvent: ConversationEvent | null,
): ConversationEvent | null {
  // Only flag silences > 3 seconds as meaningful
  if (gapMs < 3000) return null;

  const intensity = Math.min(1, gapMs / 10000); // Scales 3s→10s to 0.3→1.0
  const isPostConflict = previousEvent?.type === 'escalation' ||
                         previousEvent?.type === 'disagreement' ||
                         previousEvent?.type === 'criticism_event';

  return {
    id: `silence-${Date.now()}`,
    type: 'silence',
    speaker: 'user', // Silence is mutual
    transcript: `[silence: ${(gapMs / 1000).toFixed(1)}s]`,
    confidence: 0.9,
    timestamp: Date.now(),
    intensity,
    impact: isPostConflict
      ? { conflictRisk: 5, volatility: 3, composure: -3 }
      : { composure: 2, openness: 1 },
    needsConfirmation: false,
  };
}

// ─── Emotional Intensity Calculator ─────────────────────────────────────────

/**
 * Calculate emotional intensity from recent events.
 * Uses a rolling window of the last N events, weighted by recency.
 */
export function calculateEmotionalIntensity(
  recentEvents: ConversationEvent[],
  windowSize: number = 10,
): number {
  if (recentEvents.length === 0) return 0;

  const window = recentEvents.slice(-windowSize);
  let totalIntensity = 0;
  let totalWeight = 0;

  for (let i = 0; i < window.length; i++) {
    // More recent events have higher weight
    const recencyWeight = (i + 1) / window.length;
    totalIntensity += window[i].intensity * recencyWeight;
    totalWeight += recencyWeight;
  }

  const avgIntensity = totalIntensity / totalWeight;

  // Check for acceleration (rapid events = higher intensity)
  const eventVelocity = window.length >= 3
    ? calculateEventVelocity(window.slice(-3))
    : 0;

  // Horseman detection boosts intensity significantly
  const horsemanBoost = window.some(e => e.horseman) ? 15 : 0;

  return Math.min(100, Math.round(avgIntensity * 100 + eventVelocity + horsemanBoost));
}

function calculateEventVelocity(events: ConversationEvent[]): number {
  if (events.length < 2) return 0;
  const timeSpan = events[events.length - 1].timestamp - events[0].timestamp;
  if (timeSpan === 0) return 20; // Simultaneous events = high velocity
  const eventsPerSecond = events.length / (timeSpan / 1000);
  return Math.min(20, eventsPerSecond * 10); // Cap at 20 bonus
}

// ─── Main Detection Function ────────────────────────────────────────────────

let eventCounter = 0;

/**
 * Detect a conversational event from a transcript segment.
 *
 * Returns null if nothing meaningful is detected.
 * This is intentionally conservative — better to miss than misclassify.
 *
 * @param text - The transcript segment
 * @param speaker - Who said it ('user' or 'other')
 * @param phase - Maximum detection phase to use (1 = conservative, 3 = aggressive)
 */
export function detectEvent(
  text: string,
  speaker: 'user' | 'other',
  phase: 1 | 2 | 3 = 1,
): ConversationEvent | null {
  if (!text || text.trim().length === 0) return null;

  const trimmed = text.trim();
  let bestMatch: { pattern: DetectionPattern; confidence: number } | null = null;

  for (const pattern of DETECTION_PATTERNS) {
    if (pattern.phase > phase) continue; // Skip patterns above our phase

    for (const regex of pattern.patterns) {
      if (regex.test(trimmed)) {
        // Boost confidence for longer, more explicit matches
        const lengthBoost = Math.min(0.1, trimmed.length / 500);
        const confidence = Math.min(0.95, pattern.baseConfidence + lengthBoost);

        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { pattern, confidence };
        }
        break; // One match per pattern type is enough
      }
    }
  }

  if (!bestMatch) return null;

  // Detect ego state
  const egoState = detectEgoState(trimmed, speaker);

  // Detect Gottman horseman
  const horseman = detectHorseman(trimmed, speaker);

  // Merge impact from horseman if detected
  const impact = { ...bestMatch.pattern.defaultImpact };
  if (horseman) {
    impact.trust = (impact.trust ?? 0) + horseman.impact.trust;
    impact.empathy = (impact.empathy ?? 0) + horseman.impact.empathy;
    impact.conflictRisk = (impact.conflictRisk ?? 0) + horseman.impact.conflictRisk;
  }

  const needsConfirmation = bestMatch.confidence < 0.6 || bestMatch.pattern.phase >= 3;

  eventCounter++;

  return {
    id: `evt-${eventCounter}-${Date.now()}`,
    type: bestMatch.pattern.type,
    speaker,
    transcript: trimmed,
    confidence: bestMatch.confidence,
    timestamp: Date.now(),
    intensity: bestMatch.pattern.baseIntensity,
    impact,
    egoState: egoState.state !== 'unknown' ? egoState : undefined,
    horseman: horseman ?? undefined,
    needsConfirmation,
  };
}

/**
 * Reset the event counter (for testing or new sessions).
 */
export function resetEventCounter(): void {
  eventCounter = 0;
}
