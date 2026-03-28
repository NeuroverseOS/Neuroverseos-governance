/**
 * Mirror — Type Definitions
 *
 * Behavioral model types grounded in established psychological frameworks:
 *   - OCEAN / Big Five (personality dimensions)
 *   - Gottman's Four Horsemen (conflict predictors)
 *   - Social Exchange Theory (relationship cost/benefit)
 *   - Transactional Analysis (ego state detection)
 *
 * Decay model inspired by weighted exponential decay with dimension-specific
 * half-lives. Trust decays slowly (hard to rebuild). Volatility decays fast
 * (people have bad days). This is a game design decision disguised as math.
 */

// ─── Behavioral Dimensions (Composite Model) ───────────────────────────────

/**
 * The 8 core behavioral dimensions tracked per-contact.
 * Each dimension has its own decay rate, source model, and update rules.
 */
export interface BehavioralProfile {
  /** Trust level (0-100). Source: Social Exchange Theory. Decay: SLOW (weeks). */
  trust: number;
  /** Composure under pressure (0-100). Source: Big Five Neuroticism (inverse). Decay: MEDIUM (days). */
  composure: number;
  /** Ability to shape outcomes (0-100). Source: Social Exchange + TA. Decay: MEDIUM. */
  influence: number;
  /** Emotional attunement (0-100). Source: Big Five Agreeableness. Decay: MEDIUM. */
  empathy: number;
  /** Emotional unpredictability (0-100). Source: Gottman + Big Five. Decay: FAST (hours). */
  volatility: number;
  /** Directness and self-advocacy (0-100). Source: TA ego states. Decay: MEDIUM. */
  assertiveness: number;
  /** Receptiveness to new ideas (0-100). Source: Big Five Openness. Decay: SLOW. */
  openness: number;
  /** Current conflict probability (0-100). Source: Gottman Four Horsemen. Decay: FAST. */
  conflictRisk: number;
}

/** Default starting profile — neutral baseline */
export const DEFAULT_BEHAVIORAL_PROFILE: BehavioralProfile = {
  trust: 50,
  composure: 50,
  influence: 50,
  empathy: 50,
  volatility: 20,
  assertiveness: 50,
  openness: 50,
  conflictRisk: 10,
};

// ─── Decay Configuration ────────────────────────────────────────────────────

/**
 * Decay rate categories.
 * Uses exponential decay: value(t) = baseline + (value - baseline) * e^(-λt)
 * where λ = ln(2) / half_life_ms
 */
export type DecayRate = 'fast' | 'medium' | 'slow' | 'glacial';

export interface DecayConfig {
  /** Decay rate category */
  rate: DecayRate;
  /** Half-life in milliseconds */
  halfLifeMs: number;
  /** Baseline value the dimension decays TOWARD (not zero — toward neutral) */
  baseline: number;
}

/**
 * Per-dimension decay configuration.
 * These are game design decisions:
 *   - Trust decays slowly because trust is hard to rebuild
 *   - Volatility decays fast because people have bad days
 *   - Composure is medium because it recovers with rest
 */
export const DECAY_CONFIG: Record<keyof BehavioralProfile, DecayConfig> = {
  trust:         { rate: 'slow',    halfLifeMs: 14 * 24 * 60 * 60 * 1000, baseline: 50 }, // 2 weeks
  composure:     { rate: 'medium',  halfLifeMs:  3 * 24 * 60 * 60 * 1000, baseline: 50 }, // 3 days
  influence:     { rate: 'medium',  halfLifeMs:  5 * 24 * 60 * 60 * 1000, baseline: 50 }, // 5 days
  empathy:       { rate: 'medium',  halfLifeMs:  4 * 24 * 60 * 60 * 1000, baseline: 50 }, // 4 days
  volatility:    { rate: 'fast',    halfLifeMs:      6 * 60 * 60 * 1000,  baseline: 20 }, // 6 hours
  assertiveness: { rate: 'medium',  halfLifeMs:  3 * 24 * 60 * 60 * 1000, baseline: 50 }, // 3 days
  openness:      { rate: 'slow',    halfLifeMs: 10 * 24 * 60 * 60 * 1000, baseline: 50 }, // 10 days
  conflictRisk:  { rate: 'fast',    halfLifeMs:      4 * 60 * 60 * 1000,  baseline: 10 }, // 4 hours
};

// ─── Transactional Analysis ─────────────────────────────────────────────────

/** Berne's Transactional Analysis ego states */
export type EgoState = 'parent' | 'adult' | 'child' | 'unknown';

/**
 * Parent: controlling/nurturing — "You should...", "You never..."
 * Adult: rational/factual — "What happened with...?", "The data shows..."
 * Child: emotional/creative — reactive, playful, defensive
 */
