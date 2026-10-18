/**
 * Compiler — site vocabulary + answers + rules → Rulebook.
 *
 * The compiler never invents rules. Every rule in the output comes from a
 * template, an answered question, a declared area (role limits), or a rule
 * written by an author holding a declared authority — a person, a system or
 * an agent. Undefined
 * references and impossible conditions are configuration errors and throw
 * `DomainRulesError`. Rules at odds with each other are findings, returned
 * on the rulebook and never hidden.
 */

import type {
  ActionDef, AreaDef, AuthorityDef, BuiltinCheck, Effect, FactDef, Finding, LimitDef, PlanRule, RoleDef, Rule, Rulebook, SiteDef, TrustedKey,
} from './types';
import { isHexBytes } from './approvals';
import {
  DomainRulesError, authorityRank, constraintOn, factProblem, isEmpty, isValidTime, validateCondition, validateHistoryCondition,
  validateFactDef, validateSelector, vocabularyOf, type Vocabulary,
} from './vocabulary';
import { checkRulebook } from './check';
import { canonicalJson, fingerprint } from './canonical';
import { isLegacyInput, fromLegacyInput, type LegacyCompileInput } from './legacy';
import { matchingRules } from './evaluate';
import { RULEBOOK_FORMAT, rulebookVersionProblem } from './version';
import type { Template, TemplateContext } from './templates/template';
import { templateById } from './templates/index';

export interface CompileDomainInput {
  site: SiteDef;
  /** A template ID ("grocery-store", "warehouse") or a Template object. Optional: a site can declare everything itself. */
  template?: string | Template;
  kinds?: string[];
  /** Highest first. Defaults to the template's, or a single authority "site". */
  authorities?: AuthorityDef[];
  /** Added to (or overriding, by ID) the template's. */
  actions?: ActionDef[];
  facts?: FactDef[];
  limits?: LimitDef[];
  /** Tags rules may name even when nothing declared carries them yet. */
  tags?: { actions?: string[]; areas?: string[]; roles?: string[] };
  areas: AreaDef[];
  roles: RoleDef[];
  /** Template question answers by question ID. Unanswered questions take the safe default. */
  answers?: Record<string, string>;
  /** Rules written or confirmed by the operator. Each must say who set it. */
  rules?: Rule[];
  /** Rules about whole plans (checked by `evaluatePlan`). Each must say who set it. */
  planRules?: PlanRule[];
  otherwise?: 'deny' | 'wait-for-approval';
  /** Keys whose signed approvals count. Declaring any means plain approvals no longer clear a wait. */
  trustedKeys?: TrustedKey[];
}

export interface CompileOptions {
  /** Throw a DomainRulesError when the conflict check finds a `conflict`. */
  strict?: boolean;
}

/** Checks the evaluator always runs, cited by ID in decisions. */
export const BUILTIN_CHECKS: BuiltinCheck[] = [
  { id: 'required_facts', text: 'Every fact a decision needs must be supplied and valid; a missing or invalid fact is never permission.' },
  { id: 'area_declared', text: 'Only declared areas are governed; anything in an undeclared area is blocked.' },
  { id: 'role_declared', text: 'Only declared roles may act; unknown roles are blocked.' },
  { id: 'role_permits_action', text: 'A participant may only take actions its role lists.' },
  { id: 'unknown_action', text: 'An action the rulebook does not know is denied, or waits for approval, as the rulebook says (otherwise).' },
  { id: 'plan_area_continuity', text: 'A plan step happens where the earlier steps left the participant unless its action moves it there.' },
];

export function compileDomain(input: CompileDomainInput | LegacyCompileInput, options: CompileOptions = {}): Rulebook {
  const resolved: CompileDomainInput = isLegacyInput(input) ? fromLegacyInput(input) : input;
  const body = assemble(resolved);
  const findings = checkRulebook(body);
  if (options.strict) {
    const conflicts = findings.filter(f => f.severity === 'conflict');
    if (conflicts.length) throw new DomainRulesError(`Rules at odds (${conflicts.length}):\n${conflicts.map(f => `- ${f.message}`).join('\n')}`);
  }
  // The fingerprint covers the rules and the vocabulary, never the findings: two conforming compilers may word a finding differently.
  return deepFreeze({ ...body, findings: clone(findings), fingerprint: fingerprint(body) });
}

type RulebookBody = Omit<Rulebook, 'fingerprint' | 'findings'>;

