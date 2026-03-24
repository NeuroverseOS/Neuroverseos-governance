/**
 * Cactus Warehouse Zones — Posemesh-Governed Spatial Areas
 *
 * A Cactus warehouse deployment divides the space into governance zones.
 * Each zone is a posemesh domain with different rules for what AI and
 * AR participants can do.
 *
 * The domain operator (warehouse manager) configures zones once.
 * Every device — human glasses or robot — inherits the zone rules
 * when it calibrates into the domain via portal scan.
 *
 * Zone hierarchy:
 *   warehouse (parent domain)
 *   ├── receiving_dock    — incoming shipments, high-activity
 *   ├── storage_floor     — shelving, robot pickers active
 *   ├── packing_station   — order assembly, accuracy-critical
 *   ├── shipping_dock     — outgoing, time-sensitive
 *   ├── manager_office    — full access, reporting
 *   └── break_room        — off-duty, personal device use
 */

import type { Zone } from '../../../../src/spatial/types';
import { ZONE_TEMPLATES } from '../../../../src/spatial/engine';
import { DEFAULT_ZONE_RULES } from '../../../../src/spatial/types';

// ─── Warehouse-Specific Zone Rules ──────────────────────────────────────────

/**
 * Base warehouse rules. All sub-zones inherit from this.
 * - Camera allowed (inventory scanning, package reading)
 * - AI data send allowed (product lookup, routing)
 * - AI overlays allowed (pick lists, navigation arrows)
 * - No commercial AI (no price comparison in our warehouse)
 * - Session-only retention (shifts end, data clears)
 * - Elevated bystander protection (workers deserve privacy)
 */
const WAREHOUSE_BASE_RULES = {
  ...DEFAULT_ZONE_RULES,
  camera: 'allowed' as const,
  microphone: 'allowed' as const,
  aiDataSend: 'declared_only' as const,
  aiActions: 'confirm_all' as const,
  aiRecommendations: 'allowed' as const,
  aiOverlay: 'allowed' as const,
  dataRetention: 'session_only' as const,
  commercialAI: 'blocked' as const,
  bystanderProtection: 'elevated' as const,
};

// ─── Zone Definitions ────────────────────────────────────────────────────────

export const RECEIVING_DOCK: Zone = {
  zoneId: 'cactus:warehouse-001:receiving',
  name: 'Receiving Dock',
  publisher: {
    name: 'Cactus Warehouse Operations',
    type: 'business',
    verified: true,
  },
  rules: {
    ...WAREHOUSE_BASE_RULES,
    // Receiving is fast-paced — AI can auto-log incoming shipments
    aiActions: 'allowed',
    custom: [
      {
        id: 'auto-log-shipment',
        description: 'AI can auto-log incoming shipments by scanning package labels',
        targetIntent: 'ai_auto_action',
        effect: 'modify',
        rationale: 'Speed is critical at the dock. Auto-logging reduces check-in time.',
      },
      {
        id: 'no-personal-camera',
        description: 'Camera use must be work-related (no personal photos)',
        targetIntent: 'photo_capture',
        effect: 'confirm',
        rationale: 'Shipment contents may be confidential to customers.',
      },
    ],
  },
  discovery: {
    method: 'posemesh_domain',
    domainId: 'posemesh:cactus-wh001-receiving',
    portalId: 'portal-receiving-entrance-qr',
    portalType: 'qr_code',
    calibrationConfidence: 0.94,
  },
  type: 'workplace',
  requiresOptIn: false,
  rationale: 'The receiving dock handles incoming inventory. AI assists with shipment logging and quality checks. Camera is allowed for package scanning but personal use is restricted.',
  rulesUpdatedAt: Date.now(),
  version: '1.0.0',
};

export const STORAGE_FLOOR: Zone = {
  zoneId: 'cactus:warehouse-001:storage',
  name: 'Storage Floor',
  publisher: {
    name: 'Cactus Warehouse Operations',
    type: 'business',
    verified: true,
  },
  rules: {
    ...WAREHOUSE_BASE_RULES,
    // Storage floor has robots — strict rules to prevent interference
    aiActions: 'confirm_all',
    bystanderProtection: 'strict',
    custom: [
      {
        id: 'robot-path-priority',
        description: 'AI overlays must show active robot paths — human safety first',
        targetIntent: 'display_text_wall',
        effect: 'modify',
        rationale: 'Robot pickers move fast. Humans must see their planned routes.',
      },
      {
        id: 'no-anchor-without-clearance',
        description: 'Placing AR anchors on the storage floor requires manager approval',
        targetIntent: 'anchor_place',
        effect: 'confirm',
        rationale: 'Unauthorized anchors can confuse robot navigation systems.',
      },
      {
        id: 'inventory-location-verified',
        description: 'AI must verify shelf location before confirming a pick',
        targetIntent: 'ai_auto_action',
        effect: 'confirm',
        rationale: 'Wrong picks are expensive. AI confirms location before human acts.',
      },
    ],
  },
  discovery: {
    method: 'posemesh_domain',
    domainId: 'posemesh:cactus-wh001-storage',
    portalId: 'portal-storage-aisle-a-aruco',
    portalType: 'aruco_marker',
    calibrationConfidence: 0.97,
  },
  type: 'workplace',
  requiresOptIn: false,
  rationale: 'The storage floor is a mixed human-robot environment. AI navigation overlays are required for safety. Anchors require approval to avoid interfering with robot pathfinding. All actions are confirmed to prevent costly mispicks.',
  rulesUpdatedAt: Date.now(),
  version: '1.0.0',
};