export interface EgoStateDetection {
  speaker: 'user' | 'other';
  state: EgoState;
  confidence: number; // 0-1
  indicators: string[];
}

// ─── Gottman's Four Horsemen ────────────────────────────────────────────────

/**
 * Research-validated predictors of relationship breakdown.
 * Ordered by severity: contempt is the #1 predictor of relationship failure.
 */
export type GottmanHorseman = 'criticism' | 'contempt' | 'defensiveness' | 'stonewalling';

export interface HorsemanDetection {
  horseman: GottmanHorseman;
  speaker: 'user' | 'other';
  confidence: number; // 0-1
  evidence: string;   // The transcript segment that triggered detection
  /** Impact weights — contempt hits hardest */
  impact: {
    trust: number;
    empathy: number;
    conflictRisk: number;
  };
}

/**
 * Impact weights per horseman type.
 * Based on Gottman Institute research: contempt is the single strongest
 * predictor of relationship dissolution.
 */
export const HORSEMAN_IMPACT: Record<GottmanHorseman, HorsemanDetection['impact']> = {
  criticism:     { trust: -5,  empathy: -3,  conflictRisk: 10 },
  contempt:      { trust: -12, empathy: -8,  conflictRisk: 20 },
  defensiveness: { trust: -4,  empathy: -2,  conflictRisk: 8 },
  stonewalling:  { trust: -8,  empathy: -6,  conflictRisk: 15 },
};

// ─── Conversational Events ──────────────────────────────────────────────────

/**
 * Event types detectable from transcript analysis.
 * Phase 1 starts with high-confidence patterns only.
 */
export type ConversationEventType =
  // High-confidence (Phase 1)
  | 'disagreement'          // Explicit pushback or contradiction
  | 'agreement'             // Explicit affirmation or alignment
  | 'question'              // Direct question asked
  | 'interruption'          // Speaker cut off mid-sentence
  | 'silence'               // Extended pause (> 3 seconds)
  | 'escalation'            // Rising intensity, faster exchanges
  | 'de_escalation'         // Cooling down, slower pace
  | 'decision_proposal'     // Someone proposes a course of action
  | 'concession'            // Someone yields ground
  | 'redirect'              // Topic change, avoidance
  // Medium-confidence (Phase 2)
  | 'emotional_spike'       // Detected emotional shift
  | 'negotiation'           // Back-and-forth proposal/counter
  | 'vulnerability'         // Self-disclosure, admission
  | 'humor'                 // Lighten the mood attempt
  | 'praise'                // Explicit positive feedback
  | 'criticism_event'       // Negative feedback delivered
  // Low-confidence (Phase 3 — requires user confirmation)
  | 'sarcasm'               // Tone-dependent, high error rate
  | 'passive_aggression'    // Indirect hostility
  | 'implied_threat'        // Veiled consequence
  | 'unknown';

export interface ConversationEvent {
  /** Unique event ID */
  id: string;
  /** Event type classification */
  type: ConversationEventType;
  /** Who triggered this event */
  speaker: 'user' | 'other';
  /** The transcript segment that triggered detection */
  transcript: string;
  /** Detection confidence (0-1). Below 0.6 = ask user in debrief */
  confidence: number;
  /** Timestamp of the event */
  timestamp: number;
  /** Intensity of the event (0-1) */
  intensity: number;
  /** Behavioral impact predictions */
  impact: Partial<Record<keyof BehavioralProfile, number>>;
  /** Detected ego state during this event */
  egoState?: EgoStateDetection;
  /** Gottman horseman detected (if any) */
  horseman?: HorsemanDetection;
  /** Whether this needs user confirmation in debrief */
  needsConfirmation: boolean;
}

// ─── Contacts ───────────────────────────────────────────────────────────────

export interface Contact {
  /** Unique contact ID */
  id: string;
  /** Display name (user-provided) */
  name: string;
  /** Relationship label (boss, partner, friend, co-founder, etc.) */
  relationship: string;
  /** Per-contact behavioral profile */
  profile: BehavioralProfile;
  /** Last interaction timestamp (for decay calculation) */
  lastInteraction: number;
  /** Active archetype for this contact (if any) */
  archetype: ArchetypeId | null;
  /** Conversation history summary (not full transcripts) */
  history: ConversationSummary[];
  /** User-provided notes */
  notes: string;
}

export interface ConversationSummary {
  /** When the conversation happened */
  timestamp: number;
  /** Duration in seconds */
  duration: number;
  /** Net energy of the conversation (-100 to 100) */
  energy: number;
  /** Key events detected */
  events: ConversationEvent[];
  /** Behavioral deltas applied */
  deltas: Partial<BehavioralProfile>;
  /** Archetype alignment (if active) */
  archetypeAlignment: number | null;
  /** Whether debrief was completed */
  debriefCompleted: boolean;
}

