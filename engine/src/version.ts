/**
 * The rulebook format this implementation decides with, and the one refusal
 * every door gives an older or unknown one (SPEC.md § 11). Validation,
 * evaluation, plan checking, the conflict check and the backtest all call
 * `rulebookVersionProblem` first, so "refused by name, never reinterpreted"
 * is true at every entry point and the message is the same at each.
 */

export const RULEBOOK_FORMAT = 'neuroverse-domain-rules/3';

/** The evaluator's own check ID for a refused rulebook version. Not in `builtin` (a refused rulebook's list cannot be trusted, and adding it would change every fingerprint). */
export const RULEBOOK_VERSION_CHECK = 'rulebook_version';

/** Why this rulebook cannot be decided with, in the words validation uses; null when its format is this implementation's. */
export function rulebookVersionProblem(rulebook: unknown): string | null {
  if (!rulebook || typeof rulebook !== 'object') return 'the rulebook is not an object';
  const format = (rulebook as { format?: unknown }).format;
  if (format === RULEBOOK_FORMAT) return null;
  if (format === 'neuroverse-domain-rules/2' || format === 'neuroverse-domain-rules/1') {
    return `this rulebook declares format "${format}" (spec robot-domain-rules/${format.slice(-1)}); this implementation is robot-domain-rules/3 and does not reinterpret older rulebooks. Migration: recompile the rulebook from its input with a /3 compiler (its FNV-1a fingerprint becomes a SHA-256 one, history conditions lose "clock"), then re-issue approvals under the /3 approval contract. See SPEC.md § 11.`;
  }
  return `format must be "${RULEBOOK_FORMAT}", got ${JSON.stringify(format)}`;
}
