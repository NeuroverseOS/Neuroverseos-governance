/**
 * Conflict check — which rules are at odds?
 *
 * Every selector resolves to a finite set of declared IDs, and every `when`
 * condition maps to an exact set over one fact (see vocabulary.ts). Facts
 * are independent, so the set of requests matching a rule is a product of
 * per-fact sets, and the overlap of two rules is the product of the per-fact
 * intersections. Intersection, emptiness and subset are exact for every
 * shape, so the analysis is complete for the rule language: for any two rules
 * the check says, exactly,
 *
 *   disjoint  — no request can match both (different roles, actions, areas,
 *               or conditions on one fact that can never both hold). No finding.
 *   certain   — they can meet, and `witness` is a concrete request that
 *               matches both (the smallest or earliest value in every
 *               overlap, so it is the same every time).
 *   possible  — only when a rule has history conditions, which depend on
 *               what the caller supplies and are not analysed: the overlap
 *               on facts is real, the history is unknown, and no witness is given.
 *
 * Only requests a lawful request can reach count: the role must list the
 * action (else the role check refuses first) and no unconditional never rule
 * other than the pair may cover the triple (else it refuses first).
 *
 * No enumeration over facts is needed and no size bound applies: minutes are a 1440-bit
 * set, integers are closed intervals with excluded points, reals are
 * intervals, finite types are subsets, strings are "all but a finite set".
 * The seeded tests in test/ attack both directions (a disjoint claim with
 * generated requests; a witness by evaluating it), and test/z3-crosscheck
 * agrees with an SMT solver on every generated pair.
 *
 * Authority: every rule says who set it. A lower authority may only tighten
 * a higher one. A looser rule set by a lower authority never takes effect
 * where a stricter higher-authority rule applies — strictest-wins already
 * guarantees that at decision time; this check names it (`authority-override`).
 */

import type { Condition, FactValue, Finding, Outcome, PlanRule, Rule, Rulebook, Witness } from './types';
import {
  DomainRulesError, authorityName, authorityRank, constraintOn, describeConstraint, intersect, isEmpty, isSubset,
  resolveSelector, sampleValue, selectorEntries, universeConstraint, vocabularyOf, witnessValue, type Constraint, type SelectorKind, type Vocabulary,
} from './vocabulary';
import { assemble, type CompileDomainInput } from './compile';
import { isLegacyInput, fromLegacyInput, type LegacyCompileInput } from './legacy';
import { RULEBOOK_FORMAT, rulebookVersionProblem } from './version';

type Body = Omit<Rulebook, 'fingerprint' | 'findings'> & Partial<Pick<Rulebook, 'fingerprint' | 'findings'>>;

/** Run the conflict check on an input (compiles the vocabulary first) or on a compiled rulebook. A compiled rulebook of another format is refused by name (DomainRulesError). */
export function checkRulebook(input: CompileDomainInput | LegacyCompileInput | Rulebook): Finding[] {
  if (input && typeof input === 'object' && 'format' in input && input.format !== RULEBOOK_FORMAT) throw new DomainRulesError(rulebookVersionProblem(input)!);
  const body: Body = 'format' in input && input.format === RULEBOOK_FORMAT
    ? input
    : assemble(isLegacyInput(input) ? fromLegacyInput(input) : (input as CompileDomainInput));
  const vocab = vocabularyOf(body);
  const scopes = body.rules.map(r => scopeOf(r, vocab));
  const site = siteOf(vocab, body.rules, scopes);
  const findings: Finding[] = [];
  for (let i = 0; i < body.rules.length; i++) {
    const f = unmatchedSelector(body.rules[i], scopes[i], vocab);
    if (f) findings.push(f);
  }
  for (let i = 0; i < body.rules.length; i++) {
    if (scopes[i].empty) continue;
    for (let j = i + 1; j < body.rules.length; j++) {
      if (scopes[j].empty) continue;
      const f = comparePair(body.rules[i], scopes[i], body.rules[j], scopes[j], vocab, site);
      if (f) findings.push(f);
    }
  }
  findings.push(...checkPlanRules(body.planRules ?? [], vocab));
  return findings;
}

