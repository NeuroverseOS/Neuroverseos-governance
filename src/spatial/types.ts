/**
 * Spatial Governance — Type Definitions
 *
 * This module defines the future of AI governance on smart glasses:
 * location-aware, multi-user, consent-based, and temporary.
 *
 * The core insight: when AI lives on your face, governance can't be
 * static. The rules that apply at home are different from the rules
 * at a hospital. The rules that apply when you're alone are different
 * from when you're in a shared AR space with three other people.
 *
 * Key concepts:
 *
 *   Zone        — A physical or spatial location that publishes governance rules.
 *                 A coffee shop, a hospital, a concert venue, an office.
 *                 Zones are discovered via Auki spatial anchors, BLE beacons,
 *                 geofence, or manual opt-in.
 *
 *   ZoneRules   — The governance rules a zone publishes. "In this space,
 *                 no recording. In this space, no AI recommendations.
 *                 In this space, PHI stays in-network."
 *
 *   OptIn       — The user's decision to accept a zone's rules. Always
 *                 explicit. Never forced. You can refuse — but the zone
 *                 may refuse you entry (e.g., hospital requiring no recording).
 *
 *   Handshake   — When multiple AR-enabled people are in the same space,
 *                 their governance layers negotiate. The result is a
 *                 shared governance context where "most restrictive wins."
 *
 *   Session     — A spatial governance session. Begins when you enter a zone
 *                 or join a handshake. Ends when you leave. Rules are
 *                 temporary — they dissolve when the session ends.
 *
 * Architecture:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ Governance Stack (top wins)                                 │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │ 1. User Rules        — Personal, permanent, cross-app      │
 *   │ 2. Spatial Handshake  — Multi-user, most-restrictive-wins   │
 *   │ 3. Zone Rules         — Location-specific, temporary        │
 *   │ 4. Platform World     — MentraOS hardware + safety          │
 *   │ 5. App World          — App-specific rules                  │
 *   └─────────────────────────────────────────────────────────────┘
 *
 *   User rules ALWAYS win. A zone cannot relax your personal rules.
 *   A zone CAN tighten them. A handshake applies the union of all
 *   participants' restrictions.
 *
 * This module exists for the future. It works today but doesn't
 * require spatial hardware. When Auki + MentraOS go spatial,
 * this is ready.
 */

// ─── Zone Types ──────────────────────────────────────────────────────────────

/**
 * A spatial zone — a physical or virtual location that publishes governance rules.
 *
 * Zones are discovered, not hardcoded. The discovery mechanism depends on
 * the available technology:
 *   - Auki spatial anchors (AR-native, precise)
 *   - BLE beacons (indoor, range-limited)
 *   - Geofence (GPS, coarse)
 *   - QR code / NFC tap (manual opt-in)
 *   - Manual selection (user picks from nearby zones)
 */
export interface Zone {
  /** Unique zone identifier */
  zoneId: string;

  /** Human-readable name ("Blue Bottle Coffee — Hayes Valley") */
  name: string;

  /** Who publishes this zone's rules */
  publisher: ZonePublisher;

  /** The governance rules this zone enforces */
  rules: ZoneRules;

  /** How this zone was discovered */
  discovery: ZoneDiscovery;

  /** Zone type — affects default rule templates */
  type: ZoneType;

  /** Whether this zone requires opt-in to enter (e.g., hospital) */
  requiresOptIn: boolean;

  /** Human-readable explanation of why these rules exist */
  rationale: string;

  /** Zone boundary definition (optional — for geofence/spatial) */
  boundary?: ZoneBoundary;

  /** When this zone's rules were last updated */
  rulesUpdatedAt: number;

  /** Zone version — incremented when rules change */
  version: string;
}

export interface ZonePublisher {
  /** Publisher name ("Blue Bottle Coffee", "UCSF Medical Center") */
  name: string;

  /** Publisher type */
  type: 'business' | 'institution' | 'government' | 'community' | 'individual';

  /** Verified by MentraOS / NeuroverseOS (signed zone) */
  verified: boolean;
}

export type ZoneType =
  | 'public_space'       // Park, sidewalk, plaza
  | 'retail'             // Store, mall, market
  | 'hospitality'        // Restaurant, cafe, bar, hotel
  | 'healthcare'         // Hospital, clinic, pharmacy
  | 'workplace'          // Office, coworking, factory
  | 'education'          // School, university, library
  | 'entertainment'      // Concert, theater, museum, sports venue
  | 'transit'            // Airport, train station, bus
  | 'residential'        // Home, apartment building
  | 'religious'          // Church, temple, mosque
  | 'government'         // Courthouse, DMV, embassy
  | 'custom';            // User-defined

export type ZoneDiscovery =
  | { method: 'auki_anchor'; anchorId: string; confidence: number }
  | { method: 'ble_beacon'; beaconId: string; rssi: number }
  | { method: 'geofence'; lat: number; lng: number; radiusMeters: number }
  | { method: 'qr_code'; payload: string }
  | { method: 'nfc_tap'; tagId: string }
  | { method: 'manual'; selectedAt: number };