/** Everything but the findings and the fingerprint. Exported for `checkRulebook(input)`. */
export function assemble(input: CompileDomainInput): RulebookBody {
  if (!input || typeof input !== 'object' || !input.site) throw new DomainRulesError('compileDomain needs { site, areas, roles, ... }.');
  const site = validateSite(input.site);
  const template = typeof input.template === 'string' ? templateById(input.template) : input.template;

  const kinds = new Set<string>([...(template?.kinds ?? []), ...(input.kinds ?? [])]);
  const authorities = clone(input.authorities ?? template?.authorities ?? [{ id: 'site', name: 'Site' }]);
  validateAuthorities(authorities);

  const actions = mergeById(template?.actions ?? [], input.actions ?? [], 'action');
  const facts = mergeById(template?.facts ?? [], input.facts ?? [], 'fact');
  const limits = mergeById(template?.limits ?? [], input.limits ?? [], 'limit');
  for (const a of actions) { validateId(a.id, 'action'); if (!Array.isArray(a.kinds) || a.kinds.length === 0) throw new DomainRulesError(`Action "${a.id}" must list the kinds that may do it.`); a.kinds.forEach(k => kinds.add(k)); }
  for (const f of facts) { validateId(f.id, 'fact'); validateFactDef(f); }
  if (facts.some(f => f.id === 'approvedBy')) throw new DomainRulesError('"approvedBy" is a built-in fact; do not declare it.');
  for (const l of limits) {
    validateId(l.id, 'limit');
    if (l.requestedFact !== undefined) {
      const rf = facts.find(f => f.id === l.requestedFact);
      if (!rf) throw new DomainRulesError(`Limit "${l.id}" names requestedFact "${l.requestedFact}", which is not a declared fact.`);
      if (rf.type !== 'number') throw new DomainRulesError(`Limit "${l.id}" requestedFact "${l.requestedFact}" must be a number fact.`);
    }
  }
  for (const a of actions) for (const req of a.requires ?? []) {
    if (!facts.some(f => f.id === req)) throw new DomainRulesError(`Action "${a.id}" requires unknown fact "${req}".`);
  }
  for (const a of actions) if (a.effects !== undefined) validateEffects(a.id, a.effects, facts);

  const roles = resolveRoles(input.roles ?? [], actions, kinds);
  const areas = validateAreas(input.areas ?? [], new Set(roles.map(r => r.id)));
  const tags = {
    actions: [...new Set([...(template?.tags?.actions ?? []), ...(input.tags?.actions ?? [])])],
    areas: [...new Set([...(template?.tags?.areas ?? []), ...(input.tags?.areas ?? [])])],
    roles: [...new Set([...(template?.tags?.roles ?? []), ...(input.tags?.roles ?? [])])],
  };

  const answers = resolveAnswers(template, input.answers ?? {});
  let otherwise: Rulebook['otherwise'] = input.otherwise ?? template?.otherwise ?? 'deny';
  if (otherwise !== 'deny' && otherwise !== 'wait-for-approval') throw new DomainRulesError(`otherwise must be "deny" or "wait-for-approval", got ${JSON.stringify(otherwise)}.`);
  const trustedKeys = input.trustedKeys === undefined ? undefined : validateTrustedKeys(input.trustedKeys, authorities, roles);

  const partial: RulebookBody = {
    format: RULEBOOK_FORMAT,
    site,
    ...(template ? { template: template.id } : {}),
    kinds: [...kinds],
    authorities,
    actions, areas, roles, facts, limits, tags,
    answers,
    otherwise,
    ...(trustedKeys ? { trustedKeys } : {}),
    rules: [],
    builtin: clone(BUILTIN_CHECKS),
  };
  const vocab = vocabularyOf(partial);
  for (const l of limits) if (l.appliesTo !== undefined) validateSelector(l.appliesTo, 'does', vocab, `Limit "${l.id}" appliesTo`);

  // Rules, in order: template fixed rules, question rules, declaration rules, the operator's own.
  const rules: Rule[] = [];
  if (template) {
    const ctx: TemplateContext = { site, answers, roles, areas, actions, facts, limits };
    if (template.requires?.includes('hours') && !site.hours) throw new DomainRulesError(`Template "${template.id}" needs site.hours { open, close }.`);
    // Template rules are copied: a template may hand out the same `then` object every time, and a rulebook shares nothing with another.
    for (const r of template.rules?.(ctx) ?? []) rules.push(clone({ ...r, source: { kind: 'template', ref: template.id } }));
    for (const q of template.questions) {
      const option = q.options.find(o => o.value === answers[q.id])!;
      if (option.otherwise && input.otherwise === undefined) otherwise = option.otherwise;
      for (const r of option.rules?.(ctx) ?? []) rules.push(clone({ setBy: q.setBy, ...r, source: { kind: 'question', ref: `${q.id}:${option.value}` } }));
    }
    partial.otherwise = otherwise;
  }
  for (const area of areas) rules.push(...areaRoleLimitRules(area, roles, authorities));
  for (const r of input.rules ?? []) {
    if (!r || typeof r !== 'object') throw new DomainRulesError('Each rule must be an object { id, text, who, does, where, then, setBy }.');
    rules.push({ ...clone(r), source: r.source ? clone(r.source) : { kind: 'manual', ref: r.id } });
  }

  const seen = new Set<string>();
  for (const r of rules) {
    validateRule(r, vocab);
    if (seen.has(r.id)) throw new DomainRulesError(`Rule "${r.id}" is declared twice.`);
    seen.add(r.id);
  }
  partial.rules = rules;
  if (input.planRules !== undefined) {
    if (!Array.isArray(input.planRules)) throw new DomainRulesError('planRules must be a list of plan rules.');
    const planRules: PlanRule[] = [];
    for (const r of input.planRules) {
      if (!r || typeof r !== 'object') throw new DomainRulesError('Each plan rule must be an object { id, text, who, check, setBy }.');
      const pr = { ...clone(r), source: r.source ? clone(r.source) : { kind: 'manual' as const, ref: r.id } };
      validatePlanRule(pr, vocab);
      if (seen.has(pr.id)) throw new DomainRulesError(`Rule "${pr.id}" is declared twice.`);
      seen.add(pr.id);
      planRules.push(pr);
    }
    if (planRules.length) partial.planRules = planRules;
  }
  return partial;
}