/**
 * Can these two rules match one request? Exact: returns a witness request
 * when they can, null when they provably cannot. `certainty` is 'possible'
 * only when a rule has history conditions (not analysed); then the witness
 * covers the facts and the history is left to the caller.
 */
export function rulesOverlap(rulebook: Rulebook, ruleIdA: string, ruleIdB: string): { witness: Witness; certainty: 'certain' | 'possible' } | null {
  const vocab = vocabularyOf(rulebook);
  const a = rulebook.rules.find(r => r.id === ruleIdA), b = rulebook.rules.find(r => r.id === ruleIdB);
  if (!a || !b) return null;
  const scopes = rulebook.rules.map(r => scopeOf(r, vocab));
  const sa = scopes[rulebook.rules.indexOf(a)], sb = scopes[rulebook.rules.indexOf(b)];
  if (sa.empty || sb.empty) return null;
  const o = overlapOf(a, sa, b, sb, vocab, siteOf(vocab, rulebook.rules, scopes));
  return o ? { witness: o.witness, certainty: o.certainty } : null;
}

// ─── The site, computed once per check: declaration order, who lists what, and the unconditional never rules ─────

interface Site {
  roles: string[]; actions: string[]; areas: string[];
  /** role ID → the set of actions it lists. */
  lists: Map<string, Set<string>>;
  /** The unconditional never rules: every request in their scope is refused before any other rule is weighed. */
  blockers: Array<{ id: string; scope: Scope }>;
  /** Per (role, action), the areas some blocker covers — computed once and reused by every pair that is not itself a blocker. Equal sets share one instance. */
  blocked: Map<string, Set<string>>;
  interned: Map<string, Set<string>>;
}

function siteOf(vocab: Vocabulary, rules: Rule[], scopes: Scope[]): Site {
  return {
    roles: [...vocab.roles.keys()], actions: [...vocab.actions.keys()], areas: [...vocab.areas.keys()],
    lists: new Map([...vocab.roles.values()].map(r => [r.id, new Set(r.actions)])),
    blockers: rules.map((r, i) => ({ r, scope: scopes[i] })).filter(({ r, scope }) => r.never && !scope.history && !scope.empty && unconditional(scope, vocab)).map(({ r, scope }) => ({ id: r.id, scope })),
    blocked: new Map(),
    interned: new Map(),
  };
}

/** The areas the given blockers cover for this role and action (empty when none touches the pair). */
function blockedAreas(blockers: Site['blockers'], roleId: string, action: string): Set<string> {
  const out = new Set<string>();
  for (const b of blockers) if (b.scope.roles.has(roleId) && b.scope.actions.has(action)) for (const z of b.scope.areas) out.add(z);
  return out;
}

/** Do the rule's conditions hold for every value — no `when`, or every condition covers its fact's whole universe (`people >= 0` on a fact with min 0, `in` every enum value)? */
function unconditional(scope: Scope, vocab: Vocabulary): boolean {
  return scope.facts.every(f => isSubset(universeConstraint(vocab.facts.get(f)!), constraintOf(scope, f, vocab)));
}

// ─── A selector that matches nothing: the rule binds less than it reads ──────

/**
 * A positive entry (a tag, a kind, an ID) that expands to nothing declared,
 * or a whole selector that resolves to the empty set, is a warning on that
 * rule alone: validation passes (the tag may be declared by a template, or
 * an exclusion may empty the set), but nothing is bound and the author
 * almost certainly meant something. Tags match exactly, case included; a
 * tag that matches only when case is ignored is named as the likely intent.
 */
