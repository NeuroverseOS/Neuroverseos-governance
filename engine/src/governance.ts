/**
 * neuroverse-governance/1 — compiling the digital format (SPEC.md § 16).
 *
 *   compileGovernance(input)          → GovernanceRulebook   (tools, scopes, roles, facts, rules)
 *   compileMission(rulebook, mission) → GovernanceRulebook   (the same, tightened by one mission)
 *
 * Both run the SAME compiler the `/3` format runs (`assemble` + the conflict
 * check), through the model's field renames: a `/1` input is read into the
 * internal shape, compiled, and written back out in `/1` words; the
 * fingerprint is over the `/1` artifact. A mission (SPEC.md § 16.7) becomes
 * rules at the authority `plan`, appended BELOW every declared authority:
 * deny for every tool it does not permit, deny for a permitted tool outside
 * its scopes, a wait where it asks for approval, a history rule for each
 * ordering, and whole-plan rules for counts. A mission has no `allow`, so by
 * construction it can only tighten; strictest-wins does the rest.
 */

import type {
  GovernanceCompileInput, GovernancePlanCheck, GovernanceRulebook, GovernanceRule, Mission, Rule, Selector, PlanRule,
} from './types';
import { assemble, clone, deepFreeze, declarationAuthority, type CompileOptions } from './compile';
import { checkRulebook } from './check';
import { fingerprint } from './canonical';
import { DomainRulesError, selectorEntries } from './vocabulary';
import { GOVERNANCE_DIALECT, bodyOut, compileInputIn, normalizeRulebook } from './model';
import { GOVERNANCE_FORMAT, GOVERNANCE_PLAN_FORMAT, rulebookVersionProblem } from './version';

/** The authority every mission rule is set by: appended below every declared authority. */
export const PLAN_AUTHORITY = 'plan';

export function compileGovernance(input: GovernanceCompileInput, options: CompileOptions = {}): GovernanceRulebook {
  if (!input || typeof input !== 'object') throw new DomainRulesError('compileGovernance needs { id, name, authorities, tools, scopes, roles, ... }.');
  if (typeof input.id !== 'string' || !input.id) throw new DomainRulesError('compileGovernance: id is required.');
  if (typeof input.name !== 'string' || !input.name) throw new DomainRulesError('compileGovernance: name is required.');
  for (const field of ['tools', 'scopes', 'roles'] as const) if (!Array.isArray(input[field])) throw new DomainRulesError(`compileGovernance: ${field} must be a list.`);
  const internal = compileInputIn(input);
  if (input.mission !== undefined) (internal as { mission?: GovernanceCompileInput['mission'] }).mission = input.mission;
  const body = assemble(internal, GOVERNANCE_DIALECT);
  const findings = checkRulebook(body);   // witnesses come back in /1 words (the body's format is /1)
  if (options.strict) {
    const conflicts = findings.filter(f => f.severity === 'conflict');
    if (conflicts.length) throw new DomainRulesError(`Rules at odds (${conflicts.length}):\n${conflicts.map(f => `- ${f.message}`).join('\n')}`);
  }
  const artifact = bodyOut(body);
  // The fingerprint covers the /1 artifact as written, never the findings (their messages are free text).
  return deepFreeze({ ...artifact, findings: clone(findings), fingerprint: fingerprint(artifact) }) as GovernanceRulebook;
}

/**
 * The compile input a `/1` rulebook was made from, as far as it can be
 * recovered: everything but the derived role-limit rules (re-derived on
 * compile), the builtin list, the findings and the fingerprint.
 */
export function governanceInputOf(rulebook: GovernanceRulebook): GovernanceCompileInput {
  const prefix = GOVERNANCE_DIALECT.roleLimitPrefix;
  return clone({
    id: rulebook.id, name: rulebook.name, kinds: rulebook.kinds, authorities: rulebook.authorities, tools: rulebook.tools, scopes: rulebook.scopes,
    roles: rulebook.roles.map(r => { const { inherits: _i, ...rest } = r; return rest; }),
    facts: rulebook.facts, limits: rulebook.limits, tags: rulebook.tags, otherwise: rulebook.otherwise,
    ...(rulebook.trustedKeys !== undefined ? { trustedKeys: rulebook.trustedKeys } : {}),
    rules: rulebook.rules.filter(r => !r.id.startsWith(prefix)),
    ...(rulebook.planRules !== undefined ? { planRules: rulebook.planRules } : {}),
    ...(rulebook.mission !== undefined ? { mission: rulebook.mission } : {}),
  });
}

