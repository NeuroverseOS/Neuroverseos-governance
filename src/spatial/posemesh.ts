/**
 * Posemesh Adapter — Real Spatial Discovery via Auki's Posemesh Network
 *
 * This adapter replaces fake zone discovery with real posemesh domain events.
 * Posemesh is Auki Labs' decentralized spatial computing protocol.
 *
 * How it works:
 *
 *   1. Device runs a posemesh node (via libposemesh SDK — native, WASM, or mobile)
 *   2. Device scans a portal (QR code / ArUco marker) to calibrate into a domain
 *   3. Domain = a shared spatial session with governance rules attached
 *   4. DomainCluster::join() triggers zone entry in our governance engine
 *   5. Other participants in the same domain trigger handshake negotiation
 *   6. When the device leaves the domain cluster, zone rules dissolve
 *
 * Posemesh concepts → NeuroverseOS governance concepts:
 *
 *   Posemesh Domain      → Zone (a physical space with governance rules)
 *   Domain ID            → Zone ID (unique, on-chain, created by burning $AUKI)
 *   DomainCluster        → The set of participants currently in a zone
 *   Cluster::join()      → Zone opt-in + handshake entry
 *   Cluster::leave()     → Zone exit + handshake dissolution
 *   Participant keypair   → HandshakeParticipant identity (secp256k1)
 *   Portal scan (QR)     → Zone discovery event
 *   Relay (Hagall)       → Transport layer for handshake negotiation
 *   Public domain        → Zone with requiresOptIn = false
 *   Dedicated domain     → Zone with requiresOptIn = true (restricted writes)
 *
 * This module provides:
 *   - Type definitions that mirror real posemesh primitives
 *   - An event adapter that converts posemesh events to governance events
 *   - A PosemeshGovernanceSession that wraps SpatialSession with domain lifecycle
 *
 * Integration:
 *   The consuming app (e.g., MentraOS) runs libposemesh and feeds domain events
 *   into this adapter. The adapter produces governance session updates.
 *   We don't depend on libposemesh directly — we define the event interface
 *   and the platform bridges it.
 *
 * Reference: https://github.com/aukilabs/posemesh
 */

import type {
  Zone,
  ZoneRules,
  ZoneDiscovery,
  SpatialSession,
  SpatialEvent,
  ParticipantConstraints,
  HandshakeParticipant,
} from './types';
import { DEFAULT_ZONE_RULES, DEFAULT_PARTICIPANT_CONSTRAINTS } from './types';
import {
  createSession,
  createOptIn,
  applyZoneToSession,
  startHandshake,
  joinHandshake,
  leaveHandshake,
  applyHandshakeToSession,
  exitZone,
  endSession,
  evaluateSpatial,
  activateEmergencyOverride,
  evaluateSpatialEmergency,
  ZONE_TEMPLATES,
} from './engine';
import type { SpatialVerdict } from './engine';

// ─── Posemesh Primitives ─────────────────────────────────────────────────────
// These mirror the real posemesh protocol types.
// The consuming platform (MentraOS) bridges from libposemesh to these.

/**
 * A posemesh domain — the fundamental unit of shared space.
 *
 * Created on-chain by burning $AUKI tokens. Requires minimum 3 landmarks
 * (portals) to establish a coordinate system. Domains are transferable.
 *
 * A domain IS a zone. When a device calibrates into a domain,
 * it discovers the zone's governance rules.
 */
export interface PosemeshDomain {
  /** On-chain domain ID (ERC-1155 NFT) */
  domainId: string;

  /** Human-readable domain name */
  name: string;

  /** Domain access mode — public (anyone) or dedicated (restricted writes) */
  accessMode: 'public' | 'dedicated';

  /** Domain owner's public key (secp256k1) */
  ownerPublicKey: string;

  /** Governance rules attached to this domain (stored off-chain, hash on-chain) */
  governanceRules?: ZoneRules;

  /** Domain metadata — who published these rules */
  publisher?: {
    name: string;
    type: 'business' | 'institution' | 'government' | 'community' | 'individual';
    verified: boolean;
  };

