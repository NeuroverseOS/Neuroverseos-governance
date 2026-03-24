/**
 * Spatial Governance Engine
 *
 * The runtime engine for location-aware, multi-user governance.
 *
 * Core operations:
 *
 *   discoverZone()     — A zone is detected nearby (posemesh portal, BLE, etc.)
 *   optInToZone()      — User accepts the zone's rules
 *   exitZone()         — User leaves the zone, rules dissolve
 *
 *   startHandshake()   — Begin multi-user governance negotiation
 *   joinHandshake()    — Another participant enters the shared space
 *   leaveHandshake()   — Participant exits, handshake recomputes
 *
 *   evaluateSpatial()  — Check an intent against the current spatial context
 *   resolveEffective() — Compute the most restrictive rules from all layers
 *
 * The "most restrictive wins" invariant:
 *   When multiple governance layers overlap (user rules, zone rules,
 *   handshake rules), the MOST restrictive value for each field wins.
 *   This means:
 *     - 'blocked' beats 'confirm_each' beats 'declared_only' beats 'allowed'
 *     - 'strict' beats 'elevated' beats 'standard'
 *     - A zone can tighten your rules, never relax them
 *     - A handshake participant can tighten the group, never relax it
 */

import type {
  Zone,
  ZoneRules,
  ZoneOptIn,
  SpatialHandshake,
  HandshakeParticipant,
  ParticipantConstraints,
  SpatialSession,
  SpatialEvent,
} from './types';
import { DEFAULT_ZONE_RULES, DEFAULT_PARTICIPANT_CONSTRAINTS } from './types';

// ─── Restrictiveness Orderings ───────────────────────────────────────────────
// Higher index = more restrictive. Used by mostRestrictive().

const CAMERA_ORDER = ['allowed', 'confirm_each', 'blocked'] as const;
const MIC_ORDER = ['allowed', 'confirm_each', 'blocked'] as const;
const AI_DATA_ORDER = ['allowed', 'declared_only', 'confirm_each', 'blocked'] as const;
const AI_ACTION_ORDER = ['allowed', 'confirm_all', 'blocked'] as const;
const AI_REC_ORDER = ['allowed', 'non_commercial', 'blocked'] as const;
const LOCATION_ORDER = ['allowed', 'confirm_each', 'blocked'] as const;
const OVERLAY_ORDER = ['allowed', 'non_obstructive', 'blocked'] as const;
const RETENTION_ORDER = ['allowed', 'session_only', 'blocked'] as const;
const COMMERCIAL_ORDER = ['allowed', 'blocked'] as const;
const BYSTANDER_ORDER = ['standard', 'elevated', 'strict'] as const;

function mostRestrictive<T extends string>(a: T, b: T, order: readonly T[]): T {
  const idxA = order.indexOf(a);
  const idxB = order.indexOf(b);
  return idxA >= idxB ? a : b;
}

// ─── Rule Composition ────────────────────────────────────────────────────────

/**
 * Merge two ZoneRules, taking the most restrictive value for each field.
 * This is the core of "most restrictive wins."
 */
export function mergeRules(a: ZoneRules, b: ZoneRules): ZoneRules {
  return {
    camera: mostRestrictive(a.camera, b.camera, CAMERA_ORDER),
    microphone: mostRestrictive(a.microphone, b.microphone, MIC_ORDER),
    aiDataSend: mostRestrictive(a.aiDataSend, b.aiDataSend, AI_DATA_ORDER),
    aiActions: mostRestrictive(a.aiActions, b.aiActions, AI_ACTION_ORDER),
    aiRecommendations: mostRestrictive(a.aiRecommendations, b.aiRecommendations, AI_REC_ORDER),
    locationSharing: mostRestrictive(a.locationSharing, b.locationSharing, LOCATION_ORDER),
    aiOverlay: mostRestrictive(a.aiOverlay, b.aiOverlay, OVERLAY_ORDER),
    dataRetention: mostRestrictive(a.dataRetention, b.dataRetention, RETENTION_ORDER),
    commercialAI: mostRestrictive(a.commercialAI, b.commercialAI, COMMERCIAL_ORDER),
    bystanderProtection: mostRestrictive(a.bystanderProtection, b.bystanderProtection, BYSTANDER_ORDER),
    custom: [...(a.custom ?? []), ...(b.custom ?? [])],
  };
}

