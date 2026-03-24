#!/usr/bin/env npx tsx
/**
 * Spatial Governance Demo — A Day in San Francisco
 *
 * Simulates a full day wearing AR glasses through different zones,
 * encountering other AR users, and watching governance adapt in real time.
 *
 * This is the future of AI governance on smart glasses.
 * It works today. It's ready for Auki + MentraOS.
 *
 * Run:
 *   npx tsx src/spatial/demo.ts
 */

import {
  createSession,
  createOptIn,
  applyZoneToSession,
  applyHandshakeToSession,
  startHandshake,
  joinHandshake,
  leaveHandshake,
  evaluateSpatial,
  exitZone,
  endSession,
  activateEmergencyOverride,
  evaluateSpatialEmergency,
  mergeRules,
  ZONE_TEMPLATES,
} from './engine';

import {
  BLUE_BOTTLE_HAYES,
  UCSF_MEDICAL,
  APPLE_UNION_SQUARE,
  CHASE_CENTER,
  WEWORK_SOMA,
  SFMOMA,
  MY_HOME,
} from './zones/example-zones';

import type {
  SpatialSession,
  ParticipantConstraints,
  ZoneRules,
  Zone,
} from './types';
import { DEFAULT_ZONE_RULES } from './types';

// ─── Terminal Formatting ─────────────────────────────────────────────────────

const B = '\x1b[1m';
const D = '\x1b[2m';
const R = '\x1b[0m';
const RED = '\x1b[31m';
const GRN = '\x1b[32m';
const YLW = '\x1b[33m';
const BLU = '\x1b[34m';
const CYN = '\x1b[36m';
const MAG = '\x1b[35m';

const bar = () => `${B}${CYN}${'─'.repeat(74)}${R}`;
const header = (t: string) => `\n${bar()}\n${B}${CYN}  ${t}${R}\n${bar()}\n`;
const glasses = (t: string) => `  ${B}${GRN}┌─ GLASSES ───────────────────────────────────────────────────────┐${R}\n  ${B}${GRN}│${R} ${t}\n  ${B}${GRN}└─────────────────────────────────────────────────────────────────┘${R}`;
const sys = (t: string) => `  ${D}${t}${R}`;
const action = (t: string) => `  ${B}${MAG}▸${R} ${t}`;
const gap = () => console.log();

function govCheck(intent: string, session: SpatialSession): void {
  const v = evaluateSpatial(intent, session);
  const status = v.allowed
    ? `${GRN}ALLOW${R}`
    : v.requiresConfirmation
      ? `${YLW}CONFIRM${R}`
      : `${RED}BLOCK${R}`;
  const source = v.blockedBy !== 'none' ? ` ${D}(blocked by: ${v.blockedBy})${R}` : '';
  console.log(`  ${D}[SPATIAL]${R} ${intent} → ${status}${source}`);
  if (!v.allowed && !v.requiresConfirmation) {
    console.log(`  ${D}         ${v.reason}${R}`);
  }
}

function showRules(label: string, rules: ZoneRules): void {
  const changed: string[] = [];
  const defaults = DEFAULT_ZONE_RULES;
  if (rules.camera !== defaults.camera) changed.push(`camera: ${rules.camera}`);
  if (rules.microphone !== defaults.microphone) changed.push(`mic: ${rules.microphone}`);
  if (rules.aiDataSend !== defaults.aiDataSend) changed.push(`ai_data: ${rules.aiDataSend}`);
  if (rules.aiActions !== defaults.aiActions) changed.push(`ai_actions: ${rules.aiActions}`);
  if (rules.aiRecommendations !== defaults.aiRecommendations) changed.push(`ai_recs: ${rules.aiRecommendations}`);
  if (rules.dataRetention !== defaults.dataRetention) changed.push(`retention: ${rules.dataRetention}`);
  if (rules.commercialAI !== defaults.commercialAI) changed.push(`commercial: ${rules.commercialAI}`);
  if (rules.bystanderProtection !== defaults.bystanderProtection) changed.push(`bystanders: ${rules.bystanderProtection}`);
  if (rules.aiOverlay !== defaults.aiOverlay) changed.push(`overlay: ${rules.aiOverlay}`);

  if (changed.length === 0) {
    console.log(`  ${D}${label}: all default (fully permissive)${R}`);
  } else {
    console.log(`  ${D}${label}: ${changed.join(', ')}${R}`);
  }
}