function unmatchedSelector(r: Rule, scope: Scope, vocab: Vocabulary): Finding | null {
  const notes: string[] = [];
  const kinds: Array<[SelectorKind, Rule['who'], Set<string>]> = [['who', r.who, scope.roles], ['does', r.does, scope.actions], ['where', r.where, scope.areas]];
  for (const [kind, sel, resolved] of kinds) {
    const noun = kind === 'who' ? 'role' : kind === 'does' ? 'action' : 'area';
    const things: Array<{ id: string; name?: string; tags?: string[] }> = kind === 'who' ? [...vocab.roles.values()] : kind === 'does' ? [...vocab.actions.values()] : [...vocab.areas.values()];
    for (const raw of selectorEntries(sel)) {
      const e = raw.startsWith('!') ? raw.slice(1) : raw;
      if (e === '*') continue;
      if (e.startsWith('tag:')) {
        const tag = e.slice(4);
        if (things.some(t => t.tags?.includes(tag))) continue;
        const near = things.filter(t => t.tags?.some(x => x.toLowerCase() === tag.toLowerCase()));
        const hint = near.length ? ` — tags match exactly, case included; ${near.map(t => `${t.name ?? t.id} carries "${t.tags!.find(x => x.toLowerCase() === tag.toLowerCase())}"`).join(', ')}` : '';
        notes.push(`${kind} names ${noun} tag "${tag}", which no ${noun} carries${hint}`);
      } else if (e.startsWith('kind:')) {
        const k = e.slice(5);
        const any = kind === 'who' ? [...vocab.roles.values()].some(t => t.kind === k) : kind === 'does' ? [...vocab.actions.values()].some(t => t.kinds.includes(k)) : false;
        if (!any) notes.push(`${kind} names kind "${k}", which no ${noun} has`);
      }
    }
    if (resolved.size === 0 && !notes.some(n => n.startsWith(kind))) notes.push(`${kind} resolves to no ${noun} at all`);
  }
  if (!notes.length) return null;
  const binds = scope.empty ? 'The rule binds nothing and never takes effect.' : 'The rule binds less than it reads.';
  return { kind: 'unmatched_selector', severity: 'warning', ruleIds: [r.id], certainty: 'certain', message: `\`${r.id}\` (set by ${authorityName(vocab, r.setBy)}): ${notes.join('; ')}. ${binds}` };
}

// ─── Scope ───────────────────────────────────────────────────────────────────

interface Scope {
  roles: Set<string>;
  actions: Set<string>;
  areas: Set<string>;
  when: Condition[];
  facts: string[];
  /** The rule conditions on history, which the analysis does not model. */
  history: boolean;
  empty: boolean;
  /** The constraint on each fact, computed once. */
  constraints: Map<string, Constraint>;
}

function scopeOf(r: Rule, vocab: Vocabulary): Scope {
  const roles = resolveSelector(r.who, 'who', vocab);
  const actions = resolveSelector(r.does, 'does', vocab);
  const areas = resolveSelector(r.where, 'where', vocab);
  const when = r.when ?? [];
  return { roles, actions, areas, when, facts: [...new Set(when.map(c => c.fact))], history: (r.history?.length ?? 0) > 0, empty: roles.size === 0 || actions.size === 0 || areas.size === 0, constraints: new Map() };
}

/** The scope's constraint on a fact (the universe when the rule does not name it), cached on the scope. */
function constraintOf(s: Scope, fact: string, vocab: Vocabulary): Constraint {
  let c = s.constraints.get(fact);
  if (!c) { c = constraintOn(s.when, fact, vocab); s.constraints.set(fact, c); }
  return c;
}

const sub = (a: Set<string>, b: Set<string>) => [...a].every(x => b.has(x));
const meet = (a: Set<string>, b: Set<string>) => new Set([...a].filter(x => b.has(x)));

/** Does every request matching `a`'s conditions also match `b`'s? */
function implies(a: Scope, b: Scope, vocab: Vocabulary): boolean {
  return b.facts.every(f => isSubset(constraintOf(a, f, vocab), constraintOf(b, f, vocab)));
}

function scopeCovered(a: Scope, b: Scope, vocab: Vocabulary): boolean {
  return sub(a.roles, b.roles) && sub(a.actions, b.actions) && sub(a.areas, b.areas) && implies(a, b, vocab);
}

interface Overlap {
  roles: Set<string>; actions: Set<string>; areas: Set<string>;
  /** Facts either rule conditions on, with the combined constraint. */
  shared: string[];
  certainty: 'certain' | 'possible';
  witness: Witness;
}