/** Effects name declared facts and fit their types; `move` names no fact. */
function validateEffects(actionId: string, effects: Effect[], facts: FactDef[]): void {
  if (!Array.isArray(effects)) throw new DomainRulesError(`Action "${actionId}": effects must be a list.`);
  for (const e of effects) {
    const where = `Action "${actionId}" effect`;
    if (!e || typeof e !== 'object') throw new DomainRulesError(`${where}: each effect is { op: set|add|subtract, fact, value } or { op: move }.`);
    if (e.op === 'move') { if (Object.keys(e).length !== 1) throw new DomainRulesError(`${where}: move takes no other fields.`); continue; }
    if (e.op !== 'set' && e.op !== 'add' && e.op !== 'subtract') throw new DomainRulesError(`${where}: op must be set, add, subtract or move, got ${JSON.stringify((e as { op?: unknown }).op)}.`);
    const def = facts.find(f => f.id === e.fact);
    if (!def) throw new DomainRulesError(`${where}: names unknown fact "${String(e.fact)}". Known: ${facts.map(f => f.id).join(', ') || 'none'}.`);
    if (e.op === 'set') { const p = factProblem(def, e.value); if (p) throw new DomainRulesError(`${where}: set value invalid: ${p}.`); continue; }
    if (def.type !== 'number') throw new DomainRulesError(`${where}: ${e.op} applies to number facts; "${def.id}" is a ${def.type}.`);
    if (typeof e.value !== 'number' || !Number.isFinite(e.value)) throw new DomainRulesError(`${where}: ${e.op} needs a finite number.`);
    if (def.integer && !Number.isInteger(e.value)) throw new DomainRulesError(`${where}: "${def.id}" is a whole number; ${e.op} ${e.value} would make it a fraction.`);
  }
}

