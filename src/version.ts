/**
 * The rulebook formats this implementation decides with, and the one refusal
 * every door gives an older, unknown or wrong-kind one (SPEC.md § 11, § 16).
 * Validation, evaluation, plan checking, the conflict check and the backtest
 * all call `rulebookVersionProblem` first, so "refused by name, never
 * reinterpreted" is true at every entry point and the message is the same at
 * each.
 *
 * Two formats are decided with, by one evaluator: `neuroverse-domain-rules/3`
 * (robots and people in a physical site: actions and areas) and
 * `neuroverse-governance/1` (AI agents calling tools: tools and scopes). Doors
 * that only make sense for one of them (`accepts`) refuse the other by name.
 */

export const RULEBOOK_FORMAT = 'neuroverse-domain-rules/3';
/** The digital format: tools, scopes, principals, delegation, arguments bound to facts (SPEC.md § 16). */
export const GOVERNANCE_FORMAT = 'neuroverse-governance/1';
/** The mission (plan overlay) format `compileMission` takes (SPEC.md § 16.7). */
export const GOVERNANCE_PLAN_FORMAT = 'neuroverse-governance-plan/1';

/** The evaluator's own check ID for a refused rulebook version. Not in `builtin` (a refused rulebook's list cannot be trusted, and adding it would change every fingerprint). */
export const RULEBOOK_VERSION_CHECK = 'rulebook_version';

/** Which formats a door takes: `any` (the core: evaluate, evaluatePlan, validate, check), `domain` (/3-only doors), `governance` (/1-only doors). */
export type Accepts = 'any' | 'domain' | 'governance';

/** Why this rulebook cannot be decided with at this door, in the words validation uses; null when its format is one the door takes. */
export function rulebookVersionProblem(rulebook: unknown, accepts: Accepts = 'any'): string | null {
  if (!rulebook || typeof rulebook !== 'object') return 'the rulebook is not an object';
  const format = (rulebook as { format?: unknown }).format;
  if (format === RULEBOOK_FORMAT) {
    return accepts === 'governance'
      ? `this is a ${RULEBOOK_FORMAT} rulebook (spec robot-domain-rules/3: actions and areas); this door takes ${GOVERNANCE_FORMAT} rulebooks only and does not reinterpret it. Decide with evaluate, evaluatePlan or validateRulebook, which take both formats.`
      : null;
  }
  if (format === GOVERNANCE_FORMAT) {
    return accepts === 'domain'
      ? `this is a ${GOVERNANCE_FORMAT} rulebook (the digital format: tools and scopes); this door takes ${RULEBOOK_FORMAT} rulebooks only (robots and people in a physical site) and does not reinterpret it. Decide with evaluate, evaluatePlan or validateRulebook, which take both formats.`
      : null;
  }
  if (format === 'neuroverse-domain-rules/2' || format === 'neuroverse-domain-rules/1') {
    return `this rulebook declares format "${format}" (spec robot-domain-rules/${format.slice(-1)}); this implementation is robot-domain-rules/3 and does not reinterpret older rulebooks. Migration: recompile the rulebook from its input with a /3 compiler (its FNV-1a fingerprint becomes a SHA-256 one, history conditions lose "clock"), then re-issue approvals under the /3 approval contract. See SPEC.md § 11.`;
  }
  if (typeof format === 'string' && /^neuroverse-governance\/\d+$/.test(format)) {
    return `this rulebook declares format "${format}"; this implementation is ${GOVERNANCE_FORMAT} and does not reinterpret another version. Migration: recompile the rulebook from its input with compileGovernance and re-issue approvals under the ${GOVERNANCE_FORMAT.replace('/', '-approval/')} contract. See SPEC.md § 16.`;
  }
  // The unknown-format message names the /3 format as it always has (a /1-looking format string is caught above).
  return `format must be "${accepts === 'governance' ? GOVERNANCE_FORMAT : RULEBOOK_FORMAT}", got ${JSON.stringify(format)}`;
}
