/**
 * Spatial Governance — Module Index
 *
 * Location-aware, multi-user, consent-based governance for smart glasses.
 *
 * This module is future-ready. It works today but doesn't require spatial
 * hardware. When MentraOS + Auki go spatial, this is the governance layer.
 *
 * Usage:
 *
 *   import {
 *     createSession,
 *     createOptIn,
 *     applyZoneToSession,
 *     startHandshake,
 *     joinHandshake,
 *     applyHandshakeToSession,
 *     evaluateSpatial,
 *     ZONE_TEMPLATES,
 *   } from '@neuroverseos/governance/spatial';
 */

// Types
export type {
  Zone,
  ZonePublisher,
  ZoneType,
  ZoneDiscovery,
  ZoneBoundary,
  ZoneRules,
  ZoneCustomRule,
  ZoneOptIn,
  SpatialHandshake,
  HandshakeParticipant,
  ParticipantConstraints,
  SpatialSession,
  SpatialEvent,
} from './types';

export {
  DEFAULT_ZONE_RULES,
  DEFAULT_PARTICIPANT_CONSTRAINTS,
} from './types';

// Engine
export {
  mergeRules,
  constraintsToRules,
  createOptIn,
  startHandshake,
  joinHandshake,
  leaveHandshake,
  createSession,
  applyZoneToSession,
  applyHandshakeToSession,
  exitZone,
  endSession,
  evaluateSpatial,
  activateEmergencyOverride,
  evaluateSpatialEmergency,
  ZONE_TEMPLATES,
} from './engine';

export type { SpatialVerdict } from './engine';

// Example zones
export {
  BLUE_BOTTLE_HAYES,
  UCSF_MEDICAL,
  APPLE_UNION_SQUARE,
  CHASE_CENTER,
  WEWORK_SOMA,
  SFMOMA,
  MY_HOME,
  EXAMPLE_ZONES,
} from './zones/example-zones';
