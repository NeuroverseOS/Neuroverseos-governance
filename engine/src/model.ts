/**
 * One model, two formats (SPEC.md § 16.2).
 *
 * A `/3` rulebook speaks of actions and areas; a `/1` rulebook of tools and
 * scopes. Inside the engine they are the same two concepts, so a `/1`
 * rulebook is NORMALISED into the internal shape the `/3` code already runs
 * on (`tools` → the `actions` map, `scopes` → the `areas` map, role `tools`
 * → `actions`, `tags.tools`/`tags.scopes` → `tags.actions`/`tags.areas`,
 * history conditions and plan checks likewise), and a `/3` rulebook is used
 * as it is — the same object, no copy — so the `/3` path runs exactly the
 * code it ran before. The DIALECT is the small table of names each format
 * uses on the way in (request fields) and out (built-in check IDs, approval
 * request fields, witnesses), so every emitted word is in the rulebook's own
 * vocabulary. Nothing is forked: one `evaluate`, one `evaluatePlan`, one
 * conflict check.
 *
 * Normalised views are cached by rulebook identity (a WeakMap), so a
 * rulebook decides many requests at the cost of one mapping.
 */

import type {
  ActionDef, AreaDef, BuiltinCheck, Condition, GovernanceCompileInput, GovernanceHistoryCondition, GovernancePlanCheck, GovernancePlanRule, GovernanceRule,
  GovernanceRulebook, HistoryCondition, PlanCheck, PlanRule, Rule, Rulebook, Witness,
} from './types';
import { APPROVAL_SPEC, GOVERNANCE_APPROVAL_SPEC } from './types';
import { GOVERNANCE_FORMAT, RULEBOOK_FORMAT } from './version';

/** The names one format uses. Looked up by `format`; everything the evaluator emits goes through it. */
export interface Dialect {
  format: typeof RULEBOOK_FORMAT | typeof GOVERNANCE_FORMAT;
  /** True for neuroverse-governance/1: tools, scopes, principals, delegation, args. */
  governance: boolean;
  approvalSpec: string;
  /** The request field naming the thing asked for and the place: `action`/`areaId` or `tool`/`scope`. */
  subjectField: 'action' | 'tool';
  placeField: 'areaId' | 'scope';
  /** The nouns for messages. */
  subject: string;
  place: string;
  /** The built-in check IDs, by their role in the algorithm. */
  builtin: {
    requiredFacts: 'required_facts';
    placeDeclared: 'area_declared' | 'scope_declared';
    roleDeclared: 'role_declared';
    rolePermits: 'role_permits_action' | 'role_permits_tool';
    unknown: 'unknown_action' | 'unknown_tool';
    planContinuity: 'plan_area_continuity' | 'plan_scope_continuity';
    /** `/1` only. */
    args?: 'args_wellformed';
    scopePermits?: 'scope_permits_tool';
    delegation?: 'delegation_exceeds_authority';
  };
  /** The list a rulebook's `builtin` must carry. */
  builtinChecks: BuiltinCheck[];
  /** The reserved ID prefix of the derived role-limit never rules. */
  roleLimitPrefix: 'area_role_limits:' | 'scope_role_limits:';
  /** The string members an approval object may carry in this format (read from request data; anything else is ignored). */
  approvalFields: readonly string[];
  /** The history entry shape, for messages. */
  historyShape: string;
}

/** Checks the `/3` evaluator always runs, cited by ID in decisions. */
export const BUILTIN_CHECKS: BuiltinCheck[] = [
  { id: 'required_facts', text: 'Every fact a decision needs must be supplied and valid; a missing or invalid fact is never permission.' },
  { id: 'area_declared', text: 'Only declared areas are governed; anything in an undeclared area is blocked.' },
  { id: 'role_declared', text: 'Only declared roles may act; unknown roles are blocked.' },
  { id: 'role_permits_action', text: 'A participant may only take actions its role lists.' },
  { id: 'unknown_action', text: 'An action the rulebook does not know is denied, or waits for approval, as the rulebook says (otherwise).' },
  { id: 'plan_area_continuity', text: 'A plan step happens where the earlier steps left the participant unless its action moves it there.' },
];