  /** Zone type for template matching */
  zoneType?: Zone['type'];

  /** Human-readable rationale for the domain's governance rules */
  rationale?: string;
}

/**
 * A posemesh participant — identified by secp256k1 keypair.
 *
 * In posemesh, participants are pseudonymous. Their public key identifies
 * them in the network, but it's not linked to a real identity.
 * This maps perfectly to our handshake model — participants share
 * governance constraints, not personal data.
 */
export interface PosemeshParticipant {
  /** Participant's public key (secp256k1, hex-encoded) */
  publicKey: string;

  /** Participant's node ID in the posemesh network */
  nodeId: string;

  /** Participant's governance constraints (shared during handshake) */
  constraints: ParticipantConstraints;

  /** Capabilities this participant advertises */
  capabilities?: string[];
}

/**
 * A posemesh portal — a physical landmark (QR code / ArUco marker)
 * that anchors a domain to physical space.
 *
 * Scanning a portal is how you discover and calibrate into a domain.
 * Minimum 3 portals define a domain's coordinate system.
 */
export interface PosemeshPortal {
  /** Portal identifier */
  portalId: string;

  /** The domain this portal belongs to */
  domainId: string;

  /** Portal type */
  type: 'qr_code' | 'aruco_marker' | 'nfc';

  /** Portal payload (URL, governance hash, etc.) */
  payload: string;

  /** Physical size in meters (e.g., 0.05 for a 5cm QR code) */
  sizeMeters: number;

  /** Portal's pose within the domain coordinate system */
  pose?: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
  };
}

// ─── Posemesh Events ─────────────────────────────────────────────────────────
// These are the events that libposemesh emits. The platform bridges them
// to our adapter.

export type PosemeshEvent =
  /** Device scanned a portal and discovered a domain */
  | {
      type: 'portal_scanned';
      portal: PosemeshPortal;
      domain: PosemeshDomain;
      calibrationConfidence: number;
      timestamp: number;
    }
  /** Device successfully joined a domain cluster */
  | {
      type: 'cluster_joined';
      domainId: string;
      participantCount: number;
      timestamp: number;
    }
  /** Another participant joined the same domain cluster */
  | {
      type: 'participant_joined';
      domainId: string;
      participant: PosemeshParticipant;
      timestamp: number;
    }
  /** A participant left the domain cluster */
  | {
      type: 'participant_left';
      domainId: string;
      participantPublicKey: string;
      timestamp: number;
    }
  /** Device left or was disconnected from the domain cluster */
  | {
      type: 'cluster_left';
      domainId: string;
      reason: 'user_exit' | 'out_of_range' | 'connection_lost' | 'domain_closed';
      timestamp: number;
    }
  /** Domain governance rules were updated by the owner */
  | {
      type: 'domain_rules_updated';
      domainId: string;
      newRules: ZoneRules;
      timestamp: number;
    }
  /** Handshake negotiation completed via relay */
  | {
      type: 'handshake_negotiated';
      domainId: string;
      participantCount: number;
      negotiatedRules: ZoneRules;
      timestamp: number;
    };

// ─── Domain → Zone Conversion ────────────────────────────────────────────────

/**
 * Convert a posemesh domain to a NeuroverseOS Zone.
 *
 * This is the bridge between posemesh's domain model and our governance model.
 * A domain IS a zone — it's a physical space with governance rules.
 */
export function domainToZone(
  domain: PosemeshDomain,
  discovery: ZoneDiscovery,
): Zone {
  const rules = domain.governanceRules
    ?? (domain.zoneType ? ZONE_TEMPLATES[domain.zoneType] : undefined)
    ?? DEFAULT_ZONE_RULES;

  return {
    zoneId: `posemesh:${domain.domainId}`,
    name: domain.name,
    publisher: domain.publisher ?? {
      name: 'Unknown',
      type: 'community',
      verified: false,
    },
    rules,
    discovery,
    type: domain.zoneType ?? 'custom',
    requiresOptIn: domain.accessMode === 'dedicated',
    rationale: domain.rationale ?? `Posemesh domain: ${domain.name}`,
    rulesUpdatedAt: Date.now(),
    version: '1.0.0',
  };
}