/**
 * Tighten a `/1` rulebook by one mission (SPEC.md § 16.7). Returns a NEW
 * rulebook: the same vocabulary and rules, the authority `plan` appended last,
 * the mission's rules added at `setBy: "plan"`, and `mission` recorded. Its
 * fingerprint covers rulebook and mission, so an approval given under the base
 * rulebook does not clear a wait under the mission (and should not). A
 * rulebook that already carries a mission, or declares `plan` itself, is refused.
 */
export function compileMission(rulebook: GovernanceRulebook, mission: Mission, options: CompileOptions = {}): GovernanceRulebook {
  const versionProblem = rulebookVersionProblem(rulebook, 'governance');
  if (versionProblem) throw new DomainRulesError(`compileMission: ${versionProblem}`);
  if (rulebook.mission !== undefined) throw new DomainRulesError(`compileMission: this rulebook already carries mission "${rulebook.mission.id}"; compile a mission from the base rulebook, not from another mission.`);
  if (rulebook.authorities.some(a => a.id === PLAN_AUTHORITY)) throw new DomainRulesError(`compileMission: the rulebook declares an authority "${PLAN_AUTHORITY}"; that id is reserved for mission rules.`);
  validateMission(mission, rulebook);
  const base = governanceInputOf(rulebook);
  const tools = new Set(rulebook.tools.map(t => t.id));
  const scopes = new Set(rulebook.scopes.map(s => s.id));
  const rules: GovernanceRule[] = [];
  const planRules: PlanRule[] = [];
  const source = (ref: string): Rule['source'] => ({ kind: 'system', ref: `plan:${mission.id}/${ref}` });
  const ids = new Set<string>([...rulebook.rules.map(r => r.id), ...(rulebook.planRules ?? []).map(r => r.id)]);
  const fresh = (id: string, what: string) => {
    if (ids.has(id)) throw new DomainRulesError(`compileMission: ${what} id "${id}" is already a rule of this rulebook or mission.`);
    ids.add(id);
    return id;
  };

  // Every tool the mission does not permit is denied; a permitted tool outside its scopes is denied.
  const permitted = mission.permits.map(p => p.tool);
  const notPermitted = [...tools].filter(t => !permitted.includes(t));
  if (notPermitted.length) {
    rules.push({
      id: fresh(mission.permitsRuleId ?? 'plan:tools', 'permits'),
      text: `During mission "${mission.id}" only ${permitted.join(', ') || 'nothing'} may be used.`,
      who: '*', does: permitted.length ? permitted.map(t => `!${t}`) : '*', where: '*',
      then: { answer: 'deny' }, setBy: PLAN_AUTHORITY, source: source('permits'),
    });
  }
  for (const p of mission.permits) {
    if (!p.scopes) continue;
    const denied = [...scopes].filter(s => !p.scopes!.includes(s));
    if (!denied.length) continue;
    rules.push({
      id: fresh(p.id ?? `plan:scope:${p.tool}`, 'permits.scopes'),
      text: `During mission "${mission.id}", ${p.tool} may be used only in ${p.scopes.join(', ')}.`,
      who: '*', does: p.tool, where: p.scopes.map(s => `!${s}`),
      then: { answer: 'deny' }, setBy: PLAN_AUTHORITY, source: source(`permits:${p.tool}`),
    });
  }
  for (const a of mission.approvals ?? []) {
    rules.push({
      id: fresh(a.id ?? `plan:approve:${a.tool}`, 'approvals'),
      text: `During mission "${mission.id}", ${a.tool}${a.scopes ? ` in ${a.scopes.join(', ')}` : ''} waits for ${a.by}'s approval.`,
      who: '*', does: a.tool, where: a.scopes ?? '*',
      then: { answer: 'wait', for: 'approval', by: a.by }, setBy: PLAN_AUTHORITY, source: source(`approvals:${a.tool}`),
    });
  }
  (mission.order ?? []).forEach((o, i) => {
    rules.push({
      id: fresh(o.id ?? `plan:before:${selectorEntries(o.then).join('+')}`, 'order'),
      text: `During mission "${mission.id}", ${describe(o.first)} must have happened before ${describe(o.then)}.`,
      who: '*', does: o.then, where: '*',
      history: [{ tools: o.first, op: '<', value: 1 }],
      then: { answer: 'deny' }, setBy: PLAN_AUTHORITY, source: source(`order:${i}`),
    });
  });
  (mission.atMost ?? []).forEach((m, i) => {
    planRules.push({ id: fresh(m.id ?? `plan:at_most:${i}`, 'atMost'), text: `During mission "${mission.id}", at most ${m.count} × ${describe(m.tools)}.`, who: '*', check: { kind: 'at_most', actions: m.tools, count: m.count }, setBy: PLAN_AUTHORITY, source: source(`atMost:${i}`) });
  });
  (mission.requires ?? []).forEach((r, i) => {
    planRules.push({ id: fresh(r.id ?? `plan:requires:${i}`, 'requires'), text: `Mission "${mission.id}" is complete only once ${describe(r.tools)} has happened.`, who: '*', check: { kind: 'at_least', actions: r.tools, count: 1 }, setBy: PLAN_AUTHORITY, source: source(`requires:${i}`) });
  });

  const input: GovernanceCompileInput = {
    ...base,
    authorities: [...base.authorities, { id: PLAN_AUTHORITY, name: `Mission plan ${mission.id}` }],
    rules: [...(base.rules ?? []), ...rules],
    ...(planRules.length || base.planRules ? { planRules: [...(base.planRules ?? []), ...planRules.map(r => ({ ...r, check: toGovernanceCheck(r.check) }))] } : {}),
    mission: { id: mission.id, objective: mission.objective, planDigest: fingerprint(mission) },
  };
  return compileGovernance(input, options);
}

