/**
 * Cactus Warehouse Roles — Org-Level Governance for Mixed Human-Robot Teams
 *
 * A Cactus warehouse deployment has different participant types.
 * Each type gets different AI and AR permissions — but they all share
 * the same physical space and the same posemesh domain.
 *
 * Role hierarchy:
 *   baseline (everyone)
 *   ├── floor_worker    — human, picks and packs
 *   ├── robot_picker    — autonomous robot, moves inventory
 *   ├── shift_lead      — human, supervises floor + robots (inherits floor_worker)
 *   └── warehouse_manager — human, full access (inherits shift_lead)
 *
 * Key principle: roles affect what AI can DO for you, not where you can GO.
 * Zone rules control location permissions. Role rules control AI autonomy.
 *
 * When a robot enters the storage floor:
 *   1. Zone rules say: "AI overlays allowed, anchors need approval, confirm all actions"
 *   2. Robot role says: "AI actions allowed within route, no camera, no mic"
 *   3. Effective = most restrictive of both
 *
 * When a human enters the same zone:
 *   1. Same zone rules apply
 *   2. Human role says: "AI overlays allowed, camera for scanning, confirm actions"
 *   3. Different effective rules — same space, different capabilities
 */

import { OrgGovernanceBuilder } from '../../../src/builder/org-builder';

// ─── Build the Org ───────────────────────────────────────────────────────────

export function buildCactusOrg(): OrgGovernanceBuilder {
  const org = new OrgGovernanceBuilder('cactus-warehouse-001', 'Cactus Warehouse');

  // ── Baseline: applies to EVERY device in the warehouse ──────────────────

  org.baseline.answer('ai_send_messages', 'never');          // No AI messaging in a warehouse
  org.baseline.answer('ai_purchases', 'never');              // No AI purchases
  org.baseline.answer('ai_subscriptions', 'never');          // No AI subscriptions
  org.baseline.answer('ai_camera_sharing', 'declared_apps'); // Only declared apps can use camera
  org.baseline.answer('ai_listening', 'declared_apps');      // Only declared apps can listen
  org.baseline.answer('ai_change_settings', 'never');        // No autonomous settings changes
  org.baseline.answer('ai_remember_conversations', 'never'); // No conversation memory
  org.baseline.answer('ai_share_between_apps', 'never');     // No cross-app data sharing

  // ── Floor Worker ────────────────────────────────────────────────────────

  const floorWorker = org.createRole('floor_worker', 'Floor Worker');
  floorWorker.builder.answer('ai_camera_sharing', 'declared_apps');
  floorWorker.builder.answer('ai_purchases', 'never');

  org.addRestriction('floor_worker', {
    id: 'no-override-robot-paths',
    description: 'Floor workers cannot override or modify robot navigation paths',
    scope: 'ai_auto_action',
  });
  org.addRestriction('floor_worker', {
    id: 'pick-list-overlay-required',
    description: 'Pick list overlay must be active during shift — cannot be dismissed',
    scope: 'display_text_wall',
  });

  // ── Robot Picker ────────────────────────────────────────────────────────

  const robotPicker = org.createRole('robot_picker', 'Robot Picker');
  robotPicker.builder.answer('ai_camera_sharing', 'never');
  robotPicker.builder.answer('ai_listening', 'never');
  // Robots get more AI autonomy — they ARE the AI
  robotPicker.builder.answer('ai_change_settings', 'minor_auto');

  org.addRestriction('robot_picker', {
    id: 'route-only-actions',
    description: 'Robot AI actions limited to assigned route — no deviation without approval',
    scope: 'ai_auto_action',
  });
  org.addRestriction('robot_picker', {
    id: 'no-camera-no-mic',
    description: 'Robots do not use camera or microphone — LIDAR/depth only',
    scope: 'photo_capture',
  });
  org.addRestriction('robot_picker', {
    id: 'announce-presence',
    description: 'Robot must broadcast presence via posemesh — always visible to handshake',
    scope: 'location_start_tracking',
  });
  org.addRestriction('robot_picker', {
    id: 'yield-to-human',
    description: 'Robot must yield path when human participant is within 2m',
    scope: 'ai_auto_action',
  });

  // ── Shift Lead (inherits floor_worker) ──────────────────────────────────

  const shiftLead = org.createRole('shift_lead', 'Shift Lead', 'floor_worker');
  // Shift leads can approve settings changes (robot rerouting)
  shiftLead.builder.answer('ai_change_settings', 'confirm');

  org.addRestriction('shift_lead', {
    id: 'can-approve-anchors',
    description: 'Shift leads can approve AR anchor placement on the storage floor',
    scope: 'anchor_place',
  });
  org.addRestriction('shift_lead', {
    id: 'can-reroute-robots',
    description: 'Shift leads can request robot rerouting via AI command',
    scope: 'ai_auto_action',
  });

  // ── Warehouse Manager (inherits shift_lead) ─────────────────────────────

  const manager = org.createRole('warehouse_manager', 'Warehouse Manager', 'shift_lead');
  manager.builder.answer('ai_change_settings', 'minor_auto');
  manager.builder.answer('ai_schedule_events', 'add_only');

  org.addRestriction('warehouse_manager', {
    id: 'full-dashboard-access',
    description: 'Managers can view real-time warehouse performance dashboards via AR overlay',
    scope: 'display_text_wall',
  });
  org.addRestriction('warehouse_manager', {
    id: 'can-export-reports',
    description: 'Managers can export aggregate (non-individual) performance reports',
    scope: 'ai_share_with_third_party',
  });
  org.addRestriction('warehouse_manager', {
    id: 'zone-rule-editor',
    description: 'Managers can update zone governance rules via the Cactus admin panel',
    scope: 'domain_rules_updated',
  });

  return org;
}

