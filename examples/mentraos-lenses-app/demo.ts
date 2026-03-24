#!/usr/bin/env npx tsx
/**
 * Lenses App — Local Demo (no glasses, no SDK, no API key needed)
 *
 * Simulates the full app flow:
 *   1. User launches app → picks a lens
 *   2. User speaks → governance checks permission
 *   3. Lens overlay compiled → injected into AI prompt
 *   4. Simulated AI response through the lens
 *   5. Displayed on "glasses" (your terminal)
 *
 * This proves the governance + lens pipeline works end-to-end.
 * The only thing missing is the actual AI call (simulated here)
 * and the MentraOS SDK (replaced with console output).
 *
 * Run:
 *   npx tsx examples/mentraos-lenses-app/demo.ts
 */

import {
  STOIC_LENS,
  COACH_LENS,
  CALM_LENS,
  CLOSER_LENS,
  SAMURAI_LENS,
  HYPE_MAN_LENS,
  MONK_LENS,
  SOCRATIC_LENS,
  MINIMALIST_LENS,
  compileLensOverlay,
  getLenses,
  type Lens,
} from '../../src/builder/lens';

import {
  MentraGovernedExecutor,
  DEFAULT_USER_RULES,
} from '../../src/adapters/mentraos';
import type { AppContext, UserRules } from '../../src/adapters/mentraos';

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
  console.log(`\n${BOLD}${CYAN}${'═'.repeat(70)}${RESET}`);
  console.log(`${BOLD}${CYAN}  ${text}${RESET}`);
  console.log(`${BOLD}${CYAN}${'═'.repeat(70)}${RESET}\n`);
}

function glasses(text: string) {
  console.log(`  ${BOLD}${GREEN}[GLASSES DISPLAY]${RESET} ${text}`);
}

function user(text: string) {
  console.log(`  ${BOLD}${BLUE}[USER SAYS]${RESET} "${text}"`);
}

function system(text: string) {
  console.log(`  ${DIM}${text}${RESET}`);
}

function govCheck(intent: string, allowed: boolean, layer: string, reason?: string) {
  const status = allowed ? `${GREEN}ALLOWED${RESET}` : `${RED}BLOCKED${RESET}`;
  console.log(`  ${DIM}[GOV]${RESET} ${intent} → ${status} ${DIM}(${layer})${RESET}${reason ? ` ${DIM}${reason}${RESET}` : ''}`);
}

// ─── Simulated AI Responses ─────────────────────────────────────────────────
// In production, these come from the user's AI provider.
// Here we show what each lens would produce.

const SIMULATED_RESPONSES: Record<string, Record<string, string>> = {
  'I have too much to do today and I feel overwhelmed.': {
    stoic: "You can't do everything. Pick the one thing that matters most. Do that. The rest will wait or it won't.",
    coach: "What's the ONE thing that if you finished it, you'd feel good about today? Start there. 10 minutes.",
    calm: "Breathe. You don't have to do it all right now. What's the most important thing today?",
    closer: "List the three that actually move the needle. Kill the rest. What are they?",
    samurai: "Too much is noise. One task. Do it now.",
    hype_man: "You're juggling all that and you're STILL here thinking about it? That's discipline. Now pick one and crush it.",
    monk: "What if you did less today? Would the world end?",
    socratic: "Which of those tasks would you regret NOT doing by tonight?",
    minimalist: "Pick one. Do it.",
  },
  'My friend cancelled on me again.': {
    stoic: "Their actions are outside your control. How you spend your now-free time is within it. What would you like to do?",
    coach: "That's frustrating. But you've got unexpected free time. What's something you've been putting off?",
    calm: "That stings. But you've got an evening to yourself now. That's not nothing.",
    closer: "Pattern or one-off? If it's a pattern, time for a direct conversation. If not, enjoy the free night.",
    samurai: "They cancelled. The evening is yours. Use it.",
    hype_man: "Their loss. You were going to be the best part of their night and now they'll never know. What are YOU going to do instead?",
    monk: "Sit with the disappointment for a moment. Then let it go. The evening is still here.",
    socratic: "Is this about the cancellation, or about what it might mean about the friendship?",
    minimalist: "Free evening. What now?",
  },
};

// ─── Load Governance ────────────────────────────────────────────────────────

const worldPath = resolve(__dirname, '../../src/worlds/mentraos-smartglasses.nv-world.md');
const worldMd = readFileSync(worldPath, 'utf-8');
const parseResult = parseWorldMarkdown(worldMd);
if (!parseResult.world || parseResult.issues.some(i => i.severity === 'error')) {
  console.error('World parse errors:', parseResult.issues.filter(i => i.severity === 'error'));
  process.exit(1);
}
const world = emitWorldDefinition(parseResult.world).world;

// ─── App Context ────────────────────────────────────────────────────────────

const appContext: AppContext = {
  appId: 'com.neuroverse.lenses',
  aiProviderDeclared: true,
  declaredAIProviders: ['openai', 'anthropic'],
  dataRetentionOptedIn: false,
  aiDataTypesSent: 0,
  glassesModel: 'even_realities_g1',
};

// ═══════════════════════════════════════════════════════════════════════════

header('Lenses App — Full Flow Demo');
console.log(`  ${DIM}Simulating the complete app experience.${RESET}`);
console.log(`  ${DIM}No glasses needed. No API key needed. Just the governance pipeline.${RESET}`);
console.log(`  ${DIM}In production: user's own API key calls their own AI provider.${RESET}`);

// ── Session Start ───────────────────────────────────────────────────────────

header('Session Start');
system('User launches Lenses app from Mentra Store...');
system('Checking user settings for API key...');
system('API key found: sk-...7xQ (OpenAI) — BYO key model');
system('Loading saved lens preference...');