/** Checks the `/1` evaluator always runs (SPEC.md § 16.9). */
export const GOVERNANCE_BUILTIN_CHECKS: BuiltinCheck[] = [
  { id: 'required_facts', text: 'Every fact a decision needs must be supplied and valid; a missing or invalid fact is never permission.' },
  { id: 'args_wellformed', text: 'The call\'s arguments are an object whose fields are exactly the tool\'s declared fields, each valid for its bound fact; anything else is refused, never run.' },
  { id: 'scope_declared', text: 'Only declared scopes are governed; a call in an undeclared scope is blocked.' },
  { id: 'role_declared', text: 'Only declared roles may act; unknown roles are blocked.' },
  { id: 'scope_permits_tool', text: 'A tool may be called only in the scopes it declares.' },
  { id: 'role_permits_tool', text: 'A participant may only call tools its role lists.' },
  { id: 'unknown_tool', text: 'A tool the rulebook does not know is denied, or waits for approval, as the rulebook says (otherwise).' },
  { id: 'delegation_exceeds_authority', text: 'A delegate may call a tool only if every role in its delegation chain lists it; delegated authority never grows.' },
  { id: 'plan_scope_continuity', text: 'A plan step happens in the scope the earlier steps left the participant in unless its tool moves it there.' },
];

export const DOMAIN_DIALECT: Dialect = {
  format: RULEBOOK_FORMAT, governance: false, approvalSpec: APPROVAL_SPEC,
  subjectField: 'action', placeField: 'areaId', subject: 'action', place: 'area',
  builtin: { requiredFacts: 'required_facts', placeDeclared: 'area_declared', roleDeclared: 'role_declared', rolePermits: 'role_permits_action', unknown: 'unknown_action', planContinuity: 'plan_area_continuity' },
  builtinChecks: BUILTIN_CHECKS,
  roleLimitPrefix: 'area_role_limits:',
  approvalFields: ['spec', 'ruleId', 'rulebookFingerprint', 'participantId', 'action', 'areaId', 'nonce', 'keyId', 'issuedAt', 'expiresAt', 'signature', 'requestDigest'],
  historyShape: '{ action, areaId, at? }',
};

export const GOVERNANCE_DIALECT: Dialect = {
  format: GOVERNANCE_FORMAT, governance: true, approvalSpec: GOVERNANCE_APPROVAL_SPEC,
  subjectField: 'tool', placeField: 'scope', subject: 'tool', place: 'scope',
  builtin: { requiredFacts: 'required_facts', placeDeclared: 'scope_declared', roleDeclared: 'role_declared', rolePermits: 'role_permits_tool', unknown: 'unknown_tool', planContinuity: 'plan_scope_continuity', args: 'args_wellformed', scopePermits: 'scope_permits_tool', delegation: 'delegation_exceeds_authority' },
  builtinChecks: GOVERNANCE_BUILTIN_CHECKS,
  roleLimitPrefix: 'scope_role_limits:',
  approvalFields: ['spec', 'ruleId', 'rulebookFingerprint', 'principalId', 'participantId', 'tool', 'scope', 'argsDigest', 'nonce', 'keyId', 'issuedAt', 'expiresAt', 'signature'],
  historyShape: '{ tool, scope, at? }',
};

/** The dialect of a format string. Anything that is not `/1` is read as `/3` (the version check has already refused what is neither). */
export function dialectOf(format: unknown): Dialect {
  return format === GOVERNANCE_FORMAT ? GOVERNANCE_DIALECT : DOMAIN_DIALECT;
}

export function isGovernanceRulebook(rulebook: unknown): rulebook is GovernanceRulebook {
  return !!rulebook && typeof rulebook === 'object' && (rulebook as { format?: unknown }).format === GOVERNANCE_FORMAT && 'tools' in rulebook;
}

/** The internal shape: a `/3` rulebook, or a `/1` one seen through `/3` field names. `format` stays the artifact's, so the dialect is always recoverable. */
export type InternalRulebook = Omit<Rulebook, 'format'> & { format: typeof RULEBOOK_FORMAT | typeof GOVERNANCE_FORMAT; mission?: GovernanceRulebook['mission'] };

const VIEWS = new WeakMap<object, InternalRulebook>();