// ─── Archetypes ─────────────────────────────────────────────────────────────

/**
 * Archetype IDs. Named for memorable gamification.
 * Each archetype maps to specific behavioral dimension rewards/penalties.
 */
export type ArchetypeId =
  | 'ambassador'   // De-escalate, build consensus, high empathy
  | 'spy'          // Extract information, read people, strategic questioning
  | 'interrogator' // Apply pressure, hold ground, composure under fire
  | 'commander'    // Command outcomes, inspire action, decisiveness
  | 'guardian'     // Build loyalty, create safety, trust-building
  | 'provocateur'; // Disrupt, challenge assumptions, strategic provocation

export interface ArchetypeDefinition {
  id: ArchetypeId;
  name: string;
  tagline: string;
  description: string;
  /** Behavioral dimensions this archetype REWARDS (positive alignment) */
  rewards: Partial<Record<keyof BehavioralProfile, number>>;
  /** Behavioral dimensions this archetype PENALIZES (negative alignment) */
  penalties: Partial<Record<keyof BehavioralProfile, number>>;
  /** Event types that boost alignment */
  alignedEvents: ConversationEventType[];
  /** Event types that reduce alignment */
  misalignedEvents: ConversationEventType[];
  /** Per-contact contextual override: if true, context can override penalties */
  contextSensitive: boolean;
}

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDefinition> = {
  ambassador: {
    id: 'ambassador',
    name: 'The Ambassador',
    tagline: 'Build bridges, not walls.',
    description: 'Master of de-escalation and consensus. High empathy, low volatility, infinite patience. You win by making everyone feel heard.',
    rewards: { empathy: 3, trust: 2, openness: 2, composure: 1 },
    penalties: { volatility: -2, assertiveness: -1 },
    alignedEvents: ['de_escalation', 'agreement', 'concession', 'vulnerability', 'praise'],
    misalignedEvents: ['escalation', 'interruption', 'criticism_event'],
    contextSensitive: true,
  },
  spy: {
    id: 'spy',
    name: 'The Spy',
    tagline: 'Learn everything. Reveal nothing.',
    description: 'Information extraction through strategic questioning. You ask the right questions, read between lines, and remember everything. Your power is knowledge.',
    rewards: { influence: 3, openness: 2, composure: 2 },
    penalties: { volatility: -1, empathy: -1 },
    alignedEvents: ['question', 'silence', 'redirect', 'de_escalation'],
    misalignedEvents: ['vulnerability', 'emotional_spike', 'escalation'],
    contextSensitive: true,
  },
  interrogator: {
    id: 'interrogator',
    name: 'The Interrogator',
    tagline: 'Hold the line. Get the truth.',
    description: 'Apply controlled pressure without losing composure. You hold ground, ask hard questions, and don\'t flinch. Your power is steadiness under fire.',
    rewards: { assertiveness: 3, composure: 3, influence: 2 },
    penalties: { empathy: -1 },
    alignedEvents: ['question', 'disagreement', 'decision_proposal', 'silence'],
    misalignedEvents: ['concession', 'de_escalation', 'redirect'],
    contextSensitive: true,
  },
  commander: {
    id: 'commander',
    name: 'The Commander',
    tagline: 'Decide. Act. Lead.',
    description: 'Command outcomes and inspire action. You propose decisions, take ownership, and move things forward. Your power is decisive momentum.',
    rewards: { assertiveness: 3, influence: 3, composure: 1 },
    penalties: { openness: -1, empathy: -1 },
    alignedEvents: ['decision_proposal', 'disagreement', 'redirect'],
    misalignedEvents: ['silence', 'concession', 'vulnerability'],
    contextSensitive: true,
  },
  guardian: {
    id: 'guardian',
    name: 'The Guardian',
    tagline: 'Protect. Anchor. Steady.',
    description: 'Build loyalty and create psychological safety. You listen deeply, validate feelings, and make people feel safe. Your power is trust.',
    rewards: { trust: 4, empathy: 3, composure: 2 },
    penalties: { assertiveness: -1, influence: -1 },
    alignedEvents: ['agreement', 'vulnerability', 'praise', 'de_escalation', 'question'],
    misalignedEvents: ['interruption', 'escalation', 'criticism_event', 'redirect'],
    contextSensitive: true,
  },
  provocateur: {
    id: 'provocateur',
    name: 'The Provocateur',
    tagline: 'Disrupt. Challenge. Evolve.',
    description: 'Strategic disruption and assumption-challenging. You push thinking, play devil\'s advocate, and break comfortable consensus. Your power is evolution through friction.',
    rewards: { openness: 3, assertiveness: 2, influence: 2 },
    penalties: { trust: -1, empathy: -1 },
    alignedEvents: ['disagreement', 'question', 'humor', 'decision_proposal'],
    misalignedEvents: ['agreement', 'concession', 'silence'],
    contextSensitive: true,
  },
};