/** Throws a DomainRulesError naming anything in the plan rule the site did not declare. */
export function validatePlanRule(r: PlanRule, vocab: Vocabulary): void {
  if (typeof r.id !== 'string' || r.id.length === 0) throw new DomainRulesError('A plan rule needs a non-empty id.');
  const where = `Plan rule "${r.id}"`;
  if (typeof r.text !== 'string' || r.text.length === 0) throw new DomainRulesError(`${where}: text (the rule in plain words) is required.`);
  if (typeof r.setBy !== 'string' || r.setBy.length === 0) throw new DomainRulesError(`${where}: setBy is required — say which authority set this rule. Known: ${vocab.authorities.map(a => a.id).join(', ')}.`);
  if (authorityRank(vocab, r.setBy) < 0) throw new DomainRulesError(`${where}: setBy names unknown authority "${r.setBy}". Known: ${vocab.authorities.map(a => a.id).join(', ')}.`);
  validateSelector(r.who, 'who', vocab, where);
  const c = r.check;
  if (!c || typeof c !== 'object') throw new DomainRulesError(`${where}: check is required (ends_in, ends_with, before or at_most).`);
  switch (c.kind) {
    case 'ends_in': validateSelector(c.areas, 'where', vocab, `${where} ends_in`); break;
    case 'ends_with': validateSelector(c.actions, 'does', vocab, `${where} ends_with`); break;
    case 'before':
      validateSelector(c.first, 'does', vocab, `${where} before.first`);
      validateSelector(c.then, 'does', vocab, `${where} before.then`);
      if (c.sameArea !== undefined && typeof c.sameArea !== 'boolean') throw new DomainRulesError(`${where}: before.sameArea must be true or false.`);
      break;
    case 'at_most':
      validateSelector(c.actions, 'does', vocab, `${where} at_most`);
      if (typeof c.count !== 'number' || !Number.isInteger(c.count) || c.count < 0) throw new DomainRulesError(`${where}: at_most.count must be a whole number, 0 or more.`);
      break;
    default: throw new DomainRulesError(`${where}: check.kind must be ends_in, ends_with, before or at_most, got ${JSON.stringify((c as { kind?: unknown }).kind)}.`);
  }
  if (!r.source || typeof r.source !== 'object' || !r.source.kind) throw new DomainRulesError(`${where}: source { kind, ref } is required.`);
}

/** Throws a DomainRulesError naming anything in the rule the site did not declare, or any impossible condition. */
export function validateRule(r: Rule, vocab: Vocabulary): void {
  if (typeof r.id !== 'string' || r.id.length === 0) throw new DomainRulesError('A rule needs a non-empty id.');
  const where = `Rule "${r.id}"`;
  if (typeof r.text !== 'string' || r.text.length === 0) throw new DomainRulesError(`${where}: text (the rule in plain words) is required.`);
  if (typeof r.setBy !== 'string' || r.setBy.length === 0) throw new DomainRulesError(`${where}: setBy is required — say which authority set this rule. Known: ${vocab.authorities.map(a => a.id).join(', ')}.`);
  if (authorityRank(vocab, r.setBy) < 0) throw new DomainRulesError(`${where}: setBy names unknown authority "${r.setBy}". Known: ${vocab.authorities.map(a => a.id).join(', ')}.`);
  validateSelector(r.who, 'who', vocab, where);
  validateSelector(r.does, 'does', vocab, where);
  validateSelector(r.where, 'where', vocab, where);
  if (r.when !== undefined) {
    if (!Array.isArray(r.when)) throw new DomainRulesError(`${where}: when must be a list of conditions.`);
    for (const c of r.when) validateCondition(c, vocab, where);
    for (const factId of new Set(r.when.map(c => c.fact))) {
      // Conditions on one fact must leave something possible.
      if (isEmpty(constraintOn(r.when, factId, vocab))) throw new DomainRulesError(`${where}: its conditions on "${factId}" can never all be true at once.`);
    }
  }
  if (r.history !== undefined) {
    if (!Array.isArray(r.history)) throw new DomainRulesError(`${where}: history must be a list of history conditions.`);
    for (const h of r.history) validateHistoryCondition(h, vocab, where);
  }
  const t = r.then;
  if (!t || typeof t !== 'object') throw new DomainRulesError(`${where}: then is required (allow, limit, wait or deny).`);
  switch (t.answer) {
    case 'allow': break;
    case 'deny': if (t.instead !== undefined && (typeof t.instead !== 'string' || !t.instead)) throw new DomainRulesError(`${where}: deny.instead must be a non-empty string.`); break;
    case 'wait': {
      if (t.for !== 'approval' && t.for !== 'condition') throw new DomainRulesError(`${where}: wait.for must be "approval" or "condition".`);
      if (t.by !== undefined) {
        if (t.for !== 'approval') throw new DomainRulesError(`${where}: wait.by applies to approval waits only.`);
        if (authorityRank(vocab, t.by) < 0 && !vocab.roles.has(t.by) && !(t.by.startsWith('tag:') && vocab.tags.roles.has(t.by.slice(4)))) {
          throw new DomainRulesError(`${where}: wait.by "${t.by}" is not a declared authority, role, or role tag (tag:<role tag>).`);
        }
      }
      break;
    }
    case 'limit': {
      if (!t.limits || typeof t.limits !== 'object' || Object.keys(t.limits).length === 0) throw new DomainRulesError(`${where}: limit needs { limits: { <limit id>: number } }.`);
      for (const [name, v] of Object.entries(t.limits)) {
        if (!vocab.limits.has(name)) throw new DomainRulesError(`${where}: limit names unknown limit "${name}". Known: ${[...vocab.limits.keys()].join(', ') || 'none'}.`);
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new DomainRulesError(`${where}: limit "${name}" must be a number, 0 or more.`);
      }
      break;
    }
    default: throw new DomainRulesError(`${where}: then.answer must be allow, limit, wait or deny, got ${JSON.stringify((t as { answer?: unknown }).answer)}.`);
  }
  if (r.never && t.answer !== 'deny') throw new DomainRulesError(`${where}: a never rule must deny.`);
  if (!r.source || typeof r.source !== 'object' || !r.source.kind) throw new DomainRulesError(`${where}: source { kind, ref } is required.`);
}

