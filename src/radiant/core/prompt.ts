/**
 * @neuroverseos/governance/radiant — system prompt composer
 *
 * Reads worldmodel content (markdown) + a RenderingLens and composes the
 * system prompt that governs the AI's reasoning and output.
 *
 * Pure function. No AI calls. No IO. Deterministic: same inputs, same
 * string output. Testable without an API key.
 *
 * The composed prompt has four sections:
 *   1. Worldmodel context — the compiled worldmodel(s) as readable markdown
 *   2. Analytical frame — the lens's primary_frame (how to reason)
 *   3. Voice + vocabulary — the lens's voice directives + vocabulary map
 *   4. Guardrails — forbidden phrases + output translation discipline
 *
 * The AI receives this as a system message. The user's query is a separate
 * user message. The separation means the system prompt can be cached across
 * queries (if the worldmodel + lens haven't changed).
 */

import type { RenderingLens } from '../types';
import { compressWorldmodel, compressLens } from './compress';

/**
 * Compose the system prompt from worldmodel content + rendering lens.
 *
 * @param worldmodelContent — raw markdown of the worldmodel source file(s).
 *   If multiple worldmodels are loaded, concatenate them with a separator.
 * @param lens — the active rendering lens.
 * @returns a system prompt string ready for the AI's system message.
 */
export function composeSystemPrompt(
  worldmodelContent: string,
  lens: RenderingLens,
): string {
  // Compress worldmodel: extract only structured elements the AI needs
  const compressedWorld = compressWorldmodel(worldmodelContent);

  // Compress lens: only the parts the interpreter needs
  const cl = compressLens(lens);

  // Overlap states (keep — they're small and essential)
  const overlapsBlock = lens.primary_frame.overlaps
    .map((o) => `${o.domains[0]} + ${o.domains[1]} = ${o.emergent_state}`)
    .join('\n');

  return [
    // Section 1: Compressed worldmodel
    `## Worldmodel (compressed)\n\n${compressedWorld}`,

    // Section 2: Analytical frame (evaluation questions + rubric)
    `## How to Think\n\n` +
    `${cl.scoringRubric}\n\n` +
    `Questions:\n${cl.evaluationQuestions}\n\n` +
    `Overlaps: ${overlapsBlock}\n` +
    `Center: ${lens.primary_frame.center_identity}\n\n` +
    `Translate before output: ${cl.jargonTranslations}`,

    // Section 3: Voice (compressed — register + key rules only)
    `## Voice: ${lens.name}\n\n` +
    `Register: ${lens.voice.register}\n` +
    `Active voice: ${lens.voice.active_voice}. ` +
    `Specificity: ${lens.voice.specificity}. ` +
    `Hedging: ${lens.voice.hedging}. ` +
    `Hype: ${lens.voice.hype_vocabulary}. ` +
    `Honesty about failure: ${lens.voice.honesty_about_failure}.\n\n` +
    `${lens.voice.output_translation}\n\n` +
    `Strategic patterns:\n${cl.strategicPatterns}`,

    // Section 4: Guardrails (forbidden phrases as comma-separated, not bulleted)
    `## Guardrails\n\n` +
    `Do NOT use: ${cl.forbiddenPhrases}\n\n` +
    `If a response would violate a worldmodel invariant, state the conflict and propose an alternative.`,
  ].join('\n\n---\n\n');
}