export interface ZoneBoundary {
  /** Boundary type */
  type: 'radius' | 'polygon' | 'spatial_volume';

  /** For radius: center point + radius in meters */
  center?: { lat: number; lng: number; altitude?: number };
  radiusMeters?: number;

  /** For polygon: ordered list of points */
  polygon?: Array<{ lat: number; lng: number }>;

  /** For spatial_volume: Auki spatial anchor + dimensions */
  spatialAnchor?: { anchorId: string; widthM: number; heightM: number; depthM: number };
}

// ─── Zone Rules ──────────────────────────────────────────────────────────────

/**
 * The governance rules a zone publishes.
 *
 * These are not suggestions — they're constraints that apply when you
 * opt into the zone. But they can ONLY tighten, never relax. If your
 * personal rules already block recording, a zone that allows recording
 * doesn't change anything for you.
 */
export interface ZoneRules {
  /** Camera policy in this zone */
  camera: 'allowed' | 'confirm_each' | 'blocked';

  /** Microphone / recording policy */
  microphone: 'allowed' | 'confirm_each' | 'blocked';

  /** AI data send policy (sending captured data to AI providers) */
  aiDataSend: 'allowed' | 'declared_only' | 'confirm_each' | 'blocked';

  /** AI action policy (AI taking actions on user's behalf) */
  aiActions: 'allowed' | 'confirm_all' | 'blocked';

  /** AI recommendations / suggestions policy */
  aiRecommendations: 'allowed' | 'non_commercial' | 'blocked';

  /** Location sharing policy */
  locationSharing: 'allowed' | 'confirm_each' | 'blocked';

  /** Display behavior — can AI overlay content in this space? */
  aiOverlay: 'allowed' | 'non_obstructive' | 'blocked';

  /** Data retention — can apps retain data captured in this zone? */
  dataRetention: 'allowed' | 'session_only' | 'blocked';

  /** Commercial behavior — can AI suggest purchases, compare prices? */
  commercialAI: 'allowed' | 'blocked';

  /** Bystander protection — are there non-consenting people present? */
  bystanderProtection: 'standard' | 'elevated' | 'strict';

  /** Custom constraints (zone-specific) */
  custom?: ZoneCustomRule[];
}

export interface ZoneCustomRule {
  /** Rule identifier */
  id: string;

  /** Human-readable description */
  description: string;

  /** What intent this blocks/modifies */
  targetIntent: string;

  /** What happens */
  effect: 'block' | 'confirm' | 'modify';

  /** Why this rule exists */
  rationale: string;
}

// ─── Opt-In / Consent ────────────────────────────────────────────────────────

/**
 * A user's opt-in decision for a zone.
 *
 * Opt-in is ALWAYS explicit. The glasses show the zone's rules,
 * the user taps to accept or decline. If they decline, they can
 * still be in the physical space — but the zone's rules don't apply
 * (and the zone may display "AI recording not permitted" signs).
 */
export interface ZoneOptIn {
  /** The zone being opted into */
  zoneId: string;

  /** When the user opted in */
  optedInAt: number;

  /** How the user opted in */
  method: 'tap_confirm' | 'voice_confirm' | 'auto_recognized';

  /** Which rules the user accepted */
  acceptedRules: ZoneRules;

  /** Whether the user made any personal overrides to zone rules */
  userOverrides: Partial<ZoneRules>;

  /** The effective rules (zone rules + user overrides, most restrictive wins) */
  effectiveRules: ZoneRules;

  /** Session identifier — links to the spatial session */
  sessionId: string;
}

// ─── Spatial Handshake ───────────────────────────────────────────────────────

/**
 * A spatial handshake — multi-user governance negotiation.
 *
 * When multiple people wearing AR glasses are in the same space,
 * their governance layers need to compose. The handshake protocol:
 *
 *   1. Discovery — glasses detect nearby participants (Auki, BLE, etc.)
 *   2. Announce — each participant shares their governance requirements
 *      (NOT their personal data — just their constraints)
 *   3. Negotiate — the system computes the most restrictive union
 *   4. Apply — all participants operate under the shared constraints
 *   5. Dissolve — when someone leaves, the handshake recomputes
 *
 * The "most restrictive wins" invariant is absolute:
 *   - If ONE person blocks recording, NO ONE can record
 *   - If ONE person requires AI confirmation, EVERYONE confirms
 *   - If ONE person blocks AI recommendations, NO ONE gets them
 *
 * This protects the most privacy-conscious person in any shared space.
 */
export interface SpatialHandshake {
  /** Unique handshake identifier */
  handshakeId: string;

  /** Participants in the handshake */
  participants: HandshakeParticipant[];