/**
 * Is a rulebook received as JSON one this evaluator may govern with? Returns
 * the problems in plain words (empty when the rulebook is valid). Checks the
 * format, the vocabulary, every rule (`validateRule`), duplicate IDs, the
 * fingerprint, and — because both are derived from the rest and could be
 * edited without touching the fingerprint — RE-DERIVES the area role-limit
 * never rules from `areas[].allowRoles/denyRoles` and the findings from the
 * rules, and compares: a rulebook whose derived never rules were removed or
 * altered, or whose findings were emptied or changed, is invalid even with
 * a recomputed fingerprint. (Finding messages are free text and may differ;
 * kind, severity, rule IDs, certainty and a valid witness must agree.)
 * It is the check the spec calls "rulebook validation"; other
 * implementations run the same list before deciding anything.
 */
export function validateRulebook(rulebook: unknown): string[] {
  const versionProblem = rulebookVersionProblem(rulebook);
  if (versionProblem) return [versionProblem];
  const rb = rulebook as Rulebook;
  const problems: string[] = [];
  try {
    const body = assemble({
      site: rb.site, kinds: rb.kinds, authorities: rb.authorities, actions: rb.actions, facts: rb.facts, limits: rb.limits,
      tags: rb.tags, areas: (rb.areas ?? []).map(a => ({ ...a, allowRoles: undefined, denyRoles: undefined })),
      roles: (rb.roles ?? []).map(r => ({ ...r, inherits: undefined })), otherwise: rb.otherwise, trustedKeys: rb.trustedKeys, rules: [],
    });
    const vocab = vocabularyOf(body);
    // The area role-limit never rules, re-derived from the areas as received, must be present and unchanged.
    if (Array.isArray(rb.rules) && Array.isArray(rb.areas) && Array.isArray(rb.roles) && Array.isArray(rb.authorities) && rb.authorities.length) {
      const expected = rb.areas.flatMap(a => areaRoleLimitRules(a, rb.roles, rb.authorities));
      const declared = rb.rules.filter(r => r && typeof r === 'object' && typeof r.id === 'string' && r.id.startsWith('area_role_limits:'));
      for (const e of expected) {
        const got = declared.find(r => r.id === e.id);
        if (!got) problems.push(`Rule "${e.id}" is missing: an area's allowRoles/denyRoles compile to that never rule, and a rulebook without it does not say what its areas say.`);
        else if (canonicalJson(got) !== canonicalJson(e)) problems.push(`Rule "${e.id}" differs from what area "${e.where}" declares (allowRoles/denyRoles): the derived never rule was altered.`);
      }
      for (const d of declared) if (!expected.some(e => e.id === d.id)) problems.push(`Rule "${d.id}" claims to be an area's role limit, but no area declares it.`);
    }
    const seen = new Set<string>();
    if (!Array.isArray(rb.rules)) problems.push('rules must be a list');
    else {
      for (const r of rb.rules) {
        try { validateRule(r, vocab); } catch (e) { problems.push(e instanceof Error ? e.message : String(e)); continue; }
        if (seen.has(r.id)) problems.push(`Rule "${r.id}" is declared twice.`);
        seen.add(r.id);
      }
    }
    if (rb.planRules !== undefined) {
      if (!Array.isArray(rb.planRules) || rb.planRules.length === 0) problems.push('planRules, when present, must be a non-empty list');
      else for (const r of rb.planRules) {
        try { validatePlanRule(r, vocab); } catch (e) { problems.push(e instanceof Error ? e.message : String(e)); continue; }
        if (seen.has(r.id)) problems.push(`Rule "${r.id}" is declared twice.`);
        seen.add(r.id);
      }
    }
    if (!Array.isArray(rb.builtin) || BUILTIN_CHECKS.some(b => !rb.builtin.some(x => x && x.id === b.id))) problems.push(`builtin must list ${BUILTIN_CHECKS.map(b => b.id).join(', ')}`);
    if (!Array.isArray(rb.findings)) problems.push('findings must be a list (empty when the check found nothing)');
    else if (!problems.length) problems.push(...findingsProblems(rb));
  } catch (e) {
    problems.push(e instanceof Error ? e.message : String(e));
  }
  if (!problems.length && !verifyFingerprint(rb)) problems.push('the fingerprint does not match the contents');
  return problems;
}

