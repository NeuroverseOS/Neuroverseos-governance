/**
 * Browser Bundle — NeuroVerse Simulation Engine for browser use
 *
 * This module exposes the real simulation engine and bootstrap parser
 * as window.NeuroVerse for use in standalone HTML files (simulate.html).
 *
 * Built as IIFE via tsup → dist/browser.global.js
 *
 * ONE ENGINE. ONE EXECUTION PATH. No drift.
 */

import { simulateWorld } from './engine/simulate-engine';
import type { SimulateOptions, SimulationResult } from './engine/simulate-engine';
import { parseWorldMarkdown } from './engine/bootstrap-parser';
import { emitWorldDefinition } from './engine/bootstrap-emitter';
import type { WorldDefinition } from './types';

/**
 * Parse .nv-world.md markdown and return a WorldDefinition.
 *
 * This is the same two-step pipeline the CLI uses:
 *   parseWorldMarkdown() → emitWorldDefinition()
 *
 * Returns the WorldDefinition or throws on parse failure.
 */
function parseAndEmitWorld(markdown: string): WorldDefinition {
  const parsed = parseWorldMarkdown(markdown);
  const { world, issues } = emitWorldDefinition(parsed);

  // Log any emission issues to console (non-fatal)
  for (const issue of issues) {
    if (issue.severity === 'error') {
      console.warn(`[NeuroVerse] Parse issue: ${issue.message}`);
    }
  }

  return world;
}

// Expose on window for IIFE usage
const NeuroVerse = {
  simulateWorld,
  parseWorldMarkdown: parseAndEmitWorld,
  // Also expose raw pipeline for advanced use
  _parseWorldMarkdownRaw: parseWorldMarkdown,
  _emitWorldDefinition: emitWorldDefinition,
};

// Assign to window (IIFE global)
(globalThis as any).NeuroVerse = NeuroVerse;

export { simulateWorld, parseAndEmitWorld, parseWorldMarkdown, emitWorldDefinition };
export type { SimulateOptions, SimulationResult, WorldDefinition };