/**
 * Convert participant constraints to ZoneRules format for merging.
 */
export function constraintsToRules(c: ParticipantConstraints): ZoneRules {
  return {
    ...DEFAULT_ZONE_RULES,
    camera: c.cameraMinimum,
    microphone: c.microphoneMinimum,
    aiDataSend: c.aiDataSendMinimum,
    aiRecommendations: c.aiRecommendationsMinimum,
    dataRetention: c.dataRetentionMinimum,
    bystanderProtection: c.bystanderProtectionMinimum,
  };
}

// ─── Zone Operations ─────────────────────────────────────────────────────────

/**
 * Create an opt-in for a zone.
 *
 * The effective rules are computed by merging the zone's rules
 * with any user overrides (most restrictive wins).
 */
export function createOptIn(
  zone: Zone,
  userOverrides: Partial<ZoneRules> = {},
  method: ZoneOptIn['method'] = 'tap_confirm',
): ZoneOptIn {
  const sessionId = `spatial-${zone.zoneId}-${Date.now()}`;

  // Start with zone rules, then apply user overrides (most restrictive wins)
  const overrideRules: ZoneRules = {
    ...DEFAULT_ZONE_RULES,
    ...userOverrides,
  };
  const effectiveRules = mergeRules(zone.rules, overrideRules);

  return {
    zoneId: zone.zoneId,
    optedInAt: Date.now(),
    method,
    acceptedRules: zone.rules,
    userOverrides,
    effectiveRules,
    sessionId,
  };
}

// ─── Handshake Operations ────────────────────────────────────────────────────

/**
 * Start a new spatial handshake with an initial participant.
 */
