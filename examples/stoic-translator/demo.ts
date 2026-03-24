#!/usr/bin/env npx tsx
/**
 * Stoic Translator — Developer Example: Lens Overlay
 *
 * This is what a MentraOS app developer sees when they integrate
 * NeuroVerse governance into their app.
 *
 * The app: A translation app for MentraOS glasses.
 * The twist: It doesn't just translate — it translates through
 * a Stoic philosophical Lens.
 *
 * This demonstrates TWO kinds of governance working together:
 *
 *   1. Permission governance (user rules):
 *      CAN the app send transcription to AI?
 *      CAN the app display the result?
 *      → BLOCK / ALLOW / PAUSE
 *
 *   2. Lens governance (behavioral overlay):
 *      WHEN the app IS allowed to respond,
 *      HOW should the AI frame its response?
 *      → Stoic directives injected into the AI's prompt
 *
 * What the developer does:
 *   1. Import the governance SDK
 *   2. Load their Lens (Stoic)
 *   3. Check permissions before every AI call
 *   4. Include the Lens overlay in their AI prompt
 *   5. Display the governed result on the glasses
 *
 * Run:
 *   npx tsx examples/stoic-translator/demo.ts
 */

import {
  MentraGovernedExecutor,
  DEFAULT_USER_RULES,
} from '../../src/adapters/mentraos';
import type { AppContext, UserRules } from '../../src/adapters/mentraos';
import {
  STOIC_LENS,
  MINIMALIST_LENS,
  compileLensOverlay,
  previewLens,
} from '../../src/builder/lens';
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
  console.log(`\n${BOLD}${CYAN}${'='.repeat(63)}${RESET}`);
  console.log(`${BOLD}${CYAN}  ${text}${RESET}`);
  console.log(`${BOLD}${CYAN}${'='.repeat(63)}${RESET}\n`);
}

function step(num: number, text: string) {
  console.log(`\n${BOLD}${BLUE}-- Step ${num}: ${text} --${RESET}\n`);
}

function code(label: string, content: string) {
  console.log(`  ${BOLD}${MAGENTA}${label}${RESET}`);
  for (const line of content.split('\n')) {
    console.log(`  ${DIM}${line}${RESET}`);
  }
}

function info(text: string) {
  console.log(`  ${DIM}${text}${RESET}`);
}

// ─── Load Platform World ────────────────────────────────────────────────────

const worldPath = resolve(__dirname, '../../src/worlds/mentraos-smartglasses.nv-world.md');
const worldMd = readFileSync(worldPath, 'utf-8');
const parseResult = parseWorldMarkdown(worldMd);
if (!parseResult.world || parseResult.issues.some(i => i.severity === 'error')) {
  console.error('Parse errors:', parseResult.issues.filter(i => i.severity === 'error'));
  process.exit(1);
}
const world = emitWorldDefinition(parseResult.world).world;

// ═══════════════════════════════════════════════════════════════════════════

header('Stoic Translator — Developer Lens Example');
console.log(`  ${DIM}A MentraOS translation app that sees the world through${RESET}`);
console.log(`  ${DIM}a Stoic philosophical Lens. Two governance layers:${RESET}`);
console.log(`  ${DIM}  1. Permission: CAN the AI act?${RESET}`);
console.log(`  ${DIM}  2. Lens:       HOW should the AI act?${RESET}`);

// ── Step 1: Developer defines their app ─────────────────────────────────

step(1, 'Developer defines their app');

const stoicTranslator: AppContext = {
  appId: 'stoic-translator',
  aiProviderDeclared: true,
  declaredAIProviders: ['anthropic'],
  dataRetentionOptedIn: false,
  aiDataTypesSent: 1,
  glassesModel: 'even_realities_g1',
};

code('App registration at console.mentra.glass:', `{
  "app_id": "stoic-translator",
  "name": "Stoic Translator",
  "permissions": ["MICROPHONE"],
  "ai_providers": ["anthropic"],
  "description": "Translates conversations with Stoic clarity"
}`);

// ── Step 2: Developer loads the Lens ─────────────────────────────────────

step(2, 'Developer loads the Stoic Lens');
info('The developer picks a Lens to shape their app\'s AI behavior.\n');

console.log(previewLens(STOIC_LENS));

// ── Step 3: Compile the Lens into a prompt overlay ──────────────────────

step(3, 'Compile Lens into AI prompt overlay');
info('The Lens directives become instructions for the LLM.\n');

const overlay = compileLensOverlay([STOIC_LENS]);

code('System prompt addition (injected into every AI call):', overlay.systemPromptAddition);

console.log();
info(`Active directives: ${overlay.activeDirectives.length}`);
info(`Source lenses: ${overlay.sources.join(', ')}`);

// ── Step 4: User's permission rules check ───────────────────────────────

step(4, 'Check user\'s permission rules before AI call');
info('The user installed this app. Their personal rules apply.\n');

const userRules: UserRules = {
  ...DEFAULT_USER_RULES,
  aiDataPolicy: 'declared_only',
  aiMessagingPolicy: 'block_all',
};

const executor = new MentraGovernedExecutor(world, {}, userRules);

// Check: can we send transcription to Claude?
console.log(`  ${BOLD}Permission check:${RESET} ai_send_transcription`);
const permCheck = executor.evaluate('ai_send_transcription', stoicTranslator);
if (permCheck.allowed) {
  console.log(`  ${GREEN}ALLOWED${RESET} — app declared Anthropic, user allows declared providers`);
} else if (permCheck.requiresConfirmation) {
  console.log(`  ${YELLOW}NEEDS CONFIRMATION${RESET} — ${permCheck.verdict.reason}`);
} else {
  console.log(`  ${RED}BLOCKED${RESET} — ${permCheck.verdict.reason}`);
}