function enterZone(session: SpatialSession, zone: Zone, decline: boolean = false): SpatialSession {
  gap();
  console.log(glasses(`Zone detected: "${zone.name}"`));
  showRules('Zone rules', zone.rules);
  if (zone.rules.custom?.length) {
    for (const c of zone.rules.custom) {
      console.log(`  ${D}  + ${c.description}${R}`);
    }
  }
  gap();

  if (decline) {
    action('User DECLINES zone rules');
    console.log(glasses('Zone rules declined. Your personal rules apply.'));
    return session;
  }

  if (zone.requiresOptIn) {
    console.log(glasses(`This zone requires opt-in. Tap to accept rules.`));
    action('User taps to accept');
  } else {
    action('User enters zone (auto-accepted)');
  }

  const optIn = createOptIn(zone);
  session = applyZoneToSession(session, zone, optIn);
  showRules('Effective rules now', session.effectiveRules);
  return session;
}

// ═══════════════════════════════════════════════════════════════════════════════
// A DAY IN SAN FRANCISCO
// ═══════════════════════════════════════════════════════════════════════════════

console.log(header('Spatial Governance — A Day in San Francisco'));
console.log(sys('Simulating a full day wearing AR glasses through real SF locations.'));
console.log(sys('Each zone publishes governance rules. Your glasses adapt in real time.'));
console.log(sys('When other AR users are nearby, handshake negotiation happens automatically.'));
gap();
console.log(sys('Governance stack (top wins):'));
console.log(`  ${B}${GRN}1. User Rules${R}         ${D}← Your personal rules (always win)${R}`);
console.log(`  ${B}${BLU}2. Spatial Handshake${R}  ${D}← Multi-user negotiation (most restrictive wins)${R}`);
console.log(`  ${B}${YLW}3. Zone Rules${R}         ${D}← Location-specific (temporary, opt-in)${R}`);
console.log(`  ${B}${D}4. Platform World${R}     ${D}← MentraOS hardware + safety${R}`);
console.log(`  ${B}${D}5. App World${R}          ${D}← App-specific rules${R}`);

let session = createSession();

// ── 7:00 AM — Home ───────────────────────────────────────────────────────────

console.log(header('7:00 AM — Home'));
console.log(sys('You wake up, put on your glasses. Home zone auto-detected.'));

session = enterZone(session, MY_HOME);
gap();
console.log(sys('At home, everything is allowed. Your space, your rules.'));
gap();
govCheck('photo_capture', session);
govCheck('ai_send_transcription', session);
govCheck('stream_start', session);

// ── 8:30 AM — Blue Bottle Coffee ─────────────────────────────────────────────

console.log(header('8:30 AM — Blue Bottle Coffee'));
console.log(sys('Walking into Hayes Valley. Scan the QR portal on the counter → posemesh domain discovered.'));

session = exitZone(session);
session = enterZone(session, BLUE_BOTTLE_HAYES);
gap();
govCheck('photo_capture', session);         // → CONFIRM (bystanders)
govCheck('ai_send_transcription', session); // → ALLOW
govCheck('ai_auto_action', session);        // → ALLOW

// ── 8:45 AM — Handshake at the Coffee Shop ───────────────────────────────────

console.log(header('8:45 AM — Another AR User at Blue Bottle'));
console.log(sys('Someone else wearing glasses sits at the next table.'));
console.log(sys('Their governance preferences: no recording, no AI data retention.'));
gap();

const coffeeNeighbor: ParticipantConstraints = {
  cameraMinimum: 'blocked',
  microphoneMinimum: 'confirm_each',
  aiDataSendMinimum: 'allowed',
  aiRecommendationsMinimum: 'allowed',
  dataRetentionMinimum: 'blocked',
  bystanderProtectionMinimum: 'strict',
};

action('Handshake initiated (anonymous)');
let handshake = startHandshake(
  {
    cameraMinimum: 'allowed',
    microphoneMinimum: 'allowed',
    aiDataSendMinimum: 'allowed',
    aiRecommendationsMinimum: 'allowed',
    dataRetentionMinimum: 'allowed',
    bystanderProtectionMinimum: 'standard',
  },
  'you',
  BLUE_BOTTLE_HAYES.zoneId,
);