/**
 * The rulebook in the engine's internal shape. A `/3` rulebook is returned as
 * it is (same object); a `/1` rulebook is mapped once and cached by identity.
 * Only the names change: no rule, fact, limit, finding or fingerprint is
 * altered, so what the evaluator cites is what the artifact says.
 */
export function normalizeRulebook(rulebook: Rulebook | GovernanceRulebook): InternalRulebook {
  if (!isGovernanceRulebook(rulebook)) return rulebook as InternalRulebook;
  const cached = VIEWS.get(rulebook);
  if (cached) return cached;
  const g = rulebook;
  const view: InternalRulebook = {
    format: GOVERNANCE_FORMAT,
    site: { id: g.id, name: g.name },
    kinds: g.kinds,
    authorities: g.authorities,
    actions: (g.tools ?? []).map(toolToAction),
    areas: (g.scopes ?? []) as AreaDef[],
    roles: (g.roles ?? []).map(r => { const { tools, ...rest } = r; return { ...rest, actions: tools }; }),
    facts: g.facts,
    limits: g.limits,
    tags: { actions: g.tags?.tools ?? [], areas: g.tags?.scopes ?? [], roles: g.tags?.roles ?? [] },
    answers: {},
    otherwise: g.otherwise,
    ...(g.trustedKeys !== undefined ? { trustedKeys: g.trustedKeys } : {}),
    rules: (g.rules ?? []).map(ruleIn),
    ...(g.planRules !== undefined ? { planRules: (g.planRules ?? []).map(planRuleIn) } : {}),
    ...(g.mission !== undefined ? { mission: g.mission } : {}),
    builtin: g.builtin,
    findings: g.findings,
    fingerprint: g.fingerprint,
  };
  VIEWS.set(rulebook, view);
  return view;
}

function toolToAction(t: GovernanceRulebook['tools'][number]): ActionDef {
  return t as unknown as ActionDef;
}

/** A `/1` rule into internal words (history conditions). Everything else is shared already. */
export function ruleIn(r: GovernanceRule | Rule): Rule {
  if (!r || typeof r !== 'object' || !Array.isArray(r.history)) return r as Rule;
  return { ...r, history: r.history.map(historyIn) } as Rule;
}

export function historyIn(h: GovernanceHistoryCondition | HistoryCondition): HistoryCondition {
  if (!h || typeof h !== 'object') return h as HistoryCondition;
  const g = h as GovernanceHistoryCondition & HistoryCondition;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(g)) {
    if (k === 'tools') out.actions = v;
    else if (k === 'scopes') out.areas = v;
    else if (k === 'sameScope') out.sameArea = v;
    else out[k] = v;
  }
  return out as unknown as HistoryCondition;
}

export function planRuleIn(r: GovernancePlanRule | PlanRule): PlanRule {
  if (!r || typeof r !== 'object' || !r.check || typeof r.check !== 'object') return r as PlanRule;
  const c = r.check as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    if (k === 'tools') out.actions = v;
    else if (k === 'scopes') out.areas = v;
    else if (k === 'sameScope') out.sameArea = v;
    else out[k] = v;
  }
  return { ...r, check: out as unknown as PlanCheck };
}

// ─── Back out: internal → /1 words ───────────────────────────────────────────

export function historyOut(h: HistoryCondition): GovernanceHistoryCondition {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(h)) {
    if (k === 'actions') out.tools = v;
    else if (k === 'areas') out.scopes = v;
    else if (k === 'sameArea') out.sameScope = v;
    else out[k] = v;
  }
  return out as unknown as GovernanceHistoryCondition;
}

export function ruleOut(r: Rule): GovernanceRule {
  if (!Array.isArray(r.history)) return r as GovernanceRule;
  return { ...r, history: r.history.map(historyOut) };
}

export function planRuleOut(r: PlanRule): GovernancePlanRule {
  const c = r.check as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    if (k === 'actions') out.tools = v;
    else if (k === 'areas') out.scopes = v;
    else if (k === 'sameArea') out.sameScope = v;
    else out[k] = v;
  }
  return { ...r, check: out as unknown as GovernancePlanCheck };
}

/**
 * A witness in `/1` words: `tool`, `scope`, a `principal`, and the facts the
 * tool's arguments bind moved into `args` (a request carries them as
 * arguments, never as facts, SPEC.md § 16.4).
 */
