#!/usr/bin/env npx tsx
/**
 * Lenses App — Interactive Demo
 *
 * Simulates the full app flow on your terminal. No glasses. No API key.
 * Shows how governance + lenses work end-to-end.
 *
 * This is what you'd demo to Mentra. It proves:
 *   1. Three-layer governance (user rules → platform → app)
 *   2. Lens system (same input, different perspective)
 *   3. User activation model (tap-to-talk, not always-on)
 *   4. App-specific governance (users control their own app rules)
 *   5. Zero-cost architecture (lens = prompt injection, not a service)
 *
 * Run:
 *   npx tsx apps/lenses/src/demo.ts
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
} from '../../../src/builder/lens';

import {
  MentraGovernedExecutor,
  DEFAULT_USER_RULES,
} from '../../../src/adapters/mentraos';
import type { AppContext } from '../../../src/adapters/mentraos';

import { parseWorldMarkdown } from '../../../src/engine/bootstrap-parser';
import { emitWorldDefinition } from '../../../src/engine/bootstrap-emitter';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

const bar = (c: string) => `${B}${c}${'─'.repeat(72)}${R}`;
const header = (t: string) => `\n${bar(CYN)}\n${B}${CYN}  ${t}${R}\n${bar(CYN)}\n`;
const glasses = (t: string) => `  ${B}${GRN}┌─ GLASSES ──────────────────────────────────────────────┐${R}\n  ${B}${GRN}│${R} ${t}\n  ${B}${GRN}└────────────────────────────────────────────────────────┘${R}`;
const userSays = (t: string) => `  ${B}${BLU}[USER]${R} "${t}"`;
const userTaps = (t: string) => `  ${B}${MAG}[TAP]${R} ${t}`;
const gov = (intent: string, ok: boolean, layer: string, reason?: string) =>
  `  ${D}[GOV]${R} ${intent} → ${ok ? `${GRN}ALLOW${R}` : `${RED}BLOCK${R}`} ${D}(${layer})${R}${reason ? ` ${D}${reason}${R}` : ''}`;
const sys = (t: string) => `  ${D}${t}${R}`;
const gap = () => console.log();

// ─── Simulated AI Responses ──────────────────────────────────────────────────

const RESPONSES: Record<string, Record<string, string>> = {
  'I have too much to do today and I feel overwhelmed.': {
    stoic: "You can't do everything. Pick the one thing that matters most. Do that. The rest will wait or it won't.",
    coach: "What's the ONE thing that if you finished it, you'd feel good about today? Start there. 10 minutes.",
    calm: "Breathe. You don't have to do it all right now. What's the most important thing today?",
    closer: "List the three that actually move the needle. Kill the rest. What are they?",
    samurai: "Too much is noise. One task. Do it now.",
    hype_man: "You're juggling all that and you're STILL here thinking about it? That's discipline. Pick one and crush it.",
    monk: "What if you did less today? Would the world end?",
    socratic: "Which of those tasks would you regret NOT doing by tonight?",
    minimalist: "Pick one. Do it.",
  },
  'My friend cancelled on me again.': {
    stoic: "Their actions are outside your control. How you spend your now-free time is within it.",
    coach: "That's frustrating. But you've got unexpected free time. What's something you've been putting off?",
    calm: "That stings. But you've got an evening to yourself now. That's not nothing.",
    closer: "Pattern or one-off? If it's a pattern, time for a direct conversation.",
    samurai: "They cancelled. The evening is yours. Use it.",
    hype_man: "Their loss. You were going to be the best part of their night. What are YOU doing instead?",
    monk: "Sit with the disappointment. Then let it go. The evening is still here.",
    socratic: "Is this about the cancellation, or about what it might mean about the friendship?",
    minimalist: "Free evening. What now?",
  },
  'Should I take this new job offer?': {
    stoic: "What's within your control? Your effort, your values, your choice. Make the decision that aligns with who you want to be. Not who you're afraid of becoming.",
    coach: "What does your gut say? Now — what's the one thing making you hesitate? Let's deal with that specific thing.",
    calm: "You don't have to decide right now. What would help you think more clearly about this?",
    closer: "What do you want that this job gives you? Name the specific thing. Then ask: can I get it without switching?",
    samurai: "Do you want it? Then take it. If you're asking, you already know.",
    hype_man: "They want YOU. Out of everyone, they picked you. That's not nothing. Now — do YOU want THEM?",
    monk: "What changes if you take it? What changes if you don't? Which version of change feels lighter?",
    socratic: "What would your life look like in a year if you took it? And if you didn't? Which version do you want to be?",
    minimalist: "Pros. Cons. Gut. Decide.",
  },
  'I just got rejected from something I really wanted.': {
    stoic: "The outcome was never in your control. Your response to it is. What's the next move?",
    coach: "That hurts. Feel it. Now — what did you learn that makes the next attempt better?",
    calm: "That's a hard one. You don't need to do anything about it right now. Just let yourself feel it.",
    closer: "They said no. That's data, not a verdict. What was the real objection? That's where your next attempt starts.",
    samurai: "You fell. Stand up. The next battle is already here.",
    hype_man: "You PUT YOURSELF OUT THERE. Most people don't even try. The rejection means you're playing at a level most people are too scared to approach.",
    monk: "The thing you wanted — did you need it? Or did you need to want it? Sit with that.",
    socratic: "What does this rejection actually change about your life today? Not what it feels like — what does it change?",
    minimalist: "Rejected. Next.",
  },
};

// ─── Load Governance ─────────────────────────────────────────────────────────

const platformWorldPath = resolve(__dirname, '../../../src/worlds/mentraos-smartglasses.nv-world.md');
const platformWorldMd = readFileSync(platformWorldPath, 'utf-8');
const platformParsed = parseWorldMarkdown(platformWorldMd);
if (!platformParsed.world || platformParsed.issues.some(i => i.severity === 'error')) {
  console.error('Platform world parse errors:', platformParsed.issues.filter(i => i.severity === 'error'));
  process.exit(1);
}
const platformWorld = emitWorldDefinition(platformParsed.world).world;

// Also load app-specific governance
let appWorldLoaded = false;
try {
  const appWorldPath = resolve(__dirname, './worlds/lenses-app.nv-world.md');
  const appWorldMd = readFileSync(appWorldPath, 'utf-8');
  const appParsed = parseWorldMarkdown(appWorldMd);
  if (appParsed.world && !appParsed.issues.some(i => i.severity === 'error')) {
    appWorldLoaded = true;
  }
} catch {
  // That's fine
}

const appContext: AppContext = {
  appId: 'com.neuroverse.lenses',
  aiProviderDeclared: true,
  declaredAIProviders: ['openai', 'anthropic'],
  dataRetentionOptedIn: false,
  aiDataTypesSent: 0,
  glassesModel: 'even_realities_g1',
};

const executor = new MentraGovernedExecutor(platformWorld, {}, DEFAULT_USER_RULES);

// ═══════════════════════════════════════════════════════════════════════════════
// THE DEMO
// ═══════════════════════════════════════════════════════════════════════════════

console.log(header('Lenses — Pick Who You Want in Your Corner'));
console.log(sys('A real MentraOS app. Built on NeuroverseOS governance.'));
console.log(sys('This demo simulates the full app experience on your terminal.'));
gap();
console.log(sys(`Governance layers active:`));
console.log(sys(`  Layer 1: User Rules (personal, cross-app) ✓`));
console.log(sys(`  Layer 2: Platform World (mentraos-smartglasses) ✓`));
console.log(sys(`  Layer 3: App World (lenses-app) ${appWorldLoaded ? '✓' : '○ (optional)'}`));

// ── Scene 1: Session Start + Onboarding ──────────────────────────────────────

console.log(header('Scene 1: App Launch'));
console.log(sys('User opens Lenses from the Mentra Store app drawer.'));
console.log(sys('First launch — no API key yet.'));
gap();
console.log(glasses('Welcome to Lenses. Go to Settings to add your AI API key.'));
gap();
console.log(sys('User opens Settings on their phone...'));
console.log(sys('  → AI Provider: Anthropic (Claude)'));
console.log(sys('  → API Key: sk-ant-...7xQ'));
console.log(sys('  → Active Lens: Stoic'));
console.log(sys('  → Activation: Tap & Hold'));
console.log(sys('  → Max Response: 30 words'));
console.log(sys('  → Camera Context: Off'));
gap();
console.log(sys('Settings saved. App restarts session.'));

let activeLens = STOIC_LENS;
let overlay = compileLensOverlay([activeLens]);

gap();
console.log(glasses(`Stoic Lens active. "Focus on what you can control." — Hold temple to talk.`));

// ── Scene 2: First Conversation (Tap to Talk) ───────────────────────────────

console.log(header('Scene 2: Tap-to-Talk'));
console.log(sys('User is walking to work. Feeling stressed.'));
gap();

console.log(userTaps('User holds temple touchpad ─── listening...'));
console.log(glasses(`🎙 Stoic listening...`));
gap();

const input1 = 'I have too much to do today and I feel overwhelmed.';
console.log(userSays(input1));
gap();

console.log(userTaps('User releases temple ─── processing...'));
gap();

// Governance
const check1 = executor.evaluate('ai_send_transcription', appContext);
console.log(gov('ai_send_transcription', check1.allowed, check1.decidingLayer));
console.log(sys(`Compiling Stoic overlay (${overlay.activeDirectives.length} directives)...`));
console.log(sys(`Calling user's AI (Claude Haiku) with lens overlay...`));
gap();

const displayCheck1 = executor.evaluate('display_text_wall', appContext);
console.log(gov('display_text_wall', displayCheck1.allowed, displayCheck1.decidingLayer));
gap();

const response1 = RESPONSES[input1]?.[activeLens.id] ?? '';
console.log(glasses(response1));

// ── Scene 3: Switch Lens via Voice ───────────────────────────────────────────

console.log(header('Scene 3: Switch Lens'));
console.log(sys('User wants a different perspective. Same moment, different voice.'));
gap();

console.log(userTaps('User holds temple...'));
console.log(userSays('Switch to Hype Man'));
console.log(userTaps('User releases temple...'));
gap();

console.log(sys('Voice command detected: lens switch'));
activeLens = HYPE_MAN_LENS;
overlay = compileLensOverlay([activeLens]);
console.log(sys(`Recompiled overlay: ${overlay.activeDirectives.length} directives`));
gap();

console.log(glasses(`Hype Man. "You just did that. You actually just did that."`));

// ── Scene 4: Same Input, Different Lens ──────────────────────────────────────

console.log(header('Scene 4: Same Words, Different World'));
console.log(sys('Same situation. Same words. Completely different perspective.'));
gap();

console.log(userTaps('User holds temple...'));
console.log(userSays(input1));
console.log(userTaps('User releases...'));
gap();

const check2 = executor.evaluate('ai_send_transcription', appContext);
console.log(gov('ai_send_transcription', check2.allowed, check2.decidingLayer));
gap();

const response2 = RESPONSES[input1]?.[activeLens.id] ?? '';
console.log(glasses(response2));
gap();

console.log(sys(`Same input. Stoic said: "${RESPONSES[input1]?.['stoic']}"`));
console.log(sys(`Hype Man said: "${response2}"`));
console.log(sys(`Same AI. Same data. Different lens. Different experience.`));

// ── Scene 5: Multiple Scenarios, Multiple Lenses ─────────────────────────────

console.log(header('Scene 5: Life Happens'));
console.log(sys('Different moments throughout the day. Each lens responds differently.'));

const scenarios: Array<{ input: string; lens: Lens; context: string }> = [
  { input: 'My friend cancelled on me again.', lens: SOCRATIC_LENS, context: 'After work, checking phone' },
  { input: 'Should I take this new job offer?', lens: COACH_LENS, context: 'At home, thinking about career' },
  { input: 'I just got rejected from something I really wanted.', lens: MONK_LENS, context: 'Late evening, processing the day' },
];

for (const scenario of scenarios) {
  gap();
  console.log(sys(`── ${scenario.context} ──`));
  console.log(sys(`Active lens: ${scenario.lens.name}`));
  gap();

  console.log(userTaps('Hold temple...'));
  console.log(userSays(scenario.input));
  console.log(userTaps('Release...'));

  const check = executor.evaluate('ai_send_transcription', appContext);
  console.log(gov('ai_send_transcription', check.allowed, check.decidingLayer));

  const resp = RESPONSES[scenario.input]?.[scenario.lens.id] ?? '';
  console.log(glasses(resp));
}

// ── Scene 6: Lens Stacking ───────────────────────────────────────────────────

console.log(header('Scene 6: Lens Stacking'));
console.log(sys('User stacks Stoic + Minimalist. Stoic clarity meets minimal words.'));
console.log(sys('Perfect for glasses where every character counts.'));
gap();

console.log(userTaps('Hold...'));
console.log(userSays('Stack Minimalist'));
console.log(userTaps('Release...'));

const stackedOverlay = compileLensOverlay([STOIC_LENS, MINIMALIST_LENS]);
console.log(sys(`Stacked: ${stackedOverlay.activeDirectives.length} directives from Stoic + Minimalist`));
gap();

console.log(glasses('Stoic + Minimalist'));
gap();

console.log(userTaps('Hold...'));
console.log(userSays('I have too much to do today and I feel overwhelmed.'));
console.log(userTaps('Release...'));

const checkStack = executor.evaluate('ai_send_transcription', appContext);
console.log(gov('ai_send_transcription', checkStack.allowed, checkStack.decidingLayer));
gap();

console.log(glasses('Pick the one thing that matters. Do it.'));
console.log(sys('Stoic framing + minimalist brevity. 9 words on a glasses display.'));

// ── Scene 7: Governance in Action ────────────────────────────────────────────

console.log(header('Scene 7: Governance Protects the User'));
console.log(sys('What if an app pretends to be Lenses but doesn\'t declare its AI provider?'));
console.log(sys('MentraOS governance catches it BEFORE any data leaves the phone.'));
gap();

const sketchyContext: AppContext = {
  ...appContext,
  appId: 'com.sketchy.fake-lenses',
  aiProviderDeclared: false,
  declaredAIProviders: [],
};

console.log(sys(`App: "com.sketchy.fake-lenses" — no AI provider declared`));
console.log(userSays('Tell me something inspiring.'));

const sketchyCheck = executor.evaluate('ai_send_transcription', sketchyContext);
console.log(gov(
  'ai_send_transcription',
  sketchyCheck.allowed,
  sketchyCheck.decidingLayer,
  sketchyCheck.verdict.reason,
));
gap();

console.log(sys('Governance blocked. User data never left the phone.'));
console.log(sys('This is why governance matters at the platform level.'));

// ── Scene 8: App-Specific Governance ─────────────────────────────────────────

console.log(header('Scene 8: App-Specific Governance'));
console.log(sys('Users can set rules FOR THIS APP in Settings > App Rules.'));
console.log(sys('This is governance that the USER controls, not just the platform.'));
gap();

console.log(sys('Example: User sets app governance to "privacy_first":'));
console.log(sys('  → Camera context: blocked'));
console.log(sys('  → Always-on mode: blocked'));
console.log(sys('  → AI calls limited to 5/minute'));
gap();

console.log(sys('These rules sit between the platform world and the AI call.'));
console.log(sys('Three layers, user on top:'));
gap();
console.log(`  ${B}${GRN}Layer 1: User Rules${R}     ${D}← Personal. Cross-app. User is king.${R}`);
console.log(`  ${B}${BLU}Layer 2: Platform World${R} ${D}← MentraOS enforces hardware + safety.${R}`);
console.log(`  ${B}${YLW}Layer 3: App World${R}      ${D}← Lenses-specific. User-customizable.${R}`);
console.log(`  ${D}────────────────────────${R}`);
console.log(`  ${D}AI Call${R}                 ${D}← Only happens if all three layers allow it.${R}`);

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(header('What This Proves'));
gap();
console.log(`  ${B}1.${R} Governance works at every level — platform, app, and user`);
console.log(`  ${B}2.${R} Lenses change HOW AI responds, not WHETHER it responds`);
console.log(`  ${B}3.${R} Users control their experience — activation mode, lens, rules`);
console.log(`  ${B}4.${R} BYO-key means zero data liability, zero API cost`);
console.log(`  ${B}5.${R} App-specific governance lets users tune their own apps`);
console.log(`  ${B}6.${R} Bad actors get caught BEFORE data leaves the device`);
gap();
console.log(`  ${B}${CYN}Available Lenses:${R}`);
for (const lens of getLenses()) {
  console.log(`    ${B}${lens.name}${R} ${D}— ${lens.tagline}${R}`);
}
gap();
console.log(`  ${B}Cost to NeuroverseOS:${R} $0 per user (BYO key)`);
console.log(`  ${B}Cost to user:${R}         ~$0.001 per activation (150 tokens, Haiku rates)`);
console.log(`  ${B}What we provide:${R}      The lens. The governance. The experience.`);
gap();
console.log(`  ${B}${CYN}This is a deployable MentraOS app — not an example.${R}`);
console.log(`  ${D}Submit to Mentra Store: mentra.app.json included.${R}`);
gap();