/**
 * Re-run the conflict check on the rulebook as received and compare with
 * the findings it carries: the same multiset of { kind, severity, ruleIds,
 * certainty }, each certain finding between rules with a witness that
 * matches both rules. Messages are free text and not compared; a witness
 * need not be the reference's, only valid. Emptied or altered findings
 * make the rulebook invalid: "findings MUST NOT be hidden" is checked, not hoped.
 */
function findingsProblems(rb: Rulebook): string[] {
  const key = (f: Finding) => `${f.kind}|${f.severity}|${f.ruleIds.join('+')}|${f.certainty}`;
  const expected = checkRulebook(rb).map(key).sort();
  const got = rb.findings.map(f => (f && typeof f === 'object' && Array.isArray(f.ruleIds) ? key(f) : 'malformed')).sort();
  if (JSON.stringify(expected) !== JSON.stringify(got)) {
    const missing = expected.filter(k => !got.includes(k)), extra = got.filter(k => !expected.includes(k));
    return [`findings do not match what the conflict check finds for these rules${missing.length ? `; missing: ${missing.join(', ')}` : ''}${extra.length ? `; not found by the check: ${extra.join(', ')}` : ''} (findings may be reworded, never removed or invented)`];
  }
  const problems: string[] = [];
  for (const f of rb.findings) {
    const betweenRules = f.ruleIds.length === 2 && f.ruleIds.every(id => rb.rules.some(r => r.id === id));
    if (f.certainty === 'certain' && betweenRules && !f.witness) problems.push(`finding ${f.ruleIds.join('+')} is certain but carries no witness`);
    if (f.certainty === 'possible' && f.witness) problems.push(`finding ${f.ruleIds.join('+')} is possible but carries a witness`);
    if (f.witness && betweenRules) {
      const hit = matchingRules(rb, f.witness);
      if (!f.ruleIds.every(id => hit.includes(id))) problems.push(`the witness of finding ${f.ruleIds.join('+')} does not match both of its rules`);
    }
  }
  return problems;
}

/**
 * Does the rulebook's fingerprint still match its contents? Use it on a
 * rulebook received as JSON before trusting it. It catches accidental change
 * in transit; it is not a signature (see `fingerprint`).
 */