/**
 * Create a ZoneDiscovery from a portal scan event.
 */
export function portalToDiscovery(
  portal: PosemeshPortal,
  confidence: number,
): ZoneDiscovery {
  return {
    method: 'posemesh_domain',
    domainId: portal.domainId,
    portalId: portal.portalId,
    portalType: portal.type,
    calibrationConfidence: confidence,
  };
}

// ─── Posemesh Governance Session ─────────────────────────────────────────────

/**
 * A governance session backed by real posemesh domain events.
 *
 * This wraps our SpatialSession and handles the full domain lifecycle:
 * portal scan → cluster join → participant handshake → cluster leave.
 *
 * Usage:
 *
 *   const pgSession = new PosemeshGovernanceSession();
 *
 *   // Platform feeds posemesh events as they happen
 *   pgSession.handleEvent({ type: 'portal_scanned', ... });
 *   pgSession.handleEvent({ type: 'cluster_joined', ... });
 *   pgSession.handleEvent({ type: 'participant_joined', ... });
 *
 *   // Evaluate intents against current spatial governance
 *   const verdict = pgSession.evaluate('photo_capture');
 *
 *   // Emergency override
 *   pgSession.activateEmergency();
 */
export class PosemeshGovernanceSession {
  private _session: SpatialSession;
  private _domain: PosemeshDomain | null = null;
  private _selfPublicKey: string;
  private _selfConstraints: ParticipantConstraints;
  private _emergency = false;
  private _eventLog: PosemeshEvent[] = [];

  constructor(
    selfPublicKey: string,
    selfConstraints: ParticipantConstraints = DEFAULT_PARTICIPANT_CONSTRAINTS,
  ) {
    this._session = createSession();
    this._selfPublicKey = selfPublicKey;
    this._selfConstraints = selfConstraints;
  }

  /** Current governance session state */
  get session(): SpatialSession { return this._session; }

  /** Current posemesh domain (null if not in a domain) */
  get domain(): PosemeshDomain | null { return this._domain; }

  /** Whether emergency override is active */
  get isEmergency(): boolean { return this._emergency; }

  /** Current effective rules */
  get effectiveRules(): ZoneRules { return this._session.effectiveRules; }

  /** Full event log (posemesh events received) */
  get eventLog(): readonly PosemeshEvent[] { return this._eventLog; }

  /**
   * Handle a posemesh event. This is the main entry point.
   * The platform calls this whenever libposemesh emits an event.
   */
  handleEvent(event: PosemeshEvent): void {
    this._eventLog.push(event);

    switch (event.type) {
      case 'portal_scanned':
        this._onPortalScanned(event);
        break;
      case 'cluster_joined':
        this._onClusterJoined(event);
        break;
      case 'participant_joined':
        this._onParticipantJoined(event);
        break;
      case 'participant_left':
        this._onParticipantLeft(event);
        break;
      case 'cluster_left':
        this._onClusterLeft(event);
        break;
      case 'domain_rules_updated':
        this._onDomainRulesUpdated(event);
        break;
      case 'handshake_negotiated':
        // External negotiation result (e.g., from relay)
        // Our local handshake already handles this, but this allows
        // the platform to override with a relay-computed result
        break;
    }
  }

  /**
   * Evaluate an intent against current spatial governance.
   */
  evaluate(intent: string): SpatialVerdict {
    if (this._emergency) {
      return evaluateSpatialEmergency(intent);
    }
    return evaluateSpatial(intent, this._session);
  }

  /**
   * Activate emergency override. All spatial rules dissolve.
   * Only hardware constraints remain.
   */
  activateEmergency(): void {
    this._emergency = true;
    this._session = activateEmergencyOverride(this._session);
  }

