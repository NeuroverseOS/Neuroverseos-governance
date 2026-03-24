#!/usr/bin/env npx tsx
/**
 * Lenses App — Governance Validation
 *
 * Validates that all governance worlds load correctly and the full
 * evaluation pipeline works. Run before deploying.
 *
 * Run:
 *   npx tsx apps/lenses/src/validate.ts
 */

import {
  MentraGovernedExecutor,
  DEFAULT_USER_RULES,
} from '../../../src/adapters/mentraos';
import type { AppContext } from '../../../src/adapters/mentraos';
import { parseWorldMarkdown } from '../../../src/engine/bootstrap-parser';
import { emitWorldDefinition } from '../../../src/engine/bootstrap-emitter';
import { getLenses, compileLensOverlay } from '../../../src/builder/lens';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const B = '\x1b[1m';
const D = '\x1b[2m';
const R = '\x1b[0m';
const GRN = '\x1b[32m';
const RED = '\x1b[31m';
const YLW = '\x1b[33m';

let passed = 0;
let failed = 0;

function check(name: string, fn: () => boolean) {
  try {
    const ok = fn();
    if (ok) {
      console.log(`  ${GRN}✓${R} ${name}`);
      passed++;
    } else {
      console.log(`  ${RED}✗${R} ${name}`);
      failed++;
    }
  } catch (err) {
    console.log(`  ${RED}✗${R} ${name} — ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

console.log(`\n${B}Lenses App — Governance Validation${R}\n`);

// ── Platform World ───────────────────────────────────────────────────────────

console.log(`${D}Platform world:${R}`);

let platformWorld: ReturnType<typeof emitWorldDefinition>['world'] | null = null;

check('Platform world (mentraos-smartglasses) loads', () => {
  const path = resolve(__dirname, '../../../src/worlds/mentraos-smartglasses.nv-world.md');
  const md = readFileSync(path, 'utf-8');
  const parsed = parseWorldMarkdown(md);
  if (parsed.issues.some(i => i.severity === 'error')) return false;
  platformWorld = emitWorldDefinition(parsed.world!).world;
  return !!platformWorld;
});

// ── App World ────────────────────────────────────────────────────────────────

console.log(`\n${D}App world:${R}`);

check('App world (lenses-app) loads', () => {
  const path = resolve(__dirname, './worlds/lenses-app.nv-world.md');
  const md = readFileSync(path, 'utf-8');
  const parsed = parseWorldMarkdown(md);
  return !!parsed.world && !parsed.issues.some(i => i.severity === 'error');
});

// ── Lens System ──────────────────────────────────────────────────────────────

console.log(`\n${D}Lens system:${R}`);

const lenses = getLenses();
check(`${lenses.length} built-in lenses registered`, () => lenses.length >= 9);

for (const lens of lenses) {
  check(`Lens "${lens.name}" compiles overlay`, () => {
    const overlay = compileLensOverlay([lens]);
    return overlay.systemPromptAddition.length > 0 && overlay.activeDirectives.length > 0;
  });
}

check('Lens stacking works (Stoic + Minimalist)', () => {
  const overlay = compileLensOverlay([lenses[0], lenses[lenses.length - 1]]);
  return overlay.sources.length === 2;
});

// ── Governance Pipeline ──────────────────────────────────────────────────────

console.log(`\n${D}Governance pipeline:${R}`);

if (platformWorld) {
  const executor = new MentraGovernedExecutor(platformWorld, {}, DEFAULT_USER_RULES);

  const goodApp: AppContext = {
    appId: 'com.neuroverse.lenses',
    aiProviderDeclared: true,
    declaredAIProviders: ['openai', 'anthropic'],
    dataRetentionOptedIn: false,
    aiDataTypesSent: 0,
    glassesModel: 'even_realities_g1',
  };

  check('Declared app: ai_send_transcription → ALLOW or CONFIRM', () => {
    const r = executor.evaluate('ai_send_transcription', goodApp);
    return r.allowed || r.requiresConfirmation;
  });

  check('Declared app: display_text_wall → ALLOW', () => {
    const r = executor.evaluate('display_text_wall', goodApp);
    return r.allowed;
  });

  const badApp: AppContext = {
    ...goodApp,
    appId: 'com.sketchy.fake',
    aiProviderDeclared: false,
    declaredAIProviders: [],
  };

  check('Undeclared app: ai_send_transcription → BLOCK', () => {
    const r = executor.evaluate('ai_send_transcription', badApp);
    return !r.allowed;
  });

  check('User rules: block_all AI data → BLOCK', () => {
    const strictExecutor = new MentraGovernedExecutor(
      platformWorld!,
      {},
      { ...DEFAULT_USER_RULES, aiDataPolicy: 'block_all' },
    );
    const r = strictExecutor.evaluate('ai_send_transcription', goodApp);
    return !r.allowed;
  });

  check('User rules: confirm_each AI data → PAUSE', () => {
    const confirmExecutor = new MentraGovernedExecutor(
      platformWorld!,
      {},
      { ...DEFAULT_USER_RULES, aiDataPolicy: 'confirm_each' },
    );
    const r = confirmExecutor.evaluate('ai_send_transcription', goodApp);
    return r.requiresConfirmation;
  });
}

// ── Results ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
if (failed === 0) {
  console.log(`${B}${GRN}All ${passed} checks passed.${R} App is ready to deploy.\n`);
  process.exit(0);
} else {
  console.log(`${B}${RED}${failed} check(s) failed.${R} ${passed} passed.\n`);
  process.exit(1);
}