/**
 * Exact overlap: the roles, actions and areas both rules cover, and for every
 * fact either rule names, the intersection of their constraints. Non-empty
 * everywhere means a request matching both exists, and the witness is built
 * from the first ID (in declaration order) and the smallest value of each
 * overlap, with every other fact the request needs at a sample value.
 */
function overlapOf(ra: Rule, a: Scope, rb: Rule, b: Scope, vocab: Vocabulary, site: Site): Overlap | null {
  const roles0 = meet(a.roles, b.roles), actions0 = meet(a.actions, b.actions), areas0 = meet(a.areas, b.areas);
  if (!roles0.size || !actions0.size || !areas0.size) return null;
  // The facts first: a disjoint condition ends it before any triple is enumerated.
  const facts = [...new Set([...a.facts, ...b.facts])];
  const values: Record<string, FactValue> = {};
  for (const f of facts) {
    const def = vocab.facts.get(f)!;
    const v = witnessValue(intersect(constraintOf(a, f, vocab), constraintOf(b, f, vocab)), def);
    if (v === undefined) return null;
    values[f] = v;
  }
  // Only triples a lawful request can reach count; the first in declaration order is the witness. The
  // enumeration runs over the intersection in declaration order, (role, action) first since the role's
  // action list prunes most pairs, then the areas no other unconditional never rule covers for that pair.
  // The blockers other than the pair itself. When neither rule is a blocker (nearly always) the site's cache of covered areas per (role, action) serves every pair.
  const pairIsBlocker = site.blockers.some(x => x.id === ra.id || x.id === rb.id);
  const others = pairIsBlocker ? site.blockers.filter(x => x.id !== ra.id && x.id !== rb.id) : site.blockers;
  const coveredFor = (roleId: string, action: string): Set<string> => {
    if (pairIsBlocker) return blockedAreas(others, roleId, action);
    const key = `${roleId}\u0000${action}`;
    let c = site.blocked.get(key);
    if (!c) {
      c = blockedAreas(others, roleId, action);
      const content = [...c].sort().join('\u0000');
      c = site.interned.get(content) ?? (site.interned.set(content, c), c);
      site.blocked.set(key, c);
    }
    return c;
  };
  const roles = new Set<string>(), actions = new Set<string>(), areas = new Set<string>();
  let firstTriple: [string, string, string] | null = null, everyArea = false;
  const distinct = new Set<Set<string>>();
  const roleList = site.roles.filter(r => roles0.has(r)), actionList = site.actions.filter(x => actions0.has(x)), areaList = site.areas.filter(z => areas0.has(z));
  for (const roleId of roleList) {
    const lists = site.lists.get(roleId)!;
    for (const action of actionList) {
      if (!lists.has(action)) continue;
      const covered = coveredFor(roleId, action);
      if (!covered.size) {
        // No never rule touches this pair: every area in the overlap is reachable, no enumeration needed.
        roles.add(roleId); actions.add(action); everyArea = true;
        firstTriple ??= [roleId, action, areaList[0]];
        continue;
      }
      // Reachable iff some area of the overlap is not covered; the first such area, in declaration order, is the witness's.
      let hit: string | null = null;
      for (const areaId of areaList) if (!covered.has(areaId)) { hit = areaId; break; }
      if (hit === null) continue;
      roles.add(roleId); actions.add(action); distinct.add(covered);
      firstTriple ??= [roleId, action, hit];
    }
  }
  if (!firstTriple) return null;
  // The reachable areas (for the message): every area when some pair is uncovered, else the union over the distinct covered sets of what they leave.
  if (everyArea) for (const z of areaList) areas.add(z);
  else for (const covered of distinct) for (const z of areaList) if (!covered.has(z)) areas.add(z);
  const [roleId, action, areaId] = firstTriple;
  const role = vocab.roles.get(roleId)!;
  const witnessFacts: Record<string, FactValue> = {};
  for (const def of vocab.facts.values()) {
    if (def.id in values) continue;
    if (def.required || vocab.actions.get(action)?.requires?.includes(def.id)) witnessFacts[def.id] = sampleValue(def);
  }
  Object.assign(witnessFacts, values);
  const witness: Witness = { participant: { id: `${roleId}-1`, kind: role.kind, roleId }, action, areaId, facts: witnessFacts };
  return { roles, actions, areas, shared: facts, certainty: a.history || b.history ? 'possible' : 'certain', witness };
}