  /**
   * Deactivate emergency override. Spatial rules are restored.
   */
  deactivateEmergency(): void {
    this._emergency = false;
    // Re-apply domain rules if still in a domain
    if (this._domain && this._session.zone) {
      const optIn = createOptIn(this._session.zone);
      this._session = applyZoneToSession(this._session, this._session.zone, optIn);
    }
  }

  /**
   * End the session. All spatial rules dissolve.
   */
  end(): void {
    this._session = endSession(this._session);
    this._domain = null;
  }

  // ─── Private Event Handlers ──────────────────────────────────────────────

  private _onPortalScanned(event: Extract<PosemeshEvent, { type: 'portal_scanned' }>) {
    this._domain = event.domain;

    // Convert domain to zone
    const discovery = portalToDiscovery(event.portal, event.calibrationConfidence);
    const zone = domainToZone(event.domain, discovery);

    // Create opt-in (for public domains, this is automatic;
    // for dedicated domains, the platform should prompt the user first)
    const optIn = createOptIn(zone);

    // Apply zone to session
    this._session = applyZoneToSession(this._session, zone, optIn);

    // Start a handshake with ourselves as the first participant
    const handshake = startHandshake(
      this._selfConstraints,
      this._selfPublicKey,
      zone.zoneId,
    );
    this._session = applyHandshakeToSession(this._session, handshake);
  }

  private _onClusterJoined(_event: Extract<PosemeshEvent, { type: 'cluster_joined' }>) {
    // Cluster join confirms we're in the domain.
    // The zone was already applied during portal scan.
    // This event is informational — the governance state is already set.
  }

  private _onParticipantJoined(event: Extract<PosemeshEvent, { type: 'participant_joined' }>) {
    if (!this._session.handshake) return;

    // Another participant joined the domain cluster.
    // Add them to the handshake and renegotiate.
    const updatedHandshake = joinHandshake(
      this._session.handshake,
      event.participant.constraints,
      event.participant.publicKey,
    );
    this._session = applyHandshakeToSession(this._session, updatedHandshake);
  }

  private _onParticipantLeft(event: Extract<PosemeshEvent, { type: 'participant_left' }>) {
    if (!this._session.handshake) return;

    // Participant left. Remove from handshake and renegotiate.
    const result = leaveHandshake(
      this._session.handshake,
      event.participantPublicKey,
    );

    if (result) {
      this._session = applyHandshakeToSession(this._session, result);
    }
  }

  private _onClusterLeft(_event: Extract<PosemeshEvent, { type: 'cluster_left' }>) {
    // We left the domain cluster. All spatial rules dissolve.
    this._session = exitZone(this._session);
    this._domain = null;
  }

  private _onDomainRulesUpdated(event: Extract<PosemeshEvent, { type: 'domain_rules_updated' }>) {
    if (!this._domain || !this._session.zone) return;

    // Domain owner updated the governance rules.
    // Re-apply with new rules.
    this._domain = { ...this._domain, governanceRules: event.newRules };

    const zone: Zone = {
      ...this._session.zone,
      rules: event.newRules,
      rulesUpdatedAt: event.timestamp,
    };

    const optIn = createOptIn(zone);
    this._session = applyZoneToSession(this._session, zone, optIn);
  }
}

// ─── Discovery Type Extension ────────────────────────────────────────────────
// Re-export the posemesh-specific discovery type for use in Zone definitions.

/**
 * Posemesh-specific zone discovery.
 *
 * This extends the base ZoneDiscovery union with posemesh domain fields.
 * When a zone is discovered via posemesh, the discovery object contains
 * the domain ID, portal ID, and calibration confidence — all from the
 * real posemesh protocol, not fake GPS.
 */
export interface PosemeshDiscovery {
  method: 'posemesh_domain';
  /** The posemesh domain ID (on-chain) */
  domainId: string;
  /** The portal that was scanned to discover this domain */
  portalId: string;
  /** Portal type (QR, ArUco, NFC) */
  portalType: 'qr_code' | 'aruco_marker' | 'nfc';
  /** Calibration confidence (0-1) — how well the device is aligned to the domain */
  calibrationConfidence: number;
}