function toGovernanceCheck(c: PlanRule['check']): GovernancePlanCheck {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) out[k === 'actions' ? 'tools' : k === 'areas' ? 'scopes' : k === 'sameArea' ? 'sameScope' : k] = v;
  return out as unknown as GovernancePlanCheck;
}

function describe(sel: Selector): string {
  return selectorEntries(sel).join('/');
}

/** A mission must name declared tools and scopes, a declared approver, and nothing a mission cannot say. Throws DomainRulesError. */
export function validateMission(mission: unknown, rulebook: GovernanceRulebook): asserts mission is Mission {
  const where = 'compileMission';
  if (!mission || typeof mission !== 'object') throw new DomainRulesError(`${where}: the mission must be an object { format, id, objective, permits, ... }.`);
  const m = mission as Mission;
  if (m.format !== GOVERNANCE_PLAN_FORMAT) throw new DomainRulesError(`${where}: mission.format must be "${GOVERNANCE_PLAN_FORMAT}", got ${JSON.stringify((m as { format?: unknown }).format)}.`);
  if (typeof m.id !== 'string' || !m.id || /\s/.test(m.id)) throw new DomainRulesError(`${where}: mission.id must be a non-empty string without whitespace.`);
  if (typeof m.objective !== 'string' || !m.objective) throw new DomainRulesError(`${where}: mission.objective is required (the job in plain words).`);
  if (m.permitsRuleId !== undefined && (typeof m.permitsRuleId !== 'string' || !m.permitsRuleId)) throw new DomainRulesError(`${where}: mission.permitsRuleId must be a non-empty string when given.`);
  const tools = new Set(rulebook.tools.map(t => t.id));
  const scopes = new Set(rulebook.scopes.map(s => s.id));
  const vocab = normalizeRulebook(rulebook);
  const roleIds = new Set(vocab.roles.map(r => r.id));
  const roleTags = new Set([...vocab.tags.roles, ...vocab.roles.flatMap(r => r.tags ?? [])]);
  const tool = (t: unknown, at: string) => { if (typeof t !== 'string' || !tools.has(t)) throw new DomainRulesError(`${where}: ${at} names unknown tool ${JSON.stringify(t)}. Known: ${[...tools].join(', ')}.`); };
  const scopeList = (list: unknown, at: string) => {
    if (list === undefined) return;
    if (!Array.isArray(list) || !list.length) throw new DomainRulesError(`${where}: ${at}.scopes must be a non-empty list of scope IDs.`);
    for (const s of list) if (typeof s !== 'string' || !scopes.has(s)) throw new DomainRulesError(`${where}: ${at}.scopes names unknown scope ${JSON.stringify(s)}. Known: ${[...scopes].join(', ')}.`);
  };
  const id = (v: unknown, at: string) => { if (v !== undefined && (typeof v !== 'string' || !v)) throw new DomainRulesError(`${where}: ${at}.id must be a non-empty string when given.`); };
  const selector = (sel: unknown, at: string) => {
    if (typeof sel !== 'string' && !(Array.isArray(sel) && sel.length && sel.every(e => typeof e === 'string'))) throw new DomainRulesError(`${where}: ${at} must be a tool selector (a tool id, "tag:<tag>", "kind:<kind>", "*" or a list).`);
    for (const raw of selectorEntries(sel as Selector)) {
      const e = raw.startsWith('!') ? raw.slice(1) : raw;
      if (e === '*' || e.startsWith('tag:') || e.startsWith('kind:')) continue;
      if (!tools.has(e)) throw new DomainRulesError(`${where}: ${at} names unknown tool "${e}". Known: ${[...tools].join(', ')}.`);
    }
  };
  if (!Array.isArray(m.permits)) throw new DomainRulesError(`${where}: mission.permits must be a list of { tool, scopes? } (it may be empty: then no tool may be used).`);
  m.permits.forEach((p, i) => { if (!p || typeof p !== 'object') throw new DomainRulesError(`${where}: permits[${i}] must be { tool, scopes? }.`); id(p.id, `permits[${i}]`); tool(p.tool, `permits[${i}].tool`); scopeList(p.scopes, `permits[${i}]`); });
  const seen = new Set<string>();
  for (const p of m.permits) { if (seen.has(p.tool)) throw new DomainRulesError(`${where}: permits lists tool "${p.tool}" twice.`); seen.add(p.tool); }
  if (m.approvals !== undefined) {
    if (!Array.isArray(m.approvals)) throw new DomainRulesError(`${where}: mission.approvals must be a list of { tool, scopes?, by }.`);
    m.approvals.forEach((a, i) => {
      if (!a || typeof a !== 'object') throw new DomainRulesError(`${where}: approvals[${i}] must be { tool, scopes?, by }.`);
      id(a.id, `approvals[${i}]`); tool(a.tool, `approvals[${i}].tool`); scopeList(a.scopes, `approvals[${i}]`);
      if (typeof a.by !== 'string' || !(rulebook.authorities.some(x => x.id === a.by) || roleIds.has(a.by) || (a.by.startsWith('tag:') && roleTags.has(a.by.slice(4))))) throw new DomainRulesError(`${where}: approvals[${i}].by must be a declared authority, role, or tag:<role tag>, got ${JSON.stringify(a.by)}.`);
    });
  }
  if (m.order !== undefined) {
    if (!Array.isArray(m.order)) throw new DomainRulesError(`${where}: mission.order must be a list of { first, then }.`);
    m.order.forEach((o, i) => { if (!o || typeof o !== 'object') throw new DomainRulesError(`${where}: order[${i}] must be { first, then }.`); id(o.id, `order[${i}]`); selector(o.first, `order[${i}].first`); selector(o.then, `order[${i}].then`); });
  }
  for (const [field, list] of [['atMost', m.atMost], ['requires', m.requires]] as const) {
    if (list === undefined) continue;
    if (!Array.isArray(list)) throw new DomainRulesError(`${where}: mission.${field} must be a list.`);
    list.forEach((x, i) => {
      if (!x || typeof x !== 'object') throw new DomainRulesError(`${where}: ${field}[${i}] must be { tools${field === 'atMost' ? ', count' : ''} }.`);
      id(x.id, `${field}[${i}]`); selector(x.tools, `${field}[${i}].tools`);
      const count = (x as unknown as { count?: unknown }).count;
      if (field === 'atMost' && (typeof count !== 'number' || !Number.isInteger(count) || count < 0)) throw new DomainRulesError(`${where}: atMost[${i}].count must be a whole number, 0 or more.`);
    });
  }
  for (const key of Object.keys(m)) if (!['format', 'id', 'objective', 'permitsRuleId', 'permits', 'approvals', 'order', 'atMost', 'requires'].includes(key)) throw new DomainRulesError(`${where}: a mission has no "${key}" (a mission can only tighten: permits, approvals, order, atMost, requires).`);
}

export { GOVERNANCE_FORMAT, GOVERNANCE_PLAN_FORMAT, declarationAuthority };