/** The first of `ids` in declaration order. */
function first(ids: Set<string>, order: Iterable<string>): string {
  for (const id of order) if (ids.has(id)) return id;
  return [...ids][0];
}

// ─── Comparing outcomes ──────────────────────────────────────────────────────

/** Higher is stricter. Limits compare by value within one limit name (see `looser`). */
function rank(r: Rule): number {
  const t = r.then;
  if (t.answer === 'deny') return 4;
  if (t.answer === 'wait') return t.for === 'condition' ? 3 : 2;
  if (t.answer === 'limit') return 1;
  return 0;
}

function sameAnswer(a: Outcome, b: Outcome): boolean {
  if (a.answer !== b.answer) return false;
  if (a.answer === 'wait' && b.answer === 'wait') return a.for === b.for && a.by === b.by;
  if (a.answer === 'limit' && b.answer === 'limit') {
    const ka = Object.keys(a.limits).sort(), kb = Object.keys(b.limits).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a.limits[k] === b.limits[k]);
  }
  return true;
}

/**
 * Which of the two is looser? Returns [looser, stricter, limit names] or
 * null when they are not comparable (two limits on different names both
 * apply). Two limit rules are compared on EVERY limit name they share: the
 * names where they differ are returned, and `mixed` says each is looser on
 * some of them (neither loosens the other outright).
 */
function looser(a: Rule, b: Rule): [Rule, Rule, string[], boolean] | null {
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra < rb ? [a, b, [], false] : [b, a, [], false];
  if (a.then.answer === 'limit' && b.then.answer === 'limit') {
    const la = a.then.limits, lb = b.then.limits;
    const differing = Object.keys(la).filter(k => k in lb && la[k] !== lb[k]);
    if (!differing.length) return null;
    const aLooser = differing.filter(k => la[k] > lb[k]);
    if (aLooser.length === differing.length) return [a, b, differing, false];
    if (aLooser.length === 0) return [b, a, differing, false];
    return [a, b, differing, true];
  }
  if (a.then.answer === 'wait' && b.then.answer === 'wait' && a.then.for === 'approval' && b.then.for === 'approval' && a.then.by !== b.then.by) {
    // An approval wait with no named approver is looser than one that names who must approve.
    if (!a.then.by) return [a, b, [], false];
    if (!b.then.by) return [b, a, [], false];
  }
  return null;
}