export function verifyFingerprint(rulebook: Rulebook): boolean {
  if (!rulebook || typeof rulebook !== 'object') return false;
  const { fingerprint: claimed, findings: _findings, ...body } = rulebook;
  return typeof claimed === 'string' && fingerprint(body) === claimed;
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validateSite(site: SiteDef): SiteDef {
  const s = clone(site) as SiteDef & { domainId?: string };
  if (!s.id && s.domainId) { s.id = s.domainId; delete s.domainId; }
  if (typeof s.id !== 'string' || !s.id) throw new DomainRulesError('site.id is required.');
  if (typeof s.name !== 'string' || !s.name) throw new DomainRulesError('site.name is required.');
  if (s.hours !== undefined) {
    if (!isValidTime(s.hours?.open)) throw new DomainRulesError(`site.hours.open must be "HH:MM" (24h), got "${s.hours?.open}".`);
    if (!isValidTime(s.hours?.close)) throw new DomainRulesError(`site.hours.close must be "HH:MM" (24h), got "${s.hours?.close}".`);
  }
  return s;
}

function validateAuthorities(list: AuthorityDef[]): void {
  if (!Array.isArray(list) || list.length === 0) throw new DomainRulesError('Declare at least one authority (highest first).');
  const seen = new Set<string>();
  for (const a of list) {
    validateId(a.id, 'authority');
    if (seen.has(a.id)) throw new DomainRulesError(`Authority "${a.id}" is declared twice.`);
    seen.add(a.id);
  }
}

function validateTrustedKeys(keys: TrustedKey[], authorities: AuthorityDef[], roles: RoleDef[]): TrustedKey[] {
  if (!Array.isArray(keys)) throw new DomainRulesError('trustedKeys must be a list of { keyId, publicKey, authority?, roleId? }.');
  const seen = new Set<string>();
  for (const k of keys) {
    if (!k || typeof k !== 'object') throw new DomainRulesError('Each trusted key must be an object { keyId, publicKey, authority?, roleId? }.');
    validateId(k.keyId, 'trusted key');
    if (seen.has(k.keyId)) throw new DomainRulesError(`Trusted key "${k.keyId}" is declared twice.`);
    seen.add(k.keyId);
    if (!isHexBytes(k.publicKey, 32)) throw new DomainRulesError(`Trusted key "${k.keyId}": publicKey must be a raw Ed25519 public key, 32 bytes as lowercase hex.`);
    if (k.authority !== undefined && !authorities.some(a => a.id === k.authority)) throw new DomainRulesError(`Trusted key "${k.keyId}" names unknown authority "${k.authority}". Known: ${authorities.map(a => a.id).join(', ')}.`);
    if (k.roleId !== undefined && !roles.some(r => r.id === k.roleId)) throw new DomainRulesError(`Trusted key "${k.keyId}" names unknown role "${k.roleId}". Known: ${roles.map(r => r.id).join(', ')}.`);
  }
  return keys.map(k => clone(k));
}

function validateId(id: unknown, what: string): void {
  if (typeof id !== 'string' || id.length === 0) throw new DomainRulesError(`Every ${what} needs a non-empty id.`);
  if (/[*!:]/.test(id) || /\s/.test(id)) throw new DomainRulesError(`${what} id "${id}" may not contain spaces, "*", "!" or ":".`);
}

function mergeById<T extends { id: string }>(base: T[], extra: T[], what: string): T[] {
  const out = new Map<string, T>();
  for (const x of base) out.set(x.id, clone(x));
  const seen = new Set<string>();
  for (const x of extra) {
    if (!x || typeof x !== 'object') throw new DomainRulesError(`Each ${what} must be an object with an id.`);
    if (seen.has(x.id)) throw new DomainRulesError(`${what} "${x.id}" is declared twice.`);
    seen.add(x.id);
    out.set(x.id, clone(x));
  }
  return [...out.values()];
}

function validateAreas(areas: AreaDef[], roleIds: Set<string>): AreaDef[] {
  if (areas.length === 0) throw new DomainRulesError('Declare at least one area.');
  const seen = new Set<string>();
  for (const a of areas) {
    validateId(a.id, 'area');
    if (seen.has(a.id)) throw new DomainRulesError(`Area "${a.id}" is declared twice.`);
    seen.add(a.id);
    if (typeof a.name !== 'string' || !a.name) throw new DomainRulesError(`Area "${a.id}" needs a name.`);
    for (const [field, list] of [['allowRoles', a.allowRoles], ['denyRoles', a.denyRoles]] as const) {
      if (list === undefined) continue;
      if (!Array.isArray(list)) throw new DomainRulesError(`Area "${a.id}" ${field} must be a list of role IDs.`);
      for (const roleId of list) if (!roleIds.has(roleId)) throw new DomainRulesError(`Area "${a.id}" ${field} names unknown role "${roleId}". Known: ${[...roleIds].join(', ')}`);
    }
    const both = (a.allowRoles ?? []).filter(r => a.denyRoles?.includes(r));
    if (both.length) throw new DomainRulesError(`Area "${a.id}" lists ${both.map(r => `"${r}"`).join(', ')} in both allowRoles and denyRoles.`);
  }
  return areas.map(a => clone(a));
}

/** Resolve inheritance so every role carries its full action list; check kinds and actions. */
function resolveRoles(roles: RoleDef[], actions: ActionDef[], kinds: Set<string>): RoleDef[] {
  if (roles.length === 0) throw new DomainRulesError('Declare at least one role.');
  const byId = new Map<string, RoleDef>();
  for (const r of roles) {
    validateId(r.id, 'role');
    if (byId.has(r.id)) throw new DomainRulesError(`Role "${r.id}" is declared twice.`);
    if (typeof r.kind !== 'string' || !r.kind) throw new DomainRulesError(`Role "${r.id}" needs a kind.`);
    if (typeof r.name !== 'string' || !r.name) throw new DomainRulesError(`Role "${r.id}" needs a name.`);
    kinds.add(r.kind);
    byId.set(r.id, r);
  }
  const actionById = new Map(actions.map(a => [a.id, a]));
  const resolved = new Map<string, string[]>();
  const resolve = (roleId: string, chain: string[]): string[] => {
    const done = resolved.get(roleId);
    if (done) return done;
    if (chain.includes(roleId)) throw new DomainRulesError(`Role inheritance loops: ${[...chain, roleId].join(' → ')}`);
    const role = byId.get(roleId)!;
    if (!Array.isArray(role.actions)) throw new DomainRulesError(`Role "${roleId}" needs an actions list (may be empty).`);
    for (const a of role.actions) {
      const def = actionById.get(a);
      if (!def) throw new DomainRulesError(`Role "${roleId}" lists unknown action "${a}". Known: ${[...actionById.keys()].join(', ')}`);
      if (!def.kinds.includes(role.kind)) {
        const ok = actions.filter(x => x.kinds.includes(role.kind)).map(x => x.id);
        throw new DomainRulesError(`Role "${roleId}" is a ${role.kind} and cannot list "${a}". ${role.kind} actions: ${ok.join(', ') || 'none'}`);
      }
    }
    let list = [...role.actions];
    if (role.inherits) {
      const parent = byId.get(role.inherits);
      if (!parent) throw new DomainRulesError(`Role "${roleId}" inherits unknown role "${role.inherits}".`);
      if (parent.kind !== role.kind) throw new DomainRulesError(`Role "${roleId}" (${role.kind}) cannot inherit "${parent.id}" (${parent.kind}).`);
      list = [...new Set([...resolve(parent.id, [...chain, roleId]), ...list])];
    }
    resolved.set(roleId, list);
    return list;
  };
  return roles.map(r => ({ ...clone(r), actions: resolve(r.id, []) }));
}

function resolveAnswers(template: Template | undefined, given: Record<string, string>): Record<string, string> {
  const answers: Record<string, string> = {};
  if (!template) {
    const keys = Object.keys(given);
    if (keys.length) throw new DomainRulesError(`Answers were given (${keys.join(', ')}) but no template was chosen. Questions belong to templates.`);
    return answers;
  }
  for (const q of template.questions) answers[q.id] = q.options[q.defaultIndex].value;
  for (const [questionId, value] of Object.entries(given)) {
    const question = template.questions.find(q => q.id === questionId);
    if (!question) throw new DomainRulesError(`Unknown question "${questionId}". Known: ${template.questions.map(q => q.id).join(', ')}`);
    if (!question.options.some(o => o.value === value)) throw new DomainRulesError(`Invalid answer "${value}" for "${questionId}". Valid: ${question.options.map(o => o.value).join(', ')}`);
    answers[questionId] = value;
  }
  return answers;
}

/** An area's allowRoles / denyRoles, as never rules. Set by the lowest-ranked authority that declares areas: the site itself. */
function areaRoleLimitRules(area: AreaDef, roles: RoleDef[], authorities: AuthorityDef[]): Rule[] {
  const setBy = declarationAuthority(authorities);
  const out: Rule[] = [];
  const names = (ids: string[]) => ids.map(id => roles.find(r => r.id === id)?.name ?? id).join(', ');
  if (area.denyRoles?.length) {
    out.push({
      id: `area_role_limits:${area.id}:deny`, never: true, setBy,
      text: `${names(area.denyRoles)} may never act in ${area.name}.`,
      who: area.denyRoles, does: '*', where: area.id, then: { answer: 'deny' },
      reason: `${names(area.denyRoles)} may never act in ${area.name}.`,
      source: { kind: 'declaration', ref: `area:${area.id}.denyRoles` },
    });
  }
  if (area.allowRoles) {
    const others = roles.map(r => r.id).filter(id => !area.allowRoles!.includes(id));
    if (others.length) {
      out.push({
        id: `area_role_limits:${area.id}`, never: true, setBy,
        text: `${area.name} is limited to: ${area.allowRoles.join(', ')}.`,
        who: others, does: '*', where: area.id,
        then: { answer: 'deny' },
        reason: `${area.name} is limited to: ${area.allowRoles.join(', ')}.`,
        source: { kind: 'declaration', ref: `area:${area.id}.allowRoles` },
      });
    }
  }
  return out;
}

/** Area declarations are the site's own: the authority named "site-manager" if declared, else the lowest. */
export function declarationAuthority(authorities: AuthorityDef[]): string {
  return authorities.find(a => a.id === 'site-manager')?.id ?? authorities[authorities.length - 1].id;
}

// ─── Copying and freezing ────────────────────────────────────────────────────

/** Deep copy of plain data (objects, arrays, primitives). */
export function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (v !== undefined) out[k] = clone(v);
    return out as T;
  }
  return value;
}

/** Freeze an object and everything inside it — including inside parts that were already frozen (a frozen parent says nothing about its children). */
export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v, seen);
  }
  return value;
}

export { fingerprint, canonicalJson } from './canonical';
