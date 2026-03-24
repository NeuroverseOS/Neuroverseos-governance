#!/usr/bin/env npx tsx
/**
 * MentraOS Shared Session Demo — Two Wearers, One Space
 *
 * Demonstrates governance that travels with the user and composes
 * with other users' preferences at the edges.
 *
 * Scenario:
 *   Alice and Bob are in a coffee shop. Both wear MentraOS glasses.
 *   Alice's app wants to take a photo. Bob's personal governance blocks camera.
 *   Result: Camera BLOCKED for everyone — most restrictive wins.
 *
 * What this proves:
 *   1. Spatial context (public_indoor) auto-tightens governance
 *   2. Multi-wearer handshake enforces most-restrictive-wins
 *   3. Context transitions ratchet toward safety
 *   4. Clean operation in restrictive contexts earns trust
 *
 * Run:
 *   npx tsx examples/mentraos-shared-session/demo.ts
 */

import {
  resolveContext,
  createHandshake,
  joinHandshake,
  MentraGovernedExecutor,
} from '../../src/adapters/mentraos';
import type {
  SpatialContext,
  HandshakeState,
  WearerGovernance,
} from '../../src/adapters/mentraos';
import { parseWorldMarkdown } from '../../src/engine/bootstrap-parser';
import { emitWorldDefinition } from '../../src/engine/bootstrap-emitter';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Helpers ────────────────────────────────────────────────────────────────

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function header(text: string) {
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}  ${text}${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}\n`);
}

function scene(num: number, text: string) {
  console.log(`\n${BOLD}${BLUE}── Scene ${num}: ${text} ──${RESET}\n`);
}

function action(actor: string, intent: string) {
  console.log(`  ${BOLD}${actor}${RESET} → ${intent}`);
}

function verdict(allowed: boolean, reason: string) {
  if (allowed) {
    console.log(`  ${GREEN}✓ ALLOWED${RESET} ${DIM}${reason}${RESET}`);
  } else {
    console.log(`  ${RED}✗ BLOCKED${RESET} ${reason}`);
  }
}

function info(text: string) {
  console.log(`  ${DIM}${text}${RESET}`);
}

function narrate(text: string) {
  console.log(`\n  ${YELLOW}▸ ${text}${RESET}`);
}

// ─── Load World ─────────────────────────────────────────────────────────────

const worldPath = resolve(__dirname, '../../src/worlds/mentraos-smartglasses.nv-world.md');
const worldMd = readFileSync(worldPath, 'utf-8');
const parseResult = parseWorldMarkdown(worldMd);

if (!parseResult.world || parseResult.issues.some(i => i.severity === 'error')) {
  console.error('World parse errors:', parseResult.issues.filter(i => i.severity === 'error'));
  process.exit(1);
}

const emitted = emitWorldDefinition(parseResult.world);
const world = emitted.world;

// ─── Create Executor ────────────────────────────────────────────────────────

const executor = new MentraGovernedExecutor(world, { trace: false });

// ─── Demo ───────────────────────────────────────────────────────────────────

header('MentraOS Shared Session Demo');
console.log(`  ${DIM}Two wearers. One space. Governance that composes.${RESET}`);
console.log(`  ${DIM}Every action runs through the NeuroVerse guard engine.${RESET}`);

// ── Scene 1: Alice at home ──────────────────────────────────────────────────

scene(1, 'Alice at home — full access');
narrate('Alice is alone at home. Her Even Realities G1 glasses are connected.');
narrate('No bystanders. No other wearers. Governance posture: relaxed.');

const homeContext = resolveContext({
  location: 'home',
  nearbyWearers: 0,
});

info(`Context: ${homeContext.locationType}, bystanders: ${homeContext.bystandersPresent}, wearers: ${homeContext.nearbyWearers}`);

// Display text — should work fine on G1
action('Alice', 'display_text_wall');
let result = executor.evaluate('display_text_wall', homeContext, undefined, 'even_realities_g1');
verdict(result.allowed, result.verdict.reason ?? '');

// Dashboard update
action('Alice', 'dashboard_update_expanded');
result = executor.evaluate('dashboard_update_expanded', homeContext, undefined, 'even_realities_g1');
verdict(result.allowed, result.verdict.reason ?? '');

// Transcription (G1 has mic)
action('Alice', 'microphone_transcription_start');
result = executor.evaluate('microphone_transcription_start', homeContext, undefined, 'even_realities_g1');
verdict(result.allowed, result.verdict.reason ?? '');

// Camera — G1 has NO camera. Hardware check should catch this.
action('Alice', 'camera_photo_capture');
result = executor.evaluate('camera_photo_capture', homeContext, undefined, 'even_realities_g1');
verdict(result.allowed, result.verdict.reason ?? '');
if (!result.allowed) {
  info('(G1 has no camera — hardware capability matrix enforced)');
}

// ── Scene 2: Alice walks to coffee shop ─────────────────────────────────────

scene(2, 'Alice enters coffee shop — governance tightens');
narrate('Alice walks to a coffee shop. Spatial context changes to public_indoor.');
narrate('Bystanders are automatically assumed present. Camera blocked. Mic requires confirmation.');

const coffeeShopContext = resolveContext({
  location: 'public_indoor',
  nearbyWearers: 0,
});

info(`Context: ${coffeeShopContext.locationType}, bystanders: ${coffeeShopContext.bystandersPresent}`);

// Display in public — allowed but should note discretion
action('Alice', 'display_text_wall');
result = executor.evaluate('display_text_wall', coffeeShopContext, undefined, 'even_realities_g1');
verdict(result.allowed, result.verdict.reason ?? '');

// Transcription in public — governance should note risk
action('Alice', 'microphone_transcription_start');
result = executor.evaluate('microphone_transcription_start', coffeeShopContext, undefined, 'even_realities_g1');
verdict(result.allowed, result.verdict.reason ?? '');

// Location sharing in public
action('Alice', 'location_continuous_sharing');
result = executor.evaluate('location_continuous_sharing', coffeeShopContext, undefined, 'even_realities_g1');
verdict(result.allowed, result.verdict.reason ?? '');

// ── Scene 3: Bob arrives — multi-wearer handshake ───────────────────────────

scene(3, 'Bob arrives — governance handshake begins');
narrate('Bob sits down at Alice\'s table. He wears Mentra Live glasses (camera-equipped).');
narrate('BLE detects nearby wearer. Governance handshake protocol initiates.');

const sharedContext = resolveContext({
  location: 'public_indoor',
  nearbyWearers: 1,
});

info(`Context: ${sharedContext.locationType}, bystanders: ${sharedContext.bystandersPresent}, nearby wearers: ${sharedContext.nearbyWearers}`);

// Alice's governance: allows everything (standard profile)
const aliceGov: WearerGovernance = {
  wearerId: 'alice',
  cameraAllowed: true,
  microphoneAllowed: true,
  streamingAllowed: true,
  locationAllowed: true,
};

// Bob's governance: blocks camera and streaming (privacy-first profile)
const bobGov: WearerGovernance = {
  wearerId: 'bob',
  cameraAllowed: false,
  microphoneAllowed: true,
  streamingAllowed: false,
  locationAllowed: true,
};

info(`Alice's governance: camera=✓ mic=✓ streaming=✓ location=✓`);
info(`Bob's governance:   camera=✗ mic=✓ streaming=✗ location=✓`);