let activeLens = STOIC_LENS;
let overlay = compileLensOverlay([activeLens]);
const executor = new MentraGovernedExecutor(world, {}, DEFAULT_USER_RULES);

glasses(`${activeLens.name} active. "${activeLens.tagline}" — Talk to me.`);

// ── Conversation 1: Overwhelmed ─────────────────────────────────────────────

header('Conversation 1: Overwhelmed');

const input1 = 'I have too much to do today and I feel overwhelmed.';
user(input1);

// Governance check
system('');
const check1 = executor.evaluate('ai_send_transcription', appContext);
govCheck('ai_send_transcription', check1.allowed, check1.decidingLayer);

system(`Compiling ${activeLens.name} overlay (${overlay.activeDirectives.length} directives)...`);
system('Calling user\'s AI (OpenAI gpt-4o-mini) with lens overlay...');

const response1 = SIMULATED_RESPONSES[input1]?.[activeLens.id] ?? '';
system('');

const displayCheck1 = executor.evaluate('display_text_wall', appContext);
govCheck('display_text_wall', displayCheck1.allowed, displayCheck1.decidingLayer);

glasses(response1);

// ── Voice Command: Switch Lens ──────────────────────────────────────────────

header('Voice Command: Switch Lens');

user('Switch to Hype Man');
system('Voice command detected: lens switch');

activeLens = HYPE_MAN_LENS;
overlay = compileLensOverlay([activeLens]);
system(`Recompiled overlay: ${overlay.activeDirectives.length} directives from ${activeLens.name}`);
glasses(`Switched to ${activeLens.name}. "${activeLens.tagline}"`);

// ── Conversation 2: Same input, different lens ──────────────────────────────

header('Conversation 2: Same Input, Different Lens');

user(input1);

const check2 = executor.evaluate('ai_send_transcription', appContext);
govCheck('ai_send_transcription', check2.allowed, check2.decidingLayer);

const response2 = SIMULATED_RESPONSES[input1]?.[activeLens.id] ?? '';
glasses(response2);

system('');
system(`Same words. Different lens. Different experience.`);

// ── Conversation 3: Different situation ─────────────────────────────────────

header('Conversation 3: Different Situation');

const input2 = 'My friend cancelled on me again.';

// Cycle through a few lenses to show the range
const demoLenses: Lens[] = [MONK_LENS, CLOSER_LENS, SOCRATIC_LENS];

for (const lens of demoLenses) {
  activeLens = lens;
  overlay = compileLensOverlay([activeLens]);

  console.log();
  system(`Active lens: ${lens.name} — "${lens.tagline}"`);
  user(input2);

  const check = executor.evaluate('ai_send_transcription', appContext);
  govCheck('ai_send_transcription', check.allowed, check.decidingLayer);

  const response = SIMULATED_RESPONSES[input2]?.[lens.id] ?? '';
  glasses(response);
}

// ── Governance: Sketchy scenario ────────────────────────────────────────────

header('Governance: What If the App Goes Rogue?');
system('What if someone forked Lenses and removed the AI provider declaration?');
system('');

const sketchyContext: AppContext = {
  ...appContext,
  appId: 'com.sketchy.fake-lenses',
  aiProviderDeclared: false,
  declaredAIProviders: [],
};

user('Tell me something inspiring.');
const sketchyCheck = executor.evaluate('ai_send_transcription', sketchyContext);
govCheck(
  'ai_send_transcription',
  sketchyCheck.allowed,
  sketchyCheck.decidingLayer,
  sketchyCheck.verdict.reason,
);
system('Governance blocks the call. User data never leaves the phone.');
system('The user never even knows it was attempted — it just silently fails.');

// ── Lens Stacking ───────────────────────────────────────────────────────────

header('Bonus: Lens Stacking');
system('User activates Stoic + Minimalist together.');
system('Stoic shapes the framing. Minimalist shapes the length.');
system('Perfect for glasses where display space is limited.');

const stackedOverlay = compileLensOverlay([STOIC_LENS, MINIMALIST_LENS]);
system(`Stacked: ${stackedOverlay.activeDirectives.length} directives from ${stackedOverlay.sources.join(' + ')}`);
system('');

user(input1);
glasses("Pick the one thing that matters. Do it.");
system('');
system('Stoic clarity + minimalist brevity. 8 words on a glasses display.');

// ── Summary ─────────────────────────────────────────────────────────────────

header('How It Works');
console.log(`  ${BOLD}1.${RESET} User brings their own AI API key (OpenAI or Anthropic)`);
console.log(`  ${BOLD}2.${RESET} User picks a lens — who they want in their corner`);
console.log(`  ${BOLD}3.${RESET} User talks → governance checks permission → lens shapes the prompt`);
console.log(`  ${BOLD}4.${RESET} Their API key calls their AI → response shown on glasses`);
console.log(`  ${BOLD}5.${RESET} We never see their key. We never store their data. We just shape the voice.`);
console.log();
console.log(`  ${BOLD}${CYAN}Available Lenses:${RESET}`);
for (const lens of getLenses()) {
  console.log(`    ${BOLD}${lens.name}${RESET} ${DIM}— ${lens.tagline}${RESET}`);
}
console.log();
console.log(`  ${BOLD}Cost to us:${RESET} $0 per user (they pay their own AI provider)`);
console.log(`  ${BOLD}Cost to user:${RESET} ~$0.001 per conversation (150 tokens at GPT-4o-mini rates)`);
console.log(`  ${BOLD}What we provide:${RESET} The lens. The governance. The experience.`);
console.log();
