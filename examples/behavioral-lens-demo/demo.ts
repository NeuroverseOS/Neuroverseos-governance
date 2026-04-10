#!/usr/bin/env npx tsx
/**
 * Behavioral Lens Demo — End-to-End Proof
 *
 * Proves that:
 *   1. A behavioral lens can live in a .nv-world.md file
 *   2. The parser reads it correctly
 *   3. lensesFromWorld() extracts usable Lens objects
 *   4. compileLensOverlay() produces a real system prompt overlay
 *   5. simulateWorld() runs deterministically against the world
 *
 * This is the bridge from "lenses are prompt personalities"
 * to "lenses are programmable behavioral governance overlays."
 *
 * Run:
 *   npx tsx examples/behavioral-lens-demo/demo.ts
 */

import { loadBundledWorld } from '../../src/loader/world-loader';
import { lensesFromWorld, compileLensOverlay, previewLens } from '../../src/builder/lens';
import { simulateWorld, renderSimulateText } from '../../src/engine/simulate-engine';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
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

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1: Load world and extract lenses
// ═══════════════════════════════════════════════════════════════════════════

header('Phase 1: Load World + Extract Lenses');

const world = await loadBundledWorld('behavioral-demo');

console.log(`  ${GREEN}World loaded:${RESET} ${world.world.name} (${world.world.world_id})`);
console.log(`  ${DIM}Version: ${world.world.version}${RESET}`);
console.log(`  ${DIM}Rules: ${world.rules.length}${RESET}`);
console.log(`  ${DIM}State variables: ${Object.keys(world.stateSchema.variables).length}${RESET}`);

const lenses = lensesFromWorld(world);

console.log(`\n  ${GREEN}Lenses extracted:${RESET} ${lenses.length}`);
for (const lens of lenses) {
  console.log(`    ${BOLD}${lens.id}${RESET} — ${lens.tagline}`);
  console.log(`    ${DIM}Directives: ${lens.directives.length} | Priority: ${lens.priority} | Stackable: ${lens.stackable}${RESET}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2: Compile lens overlay
// ═══════════════════════════════════════════════════════════════════════════

header('Phase 2: Compile Lens Overlay');

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

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3: Preview the behavioral lens
// ═══════════════════════════════════════════════════════════════════════════

header('Phase 3: Lens Preview');

if (lenses.length > 0) {
  console.log(previewLens(lenses[0]));
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4: Simulate — Four scenarios
// ═══════════════════════════════════════════════════════════════════════════

header('Phase 4: Deterministic Simulation');

// Scenario A: Baseline (defaults only)
subheader('Scenario A: Baseline (defaults)');
const resultA = simulateWorld(world, { steps: 3 });
console.log(renderSimulateText(resultA));

// Scenario B: Ambiguity pressure (clarity=40)
subheader('Scenario B: Ambiguity Pressure (clarity=40)');
const resultB = simulateWorld(world, {
  steps: 3,
  stateOverrides: { clarity: 40 },
});
console.log(renderSimulateText(resultB));

// Scenario C: Low follow-through (follow_through=50)
subheader('Scenario C: Low Follow-Through (follow_through=50)');
const resultC = simulateWorld(world, {
  steps: 3,
  stateOverrides: { follow_through: 50 },
});
console.log(renderSimulateText(resultC));

// Scenario D: Strong behavior (follow_through=90, clarity=85)
subheader('Scenario D: Strong Execution (follow_through=90, clarity=85)');
const resultD = simulateWorld(world, {
  steps: 3,
  stateOverrides: { follow_through: 90, clarity: 85 },
});
console.log(renderSimulateText(resultD));

// ═══════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════

header('Summary');

console.log(`  ${GREEN}World:${RESET}       ${world.world.name}`);
console.log(`  ${GREEN}Lens:${RESET}        ${lenses.map(l => l.id).join(', ')}`);
console.log(`  ${GREEN}Overlay:${RESET}     ${overlay.activeDirectives.length} directives compiled`);
console.log(`  ${GREEN}Simulation:${RESET}  4 scenarios executed deterministically`);
console.log();
console.log(`  ${BOLD}Scenario A (baseline):${RESET}   viability=${resultA.finalViability}, alignment=${resultA.finalState.alignment_score}`);
console.log(`  ${BOLD}Scenario B (ambiguity):${RESET}  viability=${resultB.finalViability}, alignment=${typeof resultB.finalState.alignment_score === 'number' ? resultB.finalState.alignment_score.toFixed(1) : resultB.finalState.alignment_score}`);
console.log(`  ${BOLD}Scenario C (weak f/t):${RESET}   viability=${resultC.finalViability}, alignment=${typeof resultC.finalState.alignment_score === 'number' ? resultC.finalState.alignment_score.toFixed(1) : resultC.finalState.alignment_score}`);
console.log(`  ${BOLD}Scenario D (strong):${RESET}     viability=${resultD.finalViability}, alignment=${typeof resultD.finalState.alignment_score === 'number' ? resultD.finalState.alignment_score.toFixed(1) : resultD.finalState.alignment_score}`);
console.log();

const allPassed = lenses.length > 0
  && overlay.activeDirectives.length > 0
  && resultA.finalViability !== 'MODEL_COLLAPSES'
  && resultB.finalState.alignment_score < resultA.finalState.alignment_score
  && resultD.finalState.alignment_score > resultA.finalState.alignment_score;

if (allPassed) {
  console.log(`  ${GREEN}${BOLD}ALL CHECKS PASSED${RESET}`);
  console.log(`  ${DIM}NeuroVerse can define and execute behavioral lenses inside world files.${RESET}`);
} else {
  console.log(`  ${RED}${BOLD}SOME CHECKS FAILED — review output above${RESET}`);
}
console.log();