// ─── Whisper Types ──────────────────────────────────────────────────────────

export interface Whisper {
  /** What the whisper says (directional, never precise numbers) */
  text: string;
  /** Priority (0-1). Only highest-priority whisper wins if budget is tight. */
  priority: number;
  /** Which event triggered this whisper */
  triggerEventId: string;
  /** Timestamp */
  timestamp: number;
  /** Category for filtering */
  category: 'shadow' | 'archetype' | 'warning';
}

// ─── Shadow Simulation Output ───────────────────────────────────────────────

export interface ShadowResult {
  /** Predicted behavioral impact if current trajectory continues */
  projectedImpact: Partial<BehavioralProfile>;
  /** Directional insight text (for whisper) */
  insight: string;
  /** Whether this is worth whispering (high signal) */
  isWhisperWorthy: boolean;
  /** Conflict trajectory */
  conflictTrajectory: 'rising' | 'stable' | 'falling';
  /** Energy trajectory */
  energyTrajectory: 'energizing' | 'neutral' | 'draining';
}

// ─── Debrief Types ──────────────────────────────────────────────────────────

export interface DebriefQuestion {
  /** The event being asked about */
  eventId: string;
  /** The question text */
  question: string;
  /** Multiple choice options */
  options: DebriefOption[];
  /** What the system classified it as (for comparison) */
  systemClassification: ConversationEventType;
}

export interface DebriefOption {
  label: string;
  value: ConversationEventType | 'skip';
}

export interface DebriefResult {
  /** Conversation timestamp */
  conversationTimestamp: number;
  /** Contact involved */
  contactId: string;
  /** User corrections applied */
  corrections: Array<{
    eventId: string;
    systemClassification: ConversationEventType;
    userCorrection: ConversationEventType;
  }>;
  /** Whether the user chose to do the simulation/replay */
  simulationCompleted: boolean;
  /** Final behavioral deltas after corrections */
  adjustedDeltas: Partial<BehavioralProfile>;
}

// ─── Pre-Brief (Before You Walk In) ─────────────────────────────────────────

export interface PreBrief {
  /** Contact being met */
  contactId: string;
  contactName: string;
  /** Recent trend summary */
  trendSummary: string;
  /** Your behavioral pattern with this person */
  yourPattern: string;
  /** Archetype tip (if archetype active for this contact) */
  archetypeTip: string | null;
  /** Recent conversation count used for this brief */
  conversationsAnalyzed: number;
}

// ─── Session State ──────────────────────────────────────────────────────────

export interface MirrorSessionState {
  /** Current operating mode */
  mode: 'shadow' | 'graph' | 'archetype';
  /** Whether quiet mode is active */
  quietMode: boolean;
  /** Current emotional intensity (0-100) */
  emotionalIntensity: number;
  /** Whispers delivered this conversation */
  whispersDelivered: number;
  /** Max whispers allowed this conversation */
  maxWhispers: number;
  /** Active conversation data */
  conversation: {
    active: boolean;
    startTime: number | null;
    events: ConversationEvent[];
    energy: number;
    contactId: string | null;
  };
  /** Active archetype (if in archetype mode) */
  activeArchetype: ArchetypeId | null;
  /** Current archetype alignment score */
  archetypeAlignment: number;
  /** Current archetype streak count */
  streakCount: number;
  /** All contacts */
  contacts: Map<string, Contact>;
  /** Ego state tracking */
  egoStates: {
    user: EgoState;
    other: EgoState;
  };
  /** Current Gottman horseman (if detected) */
  activeHorseman: GottmanHorseman | null;
  /** Session behavioral deltas (reset per conversation) */
  sessionDeltas: Partial<BehavioralProfile>;
  /** Pending debrief data */
  pendingDebrief: ConversationEvent[] | null;
}

/** Default session state */
export const DEFAULT_SESSION_STATE: MirrorSessionState = {
  mode: 'shadow',
  quietMode: false,
  emotionalIntensity: 0,
  whispersDelivered: 0,
  maxWhispers: 2,
  conversation: {
    active: false,
    startTime: null,
    events: [],
    energy: 0,
    contactId: null,
  },
  activeArchetype: null,
  archetypeAlignment: 0,
  streakCount: 0,
  contacts: new Map(),
  egoStates: { user: 'unknown', other: 'unknown' },
  activeHorseman: null,
  sessionDeltas: {},
  pendingDebrief: null,
};