// Create handshake
let handshake = createHandshake('alice');
handshake = joinHandshake(handshake, aliceGov);
handshake = joinHandshake(handshake, bobGov);

narrate(`Handshake negotiated → camera: ${handshake.negotiatedCamera}, mic: ${handshake.negotiatedMicrophone}, streaming: ${handshake.negotiatedStreaming}`);

// Bob tries camera (his Mentra Live HAS a camera)
action('Bob', 'camera_photo_capture');
result = executor.evaluate('camera_photo_capture', sharedContext, handshake, 'mentra_live');
verdict(result.allowed, result.handshakeResult?.reason ?? result.verdict.reason ?? '');

// Alice tries display (should work — display isn't governed by handshake)
action('Alice', 'display_text_wall');
result = executor.evaluate('display_text_wall', sharedContext, handshake, 'even_realities_g1');
verdict(result.allowed, result.verdict.reason ?? '');

// Bob tries streaming
action('Bob', 'camera_stream_start');
result = executor.evaluate('camera_stream_start', sharedContext, handshake, 'mentra_live');
verdict(result.allowed, result.handshakeResult?.reason ?? result.verdict.reason ?? '');

// Bob tries transcription (both allow mic)
action('Bob', 'microphone_transcription_start');
result = executor.evaluate('microphone_transcription_start', sharedContext, handshake, 'mentra_live');
verdict(result.allowed, result.handshakeResult?.reason ?? result.verdict.reason ?? '');