  /** The negotiated governance rules (most restrictive union) */
  negotiatedRules: ZoneRules;

  /** The zone this handshake is happening in (if any) */
  zoneId?: string;

  /** When the handshake was created */
  createdAt: number;

  /** When the handshake was last re-negotiated */
  lastNegotiatedAt: number;

  /** Handshake state */
  state: 'negotiating' | 'active' | 'dissolved';
}

export interface HandshakeParticipant {
  /** Participant identifier (anonymous — not their real identity) */
  participantId: string;

  /** What this participant shares (their governance requirements) */
  publishedConstraints: ParticipantConstraints;

  /** When they joined the handshake */
  joinedAt: number;

  /** Whether they've acknowledged the negotiated rules */
  acknowledged: boolean;
}

/**
 * What a participant shares during handshake negotiation.
 *
 * This is NOT personal data. It's governance metadata.
 * "I require no recording" is a constraint, not an identity.
 */
export interface ParticipantConstraints {
  /** This participant's camera policy (their minimum requirement) */
  cameraMinimum: 'allowed' | 'confirm_each' | 'blocked';

  /** This participant's microphone policy */
  microphoneMinimum: 'allowed' | 'confirm_each' | 'blocked';

  /** This participant's AI data send policy */
  aiDataSendMinimum: 'allowed' | 'declared_only' | 'confirm_each' | 'blocked';

  /** This participant's AI recommendation policy */
  aiRecommendationsMinimum: 'allowed' | 'non_commercial' | 'blocked';

  /** This participant's data retention policy */
  dataRetentionMinimum: 'allowed' | 'session_only' | 'blocked';

  /** This participant's bystander protection level */
  bystanderProtectionMinimum: 'standard' | 'elevated' | 'strict';
}

// ─── Spatial Session ─────────────────────────────────────────────────────────

/**
 * A spatial governance session.
 *
 * Begins when you enter a zone or join a handshake.
 * Ends when you leave. Rules are temporary.
 *
 * This is the runtime state. It holds the effective governance
 * context that the guard engine evaluates against.
 */
export interface SpatialSession {
  /** Session identifier */
  sessionId: string;

  /** Active zone (if in one) */
  zone?: Zone;

  /** Active opt-in (if opted into a zone) */
  optIn?: ZoneOptIn;

  /** Active handshake (if in a multi-user context) */
  handshake?: SpatialHandshake;

  /** The effective spatial rules (zone + handshake + user, most restrictive wins) */
  effectiveRules: ZoneRules;

  /** Session state */
  state: 'discovering' | 'opted_in' | 'handshake_active' | 'active' | 'ended';

  /** When this session started */
  startedAt: number;

  /** When this session ended (null if active) */
  endedAt: number | null;

  /** Audit trail of governance events during this session */
  events: SpatialEvent[];
}

export type SpatialEvent =
  | { type: 'zone_discovered'; zone: Zone; timestamp: number }
  | { type: 'zone_opted_in'; zoneId: string; timestamp: number }
  | { type: 'zone_declined'; zoneId: string; reason: string; timestamp: number }
  | { type: 'zone_exited'; zoneId: string; timestamp: number }
  | { type: 'handshake_started'; handshakeId: string; participantCount: number; timestamp: number }
  | { type: 'handshake_participant_joined'; handshakeId: string; participantId: string; timestamp: number }
  | { type: 'handshake_participant_left'; handshakeId: string; participantId: string; timestamp: number }
  | { type: 'handshake_negotiated'; handshakeId: string; timestamp: number }
  | { type: 'handshake_dissolved'; handshakeId: string; timestamp: number }
  | { type: 'rule_tightened'; rule: string; from: string; to: string; source: string; timestamp: number }
  | { type: 'intent_blocked_by_zone'; intent: string; zoneId: string; timestamp: number }
  | { type: 'intent_blocked_by_handshake'; intent: string; handshakeId: string; timestamp: number };

// ─── Default Rules ───────────────────────────────────────────────────────────

/** Default zone rules — permissive baseline (zones tighten, never relax) */
export const DEFAULT_ZONE_RULES: ZoneRules = {
  camera: 'allowed',
  microphone: 'allowed',
  aiDataSend: 'allowed',
  aiActions: 'allowed',
  aiRecommendations: 'allowed',
  locationSharing: 'allowed',
  aiOverlay: 'allowed',
  dataRetention: 'allowed',
  commercialAI: 'allowed',
  bystanderProtection: 'standard',
};

/** Default participant constraints — fully permissive (participant tightens) */
export const DEFAULT_PARTICIPANT_CONSTRAINTS: ParticipantConstraints = {
  cameraMinimum: 'allowed',
  microphoneMinimum: 'allowed',
  aiDataSendMinimum: 'allowed',
  aiRecommendationsMinimum: 'allowed',
  dataRetentionMinimum: 'allowed',
  bystanderProtectionMinimum: 'standard',
};