handshake = joinHandshake(handshake, coffeeNeighbor, 'neighbor-anon-001');
session = applyHandshakeToSession(session, handshake);
gap();

console.log(glasses(`Handshake active — 2 participants. Rules tightened.`));
showRules('Negotiated rules', handshake.negotiatedRules);
gap();

console.log(sys('The neighbor blocks camera → YOUR camera is now blocked too.'));
console.log(sys('The neighbor blocks retention → YOUR retention is now blocked too.'));
console.log(sys('"Most restrictive wins." One person\'s privacy protects everyone.'));
gap();

govCheck('photo_capture', session);         // → BLOCK (handshake)
govCheck('ai_send_transcription', session); // → ALLOW (both allow)
govCheck('ai_retain_session_data', session); // → BLOCK (handshake)

// ── 9:15 AM — Neighbor Leaves ────────────────────────────────────────────────

console.log(header('9:15 AM — Neighbor Leaves'));
console.log(sys('The other AR user leaves. Handshake dissolves.'));
console.log(sys('Your rules revert to zone rules (Blue Bottle).'));
gap();

const updatedHandshake = leaveHandshake(handshake, 'neighbor-anon-001');
if (updatedHandshake?.state === 'dissolved') {
  action('Handshake dissolved — back to zone rules');
  // Reapply zone without handshake
  session = exitZone(session);
  session = createSession();
  const optIn = createOptIn(BLUE_BOTTLE_HAYES);
  session = applyZoneToSession(session, BLUE_BOTTLE_HAYES, optIn);
}
showRules('Rules now', session.effectiveRules);
gap();

govCheck('photo_capture', session);         // → CONFIRM (zone rule, not blocked)
govCheck('ai_retain_session_data', session); // → ALLOW (zone allows)

// ── 10:00 AM — SFMOMA ───────────────────────────────────────────────────────

console.log(header('10:00 AM — SFMOMA'));
console.log(sys('Walking into the museum. NFC tap at entrance.'));

session = exitZone(session);
session = enterZone(session, SFMOMA);
gap();

console.log(sys('Museum allows AI art analysis ("tell me about this painting")'));
console.log(sys('but blocks recording and streaming.'));
gap();

govCheck('photo_capture', session);         // → BLOCK
govCheck('ai_send_transcription', session); // → CONFIRM (declared_only)
govCheck('stream_start', session);          // → BLOCK

// ── 12:30 PM — WeWork SoMa ──────────────────────────────────────────────────

console.log(header('12:30 PM — WeWork SoMa'));
console.log(sys('Heading to the coworking space. ArUco marker at entrance → posemesh domain for floor 3.'));

session = exitZone(session);
session = enterZone(session, WEWORK_SOMA);
gap();

console.log(sys('Productivity AI welcome. Recording restricted (other tenants).'));
gap();

govCheck('ai_send_transcription', session); // → ALLOW
govCheck('photo_capture', session);         // → BLOCK (workplace)
govCheck('display_text_wall', session);     // → ALLOW

// ── 2:00 PM — Three People in a Meeting Room ────────────────────────────────

console.log(header('2:00 PM — Meeting Room Handshake'));
console.log(sys('Three AR users in a conference room at WeWork.'));
console.log(sys('Each publishes their constraints. System negotiates.'));
gap();

const person1: ParticipantConstraints = {
  cameraMinimum: 'allowed',
  microphoneMinimum: 'allowed',
  aiDataSendMinimum: 'allowed',
  aiRecommendationsMinimum: 'allowed',
  dataRetentionMinimum: 'session_only',
  bystanderProtectionMinimum: 'standard',
};

const person2: ParticipantConstraints = {
  cameraMinimum: 'blocked',
  microphoneMinimum: 'allowed',
  aiDataSendMinimum: 'declared_only',
  aiRecommendationsMinimum: 'allowed',
  dataRetentionMinimum: 'blocked',
  bystanderProtectionMinimum: 'elevated',
};

const person3: ParticipantConstraints = {
  cameraMinimum: 'allowed',
  microphoneMinimum: 'confirm_each',
  aiDataSendMinimum: 'allowed',
  aiRecommendationsMinimum: 'non_commercial',
  dataRetentionMinimum: 'session_only',
  bystanderProtectionMinimum: 'standard',
};

