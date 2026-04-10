#!/usr/bin/env npx tsx
/**
 * Behavioral Governance Execution — NeuroVerse Runtime
 *
 * Validates the full behavioral governance pipeline:
 *   1. World-defined behavioral lens loading
 *   2. Deterministic lens extraction and overlay compilation
 *   3. State-driven rule evaluation with alignment scoring
 *   4. Behavior → alignment → decision governance
 *   5. Multi-scenario simulation with decision output
 *
 * This is infrastructure, not a demo. It proves that NeuroVerse
 * enforces behavioral interpretation and decision logic
 * through executable world-defined lenses.
 *
 * Run:
 *   npx tsx examples/behavioral-lens-demo/demo.ts
 */

import { loadBundledWorld } from '../../src/loader/world-loader';
import { lensesFromWorld, compileLensOverlay, previewLens } from '../../src/builder/lens';
import { simulateWorld, renderSimulateText } from '../../src/engine/simulate-engine';
import type { SimulationResult } from '../../src/engine/simulate-engine';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';
const RESET = '\x1b[0m';

function header(text: string) {
  console.log(`\n${BOLD}${CYAN}${'═'.repeat(70)}${RESET}`);
  console.log(`${BOLD}${CYAN}  ${text}${RESET}`);
  console.log(`${BOLD}${CYAN}${'═'.repeat(70)}${RESET}\n`);
}

function subheader(text: string) {
  console.log(`\n${BOLD}  ${text}${RESET}`);
  console.log(`  ${'─'.repeat(66)}`);
}

function formatAlign(v: string | number | boolean): string {
  return typeof v === 'number' ? v.toFixed(1) : String(v);
}

function decisionColor(d: string | number | boolean): string {
  switch (d) {
    case 'ship_now': return GREEN;
    case 'delay': return YELLOW;
    case 'escalate': return RED;
    default: return DIM;
  }
}

function decisionLabel(d: string | number | boolean): string {
  switch (d) {
    case 'ship_now': return 'SHIP NOW';
    case 'delay': return 'DELAY';
    case 'escalate': return 'ESCALATE';
    default: return String(d).toUpperCase();
  }
}

// ═══════════════════════════════════════════════════════════════════════════

header('Behavioral Governance Execution — NeuroVerse Runtime');
console.log(`  ${DIM}Pipeline: behavior → alignment → decision${RESET}`);
console.log(`  ${DIM}Mode: deterministic evaluation, zero LLM calls${RESET}\n`);

// ─── Phase 1: Load world + extract lenses ────────────────────────────────

subheader('Phase 1: Load World + Extract Lenses');

const world = await loadBundledWorld('behavioral-demo');

console.log(`  ${GREEN}World loaded:${RESET} ${world.world.name} (${world.world.world_id})`);
console.log(`  ${DIM}Version: ${world.world.version}${RESET}`);
console.log(`  ${DIM}Rules: ${world.rules.length} (3 alignment + 3 decision)${RESET}`);
console.log(`  ${DIM}State variables: ${Object.keys(world.stateSchema.variables).length}${RESET}`);

const lenses = lensesFromWorld(world);

console.log(`\n  ${GREEN}Lenses extracted:${RESET} ${lenses.length}`);
for (const lens of lenses) {
  console.log(`    ${BOLD}${lens.id}${RESET} — ${lens.tagline}`);
  console.log(`    ${DIM}Directives: ${lens.directives.length} | Priority: ${lens.priority} | Stackable: ${lens.stackable}${RESET}`);
}

// ─── Phase 2: Compile lens overlay ───────────────────────────────────────

subheader('Phase 2: Compile Lens Overlay');

const overlay = compileLensOverlay(lenses);

console.log(`  ${GREEN}Sources:${RESET} ${overlay.sources.join(', ')}`);
console.log(`  ${GREEN}Active directives:${RESET} ${overlay.activeDirectives.length}`);
console.log();

for (const d of overlay.activeDirectives) {
  console.log(`  ${BOLD}${d.id}${RESET}`);
  console.log(`  ${DIM}${d.instruction}${RESET}`);
  console.log();
}

subheader('System Prompt Addition');
for (const line of overlay.systemPromptAddition.split('\n')) {
  console.log(`  ${DIM}${line}${RESET}`);
}

// ─── Phase 3: Lens preview ──────────────────────────────────────────────

subheader('Phase 3: Lens Preview');

if (lenses.length > 0) {
  console.log(previewLens(lenses[0]));
}

// ─── Phase 4: Decision governance simulation ─────────────────────────────