function comparePair(a: Rule, sa: Scope, b: Rule, sb: Scope, vocab: Vocabulary, site: Site): Finding | null {
  const overlap = overlapOf(a, sa, b, sb, vocab, site);
  if (!overlap) return null;
  const where = describeOverlap(overlap, sa, sb, vocab);
  const aInB = scopeCovered(sa, sb, vocab), bInA = scopeCovered(sb, sa, vocab);
  const by = (r: Rule) => `set by ${authorityName(vocab, r.setBy)}`;
  const idOf = (r: Rule) => `\`${r.id}\``;

  if (sameAnswer(a.then, b.then)) {
    // A never rule is an invariant kept for its own sake; it is never "redundant" with an ordinary rule.
    if (!!a.never !== !!b.never) return null;
    if (aInB && bInA) return finding('duplicate', 'info', [a.id, b.id], overlap, `${idOf(a)} (${by(a)}) and ${idOf(b)} (${by(b)}) cover the same ground and say the same thing (${say(a)}): ${where}. One of them can go.`);
    if (aInB) return finding('duplicate', 'info', [a.id, b.id], overlap, `${idOf(a)} (${by(a)}) is already covered by ${idOf(b)} (${by(b)}), which says the same thing (${say(a)}) for ${where}. ${idOf(a)} adds nothing.`);
    if (bInA) return finding('duplicate', 'info', [b.id, a.id], overlap, `${idOf(b)} (${by(b)}) is already covered by ${idOf(a)} (${by(a)}), which says the same thing (${say(b)}) for ${where}. ${idOf(b)} adds nothing.`);
    return null;
  }

  const pair = looser(a, b);
  if (!pair) return null;
  const [L, S, limitNames, mixed] = pair;
  const sL = L === a ? sa : sb, sS = S === a ? sa : sb;
  const covered = scopeCovered(sL, sS, vocab);   // L never takes effect anywhere
  const refines = scopeCovered(sS, sL, vocab);   // S is a stricter special case of L: normal layering
  const extent = covered ? `${idOf(L)} never takes effect at all` : `${idOf(L)} never takes effect there`;
  const rL = authorityRank(vocab, L.setBy), rS = authorityRank(vocab, S.setBy);
  const ids = [L.id, S.id];
  const both = `${idOf(L)} (${by(L)}) says ${say(L, limitNames)}; ${idOf(S)} (${by(S)}) says ${say(S, limitNames)}`;
  const scope = `Both apply to ${where}`;

  if (mixed) {
    // Each is looser on some shared limit and stricter on another: neither overrides the other; the lower value of each applies.
    return finding('limit_disagreement', 'info', ids, overlap, `${both}. ${scope}. Each is tighter on a different limit, so the lower value of each limit applies where both match.`);
  }
  // Only an allow, or a looser value on the same limit, can try to LOOSEN. Any other pair
  // (deny vs wait, wait vs limit, ...) is one restriction layered on another: normal.
  const loosens = L.then.answer === 'allow' || limitNames.length > 0;
  if (!loosens) {
    if (covered) return finding('shadowed', 'warning', ids, overlap, `${idOf(L)} (${by(L)}) is fully covered by the stricter ${idOf(S)} (${by(S)}): ${both}. ${idOf(L)} can never change a decision.`);
    return null;
  }
  if (S.never && L.then.answer === 'allow') {
    return finding('never_vs_rule', 'conflict', ids, overlap, `${idOf(L)} (${by(L)}) tries to allow what the never rule ${idOf(S)} (${by(S)}) forbids. ${scope}. Nothing overrides a never rule, so ${extent}.`);
  }
  if (rL > rS) {
    return finding('authority-override', 'conflict', ids, overlap, `${idOf(L)} ${by(L)} tries to loosen what ${idOf(S)} ${by(S)} sets: ${both}. ${scope}. A lower authority can only tighten, so ${extent}.`);
  }
  if (rL < rS) {
    return finding('tightening', 'info', ids, overlap, `${idOf(S)} ${by(S)} tightens ${idOf(L)} ${by(L)}: ${both}. ${scope}. A lower authority may tighten, so this is fine; ${extent}.`);
  }
  // Same authority.
  if (L.then.answer === 'allow') {
    const severity = S.then.answer === 'deny' ? 'conflict' : 'warning';
    return finding('contradiction', severity, ids, overlap, `${both}. ${scope}. The strictest answer wins, so ${extent}.`);
  }
  if (covered) {
    return finding('shadowed', 'warning', ids, overlap, `${idOf(L)} (${by(L)}) is fully covered by the stricter ${idOf(S)} (${by(S)}): ${both}. ${idOf(L)} can never change a decision.`);
  }
  if (refines) return null;
  const lL = (L.then as { limits: Record<string, number> }).limits, lS = (S.then as { limits: Record<string, number> }).limits;
  return finding('limit_disagreement', 'info', ids, overlap, `${idOf(L)} (${by(L)}) and ${idOf(S)} (${by(S)}) both limit ${limitNames.join(', ')} for ${where}: ${limitNames.map(n => `${n} ${lL[n]} and ${lS[n]}`).join('; ')}. The lower value applies where both match.`);
}

function finding(kind: Finding['kind'], severity: Finding['severity'], ruleIds: string[], overlap: Pick<Overlap, 'certainty' | 'witness'>, message: string): Finding {
  if (overlap.certainty === 'possible') {
    return { kind, severity, ruleIds, certainty: 'possible', message: `${message} (Overlap is possible, not proven: a rule here conditions on history, which the analysis does not model; on the facts alone both would match ${describeWitness(overlap.witness)}.)` };
  }
  return { kind, severity, ruleIds, certainty: 'certain', witness: overlap.witness, message: `${message} For example: ${describeWitness(overlap.witness)}.` };
}