export function startHandshake(
  initiator: ParticipantConstraints,
  initiatorId: string,
  zoneId?: string,
): SpatialHandshake {
  const handshakeId = `handshake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();

  const participant: HandshakeParticipant = {
    participantId: initiatorId,
    publishedConstraints: initiator,
    joinedAt: now,
    acknowledged: true,
  };

  return {
    handshakeId,
    participants: [participant],
    negotiatedRules: constraintsToRules(initiator),
    zoneId,
    createdAt: now,
    lastNegotiatedAt: now,
    state: 'active',
  };
}

/**
 * Add a participant to an existing handshake. Returns a new handshake
 * with recomputed negotiated rules.
 */
export function joinHandshake(
  handshake: SpatialHandshake,
  constraints: ParticipantConstraints,
  participantId: string,
): SpatialHandshake {
  const now = Date.now();

  const newParticipant: HandshakeParticipant = {
    participantId,
    publishedConstraints: constraints,
    joinedAt: now,
    acknowledged: false,
  };

  const participants = [...handshake.participants, newParticipant];
  const negotiatedRules = negotiateHandshake(participants);

  return {
    ...handshake,
    participants,
    negotiatedRules,
    lastNegotiatedAt: now,
  };
}

/**
 * Remove a participant from a handshake. Returns a new handshake
 * with recomputed rules, or null if the handshake is dissolved
 * (< 2 participants remaining).
 */
export function leaveHandshake(
  handshake: SpatialHandshake,
  participantId: string,
): SpatialHandshake | null {
  const participants = handshake.participants.filter(
    p => p.participantId !== participantId,
  );

  if (participants.length < 2) {
    return {
      ...handshake,
      participants,
      state: 'dissolved',
      lastNegotiatedAt: Date.now(),
      negotiatedRules: participants.length === 1
        ? constraintsToRules(participants[0].publishedConstraints)
        : DEFAULT_ZONE_RULES,
    };
  }

  return {
    ...handshake,
    participants,
    negotiatedRules: negotiateHandshake(participants),
    lastNegotiatedAt: Date.now(),
  };
}

/**
 * Negotiate the most restrictive rules across all participants.
 * This is the core handshake algorithm.
 */
function negotiateHandshake(participants: HandshakeParticipant[]): ZoneRules {
  if (participants.length === 0) return DEFAULT_ZONE_RULES;

  let result = constraintsToRules(participants[0].publishedConstraints);

  for (let i = 1; i < participants.length; i++) {
    const participantRules = constraintsToRules(participants[i].publishedConstraints);
    result = mergeRules(result, participantRules);
  }

  return result;
}

// ─── Spatial Session Management ──────────────────────────────────────────────

/**
 * Create a new spatial session.
 */
export function createSession(): SpatialSession {
  return {
    sessionId: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    effectiveRules: DEFAULT_ZONE_RULES,
    state: 'discovering',
    startedAt: Date.now(),
    endedAt: null,
    events: [],
  };
}

/**
 * Apply a zone opt-in to a session. Returns a new session with
 * the zone's rules merged in.
 */
export function applyZoneToSession(
  session: SpatialSession,
  zone: Zone,
  optIn: ZoneOptIn,
): SpatialSession {
  const event: SpatialEvent = {
    type: 'zone_opted_in',
    zoneId: zone.zoneId,
    timestamp: Date.now(),
  };

  // Zone rules merge with any existing handshake rules
  const baseRules = session.handshake
    ? session.handshake.negotiatedRules
    : DEFAULT_ZONE_RULES;

  const effectiveRules = mergeRules(baseRules, optIn.effectiveRules);

  return {
    ...session,
    zone,
    optIn,
    effectiveRules,
    state: session.handshake ? 'handshake_active' : 'opted_in',
    events: [...session.events, event],
  };
}

/**
 * Apply a handshake to a session. Returns a new session with
 * the handshake's negotiated rules merged in.
 */
export function applyHandshakeToSession(
  session: SpatialSession,
  handshake: SpatialHandshake,
): SpatialSession {
  const event: SpatialEvent = {
    type: 'handshake_negotiated',
    handshakeId: handshake.handshakeId,
    timestamp: Date.now(),
  };

  // Handshake rules merge with zone rules (if in a zone)
  const baseRules = session.optIn
    ? session.optIn.effectiveRules
    : DEFAULT_ZONE_RULES;

  const effectiveRules = mergeRules(baseRules, handshake.negotiatedRules);

  return {
    ...session,
    handshake,
    effectiveRules,
    state: 'handshake_active',
    events: [...session.events, event],
  };
}

/**
 * Exit a zone. Zone rules dissolve, but handshake rules may remain.
 */
export function exitZone(session: SpatialSession): SpatialSession {
  if (!session.zone) return session;

  const event: SpatialEvent = {
    type: 'zone_exited',
    zoneId: session.zone.zoneId,
    timestamp: Date.now(),
  };

  // Recompute without zone
  const effectiveRules = session.handshake
    ? session.handshake.negotiatedRules
    : DEFAULT_ZONE_RULES;

  return {
    ...session,
    zone: undefined,
    optIn: undefined,
    effectiveRules,
    state: session.handshake ? 'handshake_active' : 'discovering',
    events: [...session.events, event],
  };
}

/**
 * End a session. All spatial rules dissolve.
 */
export function endSession(session: SpatialSession): SpatialSession {
  return {
    ...session,
    state: 'ended',
    endedAt: Date.now(),
    effectiveRules: DEFAULT_ZONE_RULES,
  };
}

// ─── Spatial Intent Evaluation ───────────────────────────────────────────────

export type SpatialVerdict = {
  allowed: boolean;
  requiresConfirmation: boolean;
  blockedBy: 'none' | 'zone' | 'handshake' | 'zone+handshake';
  reason: string;
  rule: string;
};

/**
 * Map an intent to the relevant zone rule field.
 */
const INTENT_TO_RULE: Record<string, keyof ZoneRules> = {
  // Camera intents
  'photo_capture': 'camera',
  'stream_start': 'camera',
  'restream_start': 'camera',

  // Microphone intents
  'transcription_start': 'microphone',
  'translation_start': 'microphone',
  'phone_passthrough_start': 'microphone',

  // AI data intents
  'ai_send_transcription': 'aiDataSend',
  'ai_send_image': 'aiDataSend',
  'ai_send_location': 'aiDataSend',

  // AI action intents
  'ai_auto_action': 'aiActions',
  'ai_auto_purchase': 'aiActions',
  'ai_auto_respond_message': 'aiActions',

  // AI overlay intents
  'display_text_wall': 'aiOverlay',
  'display_double_text_wall': 'aiOverlay',
  'display_image': 'aiOverlay',

  // Data retention
  'ai_retain_session_data': 'dataRetention',

  // Location
  'location_get_current': 'locationSharing',
  'location_start_tracking': 'locationSharing',

  // Third-party sharing
  'ai_share_with_third_party': 'aiDataSend',
};

/**
 * Evaluate an intent against the current spatial governance context.
 *
 * This is the spatial layer — it sits between user rules and the
 * platform world in the governance stack.
 */
export function evaluateSpatial(
  intent: string,
  session: SpatialSession,
): SpatialVerdict {
  const ruleKey = INTENT_TO_RULE[intent];

  if (!ruleKey) {
    // Intent not covered by spatial governance — allow through
    return {
      allowed: true,
      requiresConfirmation: false,
      blockedBy: 'none',
      reason: 'Intent not governed by spatial rules',
      rule: 'none',
    };
  }

  const effectiveValue = session.effectiveRules[ruleKey] as string;

  // Determine verdict based on the rule value
  if (effectiveValue === 'blocked') {
    // Figure out who blocked it
    const zoneBlocks = session.zone && (session.optIn?.effectiveRules[ruleKey] === 'blocked');
    const handshakeBlocks = session.handshake && (session.handshake.negotiatedRules[ruleKey] === 'blocked');

    let blockedBy: SpatialVerdict['blockedBy'] = 'none';
    if (zoneBlocks && handshakeBlocks) blockedBy = 'zone+handshake';
    else if (zoneBlocks) blockedBy = 'zone';
    else if (handshakeBlocks) blockedBy = 'handshake';

    const source = blockedBy === 'zone'
      ? `zone "${session.zone?.name}"`
      : blockedBy === 'handshake'
        ? `handshake (${session.handshake?.participants.length} participants)`
        : blockedBy === 'zone+handshake'
          ? `zone "${session.zone?.name}" + handshake`
          : 'spatial rules';

    return {
      allowed: false,
      requiresConfirmation: false,
      blockedBy,
      reason: `${intent} blocked by ${source}: ${ruleKey} = blocked`,
      rule: ruleKey,
    };
  }

  if (effectiveValue === 'confirm_each' || effectiveValue === 'confirm_all'
    || effectiveValue === 'non_obstructive' || effectiveValue === 'non_commercial'
    || effectiveValue === 'session_only' || effectiveValue === 'declared_only') {
    return {
      allowed: false,
      requiresConfirmation: true,
      blockedBy: 'none',
      reason: `${intent} requires confirmation: ${ruleKey} = ${effectiveValue}`,
      rule: ruleKey,
    };
  }

  // 'allowed', 'standard', etc.
  return {
    allowed: true,
    requiresConfirmation: false,
    blockedBy: 'none',
    reason: `${intent} allowed by spatial rules`,
    rule: ruleKey,
  };
}

// ─── Emergency Override ──────────────────────────────────────────────────────

/**
 * Emergency override for spatial governance.
 *
 * When activated, ALL spatial rules (zone + handshake) are bypassed.
 * Only MentraOS platform constraints remain (hardware capability, physics).
 *
 * Use case: You're in a store that blocks recording. Someone gets violent.
 * You need to film, call for help, stream to emergency contacts.
 * Emergency override smashes through every zone and handshake rule.
 *
 * The user is king. Always.
 *
 * In the MentraOS adapter, this is wired to the executor's
 * activateEmergencyOverride() method, which also skips user rules
 * and platform governance — leaving only hardware constraints.
 *
 * Returns a new session in emergency mode with all rules dissolved.
 */
export function activateEmergencyOverride(session: SpatialSession): SpatialSession {
  const event: SpatialEvent = {
    type: 'zone_exited',
    zoneId: session.zone?.zoneId ?? 'emergency',
    timestamp: Date.now(),
  };

  return {
    ...session,
    effectiveRules: DEFAULT_ZONE_RULES, // Everything allowed
    state: 'active',
    events: [...session.events, event],
  };
}

/**
 * Evaluate an intent during emergency override — always allow.
 * The only thing that can still block is hardware (physics).
 */
export function evaluateSpatialEmergency(_intent: string): SpatialVerdict {
  return {
    allowed: true,
    requiresConfirmation: false,
    blockedBy: 'none',
    reason: 'Emergency override active — all spatial rules bypassed',
    rule: 'emergency',
  };
}

// ─── Zone Templates ──────────────────────────────────────────────────────────

/**
 * Pre-built zone rule templates for common location types.
 * Zones can start from a template and customize.
 */
export const ZONE_TEMPLATES: Record<string, ZoneRules> = {
  /** Coffee shop — relaxed, but no recording without asking */
  cafe: {
    ...DEFAULT_ZONE_RULES,
    camera: 'confirm_each',
    microphone: 'allowed',
    aiRecommendations: 'non_commercial',
    bystanderProtection: 'elevated',
  },

  /** Hospital — strict, PHI-aware, no unauthorized recording */
  healthcare: {
    ...DEFAULT_ZONE_RULES,
    camera: 'blocked',
    microphone: 'confirm_each',
    aiDataSend: 'confirm_each',
    aiActions: 'blocked',
    aiRecommendations: 'blocked',
    locationSharing: 'blocked',
    dataRetention: 'blocked',
    commercialAI: 'blocked',
    bystanderProtection: 'strict',
  },

  /** Retail store — allow browsing AI, block price surveillance */
  retail: {
    ...DEFAULT_ZONE_RULES,
    camera: 'confirm_each',
    aiRecommendations: 'non_commercial',
    commercialAI: 'blocked',
    bystanderProtection: 'elevated',
  },

  /** Office / workplace — allow productivity AI, restrict recording */
  workplace: {
    ...DEFAULT_ZONE_RULES,
    camera: 'blocked',
    microphone: 'confirm_each',
    aiDataSend: 'declared_only',
    dataRetention: 'session_only',
    bystanderProtection: 'elevated',
  },

  /** Concert / live event — no recording, no streaming */
  entertainment: {
    ...DEFAULT_ZONE_RULES,
    camera: 'blocked',
    microphone: 'blocked',
    aiOverlay: 'non_obstructive',
    dataRetention: 'blocked',
    bystanderProtection: 'strict',
  },

  /** Library / museum — quiet, no recording, non-obstructive only */
  education: {
    ...DEFAULT_ZONE_RULES,
    camera: 'blocked',
    microphone: 'blocked',
    aiOverlay: 'non_obstructive',
    aiRecommendations: 'non_commercial',
    commercialAI: 'blocked',
    bystanderProtection: 'elevated',
  },

  /** Religious space — absolute privacy and respect */
  religious: {
    ...DEFAULT_ZONE_RULES,
    camera: 'blocked',
    microphone: 'blocked',
    aiDataSend: 'blocked',
    aiActions: 'blocked',
    aiRecommendations: 'blocked',
    aiOverlay: 'blocked',
    dataRetention: 'blocked',
    commercialAI: 'blocked',
    bystanderProtection: 'strict',
  },

  /** Home — fully permissive (user's own space) */
  home: {
    ...DEFAULT_ZONE_RULES,
  },

  /** Public transit — moderate restrictions */
  transit: {
    ...DEFAULT_ZONE_RULES,
    camera: 'confirm_each',
    microphone: 'allowed',
    bystanderProtection: 'elevated',
  },
};