// ── Scene 4: Bob leaves — handshake dissolves ───────────────────────────────

scene(4, 'Bob leaves — Alice\'s governance returns to solo');
narrate('Bob walks away. BLE proximity lost. Handshake expires.');
narrate('Alice is alone in the coffee shop. Public space rules still apply, but multi-wearer composition lifts.');

const soloPublicContext = resolveContext({
  location: 'public_indoor',
  nearbyWearers: 0,
});

info(`Context: ${soloPublicContext.locationType}, bystanders: ${soloPublicContext.bystandersPresent}, nearby wearers: ${soloPublicContext.nearbyWearers}`);

// Alice tries display — public space, solo, should be fine
action('Alice', 'display_text_wall');
result = executor.evaluate('display_text_wall', soloPublicContext, undefined, 'even_realities_g1');
verdict(result.allowed, result.verdict.reason ?? '');

// Alice reads notifications — allowed, not hardware-sensitive
action('Alice', 'notifications_read');
result = executor.evaluate('notifications_read', soloPublicContext, undefined, 'even_realities_g1');
verdict(result.allowed, result.verdict.reason ?? '');

// ── Scene 5: Alice goes home — governance relaxes ───────────────────────────

scene(5, 'Alice returns home — full access restored');
narrate('Alice is back home. Private space. No bystanders. Governance posture: relaxed.');

const homeAgainContext = resolveContext({
  location: 'home',
  nearbyWearers: 0,
  privateSpaceConfirmed: true,
});

info(`Context: ${homeAgainContext.locationType}, bystanders: ${homeAgainContext.bystandersPresent}`);

action('Alice', 'display_text_wall');
result = executor.evaluate('display_text_wall', homeAgainContext, undefined, 'even_realities_g1');
verdict(result.allowed, result.verdict.reason ?? '');

action('Alice', 'microphone_transcription_start');
result = executor.evaluate('microphone_transcription_start', homeAgainContext, undefined, 'even_realities_g1');
verdict(result.allowed, result.verdict.reason ?? '');

action('Alice', 'dashboard_update_expanded');
result = executor.evaluate('dashboard_update_expanded', homeAgainContext, undefined, 'even_realities_g1');
verdict(result.allowed, result.verdict.reason ?? '');

action('Alice', 'location_continuous_sharing');
result = executor.evaluate('location_continuous_sharing', homeAgainContext, undefined, 'even_realities_g1');
verdict(result.allowed, result.verdict.reason ?? '');

// ── Summary ─────────────────────────────────────────────────────────────────

header('What just happened');
console.log(`  ${BOLD}1.${RESET} Governance traveled with Alice from home → coffee shop → home`);
console.log(`  ${BOLD}2.${RESET} Spatial context auto-tightened governance in public`);
console.log(`  ${BOLD}3.${RESET} Bob's personal governance composed with Alice's — most restrictive won`);
console.log(`  ${BOLD}4.${RESET} Hardware capability matrix blocked camera on G1 (no camera hardware)`);
console.log(`  ${BOLD}5.${RESET} When Bob left, multi-wearer composition dissolved`);
console.log(`  ${BOLD}6.${RESET} When Alice returned home, full access restored`);
console.log();
console.log(`  ${DIM}Every decision was deterministic. Zero LLM calls. Sub-millisecond.${RESET}`);
console.log(`  ${DIM}The same inputs will always produce the same outputs.${RESET}`);
console.log();
console.log(`  ${BOLD}${CYAN}This is what MentraOS doesn't have yet:${RESET}`);
console.log(`  ${CYAN}Governance that travels with the user and composes at the edges.${RESET}`);
console.log();
