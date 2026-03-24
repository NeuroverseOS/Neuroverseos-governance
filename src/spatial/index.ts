/**
 * Spatial Governance — Module Index
 *
 * Location-aware, multi-user, consent-based governance for smart glasses.
 *
 * Built on Auki's posemesh protocol for real spatial discovery.
 * Zones are posemesh domains. Discovery happens via portal scanning.
 * Handshakes ride on the posemesh relay (Hagall).
 *
 * Usage:
 *
 *   import {
 *     // Core spatial governance
 *     createSession,
 *     createOptIn,
 *     applyZoneToSession,
 *     startHandshake,
 *     joinHandshake,
 *     evaluateSpatial,
 *     ZONE_TEMPLATES,
 *
 *     // Posemesh integration (real spatial discovery)
 *     PosemeshGovernanceSession,
 *     domainToZone,
 *     portalToDiscovery,
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

// Posemesh integration
export {
  PosemeshGovernanceSession,
  domainToZone,
  portalToDiscovery,
} from './posemesh';

export type {
  PosemeshDomain,
  PosemeshParticipant,
  PosemeshPortal,
  PosemeshEvent,
  PosemeshDiscovery,
} from './posemesh';

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
