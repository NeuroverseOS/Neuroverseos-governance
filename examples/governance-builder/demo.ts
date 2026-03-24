#!/usr/bin/env npx tsx
/**
 * Governance Builder Demo — "Tell your AI how to behave"
 *
 * Simulates the full user flow:
 *   1. User answers 12 questions about AI behavior
 *   2. Rules compiled and shown in plain English
 *   3. User adds a custom rule via free-form text
 *   4. Rules exported as a world file
 *   5. Rules loaded into the MentraOS adapter and enforced
 *
 * This is the prototype for the real product.
 *
 * Run:
 *   npx tsx examples/governance-builder/demo.ts
 */

import { GovernanceBuilder } from '../../src/builder';
import { MentraGovernedExecutor } from '../../src/adapters/mentraos';
import type { AppContext } from '../../src/adapters/mentraos';
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

function step(num: number, text: string) {
  console.log(`\n${BOLD}${BLUE}── Step ${num}: ${text} ──${RESET}\n`);
}

function question(prompt: string) {
  console.log(`  ${BOLD}${MAGENTA}Q:${RESET} ${prompt}`);
}

function answer(text: string) {
  console.log(`  ${GREEN}A:${RESET} ${text}`);
}

function info(text: string) {
  console.log(`  ${DIM}${text}${RESET}`);
}