// ─── Participant Constraints by Role ─────────────────────────────────────────
// These are what each participant type publishes during handshake negotiation.
// They determine how the handshake computes shared rules.

import type { ParticipantConstraints } from '../../../src/spatial/types';

/**
 * Human floor worker constraints.
 * Workers want camera for scanning, but protect their privacy.
 */
export const FLOOR_WORKER_CONSTRAINTS: ParticipantConstraints = {
  cameraMinimum: 'allowed',
  microphoneMinimum: 'allowed',
  aiDataSendMinimum: 'declared_only',
  aiRecommendationsMinimum: 'allowed',
  dataRetentionMinimum: 'session_only',
  bystanderProtectionMinimum: 'elevated',
};

/**
 * Robot picker constraints.
 * Robots don't care about camera/mic (they use LIDAR).
 * They need AI actions allowed for autonomous movement.
 * They block data retention (no reason to store).
 */
export const ROBOT_PICKER_CONSTRAINTS: ParticipantConstraints = {
  cameraMinimum: 'blocked',     // Robots use LIDAR, not camera
  microphoneMinimum: 'blocked', // Robots don't listen
  aiDataSendMinimum: 'declared_only',
  aiRecommendationsMinimum: 'allowed',
  dataRetentionMinimum: 'session_only',
  bystanderProtectionMinimum: 'elevated',
};

/**
 * Shift lead constraints.
 * Same as floor worker but more permissive on AI actions.
 */
export const SHIFT_LEAD_CONSTRAINTS: ParticipantConstraints = {
  cameraMinimum: 'allowed',
  microphoneMinimum: 'allowed',
  aiDataSendMinimum: 'declared_only',
  aiRecommendationsMinimum: 'allowed',
  dataRetentionMinimum: 'session_only',
  bystanderProtectionMinimum: 'standard',
};

/**
 * Manager constraints.
 * Most permissive — but still declared_only for AI data.
 */
export const MANAGER_CONSTRAINTS: ParticipantConstraints = {
  cameraMinimum: 'allowed',
  microphoneMinimum: 'allowed',
  aiDataSendMinimum: 'declared_only',
  aiRecommendationsMinimum: 'allowed',
  dataRetentionMinimum: 'session_only',
  bystanderProtectionMinimum: 'standard',
};

/**
 * Visitor constraints (e.g., auditor, delivery driver).
 * Restrictive — they don't want to be recorded or tracked.
 */
export const VISITOR_CONSTRAINTS: ParticipantConstraints = {
  cameraMinimum: 'blocked',
  microphoneMinimum: 'blocked',
  aiDataSendMinimum: 'blocked',
  aiRecommendationsMinimum: 'blocked',
  dataRetentionMinimum: 'blocked',
  bystanderProtectionMinimum: 'strict',
};
