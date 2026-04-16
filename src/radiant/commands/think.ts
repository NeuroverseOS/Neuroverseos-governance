/**
 * @neuroverseos/governance/radiant — `think` command
 *
 * The first composable npm command: load worldmodels + a rendering lens,
 * send a query to the AI with the composed system prompt, check the
 * response for forbidden phrases, return the result.
 *
 * This is Stage A — the voice layer. No GitHub activity needed. No signal
 * extraction. No pattern interpretation. Just: worldmodel + lens + AI + query.
 *
 * Usage (programmatic — CLI wiring lands in a follow-on commit):
 *
 *   import { think } from '@neuroverseos/governance/radiant';
 *   const result = await think({
 *     worldmodelContent: fs.readFileSync('./auki.worldmodel.md', 'utf-8'),
 *     lensId: 'auki-builder',
 *     query: 'Should we merge PR #247?',
 *     ai: createAnthropicAI(process.env.ANTHROPIC_API_KEY!),
 *   });
 *   console.log(result.response);
 */

import type { RenderingLens } from '../types';
import { getLens } from '../lenses/index';
import { composeSystemPrompt } from '../core/prompt';
import { checkForbiddenPhrases, type VoiceViolation } from '../core/voice-check';
import type { RadiantAI } from '../core/ai';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ThinkInput {
  /** Raw markdown content of the worldmodel(s). Concatenate multiple with a separator. */
  worldmodelContent: string;
  /** Rendering lens id. Must be registered in LENSES. */
  lensId: string;
  /** The user's query — any natural-language question or prompt. */
  query: string;
  /** AI adapter instance (Anthropic, OpenAI, mock, etc.). */
  ai: RadiantAI;
}

export interface ThinkResult {
  /** The AI's response text, after voice-check. */
  response: string;
  /** The lens that was applied. */
  lens: string;
  /** Any forbidden-phrase violations detected in the response. */
  voiceViolations: VoiceViolation[];
  /** Whether the response passed the voice check (no violations). */
  voiceClean: boolean;
  /** The system prompt that was composed (for transparency / debugging). */
  systemPrompt: string;
}

// ─── Command ───────────────────────────────────────────────────────────────

/**
 * Think through a query using the loaded worldmodel + rendering lens.
 *
 * The function:
 *   1. Resolves the lens by id (fails if not registered)
 *   2. Composes the system prompt from worldmodel content + lens
 *   3. Calls the AI adapter with system prompt + user query
 *   4. Checks the response for forbidden phrases
 *   5. Returns the response + voice-check results
 *
 * The caller decides what to do with voice violations — surface them,
 * retry, or accept the response as-is. The `think` command itself does
 * not retry or modify the response.
 */
export async function think(input: ThinkInput): Promise<ThinkResult> {
  const lens = resolveLens(input.lensId);
  const systemPrompt = composeSystemPrompt(input.worldmodelContent, lens);
  const response = await input.ai.complete(systemPrompt, input.query);
  const voiceViolations = checkForbiddenPhrases(lens, response);

  return {
    response,
    lens: lens.name,
    voiceViolations,
    voiceClean: voiceViolations.length === 0,
    systemPrompt,
  };
}

// ─── Internal ──────────────────────────────────────────────────────────────

function resolveLens(id: string): RenderingLens {
  const lens = getLens(id);
  if (!lens) {
    const available = Object.keys(
      // Inline import-free way to list. At runtime, getLens returns from
      // the same LENSES record — we just need the keys for the error message.
      // We re-import getLens from lenses/index which exposes listLenses, but
      // since we already have lens===undefined we know the id was wrong.
      {},
    );
    throw new Error(
      `Lens "${id}" not found. Check the id or register the lens in src/radiant/lenses/index.ts.`,
    );
  }
  return lens;
}
