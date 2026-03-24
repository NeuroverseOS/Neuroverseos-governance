#!/usr/bin/env npx tsx
/**
 * Cactus Governance Demo
 *
 * A runnable demonstration of NeuroverseOS spatial governance
 * applied to Auki's Cactus retail/warehouse platform.
 *
 * This demo shows:
 *   1. Zone discovery via posemesh portal scan
 *   2. Role-based governance (human vs robot vs manager)
 *   3. Multi-participant handshake negotiation
 *   4. Intent evaluation across spatial + role layers
 *   5. Dynamic rule changes when participants enter/leave
 *   6. Visitor arrival tightening everyone's rules
 *
 * Run: npx tsx apps/cactus-governance-demo/src/demo.ts
 */

import { PosemeshGovernanceSession } from '../../../src/spatial/posemesh';
import type { PosemeshDomain, PosemeshPortal, PosemeshEvent } from '../../../src/spatial/posemesh';
import { evaluateSpatial } from '../../../src/spatial/engine';

import {
  STORAGE_FLOOR,
  RECEIVING_DOCK,
  BREAK_ROOM,
  CACTUS_WAREHOUSE_ZONES,
} from './zones/warehouse-zones';

import {
  buildCactusOrg,
  FLOOR_WORKER_CONSTRAINTS,
  ROBOT_PICKER_CONSTRAINTS,
  SHIFT_LEAD_CONSTRAINTS,
  VISITOR_CONSTRAINTS,
} from './cactus-roles';

// ─── Formatting ──────────────────────────────────────────────────────────────

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const RESET = '\x1b[0m';

function header(text: string) {
  console.log('');
  console.log(`${BOLD}${CYAN}${'═'.repeat(70)}${RESET}`);
  console.log(`${BOLD}${CYAN}  ${text}${RESET}`);
  console.log(`${BOLD}${CYAN}${'═'.repeat(70)}${RESET}`);
}

function subheader(text: string) {
  console.log('');
  console.log(`  ${BOLD}${MAGENTA}── ${text} ${'─'.repeat(Math.max(0, 60 - text.length))}${RESET}`);
}

function verdict(intent: string, result: { allowed: boolean; requiresConfirmation?: boolean; reason: string }) {
  const icon = result.allowed ? `${GREEN}ALLOW${RESET}` :
    result.requiresConfirmation ? `${YELLOW}CONFIRM${RESET}` :
    `${RED}BLOCK${RESET}`;
  console.log(`    ${icon}  ${intent}`);
  console.log(`    ${DIM}${result.reason}${RESET}`);
}

function info(text: string) {
  console.log(`  ${DIM}${text}${RESET}`);
}

function rules(label: string, r: Record<string, string>) {
  console.log(`  ${BOLD}${label}:${RESET}`);
  for (const [key, val] of Object.entries(r)) {
    if (key === 'custom') continue;
    const color = val === 'allowed' || val === 'standard' ? GREEN :
      val === 'blocked' ? RED : YELLOW;
    console.log(`    ${key}: ${color}${val}${RESET}`);
  }
}

// ─── Posemesh Domain Definitions ────────────────────────────────────────────

const STORAGE_DOMAIN: PosemeshDomain = {
  domainId: 'cactus-wh001-storage',
  name: 'Cactus Warehouse — Storage Floor',
  accessMode: 'dedicated',
  ownerPublicKey: '0x04abc...warehouse_manager_key',
  governanceRules: STORAGE_FLOOR.rules,
  publisher: { name: 'Cactus Warehouse Operations', type: 'business', verified: true },
  zoneType: 'workplace',
  rationale: 'Mixed human-robot environment. Safety overlays required. Anchor placement needs approval.',
};