function describeWitness(w: Witness): string {
  const facts = Object.entries(w.facts).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
  return `${w.participant.roleId} does ${w.action} in ${w.areaId}${facts ? ` with ${facts}` : ''}`;
}

// ─── Plan rules ──────────────────────────────────────────────────────────────

/**
 * Plan rules can only reject, so two of them never disagree; the one thing
 * worth reporting is a plain duplicate: the same check, binding roles in
 * common. Authority does not enter: a duplicate at any level is still a duplicate.
 */
function checkPlanRules(rules: PlanRule[], vocab: Vocabulary): Finding[] {
  const out: Finding[] = [];
  const key = (r: PlanRule) => {
    const c = r.check;
    const ids = (sel: Rule['who'], kind: 'does' | 'where') => [...resolveSelector(sel, kind, vocab)].sort().join(',');
    switch (c.kind) {
      case 'ends_in': return `ends_in:${ids(c.areas, 'where')}`;
      case 'ends_with': return `ends_with:${ids(c.actions, 'does')}`;
      case 'before': return `before:${ids(c.first, 'does')}>${ids(c.then, 'does')}:${c.sameArea ? 'same' : 'any'}`;
      case 'at_most': return `at_most:${ids(c.actions, 'does')}:${c.count}`;
    }
  };
  for (let i = 0; i < rules.length; i++) for (let j = i + 1; j < rules.length; j++) {
    const a = rules[i], b = rules[j];
    if (key(a) !== key(b)) continue;
    const shared = meet(resolveSelector(a.who, 'who', vocab), resolveSelector(b.who, 'who', vocab));
    if (!shared.size) continue;
    const roleId = first(shared, vocab.roles.keys());
    out.push({ kind: 'duplicate', severity: 'info', ruleIds: [a.id, b.id], certainty: 'certain', message: `Plan rules \`${a.id}\` (set by ${authorityName(vocab, a.setBy)}) and \`${b.id}\` (set by ${authorityName(vocab, b.setBy)}) make the same check for ${vocab.roles.get(roleId)?.name ?? roleId}${shared.size > 1 ? ` and ${shared.size - 1} more` : ''}. One of them can go.` });
  }
  return out;
}

// ─── Plain words ─────────────────────────────────────────────────────────────

export function say(r: Rule, limitNames: string[] = []): string {
  const t = r.then;
  switch (t.answer) {
    case 'allow': return 'allow';
    case 'deny': return r.never ? 'never (deny)' : 'deny';
    case 'wait': return t.for === 'approval' ? `wait for approval${t.by ? ` by ${t.by}` : ''}` : 'wait for the situation to change';
    case 'limit': {
      const entries = Object.entries(t.limits).filter(([k]) => !limitNames.length || limitNames.includes(k));
      return `limit ${entries.map(([k, v]) => `${k} ${v}`).join(', ')}`;
    }
  }
}

function describeOverlap(o: Overlap, a: Scope, b: Scope, vocab: Vocabulary): string {
  const names = (ids: Set<string>, all: Map<string, { id: string; name?: string }>, every: string) =>
    ids.size === all.size ? every : list([...ids].map(id => all.get(id)?.name ?? id));
  const parts = [
    names(o.roles, vocab.roles, 'every role'),
    names(o.actions, vocab.actions, 'every action'),
    names(o.areas, vocab.areas, 'everywhere'),
  ];
  const conds = o.shared.map(f => describeConstraint(intersect(constraintOf(a, f, vocab), constraintOf(b, f, vocab)), vocab.facts.get(f)!));
  return `${parts.join(' · ')}${conds.length ? `, when ${conds.join(' and ')}` : ', always'}`;
}

function list(items: string[]): string {
  return items.length <= 4 ? items.join(', ') : `${items.slice(0, 3).join(', ')} and ${items.length - 3} more`;
}