// ── Step 5: Simulate the full flow ──────────────────────────────────────

step(5, 'Full flow: transcription → AI → display');
info('Someone says something in a meeting. The app processes it.\n');

const transcription = 'The project deadline moved up by two weeks and we lost our lead developer.';
console.log(`  ${BOLD}User hears:${RESET}`);
console.log(`  "${transcription}"\n`);

// Step 5a: Permission check
console.log(`  ${BOLD}Step 5a:${RESET} Check permission to send to AI`);
const sendCheck = executor.evaluate('ai_send_transcription', stoicTranslator);
if (!sendCheck.allowed && !sendCheck.requiresConfirmation) {
  console.log(`  ${RED}BLOCKED — cannot proceed${RESET}`);
  process.exit(0);
}
console.log(`  ${GREEN}Permission granted${RESET}\n`);

// Step 5b: Build AI prompt WITH Lens overlay
console.log(`  ${BOLD}Step 5b:${RESET} Build AI prompt with Stoic Lens`);
const aiPrompt = `${overlay.systemPromptAddition}

## Task
The user heard the following in a conversation. Provide a brief, helpful response
that they can read on their glasses display (keep it under 30 words).

User heard: "${transcription}"`;

code('Full AI prompt (what gets sent to Claude):', aiPrompt);

// Step 5c: Simulate AI response
console.log(`\n  ${BOLD}Step 5c:${RESET} AI responds with Stoic framing`);

const withoutLens = 'Oh no, that\'s really stressful! Losing your lead dev and a tighter deadline is a lot. You should probably escalate this to leadership immediately.';
const withLens = 'Deadline and team changed — outside your control. Within your control: reprioritize scope, redistribute tasks. Which would you like to start with?';

console.log(`\n  ${YELLOW}Without Lens:${RESET}`);
console.log(`  "${withoutLens}"\n`);
console.log(`  ${GREEN}With Stoic Lens:${RESET}`);
console.log(`  "${withLens}"\n`);

// Step 5d: Permission check for display
console.log(`  ${BOLD}Step 5d:${RESET} Check permission to display result`);
const displayCheck = executor.evaluate('display_text_wall', stoicTranslator);
console.log(`  ${GREEN}Display allowed${RESET} — showing on glasses\n`);

// ── Step 6: Stack Lenses ────────────────────────────────────────────────

step(6, 'Stack Lenses: Stoic + Minimalist');
info('User installs both Stoic and Minimalist lenses.\n');

const stackedOverlay = compileLensOverlay([STOIC_LENS, MINIMALIST_LENS]);

info(`Stacked directives: ${stackedOverlay.activeDirectives.length} (from ${stackedOverlay.sources.join(' + ')})`);
info(`Stoic shapes the framing. Minimalist shapes the length.`);

const stackedResponse = 'Deadline moved, dev left. Reprioritize scope or redistribute tasks?';
console.log(`\n  ${GREEN}Stacked result:${RESET}`);
console.log(`  "${stackedResponse}"\n`);
info('Stoic framing + minimalist brevity = perfect for glasses display.');

// ── Step 7: Show what the developer's code looks like ───────────────────

step(7, 'What the developer\'s code actually looks like');
info('This is what a MentraOS app developer writes:\n');

code('stoic-translator/server.ts:', `import { MentraGovernedExecutor } from '@neuroverseos/governance/adapters/mentraos';
import { compileLensOverlay, STOIC_LENS } from '@neuroverseos/governance/builder/lens';

// Load governance once at startup
const executor = new MentraGovernedExecutor(platformWorld, {}, userRules);
const overlay = compileLensOverlay([STOIC_LENS]);

// On every transcription event from MentraOS SDK:
async function onTranscription(session, text) {
  // 1. Check permission
  const check = executor.evaluate('ai_send_transcription', appContext);
  if (!check.allowed) return; // Governance says no

  // 2. Call AI with Lens overlay
  const response = await claude.messages.create({
    system: overlay.systemPromptAddition,
    messages: [{ role: 'user', content: text }],
  });

  // 3. Check display permission
  const displayCheck = executor.evaluate('display_text_wall', appContext);
  if (!displayCheck.allowed) return;

  // 4. Show on glasses
  session.layouts.showTextWall(response.content);
}`);

// ── Summary ─────────────────────────────────────────────────────────────

header('Two Layers of Governance');
console.log(`  ${BOLD}Layer 1 — Permission:${RESET} CAN the AI act?`);
console.log(`    User rules decide: block, allow, or confirm.`);
console.log(`    "Can this app send my speech to Claude?" → ${GREEN}Yes${RESET} (declared provider)`);
console.log(`    "Can this app send a message as me?" → ${RED}No${RESET} (user blocked messaging)`);
console.log();
console.log(`  ${BOLD}Layer 2 — Lens:${RESET} HOW should the AI act?`);
console.log(`    Lens directives shape the AI's responses.`);
console.log(`    "Frame obstacles as opportunities, not catastrophes"`);
console.log(`    "Distinguish what's in your control from what isn't"`);
console.log(`    "Be clear and direct, not emotionally manipulative"`);
console.log();
console.log(`  ${BOLD}Together:${RESET}`);
console.log(`    Permission rules are the ${RED}gate${RESET}.`);
console.log(`    Lenses are the ${CYAN}lens${RESET}.`);
console.log(`    Gate decides IF. Lens decides HOW.`);
console.log();
console.log(`  ${DIM}Lenses are shareable. A philosopher creates one.${RESET}`);
console.log(`  ${DIM}A hospital publishes one. A retail chain deploys one.${RESET}`);
console.log(`  ${DIM}Users install them like themes. Developers build on them.${RESET}`);
console.log();