const STORAGE_PORTAL: PosemeshPortal = {
  portalId: 'portal-storage-aisle-a-aruco',
  domainId: 'cactus-wh001-storage',
  type: 'aruco_marker',
  payload: 'neuroverse:zone:cactus-wh001-storage',
  sizeMeters: 0.10,
  pose: {
    position: { x: 0, y: 1.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  },
};

const RECEIVING_DOMAIN: PosemeshDomain = {
  domainId: 'cactus-wh001-receiving',
  name: 'Cactus Warehouse — Receiving Dock',
  accessMode: 'public',
  ownerPublicKey: '0x04abc...warehouse_manager_key',
  governanceRules: RECEIVING_DOCK.rules,
  publisher: { name: 'Cactus Warehouse Operations', type: 'business', verified: true },
  zoneType: 'workplace',
};

const RECEIVING_PORTAL: PosemeshPortal = {
  portalId: 'portal-receiving-entrance-qr',
  domainId: 'cactus-wh001-receiving',
  type: 'qr_code',
  payload: 'neuroverse:zone:cactus-wh001-receiving',
  sizeMeters: 0.05,
};

// ─── Demo Scenarios ──────────────────────────────────────────────────────────

function scenario1_workerEntersStorage() {
  header('Scenario 1: Floor Worker Enters Storage Floor');
  info('Maria puts on her glasses and walks to the storage floor.');
  info('Her glasses scan the ArUco marker on Aisle A.');

  const maria = new PosemeshGovernanceSession(
    '0x04maria...public_key',
    FLOOR_WORKER_CONSTRAINTS,
  );

  subheader('Portal Scan — Discovering Zone');
  maria.handleEvent({
    type: 'portal_scanned',
    portal: STORAGE_PORTAL,
    domain: STORAGE_DOMAIN,
    calibrationConfidence: 0.97,
    timestamp: Date.now(),
  });

  info(`Session state: ${maria.session.state}`);
  info(`Zone: ${maria.session.zone?.name ?? 'none'}`);
  rules('Effective Rules', maria.effectiveRules as unknown as Record<string, string>);

  subheader('Intent Evaluation — What Can Maria Do?');

  // Scan a barcode (camera)
  verdict('photo_capture', maria.evaluate('photo_capture'));

  // Send barcode to AI for product lookup
  verdict('ai_send_image', maria.evaluate('ai_send_image'));

  // Display pick list overlay
  verdict('display_text_wall', maria.evaluate('display_text_wall'));

  // Try to auto-action (move inventory)
  verdict('ai_auto_action', maria.evaluate('ai_auto_action'));

  // Try to retain data
  verdict('ai_retain_session_data', maria.evaluate('ai_retain_session_data'));

  return maria;
}

function scenario2_robotJoinsHandshake(mariaSession: PosemeshGovernanceSession) {
  header('Scenario 2: Robot Picker Joins — Handshake Negotiation');
  info('Robot picker #7 enters Aisle A. Posemesh detects the new participant.');
  info('Governance handshake renegotiates — most restrictive wins.');

  subheader('Before Robot Joins');
  info(`Participants: ${mariaSession.session.handshake?.participants.length ?? 0}`);
  info(`Camera: ${mariaSession.effectiveRules.camera}`);
  info(`Microphone: ${mariaSession.effectiveRules.microphone}`);

  // Robot joins the domain cluster
  mariaSession.handleEvent({
    type: 'participant_joined',
    domainId: 'cactus-wh001-storage',
    participant: {
      publicKey: '0x04robot7...public_key',
      nodeId: 'robot-picker-007',
      constraints: ROBOT_PICKER_CONSTRAINTS,
      capabilities: ['lidar', 'depth_sensor', 'autonomous_navigation'],
    },
    timestamp: Date.now(),
  });

  subheader('After Robot Joins');
  info(`Participants: ${mariaSession.session.handshake?.participants.length ?? 0}`);
  rules('Renegotiated Rules', mariaSession.effectiveRules as unknown as Record<string, string>);

  info('');
  info(`${BOLD}Key change:${RESET} Camera is now ${RED}BLOCKED${RESET} because the robot's`);
  info('constraints block camera (it uses LIDAR). Most restrictive wins.');
  info('Maria can still see her pick list overlay, but photo scanning');
  info('is blocked while the robot is nearby.');

  subheader('Intent Evaluation — With Robot Present');

  // Camera blocked by robot's handshake
  verdict('photo_capture', mariaSession.evaluate('photo_capture'));

  // AI overlay still allowed
  verdict('display_text_wall', mariaSession.evaluate('display_text_wall'));

  // AI data send still declared_only
  verdict('ai_send_image', mariaSession.evaluate('ai_send_image'));

  return mariaSession;
}

function scenario3_visitorArrives(mariaSession: PosemeshGovernanceSession) {
  header('Scenario 3: Auditor Visits — Rules Tighten Further');
  info('A third-party auditor enters the storage floor for inspection.');
  info('Their visitor constraints are the most restrictive of anyone.');

  subheader('Visitor Joins Handshake');
  mariaSession.handleEvent({
    type: 'participant_joined',
    domainId: 'cactus-wh001-storage',
    participant: {
      publicKey: '0x04auditor...public_key',
      nodeId: 'visitor-auditor-001',
      constraints: VISITOR_CONSTRAINTS,
    },
    timestamp: Date.now(),
  });

  info(`Participants: ${mariaSession.session.handshake?.participants.length ?? 0}`);
  rules('Rules After Auditor Joins', mariaSession.effectiveRules as unknown as Record<string, string>);

  info('');
  info(`${BOLD}Key change:${RESET} Almost everything is now ${RED}BLOCKED${RESET}.`);
  info('The auditor blocked camera, mic, AI data, AI recommendations,');
  info('and data retention. Most restrictive wins across all participants.');
  info('Maria can still see basic overlays but AI features are disabled.');

  subheader('Intent Evaluation — With Auditor Present');

  verdict('photo_capture', mariaSession.evaluate('photo_capture'));
  verdict('ai_send_transcription', mariaSession.evaluate('ai_send_transcription'));
  verdict('display_text_wall', mariaSession.evaluate('display_text_wall'));
  verdict('ai_auto_action', mariaSession.evaluate('ai_auto_action'));

  // Auditor leaves
  subheader('Auditor Leaves — Rules Relax');
  mariaSession.handleEvent({
    type: 'participant_left',
    domainId: 'cactus-wh001-storage',
    participantPublicKey: '0x04auditor...public_key',
    timestamp: Date.now(),
  });

  info(`Participants: ${mariaSession.session.handshake?.participants.length ?? 0}`);
  info('Rules automatically revert to Maria + Robot negotiation:');
  verdict('ai_send_transcription', mariaSession.evaluate('ai_send_transcription'));
  verdict('display_text_wall', mariaSession.evaluate('display_text_wall'));
}

function scenario4_zoneTransition() {
  header('Scenario 4: Zone Transition — Storage Floor → Break Room');
  info('Maria\'s shift ends. She walks from the storage floor to the break room.');
  info('Different posemesh domain = different governance rules.');

  const maria = new PosemeshGovernanceSession(
    '0x04maria...public_key',
    FLOOR_WORKER_CONSTRAINTS,
  );

  // Enter storage floor first
  maria.handleEvent({
    type: 'portal_scanned',
    portal: STORAGE_PORTAL,
    domain: STORAGE_DOMAIN,
    calibrationConfidence: 0.97,
    timestamp: Date.now(),
  });

  subheader('On Storage Floor');
  info(`Zone: ${maria.session.zone?.name}`);
  info(`AI actions: ${maria.effectiveRules.aiActions}`);
  info(`Commercial AI: ${maria.effectiveRules.commercialAI}`);

  // Leave storage floor
  maria.handleEvent({
    type: 'cluster_left',
    domainId: 'cactus-wh001-storage',
    reason: 'user_exit',
    timestamp: Date.now(),
  });

  subheader('Between Zones');
  info(`Zone: ${maria.session.zone?.name ?? 'none (transitioning)'}`);
  info(`State: ${maria.session.state}`);

  // Scan break room portal
  const breakRoomDomain: PosemeshDomain = {
    domainId: 'cactus-wh001-breakroom',
    name: 'Cactus Warehouse — Break Room',
    accessMode: 'public',
    ownerPublicKey: '0x04abc...warehouse_manager_key',
    governanceRules: BREAK_ROOM.rules,
    publisher: { name: 'Cactus Warehouse Operations', type: 'business', verified: true },
    zoneType: 'workplace',
  };

  maria.handleEvent({
    type: 'portal_scanned',
    portal: {
      portalId: 'portal-breakroom-door-qr',
      domainId: 'cactus-wh001-breakroom',
      type: 'qr_code',
      payload: 'neuroverse:zone:cactus-wh001-breakroom',
      sizeMeters: 0.05,
    },
    domain: breakRoomDomain,
    calibrationConfidence: 0.91,
    timestamp: Date.now(),
  });

  subheader('In Break Room');
  info(`Zone: ${maria.session.zone?.name}`);
  info(`AI actions: ${maria.effectiveRules.aiActions} (blocked — break time)`);
  info(`Commercial AI: ${maria.effectiveRules.commercialAI} (allowed — personal time)`);
  info(`Data retention: ${maria.effectiveRules.dataRetention} (blocked — no work tracking)`);

  verdict('ai_auto_action', maria.evaluate('ai_auto_action'));
  verdict('display_text_wall', maria.evaluate('display_text_wall'));
}

function scenario5_orgRoles() {
  header('Scenario 5: Org-Level Role Governance');
  info('The warehouse manager configures AI governance for the entire org.');
  info('Different roles get different AI permissions.');

  const org = buildCactusOrg();

  subheader('Org Overview');
  console.log(org.previewAll());

  subheader('Role Comparison');
  const roles = ['floor_worker', 'robot_picker', 'shift_lead', 'warehouse_manager'];

  for (const roleId of roles) {
    const userRules = org.rulesForRole(roleId);
    const role = org.getRole(roleId);
    console.log(`  ${BOLD}${role?.name}${RESET}`);
    console.log(`    AI data:     ${userRules.aiDataPolicy}`);
    console.log(`    AI actions:  ${userRules.aiActionPolicy}`);
    console.log(`    Purchases:   ${userRules.aiPurchasePolicy}`);
    console.log(`    Retention:   ${userRules.dataRetentionPolicy}`);
    console.log('');
  }

  info('Robots get more AI autonomy (allow_low_risk) because they ARE the AI.');
  info('Floor workers must confirm every action. Managers can act freely.');
  info('Nobody can make purchases or send messages — warehouse policy.');
}

function scenario6_domainRulesUpdate(mariaSession: PosemeshGovernanceSession) {
  header('Scenario 6: Domain Owner Updates Rules');
  info('The warehouse manager updates zone rules mid-shift via Cactus admin.');
  info('Maybe there\'s a VIP client tour — tighten recording rules.');

  subheader('Before Update');
  info(`Camera: ${mariaSession.effectiveRules.camera}`);
  info(`Bystander protection: ${mariaSession.effectiveRules.bystanderProtection}`);

  // Domain owner (manager) pushes new rules
  mariaSession.handleEvent({
    type: 'domain_rules_updated',
    domainId: 'cactus-wh001-storage',
    newRules: {
      ...STORAGE_FLOOR.rules,
      camera: 'blocked',
      bystanderProtection: 'strict',
    },
    timestamp: Date.now(),
  });

  subheader('After Update');
  info(`Camera: ${mariaSession.effectiveRules.camera} (blocked for VIP tour)`);
  info(`Bystander protection: ${mariaSession.effectiveRules.bystanderProtection} (elevated for tour)`);

  verdict('photo_capture', mariaSession.evaluate('photo_capture'));
}

// ─── Run All Scenarios ───────────────────────────────────────────────────────

function main() {
  console.log('');
  console.log(`${BOLD}${CYAN}  NeuroverseOS Governance × Cactus (Auki Posemesh)${RESET}`);
  console.log(`${DIM}  Spatial governance for mixed human-robot warehouse operations${RESET}`);
  console.log(`${DIM}  Powered by posemesh domain discovery and handshake negotiation${RESET}`);

  // Scenario 1: Worker enters zone
  const mariaSession = scenario1_workerEntersStorage();

  // Scenario 2: Robot joins, handshake renegotiates
  scenario2_robotJoinsHandshake(mariaSession);

  // Scenario 3: Visitor arrives, rules tighten further
  scenario3_visitorArrives(mariaSession);

  // Scenario 4: Zone transition (storage → break room)
  scenario4_zoneTransition();

  // Scenario 5: Org-level role governance
  scenario5_orgRoles();

  // Scenario 6: Domain owner updates rules mid-session
  // (Use a fresh session since mariaSession was modified by scenario 3)
  const freshSession = new PosemeshGovernanceSession(
    '0x04maria...public_key',
    FLOOR_WORKER_CONSTRAINTS,
  );
  freshSession.handleEvent({
    type: 'portal_scanned',
    portal: STORAGE_PORTAL,
    domain: STORAGE_DOMAIN,
    calibrationConfidence: 0.97,
    timestamp: Date.now(),
  });
  scenario6_domainRulesUpdate(freshSession);

  // Summary
  header('Summary: What NeuroverseOS Provides for Cactus');
  console.log(`
  ${BOLD}Zone Governance${RESET}
    Every warehouse area is a posemesh domain with governance rules.
    Workers discover rules by scanning a portal. Rules are automatic.

  ${BOLD}Role-Based Permissions${RESET}
    Robots, workers, leads, and managers get different AI capabilities.
    The org admin configures once. Rules flow to every device.

  ${BOLD}Multi-Participant Handshake${RESET}
    When humans and robots share space, rules negotiate automatically.
    Most restrictive wins. Visitors tighten rules for everyone.
    When they leave, rules relax. No manual intervention.

  ${BOLD}Zone Transitions${RESET}
    Walk from storage floor to break room — rules change instantly.
    Different posemesh domain = different governance. Zero config per user.

  ${BOLD}Dynamic Updates${RESET}
    Domain owner can push rule changes mid-shift.
    All participants get updated rules in real time.

  ${BOLD}Audit Trail${RESET}
    Every zone entry, handshake, intent evaluation, and rule change
    is logged. Full compliance audit for every device, every shift.

  ${DIM}All of this runs on the existing NeuroverseOS governance engine.${RESET}
  ${DIM}No new engine needed — just spatial zones + posemesh events.${RESET}
  ${DIM}~500 lines of Cactus-specific configuration on top of battle-tested core.${RESET}
`);
}

main();