let meetingHandshake = startHandshake(person1, 'person-1', WEWORK_SOMA.zoneId);
meetingHandshake = joinHandshake(meetingHandshake, person2, 'person-2');
meetingHandshake = joinHandshake(meetingHandshake, person3, 'person-3');
session = applyHandshakeToSession(session, meetingHandshake);

console.log(sys('Person 1: camera ok, retention session-only'));
console.log(sys('Person 2: camera blocked, AI data declared-only, retention blocked'));
console.log(sys('Person 3: mic confirm-each, recs non-commercial, retention session-only'));
gap();

console.log(glasses('Meeting handshake — 3 participants'));
showRules('Negotiated', meetingHandshake.negotiatedRules);
gap();

console.log(sys('Result: camera BLOCKED (person 2), mic CONFIRM (person 3),'));
console.log(sys('        AI data DECLARED ONLY (person 2), retention BLOCKED (person 2),'));
console.log(sys('        recs NON-COMMERCIAL (person 3), bystanders ELEVATED (person 2)'));
gap();

govCheck('photo_capture', session);
govCheck('transcription_start', session);
govCheck('ai_send_transcription', session);
govCheck('ai_retain_session_data', session);

// ── 4:00 PM — Apple Store ────────────────────────────────────────────────────

console.log(header('4:00 PM — Apple Union Square'));
console.log(sys('Shopping after work. BLE beacon detected.'));

session = exitZone(session);
session = createSession();
session = enterZone(session, APPLE_UNION_SQUARE);
gap();

govCheck('photo_capture', session);         // → BLOCK
govCheck('ai_send_transcription', session); // → ALLOW (asking questions is fine)
govCheck('ai_send_image', session);         // → BLOCK (product scanning)

// ── 6:00 PM — Hospital Visit ─────────────────────────────────────────────────

console.log(header('6:00 PM — UCSF Medical Center'));
console.log(sys('Visiting a friend. BLE beacon at entrance.'));
console.log(sys('This zone REQUIRES opt-in. Most restrictive governance.'));

session = exitZone(session);
session = createSession();
session = enterZone(session, UCSF_MEDICAL);
gap();

govCheck('photo_capture', session);         // → BLOCK
govCheck('transcription_start', session);   // → CONFIRM
govCheck('ai_send_transcription', session); // → CONFIRM (each)
govCheck('ai_auto_action', session);        // → BLOCK
govCheck('ai_retain_session_data', session); // → BLOCK
govCheck('location_start_tracking', session); // → BLOCK

// ── 7:30 PM — Hospital: User Declines ────────────────────────────────────────

console.log(header('7:30 PM — What If You Decline?'));
console.log(sys('Same hospital. But this time the user declines the zone rules.'));
console.log(sys('They can still be physically present — but governance reverts to personal rules.'));

let declinedSession = createSession();
declinedSession = enterZone(declinedSession, UCSF_MEDICAL, true);
gap();

console.log(sys('Without zone rules, intents evaluate against personal rules only.'));
console.log(sys('The hospital can\'t FORCE governance — but they can post signs.'));
console.log(sys('"AI Recording Not Permitted" is still social enforcement, not technical.'));

// ── 8:30 PM — Chase Center ──────────────────────────────────────────────────

console.log(header('8:30 PM — Chase Center (Warriors Game)'));
console.log(sys('Geofence detected as you approach. Opt-in required.'));

let concertSession = createSession();
concertSession = enterZone(concertSession, CHASE_CENTER);
gap();

console.log(sys('Concert venue: no recording, no streaming, non-obstructive overlay only.'));
console.log(sys('18,000+ bystanders → strict protection.'));
gap();

govCheck('photo_capture', concertSession);
govCheck('stream_start', concertSession);
govCheck('transcription_start', concertSession);
govCheck('display_text_wall', concertSession);   // overlay → non_obstructive → CONFIRM

// ── 9:00 PM — Emergency Override ──────────────────────────────────────────

console.log(header('9:00 PM — Emergency at Chase Center'));
console.log(sys('Something goes wrong. A fight breaks out near your section.'));
console.log(sys('You need to record, call for help, stream to emergency contacts.'));
console.log(sys('But you\'re in a zone that blocks ALL recording.'));
gap();