export function witnessOut(w: Witness, vocab: { actions: Map<string, ActionDef> }): Record<string, unknown> {
  const { action, areaId, facts, ...rest } = w;
  const args: Record<string, unknown> = {};
  const remaining: Record<string, unknown> = { ...facts };
  for (const [field, b] of Object.entries(vocab.actions.get(action)?.args ?? {})) {
    if (b.fact in remaining) { args[field] = remaining[b.fact]; delete remaining[b.fact]; }
  }
  return { principal: { id: 'principal-1' }, ...rest, tool: action, scope: areaId, ...(Object.keys(args).length ? { args } : {}), facts: remaining };
}

/** A `/1` compile input in the internal shape the shared compiler takes. Field renames only; validation happens in the compiler. */
export function compileInputIn(input: GovernanceCompileInput): { site: { id: string; name: string }; kinds?: string[]; authorities: GovernanceCompileInput['authorities']; actions: ActionDef[]; areas: AreaDef[]; roles: Rulebook['roles']; facts?: GovernanceCompileInput['facts']; limits?: GovernanceCompileInput['limits']; tags?: { actions?: string[]; areas?: string[]; roles?: string[] }; otherwise?: GovernanceCompileInput['otherwise']; trustedKeys?: GovernanceCompileInput['trustedKeys']; rules?: Rule[]; planRules?: PlanRule[] } {
  const list = <T>(x: T[] | undefined): T[] => (Array.isArray(x) ? x : []);
  return {
    site: { id: input.id, name: input.name },
    ...(input.kinds !== undefined ? { kinds: input.kinds } : {}),
    authorities: input.authorities,
    actions: list(input.tools).map(toolToAction),
    areas: list(input.scopes) as AreaDef[],
    roles: list(input.roles).map(r => { if (!r || typeof r !== 'object') return r as unknown as Rulebook['roles'][number]; const { tools, ...rest } = r; return { ...rest, actions: tools } as Rulebook['roles'][number]; }),
    ...(input.facts !== undefined ? { facts: input.facts } : {}),
    ...(input.limits !== undefined ? { limits: input.limits } : {}),
    ...(input.tags !== undefined ? { tags: { ...(input.tags.tools !== undefined ? { actions: input.tags.tools } : {}), ...(input.tags.scopes !== undefined ? { areas: input.tags.scopes } : {}), ...(input.tags.roles !== undefined ? { roles: input.tags.roles } : {}) } } : {}),
    ...(input.otherwise !== undefined ? { otherwise: input.otherwise } : {}),
    ...(input.trustedKeys !== undefined ? { trustedKeys: input.trustedKeys } : {}),
    ...(input.rules !== undefined ? { rules: list(input.rules).map(ruleIn) } : {}),
    ...(input.planRules !== undefined ? { planRules: list(input.planRules).map(planRuleIn) } : {}),
  };
}

/** The compiled internal body back in `/1` words: the artifact that is fingerprinted and shipped. */
export function bodyOut(body: Omit<InternalRulebook, 'fingerprint' | 'findings'>): Omit<GovernanceRulebook, 'fingerprint' | 'findings'> {
  return {
    format: GOVERNANCE_FORMAT,
    id: body.site.id,
    name: body.site.name,
    kinds: body.kinds,
    authorities: body.authorities,
    tools: body.actions as unknown as GovernanceRulebook['tools'],
    scopes: body.areas as GovernanceRulebook['scopes'],
    roles: body.roles.map(r => { const { actions, inherits: _i, synonyms: _s, ...rest } = r; return { ...rest, tools: actions }; }),
    facts: body.facts,
    limits: body.limits,
    tags: { tools: body.tags.actions, scopes: body.tags.areas, roles: body.tags.roles },
    otherwise: body.otherwise,
    ...(body.trustedKeys !== undefined ? { trustedKeys: body.trustedKeys } : {}),
    rules: body.rules.map(ruleOut),
    ...(body.planRules !== undefined ? { planRules: body.planRules.map(planRuleOut) } : {}),
    ...(body.mission !== undefined ? { mission: body.mission } : {}),
    builtin: body.builtin,
  };
}

/** Is this a `/1` condition list? (No change: conditions are shared.) */
export type { Condition };
