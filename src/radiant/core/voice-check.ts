/**
 * @neuroverseos/governance/radiant — voice check
 *
 * Post-processes AI output to detect forbidden phrases from the active
 * rendering lens. Returns violations. The caller (CLI, MCP server,
 * renderer) decides what to do — fail, warn, or retry.
 *
 * Pure function. No AI calls. Deterministic.
 */

import type { RenderingLens } from '../types';

/**
 * A detected forbidden-phrase violation in the output text.
 */
export interface VoiceViolation {
  /** The forbidden phrase that was matched (case-insensitive). */
  phrase: string;
  /** Character offset where the phrase was found. */
  offset: number;
}

/**
 * Check text for forbidden phrases from the active lens.
 *
 * Match is case-insensitive substring. Returns all violations found,
 * in order of appearance. Empty array = clean output.
 */
export function checkForbiddenPhrases(
  lens: RenderingLens,
  text: string,
): VoiceViolation[] {
  const lower = text.toLowerCase();
  const violations: VoiceViolation[] = [];

  for (const phrase of lens.forbidden_phrases) {
    const phraseLower = phrase.toLowerCase();
    let pos = 0;
    while (true) {
      const idx = lower.indexOf(phraseLower, pos);
      if (idx === -1) break;
      violations.push({ phrase, offset: idx });
      pos = idx + phraseLower.length;
    }
  }

  violations.sort((a, b) => a.offset - b.offset);
  return violations;
}
