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
  const sections: string[] = [];

  // ─── Section 1: Worldmodel context ─────────────────────────────────
  sections.push(
    `## Worldmodel\n\n` +
    `You are operating inside a governed environment. The worldmodel below\n` +
    `defines the invariants, signals, decision priorities, and behavioral\n` +
    `expectations for this organization. Every response you produce must\n` +
    `be grounded in this worldmodel.\n\n` +
    worldmodelContent,
  );

  // ─── Section 2: Analytical frame ───────────────────────────────────
  const frame = lens.primary_frame;
  const questionsBlock = frame.evaluation_questions
    .map((q, i) => `${i + 1}. ${q}`)
    .join('\n');

  const overlapsBlock = frame.overlaps
    .map(
      (o) =>
        `- ${o.domains[0]} + ${o.domains[1]} = **${o.emergent_state}**: ${o.description}`,
    )
    .join('\n');

  sections.push(
    `## How to Think (Analytical Frame: ${lens.name})\n\n` +
    `${frame.scoring_rubric}\n\n` +
    `### Evaluation questions to reason through\n\n` +
    `${questionsBlock}\n\n` +
    `### Overlap emergent states\n\n` +
    `${overlapsBlock}\n\n` +
    `### Center identity\n\n` +
    `When all dimensions integrate fully: **${frame.center_identity}**. ` +
    `Surface this sparingly — only when the integration is genuinely complete.`,
  );

  // ─── Section 3: Voice + vocabulary ─────────────────────────────────
  const vocabPreferred = Object.entries(lens.vocabulary.preferred)
    .map(([generic, native]) => `- "${generic}" → **${native}**`)
    .join('\n');

  const vocabArchitecture = lens.vocabulary.architecture
    .map((t) => `\`${t}\``)
    .join(', ');

  const vocabProperNouns = lens.vocabulary.proper_nouns
    .map((n) => `**${n}**`)
    .join(', ');

  const strategicBlock = lens.strategic_patterns
    .map((p) => `- ${p}`)
    .join('\n');

  sections.push(
    `## How to Speak (Voice: ${lens.name})\n\n` +
    `Register: ${lens.voice.register}\n\n` +
    `Rules:\n` +
    `- Active voice: ${lens.voice.active_voice}\n` +
    `- Named specificity (people, places, numbers): ${lens.voice.specificity}\n` +
    `- Hype vocabulary: ${lens.voice.hype_vocabulary}\n` +
    `- Hedging / qualified phrasing: ${lens.voice.hedging}\n` +
    `- Playfulness: ${lens.voice.playfulness}\n` +
    `- Close with strategic frame: ${lens.voice.close_with_strategic_frame}\n` +
    `- Honesty about failure: ${lens.voice.honesty_about_failure}\n\n` +
    `### Output translation discipline\n\n` +
    `${lens.voice.output_translation}\n\n` +
    `### Vocabulary\n\n` +
    `Proper nouns (use literally): ${vocabProperNouns}\n\n` +
    `Preferred term substitutions:\n${vocabPreferred}\n\n` +
    `Architecture vocabulary: ${vocabArchitecture}\n\n` +
    `### Strategic decision patterns\n\n` +
    `When recommending action, these patterns reflect how this organization resolves tradeoffs:\n\n` +
    `${strategicBlock}`,
  );

  // ─── Section 4: Guardrails ─────────────────────────────────────────
  const forbiddenBlock = lens.forbidden_phrases
    .map((p) => `- "${p}"`)
    .join('\n');

  sections.push(
    `## Guardrails\n\n` +
    `Do NOT use any of these phrases in your response. If you catch yourself\n` +
    `reaching for one, rephrase in direct, active, specific language instead.\n\n` +
    `${forbiddenBlock}\n\n` +
    `If your response would violate a worldmodel invariant, state the conflict\n` +
    `explicitly and propose an alternative that honors the invariant.`,
  );

  return sections.join('\n\n---\n\n');
}