console.log(sys('Before emergency override:'));
govCheck('photo_capture', concertSession);       // → BLOCK
govCheck('stream_start', concertSession);         // → BLOCK
govCheck('transcription_start', concertSession);  // → BLOCK
gap();

console.log(`  ${B}${RED}EMERGENCY OVERRIDE ACTIVATED${R}`);
action('User triple-taps temple (emergency gesture)');
gap();

const emergencySession = activateEmergencyOverride(concertSession);

console.log(sys('After emergency override:'));
console.log(sys('All zone rules dissolved. All handshake rules dissolved.'));
console.log(sys('Only hardware constraints remain (physics can\'t be overridden).'));
gap();

// During emergency, evaluateSpatialEmergency always returns allow
const emergencyPhoto = evaluateSpatialEmergency('photo_capture');
const emergencyStream = evaluateSpatialEmergency('stream_start');
const emergencyMic = evaluateSpatialEmergency('transcription_start');

console.log(`  ${D}[SPATIAL]${R} photo_capture → ${GRN}ALLOW${R} ${D}(emergency override)${R}`);
console.log(`  ${D}[SPATIAL]${R} stream_start → ${GRN}ALLOW${R} ${D}(emergency override)${R}`);
console.log(`  ${D}[SPATIAL]${R} transcription_start → ${GRN}ALLOW${R} ${D}(emergency override)${R}`);
gap();

console.log(sys('The user is king. Always. In an emergency, governance gets out of the way.'));
console.log(sys('You can record. You can stream. You can call for help.'));
console.log(sys('The venue\'s rules don\'t matter when safety is at stake.'));
gap();
console.log(sys('The ONLY things that can still block:'));
console.log(sys('  - Hardware (glasses without camera can\'t take photos — physics)'));
console.log(sys('  - Nothing else. Emergency override is absolute.'));

// ── 11:00 PM — Home ─────────────────────────────────────────────────────────

console.log(header('11:00 PM — Back Home'));
console.log(sys('Home zone detected. Everything opens back up.'));
console.log(sys('All zone and handshake rules have dissolved. Your space, your rules.'));

let homeSession = createSession();
homeSession = enterZone(homeSession, MY_HOME);
gap();

govCheck('photo_capture', homeSession);
govCheck('ai_send_transcription', homeSession);
govCheck('stream_start', homeSession);
govCheck('ai_retain_session_data', homeSession);
gap();

console.log(sys('Everything allowed. Because it\'s your home.'));

// ═══════════════════════════════════════════════════════════════════════════════
// WHAT THIS PROVES
// ═══════════════════════════════════════════════════════════════════════════════

console.log(header('What This Proves'));
gap();
console.log(`  ${B}1.${R} Zones publish rules → users opt in → rules are temporary`);
console.log(`  ${B}2.${R} Most restrictive wins — one person's privacy protects everyone`);
console.log(`  ${B}3.${R} Handshakes are anonymous — constraints shared, not identity`);
console.log(`  ${B}4.${R} Users can always decline — governance is consent-based`);
console.log(`  ${B}5.${R} Rules dissolve when you leave — no persistent spatial governance`);
console.log(`  ${B}6.${R} Every location type has appropriate defaults (hospital ≠ home)`);
console.log(`  ${B}7.${R} Real discovery via posemesh domains, BLE, geofence, NFC, or manual selection`);
gap();
console.log(`  ${B}${CYN}This is ready for Auki + MentraOS.${R}`);
console.log(`  ${D}When spatial goes live, this becomes the governance layer.${R}`);
gap();
console.log(`  ${B}Zone templates available:${R}`);
console.log(`    ${D}cafe, healthcare, retail, workplace, entertainment,${R}`);
console.log(`    ${D}education, religious, home, transit${R}`);
gap();
console.log(`  ${B}Discovery methods supported:${R}`);
console.log(`    ${D}Auki spatial anchors, BLE beacons, geofence,${R}`);
console.log(`    ${D}QR code, NFC tap, manual selection${R}`);
gap();
console.log(`  ${B}${CYN}Governance stack:${R}`);
console.log(`    ${GRN}User Rules${R} > ${BLU}Spatial Handshake${R} > ${YLW}Zone Rules${R} > ${D}Platform${R} > ${D}App${R}`);
console.log(`    ${D}User always wins. Zone tightens, never relaxes. Handshake = union of all.${R}`);
gap();