header('Decision Governance — Scenario Execution');
console.log(`  ${DIM}Same question: "Should we ship?"${RESET}`);
console.log(`  ${DIM}Different behavioral context → different governed decision.${RESET}\n`);

// Scenario A: Baseline (defaults) — alignment 80 → ship_now
subheader('Scenario A: Baseline — Normal conditions');
console.log(`  ${DIM}follow_through=70, clarity=75, alignment=80${RESET}`);
const resultA = simulateWorld(world, { steps: 1 });
console.log(renderSimulateText(resultA));

// Scenario B: Ambiguity — clarity drops → alignment degrades → delay
subheader('Scenario B: Ambiguity Pressure — Vague communication');
console.log(`  ${DIM}follow_through=70, clarity=40 → alignment degrades${RESET}`);
const resultB = simulateWorld(world, {
  steps: 1,
  stateOverrides: { clarity: 40 },
});
console.log(renderSimulateText(resultB));

// Scenario C: Low follow-through — promises broken → escalate
subheader('Scenario C: Broken Promises — Low follow-through');
console.log(`  ${DIM}follow_through=40, clarity=45 → alignment drops hard${RESET}`);
const resultC = simulateWorld(world, {
  steps: 1,
  stateOverrides: { follow_through: 40, clarity: 45 },
});
console.log(renderSimulateText(resultC));

// Scenario D: Strong execution — clear + consistent → ship_now
subheader('Scenario D: Strong Execution — Clear and consistent');
console.log(`  ${DIM}follow_through=90, clarity=85 → alignment strengthens${RESET}`);
const resultD = simulateWorld(world, {
  steps: 1,
  stateOverrides: { follow_through: 90, clarity: 85 },
});
console.log(renderSimulateText(resultD));

// Scenario E: Multi-step degradation — watch alignment erode over time
subheader('Scenario E: Sustained Ambiguity — 3-step degradation');
console.log(`  ${DIM}clarity=40 sustained over 3 steps${RESET}`);
const resultE = simulateWorld(world, {
  steps: 3,
  stateOverrides: { clarity: 40 },
});
console.log(renderSimulateText(resultE));

// ═══════════════════════════════════════════════════════════════════════════
// Decision Summary — The punchline
// ═══════════════════════════════════════════════════════════════════════════

header('Decision Summary');

console.log(`  ${DIM}Question: "Should we ship?"${RESET}`);
console.log(`  ${DIM}Answer depends on behavioral alignment, not stated confidence.${RESET}\n`);

const scenarios: Array<{ label: string; desc: string; result: SimulationResult }> = [
  { label: 'A: Baseline',        desc: 'normal conditions',          result: resultA },
  { label: 'B: Ambiguity',       desc: 'vague communication',       result: resultB },
  { label: 'C: Broken Promises', desc: 'low follow-through',        result: resultC },
  { label: 'D: Strong Exec',     desc: 'clear + consistent',        result: resultD },
  { label: 'E: Sustained',       desc: '3 steps of ambiguity',      result: resultE },
];

for (const s of scenarios) {
  const align = formatAlign(s.result.finalState.alignment_score);
  const decision = s.result.finalState.decision;
  const dColor = decisionColor(decision);
  const dLabel = decisionLabel(decision);
  console.log(`  ${BOLD}${s.label}${RESET} ${DIM}(${s.desc})${RESET}`);
  console.log(`    alignment: ${align}  viability: ${s.result.finalViability}  decision: ${dColor}${BOLD}${dLabel}${RESET}`);
  console.log();
}

// ─── Validation ──────────────────────────────────────────────────────────

const allPassed = lenses.length > 0
  && overlay.activeDirectives.length > 0
  && resultA.finalState.decision === 'ship_now'
  && resultB.finalState.decision === 'delay'
  && resultC.finalState.decision === 'delay'
  && resultD.finalState.decision === 'ship_now'
  && resultE.finalState.decision === 'escalate';

if (allPassed) {
  console.log(`  ${GREEN}${BOLD}ALL CHECKS PASSED${RESET}`);
  console.log();
  console.log(`  ${MAGENTA}${BOLD}Same question. Different behavior. Different decision.${RESET}`);
  console.log(`  ${DIM}NeuroVerse governs decisions based on behavioral alignment —${RESET}`);
  console.log(`  ${DIM}deterministic, inspectable, and explainable.${RESET}`);
} else {
  console.log(`  ${RED}${BOLD}SOME CHECKS FAILED — review output above${RESET}`);
}
console.log();