function verdict(allowed: boolean, requiresConfirmation: boolean, reason: string) {
  if (allowed) {
    console.log(`  ${GREEN}ALLOWED${RESET} ${DIM}${reason}${RESET}`);
  } else if (requiresConfirmation) {
    console.log(`  ${YELLOW}PAUSED — needs your OK${RESET} ${reason}`);
  } else {
    console.log(`  ${RED}BLOCKED${RESET} ${reason}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Demo Start
// ═══════════════════════════════════════════════════════════════════════════

header('"Tell your AI how to behave"');
console.log(`  ${DIM}A voice-driven governance builder.${RESET}`);
console.log(`  ${DIM}No YAML. No schemas. Just questions and answers.${RESET}`);

// ── Step 1: Answer the questions ────────────────────────────────────────

step(1, 'Answer questions about your AI');
info('The app asks 12 questions. You answer in plain language.\n');

const builder = new GovernanceBuilder();

// Simulate a user answering questions
const userChoices: Array<[string, string, string]> = [
  ['ai_send_messages', 'ask_each_time', 'Only if I approve each message first'],
  ['ai_social_media', 'never', 'Never'],
  ['ai_voice_identity', 'never', 'Never — only I speak as me'],
  ['ai_purchases', 'never', 'Never'],
  ['ai_subscriptions', 'never', 'Never — I sign up for things myself'],
  ['ai_camera_sharing', 'declared_apps', 'Allow apps that told me upfront they use AI'],
  ['ai_listening', 'declared_apps', 'Allow apps that told me upfront'],
  ['ai_location_sharing', 'ask_each_time', 'Ask me each time'],
  ['ai_change_settings', 'confirm', 'Only with my approval'],
  ['ai_schedule_events', 'confirm', 'Only with my approval'],
  ['ai_remember_conversations', 'ask_each_time', 'Ask me at the end of each session'],
  ['ai_share_between_apps', 'never', 'Never — each app stays in its own lane'],
];

for (const [qId, value, display] of userChoices) {
  const q = builder.questions.find(q => q.id === qId);
  if (q) {
    question(q.prompt);
    answer(display);
    builder.answer(qId, value);
  }
}

// ── Step 2: Show compiled rules ─────────────────────────────────────────

step(2, 'Your AI Rules');
info('Here\'s what you just decided:\n');

console.log(builder.preview());
console.log(builder.summaryLine());

// ── Step 3: Add custom rule ─────────────────────────────────────────────

step(3, 'Add a custom rule');
info('User taps "+ Add Rule" and says:\n');

const customInput = "Don't let AI share my camera feed with anything without asking me first";
console.log(`  ${BOLD}${MAGENTA}User:${RESET} "${customInput}"`);

const suggestion = builder.addCustom(customInput);
console.log(`\n  ${CYAN}Suggested Rule:${RESET}`);
console.log(`  ${suggestion.rule.constraint === 'block' ? RED : suggestion.rule.constraint === 'confirm' ? YELLOW : GREEN}${suggestion.confirmationPrompt}${RESET}`);
console.log(`  ${DIM}Confidence: ${suggestion.confidence} | Method: ${suggestion.method}${RESET}`);

console.log(`\n  ${GREEN}User confirms: Keep${RESET}`);

// Show updated rules
console.log(`\n  ${DIM}Updated rule count: ${builder.summary().enabled}${RESET}`);

// ── Step 4: Generate world file ─────────────────────────────────────────

step(4, 'Export as world file');
info('Behind the scenes, your rules become a governance world file.\n');

const worldContent = builder.worldFile();
// Show just the first 30 lines
const worldLines = worldContent.split('\n').slice(0, 30);
for (const line of worldLines) {
  console.log(`  ${DIM}${line}${RESET}`);
}
console.log(`  ${DIM}... (${worldContent.split('\n').length} total lines)${RESET}`);

// ── Step 5: Enforce with the adapter ────────────────────────────────────

step(5, 'Rules enforced — testing with real apps');
info('Loading the platform world and your user rules into the governance engine.\n');

// Load platform world
const platformWorldPath = resolve(__dirname, '../../src/worlds/mentraos-smartglasses.nv-world.md');
const platformWorldMd = readFileSync(platformWorldPath, 'utf-8');
const parseResult = parseWorldMarkdown(platformWorldMd);

if (!parseResult.world || parseResult.issues.some(i => i.severity === 'error')) {
  console.error('World parse errors:', parseResult.issues.filter(i => i.severity === 'error'));
  process.exit(1);
}

const emitted = emitWorldDefinition(parseResult.world);
const world = emitted.world;

// Create executor with user's compiled rules
const userRules = builder.userRules();
const executor = new MentraGovernedExecutor(world, { trace: false }, userRules);

// Test apps
const nutritionApp: AppContext = {
  appId: 'nutrition-ai',
  aiProviderDeclared: true,
  declaredAIProviders: ['openai'],
  dataRetentionOptedIn: false,
  aiDataTypesSent: 1,
  glassesModel: 'mentra_live',
};

const emailApp: AppContext = {
  appId: 'email-assistant',
  aiProviderDeclared: true,
  declaredAIProviders: ['anthropic'],
  dataRetentionOptedIn: false,
  aiDataTypesSent: 1,
  glassesModel: 'even_realities_g1',
};

const shoppingApp: AppContext = {
  appId: 'smart-shopper',
  aiProviderDeclared: true,
  declaredAIProviders: ['openai'],
  dataRetentionOptedIn: false,
  aiDataTypesSent: 1,
  glassesModel: 'mentra_live',
};

// Test: Nutrition app sends food photo to AI
console.log(`  ${BOLD}${MAGENTA}[nutrition-ai]${RESET} sends food photo to OpenAI Vision`);
let result = executor.evaluate('ai_send_image', nutritionApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '');
info('Declared provider + user allows declared apps = allowed\n');

// Test: Email app wants to auto-send a reply
console.log(`  ${BOLD}${MAGENTA}[email-assistant]${RESET} wants to send email reply for you`);
result = executor.evaluate('ai_auto_respond_message', emailApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '');
info('User said "only if I approve each message" = paused\n');

// Test: Shopping app wants to make a purchase
console.log(`  ${BOLD}${MAGENTA}[smart-shopper]${RESET} wants to buy a product for you`);
result = executor.evaluate('ai_auto_purchase', shoppingApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '');
info('User said "never spend my money" = blocked\n');

// Test: Any app wants to share data with another app
console.log(`  ${BOLD}${MAGENTA}[nutrition-ai]${RESET} wants to share food data with fitness app`);
result = executor.evaluate('ai_share_with_third_party', nutritionApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '');
info('User said "each app stays in its own lane" = paused for confirmation\n');

// Test: Location sharing requires confirmation
console.log(`  ${BOLD}${MAGENTA}[nutrition-ai]${RESET} wants to access your location`);
result = executor.evaluate('ai_send_location', nutritionApp);
verdict(result.allowed, result.requiresConfirmation, result.verdict.reason ?? '');
info('User said "ask me each time" for location = paused\n');

// ── Summary ─────────────────────────────────────────────────────────────

header('What just happened');
console.log(`  ${BOLD}1.${RESET} User answered 12 plain-language questions`);
console.log(`  ${BOLD}2.${RESET} Answers compiled into ${builder.summary().enabled} governance rules`);
console.log(`  ${BOLD}3.${RESET} Custom rule added via free-form text — pattern-matched instantly`);
console.log(`  ${BOLD}4.${RESET} Rules exported as a world file (${worldContent.split('\n').length} lines)`);
console.log(`  ${BOLD}5.${RESET} Rules loaded into the governance engine and enforced`);
console.log();
console.log(`  ${BOLD}Result:${RESET}`);
console.log(`    - Nutrition app sends photos to declared AI → ${GREEN}allowed${RESET}`);
console.log(`    - Email app auto-sends reply → ${YELLOW}paused for confirmation${RESET}`);
console.log(`    - Shopping app makes purchase → ${RED}blocked${RESET}`);
console.log(`    - Cross-app data sharing → ${YELLOW}paused for confirmation${RESET}`);
console.log(`    - Location sharing → ${YELLOW}paused for confirmation${RESET}`);
console.log();
console.log(`  ${DIM}The user never saw a world file. Never wrote YAML.${RESET}`);
console.log(`  ${DIM}They answered questions. They got rules. Rules work.${RESET}`);
console.log();
console.log(`  ${BOLD}${CYAN}"Tell your AI how to behave — once — and it listens everywhere."${RESET}`);
console.log();