export const PACKING_STATION: Zone = {
  zoneId: 'cactus:warehouse-001:packing',
  name: 'Packing Station',
  publisher: {
    name: 'Cactus Warehouse Operations',
    type: 'business',
    verified: true,
  },
  rules: {
    ...WAREHOUSE_BASE_RULES,
    // Packing is accuracy-critical — AI verifies everything
    aiActions: 'confirm_all',
    aiRecommendations: 'allowed',
    custom: [
      {
        id: 'verify-before-seal',
        description: 'AI must verify pack contents match order before sealing',
        targetIntent: 'ai_auto_action',
        effect: 'confirm',
        rationale: 'Mispacked orders are costly. AI double-checks every box.',
      },
      {
        id: 'weight-check-required',
        description: 'AI flags weight discrepancies between expected and actual',
        targetIntent: 'ai_send_transcription',
        effect: 'modify',
        rationale: 'Weight mismatches catch packing errors before they ship.',
      },
    ],
  },
  discovery: {
    method: 'posemesh_domain',
    domainId: 'posemesh:cactus-wh001-packing',
    portalId: 'portal-packing-station-1-qr',
    portalType: 'qr_code',
    calibrationConfidence: 0.96,
  },
  type: 'workplace',
  requiresOptIn: false,
  rationale: 'Packing stations require accuracy above speed. AI assists with order verification and flags discrepancies. Every action is confirmed before completion.',
  rulesUpdatedAt: Date.now(),
  version: '1.0.0',
};

export const SHIPPING_DOCK: Zone = {
  zoneId: 'cactus:warehouse-001:shipping',
  name: 'Shipping Dock',
  publisher: {
    name: 'Cactus Warehouse Operations',
    type: 'business',
    verified: true,
  },
  rules: {
    ...WAREHOUSE_BASE_RULES,
    // Shipping is time-sensitive — AI can auto-route
    aiActions: 'allowed',
    custom: [
      {
        id: 'auto-route-packages',
        description: 'AI automatically routes packages to correct carrier staging area',
        targetIntent: 'ai_auto_action',
        effect: 'modify',
        rationale: 'Shipping cutoffs are tight. Auto-routing prevents missed pickups.',
      },
      {
        id: 'carrier-data-only',
        description: 'AI can share package data only with declared carriers',
        targetIntent: 'ai_send_transcription',
        effect: 'confirm',
        rationale: 'Package data goes only to the assigned carrier, not third parties.',
      },
    ],
  },
  discovery: {
    method: 'posemesh_domain',
    domainId: 'posemesh:cactus-wh001-shipping',
    portalId: 'portal-shipping-bay-1-aruco',
    portalType: 'aruco_marker',
    calibrationConfidence: 0.93,
  },
  type: 'workplace',
  requiresOptIn: false,
  rationale: 'The shipping dock is time-sensitive. AI auto-routes packages to carrier staging. Data sharing is limited to declared carriers only.',
  rulesUpdatedAt: Date.now(),
  version: '1.0.0',
};

export const MANAGER_OFFICE: Zone = {
  zoneId: 'cactus:warehouse-001:manager',
  name: 'Manager Office',
  publisher: {
    name: 'Cactus Warehouse Operations',
    type: 'business',
    verified: true,
  },
  rules: {
    ...WAREHOUSE_BASE_RULES,
    // Managers get full access — but still session-only retention
    aiActions: 'allowed',
    aiDataSend: 'allowed',
    camera: 'allowed',
    microphone: 'allowed',
    dataRetention: 'session_only',
    bystanderProtection: 'standard',
    custom: [
      {
        id: 'full-reporting',
        description: 'AI can generate and display real-time warehouse performance dashboards',
        targetIntent: 'display_text_wall',
        effect: 'modify',
        rationale: 'Managers need full visibility into warehouse operations.',
      },
    ],
  },
  discovery: {
    method: 'posemesh_domain',
    domainId: 'posemesh:cactus-wh001-manager',
    portalId: 'portal-manager-office-nfc',
    portalType: 'qr_code',
    calibrationConfidence: 0.98,
  },
  type: 'workplace',
  requiresOptIn: true,
  rationale: 'The manager office has full AI access for reporting and decision-making. Entry requires opt-in because the office may contain sensitive operational data.',
  rulesUpdatedAt: Date.now(),
  version: '1.0.0',
};

export const BREAK_ROOM: Zone = {
  zoneId: 'cactus:warehouse-001:breakroom',
  name: 'Break Room',
  publisher: {
    name: 'Cactus Warehouse Operations',
    type: 'business',
    verified: true,
  },
  rules: {
    ...DEFAULT_ZONE_RULES,
    // Break room — personal time, minimal governance
    camera: 'confirm_each',
    microphone: 'confirm_each',
    aiDataSend: 'allowed',
    aiActions: 'blocked',
    aiOverlay: 'non_obstructive',
    dataRetention: 'blocked',
    commercialAI: 'allowed', // Workers can price-shop on break
    bystanderProtection: 'elevated',
  },
  discovery: {
    method: 'posemesh_domain',
    domainId: 'posemesh:cactus-wh001-breakroom',
    portalId: 'portal-breakroom-door-qr',
    portalType: 'qr_code',
    calibrationConfidence: 0.91,
  },
  type: 'workplace',
  requiresOptIn: false,
  rationale: 'The break room is personal time. No work AI actions. No data retention. Camera and mic need confirmation because coworkers are off-duty and expect privacy.',
  rulesUpdatedAt: Date.now(),
  version: '1.0.0',
};

// ─── All Cactus Zones ────────────────────────────────────────────────────────

export const CACTUS_WAREHOUSE_ZONES: Zone[] = [
  RECEIVING_DOCK,
  STORAGE_FLOOR,
  PACKING_STATION,
  SHIPPING_DOCK,
  MANAGER_OFFICE,
  BREAK_ROOM,
];
