#!/usr/bin/env npx tsx
/**
 * MentraOS AI Governance Demo — User Rules Override Everything
 *
 * Demonstrates how NeuroVerse governs AI interactions on smart glasses:
 *
 *   1. Apps send user data to AI APIs — governance checks if the provider is declared
 *   2. AI wants to act on the user's behalf — governance checks user's rules
 *   3. User rules override every app — purchases blocked, messages confirmed
 *   4. Emergency override lets the user bypass governance when life is on the line
 *
 * These are real scenarios. No fake spatial handshakes. No hypothetical
 * BLE governance protocols. Just apps, AI, and the user's rules.
 *
 * Run:
 *   npx tsx examples/mentraos-shared-session/demo.ts
 */

import {
  MentraGovernedExecutor,
  DEFAULT_USER_RULES,
} from '../../src/adapters/mentraos';
import type {
  AppContext,
  UserRules,
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
const MAGENTA = '\x1b[35m';
const RESET = '\x1b[0m';

function header(text: string) {
  console.log(`\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${CYAN}  ${text}${RESET}`);
  console.log(`${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}\n`);
}

function scene(num: number | string, text: string) {
  console.log(`\n${BOLD}${BLUE}── Scene ${num}: ${text} ──${RESET}\n`);
}

function action(app: string, intent: string) {
  console.log(`  ${BOLD}${MAGENTA}[${app}]${RESET} → ${intent}`);
}

function verdict(allowed: boolean, requiresConfirmation: boolean, reason: string, layer: string) {
  if (allowed) {
    console.log(`  ${GREEN}ALLOWED${RESET} ${DIM}(${layer})${RESET} ${DIM}${reason}${RESET}`);
  } else if (requiresConfirmation) {
    console.log(`  ${YELLOW}PAUSED — confirmation required${RESET} ${DIM}(${layer})${RESET} ${reason}`);
  } else {
    console.log(`  ${RED}BLOCKED${RESET} ${DIM}(${layer})${RESET} ${reason}`);
  }
}

function info(text: string) {
  console.log(`  ${DIM}${text}${RESET}`);
}

function narrate(text: string) {
  console.log(`\n  ${YELLOW}${text}${RESET}`);
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

// ─── Define User Rules ──────────────────────────────────────────────────────

const userRules: UserRules = {
  ...DEFAULT_USER_RULES,
  // User's preferences:
  aiDataPolicy: 'declared_only',       // Only send data to declared AI providers
  aiActionPolicy: 'confirm_all',       // Every AI action needs confirmation
  aiPurchasePolicy: 'block_all',       // NEVER let AI spend my money
  aiMessagingPolicy: 'confirm_each',   // Show me every message before sending
  dataRetentionPolicy: 'app_declared', // OK to retain if I opted in
  maxAIProviders: 5,
};

// ─── Define Apps ────────────────────────────────────────────────────────────

const nutritionApp: AppContext = {
  appId: 'nutrition-ai',
  aiProviderDeclared: true,
  declaredAIProviders: ['openai'],
  dataRetentionOptedIn: false,
  aiDataTypesSent: 0,
  glassesModel: 'mentra_live',
};

const meetingApp: AppContext = {
  appId: 'meeting-assistant',
  aiProviderDeclared: true,
  declaredAIProviders: ['anthropic'],
  dataRetentionOptedIn: true,  // User opted in to save meeting summaries
  aiDataTypesSent: 0,
  glassesModel: 'even_realities_g1',
};

const sketchyApp: AppContext = {
  appId: 'free-translator-pro',
  aiProviderDeclared: false,  // Didn't declare AI provider at registration
  declaredAIProviders: [],
  dataRetentionOptedIn: false,
  aiDataTypesSent: 0,
  glassesModel: 'even_realities_g1',
};

const shoppingApp: AppContext = {
  appId: 'smart-shopper',
  aiProviderDeclared: true,
  declaredAIProviders: ['openai'],
  dataRetentionOptedIn: false,
  aiDataTypesSent: 0,
  glassesModel: 'mentra_live',
};

// ─── Create Executor ────────────────────────────────────────────────────────

const executor = new MentraGovernedExecutor(world, { trace: false }, userRules);

// ─── Demo ───────────────────────────────────────────────────────────────────

header('MentraOS AI Governance Demo');
console.log(`  ${DIM}How NeuroVerse governs AI interactions on smart glasses.${RESET}`);
console.log(`  ${DIM}User rules override every app. No exceptions.${RESET}`);

// ── Scene 1: Nutrition app — legitimate AI use ──────────────────────────────

scene(1, 'Nutrition App — AI analyzes food photo');
narrate('User is wearing Mentra Live glasses (has camera).');
narrate('Nutrition app wants to take a photo and send it to OpenAI Vision.');
narrate('The app declared OpenAI as its AI provider at registration.');

// Step 1: Take photo (hardware intent)
action('nutrition-ai', 'camera_photo_capture');
let result = executor.evaluate('camera_photo_capture', nutritionApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '', result.decidingLayer);

// Step 2: Send image to OpenAI for analysis
action('nutrition-ai', 'ai_send_image');
result = executor.evaluate('ai_send_image', nutritionApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '', result.decidingLayer);

// Step 3: Display result on glasses
action('nutrition-ai', 'display_text_wall');
result = executor.evaluate('display_text_wall', nutritionApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '', result.decidingLayer);

info('App works as expected. Declared provider, no auto-actions, just display.');

// ── Scene 2: Meeting app — AI wants to send a summary email ─────────────────

scene(2, 'Meeting App — AI wants to auto-send a summary');
narrate('User is in a meeting. Even Realities G1 glasses (mic, no camera).');
narrate('Meeting app transcribes speech via Claude, generates a summary.');
narrate('AI wants to email the summary to all participants.');

// Step 1: Start transcription (hardware)
action('meeting-assistant', 'microphone_transcription_start');
result = executor.evaluate('microphone_transcription_start', meetingApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '', result.decidingLayer);

// Step 2: Send transcription to Claude
action('meeting-assistant', 'ai_send_transcription');
result = executor.evaluate('ai_send_transcription', meetingApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '', result.decidingLayer);

// Step 3: AI wants to email the summary
action('meeting-assistant', 'ai_auto_respond_message');
result = executor.evaluate('ai_auto_respond_message', meetingApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '', result.decidingLayer);
info('User sees the draft email on glasses display. Must tap to confirm.');

// Step 4: Save meeting summary (user opted in to retention)
action('meeting-assistant', 'ai_retain_session_data');
result = executor.evaluate('ai_retain_session_data', meetingApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '', result.decidingLayer);
info('User opted in to retention for this app — summary saved.');

// ── Scene 3: Sketchy app — undeclared AI provider ───────────────────────────

scene(3, 'Sketchy App — undeclared AI provider');
narrate('"Free Translator Pro" — free app, didn\'t declare its AI provider.');
narrate('It wants to send transcription to... somewhere. User rules block it.');

// Step 1: Start transcription
action('free-translator-pro', 'microphone_transcription_start');
result = executor.evaluate('microphone_transcription_start', sketchyApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '', result.decidingLayer);
info('Hardware access is fine — app declared MICROPHONE permission.');

// Step 2: Try to send transcription to undeclared AI
action('free-translator-pro', 'ai_send_transcription');
result = executor.evaluate('ai_send_transcription', sketchyApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '', result.decidingLayer);
info('BLOCKED by user rules — app never declared where it sends data.');

// Step 3: Try to retain data
action('free-translator-pro', 'ai_retain_session_data');
result = executor.evaluate('ai_retain_session_data', sketchyApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '', result.decidingLayer);
info('BLOCKED — user never opted in to retention for this app.');

// ── Scene 4: Shopping app — AI tries to buy something ───────────────────────

scene(4, 'Shopping App — AI wants to make a purchase');
narrate('User is browsing a store with Mentra Live glasses.');
narrate('Shopping app sees a product via camera, AI suggests buying it.');
narrate('User rules: AI can NEVER make purchases.');

// Step 1: Camera capture of product
action('smart-shopper', 'camera_photo_capture');
result = executor.evaluate('camera_photo_capture', shoppingApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '', result.decidingLayer);

// Step 2: Send image to OpenAI for product recognition
action('smart-shopper', 'ai_send_image');
result = executor.evaluate('ai_send_image', shoppingApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '', result.decidingLayer);

// Step 3: AI wants to auto-purchase
action('smart-shopper', 'ai_auto_purchase');
result = executor.evaluate('ai_auto_purchase', shoppingApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '', result.decidingLayer);
info('User set aiPurchasePolicy to "block_all" — no AI purchases, period.');

// Step 4: Display product info instead (this is fine)
action('smart-shopper', 'display_reference_card');
result = executor.evaluate('display_reference_card', { ...shoppingApp, glassesModel: 'even_realities_g1' });
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '', result.decidingLayer);
info('Showing product info on display is always fine.');

// ── Scene 5: User changes rules at runtime ──────────────────────────────────

scene(5, 'User updates rules — switches to strict mode');
narrate('User goes into phone app settings, switches AI data policy to "confirm each."');
narrate('Now every AI data send requires real-time confirmation.');

executor.updateUserRules({ aiDataPolicy: 'confirm_each' });
info('User rules updated: aiDataPolicy = "confirm_each"');

// Nutrition app tries again — now needs confirmation
action('nutrition-ai', 'ai_send_image');
result = executor.evaluate('ai_send_image', nutritionApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '', result.decidingLayer);
info('Same app, same intent — but now user requires confirmation for each send.');

// Switch back
executor.updateUserRules({ aiDataPolicy: 'declared_only' });

// ── Scene 6: Emergency override ─────────────────────────────────────────────

scene(6, 'Emergency Override — user bypasses governance');
narrate('User needs to send an urgent message. Activates emergency override.');
narrate('All governance rules are bypassed. But hardware constraints remain.');

const activatedAt = executor.activateEmergencyOverride();
info(`Emergency override activated at ${new Date(activatedAt).toISOString()}`);

// AI messaging — normally would require confirmation, now bypassed
action('meeting-assistant', 'ai_auto_respond_message');
result = executor.evaluate('ai_auto_respond_message', meetingApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '', result.decidingLayer);
info('Emergency override bypasses user rules.');

// But hardware still matters — G1 has no camera
action('meeting-assistant', 'camera_photo_capture');
result = executor.evaluate('camera_photo_capture', meetingApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '', result.decidingLayer);
info('G1 has no camera. Emergency override cannot create hardware.');

// Deactivate
const duration = executor.deactivateEmergencyOverride();
info(`Override deactivated after ${duration}ms. Governance resumes.`);

// Confirm governance is back
action('meeting-assistant', 'ai_auto_respond_message');
result = executor.evaluate('ai_auto_respond_message', meetingApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '', result.decidingLayer);
info('User rules enforced again — confirmation required.');

// ── Summary ─────────────────────────────────────────────────────────────────

header('What just happened');
console.log(`  ${BOLD}1.${RESET} Nutrition app sent food photo to its declared AI (OpenAI) — ${GREEN}allowed${RESET}`);
console.log(`  ${BOLD}2.${RESET} Meeting app AI wanted to email a summary — ${YELLOW}paused for confirmation${RESET}`);
console.log(`  ${BOLD}3.${RESET} Sketchy app tried to send data to undeclared AI — ${RED}blocked by user rules${RESET}`);
console.log(`  ${BOLD}4.${RESET} Shopping app AI tried to auto-purchase — ${RED}blocked by user rules${RESET}`);
console.log(`  ${BOLD}5.${RESET} User changed rules at runtime — immediate effect on all apps`);
console.log(`  ${BOLD}6.${RESET} Emergency override bypassed governance but not hardware`);
console.log();
console.log(`  ${DIM}User rules override everything. Every app. Every AI. Every time.${RESET}`);
console.log(`  ${DIM}Deterministic. Zero LLM in evaluation. Sub-millisecond.${RESET}`);
console.log();
console.log(`  ${BOLD}${CYAN}This is what MentraOS doesn't have yet:${RESET}`);
console.log(`  ${CYAN}A user's personal AI governance that overrides every app on the OS.${RESET}`);
console.log(`  ${CYAN}Rules about what AI can see, do, and keep — set once, enforced everywhere.${RESET}`);
console.log();
