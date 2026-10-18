/**
 * Generates the conformance cases from this (the reference) implementation.
 *
 *   npx tsx conformance/generate.ts
 *
 * Every case states its intent by hand — the status, the rule IDs and
 * authorities in the reasons, the finding kinds, or that the rulebook must be
 * rejected — and this script refuses to write a case the implementation does
 * not meet. The parts that are then filled in from the implementation (full
 * traces, fingerprints, signatures) are reviewed in the diff. The JSON files
 * are the authority; this script is their provenance.
 *
 * Test signing keys below are TEST ONLY: fixed seeds so other implementations
 * can reproduce every signature byte for byte.
 */

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  compileDomain, compileGovernance, compileMission, evaluateDomainAction, evaluatePlan, matchingRules, checkRulebook, validateRulebook, canonicalJson, fingerprint, sha256Utf8,
  publicKeyOf, signApproval, signGovernanceApproval, verifyApproval, verifyAndEvaluate, verifyAndEvaluatePlan, signRulebook, verifyRulebookSignature, backtest, compareBacktests, planDigestOf,
  type BacktestEvent, type BacktestOptions, type CompileDomainInput, type DomainRequest, type GovernanceCompileInput, type GovernancePlan, type GovernanceRequest, type GovernanceRule, type GovernanceRulebook,
  type HistoryCondition, type Mission, type Plan, type PlanRule, type Rule, type Rulebook, type TrustedKey, type SignedApproval,
} from '../src/index';
import { projectDecision, projectFindings, projectPlan } from './compare.mjs';
import { govern } from '../adapters/tool-call/index';
import { harnessFromData, type HarnessData } from '../adapters/tool-call/case-harness';
import * as grocery from '../examples/grocery-store';

const OUT = join(import.meta.dirname, '.');

// ─── Test keys (TEST ONLY) ───────────────────────────────────────────────────

const SEED_HIGH = '0001020304050607080910111213141516171819202122232425262728293031';   // TEST ONLY key for authority "high"
const SEED_LEAD = '1111111111111111111111111111111111111111111111111111111111111111';   // TEST ONLY key for role "lead"
const SEED_STRANGER = '2222222222222222222222222222222222222222222222222222222222222222'; // TEST ONLY key the rulebook does not trust
const SEED_SITE = '3333333333333333333333333333333333333333333333333333333333333333';   // TEST ONLY key that signs the rulebook itself

// ─── Base sites ──────────────────────────────────────────────────────────────

type Draft = Omit<Rule, 'source' | 'setBy'> & { setBy?: string };
const rule = (id: string, then: Rule['then'], patch: Partial<Rule> = {}): Draft => ({ id, text: id, who: '*', does: '*', where: '*', then, ...patch });

/** A small robot site: two authorities, two actions, two areas, one role, six typed facts, one limit. */
const tiny = (rules: Draft[], extra: Partial<CompileDomainInput> = {}): CompileDomainInput => ({
  site: { id: 'tiny', name: 'Tiny site' },
  authorities: [{ id: 'high' }, { id: 'low' }],
  actions: [{ id: 'go', kinds: ['robot'], tags: ['movement'] }, { id: 'look', kinds: ['robot'] }],
  facts: [
    { id: 'people', type: 'number', integer: true, min: 0, required: true },
    { id: 'load', type: 'number', min: 0, default: 0 },
    { id: 'time', type: 'time', required: true },
    { id: 'mode', type: 'enum', values: ['a', 'b', 'c'], default: 'a' },
    { id: 'alarm', type: 'boolean', default: false },
    { id: 'day', type: 'day', required: true },
    { id: 'speedAsked', type: 'number', min: 0 },
  ],
  limits: [{ id: 'speed', unit: 'm/s', requestedFact: 'speedAsked' }],
  areas: [{ id: 'floor', name: 'Floor' }, { id: 'yard', name: 'Yard', tags: ['outside'] }],
  roles: [{ id: 'bot', name: 'Bot', kind: 'robot', actions: ['go', 'look'] }],
  rules: rules.map(r => ({ setBy: 'high', ...r, source: { kind: 'manual', ref: r.id } })),
  ...extra,
});
const req = (action = 'go', areaId = 'floor', facts: Record<string, unknown> = {}, participant = { id: 'b-1', kind: 'robot', roleId: 'bot' }): DomainRequest =>
  ({ participant, action, areaId, facts: { people: 0, time: '10:00', day: 'mon', ...facts } });

/** Robots, people and an AI agent under one law. */
const shared = (rules: Draft[], extra: Partial<CompileDomainInput> = {}): CompileDomainInput => tiny(rules, {
  kinds: ['robot', 'person', 'agent'],
  actions: [{ id: 'go', kinds: ['robot'], tags: ['movement'] }, { id: 'look', kinds: ['robot', 'person', 'agent'], tags: ['sensing'] }, { id: 'plan', kinds: ['agent'] }],
  roles: [
    { id: 'bot', name: 'Bot', kind: 'robot', actions: ['go', 'look'] },
    { id: 'guard', name: 'Guard', kind: 'person', actions: ['look'], tags: ['staff'] },
    { id: 'visitor', name: 'Visitor', kind: 'person', actions: ['look'] },
    { id: 'lead', name: 'Lead', kind: 'person', actions: ['look'], tags: ['staff', 'lead'] },
    { id: 'planner', name: 'Planner', kind: 'agent', actions: ['look', 'plan'] },
  ],
  areas: [{ id: 'floor', name: 'Floor' }, { id: 'yard', name: 'Yard', tags: ['outside'] }, { id: 'office', name: 'Office', allowRoles: ['guard', 'lead'] }, { id: 'lab', name: 'Lab', denyRoles: ['planner'] }],
  ...extra,
});
const as = (kind: string, roleId: string, id = `${kind}-1`) => ({ id, kind, roleId });

// ─── Case shapes ─────────────────────────────────────────────────────────────

interface Want {
  status?: string;
  /** Plan expectations: the step statuses in order, the first violation as "ruleId@setBy#stepIndex:from", plan checks as "ruleId:status". */
  steps?: string[];
  firstViolation?: string;
  planChecks?: string[];
  /** Reasons as "ruleId" or "ruleId@setBy". */
  reasons?: string[];
  limits?: Record<string, number>;
  then?: string;
  /** Approval requests as "ruleId" or "ruleId@by". */
  asks?: string[];
  /** Approval instances used, as "ruleId:nonce" (a decision's `approvalsUsed`, or a plan's). */
  used?: string[];
  /** Findings as "kind:certainty:idA+idB". */
  findings?: string[];
  error?: true;
  /** Backtest expectations, stated by hand: totals as "ALLOW/LIMIT/PAUSE/BLOCK/missingFacts", then the lists as IDs ("ruleId:status:count", "idA+idB:count", "action:count", "fact:count", "index:status:outcome"). */
  backtest?: { totals: string; neverFired?: string[]; stalls?: string[]; conflicts?: string[]; gaps?: string[]; missing?: string[]; differences?: string[] };
  /** Comparison expectations: how many events are newly blocked, newly allowed, changed otherwise. */
  comparison?: { newlyBlocked: number; newlyAllowed: number; other: number };
  /** /1: approvals rejected, as "id:code", in order. */
  rejected?: string[];
}

interface Spec {
  id: string;
  principle: number[];
  description: string;
  base?: string;
  input?: CompileDomainInput;
  /** A rulebook given as is (for version-refusal cases: not compiled, not valid). */
  rulebook?: Record<string, unknown>;
  /** A valid compiled rulebook, mutated after the fact (for error cases). */
  tamper?: (rb: Rulebook) => void;
  request?: DomainRequest | GovernanceRequest;
  plan?: Plan | GovernancePlan;
  /** /1: a governance compile input, or a mission laid over a base. */
  govInput?: GovernanceCompileInput;
  mission?: Mission;
  /** Keys that must not appear anywhere in the decision (proves a decision never carries a signature). */
  forbidKeys?: string[];
  /** Decide through the trusted layer's entry (`verifyAndEvaluate` / `verifyAndEvaluatePlan`): signatures are verified first. */
  verified?: true;
  /** A recorded log for a backtest case; with `proposed` (or `govProposed` for /1), a comparison case. */
  events?: BacktestEvent[];
  options?: BacktestOptions;
  proposed?: CompileDomainInput;
  govProposed?: GovernanceCompileInput;
  want: Want;
}

const bases: Record<string, Rulebook | GovernanceRulebook> = {};
const files: Record<string, unknown[]> = {};
/** Cases decided through the async trusted-layer entry: filled in before the files are written. */
const pending: Promise<void>[] = [];
let count = 0;

function fail(id: string, msg: string): never {
  throw new Error(`case ${id}: ${msg}`);
}

/** The findings as compared, each witness with the reference's own matching relation on it, so a port's `matches` can be checked for soundness. */
function findingsExpectation(rulebook: Rulebook | GovernanceRulebook) {
  const got = checkRulebook(rulebook);
  return projectFindings(got).map(f => (f.witness ? { ...f, witnessMatches: matchingRules(rulebook as Rulebook, f.witness as DomainRequest) } : f));
}

function add(file: string, s: Spec) {
  let rulebook: Rulebook | GovernanceRulebook | Record<string, unknown>;
  if (s.mission) rulebook = compileMission((s.base ? bases[s.base] : compileGovernance(s.govInput!)) as GovernanceRulebook, s.mission);
  else if (s.base) rulebook = bases[s.base];
  else if (s.input) rulebook = compileDomain(s.input);
  else if (s.govInput) rulebook = compileGovernance(s.govInput);
  else if (s.rulebook) rulebook = s.rulebook;
  else fail(s.id, 'needs base, input, govInput, mission or rulebook');
  if (s.tamper) {
    const copy = JSON.parse(JSON.stringify(rulebook)) as Rulebook;
    s.tamper(copy);
    const { fingerprint: _f, findings: _findings, ...body } = copy;
    rulebook = { ...copy, fingerprint: fingerprint(body) };
  }
  const out: Record<string, unknown> = { id: s.id, principle: s.principle, description: s.description };
  if (s.base && !s.tamper && !s.mission) out.rulebookRef = `rulebooks/${s.base}.json`; else out.rulebook = rulebook;
  if (s.forbidKeys) out.forbidKeys = s.forbidKeys;
  const w = s.want;
  if (w.error) {
    const problems = validateRulebook(rulebook);
    if (!problems.length) fail(s.id, 'expected the rulebook to be rejected');
    out.client = true;
    out.expect = { error: true, note: problems[0] };
  } else if (w.findings) {
    const got = checkRulebook(rulebook as Rulebook);
    const kinds = got.map(f => `${f.kind}:${f.certainty}:${f.ruleIds.join('+')}`).sort();
    if (JSON.stringify(kinds) !== JSON.stringify([...w.findings].sort())) fail(s.id, `findings: want ${JSON.stringify(w.findings)}, got ${JSON.stringify(kinds)}`);
    for (const f of got) {
      // Every certain finding between two rules carries a witness, and the witness really matches both rules; a one-rule finding has none.
      const betweenRules = f.ruleIds.length === 2 && f.ruleIds.every(id => (rulebook as Rulebook).rules.some(r => r.id === id));
      if (f.certainty === 'certain' && betweenRules && !f.witness) fail(s.id, `finding ${f.ruleIds.join('+')} is certain but has no witness`);
      if ((f.certainty === 'possible' || !betweenRules) && f.witness) fail(s.id, `finding ${f.ruleIds.join('+')} should carry no witness`);
      if (f.witness) {
        const hit = matchingRules(rulebook as Rulebook, f.witness);
        if (!f.ruleIds.every(id => hit.includes(id))) fail(s.id, `witness of ${f.ruleIds.join('+')} matches ${JSON.stringify(hit)}: ${JSON.stringify(f.witness)}`);
      }
    }
    out.expect = { findings: findingsExpectation(rulebook as Rulebook) };
  } else if (s.events && w.backtest) {
    out.events = s.events;
    if (s.options) out.options = s.options;
    const r = backtest(rulebook as Rulebook, s.events, s.options) as ReturnType<typeof backtest>;
    const b = w.backtest;
    const totals = [r.totals.ALLOW, r.totals.LIMIT, r.totals.PAUSE, r.totals.BLOCK, r.totals.missingFacts].join('/');
    if (totals !== b.totals) fail(s.id, `backtest totals: want ${b.totals}, got ${totals}`);
    const same = (name: string, got: string[], want: string[] | undefined) => { if (JSON.stringify(got) !== JSON.stringify(want ?? [])) fail(s.id, `backtest ${name}: want ${JSON.stringify(want ?? [])}, got ${JSON.stringify(got)}`); };
    same('neverFired', r.neverFired, b.neverFired);
    same('wouldStall', r.wouldStall.map(x => `${x.ruleId}:${x.status}:${x.count}`), b.stalls);
    same('conflictsOccurred', r.conflictsOccurred.map(x => `${x.ruleIds.join('+')}:${x.count}`), b.conflicts);
    same('gaps', (r.gaps as Array<{ action?: string; tool?: string; count: number }>).map(x => `${x.tool ?? x.action}:${x.count}`), b.gaps);
    same('missingFacts', r.missingFacts.map(x => `${x.fact}:${x.count}`), b.missing);
    same('differences', r.differences.map(x => `${x.index}:${x.status}:${x.outcome}`), b.differences);
    out.expect = { backtest: JSON.parse(JSON.stringify(r)) };
  } else if (s.events && (s.proposed || s.govProposed) && w.comparison) {
    out.events = s.events;
    if (s.options) out.options = s.options;
    const proposed = s.govProposed ? compileGovernance(s.govProposed) : compileDomain(s.proposed!);
    out.proposed = proposed;
    const c = compareBacktests(backtest(rulebook as Rulebook, s.events, s.options), backtest(proposed, s.events, s.options));
    const got = { newlyBlocked: c.newlyBlocked.length, newlyAllowed: c.newlyAllowed.length, other: c.otherChanges.length };
    if (JSON.stringify(got) !== JSON.stringify(w.comparison)) fail(s.id, `comparison: want ${JSON.stringify(w.comparison)}, got ${JSON.stringify(got)}`);
    out.expect = { comparison: JSON.parse(JSON.stringify(c)) };
  } else if ('plan' in s) {
    out.plan = s.plan;
    out.client = true;
    const judge = (p: ReturnType<typeof evaluatePlan>) => {
      if (p.status !== w.status) fail(s.id, `plan status: want ${w.status}, got ${p.status}`);
      const steps = p.steps.map(x => x.decision.status);
      if (JSON.stringify(steps) !== JSON.stringify(w.steps ?? [])) fail(s.id, `plan steps: want ${JSON.stringify(w.steps)}, got ${JSON.stringify(steps)}`);
      const fv = p.firstViolation ? `${p.firstViolation.ruleId}@${p.firstViolation.setBy}#${p.firstViolation.stepIndex}:${p.firstViolation.from}` : undefined;
      if (fv !== w.firstViolation) fail(s.id, `plan firstViolation: want ${w.firstViolation}, got ${fv}`);
      const checks = p.planChecks.map(c => `${c.ruleId}:${c.status}`);
      if (JSON.stringify(checks) !== JSON.stringify(w.planChecks ?? [])) fail(s.id, `plan checks: want ${JSON.stringify(w.planChecks)}, got ${JSON.stringify(checks)}`);
      const asks = p.approvalRequests.map(a => (a.by ? `${a.ruleId}@${a.by}` : a.ruleId));
      if (JSON.stringify(asks) !== JSON.stringify(w.asks ?? [])) fail(s.id, `plan approvalRequests: want ${JSON.stringify(w.asks ?? [])}, got ${JSON.stringify(asks)}`);
      const used = p.approvalsUsed.map(a => `${a.ruleId}:${a.nonce}`);
      if (JSON.stringify(used) !== JSON.stringify(w.used ?? [])) fail(s.id, `plan approvalsUsed: want ${JSON.stringify(w.used ?? [])}, got ${JSON.stringify(used)}`);
    };
    if (s.verified) pending.push(verifyAndEvaluatePlan(rulebook as Rulebook, s.plan as unknown as Plan).then(p => { judge(p as ReturnType<typeof evaluatePlan>); out.expect = { verifiedPlan: projectPlan(p) }; }));
    else { const p = evaluatePlan(rulebook as Rulebook, s.plan as unknown as Plan); judge(p as ReturnType<typeof evaluatePlan>); out.expect = { plan: projectPlan(p) }; }
  } else {
    if (!s.request) fail(s.id, 'needs a request');
    out.request = s.request;
    out.client = true;
    const judge = (d: ReturnType<typeof evaluateDomainAction>) => {
      if (d.status !== w.status) fail(s.id, `status: want ${w.status}, got ${d.status} (${d.reasons.map(r => r.reason).join('; ')})`);
      const reasons = d.reasons.map(r => `${r.ruleId}@${r.setBy}`);
      const wantReasons = (w.reasons ?? []).map((r, i) => (r.includes('@') ? r : `${r}@${d.reasons[i]?.setBy}`));
      if (JSON.stringify(reasons) !== JSON.stringify(wantReasons)) fail(s.id, `reasons: want ${JSON.stringify(wantReasons)}, got ${JSON.stringify(reasons)}`);
      if (JSON.stringify(d.limits) !== JSON.stringify(w.limits)) fail(s.id, `limits: want ${JSON.stringify(w.limits)}, got ${JSON.stringify(d.limits)}`);
      if (d.then !== w.then) fail(s.id, `then: want ${w.then}, got ${d.then}`);
      const asks = (d.approvalRequests ?? []).map(a => (a.by ? `${a.ruleId}@${a.by}` : a.ruleId));
      if (JSON.stringify(asks) !== JSON.stringify(w.asks ?? [])) fail(s.id, `approvalRequests: want ${JSON.stringify(w.asks ?? [])}, got ${JSON.stringify(asks)}`);
      const used = (d.approvalsUsed ?? []).map(a => `${a.ruleId}:${a.nonce}`);
      if (JSON.stringify(used) !== JSON.stringify(w.used ?? [])) fail(s.id, `approvalsUsed: want ${JSON.stringify(w.used ?? [])}, got ${JSON.stringify(used)}`);
      const rejected = (d.approvalsRejected ?? []).map(r => `${r.id}:${r.code}`);
      if (JSON.stringify(rejected) !== JSON.stringify(w.rejected ?? [])) fail(s.id, `approvalsRejected: want ${JSON.stringify(w.rejected ?? [])}, got ${JSON.stringify(rejected)}`);
      if (s.forbidKeys) { const text = JSON.stringify(d); for (const k of s.forbidKeys) if (text.includes(`"${k}"`)) fail(s.id, `decision carries forbidden key ${k}`); }
    };
    if (s.verified) pending.push(verifyAndEvaluate(rulebook as Rulebook, s.request as unknown as DomainRequest).then(d => { judge(d); out.expect = { verifiedDecision: projectDecision(d) }; }));
    else { const d = evaluateDomainAction(rulebook as Rulebook, s.request as unknown as DomainRequest); judge(d); out.expect = { decision: projectDecision(d) }; }
  }
  (files[file] ??= []).push(out);
  count++;
}

// ─── Principle 1: the people of a space write its law ────────────────────────

function p1() {
  const f = 'p1-source.json';
  add(f, { id: 'p1-no-rules-no-invention', principle: [1], description: 'With no rules at all, a declared role doing a listed action is ALLOW on the role check alone: the engine adds no rule of its own.',
    input: tiny([]), request: req(), want: { status: 'ALLOW', reasons: ['role_permits_action@builtin'] } });
  add(f, { id: 'p1-rule-without-source-rejected', principle: [1], description: 'A rule with no source is not a rule: the rulebook is rejected.',
    input: tiny([rule('r', { answer: 'deny' })]), tamper: rb => { delete (rb.rules[0] as Partial<Rule>).source; }, want: { error: true } });
  add(f, { id: 'p1-rule-without-setby-rejected', principle: [1, 2], description: 'A rule that does not say who set it is rejected.',
    input: tiny([rule('r', { answer: 'deny' })]), tamper: rb => { delete (rb.rules[0] as Partial<Rule>).setBy; }, want: { error: true } });
  add(f, { id: 'p1-every-reason-cites-a-rule', principle: [1, 5], description: 'Every reason names a rule in the rulebook (or a builtin check) and the authority that set it; here the site\'s tighter limit, set by the lower authority.',
    input: tiny([rule('cap', { answer: 'limit', limits: { speed: 1 } }, { setBy: 'high' }), rule('site_cap', { answer: 'limit', limits: { speed: 0.5 } }, { setBy: 'low', where: 'yard' })]),
    request: req('go', 'yard'), want: { status: 'LIMIT', reasons: ['site_cap@low'], limits: { speed: 0.5 } } });
  add(f, { id: 'p1-rule-text-is-the-operators', principle: [1], description: 'A rule written from plain words (source.kind "text") decides exactly like any other rule.',
    input: tiny([{ ...rule('no_yard', { answer: 'deny' }, { where: 'yard' }), setBy: 'low', source: { kind: 'text', ref: 'no robots in the yard' } } as Rule]),
    request: req('go', 'yard'), want: { status: 'BLOCK', reasons: ['no_yard@low'] } });
}

// ─── Principle 2: authority is declared, layered, and only tightens ──────────

function p2() {
  const f = 'p2-authority.json';
  add(f, { id: 'p2-unknown-authority-rejected', principle: [2], description: 'A rule set by an authority the rulebook does not declare is rejected.',
    input: tiny([rule('r', { answer: 'deny' })]), tamper: rb => { rb.rules[0].setBy = 'king'; }, want: { error: true } });
  add(f, { id: 'p2-authorities-must-be-declared', principle: [2], description: 'A rulebook with no authorities is rejected: the order is written down, never inferred.',
    input: tiny([]), tamper: rb => { rb.authorities = []; }, want: { error: true } });
  const layered = tiny([rule('h_deny', { answer: 'deny' }, { setBy: 'high', does: 'look' }), rule('l_allow', { answer: 'allow' }, { setBy: 'low', does: 'look', where: 'yard' })]);
  add(f, { id: 'p2-lower-cannot-loosen-finding', principle: [2, 7], description: 'A lower authority allowing what a higher one denies is an authority-override finding (certain).',
    input: layered, want: { findings: ['authority-override:certain:l_allow+h_deny'] } });
  add(f, { id: 'p2-lower-cannot-loosen-decision', principle: [2], description: 'At decision time the higher deny wins; the lower allow is cited nowhere in the reasons.',
    input: layered, request: req('look', 'yard'), want: { status: 'BLOCK', reasons: ['h_deny@high'] } });
  const tight = tiny([rule('h_allow', { answer: 'allow' }, { setBy: 'high' }), rule('l_deny', { answer: 'deny' }, { setBy: 'low', where: 'yard' })]);
  add(f, { id: 'p2-lower-may-tighten-finding', principle: [2], description: 'A lower authority denying what a higher one allows is tightening: info only.',
    input: tight, want: { findings: ['tightening:certain:h_allow+l_deny'] } });
  add(f, { id: 'p2-lower-may-tighten-decision', principle: [2], description: 'The lower authority\'s stricter rule decides, and the decision says it was set by the lower authority.',
    input: tight, request: req('go', 'yard'), want: { status: 'BLOCK', reasons: ['l_deny@low'] } });
  const limits = tiny([rule('h_cap', { answer: 'limit', limits: { speed: 0.5 } }, { setBy: 'high' }), rule('l_cap', { answer: 'limit', limits: { speed: 1 } }, { setBy: 'low' })]);
  add(f, { id: 'p2-lower-looser-limit-finding', principle: [2, 7], description: 'A lower authority setting a looser value on the same limit is an authority-override.',
    input: limits, want: { findings: ['authority-override:certain:l_cap+h_cap'] } });
  add(f, { id: 'p2-lower-looser-limit-decision', principle: [2], description: 'The tighter (higher) limit applies; the looser rule is in the trace but not the reasons.',
    input: limits, request: req('go', 'floor', { speedAsked: 0.8 }), want: { status: 'LIMIT', reasons: ['h_cap@high'], limits: { speed: 0.5 } } });
  add(f, { id: 'p2-never-rule-beats-higher-allow', principle: [2], description: 'A never rule is an invariant whatever its authority: a higher authority\'s allow does not override it.',
    input: tiny([rule('h_allow', { answer: 'allow' }, { setBy: 'high' }), rule('inv', { answer: 'deny' }, { setBy: 'low', never: true, where: 'yard' })]),
    request: req('go', 'yard'), want: { status: 'BLOCK', reasons: ['inv@low'] } });

  const ask = tiny([rule('ask_high', { answer: 'wait', for: 'approval', by: 'high' }, { does: 'go', where: 'yard' })], { authorities: [{ id: 'top' }, { id: 'high' }, { id: 'low' }] });
  add(f, { id: 'p2-approval-needs-named-authority', principle: [2, 6], description: 'A wait for approval by "high" with no approval is PAUSE and asks for an approval by high.',
    input: ask, request: req('go', 'yard'), want: { status: 'PAUSE', reasons: ['ask_high'], asks: ['ask_high@high'] } });
  add(f, { id: 'p2-approval-by-named-authority', principle: [2, 6], description: 'An approval from someone holding exactly the named authority clears the wait.',
    input: ask, request: req('go', 'yard', { approvedBy: { id: 'ann', authority: 'high' } }), want: { status: 'ALLOW', reasons: ['role_permits_action', 'ask_high'] } });
  add(f, { id: 'p2-approval-by-higher-authority', principle: [2, 6], description: 'An approval from a higher authority than the one named also clears the wait.',
    input: ask, request: req('go', 'yard', { approvedBy: { id: 'tom', authority: 'top' } }), want: { status: 'ALLOW', reasons: ['role_permits_action', 'ask_high'] } });
  add(f, { id: 'p2-approval-by-lower-authority', principle: [2, 6], description: 'An approval from a lower authority does not clear the wait; the decision still asks.',
    input: ask, request: req('go', 'yard', { approvedBy: { id: 'bob', authority: 'low' } }), want: { status: 'PAUSE', reasons: ['ask_high'], asks: ['ask_high@high'] } });
  add(f, { id: 'p2-approval-without-authority', principle: [2, 6], description: 'A plain approval that names no authority does not clear a wait that names one.',
    input: ask, request: req('go', 'yard', { approvedBy: 'carl' }), want: { status: 'PAUSE', reasons: ['ask_high'], asks: ['ask_high@high'] } });
  add(f, { id: 'p2-approval-undeclared-authority-is-invalid', principle: [2, 4], description: 'An approval claiming an authority the rulebook does not declare is an invalid fact: BLOCK required_facts.',
    input: ask, request: req('go', 'yard', { approvedBy: { id: 'x', authority: 'king' } }), want: { status: 'BLOCK', reasons: ['required_facts@builtin'] } });
  const byRole = shared([rule('ask_lead', { answer: 'wait', for: 'approval', by: 'tag:lead' }, { does: 'go' }), rule('ask_guard', { answer: 'wait', for: 'approval', by: 'guard' }, { does: 'look', who: 'bot' })]);
  add(f, { id: 'p2-approval-by-role-tag', principle: [2, 6], description: 'A wait "by tag:lead" is cleared by an approver whose role carries that tag.',
    input: byRole, request: req('go', 'floor', { approvedBy: { id: 'lee', roleId: 'lead' } }), want: { status: 'ALLOW', reasons: ['role_permits_action', 'ask_lead'] } });
  add(f, { id: 'p2-approval-by-wrong-role', principle: [2, 6], description: 'An approver whose role is not the one named (and carries no such tag) does not clear the wait.',
    input: byRole, request: req('look', 'floor', { approvedBy: { id: 'vic', roleId: 'visitor' } }), want: { status: 'PAUSE', reasons: ['ask_guard'], asks: ['ask_guard@guard'] } });
  add(f, { id: 'p2-approval-by-role', principle: [2, 6], description: 'A wait "by guard" is cleared by an approver holding the guard role.',
    input: byRole, request: req('look', 'floor', { approvedBy: { id: 'gus', roleId: 'guard' } }), want: { status: 'ALLOW', reasons: ['role_permits_action', 'ask_guard'] } });
  // An AI agent as a declared authority: the lowest level, so it can only tighten.
  const agentRule = (id: string, then: Rule['then'], patch: Partial<Rule> = {}): Rule =>
    ({ ...rule(id, then, patch), setBy: 'agent', source: { kind: 'agent', ref: `planner-7: ${id}` } } as Rule);
  const levels = { authorities: [{ id: 'site-manager' }, { id: 'staff' }, { id: 'agent', name: 'AI agent' }] };
  const agentTightens = tiny([rule('manager_cap', { answer: 'limit', limits: { speed: 1 } }, { setBy: 'site-manager' }), agentRule('agent_cap', { answer: 'limit', limits: { speed: 0.4 } }, { where: 'yard' })], levels);
  add(f, { id: 'p2-agent-rule-tightens-takes-effect', principle: [1, 2], description: 'A rule written by an AI agent (source.kind "agent") at the agent authority level tightens the manager\'s cap and takes effect; the decision cites it as set by agent.',
    input: agentTightens, request: req('go', 'yard', { speedAsked: 0.8 }), want: { status: 'LIMIT', reasons: ['agent_cap@agent'], limits: { speed: 0.4 } } });
  add(f, { id: 'p2-agent-rule-tightens-finding', principle: [1, 2, 7], description: 'The agent\'s tighter cap is reported as tightening: information, not a conflict.',
    input: agentTightens, want: { findings: ['tightening:certain:manager_cap+agent_cap'] } });
  const agentLoosens = tiny([rule('manager_no_yard', { answer: 'deny' }, { setBy: 'site-manager', where: 'yard' }), agentRule('agent_allows_yard', { answer: 'allow' }, { where: 'yard' })], levels);
  add(f, { id: 'p2-agent-rule-loosens-finding', principle: [1, 2, 7], description: 'An agent-level rule that allows what the site manager denies is an authority-override.',
    input: agentLoosens, want: { findings: ['authority-override:certain:agent_allows_yard+manager_no_yard'] } });
  add(f, { id: 'p2-agent-rule-loosens-never-takes-effect', principle: [1, 2], description: 'At decision time the manager\'s deny wins; the agent\'s allow is never a reason.',
    input: agentLoosens, request: req('go', 'yard'), want: { status: 'BLOCK', reasons: ['manager_no_yard@site-manager'] } });
  const agentApproves = tiny([rule('ask_manager', { answer: 'wait', for: 'approval', by: 'site-manager' }, { setBy: 'site-manager', where: 'yard' })], levels);
  add(f, { id: 'p2-agent-approval-cannot-clear-manager-wait', principle: [2, 6], description: 'An approval from an agent-level approver does not clear a wait that requires the site manager.',
    input: agentApproves, request: req('go', 'yard', { approvedBy: { id: 'planner-7', authority: 'agent' } }), want: { status: 'PAUSE', reasons: ['ask_manager@site-manager'], asks: ['ask_manager@site-manager'] } });
  add(f, { id: 'p2-system-rule-source', principle: [1], description: 'A rule from another system (source.kind "system") is a rule like any other: its weight is its declared authority.',
    input: tiny([{ ...rule('policy_feed_no_yard', { answer: 'deny' }, { where: 'yard' }), setBy: 'staff', source: { kind: 'system', ref: 'policy-service' } } as Rule], levels), request: req('go', 'yard'), want: { status: 'BLOCK', reasons: ['policy_feed_no_yard@staff'] } });
  add(f, { id: 'p2-wait-by-unknown-rejected', principle: [2], description: 'A wait that names an approver the rulebook does not declare (not an authority, role or role tag) is rejected.',
    input: tiny([rule('ask', { answer: 'wait', for: 'approval', by: 'high' })]), tamper: rb => { (rb.rules[0].then as { by: string }).by = 'nobody'; }, want: { error: true } });
}

// ─── Principle 3: AI proposes; the space's rules decide ──────────────────────

function p3() {
  const f = 'p3-rules-decide.json';
  add(f, { id: 'p3-structure-not-prose', principle: [3], description: 'The engine applies the rule\'s structured `then`, never its prose: a rule whose text says "allowed" but whose answer is deny, denies.',
    input: tiny([rule('prose', { answer: 'deny' }, { text: 'Robots are allowed everywhere at any time.', reason: 'Robots are allowed everywhere at any time.' })]),
    request: req(), want: { status: 'BLOCK', reasons: ['prose@high'] } });
  add(f, { id: 'p3-same-input-same-answer', principle: [3, 5], description: 'Two requests that differ only in facts the rules do not mention get the same decision: nothing outside the rulebook and the request is consulted.',
    input: tiny([rule('night', { answer: 'deny' }, { when: [{ fact: 'time', op: 'between', from: '22:00', to: '06:00' }] })]),
    request: req('go', 'floor', { time: '23:00', people: 7, load: 3.5, mode: 'c', day: 'sun', extraneous: 'ignored' }), want: { status: 'BLOCK', reasons: ['night@high'] } });
  add(f, { id: 'p3-same-input-same-answer-b', principle: [3, 5], description: 'The counterpart of the previous case: outside the window, with the same irrelevant facts, ALLOW.',
    input: tiny([rule('night', { answer: 'deny' }, { when: [{ fact: 'time', op: 'between', from: '22:00', to: '06:00' }] })]),
    request: req('go', 'floor', { time: '06:00', people: 7, load: 3.5, mode: 'c', day: 'sun', extraneous: 'ignored' }), want: { status: 'ALLOW', reasons: ['role_permits_action'] } });
}

// ─── Principle 4: unknown means no ───────────────────────────────────────────

function p4() {
  const f = 'p4-unknown-and-missing.json';
  const base = 'tiny';
  const bad = (id: string, description: string, facts: Record<string, unknown>) =>
    add(f, { id, principle: [4], description, base, request: { ...req(), facts }, want: { status: 'BLOCK', reasons: ['required_facts@builtin'] } });
  bad('p4-missing-required-fact', 'A required fact that is absent is BLOCK required_facts, never a default and never permission.', { time: '10:00', day: 'mon' });
  bad('p4-fact-wrong-type', 'A required number given as a string is invalid: BLOCK.', { people: '2', time: '10:00', day: 'mon' });
  bad('p4-fact-not-integer', 'An integer fact given a fraction is invalid: BLOCK.', { people: 1.5, time: '10:00', day: 'mon' });
  bad('p4-fact-below-min', 'A number below its declared min is invalid: BLOCK.', { people: -1, time: '10:00', day: 'mon' });
  bad('p4-fact-null', 'null is not a value: BLOCK.', { people: null, time: '10:00', day: 'mon' });
  bad('p4-bad-time', 'A time that is not "HH:MM" 24h is invalid: BLOCK.', { people: 0, time: '9:00', day: 'mon' });
  bad('p4-bad-day', 'A day outside mon..sun is invalid: BLOCK.', { people: 0, time: '10:00', day: 'funday' });
  bad('p4-bad-enum', 'An enum value not in the declared list is invalid: BLOCK, even though the fact has a default.', { people: 0, time: '10:00', day: 'mon', mode: 'z' });
  bad('p4-bad-boolean', 'A boolean given as a string is invalid: BLOCK.', { people: 0, time: '10:00', day: 'mon', alarm: 'no' });
  bad('p4-optional-fact-invalid', 'An optional fact, when given, must still be valid: a negative speedAsked is BLOCK.', { people: 0, time: '10:00', day: 'mon', speedAsked: -1 });
  bad('p4-bad-approval-shape', 'approvedBy must be a non-empty string or an object with an id: true is invalid.', { people: 0, time: '10:00', day: 'mon', approvedBy: true });
  add(f, { id: 'p4-facts-missing-entirely', principle: [4], description: 'A request with no facts object at all is incomplete: BLOCK required_facts.',
    base, request: { participant: as('robot', 'bot'), action: 'go', areaId: 'floor' } as unknown as DomainRequest, want: { status: 'BLOCK', reasons: ['required_facts@builtin'] } });
  add(f, { id: 'p4-undeclared-area', principle: [4], description: 'An area the rulebook does not declare is BLOCK area_declared.',
    base, request: req('go', 'roof'), want: { status: 'BLOCK', reasons: ['area_declared@builtin'] } });
  add(f, { id: 'p4-undeclared-role', principle: [4], description: 'A role the rulebook does not declare is BLOCK role_declared.',
    base, request: req('go', 'floor', {}, as('robot', 'drone')), want: { status: 'BLOCK', reasons: ['role_declared@builtin'] } });
  add(f, { id: 'p4-role-kind-mismatch', principle: [4], description: 'A declared role claimed under the wrong kind is BLOCK role_declared.',
    base, request: req('go', 'floor', {}, { id: 'p', kind: 'person', roleId: 'bot' }), want: { status: 'BLOCK', reasons: ['required_facts@builtin'] } });
  add(f, { id: 'p4-undeclared-kind', principle: [4], description: 'A participant kind the rulebook does not declare is an incomplete request: BLOCK required_facts.',
    base, request: req('go', 'floor', {}, as('drone', 'bot')), want: { status: 'BLOCK', reasons: ['required_facts@builtin'] } });
  add(f, { id: 'p4-action-not-in-role', principle: [4], description: 'A declared action the role does not list is BLOCK role_permits_action.',
    input: tiny([], { roles: [{ id: 'bot', name: 'Bot', kind: 'robot', actions: ['go'] }] }), request: req('look'), want: { status: 'BLOCK', reasons: ['role_permits_action@builtin'] } });
  add(f, { id: 'p4-unknown-action-deny', principle: [4], description: 'An action the rulebook does not know, with otherwise "deny", is BLOCK unknown_action.',
    base, request: req('fly'), want: { status: 'BLOCK', reasons: ['unknown_action@builtin'] } });
  const waiting = tiny([rule('inv', { answer: 'deny' }, { never: true, when: [{ fact: 'alarm', op: '==', value: true }] })], { otherwise: 'wait-for-approval' });
  add(f, { id: 'p4-unknown-action-wait', principle: [4, 6], description: 'With otherwise "wait-for-approval", an unknown action is PAUSE unknown_action and asks for an approval (anyone).',
    input: waiting, request: req('fly'), want: { status: 'PAUSE', reasons: ['unknown_action@builtin'], asks: ['unknown_action'] } });
  add(f, { id: 'p4-unknown-action-approved', principle: [4, 6], description: 'An approved unknown action is ALLOW when no rule matches it.',
    input: waiting, request: req('fly', 'floor', { approvedBy: 'dana' }), want: { status: 'ALLOW', reasons: ['unknown_action@builtin'] } });
  add(f, { id: 'p4-approved-unknown-still-faces-never-rules', principle: [4, 8], description: 'An approved unknown action still faces every never rule.',
    input: waiting, request: req('fly', 'floor', { approvedBy: 'dana', alarm: true }), want: { status: 'BLOCK', reasons: ['inv@high'] } });
  add(f, { id: 'p4-action-requires-fact', principle: [4], description: 'A fact an action requires (`requires`) is required for that action even though it is optional elsewhere.',
    input: tiny([], { actions: [{ id: 'go', kinds: ['robot'], tags: ['movement'], requires: ['speedAsked'] }, { id: 'look', kinds: ['robot'] }] }),
    request: req('go'), want: { status: 'BLOCK', reasons: ['required_facts@builtin'] } });
  add(f, { id: 'p4-default-fills-in', principle: [4], description: 'Only a fact with a declared default is ever filled in: alarm absent means false, so the alarm rule does not match.',
    input: tiny([rule('alarm', { answer: 'deny' }, { when: [{ fact: 'alarm', op: '==', value: true }] })]), request: req(), want: { status: 'ALLOW', reasons: ['role_permits_action'] } });
  add(f, { id: 'p4-rule-on-optional-fact-rejected', principle: [4], description: 'A rule that conditions on an optional fact with no default is rejected: it could never be evaluated without guessing.',
    input: tiny([rule('r', { answer: 'deny' })]), tamper: rb => { rb.rules[0].when = [{ fact: 'speedAsked', op: '>', value: 1 }]; }, want: { error: true } });
  // 0.6 clarification (SPEC.md § 3, § 11 errata): a closed `does` whose every action requires the fact may condition on it — the fact is present whenever the rule can match.
  const requiresSpeed = tiny([rule('fast_go_denied', { answer: 'deny' }, { does: 'go', when: [{ fact: 'speedAsked', op: '>', value: 2 }] })], { actions: [{ id: 'go', kinds: ['robot'], tags: ['movement'], requires: ['speedAsked'] }, { id: 'look', kinds: ['robot'] }] });
  add(f, { id: 'p4-rule-on-action-required-fact-decides', principle: [4], description: 'CONDITION SCOPE (0.6): a rule whose closed does names only actions that require the fact may condition on it (speedAsked is required by go); with the fact present the rule decides.',
    input: requiresSpeed, request: req('go', 'floor', { speedAsked: 3 }), want: { status: 'BLOCK', reasons: ['fast_go_denied@high'] } });
  add(f, { id: 'p4-rule-on-action-required-fact-missing-refuses', principle: [4], description: 'The same rulebook without the fact: BLOCK required_facts — the fact the action requires is still never guessed.',
    input: requiresSpeed, request: req('go', 'floor'), want: { status: 'BLOCK', reasons: ['required_facts@builtin'] } });
  add(f, { id: 'p4-rule-on-action-required-fact-open-does-rejected', principle: [4], description: 'With an open does ("*") the same condition is still rejected: an open selector can match an action that does not require the fact.',
    input: requiresSpeed, tamper: rb => { rb.rules[0].does = '*'; }, want: { error: true } });
  add(f, { id: 'p4-undeclared-facts-ignored', principle: [4], description: 'Facts the rulebook does not declare are ignored, not errors.',
    base, request: req('go', 'floor', { weather: 'rain' }), want: { status: 'ALLOW', reasons: ['role_permits_action'] } });
  add(f, { id: 'p4-bad-otherwise-rejected', principle: [4], description: 'A rulebook whose `otherwise` is neither deny nor wait-for-approval is rejected.',
    input: tiny([]), tamper: rb => { (rb as { otherwise: string }).otherwise = 'allow'; }, want: { error: true } });
}

// ─── Principle 5: every decision explains itself ─────────────────────────────

function p5() {
  const f = 'p5-explains.json';
  const site = tiny([
    rule('cap', { answer: 'limit', limits: { speed: 1 } }, { does: 'go' }),
    rule('near', { answer: 'limit', limits: { speed: 0.3 } }, { does: 'go', when: [{ fact: 'people', op: '>', value: 0 }] }),
    rule('ok_look', { answer: 'allow' }, { does: 'look' }),
    rule('no_yard_night', { answer: 'deny', instead: 'dock' }, { where: 'yard', when: [{ fact: 'time', op: 'between', from: '22:00', to: '06:00' }] }),
  ]);
  add(f, { id: 'p5-trace-in-order', principle: [5], description: 'The trace lists every check that ran, in order: builtin role check first, then matching rules in rulebook order, each with its authority.',
    input: site, request: req('go', 'floor', { people: 2, speedAsked: 1 }), want: { status: 'LIMIT', reasons: ['near@high'], limits: { speed: 0.3 } } });
  add(f, { id: 'p5-reasons-are-the-strictest', principle: [5], description: 'Reasons are exactly the checks at the strictest status; with two limit rules and one at the minimum, only that one is a reason.',
    input: site, request: req('go', 'floor', { people: 0, speedAsked: 2 }), want: { status: 'LIMIT', reasons: ['cap@high'], limits: { speed: 1 } } });
  add(f, { id: 'p5-allow-within-limit-reports-limit', principle: [5, 9], description: 'A request under every limit is ALLOW and still carries the effective limits, so the controller knows the ceiling.',
    input: site, request: req('go', 'floor', { people: 0, speedAsked: 0.5 }), want: { status: 'ALLOW', reasons: ['role_permits_action', 'cap'], limits: { speed: 1 } } });
  add(f, { id: 'p5-deny-instead', principle: [5], description: 'A deny rule\'s `instead` hint is returned as `then` when the decision is BLOCK.',
    input: site, request: req('go', 'yard', { time: '23:00' }), want: { status: 'BLOCK', reasons: ['no_yard_night@high'], then: 'dock' } });
  add(f, { id: 'p5-fingerprint-is-the-rulebooks', principle: [5], description: 'The decision carries the fingerprint of the rulebook that decided it.',
    input: site, request: req('look'), want: { status: 'ALLOW', reasons: ['role_permits_action', 'ok_look'] } });
  add(f, { id: 'p5-first-block-ends-the-trace', principle: [5], description: 'A BLOCK from a builtin shape check ends the trace: nothing after it runs.',
    input: site, request: req('go', 'nowhere'), want: { status: 'BLOCK', reasons: ['area_declared@builtin'] } });
  add(f, { id: 'p5-never-rules-end-the-trace', principle: [5, 8], description: 'When a never rule matches, the trace holds the never rules that matched and nothing else.',
    input: tiny([rule('inv', { answer: 'deny' }, { never: true, where: 'yard' }), rule('cap', { answer: 'limit', limits: { speed: 1 } })]),
    request: req('go', 'yard'), want: { status: 'BLOCK', reasons: ['inv@high'] } });
}

// ─── Principle 6: waiting has two meanings ───────────────────────────────────

function p6() {
  const f = 'p6-waiting.json';
  const site = tiny([
    rule('clear', { answer: 'wait', for: 'condition' }, { does: 'go', when: [{ fact: 'people', op: '>', value: 0 }] }),
    rule('ask', { answer: 'wait', for: 'approval' }, { does: 'look' }),
    rule('ask_and_clear', { answer: 'wait', for: 'approval' }, { does: 'go', where: 'yard' }),
    rule('no_night', { answer: 'deny' }, { when: [{ fact: 'time', op: 'between', from: '22:00', to: '06:00' }] }),
  ]);
  add(f, { id: 'p6-condition-wait', principle: [6], description: 'A condition wait is PAUSE and carries no approval request: no signature can clear it.',
    input: site, request: req('go', 'floor', { people: 1 }), want: { status: 'PAUSE', reasons: ['clear@high'] } });
  add(f, { id: 'p6-approval-never-clears-condition', principle: [6], description: 'An approval does not clear a condition wait.',
    input: site, request: req('go', 'floor', { people: 1, approvedBy: 'dana' }), want: { status: 'PAUSE', reasons: ['clear@high'] } });
  add(f, { id: 'p6-condition-clears-by-facts', principle: [6], description: 'Only a change in the facts clears a condition wait.',
    input: site, request: req('go', 'floor', { people: 0 }), want: { status: 'ALLOW', reasons: ['role_permits_action'] } });
  add(f, { id: 'p6-approval-wait-asks', principle: [6], description: 'An approval wait with no named approver is PAUSE and asks for an approval from anyone.',
    input: site, request: req('look'), want: { status: 'PAUSE', reasons: ['ask@high'], asks: ['ask'] } });
  add(f, { id: 'p6-approval-wait-cleared', principle: [6], description: 'A plain approval clears an approval wait that names nobody in particular.',
    input: site, request: req('look', 'floor', { approvedBy: 'dana' }), want: { status: 'ALLOW', reasons: ['role_permits_action', 'ask'] } });
  add(f, { id: 'p6-both-waits-approval-given', principle: [6], description: 'With an approval wait cleared and a condition wait open, the decision is PAUSE for the condition alone, with no approval request.',
    input: site, request: req('go', 'yard', { people: 1, approvedBy: 'dana' }), want: { status: 'PAUSE', reasons: ['clear@high'] } });
  add(f, { id: 'p6-both-waits-nothing-given', principle: [6], description: 'With both waits open the decision is PAUSE for both, and asks only for the approval.',
    input: site, request: req('go', 'yard', { people: 1 }), want: { status: 'PAUSE', reasons: ['clear@high', 'ask_and_clear@high'], asks: ['ask_and_clear'] } });
  add(f, { id: 'p6-deny-beats-wait', principle: [6], description: 'Strictest wins: a deny alongside a wait is BLOCK, and nothing is asked for.',
    input: site, request: req('look', 'floor', { time: '23:00' }), want: { status: 'BLOCK', reasons: ['no_night@high'] } });
}

// ─── Principle 7: conflicts are surfaced ─────────────────────────────────────

function p7() {
  const f = 'p7-conflicts.json';
  const pair = (id: string, description: string, rules: Draft[], findings: string[], extra: Partial<CompileDomainInput> = {}) =>
    add(f, { id, principle: [7], description, input: tiny(rules, extra), want: { findings } });
  pair('p7-contradiction-certain', 'An allow and a deny at the same authority where every request matching one matches the other: a certain contradiction.',
    [rule('yes', { answer: 'allow' }), rule('no', { answer: 'deny' }, { where: 'yard' })], ['contradiction:certain:yes+no']);
  pair('p7-contradiction-partial-overlap', 'Conditions on two independent facts (people == 0, load > 0) can both hold: the analysis is exact, so the contradiction is certain, with a witness request that matches both.',
    [rule('yes', { answer: 'allow' }, { when: [{ fact: 'people', op: '==', value: 0 }] }), rule('wait', { answer: 'wait', for: 'condition' }, { when: [{ fact: 'load', op: '>', value: 0 }] })], ['contradiction:certain:yes+wait']);
  pair('p7-shadowed', 'A looser rule fully covered by a stricter one at the same authority can never change a decision: shadowed.',
    [rule('big', { answer: 'deny' }), rule('small', { answer: 'wait', for: 'approval' }, { where: 'yard', when: [{ fact: 'people', op: '>', value: 2 }] })], ['shadowed:certain:small+big']);
  pair('p7-duplicate-same-scope', 'Two rules with the same scope and the same answer: duplicate.',
    [rule('a', { answer: 'deny' }, { does: 'look' }), rule('b', { answer: 'deny' }, { does: 'look' })], ['duplicate:certain:a+b']);
  pair('p7-duplicate-covered', 'A rule whose scope lies inside another with the same answer adds nothing: duplicate, narrower rule first.',
    [rule('a', { answer: 'deny' }), rule('b', { answer: 'deny' }, { does: 'look', where: 'yard' })], ['duplicate:certain:b+a']);
  pair('p7-limit-disagreement', 'Two limits on the same name whose scopes partly overlap with different values: limit_disagreement; the lower applies where both match.',
    [rule('fast', { answer: 'limit', limits: { speed: 1 } }, { where: 'floor', when: [{ fact: 'people', op: '<', value: 5 }] }), rule('slow', { answer: 'limit', limits: { speed: 0.5 } }, { when: [{ fact: 'people', op: '>', value: 2 }] })], ['limit_disagreement:certain:fast+slow']);
  pair('p7-refinement-is-not-a-finding', 'A stricter special case of a looser limit is normal layering: no finding.',
    [rule('site', { answer: 'limit', limits: { speed: 1 } }), rule('near', { answer: 'limit', limits: { speed: 0.3 } }, { when: [{ fact: 'people', op: '>', value: 0 }] })], []);
  pair('p7-restrictions-layer', 'A deny and a condition wait that overlap are one restriction on another, not a conflict: no finding.',
    [rule('deny', { answer: 'deny' }, { where: 'yard' }), rule('wait', { answer: 'wait', for: 'condition' }, { when: [{ fact: 'people', op: '>', value: 0 }] })], []);
  pair('p7-never-vs-allow', 'A rule that tries to allow what a never rule forbids: never_vs_rule, a conflict; certain, since every request matching the never rule matches the allow.',
    [rule('inv', { answer: 'deny' }, { never: true, when: [{ fact: 'alarm', op: '==', value: true }] }), rule('ok', { answer: 'allow' }, { does: 'go' })], ['never_vs_rule:certain:ok+inv']);
  pair('p7-never-and-deny-not-duplicate', 'A never rule is kept for its own sake: an ordinary deny with the same scope is not reported as a duplicate.',
    [rule('inv', { answer: 'deny' }, { never: true }), rule('no', { answer: 'deny' })], []);
  pair('p7-approval-named-vs-unnamed', 'An approval wait naming nobody is looser than one naming an approver; fully covered, it is shadowed.',
    [rule('ask_high', { answer: 'wait', for: 'approval', by: 'high' }), rule('ask_any', { answer: 'wait', for: 'approval' }, { where: 'yard' })], ['shadowed:certain:ask_any+ask_high']);
  pair('p7-touching-boundary-overlaps', 'people <= 3 and people >= 3 share the value 3: the overlap is real, certain, and the witness carries people = 3.',
    [rule('a', { answer: 'allow' }, { when: [{ fact: 'people', op: '<=', value: 3 }] }), rule('b', { answer: 'deny' }, { when: [{ fact: 'people', op: '>=', value: 3 }] })], ['contradiction:certain:a+b']);
  pair('p7-witness-on-every-shape', 'A witness is found through every constraint shape at once: an integer range, a real range, a time window, a day set, an enum and a boolean.',
    [rule('a', { answer: 'allow' }, { when: [{ fact: 'people', op: '>', value: 2 }, { fact: 'load', op: '>=', value: 1.5 }, { fact: 'time', op: 'between', from: '22:00', to: '06:00' }, { fact: 'day', op: 'days', days: ['sat', 'sun'] }] }),
     rule('b', { answer: 'deny' }, { when: [{ fact: 'people', op: '<=', value: 4 }, { fact: 'load', op: '<', value: 3 }, { fact: 'time', op: '<', value: '08:00' }, { fact: 'day', op: '!=', value: 'sat' }, { fact: 'mode', op: 'in', values: ['b', 'c'] }, { fact: 'alarm', op: '==', value: true }] })], ['contradiction:certain:a+b']);
  pair('p7-history-rule-is-possible-without-witness', 'A rule that conditions on history is not analysed: the overlap on facts is real, the certainty is "possible", and no witness is given.',
    [rule('yes', { answer: 'allow' }), rule('too_many', { answer: 'deny' }, { does: 'look', history: [{ actions: 'look', op: '>=', value: 5 }] })], ['contradiction:possible:yes+too_many']);
  // Provable disjointness: no finding, for every shape of constraint.
  const disjoint: Array<[string, string, Rule['when'], Rule['when']]> = [
    ['p7-disjoint-number-ranges', 'people < 3 and people >= 3 can never both hold: no finding.', [{ fact: 'people', op: '<', value: 3 }], [{ fact: 'people', op: '>=', value: 3 }]],
    ['p7-disjoint-integer-gap', 'For an integer fact, > 2 and < 3 can never both hold: no finding.', [{ fact: 'people', op: '>', value: 2 }], [{ fact: 'people', op: '<', value: 3 }]],
    ['p7-disjoint-eq-ne', '!= 2 and == 2 are disjoint.', [{ fact: 'people', op: '!=', value: 2 }], [{ fact: 'people', op: '==', value: 2 }]],
    ['p7-disjoint-in-sets', 'Two disjoint `in` sets are disjoint.', [{ fact: 'people', op: 'in', values: [1, 2] }], [{ fact: 'people', op: 'in', values: [3, 4] }]],
    ['p7-disjoint-time-windows', 'A window and its exact complement (overnight) are disjoint.', [{ fact: 'time', op: 'between', from: '09:00', to: '12:00' }], [{ fact: 'time', op: 'between', from: '12:00', to: '09:00' }]],
    ['p7-disjoint-time-window-vs-compare', 'An overnight window and the daytime expressed with >= and < are disjoint.', [{ fact: 'time', op: 'between', from: '22:00', to: '06:00' }], [{ fact: 'time', op: '>=', value: '06:00' }, { fact: 'time', op: '<', value: '22:00' }]],
    ['p7-disjoint-days', 'Disjoint day sets are disjoint.', [{ fact: 'day', op: 'days', days: ['sat'] }], [{ fact: 'day', op: 'days', days: ['mon', 'tue'] }]],
    ['p7-disjoint-boolean', 'true and false are disjoint.', [{ fact: 'alarm', op: '==', value: true }], [{ fact: 'alarm', op: '==', value: false }]],
    ['p7-disjoint-enum', 'Disjoint enum sets, and != vs ==, are disjoint.', [{ fact: 'mode', op: '!=', value: 'a' }], [{ fact: 'mode', op: '==', value: 'a' }]],
    ['p7-disjoint-on-one-shared-fact', 'Two rules sharing a day but disagreeing on a count are disjoint because of the count.', [{ fact: 'day', op: 'days', days: ['sat'] }, { fact: 'people', op: '>=', value: 3 }], [{ fact: 'day', op: 'days', days: ['sat'] }, { fact: 'people', op: '<', value: 3 }]],
    ['p7-disjoint-integer-all-excluded', 'An integer range whose every whole number is excluded (1..2 minus 1 and 2) is empty: no finding.', [{ fact: 'people', op: '>=', value: 1 }, { fact: 'people', op: '<=', value: 2 }, { fact: 'people', op: '!=', value: 1 }], [{ fact: 'people', op: '!=', value: 2 }]],
  ];
  pair('p7-real-gap-is-not-empty', 'A real range is never emptied by excluded points: 1 < load < 2 and load != 1.5 still meet, and the witness avoids 1.5.',
    [rule('a', { answer: 'allow' }, { when: [{ fact: 'load', op: '>', value: 1 }, { fact: 'load', op: '<', value: 2 }] }), rule('b', { answer: 'deny' }, { when: [{ fact: 'load', op: '!=', value: 1.5 }] })], ['contradiction:certain:a+b']);
  for (const [id, description, a, b] of disjoint) pair(id, description, [rule('a', { answer: 'allow' }, { when: a }), rule('b', { answer: 'deny' }, { when: b })], []);
  pair('p7-disjoint-selectors', 'Rules on different areas never meet: no finding, whatever their answers.',
    [rule('a', { answer: 'allow' }, { where: 'floor' }), rule('b', { answer: 'deny' }, { where: 'yard' })], []);
  pair('p7-limits-compared-on-every-name', 'Two limit rules are compared on EVERY limit name they share, not just the first: equal on speed, looser on load at the lower authority is an authority-override for load.',
    [rule('company_caps', { answer: 'limit', limits: { speed: 1, load: 3 } }, { setBy: 'high' }), rule('site_caps', { answer: 'limit', limits: { speed: 1, load: 5 } }, { setBy: 'low' })], ['authority-override:certain:site_caps+company_caps'], { limits: [{ id: 'speed', unit: 'm/s', requestedFact: 'speedAsked' }, { id: 'load', unit: 'kg' }] });
  pair('p7-mixed-limits-are-a-disagreement', 'Each rule tighter on a different shared limit: neither loosens the other outright; reported as a limit_disagreement, and the lower value of each limit applies.',
    [rule('a', { answer: 'limit', limits: { speed: 2, load: 3 } }), rule('b', { answer: 'limit', limits: { speed: 1, load: 5 } })], ['limit_disagreement:certain:a+b'], { limits: [{ id: 'speed', unit: 'm/s', requestedFact: 'speedAsked' }, { id: 'load', unit: 'kg' }] });
  pair('p7-range-inside-finite-set-is-covered', 'Subset is exact for every pair of shapes: an integer range (1 <= people <= 2) lies inside the finite set {1, 2}, so the looser wait is fully covered by the deny: shadowed.',
    [rule('ask', { answer: 'wait', for: 'approval' }, { when: [{ fact: 'people', op: '>=', value: 1 }, { fact: 'people', op: '<=', value: 2 }] }), rule('no', { answer: 'deny' }, { when: [{ fact: 'people', op: 'in', values: [1, 2] }] })], ['shadowed:certain:ask+no']);
  pair('p7-unreachable-by-role-not-reported', 'Only requests a lawful request can reach count: the bot does not list "look", so two rules that clash on look only never meet (role_permits_action refuses first).',
    [rule('yes', { answer: 'allow' }, { does: 'look' }), rule('no', { answer: 'deny' }, { does: 'look' })], [], { roles: [{ id: 'bot', name: 'Bot', kind: 'robot', actions: ['go'] }] });
  pair('p7-unreachable-behind-never-rule-not-reported', 'A clash entirely inside the scope of an unconditional never rule is unreachable: the never rule refuses every such request first, so no finding; the never rule itself is still compared with the allow.',
    [rule('inv', { answer: 'deny' }, { never: true, where: 'yard' }), rule('yes', { answer: 'allow' }, { where: 'yard' }), rule('no', { answer: 'deny' }, { where: 'yard' })], ['never_vs_rule:certain:yes+inv']);
  pair('p7-always-true-never-rule-is-unconditional', 'A never rule whose conditions can never fail (people >= 0 on a fact with min 0) is unconditional for reachability: the clash behind it is unreachable, exactly as behind a never rule with no conditions (0.5.2 reported the contradiction and a witness that the never rule refuses).',
    [rule('inv', { answer: 'deny' }, { never: true, where: 'yard', when: [{ fact: 'people', op: '>=', value: 0 }] }), rule('yes', { answer: 'allow' }, { where: 'yard' }), rule('no', { answer: 'deny' }, { where: 'yard' })], ['never_vs_rule:certain:yes+inv']);
  pair('p7-unmatched-selector-is-a-finding', 'A selector entry that matches nothing declared is a warning on that rule alone, with no witness: here a rule on tag:staff-only where the only tagged area carries "Staff-only" — tags match exactly, case included, and the message names the near miss. The rule binds nothing; 0.5.2 was silent.',
    [rule('no_bots', { answer: 'deny' }, { where: 'tag:staff-only' })], ['unmatched_selector:certain:no_bots'], { areas: [{ id: 'floor', name: 'Floor' }, { id: 'yard', name: 'Aisle 5', tags: ['Staff-only'] }], tags: { areas: ['staff-only'] } });
  pair('p7-unmatched-entry-in-a-wider-selector', 'One entry of a selector matches nothing while the rest bind: still a warning (the rule binds less than it reads), and the rule is still compared with the others on what it does bind.',
    [rule('r', { answer: 'deny' }, { where: ['tag:staff-only', 'floor'] }), rule('yes', { answer: 'allow' }, { where: 'floor' })], ['unmatched_selector:certain:r', 'contradiction:certain:yes+r'], { tags: { areas: ['staff-only'] } });
  pair('p7-exclusion-that-empties-a-selector', 'A selector emptied by its own exclusions (every area removed) is a warning: the rule never takes effect.',
    [rule('r', { answer: 'deny' }, { where: ['*', '!floor', '!yard'] })], ['unmatched_selector:certain:r']);
  add(f, { id: 'p7-impossible-condition-rejected', principle: [7, 4], description: 'A rule whose own conditions can never all hold (people > 5 and people < 3) is rejected.',
    input: tiny([rule('r', { answer: 'deny' })]), tamper: rb => { rb.rules[0].when = [{ fact: 'people', op: '>', value: 5 }, { fact: 'people', op: '<', value: 3 }]; }, want: { error: true } });
  add(f, { id: 'p7-grocery-example-findings', principle: [7, 2], description: 'The shipped grocery example reports the manager\'s deliberate conflicts: a tightening, an authority-override and a same-authority contradiction.',
    base: 'grocery', want: { findings: ['tightening:certain:robot_speed+checkout_speed', 'authority-override:certain:shopper_photos_entrance+glasses_capture', 'contradiction:certain:staff_audio_back_room+no_audio_back_room_lunch'] } });
}

// ─── Principle 8: one law for everyone ───────────────────────────────────────

function p8() {
  const f = 'p8-one-law.json';
  const base = 'shared';
  add(f, { id: 'p8-same-rule-robot', principle: [8], description: 'A rule on who "*" binds a robot…',
    base, request: req('look', 'yard'), want: { status: 'BLOCK', reasons: ['no_looking_outside@high'] } });
  add(f, { id: 'p8-same-rule-person', principle: [8], description: '…a person…',
    base, request: req('look', 'yard', {}, as('person', 'visitor')), want: { status: 'BLOCK', reasons: ['no_looking_outside@high'] } });
  add(f, { id: 'p8-same-rule-agent', principle: [8], description: '…and an AI agent, through the same decision path, citing the same rule.',
    base, request: req('look', 'yard', {}, as('agent', 'planner')), want: { status: 'BLOCK', reasons: ['no_looking_outside@high'] } });
  add(f, { id: 'p8-kind-selector', principle: [8], description: 'who "kind:agent" selects every role of that kind.',
    base, request: req('plan', 'floor', {}, as('agent', 'planner')), want: { status: 'PAUSE', reasons: ['agents_plan_with_approval@high'], asks: ['agents_plan_with_approval@tag:staff'] } });
  add(f, { id: 'p8-tag-selector-excludes', principle: [8], description: 'who ["kind:person", "!tag:staff"] binds a visitor but not a staff-tagged guard.',
    base, request: req('look', 'lab', {}, as('person', 'visitor')), want: { status: 'BLOCK', reasons: ['non_staff_out_of_lab@high'] } });
  add(f, { id: 'p8-tag-selector-excludes-b', principle: [8], description: 'The staff-tagged guard passes the rule the visitor hit.',
    base, request: req('look', 'lab', {}, as('person', 'guard')), want: { status: 'ALLOW', reasons: ['role_permits_action'] } });
  add(f, { id: 'p8-area-allow-roles', principle: [8], description: 'An area limited to listed roles (compiled to a never rule area_role_limits:<area>) blocks everyone else.',
    base, request: req('look', 'office'), want: { status: 'BLOCK', reasons: ['area_role_limits:office@low'] } });
  add(f, { id: 'p8-area-deny-roles', principle: [8], description: 'An area that denies a role (never rule area_role_limits:<area>:deny) blocks that role.',
    base, request: req('look', 'lab', {}, as('agent', 'planner')), want: { status: 'BLOCK', reasons: ['area_role_limits:lab:deny@low'] } });
  add(f, { id: 'p8-person-cannot-take-robot-action', principle: [8, 4], description: 'A declared action that the person\'s role does not list is BLOCK role_permits_action: the same check, whatever the kind.',
    base, request: req('go', 'floor', {}, as('person', 'guard')), want: { status: 'BLOCK', reasons: ['role_permits_action@builtin'] } });
  add(f, { id: 'p8-role-cannot-list-foreign-action', principle: [8], description: 'A rulebook where a person role lists a robot-only action is rejected.',
    base, tamper: rb => { rb.roles.find(r => r.id === 'guard')!.actions.push('go'); }, want: { error: true } });
}

// ─── Principle 9: rules say what may happen; evidence says what is true ──────

function p9() {
  const f = 'p9-boundary.json';
  const site = tiny([
    rule('alarm_stop', { answer: 'deny' }, { never: true, when: [{ fact: 'alarm', op: '==', value: true }] }),
    rule('cap', { answer: 'limit', limits: { speed: 1 } }),
  ]);
  add(f, { id: 'p9-facts-are-trusted', principle: [9], description: 'The rulebook takes the facts as given: alarm true is an emergency whatever else is true.',
    input: site, request: req('go', 'floor', { alarm: true }), want: { status: 'BLOCK', reasons: ['alarm_stop@high'] } });
  add(f, { id: 'p9-time-is-a-fact', principle: [9], description: 'There is no clock: the only time the rulebook knows is the `time` fact in the request.',
    input: tiny([rule('night', { answer: 'deny' }, { when: [{ fact: 'time', op: 'between', from: '22:00', to: '06:00' }] })]),
    request: req('go', 'floor', { time: '03:00' }), want: { status: 'BLOCK', reasons: ['night@high'] } });
  add(f, { id: 'p9-limit-is-a-ceiling-not-control', principle: [9], description: 'A LIMIT says the ceiling; the controller enforces it. The decision does not say what speed to drive.',
    input: site, request: req('go', 'floor', { speedAsked: 1.4 }), want: { status: 'LIMIT', reasons: ['cap@high'], limits: { speed: 1 } } });
}

// ─── Plans: a whole plan on projected facts (principles 3, 4, 5) ────────────

function plans() {
  const f = 'plans.json';
  const planRule = (id: string, check: PlanRule['check'], patch: Partial<PlanRule> = {}): PlanRule => ({ id, text: id, who: '*', check, setBy: 'high', source: { kind: 'manual', ref: id }, ...patch });
  const site = (planRules: PlanRule[] = [], rules: Draft[] = []): CompileDomainInput => tiny([
    rule('no_load_in_yard', { answer: 'deny', instead: 'drop' }, { does: 'go', where: 'yard', when: [{ fact: 'loaded', op: '==', value: true }] }),
    rule('ask_before_look', { answer: 'wait', for: 'approval', by: 'high' }, { does: 'look' }),
    ...rules,
  ], {
    actions: [
      { id: 'go', kinds: ['robot'], tags: ['movement'], effects: [{ op: 'move' }] },
      { id: 'look', kinds: ['robot'] },
      { id: 'pick', kinds: ['robot'], effects: [{ op: 'set', fact: 'loaded', value: true }, { op: 'add', fact: 'people', value: 1 }] },
      { id: 'drop', kinds: ['robot'], effects: [{ op: 'set', fact: 'loaded', value: false }] },
    ],
    facts: [
      { id: 'people', type: 'number', integer: true, min: 0, max: 2, required: true },
      { id: 'load', type: 'number', min: 0, default: 0 },
      { id: 'time', type: 'time', required: true },
      { id: 'mode', type: 'enum', values: ['a', 'b', 'c'], default: 'a' },
      { id: 'alarm', type: 'boolean', default: false },
      { id: 'day', type: 'day', required: true },
      { id: 'speedAsked', type: 'number', min: 0 },
      { id: 'loaded', type: 'boolean', default: false },
    ],
    roles: [{ id: 'bot', name: 'Bot', kind: 'robot', actions: ['go', 'look', 'pick', 'drop'] }],
    ...(planRules.length ? { planRules } : {}),
  });
  const bot = { id: 'b-1', kind: 'robot', roleId: 'bot' };
  const start = { people: 0, time: '10:00', day: 'mon' };
  const ok = { approvedBy: { id: 'ann', authority: 'high' } };
  const plan = (steps: Plan['steps'], patch: Partial<Plan> = {}): Plan => ({ participant: bot, initialFacts: start, steps, ...patch });
  const shaped = site([planRule('end_in_floor', { kind: 'ends_in', areas: 'floor' }), planRule('look_before_pick', { kind: 'before', first: 'look', then: 'pick', sameArea: true }, { setBy: 'low', who: 'bot' }), planRule('one_pick', { kind: 'at_most', actions: 'pick', count: 1 }, { setBy: 'low' }), planRule('end_with_drop_or_go', { kind: 'ends_with', actions: ['drop', 'go'] })]);

  add(f, { id: 'plan-effects-project-and-first-block-rejects', principle: [3, 4, 5], description: 'Each step is decided on facts projected by the earlier steps\' declared effects: pick sets loaded, so the move to the yard is refused at step 3 by the rule, its reason, its authority and its instead hint; nothing is projected past it.',
    input: site(), plan: plan([{ action: 'look', area: 'floor', facts: ok }, { action: 'pick' }, { action: 'go', area: 'yard' }, { action: 'drop' }]),
    want: { status: 'BLOCK', steps: ['ALLOW', 'ALLOW', 'BLOCK'], firstViolation: 'no_load_in_yard@high#2:step' } });
  add(f, { id: 'plan-accepted-with-final-facts', principle: [3, 5], description: 'A plan every step of which passes is ALLOW, with the projected facts and the area it ends in.',
    input: site(), plan: plan([{ action: 'look', area: 'floor', facts: ok }, { action: 'pick' }, { action: 'drop' }, { action: 'go', area: 'yard' }, { action: 'go', area: 'floor' }]),
    want: { status: 'ALLOW', steps: ['ALLOW', 'ALLOW', 'ALLOW', 'ALLOW', 'ALLOW'] } });
  add(f, { id: 'plan-area-defaults-to-where-the-last-move-left-it', principle: [3, 4], description: 'A step without an area happens where the previous move left the participant; a step that names another area without an action that moves there is refused (plan_area_continuity) — in /2 this plan was accepted with the robot "looking in the floor" while projected in the yard.',
    input: site(), plan: plan([{ action: 'go', area: 'yard' }, { action: 'drop' }, { action: 'look', area: 'floor', facts: ok }, { action: 'drop' }]),
    want: { status: 'BLOCK', steps: ['ALLOW', 'ALLOW', 'BLOCK'], firstViolation: 'plan_area_continuity@builtin#2:step' } });
  add(f, { id: 'plan-pause-collects-approvals', principle: [6, 3], description: 'A step that waits for approval is PAUSE; the plan result lists every approval request so a planner can collect them up front, and later steps are still checked.',
    input: site(), plan: plan([{ action: 'look', area: 'floor' }, { action: 'pick' }, { action: 'drop' }]),
    want: { status: 'PAUSE', steps: ['PAUSE', 'ALLOW', 'ALLOW'], asks: ['ask_before_look@high'] } });
  add(f, { id: 'plan-rules-judge-the-whole-plan', principle: [3, 5], description: 'Plan rules: ends_in, before (same area), at_most and ends_with each name the step where the plan breaks them, with the authority that set each; the first violation is the earliest by step.',
    input: shaped, plan: plan([{ action: 'pick', area: 'floor' }, { action: 'drop' }, { action: 'look', facts: ok }, { action: 'pick' }, { action: 'drop' }, { action: 'go', area: 'yard' }, { action: 'look', facts: ok }]),
    want: { status: 'BLOCK', steps: ['ALLOW', 'ALLOW', 'ALLOW', 'ALLOW', 'ALLOW', 'ALLOW', 'ALLOW'], planChecks: ['end_in_floor:BLOCK', 'look_before_pick:BLOCK', 'one_pick:BLOCK', 'end_with_drop_or_go:BLOCK'], firstViolation: 'look_before_pick@low#0:plan' } });
  add(f, { id: 'plan-rules-pass', principle: [3], description: 'The same plan rules, satisfied: a look before the only pick in the same area, ending with a move onto the floor.',
    input: shaped, plan: plan([{ action: 'look', area: 'floor', facts: ok }, { action: 'pick' }, { action: 'drop' }, { action: 'go', area: 'yard' }, { action: 'go', area: 'floor' }]),
    want: { status: 'ALLOW', steps: ['ALLOW', 'ALLOW', 'ALLOW', 'ALLOW', 'ALLOW'], planChecks: ['end_in_floor:ALLOW', 'look_before_pick:ALLOW', 'one_pick:ALLOW', 'end_with_drop_or_go:ALLOW'] } });
  add(f, { id: 'plan-history-counts-for-before', principle: [3], description: 'What the participant did before the plan (plan.history) counts for a "before" plan rule.',
    input: shaped, plan: plan([{ action: 'pick', area: 'floor' }, { action: 'drop' }], { history: [{ action: 'look', areaId: 'floor' }] }),
    want: { status: 'ALLOW', steps: ['ALLOW', 'ALLOW'], planChecks: ['end_in_floor:ALLOW', 'look_before_pick:ALLOW', 'one_pick:ALLOW', 'end_with_drop_or_go:ALLOW'] } });
  add(f, { id: 'plan-rule-binds-by-role', principle: [8], description: 'A plan rule binds the roles its who selector names and no others: one on ["*", "!bot"] does not apply to the bot, so it is not even checked.',
    input: site([planRule('no_picks', { kind: 'at_most', actions: 'pick', count: 0 }, { who: ['*', '!bot'] })]), plan: plan([{ action: 'pick', area: 'floor' }, { action: 'drop' }]),
    want: { status: 'ALLOW', steps: ['ALLOW', 'ALLOW'] } });
  // 0.6 addition (SPEC.md § 3.5, § 11 errata): at_least, the mirror of at_most.
  add(f, { id: 'plan-rule-at-least', principle: [3, 5], description: 'AT_LEAST (0.6): a plan with fewer than count steps of the named action breaks the rule (cited at the last step); one with enough passes it.',
    input: site([planRule('must_drop', { kind: 'at_least', actions: 'drop', count: 1 })]), plan: plan([{ action: 'pick', area: 'floor' }, { action: 'pick' }]),
    want: { status: 'BLOCK', steps: ['ALLOW', 'ALLOW'], planChecks: ['must_drop:BLOCK'], firstViolation: 'must_drop@high#1:plan' } });
  add(f, { id: 'plan-rule-at-least-satisfied', principle: [3], description: 'The same rule with a drop in the plan: ALLOW.',
    input: site([planRule('must_drop', { kind: 'at_least', actions: 'drop', count: 1 })]), plan: plan([{ action: 'pick', area: 'floor' }, { action: 'drop' }]),
    want: { status: 'ALLOW', steps: ['ALLOW', 'ALLOW'], planChecks: ['must_drop:ALLOW'] } });
  add(f, { id: 'plan-projected-fact-out-of-range-is-a-refusal', principle: [4], description: 'An effect that pushes a fact outside its declared range (people max 2) is not clamped: the next step is BLOCK required_facts.',
    input: site(), plan: plan([{ action: 'look', area: 'floor', facts: ok }, { action: 'pick' }, { action: 'drop' }, { action: 'pick' }, { action: 'drop' }, { action: 'pick' }], { initialFacts: { ...start, people: 1 } }),
    want: { status: 'BLOCK', steps: ['ALLOW', 'ALLOW', 'ALLOW', 'ALLOW', 'BLOCK'], firstViolation: 'required_facts@builtin#4:step' } });
  add(f, { id: 'plan-clock-advances-per-step', principle: [9, 3], description: 'With clock, startTime and stepDurationSeconds, the named time fact advances per step (whole minutes, wrapping at midnight); there is still no clock in the engine.',
    input: site([], [rule('no_night', { answer: 'deny' }, { when: [{ fact: 'time', op: 'between', from: '22:00', to: '06:00' }] })]),
    plan: plan([{ action: 'drop', area: 'floor' }, { action: 'drop' }, { action: 'drop' }], { clock: 'time', startTime: '21:58', stepDurationSeconds: 90 }),
    want: { status: 'BLOCK', steps: ['ALLOW', 'ALLOW', 'BLOCK'], firstViolation: 'no_night@high#2:step' } });
  add(f, { id: 'plan-without-steps-is-block', principle: [4], description: 'A plan with no steps is BLOCK required_facts, never a throw and never permission.',
    input: site(), plan: plan([]), want: { status: 'BLOCK', firstViolation: 'required_facts@builtin#0:plan' } });
  add(f, { id: 'plan-first-step-needs-an-area', principle: [4], description: 'The first step must say where it is; a plan that does not is BLOCK required_facts.',
    input: site(), plan: plan([{ action: 'drop' }]), want: { status: 'BLOCK', firstViolation: 'required_facts@builtin#0:plan' } });
  add(f, { id: 'plan-unknown-clock-is-block', principle: [4], description: 'A plan naming a clock that is not a declared time fact is BLOCK required_facts.',
    input: site(), plan: plan([{ action: 'drop', area: 'floor' }], { clock: 'people', startTime: '10:00' }), want: { status: 'BLOCK', firstViolation: 'required_facts@builtin#0:plan' } });
  add(f, { id: 'plan-same-plan-same-answer', principle: [3], description: 'A plan is decided by the rulebook and the plan alone: a note on a step and facts the rules do not mention change nothing.',
    input: site(), plan: plan([{ action: 'look', area: 'floor', facts: ok, note: 'anything' }, { action: 'pick' }, { action: 'go', area: 'yard', facts: { mode: 'c', weather: 'rain' } }]),
    want: { status: 'BLOCK', steps: ['ALLOW', 'ALLOW', 'BLOCK'], firstViolation: 'no_load_in_yard@high#2:step' } });
  add(f, { id: 'plan-effect-on-unknown-fact-rejected', principle: [4], description: 'An action whose effect names a fact the site did not declare makes the rulebook invalid.',
    input: site(), tamper: rb => { rb.actions.find(a => a.id === 'pick')!.effects = [{ op: 'set', fact: 'nope', value: 1 }]; }, want: { error: true } });
  add(f, { id: 'plan-effect-wrong-type-rejected', principle: [4], description: 'An add effect on a boolean fact makes the rulebook invalid.',
    input: site(), tamper: rb => { rb.actions.find(a => a.id === 'pick')!.effects = [{ op: 'add', fact: 'loaded', value: 1 }]; }, want: { error: true } });
  add(f, { id: 'plan-rule-without-setby-rejected', principle: [1, 2], description: 'A plan rule that does not say who set it is rejected, like any rule.',
    input: shaped, tamper: rb => { delete (rb.planRules![0] as Partial<PlanRule>).setBy; }, want: { error: true } });
  add(f, { id: 'plan-rule-unknown-area-rejected', principle: [4], description: 'A plan rule naming an undeclared area is rejected.',
    input: shaped, tamper: rb => { rb.planRules![0].check = { kind: 'ends_in', areas: 'roof' }; }, want: { error: true } });
  add(f, { id: 'plan-step-area-without-move-is-refused', principle: [3, 4], description: 'A step may name another area only when its action moves the participant there: "look in the floor, look in the yard" with no move is BLOCK plan_area_continuity at the second step, by the evaluator, and nothing is projected past it.',
    input: site(), plan: plan([{ action: 'look', area: 'floor', facts: ok }, { action: 'look', area: 'yard', facts: ok }, { action: 'drop' }]),
    want: { status: 'BLOCK', steps: ['ALLOW', 'BLOCK'], firstViolation: 'plan_area_continuity@builtin#1:step' } });
  add(f, { id: 'plan-step-area-restated-is-fine', principle: [3], description: 'A step may restate the area it is already in; a moving action may name a new one.',
    input: site(), plan: plan([{ action: 'look', area: 'floor', facts: ok }, { action: 'drop', area: 'floor' }, { action: 'go', area: 'yard' }, { action: 'drop', area: 'yard' }]),
    want: { status: 'ALLOW', steps: ['ALLOW', 'ALLOW', 'ALLOW', 'ALLOW'] } });
  add(f, { id: 'plan-null-is-block', principle: [4], description: 'A plan that is not an object (null) is BLOCK required_facts, never a throw; its digest is the digest of null.',
    input: site(), plan: null as unknown as Plan, want: { status: 'BLOCK', firstViolation: 'required_facts@builtin#0:plan' } });
  add(f, { id: 'plan-clock-starts-at-the-wall-clock-of-now-west', principle: [9, 3], description: 'With clock and now but no startTime, the clock starts at the wall-clock time `now` names in its OWN offset: 21:00-05:00 is 21:00 on site, so the overnight rule does not fire (0.5.2 read 02:00 UTC and refused the step).',
    input: site([], [rule('no_night', { answer: 'deny' }, { when: [{ fact: 'time', op: 'between', from: '22:00', to: '06:00' }] })]),
    plan: plan([{ action: 'drop', area: 'floor' }], { clock: 'time', now: '2026-10-12T21:00:00-05:00' }), want: { status: 'ALLOW', steps: ['ALLOW'] } });
  add(f, { id: 'plan-clock-starts-at-the-wall-clock-of-now-east', principle: [9, 3], description: 'The counterpart: 05:00+09:00 is 05:00 on site, inside the overnight window, so the step is refused (0.5.2 read 20:00 UTC and allowed it).',
    input: site([], [rule('no_night', { answer: 'deny' }, { when: [{ fact: 'time', op: 'between', from: '22:00', to: '06:00' }] })]),
    plan: plan([{ action: 'drop', area: 'floor' }], { clock: 'time', now: '2026-10-12T05:00:00+09:00' }), want: { status: 'BLOCK', steps: ['BLOCK'], firstViolation: 'no_night@high#0:step' } });
  add(f, { id: 'plan-rule-duplicate-finding', principle: [7], description: 'Two plan rules that make the same check for roles in common are a duplicate finding (plan rules only reject, so they never disagree).',
    input: site([planRule('one_pick', { kind: 'at_most', actions: 'pick', count: 1 }), planRule('one_pick_again', { kind: 'at_most', actions: 'pick', count: 1 }, { setBy: 'low' })]), want: { findings: ['duplicate:certain:one_pick+one_pick_again'] } });
}

// ─── History: what the participant did recently (principles 4, 9) ───────────

function history() {
  const f = 'history.json';
  const site = tiny([
    rule('five_looks_an_hour', { answer: 'deny' }, { does: 'look', history: [{ actions: 'look', withinMinutes: 60, op: '>=', value: 5 }] }),
    rule('not_right_after_go', { answer: 'wait', for: 'condition' }, { does: 'look', history: [{ actions: 'go', sameArea: true, withinMinutes: 15, op: '>=', value: 1 }] }),
    rule('three_yard_visits', { answer: 'wait', for: 'approval' }, { does: 'go', where: 'yard', history: [{ actions: 'go', areas: 'yard', op: '>=', value: 3 }] }),
  ]);
  const day = '2026-10-13';
  const stamp = (minuteOfDay: number, d = day) => `${d}T${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}:00Z`;
  const looks = (n: number, from = 9 * 60) => Array.from({ length: n }, (_, i) => ({ action: 'look', areaId: 'floor', at: stamp(from + i) }));
  const at = (minuteOfDay: number, request: DomainRequest): DomainRequest => ({ ...request, now: stamp(minuteOfDay) });
  const h = (id: string, principle: number[], description: string, request: DomainRequest, want: Want) => add(f, { id, principle, description, input: site, request, want });
  h('history-under-the-count-allows', [4, 9], 'Four looks in the hour before now: the rule needs five, so ALLOW.', at(10 * 60, { ...req('look'), history: looks(4) }), { status: 'ALLOW', reasons: ['role_permits_action'] });
  h('history-at-the-count-denies', [4, 9], 'Five looks in the hour before now: the rule matches and denies.', at(10 * 60, { ...req('look'), history: looks(5) }), { status: 'BLOCK', reasons: ['five_looks_an_hour@high'] });
  h('history-outside-the-window-does-not-count', [9], 'Only entries within the window before now count: at 10:05 the 09:00 look is out, four remain, ALLOW.', at(10 * 60 + 5, { ...req('look', 'floor', { time: '10:05' }), history: looks(5) }), { status: 'ALLOW', reasons: ['role_permits_action'] });
  h('history-window-crosses-midnight', [9], 'Windows are absolute time: a go at 23:55 yesterday is eight minutes before 00:03 today, so it counts.', at(3, { ...req('look', 'floor', { time: '00:03' }), history: [{ action: 'go', areaId: 'floor', at: stamp(23 * 60 + 55, '2026-10-12') }] }), { status: 'PAUSE', reasons: ['not_right_after_go@high'] });
  h('history-yesterday-is-not-today', [9], 'The midnight case: a go at 09:50 YESTERDAY is not within 15 minutes of 10:00 today (minute-of-day arithmetic would have said it was); ALLOW.', at(10 * 60, { ...req('look', 'floor', { time: '10:00' }), history: [{ action: 'go', areaId: 'floor', at: stamp(9 * 60 + 50, '2026-10-12') }] }), { status: 'ALLOW', reasons: ['role_permits_action'] });
  h('history-today-counts', [9], 'The counterpart: the same go at 09:50 TODAY is ten minutes before 10:00 and counts.', at(10 * 60, { ...req('look', 'floor', { time: '10:00' }), history: [{ action: 'go', areaId: 'floor', at: stamp(9 * 60 + 50) }] }), { status: 'PAUSE', reasons: ['not_right_after_go@high'] });
  h('history-future-entry-does-not-count', [9], 'An entry later than now is not "recent": it does not count.', at(10 * 60, { ...req('look', 'floor', { time: '10:00' }), history: [{ action: 'go', areaId: 'floor', at: stamp(10 * 60 + 5) }] }), { status: 'ALLOW', reasons: ['role_permits_action'] });
  h('history-offset-is-applied', [9], 'A timestamp with an offset is the instant it names: 11:50+02:00 is 09:50Z, ten minutes before 10:00Z.', at(10 * 60, { ...req('look', 'floor', { time: '10:00' }), history: [{ action: 'go', areaId: 'floor', at: '2026-10-13T11:50:00+02:00' }] }), { status: 'PAUSE', reasons: ['not_right_after_go@high'] });
  h('history-same-area-only', [9], 'sameArea counts only entries in the request\'s own area: the go was in the yard, so no wait.', at(3, { ...req('look', 'floor', { time: '00:03' }), history: [{ action: 'go', areaId: 'yard', at: stamp(23 * 60 + 55, '2026-10-12') }] }), { status: 'ALLOW', reasons: ['role_permits_action'] });
  h('history-areas-selector-without-window', [9], 'A history condition without a window needs no times and no now: three earlier goes into the yard make the next one wait for approval.', { ...req('go', 'yard'), history: [{ action: 'go', areaId: 'yard' }, { action: 'go', areaId: 'yard' }, { action: 'go', areaId: 'floor' }, { action: 'go', areaId: 'yard' }] }, { status: 'PAUSE', reasons: ['three_yard_visits@high'], asks: ['three_yard_visits'] });
  h('history-missing-is-required-facts', [4], 'A rule in scope that counts history, with no history supplied, is BLOCK required_facts: the engine keeps no history and never guesses.', at(10 * 60, req('look')), { status: 'BLOCK', reasons: ['required_facts@builtin'] });
  h('history-now-missing-is-required-facts', [4, 9], 'A rule in scope with a window needs now: without it the request is BLOCK required_facts (the engine has no clock).', { ...req('look'), history: looks(4) }, { status: 'BLOCK', reasons: ['required_facts@builtin'] });
  h('history-entry-without-time-is-required-facts', [4], 'When a rule in scope uses a window, an entry without "at" is incomplete: BLOCK required_facts.', at(10 * 60, { ...req('look'), history: [{ action: 'look', areaId: 'floor' }] }), { status: 'BLOCK', reasons: ['required_facts@builtin'] });
  h('history-entry-without-date-is-required-facts', [4], 'An "at" without a date ("09:45", the /2 form) is not a timestamp: BLOCK required_facts, never a guess at which day.', at(10 * 60, { ...req('look'), history: [{ action: 'look', areaId: 'floor', at: '09:45' }] }), { status: 'BLOCK', reasons: ['required_facts@builtin'] });
  h('history-malformed-entry-is-required-facts', [4], 'An entry that is not { action, areaId, at? } is invalid: BLOCK required_facts.', at(10 * 60, { ...req('look'), history: [{ action: 'look' } as unknown as { action: string; areaId: string }] }), { status: 'BLOCK', reasons: ['required_facts@builtin'] });
  h('history-not-needed-out-of-scope', [4], 'A request no history rule reaches (go on the floor) needs no history and no now at all.', req('go'), { status: 'ALLOW', reasons: ['role_permits_action'] });
  h('history-empty-list-is-history', [4], 'An empty list is a history (nothing happened): the count is zero.', at(10 * 60, { ...req('look'), history: [] }), { status: 'ALLOW', reasons: ['role_permits_action'] });
  add(f, { id: 'history-unknown-action-rejected', principle: [4], description: 'A history condition naming an undeclared action makes the rulebook invalid.',
    input: site, tamper: rb => { rb.rules[0].history = [{ actions: 'fly', op: '>=', value: 1 }]; }, want: { error: true } });
  add(f, { id: 'history-clock-rejected', principle: [4, 9], description: 'The /2 "clock" member on a history condition is rejected with a message naming the change: windows are measured back from request.now.',
    input: site, tamper: rb => { rb.rules[0].history = [{ actions: 'look', withinMinutes: 60, clock: 'time', op: '>=', value: 5 } as unknown as HistoryCondition]; }, want: { error: true } });
  add(f, { id: 'history-window-out-of-range-rejected', principle: [4], description: 'A window outside 1–1440 minutes is rejected.',
    input: site, tamper: rb => { rb.rules[0].history = [{ actions: 'look', withinMinutes: 0, op: '>=', value: 5 }]; }, want: { error: true } });
}

// ─── Backtest: what the rulebook would have decided for recorded activity ────

function backtestCases() {
  const f = 'backtest.json';
  const bot = (id: string) => ({ id, kind: 'robot', roleId: 'bot' });
  const ev = (at: string, request: DomainRequest, outcome?: BacktestEvent['outcome']): BacktestEvent => ({ at, request, ...(outcome ? { outcome } : {}) });
  const at = (h: number, m: number) => `2026-10-05T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  /** A request at a time of day, with the time fact matching the timestamp. */
  const ask = (h: number, m: number, action = 'go', areaId = 'floor', facts: Record<string, unknown> = {}, participant = bot('b-1')) =>
    req(action, areaId, { time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, ...facts }, participant);
  const site = tiny([
    rule('crowd_wait', { answer: 'wait', for: 'condition' }, { does: 'go', when: [{ fact: 'people', op: '>=', value: 3 }] }),
    rule('yard_closed_at_night', { answer: 'deny' }, { where: 'yard', when: [{ fact: 'time', op: 'between', from: '20:00', to: '06:00' }] }),
    rule('slow_in_yard', { answer: 'limit', limits: { speed: 0.5 } }, { does: 'go', where: 'yard' }),
    rule('four_looks_an_hour', { answer: 'deny' }, { does: 'look', history: [{ actions: 'look', withinMinutes: 60, op: '>=', value: 3 }] }),
    rule('alarm_allows_look', { answer: 'allow' }, { does: 'look', when: [{ fact: 'alarm', op: '==', value: true }], setBy: 'low' }),
    rule('no_look_in_alarm', { answer: 'deny' }, { does: 'look', when: [{ fact: 'alarm', op: '==', value: true }] }),
    rule('never_used', { answer: 'deny' }, { does: 'go', when: [{ fact: 'mode', op: '==', value: 'c' }] }),
  ]);
  const b = (id: string, principle: number[], description: string, events: BacktestEvent[], want: Want['backtest'], options?: BacktestOptions) =>
    add(f, { id, principle, description, input: site, events, options, want: { backtest: want } });

  b('backtest-totals-and-rows', [5, 3], 'A log replayed through a rulebook gives one row per event with the decision\'s status and reasons, totals by status, and counts by area, by role and by rule; the fingerprint names the rulebook that decided.',
    [ev(at(9, 0), ask(9, 0)), ev(at(9, 5), ask(9, 5, 'go', 'yard', { speedAsked: 1 })), ev(at(9, 10), ask(9, 10, 'go', 'floor', { people: 3 })), ev(at(21, 0), ask(21, 0, 'go', 'yard'))],
    { totals: '1/1/1/1/0', neverFired: ['four_looks_an_hour', 'alarm_allows_look', 'no_look_in_alarm', 'never_used'], stalls: ['crowd_wait:PAUSE:1', 'yard_closed_at_night:BLOCK:1'] });
  b('backtest-history-is-built-from-earlier-events', [4, 9], 'A rule that counts history sees, for each event, the earlier events of the same participant in this log, timed by each event\'s at (which is also each request\'s now): the fourth look within the hour is refused, another participant\'s looks do not count, and nothing is kept between runs.',
    [ev(at(10, 0), ask(10, 0, 'look')), ev(at(10, 10), ask(10, 10, 'look')), ev(at(10, 20), ask(10, 20, 'look', 'floor', {}, bot('b-2'))), ev(at(10, 30), ask(10, 30, 'look')), ev(at(10, 40), ask(10, 40, 'look')), ev(at(11, 50), ask(11, 50, 'look'))],
    { totals: '5/0/0/1/0', neverFired: ['crowd_wait', 'yard_closed_at_night', 'slow_in_yard', 'alarm_allows_look', 'no_look_in_alarm', 'never_used'], stalls: ['four_looks_an_hour:BLOCK:1'] });
  b('backtest-history-is-absolute-time', [4, 9], 'Built history is all of the participant\'s earlier events, and windows are absolute time: three looks on Monday are a day before Tuesday\'s looks and do not count, with no day boundary needed.',
    [ev(at(10, 0), ask(10, 0, 'look')), ev(at(10, 10), ask(10, 10, 'look')), ev(at(10, 20), ask(10, 20, 'look')), ev(`2026-10-06T10:30`, ask(10, 30, 'look')), ev(`2026-10-06T10:40`, ask(10, 40, 'look'))],
    { totals: '5/0/0/0/0', neverFired: ['crowd_wait', 'yard_closed_at_night', 'slow_in_yard', 'four_looks_an_hour', 'alarm_allows_look', 'no_look_in_alarm', 'never_used'] });
  b('backtest-history-on-the-request-is-used-as-given', [4, 9], 'An event whose request carries its own history is decided on that history, not on the log: the first look is refused because the request says three happened already.',
    [ev(at(10, 0), { ...ask(10, 0, 'look'), history: [{ action: 'look', areaId: 'floor', at: at(9, 30) }, { action: 'look', areaId: 'floor', at: at(9, 40) }, { action: 'look', areaId: 'floor', at: at(9, 50) }] }), ev(at(10, 5), ask(10, 5, 'look'))],
    { totals: '1/0/0/1/0', neverFired: ['crowd_wait', 'yard_closed_at_night', 'slow_in_yard', 'alarm_allows_look', 'no_look_in_alarm', 'never_used'], stalls: ['four_looks_an_hour:BLOCK:1'] });
  b('backtest-missing-facts-are-named', [4], 'An event the log did not carry enough facts for is counted as missing facts, not as a refusal by a rule, and the report names each fact and how often it was missing or invalid.',
    [ev(at(9, 0), { ...ask(9, 0), facts: { time: '09:00', day: 'mon' } }), ev(at(9, 5), { ...ask(9, 5), facts: { time: '09:05', day: 'mon', people: -1 } }), ev(at(9, 10), { ...ask(9, 10), facts: { day: 'mon' } }), ev(at(9, 15), ask(9, 15))],
    { totals: '1/0/0/0/3', neverFired: ['crowd_wait', 'yard_closed_at_night', 'slow_in_yard', 'four_looks_an_hour', 'alarm_allows_look', 'no_look_in_alarm', 'never_used'], missing: ['people:3', 'time:1'] });
  b('backtest-malformed-event-request-is-a-row', [4], 'An event whose request is not a request is a row refused as missing facts (`request`), never a throw.',
    [ev(at(9, 0), {} as DomainRequest), ev(at(9, 5), ask(9, 5))],
    { totals: '1/0/0/0/1', neverFired: ['crowd_wait', 'yard_closed_at_night', 'slow_in_yard', 'four_looks_an_hour', 'alarm_allows_look', 'no_look_in_alarm', 'never_used'], missing: ['request:1'] });
  b('backtest-gaps-are-unknown-actions', [4], 'Requests for actions no rule covers are gaps, grouped by action, most often first.',
    [ev(at(9, 0), ask(9, 0, 'fly')), ev(at(9, 5), ask(9, 5, 'dig')), ev(at(9, 10), ask(9, 10, 'fly')), ev(at(9, 15), ask(9, 15))],
    { totals: '1/0/0/3/0', neverFired: ['crowd_wait', 'yard_closed_at_night', 'slow_in_yard', 'four_looks_an_hour', 'alarm_allows_look', 'no_look_in_alarm', 'never_used'], stalls: ['unknown_action:BLOCK:3'], gaps: ['fly:2', 'dig:1'] });
  b('backtest-stalls-most-often-first', [5], 'Rules that would have stalled work are listed most often first, then by first occurrence, with the earliest example timestamps (three by default).',
    [ev(at(21, 0), ask(21, 0, 'go', 'yard')), ev(at(9, 0), ask(9, 0, 'go', 'floor', { people: 5 })), ev(at(21, 5), ask(21, 5, 'go', 'yard')), ev(at(21, 10), ask(21, 10, 'go', 'yard')), ev(at(21, 15), ask(21, 15, 'go', 'yard')), ev(at(9, 5), ask(9, 5, 'go', 'floor', { people: 5 }))],
    { totals: '0/0/2/4/0', neverFired: ['four_looks_an_hour', 'alarm_allows_look', 'no_look_in_alarm', 'never_used'], stalls: ['yard_closed_at_night:BLOCK:4', 'crowd_wait:PAUSE:2'] });
  b('backtest-conflicts-that-occurred', [7], 'A finding counts as having occurred when both of its rules matched a recorded request (the matching relation of § 6 step 4, as for a witness): the allow-versus-deny contradiction on alarm occurred twice; the finding between the yard rules did not occur in this log.',
    [ev(at(9, 0), ask(9, 0, 'look', 'floor', { alarm: true })), ev(at(9, 5), ask(9, 5, 'look')), ev(at(9, 10), ask(9, 10, 'look', 'floor', { alarm: true }))],
    { totals: '1/0/0/2/0', neverFired: ['crowd_wait', 'yard_closed_at_night', 'slow_in_yard', 'four_looks_an_hour', 'never_used'], stalls: ['no_look_in_alarm:BLOCK:2'], conflicts: ['alarm_allows_look+no_look_in_alarm:2'] });
  b('backtest-rule-and-record-differ', [5, 9], 'When the log records what happened, the report lists where the rule and the record differ, in event order, without judging which is right: a refusal the record says happened, an allowance the record says did not; "unknown" and events without an outcome are left out.',
    [ev(at(21, 0), ask(21, 0, 'go', 'yard'), 'happened'), ev(at(9, 0), ask(9, 0), 'did_not_happen'), ev(at(9, 5), ask(9, 5), 'happened'), ev(at(21, 5), ask(21, 5, 'go', 'yard'), 'unknown'), ev(at(21, 10), ask(21, 10, 'go', 'yard'))],
    { totals: '2/0/0/3/0', neverFired: ['crowd_wait', 'four_looks_an_hour', 'alarm_allows_look', 'no_look_in_alarm', 'never_used'], stalls: ['yard_closed_at_night:BLOCK:3'], differences: ['0:BLOCK:happened', '1:ALLOW:did_not_happen'] });
  b('backtest-empty-log', [5], 'An empty log is a report of zeros in which every rule never fired.', [],
    { totals: '0/0/0/0/0', neverFired: ['crowd_wait', 'yard_closed_at_night', 'slow_in_yard', 'four_looks_an_hour', 'alarm_allows_look', 'no_look_in_alarm', 'never_used'] });
  b('backtest-examples-option', [5], 'The examples option bounds how many timestamps each list keeps; counts are unaffected.',
    [ev(at(21, 0), ask(21, 0, 'go', 'yard')), ev(at(21, 5), ask(21, 5, 'go', 'yard')), ev(at(21, 10), ask(21, 10, 'go', 'yard'))],
    { totals: '0/0/0/3/0', neverFired: ['crowd_wait', 'four_looks_an_hour', 'alarm_allows_look', 'no_look_in_alarm', 'never_used'], stalls: ['yard_closed_at_night:BLOCK:3'] }, { examples: 1 });

  // Current rulebook versus proposed: the proposed one raises the crowd threshold and closes the floor at night.
  const proposed = tiny([
    rule('crowd_wait', { answer: 'wait', for: 'condition' }, { does: 'go', when: [{ fact: 'people', op: '>=', value: 5 }] }),
    rule('yard_closed_at_night', { answer: 'deny' }, { where: '*', when: [{ fact: 'time', op: 'between', from: '20:00', to: '06:00' }] }),
    rule('slow_in_yard', { answer: 'limit', limits: { speed: 0.5 } }, { does: 'go', where: 'yard' }),
  ]);
  add(f, { id: 'comparison-current-versus-proposed', principle: [5, 3], description: 'Two reports on the same log, current rulebook versus proposed: which events are newly blocked, which newly allowed, which changed otherwise, and how each rule\'s count of decided events moved.',
    input: site, proposed, events: [ev(at(9, 0), ask(9, 0, 'go', 'floor', { people: 3 })), ev(at(9, 5), ask(9, 5, 'go', 'floor', { people: 6 })), ev(at(21, 0), ask(21, 0)), ev(at(21, 5), ask(21, 5, 'go', 'yard')), ev(at(9, 10), ask(9, 10, 'go', 'yard'))],
    want: { comparison: { newlyBlocked: 1, newlyAllowed: 1, other: 0 } } });
}

// ─── Canonical JSON and the fingerprint ──────────────────────────────────────

function fingerprintCases() {
  const f = 'fingerprint.json';
  const vec = (id: string, description: string, value: unknown, canonical: string) => {
    const got = canonicalJson(value);
    if (got !== canonical) fail(id, `canonical: want ${canonical}, got ${got}`);
    (files[f] ??= []).push({ id, principle: [5], description, client: true, value, expect: { canonical, fingerprint: fingerprint(value) } });
    count++;
  };
  vec('fp-empty-object', 'The empty object.', {}, '{}');
  vec('fp-empty-array', 'The empty array.', [], '[]');
  vec('fp-keys-sorted', 'Object keys are sorted by UTF-16 code unit; no whitespace.', { b: 1, a: 2, B: 3, _: 4 }, '{"B":3,"_":4,"a":2,"b":1}');
  vec('fp-nested', 'Sorting applies at every depth; arrays keep their order.', { z: [{ y: 1, x: [3, 2, 1] }, 'a'], a: { c: null, b: true } }, '{"a":{"b":true,"c":null},"z":[{"x":[3,2,1],"y":1},"a"]}');
  vec('fp-numbers', 'Numbers as JavaScript JSON.stringify writes them: no trailing zeros, exponent form past 1e21, -0 as 0.', { a: 1.0, b: 0.5, c: 1e21, d: -0, e: 123456789012345680000, f: 0.000001, g: 1e-7 }, '{"a":1,"b":0.5,"c":1e+21,"d":0,"e":123456789012345680000,"f":0.000001,"g":1e-7}');
  vec('fp-strings', 'Strings as JSON.stringify writes them (RFC 8785): only ", \\, control characters escaped; non-ASCII kept literal; the hash runs over the UTF-8 bytes (é is two, ∑ three, the emoji four).', { s: 'a"b\\c\n\t\u0001 é ∑ 🤖' }, '{"s":"a\\"b\\\\c\\n\\t\\u0001 é ∑ 🤖"}');
  vec('fp-number-edges', 'The ECMAScript Number::toString edges a port must reproduce (RFC 8785 § 3.2.2.3): -0 is 0; the smallest subnormal 5e-324; 1e21 is the first exponent integer, 1e20 is not; 1e-7 is exponent, 1e-6 is not; 2^53+1 rounds to 2^53; 0.1+0.2 is 0.30000000000000004; the largest double; 100 and 1e2 are 100.',
    { a: -0, b: 5e-324, c: 1e21, d: 1e20, e: 1e-7, f: 1e-6, g: 9007199254740993, h: 0.1 + 0.2, i: 1.7976931348623157e308, j: 1e2, k: 123e-20, l: 1.5e300, m: -1e-7, n: 2.5e-7 },
    '{"a":0,"b":5e-324,"c":1e+21,"d":100000000000000000000,"e":1e-7,"f":0.000001,"g":9007199254740992,"h":0.30000000000000004,"i":1.7976931348623157e+308,"j":100,"k":1.23e-18,"l":1.5e+300,"m":-1e-7,"n":2.5e-7}');
  vec('fp-null-and-booleans', 'null, true, false.', [null, true, false], '[null,true,false]');
  const sha = (id: string, description: string, text: string, want: string) => {
    const got = sha256Utf8(text);
    if (got !== want) fail(id, `sha256: want ${want}, got ${got}`);
    (files[f] ??= []).push({ id, principle: [5], description, client: true, text, expect: { sha256: want } });
    count++;
  };
  sha('sha256-empty', 'FIPS 180-4 SHA-256 of the empty string.', '', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  sha('sha256-abc', 'FIPS 180-4 example: "abc".', 'abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  sha('sha256-two-blocks', 'FIPS 180-4 example: the 56-byte message that pads into two blocks.', 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  sha('sha256-utf8', 'The hash is over UTF-8 bytes: "é∑🤖" is 2 + 3 + 4 bytes.', 'é∑🤖', sha256Utf8('é∑🤖'));
  const g = bases.grocery;
  const { fingerprint: claimed, findings: _findings, ...body } = g;
  vec('fp-grocery-rulebook', 'The shipped grocery example rulebook (everything but its fingerprint and its findings) hashes to its fingerprint: findings carry free text and are left out, so two conforming compilers agree.', body, canonicalJson(body));
  if (fingerprint(body) !== claimed) fail('fp-grocery-rulebook', 'fingerprint mismatch');
  if (fingerprint({ ...body, findings: g.findings }) === claimed) fail('fp-grocery-rulebook', 'findings must not be in the fingerprint');
}

// ─── Approvals: signed, verified, bound ──────────────────────────────────────

async function approvals() {
  const f = 'approvals.json';
  const pubHigh = await publicKeyOf(SEED_HIGH), pubLead = await publicKeyOf(SEED_LEAD), pubStranger = await publicKeyOf(SEED_STRANGER), pubSite = await publicKeyOf(SEED_SITE);
  const keys: TrustedKey[] = [{ keyId: 'test-high', publicKey: pubHigh, authority: 'high' }, { keyId: 'test-lead', publicKey: pubLead, roleId: 'lead' }];
  const signedInput = shared([
    rule('ask_high', { answer: 'wait', for: 'approval', by: 'high' }, { does: 'go', where: 'yard' }),
    rule('ask_twice', { answer: 'wait', for: 'approval', by: 'high' }, { does: 'go', where: 'yard', when: [{ fact: 'mode', op: '==', value: 'b' }] }),
    rule('ask_lead', { answer: 'wait', for: 'approval', by: 'tag:lead' }, { does: 'look', who: 'bot' }),
    rule('crowd_wait', { answer: 'wait', for: 'condition' }, { does: 'go', where: 'yard', when: [{ fact: 'people', op: '>=', value: 3 }] }),
    rule('alarm_stop', { answer: 'deny' }, { never: true, when: [{ fact: 'alarm', op: '==', value: true }] }),
    rule('no_yard_at_night', { answer: 'deny' }, { does: 'go', where: 'yard', when: [{ fact: 'time', op: 'between', from: '22:00', to: '06:00' }] }),
  ], { trustedKeys: keys });
  const rb = compileDomain(signedInput);
  bases.signed = rb;
  writeFileSync(join(OUT, 'rulebooks', 'signed.json'), JSON.stringify(rb, null, 2) + '\n');
  const unsignedInput = shared([rule('ask_high', { answer: 'wait', for: 'approval', by: 'high' }, { does: 'go', where: 'yard' })]);
  const NOW = '2026-10-12T09:05:00Z';
  const request: DomainRequest = { ...req('go', 'yard'), now: NOW };
  const issuedAt = '2026-10-12T09:00:00Z', expiresAt = '2026-10-12T09:30:00Z';
  const bind = { ruleId: 'ask_high', rulebookFingerprint: rb.fingerprint, participantId: 'b-1', action: 'go', areaId: 'yard', nonce: 'n-1', issuedAt, expiresAt };
  const highApproval = await signApproval({ id: 'ann', authority: 'high', ...bind }, { keyId: 'test-high', privateKey: SEED_HIGH });
  const leadApproval = await signApproval({ id: 'lee', roleId: 'lead', ...bind, ruleId: 'ask_lead', action: 'look', areaId: 'floor', nonce: 'n-2' }, { keyId: 'test-lead', privateKey: SEED_LEAD });
  const forged = await signApproval({ id: 'mallory', authority: 'high', ...bind }, { keyId: 'test-high', privateKey: SEED_STRANGER });
  const strangerKey = await signApproval({ id: 'mallory', authority: 'high', ...bind }, { keyId: 'test-stranger', privateKey: SEED_STRANGER });
  const overclaim = await signApproval({ id: 'lee', authority: 'high', ...bind }, { keyId: 'test-lead', privateKey: SEED_LEAD });
  const otherArea = await signApproval({ id: 'ann', authority: 'high', ...bind, areaId: 'floor', nonce: 'n-3' }, { keyId: 'test-high', privateKey: SEED_HIGH });
  const otherAction = await signApproval({ id: 'ann', authority: 'high', ...bind, action: 'look', nonce: 'n-4' }, { keyId: 'test-high', privateKey: SEED_HIGH });
  const otherParticipant = await signApproval({ id: 'ann', authority: 'high', ...bind, participantId: 'b-2', nonce: 'n-5' }, { keyId: 'test-high', privateKey: SEED_HIGH });
  const otherRule = await signApproval({ id: 'ann', authority: 'high', ...bind, ruleId: 'crowd_wait', nonce: 'n-6' }, { keyId: 'test-high', privateKey: SEED_HIGH });
  const otherRulebook = await signApproval({ id: 'ann', authority: 'high', ...bind, rulebookFingerprint: '0'.repeat(64), nonce: 'n-7' }, { keyId: 'test-high', privateKey: SEED_HIGH });
  const expired = await signApproval({ id: 'ann', authority: 'high', ...bind, issuedAt: '2026-10-12T08:00:00Z', expiresAt: '2026-10-12T09:00:00Z', nonce: 'n-8' }, { keyId: 'test-high', privateKey: SEED_HIGH });
  const notYet = await signApproval({ id: 'ann', authority: 'high', ...bind, issuedAt: '2026-10-12T09:10:00Z', expiresAt: '2026-10-12T09:30:00Z', nonce: 'n-9' }, { keyId: 'test-high', privateKey: SEED_HIGH });
  /** A /2 approval, exactly as 0.5.1 signed it (requestDigest binding, no spec, nonce or expiry; 16-hex fingerprint), under the same key. */
  const v2Approval = { id: 'ann', authority: 'high', requestDigest: 'a972a032bcabeaaf', rulebookFingerprint: '96be85f891da7c40', issuedAt, keyId: 'test-high', signature: 'ab'.repeat(64) };
  const APPROVAL_SPEC_STRING = 'robot-domain-rules-approval/3';

  const vec = async (id: string, description: string, approval: unknown, ok: boolean, principle = [2, 6]) => {
    const r = await verifyApproval(approval, keys);
    if (r.ok !== ok) fail(id, `verify: want ${ok}, got ${r.ok} (${r.reason})`);
    (files[f] ??= []).push({ id, principle, description, client: true, approval, trustedKeys: keys, expect: { verify: { ok }, ...(r.reason ? { note: r.reason } : {}) } });
    count++;
  };
  (files[f] ??= []).push({ id: 'approvals-test-keys', principle: [2, 6], description: 'TEST ONLY keys: the seeds used to produce every signature in this file, so another implementation can reproduce them. Never use them for anything real.',
    testKeys: [
      { keyId: 'test-high', privateKey: SEED_HIGH, publicKey: pubHigh, note: 'TEST ONLY — trusted for authority high' },
      { keyId: 'test-lead', privateKey: SEED_LEAD, publicKey: pubLead, note: 'TEST ONLY — trusted for role lead' },
      { keyId: 'test-stranger', privateKey: SEED_STRANGER, publicKey: pubStranger, note: 'TEST ONLY — not trusted by the rulebook' },
      { keyId: 'test-site', privateKey: SEED_SITE, publicKey: pubSite, note: 'TEST ONLY — signs the rulebook itself' },
    ],
    client: true, expect: { canonical: canonicalJson({ b: 1, a: 'x' }), fingerprint: fingerprint({ b: 1, a: 'x' }) }, value: { b: 1, a: 'x' } });
  count++;
  await vec('approvals-verify-ok', 'A well-formed /3 approval signed by a trusted key, claiming the authority that key is trusted for, verifies.', highApproval, true);
  await vec('approvals-verify-role-ok', 'An approval signed by a key trusted for a role, claiming that role, verifies.', leadApproval, true);
  await vec('approvals-verify-forged', 'A signature made with a different private key under a trusted keyId does not verify.', forged, false);
  await vec('approvals-verify-untrusted-key', 'A keyId the rulebook does not trust does not verify.', strangerKey, false);
  await vec('approvals-verify-overclaim', 'A key trusted for a role cannot sign an approval that claims an authority.', overclaim, false);
  await vec('approvals-verify-tampered-field', 'Changing any signed field (here the approver id) breaks the signature.', { ...highApproval, id: 'bob' }, false);
  await vec('approvals-verify-missing-field', 'An approval with no expiresAt is malformed: every /3 approval expires.', (() => { const { expiresAt: _e, ...rest } = highApproval; return rest; })(), false);
  await vec('approvals-verify-missing-nonce', 'An approval with no nonce is malformed: every /3 approval is one instance.', (() => { const { nonce: _n, ...rest } = highApproval; return rest; })(), false);
  await vec('approvals-verify-bad-signature-encoding', 'A signature that is not 64 bytes of hex does not verify.', { ...highApproval, signature: 'zz' }, false);
  await vec('approvals-verify-v2-approval-refused', 'VERSION HANDLING: a robot-domain-rules/2 approval (requestDigest binding, no spec, no nonce, no expiry) is refused with a message naming the migration (re-issue under robot-domain-rules-approval/3); it is never reinterpreted.', v2Approval, false);
  await vec('approvals-verify-wrong-spec-refused', 'An approval declaring another spec string is refused.', { ...highApproval, spec: 'robot-domain-rules-approval/4' }, false);

  /** Decided through `evaluate` alone (pure: it can verify nothing) or, with `via: 'trusted'`, through `verifyAndEvaluate` (the trusted layer verifies signatures first). */
  const dec = (id: string, description: string, approvedBy: unknown, want: Want, r: DomainRequest = request, via: 'pure' | 'trusted' = 'pure') =>
    add(f, { id, principle: [2, 6], description, base: 'signed', request: { ...r, facts: { ...r.facts, ...(approvedBy === undefined ? {} : { approvedBy }) } }, want, ...(via === 'trusted' ? { verified: true } : {}) });
  const trusted = (id: string, description: string, approvedBy: unknown, want: Want, r: DomainRequest = request) => dec(id, description, approvedBy, want, r, 'trusted');
  const ASK = { status: 'PAUSE' as const, reasons: ['ask_high@high'], asks: ['ask_high@high'] };
  dec('approvals-pause-asks-with-binding', 'With trusted keys declared, an approval wait returns an approval request naming the rule, the rulebook fingerprint, the participant, the action and the area to sign for.', undefined, ASK);
  trusted('approvals-verified-clears', 'Through the trusted layer (verifyAndEvaluate), a signed approval that verifies against a trusted key and is bound to this rule, rulebook, participant, action and area, valid at now and not yet used, clears the wait; the decision reports the instance used so the caller can record it.', highApproval, { status: 'ALLOW', reasons: ['role_permits_action', 'ask_high'], used: ['ask_high:n-1'] });
  dec('approvals-evaluate-alone-never-clears', 'Through the pure evaluator alone, the SAME valid signed approval does not clear the wait: evaluate verifies nothing and nothing in a request can claim to have been verified; the reason says to use verifyAndEvaluate (or pass the object verifyApproval returned).', highApproval, ASK);
  dec('approvals-unverified-does-not-clear', 'A signed approval the caller never verified does not clear the wait (as before).', highApproval, ASK);
  dec('approvals-unsigned-verified-flag-clears-nothing', 'THE 0.5.2 BYPASS, CLOSED: an object with the right bound fields, `verified: true` and NO signature cleared the wait through both entry points in 0.5.2. The flag is request data and is ignored: PAUSE.', { spec: APPROVAL_SPEC_STRING, ...bind, id: 'mallory', authority: 'high', keyId: 'test-high', verified: true }, ASK);
  trusted('approvals-unsigned-verified-flag-clears-nothing-via-trusted-layer', 'The same unsigned object through verifyAndEvaluate: there is no signature to verify, the flag is ignored, PAUSE.', { spec: APPROVAL_SPEC_STRING, ...bind, id: 'mallory', authority: 'high', keyId: 'test-high', verified: true }, ASK);
  trusted('approvals-bogus-signature-does-not-clear', 'A bogus signature (64 bytes of hex that verify under no key), with `verified: true` set in the data, through verifyAndEvaluate: PAUSE.', { ...highApproval, signature: 'ab'.repeat(64), verified: true }, ASK);
  trusted('approvals-forged-with-flag-does-not-clear', 'Signed by a key the rulebook does not trust and marked verified in the data, through verifyAndEvaluate: PAUSE.', { ...forged, verified: true }, ASK);
  dec('approvals-plain-does-not-clear-when-keys-declared', 'With trusted keys declared, a plain { id, authority } approval no longer clears anything.', { id: 'ann', authority: 'high' }, ASK);
  trusted('approvals-other-area-does-not-clear', 'SCOPE: a verified approval for another area does not clear this one.', otherArea, ASK);
  trusted('approvals-other-action-does-not-clear', 'SCOPE: a verified approval for another action does not clear this one.', otherAction, ASK);
  trusted('approvals-other-participant-does-not-clear', 'SCOPE: a verified approval for another participant does not clear this one.', otherParticipant, ASK);
  trusted('approvals-other-rule-does-not-clear', 'An approval names the rule it clears: one for crowd_wait does not clear ask_high.', otherRule, ASK);
  trusted('approvals-other-rulebook-does-not-clear', 'RULEBOOK: a verified approval given under another rulebook (fingerprint differs) does not clear the wait.', otherRulebook, ASK);
  trusted('approvals-expired-is-refused', 'EXPIRY: an approval whose expiresAt is at or before now does not clear the wait.', expired, ASK);
  trusted('approvals-not-yet-valid-is-refused', 'An approval whose issuedAt is after now does not clear the wait.', notYet, ASK);
  trusted('approvals-replayed-is-refused', 'REPLAY: the same approval instance, after the caller recorded its nonce as consumed, does not clear the wait a second time.', highApproval, ASK, { ...request, consumedApprovals: ['n-1'] });
  trusted('approvals-now-missing-is-required-facts', 'A signed approval cannot be judged without now: BLOCK required_facts (the engine has no clock; the caller supplies now).', highApproval, { status: 'BLOCK', reasons: ['required_facts@builtin'] }, req('go', 'yard'));
  trusted('approvals-verified-but-insufficient', 'A verified approval still has to hold what the rule names: a lead\'s approval does not clear a wait by "high".', await signApproval({ id: 'lee', roleId: 'lead', ...bind, nonce: 'n-10' }, { keyId: 'test-lead', privateKey: SEED_LEAD }), ASK);
  trusted('approvals-verified-role-clears', 'A verified approval by role tag clears a wait that names that tag.', leadApproval, { status: 'ALLOW', reasons: ['role_permits_action', 'ask_lead'], used: ['ask_lead:n-2'] }, { ...req('look', 'floor'), now: NOW });
  dec('approvals-v2-approval-does-not-clear', 'VERSION HANDLING: a /2 approval passed to the evaluator (even marked verified) does not clear the wait; the reason names the migration.', { ...v2Approval, verified: true }, ASK);
  // Sub-millisecond timestamps are truncated to the millisecond (SPEC.md § 1): a port with finer ticks must truncate the same way.
  trusted('approvals-sub-millisecond-now-is-truncated-valid', 'TIMESTAMPS: now = 09:29:59.9999Z is truncated to 09:29:59.999Z, before the 09:30:00Z expiry: still valid.', highApproval, { status: 'ALLOW', reasons: ['role_permits_action', 'ask_high'], used: ['ask_high:n-1'] }, { ...request, now: '2026-10-12T09:29:59.9999Z' });
  trusted('approvals-sub-millisecond-now-is-truncated-expired', 'TIMESTAMPS: now = 09:30:00.0004Z is truncated to 09:30:00.000Z, which is not before the expiry: expired.', highApproval, ASK, { ...request, now: '2026-10-12T09:30:00.0004Z' });
  // Several approvals in one request: each clears at most one wait.
  const twice = await signApproval({ id: 'ann', authority: 'high', ...bind, ruleId: 'ask_twice', nonce: 'n-11' }, { keyId: 'test-high', privateKey: SEED_HIGH });
  trusted('approvals-two-waits-need-two-approvals', 'Two approval waits on one request (ask_high and ask_twice, when mode is b): one approval clears one of them and the decision still asks for the other.', highApproval, { status: 'PAUSE', reasons: ['ask_twice@high'], asks: ['ask_twice@high'] }, { ...request, facts: { ...request.facts, mode: 'b' } });
  trusted('approvals-list-each-clears-one-wait', 'approvedBy may be a list: each approval is spent on at most one wait, so two signed approvals, one per rule, clear both; both instances are reported.', [highApproval, twice], { status: 'ALLOW', reasons: ['role_permits_action', 'ask_high', 'ask_twice'], used: ['ask_high:n-1', 'ask_twice:n-11'] }, { ...request, facts: { ...request.facts, mode: 'b' } });
  trusted('approvals-list-one-approval-cannot-clear-two-waits', 'The same approval listed twice is one instance: it clears one wait, and the other still asks.', [highApproval, highApproval], { status: 'PAUSE', reasons: ['ask_twice@high'], asks: ['ask_twice@high'] }, { ...request, facts: { ...request.facts, mode: 'b' } });
  // Authorisation is separate from the operational facts: an approval clears its wait and nothing else.
  trusted('approvals-facts-changed-condition-wait-still-holds', 'FACTS CHANGE AFTER APPROVAL: the same valid approval, but now three people are in the yard: the approval clears ask_high and the condition wait crowd_wait still holds. PAUSE on the facts current now, with no new approval request.', highApproval, { status: 'PAUSE', reasons: ['crowd_wait@high'] }, { ...request, facts: { ...request.facts, people: 3 } });
  trusted('approvals-current-never-rule-still-blocks', 'CURRENT BLOCK: with the alarm on, the never rule blocks whatever approval is presented; the approval is not even weighed.', highApproval, { status: 'BLOCK', reasons: ['alarm_stop@high'] }, { ...request, facts: { ...request.facts, alarm: true } });
  trusted('approvals-current-deny-still-blocks', 'CURRENT BLOCK: at night the deny rule matches; the valid approval clears ask_high, but the strictest answer is the current BLOCK.', highApproval, { status: 'BLOCK', reasons: ['no_yard_at_night@high'] }, { ...request, facts: { ...request.facts, time: '23:00' } });
  // A plan spends approvals step by step.
  add(f, { id: 'approvals-plan-consumes-step-by-step', principle: [6, 3], description: 'ONE APPROVAL, ONE STEP: a single-use approval in the plan\'s initial facts clears the first step\'s wait; the nonce is consumed for every later step, so steps two and three pause (0.5.2 allowed all three on one nonce). approvalsUsed is reported at plan level.',
    base: 'signed', verified: true, plan: { participant: { id: 'b-1', kind: 'robot', roleId: 'bot' }, initialFacts: { people: 0, time: '10:00', day: 'mon', approvedBy: highApproval }, now: NOW, steps: [{ action: 'go', area: 'yard' }, { action: 'go' }, { action: 'go' }] },
    want: { status: 'PAUSE', steps: ['ALLOW', 'PAUSE', 'PAUSE'], asks: ['ask_high@high'], used: ['ask_high:n-1'] } });
  add(f, { id: 'approvals-plan-pure-evaluator-never-clears', principle: [6, 3], description: 'The same plan through the pure evaluatePlan: nothing is verified, so no step clears.',
    base: 'signed', plan: { participant: { id: 'b-1', kind: 'robot', roleId: 'bot' }, initialFacts: { people: 0, time: '10:00', day: 'mon', approvedBy: highApproval }, now: NOW, steps: [{ action: 'go', area: 'yard' }, { action: 'go' }, { action: 'go' }] },
    want: { status: 'PAUSE', steps: ['PAUSE', 'PAUSE', 'PAUSE'], asks: ['ask_high@high'] } });
  add(f, { id: 'approvals-plain-ok-without-keys', principle: [2, 6], description: 'Back-compat, development only: with no trusted keys declared, a plain { id, authority } approval clears the wait (no nonce is recorded: there is none).',
    input: unsignedInput, request: { ...request, facts: { ...request.facts, approvedBy: { id: 'ann', authority: 'high' } } }, want: { status: 'ALLOW', reasons: ['role_permits_action', 'ask_high'] } });
  add(f, { id: 'approvals-v2-approval-refused-without-keys', principle: [2, 6], description: 'VERSION HANDLING: a /2 approval is refused by name even where no trusted keys are declared (0.5.2 took it as a plain approval and allowed).',
    input: unsignedInput, request: { ...request, facts: { ...request.facts, approvedBy: v2Approval } }, want: ASK });
  add(f, { id: 'approvals-participant-id-required', principle: [2, 6, 4], description: 'A request that needs an approval must name the participant (an approval binds to it): an empty participant.id is BLOCK required_facts.',
    input: unsignedInput, request: { ...request, participant: { ...request.participant, id: '' } }, want: { status: 'BLOCK', reasons: ['required_facts@builtin'] } });
  add(f, { id: 'approvals-bad-trusted-key-rejected', principle: [2], description: 'A trusted key whose publicKey is not 32 bytes of hex makes the rulebook invalid.',
    base: 'signed', tamper: rb => { rb.trustedKeys![0].publicKey = 'abc'; }, want: { error: true } });
  add(f, { id: 'approvals-trusted-key-unknown-authority-rejected', principle: [2], description: 'A trusted key naming an authority the rulebook does not declare makes the rulebook invalid.',
    base: 'signed', tamper: rb => { rb.trustedKeys![0].authority = 'king'; }, want: { error: true } });

  const sig = await signRulebook(rb, { keyId: 'test-site', privateKey: SEED_SITE });
  if (!(await verifyRulebookSignature(rb, sig, pubSite))) fail('approvals-rulebook-signature', 'does not verify');
  (files[f] ??= []).push({ id: 'approvals-rulebook-signature-ok', principle: [5], description: 'A rulebook signature (Ed25519 over the canonical JSON of the whole rulebook, fingerprint and findings included) verifies with the pinned public key.', client: true, rulebookRef: 'rulebooks/signed.json', signature: sig, publicKey: pubSite, expect: { rulebookSignature: { ok: true } } });
  const tampered = JSON.parse(JSON.stringify(rb)) as Rulebook;
  (tampered as { otherwise: string }).otherwise = 'wait-for-approval';
  if (await verifyRulebookSignature(tampered, sig, pubSite)) fail('approvals-rulebook-signature-tampered', 'verified a tampered rulebook');
  (files[f] ??= []).push({ id: 'approvals-rulebook-signature-tampered', principle: [5], description: 'A rulebook changed after signing (here `otherwise`) fails the signature, whatever its fingerprint says.', client: true, rulebook: tampered, signature: sig, publicKey: pubSite, expect: { rulebookSignature: { ok: false } } });
  (files[f] ??= []).push({ id: 'approvals-rulebook-signature-wrong-key', principle: [5], description: 'The right rulebook and signature under the wrong public key fail.', client: true, rulebookRef: 'rulebooks/signed.json', signature: sig, publicKey: pubStranger, expect: { rulebookSignature: { ok: false } } });
  count += 3;
}

// ─── Versions: a /2 rulebook is refused, never reinterpreted ──────────────────

function versions() {
  const f = 'versions.json';
  const v3 = compileDomain(tiny([rule('no_yard', { answer: 'deny' }, { where: 'yard' })]));
  const body = JSON.parse(JSON.stringify(v3)) as Record<string, unknown>;
  // What 0.5.1 would have written: format /2 and a 16-hex FNV-1a fingerprint (its value does not matter; the format decides).
  const v2 = { ...body, format: 'neuroverse-domain-rules/2', fingerprint: '5f8c2e1a9b3d4c70' };
  const problems = validateRulebook(v2);
  if (!problems.length || !/robot-domain-rules\/2/.test(problems[0]) || !/recompile/i.test(problems[0])) fail('versions-v2-rulebook-refused', `expected a versioned refusal naming the migration, got ${JSON.stringify(problems)}`);
  (files[f] ??= []).push({ id: 'versions-v2-rulebook-refused', principle: [4, 5], description: 'VERSION HANDLING: a rulebook declaring format neuroverse-domain-rules/2 (spec /2, FNV-1a fingerprint) is refused by validation with a message that names its version and the migration (recompile under /3); its contents are never reinterpreted under /3 rules.', client: true, rulebook: v2, expect: { error: true, note: problems[0] } });
  const v1 = { ...body, format: 'neuroverse-domain-rules/1', fingerprint: '5f8c2e1a9b3d4c70' };
  (files[f] ??= []).push({ id: 'versions-v1-rulebook-refused', principle: [4, 5], description: 'The same for a /1 rulebook.', client: true, rulebook: v1, expect: { error: true, note: validateRulebook(v1)[0] } });
  const unknown = { ...body, format: 'neuroverse-domain-rules/9' };
  (files[f] ??= []).push({ id: 'versions-unknown-format-refused', principle: [4], description: 'An unknown format string is refused.', client: true, rulebook: unknown, expect: { error: true, note: validateRulebook(unknown)[0] } });
  const fnvOnV3 = { ...body, fingerprint: '5f8c2e1a9b3d4c70' };
  (files[f] ??= []).push({ id: 'versions-v2-fingerprint-on-v3-rulebook-refused', principle: [5], description: 'A /3 rulebook carrying a 16-hex (/2-shaped) fingerprint fails validation: the fingerprint does not match its contents.', client: true, rulebook: fnvOnV3, expect: { error: true, note: validateRulebook(fnvOnV3)[0] } });
  count += 4;
  // The evaluator refuses too: "refused by name" is true at every door, not only at validation (0.5.2 decided a /2 rulebook as ALLOW).
  add(f, { id: 'versions-v2-rulebook-refused-by-evaluator', principle: [4, 5], description: 'EVERY DOOR: evaluate on a /2 rulebook is BLOCK rulebook_version with validation\'s exact message and the claimed fingerprint, never a decision on its contents (0.5.2 returned ALLOW with the /2 fingerprint).',
    rulebook: v2, request: req('go', 'floor'), want: { status: 'BLOCK', reasons: ['rulebook_version@builtin'] } });
  add(f, { id: 'versions-v2-rulebook-refused-by-verify-and-evaluate', principle: [4, 5], description: 'The same through verifyAndEvaluate.',
    rulebook: v2, verified: true, request: req('go', 'floor'), want: { status: 'BLOCK', reasons: ['rulebook_version@builtin'] } });
  add(f, { id: 'versions-unknown-format-refused-by-evaluator', principle: [4], description: 'An unknown format is refused by the evaluator the same way.',
    rulebook: unknown, request: req('go', 'floor'), want: { status: 'BLOCK', reasons: ['rulebook_version@builtin'] } });
  add(f, { id: 'versions-v2-rulebook-refused-by-plan', principle: [4, 5], description: 'evaluatePlan on a /2 rulebook: BLOCK rulebook_version from the plan, no steps evaluated.',
    rulebook: v2, plan: { participant: as('robot', 'bot'), initialFacts: { people: 0, time: '10:00', day: 'mon' }, steps: [{ action: 'go', area: 'floor' }] }, want: { status: 'BLOCK', firstViolation: 'rulebook_version@builtin#0:plan' } });
}

// ─── Integrity: what is derived is re-derived at validation ──────────────────

function integrity() {
  const f = 'integrity.json';
  const office = (bases.shared as Rulebook).areas.find(a => a.id === 'office')!;
  add(f, { id: 'integrity-stripped-area-rule-rejected', principle: [8, 4], description: 'An area\'s allowRoles compile to the never rule area_role_limits:<area>. A rulebook from which that rule was removed — fingerprint recomputed so it still matches — is invalid: validation re-derives the rule from the area and finds it missing (0.5.2 validated it clean and ALLOWed a robot into the office).',
    base: 'shared', tamper: rb => { rb.rules = rb.rules.filter(r => r.id !== `area_role_limits:${office.id}`); }, want: { error: true } });
  add(f, { id: 'integrity-altered-area-rule-rejected', principle: [8, 4], description: 'The same rule narrowed to one role: the re-derived rule differs, so the rulebook is invalid.',
    base: 'shared', tamper: rb => { rb.rules.find(r => r.id === `area_role_limits:${office.id}`)!.who = ['bot']; }, want: { error: true } });
  add(f, { id: 'integrity-impostor-area-rule-rejected', principle: [8, 4], description: 'A rule claiming to be an area\'s role limit (the reserved id prefix) that no area declares is invalid.',
    base: 'shared', tamper: rb => { rb.rules.push({ ...rb.rules.find(r => r.id === `area_role_limits:${office.id}`)!, id: 'area_role_limits:nowhere' }); }, want: { error: true } });
  add(f, { id: 'integrity-emptied-findings-rejected', principle: [7], description: '"Findings MUST NOT be hidden" is checked: the grocery rulebook with its findings emptied (the fingerprint does not cover them, so it still matches) is invalid — validation re-runs the conflict check and compares.',
    base: 'grocery', tamper: rb => { rb.findings = []; }, want: { error: true } });
  add(f, { id: 'integrity-downgraded-finding-rejected', principle: [7], description: 'A finding whose severity was changed (a conflict made info) is invalid: kind, severity, rule IDs and certainty must agree with the check; only the message is free.',
    base: 'grocery', tamper: rb => { rb.findings = rb.findings.map(x => (x.kind === 'authority-override' ? { ...x, severity: 'info' as const } : x)); }, want: { error: true } });
  add(f, { id: 'integrity-invalid-witness-rejected', principle: [7], description: 'A finding whose witness no longer matches both of its rules is invalid.',
    base: 'grocery', tamper: rb => { const x = rb.findings.find(y => y.witness)!; x.witness = { ...x.witness!, areaId: 'nowhere' }; }, want: { error: true } });
  const reworded = JSON.parse(JSON.stringify(bases.grocery)) as Rulebook;
  reworded.findings = reworded.findings.map(x => ({ ...x, message: 'a port may word this finding differently' }));
  if (validateRulebook(reworded).length) fail('integrity-reworded-findings-ok', `reworded findings should validate: ${validateRulebook(reworded).join('; ')}`);
  add(f, { id: 'integrity-reworded-findings-still-decides', principle: [7, 5], description: 'Reworded finding messages are fine: the message is free text. The rulebook validates and decides as before.',
    rulebook: reworded as unknown as Record<string, unknown>, request: grocery.day[0][1], want: { status: evaluateDomainAction(bases.grocery, grocery.day[0][1]).status, reasons: evaluateDomainAction(bases.grocery, grocery.day[0][1]).reasons.map(r => `${r.ruleId}@${r.setBy}`), limits: evaluateDomainAction(bases.grocery, grocery.day[0][1]).limits } });
}

// ─── neuroverse-governance/1: AI agents calling tools (SPEC.md § 16) ─────────
//
// One digital site, the desk: three authorities (law > owner > agent), agents
// and humans, four tools with arguments bound to facts, four scopes, three
// roles. The same engine decides it; these cases prove the /1 words, the
// argument binding, bounded delegation, approvals bound to arguments,
// projected-spend facts and missions. Test keys are TEST ONLY.

const SEED_OWNER = '5555555555555555555555555555555555555555555555555555555555555555';   // TEST ONLY key for authority "owner"
const SEED_AGENT = '6666666666666666666666666666666666666666666666666666666666666666';   // TEST ONLY key for authority "agent"

type GDraft = Omit<GovernanceRule, 'source' | 'setBy'> & { setBy?: string };
const grule = (id: string, then: Rule['then'], patch: Partial<GovernanceRule> = {}): GDraft => ({ id, text: id, who: '*', does: '*', where: '*', then, ...patch });

const desk = (rules: GDraft[], extra: Partial<GovernanceCompileInput> = {}): GovernanceCompileInput => ({
  id: 'desk', name: 'The desk', kinds: ['agent', 'human'],
  authorities: [{ id: 'law' }, { id: 'owner' }, { id: 'agent' }],
  tools: [
    { id: 'read', kinds: ['agent', 'human'], tags: ['read'], scopes: ['files', 'shared'] },
    { id: 'write', kinds: ['agent', 'human'], tags: ['write'], scopes: ['files', 'shared'], args: { path: { fact: 'path' }, bytes: { fact: 'bytes', required: false } } },
    { id: 'pay', kinds: ['agent', 'human'], tags: ['money'], scopes: ['bank'], args: { amount: { fact: 'amount' } }, requires: ['projected_spend'] },
    { id: 'send', kinds: ['agent', 'human'], tags: ['send'], scopes: ['mail'], args: { to: { fact: 'to_domain' } }, requires: ['external'] },
    { id: 'approval_refused', kinds: ['agent'], tags: ['event'] },
  ],
  scopes: [{ id: 'files', name: 'Files' }, { id: 'shared', name: 'Shared drive' }, { id: 'bank', name: 'Bank' }, { id: 'mail', name: 'Mail', denyRoles: ['reader'] }],
  roles: [
    { id: 'worker', name: 'Worker', kind: 'agent', tools: ['read', 'write', 'pay', 'send'] },
    { id: 'reader', name: 'Reader', kind: 'agent', tools: ['read'] },
    { id: 'boss', name: 'Boss', kind: 'human', tools: ['read', 'write', 'pay', 'send'] },
  ],
  facts: [
    { id: 'path', type: 'string' },
    { id: 'bytes', type: 'number', min: 0 },
    { id: 'amount', type: 'number', min: 0 },
    { id: 'projected_spend', type: 'number', min: 0, description: 'The harness\'s arithmetic: what this week\'s spend would be if this call ran (an atomic reserve), never the engine\'s.' },
    { id: 'to_domain', type: 'string' },
    { id: 'external', type: 'boolean' },
  ],
  limits: [{ id: 'max_bytes', unit: 'bytes', requestedFact: 'bytes' }],
  rules: rules.map(r => ({ setBy: 'owner', ...r, source: { kind: 'manual', ref: r.id } })),
  ...extra,
});
const DESK_RULES: GDraft[] = [
  grule('cap', { answer: 'deny' }, { does: 'pay', when: [{ fact: 'projected_spend', op: '>', value: 500 }] }),
  grule('pay_waits', { answer: 'wait', for: 'approval', by: 'owner' }, { who: 'worker', does: 'pay' }),
  grule('no_external', { answer: 'deny' }, { does: 'send', when: [{ fact: 'external', op: '==', value: true }], never: true, setBy: 'law' }),
  grule('small_writes', { answer: 'limit', limits: { max_bytes: 1000 } }, { does: 'write' }),
];
const sam = { id: 'sam' };
const worker = { id: 'w-1', kind: 'agent', roleId: 'worker' };
const boss = { id: 'b-1', kind: 'human', roleId: 'boss' };
const greq = (tool: string, scope: string, patch: Partial<GovernanceRequest> = {}): GovernanceRequest => ({ principal: sam, participant: worker, tool, scope, facts: {}, ...patch });
const MISSION: Mission = {
  format: 'neuroverse-governance-plan/1', id: 'm1', objective: 'Read and write files; pay at most once, with approval.',
  permitsRuleId: 'mission_tools',
  permits: [{ tool: 'read' }, { id: 'write_in_files_only', tool: 'write', scopes: ['files'] }, { tool: 'pay' }],
  approvals: [{ id: 'mission_pay_approval', tool: 'pay', by: 'owner' }],
  order: [{ id: 'read_first', first: 'read', then: 'write' }],
  atMost: [{ id: 'one_pay', tools: 'pay', count: 1 }],
  requires: [{ id: 'must_write', tools: 'write' }],
};

async function digital() {
  const pubOwner = await publicKeyOf(SEED_OWNER), pubAgent = await publicKeyOf(SEED_AGENT);
  const keys: TrustedKey[] = [{ keyId: 'test-owner', publicKey: pubOwner, authority: 'owner' }, { keyId: 'test-agent', publicKey: pubAgent, authority: 'agent' }];
  bases.desk = compileGovernance(desk(DESK_RULES));
  bases['desk-signed'] = compileGovernance(desk([...DESK_RULES, grule('cool_off', { answer: 'deny' }, { does: 'pay', history: [{ tools: 'approval_refused', withinMinutes: 60, op: '>=', value: 3 }] })], { trustedKeys: keys }));
  bases['desk-mission'] = compileMission(bases.desk as GovernanceRulebook, MISSION);
  for (const name of ['desk', 'desk-signed', 'desk-mission']) writeFileSync(join(OUT, 'rulebooks', `${name}.json`), JSON.stringify(bases[name], null, 2) + '\n');
  const deskRb = bases.desk as GovernanceRulebook, signedRb = bases['desk-signed'] as GovernanceRulebook, missionRb = bases['desk-mission'] as GovernanceRulebook;

  // d1 — tools, scopes, arguments bound to facts
  {
    const f = 'd1-tools-and-args.json', base = 'desk';
    add(f, { id: 'd1-declared-args-allow', principle: [4, 8], description: '/1: a worker writes a file with both declared arguments; path and bytes become facts, the limit rule sees bytes within its ceiling: ALLOW role_permits_tool + small_writes with limits.',
      base, request: greq('write', 'files', { args: { path: 'notes.md', bytes: 10 } }), want: { status: 'ALLOW', reasons: ['role_permits_tool@builtin', 'small_writes@owner'], limits: { max_bytes: 1000 } } });
    add(f, { id: 'd1-optional-arg-absent', principle: [4], description: 'An optional argument (bytes, required: false) may be absent: the limit rule then has no requested value and the decision is LIMIT.',
      base, request: greq('write', 'files', { args: { path: 'notes.md' } }), want: { status: 'LIMIT', reasons: ['small_writes@owner'], limits: { max_bytes: 1000 } } });
    add(f, { id: 'd1-undeclared-arg-refused', principle: [4], description: 'FAIL CLOSED: an argument field the tool does not declare is BLOCK args_wellformed, never run.',
      base, request: greq('write', 'files', { args: { path: 'notes.md', mode: 'append' } }), want: { status: 'BLOCK', reasons: ['args_wellformed@builtin'] } });
    add(f, { id: 'd1-missing-required-arg-refused', principle: [4], description: 'A declared argument that is required (the default) and absent is BLOCK args_wellformed.',
      base, request: greq('write', 'files', { args: { bytes: 10 } }), want: { status: 'BLOCK', reasons: ['args_wellformed@builtin'] } });
    add(f, { id: 'd1-wrong-type-arg-refused', principle: [4], description: 'An argument whose value is not valid for its bound fact (path is a string; 7 is not) is BLOCK args_wellformed.',
      base, request: greq('write', 'files', { args: { path: 7 } }), want: { status: 'BLOCK', reasons: ['args_wellformed@builtin'] } });
    add(f, { id: 'd1-args-not-object-refused', principle: [4], description: 'Arguments that are not an object (a bare string, as a model sometimes emits) are BLOCK args_wellformed.',
      base, request: greq('write', 'files', { args: 'notes.md' }), want: { status: 'BLOCK', reasons: ['args_wellformed@builtin'] } });
    add(f, { id: 'd1-args-absent-for-tool-with-args-refused', principle: [4], description: 'A tool that declares a required argument, called with no arguments at all: BLOCK args_wellformed.',
      base, request: greq('write', 'files'), want: { status: 'BLOCK', reasons: ['args_wellformed@builtin'] } });
    add(f, { id: 'd1-no-args-tool-plain', principle: [4], description: 'A tool with no declared arguments, called with none: ALLOW on the role check.',
      base, request: greq('read', 'files'), want: { status: 'ALLOW', reasons: ['role_permits_tool@builtin'] } });
    add(f, { id: 'd1-no-args-tool-empty-object', principle: [4], description: 'The same with args {}: ALLOW (an empty object carries nothing undeclared).',
      base, request: greq('read', 'files', { args: {} }), want: { status: 'ALLOW', reasons: ['role_permits_tool@builtin'] } });
    add(f, { id: 'd1-no-args-tool-with-field-refused', principle: [4], description: 'A tool with no declared arguments, called with one: BLOCK args_wellformed.',
      base, request: greq('read', 'files', { args: { path: 'x' } }), want: { status: 'BLOCK', reasons: ['args_wellformed@builtin'] } });
    add(f, { id: 'd1-bound-fact-also-supplied-refused', principle: [4], description: 'A fact bound to an argument may not also arrive as a fact (two sources for one value): BLOCK args_wellformed.',
      base, request: greq('write', 'files', { args: { path: 'a.md' }, facts: { path: 'b.md' } }), want: { status: 'BLOCK', reasons: ['args_wellformed@builtin'] } });
    add(f, { id: 'd1-args-not-json-refused', principle: [4], description: 'Arguments that are not plain JSON (a non-finite number) are BLOCK args_wellformed.',
      base, request: greq('write', 'files', { args: { path: 'a.md', bytes: Number.POSITIVE_INFINITY } }), want: { status: 'BLOCK', reasons: ['args_wellformed@builtin'] } });
    add(f, { id: 'd1-unknown-tool-refused', principle: [4], description: 'A tool the rulebook does not declare, with otherwise "deny": BLOCK unknown_tool.',
      base, request: greq('shell', 'files', { args: { cmd: 'rm -rf' } }), want: { status: 'BLOCK', reasons: ['unknown_tool@builtin'] } });
    add(f, { id: 'd1-unknown-scope-refused', principle: [4], description: 'A scope the rulebook does not declare: BLOCK scope_declared.',
      base, request: greq('read', 'nowhere'), want: { status: 'BLOCK', reasons: ['scope_declared@builtin'] } });
    add(f, { id: 'd1-tool-outside-its-scopes-refused', principle: [4], description: 'A declared tool called in a declared scope it does not list (pay in files): BLOCK scope_permits_tool.',
      base, request: greq('pay', 'files', { args: { amount: 1 }, facts: { projected_spend: 1 } }), want: { status: 'BLOCK', reasons: ['scope_permits_tool@builtin'] } });
    add(f, { id: 'd1-missing-derived-fact-refused', principle: [4], description: 'A fact the tool requires (projected_spend, the harness\'s derived fact) that is absent: BLOCK required_facts — never computed, never defaulted.',
      base, request: greq('pay', 'bank', { args: { amount: 1 } }), want: { status: 'BLOCK', reasons: ['required_facts@builtin'] } });
    add(f, { id: 'd1-principal-required', principle: [4], description: 'A /1 request must name its principal: without principal.id it is incomplete, BLOCK required_facts.',
      base, request: { participant: worker, tool: 'read', scope: 'files', facts: {} } as unknown as GovernanceRequest, want: { status: 'BLOCK', reasons: ['required_facts@builtin'] } });
    add(f, { id: 'd1-scope-role-limit-derived-never-rule', principle: [8, 4], description: 'A scope\'s denyRoles compile to the never rule scope_role_limits:<scope>:deny, checked before anything else: a reader in mail is BLOCK on it even though its role would also lack the tool.',
      base, request: greq('send', 'mail', { participant: { id: 'r-1', kind: 'agent', roleId: 'reader' }, args: { to: 'x.example' }, facts: { external: false } }), want: { status: 'BLOCK', reasons: ['scope_role_limits:mail:deny@agent'] } });
    add(f, { id: 'd1-findings-in-tool-words', principle: [7, 5], description: 'The conflict check speaks /1 too: two identical write rules are a duplicate whose witness names tool, scope and principal and carries the bound argument as args; matches() must agree on it.',
      govInput: desk([grule('w1', { answer: 'deny' }, { does: 'write', where: 'files' }), grule('w2', { answer: 'deny' }, { does: 'write', where: 'files' })]), want: { findings: ['duplicate:certain:w1+w2'] } });
    add(f, { id: 'd1-arg-bound-to-undeclared-fact-rejected', principle: [4], description: 'A tool whose argument binds to an undeclared fact is invalid.',
      base, tamper: rb => { const t = (rb as unknown as GovernanceRulebook).tools.find(x => x.id === 'write')!; t.args!.path = { fact: 'nowhere' }; }, want: { error: true } });
    add(f, { id: 'd1-tool-scope-undeclared-rejected', principle: [4], description: 'A tool listing a scope the rulebook does not declare is invalid.',
      base, tamper: rb => { (rb as unknown as GovernanceRulebook).tools.find(x => x.id === 'pay')!.scopes = ['vault']; }, want: { error: true } });
    add(f, { id: 'd1-builtin-missing-rejected', principle: [4], description: 'A /1 rulebook whose builtin list lacks args_wellformed is invalid.',
      base, tamper: rb => { rb.builtin = rb.builtin.filter(b => b.id !== 'args_wellformed'); }, want: { error: true } });
    add(f, { id: 'd1-stripped-scope-role-rule-rejected', principle: [8, 4], description: 'INTEGRITY: the derived scope_role_limits rule removed (fingerprint recomputed) is invalid: validation re-derives it from the scope.',
      base, tamper: rb => { rb.rules = rb.rules.filter(r => r.id !== 'scope_role_limits:mail:deny'); }, want: { error: true } });
    const v0 = { ...JSON.parse(JSON.stringify(deskRb)), format: 'neuroverse-governance/0' } as Record<string, unknown>;
    add(f, { id: 'd1-other-governance-version-refused', principle: [4, 5], description: 'VERSION HANDLING: a rulebook declaring neuroverse-governance/0 is refused by validation with a message naming it and the migration.',
      rulebook: v0, want: { error: true } });
    add(f, { id: 'd1-other-governance-version-refused-by-evaluator', principle: [4, 5], description: 'The evaluator refuses it the same way: BLOCK rulebook_version, never a decision on its contents.',
      rulebook: v0, request: greq('read', 'files'), want: { status: 'BLOCK', reasons: ['rulebook_version@builtin'] } });
  }

  // d2 — delegation stays bounded
  {
    const f = 'd2-delegation.json', base = 'desk';
    const sub = (roleId: string, by: string) => ({ id: 'sub-1', kind: 'agent', roleId, delegatedBy: by });
    add(f, { id: 'd2-one-link-chain-permitted', principle: [8, 2], description: 'A delegate whose own role and whose delegator\'s role both list the tool: ALLOW, with the delegation check recorded.',
      base, request: greq('read', 'files', { participant: sub('reader', 'w-1'), delegation: [{ id: 'w-1', roleId: 'worker' }] }), want: { status: 'ALLOW', reasons: ['role_permits_tool@builtin', 'delegation_exceeds_authority@builtin'] } });
    add(f, { id: 'd2-link-1-lacks-tool', principle: [2, 4], description: 'DELEGATED AUTHORITY NEVER GROWS: a worker-role delegate acting for a reader may not write, because the reader could not: BLOCK delegation_exceeds_authority naming link 1.',
      base, request: greq('write', 'files', { participant: sub('worker', 'r-1'), delegation: [{ id: 'r-1', roleId: 'reader' }], args: { path: 'a.md' } }), want: { status: 'BLOCK', reasons: ['delegation_exceeds_authority@builtin'] } });
    add(f, { id: 'd2-link-2-lacks-tool', principle: [2, 4], description: 'A two-link chain where the second link cannot write: BLOCK delegation_exceeds_authority (the first link permitting it does not help).',
      base, request: greq('write', 'files', { participant: sub('worker', 'r-1'), delegation: [{ id: 'w-1', roleId: 'worker' }, { id: 'r-1', roleId: 'reader' }], args: { path: 'a.md' } }), want: { status: 'BLOCK', reasons: ['delegation_exceeds_authority@builtin'] } });
    add(f, { id: 'd2-acting-role-lacks-tool-first', principle: [4], description: 'The acting role is checked before the chain: a reader delegate asked to write is BLOCK role_permits_tool even though its delegator could.',
      base, request: greq('write', 'files', { participant: sub('reader', 'w-1'), delegation: [{ id: 'w-1', roleId: 'worker' }], args: { path: 'a.md' } }), want: { status: 'BLOCK', reasons: ['role_permits_tool@builtin'] } });
    add(f, { id: 'd2-delegated-by-without-chain', principle: [4], description: 'delegatedBy without the harness\'s delegation chain is an incomplete request: BLOCK required_facts (the engine never assembles a chain itself).',
      base, request: greq('read', 'files', { participant: sub('reader', 'w-1') }), want: { status: 'BLOCK', reasons: ['required_facts@builtin'] } });
    add(f, { id: 'd2-chain-without-delegated-by', principle: [4], description: 'A delegation chain on a participant that names no delegator: BLOCK required_facts.',
      base, request: greq('read', 'files', { delegation: [{ id: 'w-1', roleId: 'worker' }] }), want: { status: 'BLOCK', reasons: ['required_facts@builtin'] } });
    add(f, { id: 'd2-last-link-mismatch', principle: [4], description: 'The chain\'s last link must be the delegator: a mismatch is BLOCK required_facts.',
      base, request: greq('read', 'files', { participant: sub('reader', 'w-1'), delegation: [{ id: 'w-2', roleId: 'worker' }] }), want: { status: 'BLOCK', reasons: ['required_facts@builtin'] } });
    add(f, { id: 'd2-undeclared-chain-role', principle: [4], description: 'A link holding a role the rulebook does not declare: BLOCK role_declared.',
      base, request: greq('read', 'files', { participant: sub('reader', 'x-1'), delegation: [{ id: 'x-1', roleId: 'ghost' }] }), want: { status: 'BLOCK', reasons: ['role_declared@builtin'] } });
    add(f, { id: 'd2-never-rule-before-delegation', principle: [8], description: 'Never rules still come first: a reader delegate in mail is BLOCK on the scope\'s never rule before any delegation check.',
      base, request: greq('read', 'mail', { participant: sub('reader', 'w-1'), delegation: [{ id: 'w-1', roleId: 'worker' }] }), want: { status: 'BLOCK', reasons: ['scope_role_limits:mail:deny@agent'] } });
    add(f, { id: 'd2-mission-binds-delegate', principle: [3, 8], description: 'A mission\'s rules bind delegates: under m1 a worker delegate may not send (not permitted by the mission): BLOCK mission_tools.',
      base: 'desk-mission', request: greq('send', 'mail', { participant: sub('worker', 'w-1'), delegation: [{ id: 'w-1', roleId: 'worker' }], args: { to: 'x.example' }, facts: { external: false } }), want: { status: 'BLOCK', reasons: ['mission_tools@plan'] } });
  }

  // d3 — approvals bound to arguments
  {
    const f = 'd3-bound-approvals.json', base = 'desk-signed';
    const NOW = '2026-10-16T14:05:00Z', issuedAt = '2026-10-16T14:00:00Z', expiresAt = '2026-10-16T14:30:00Z';
    const pay = (patch: Partial<GovernanceRequest> = {}): GovernanceRequest => greq('pay', 'bank', { args: { amount: 120 }, facts: { projected_spend: 120 }, history: [], now: NOW, consumedApprovals: [], ...patch });
    const digest120 = fingerprint({ amount: 120 });
    const bind = { ruleId: 'pay_waits', rulebookFingerprint: signedRb.fingerprint, principalId: 'sam', participantId: 'w-1', tool: 'pay', scope: 'bank', argsDigest: digest120, nonce: 'g-1', issuedAt, expiresAt };
    const ownerKey = { keyId: 'test-owner', privateKey: SEED_OWNER };
    const ok = await signGovernanceApproval({ id: 'sam', authority: 'owner', ...bind }, ownerKey);
    const forAmount1200 = await signGovernanceApproval({ id: 'sam', authority: 'owner', ...bind, argsDigest: fingerprint({ amount: 1200 }), nonce: 'g-2' }, ownerKey);
    const expired = await signGovernanceApproval({ id: 'sam', authority: 'owner', ...bind, issuedAt: '2026-10-16T12:00:00Z', expiresAt: '2026-10-16T12:30:00Z', nonce: 'g-3' }, ownerKey);
    const notYet = await signGovernanceApproval({ id: 'sam', authority: 'owner', ...bind, issuedAt: '2026-10-16T14:10:00Z', nonce: 'g-4' }, ownerKey);
    const otherRule = await signGovernanceApproval({ id: 'sam', authority: 'owner', ...bind, ruleId: 'cap', nonce: 'g-5' }, ownerKey);
    const otherPrincipal = await signGovernanceApproval({ id: 'sam', authority: 'owner', ...bind, principalId: 'kim', nonce: 'g-6' }, ownerKey);
    const otherParticipant = await signGovernanceApproval({ id: 'sam', authority: 'owner', ...bind, participantId: 'w-2', nonce: 'g-7' }, ownerKey);
    const otherTool = await signGovernanceApproval({ id: 'sam', authority: 'owner', ...bind, tool: 'write', nonce: 'g-8' }, ownerKey);
    const otherScope = await signGovernanceApproval({ id: 'sam', authority: 'owner', ...bind, scope: 'files', nonce: 'g-9' }, ownerKey);
    const otherRulebook = await signGovernanceApproval({ id: 'sam', authority: 'owner', ...bind, rulebookFingerprint: '0'.repeat(64), nonce: 'g-10' }, ownerKey);
    const byAgent = await signGovernanceApproval({ id: 'bot', authority: 'agent', ...bind, nonce: 'g-11' }, { keyId: 'test-agent', privateKey: SEED_AGENT });
    const v3Shaped = await signApproval({ id: 'sam', authority: 'owner', ruleId: 'pay_waits', rulebookFingerprint: signedRb.fingerprint, participantId: 'w-1', action: 'pay', areaId: 'bank', nonce: 'g-12', issuedAt, expiresAt }, ownerKey);
    const withApproval = (a: unknown, patch: Partial<GovernanceRequest> = {}) => pay({ ...patch, facts: { projected_spend: 120, approvedBy: a } });

    add(f, { id: 'd3-pause-asks-with-args-digest', principle: [6], description: 'A worker\'s payment waits for the owner; the approval request names the principal, the tool, the scope and the digest of the exact arguments to sign for.',
      base, request: pay(), want: { status: 'PAUSE', reasons: ['pay_waits@owner'], asks: ['pay_waits@owner'] } });
    add(f, { id: 'd3-bound-approval-clears', principle: [6, 2], description: 'A signed owner approval bound to this rule, rulebook, principal, participant, tool, scope and argument digest, unused and inside its window, clears the wait: ALLOW with approvalsUsed.',
      base, verified: true, request: withApproval(ok), want: { status: 'ALLOW', reasons: ['role_permits_tool@builtin', 'pay_waits@owner'], used: ['pay_waits:g-1'] } });
    add(f, { id: 'd3-args-changed-rejected', principle: [6, 4], description: 'RULING 2: the same approval presented for amount 1200 — the digest differs — grants nothing: PAUSE, approvalsRejected code "args", a fresh approval request.',
      base, verified: true, request: withApproval(ok, { args: { amount: 1200 } }), want: { status: 'PAUSE', reasons: ['pay_waits@owner'], asks: ['pay_waits@owner'], rejected: ['sam:args'] } });
    add(f, { id: 'd3-approval-for-other-amount-rejected', principle: [6, 4], description: 'An approval validly signed for amount 1200 does not clear a call for 120: code "args". Approving one amount never approves another.',
      base, verified: true, request: withApproval(forAmount1200), want: { status: 'PAUSE', reasons: ['pay_waits@owner'], asks: ['pay_waits@owner'], rejected: ['sam:args'] } });
    add(f, { id: 'd3-expired-rejected', principle: [6], description: 'RULING 1: an expired approval is rejected (code "expired"), the wait stays PAUSE; it is never a BLOCK.',
      base, verified: true, request: withApproval(expired), want: { status: 'PAUSE', reasons: ['pay_waits@owner'], asks: ['pay_waits@owner'], rejected: ['sam:expired'] } });
    add(f, { id: 'd3-not-yet-valid-rejected', principle: [6], description: 'An approval issued after now: code "not_yet_valid".',
      base, verified: true, request: withApproval(notYet), want: { status: 'PAUSE', reasons: ['pay_waits@owner'], asks: ['pay_waits@owner'], rejected: ['sam:not_yet_valid'] } });
    add(f, { id: 'd3-replayed-rejected', principle: [6], description: 'An approval whose nonce the caller already consumed: code "replayed".',
      base, verified: true, request: withApproval(ok, { consumedApprovals: ['g-1'] }), want: { status: 'PAUSE', reasons: ['pay_waits@owner'], asks: ['pay_waits@owner'], rejected: ['sam:replayed'] } });
    add(f, { id: 'd3-wrong-rule-rejected', principle: [6], description: 'An approval for another rule: code "rule".',
      base, verified: true, request: withApproval(otherRule), want: { status: 'PAUSE', reasons: ['pay_waits@owner'], asks: ['pay_waits@owner'], rejected: ['sam:rule'] } });
    add(f, { id: 'd3-wrong-principal-rejected', principle: [6], description: 'An approval given for another principal: code "principal".',
      base, verified: true, request: withApproval(otherPrincipal), want: { status: 'PAUSE', reasons: ['pay_waits@owner'], asks: ['pay_waits@owner'], rejected: ['sam:principal'] } });
    add(f, { id: 'd3-wrong-participant-rejected', principle: [6], description: 'An approval for another participant: code "participant".',
      base, verified: true, request: withApproval(otherParticipant), want: { status: 'PAUSE', reasons: ['pay_waits@owner'], asks: ['pay_waits@owner'], rejected: ['sam:participant'] } });
    add(f, { id: 'd3-wrong-tool-rejected', principle: [6], description: 'An approval for another tool: code "tool".',
      base, verified: true, request: withApproval(otherTool), want: { status: 'PAUSE', reasons: ['pay_waits@owner'], asks: ['pay_waits@owner'], rejected: ['sam:tool'] } });
    add(f, { id: 'd3-wrong-scope-rejected', principle: [6], description: 'An approval for another scope: code "scope".',
      base, verified: true, request: withApproval(otherScope), want: { status: 'PAUSE', reasons: ['pay_waits@owner'], asks: ['pay_waits@owner'], rejected: ['sam:scope'] } });
    add(f, { id: 'd3-wrong-rulebook-rejected', principle: [6], description: 'An approval given under another rulebook fingerprint: code "rulebook".',
      base, verified: true, request: withApproval(otherRulebook), want: { status: 'PAUSE', reasons: ['pay_waits@owner'], asks: ['pay_waits@owner'], rejected: ['sam:rulebook'] } });
    add(f, { id: 'd3-insufficient-authority-rejected', principle: [2, 6], description: 'A valid approval signed by a key trusted for the agent authority cannot satisfy a wait for the owner: code "insufficient".',
      base, verified: true, request: withApproval(byAgent), want: { status: 'PAUSE', reasons: ['pay_waits@owner'], asks: ['pay_waits@owner'], rejected: ['bot:insufficient'] } });
    add(f, { id: 'd3-unverified-handle-rejected', principle: [6], description: 'The pure evaluator, given the signed approval as request data, clears nothing: code "unverified" (verify first, or use verifyAndEvaluate).',
      base, request: withApproval(ok), want: { status: 'PAUSE', reasons: ['pay_waits@owner'], asks: ['pay_waits@owner'], rejected: ['sam:unverified'] } });
    add(f, { id: 'd3-v3-approval-at-v1-door-rejected', principle: [6, 4], description: 'A robot-domain-rules-approval/3 approval (bound to an action and an area) at a /1 rulebook is rejected by spec, never reinterpreted: code "spec".',
      base, verified: true, request: withApproval(v3Shaped), want: { status: 'PAUSE', reasons: ['pay_waits@owner'], asks: ['pay_waits@owner'], rejected: ['sam:spec'] } });
    add(f, { id: 'd3-rejection-carries-no-signature', principle: [5, 6], description: 'A decision names a rejected approval by id, nonce and code only: the decision JSON contains no "signature", "publicKey" or "keyId" anywhere.',
      base, verified: true, request: withApproval(forAmount1200), forbidKeys: ['signature', 'publicKey', 'privateKey', 'keyId'], want: { status: 'PAUSE', reasons: ['pay_waits@owner'], asks: ['pay_waits@owner'], rejected: ['sam:args'] } });
    const refused = (n: number) => Array.from({ length: n }, (_, i) => ({ tool: 'approval_refused', scope: 'bank', at: `2026-10-16T13:${String(30 + i * 5).padStart(2, '0')}:00Z` }));
    add(f, { id: 'd3-repeated-refusals-history-rule', principle: [3, 6], description: 'Repeated refusals are the harness\'s to record and a rule\'s to judge: with three approval_refused entries in the last hour, cool_off denies the payment outright.',
      base, request: pay({ history: refused(3) }), want: { status: 'BLOCK', reasons: ['cool_off@owner'] } });
    add(f, { id: 'd3-two-refusals-still-waits', principle: [3, 6], description: 'With two refusals the rule does not match and the payment still waits.',
      base, request: pay({ history: refused(2) }), want: { status: 'PAUSE', reasons: ['pay_waits@owner'], asks: ['pay_waits@owner'] } });
    // A /1 approval at a /3 door (the robot rulebook with trusted keys): verified against the same key, then rejected by the /3 evaluator by spec.
    const signed3 = bases.signed as Rulebook;
    const v1AtV3 = await signGovernanceApproval({ id: 'ann', authority: 'high', ruleId: 'ask_high', rulebookFingerprint: signed3.fingerprint, principalId: 'sam', participantId: 'b-1', tool: 'go', scope: 'yard', argsDigest: fingerprint({}), nonce: 'g-13', issuedAt: '2026-10-12T09:00:00Z', expiresAt: '2026-10-12T09:30:00Z' }, { keyId: 'test-high', privateKey: SEED_HIGH });
    add(f, { id: 'd3-v1-approval-at-v3-door-rejected', principle: [6, 4], description: 'A neuroverse-governance-approval/1 approval at a /3 rulebook is refused by spec (the /3 door does not reinterpret it): PAUSE, the wait stays.',
      base: 'signed', verified: true, request: { ...req('go', 'yard', { approvedBy: v1AtV3 }), now: '2026-10-12T09:05:00Z' }, want: { status: 'PAUSE', reasons: ['ask_high@high'], asks: ['ask_high@high'] } });
    // verify vectors
    const gvec = async (id: string, description: string, approval: unknown, okWant: boolean) => {
      const r = await verifyApproval(approval, keys);
      if (r.ok !== okWant) fail(id, `verify: want ${okWant}, got ${r.ok} (${r.reason})`);
      (files[f] ??= []).push({ id, principle: [2, 6], description, client: true, approval, trustedKeys: keys, expect: { verify: { ok: okWant }, ...(r.reason ? { note: r.reason } : {}) } });
      count++;
    };
    await gvec('d3-verify-ok', 'A /1 approval signed by a trusted key verifies (TEST ONLY seeds: owner 55…55, agent 66…66).', ok, true);
    await gvec('d3-verify-bad-signature', 'A flipped signature does not verify.', { ...ok, signature: ok.signature.replace(/^./, c => (c === '0' ? '1' : '0')) }, false);
    await gvec('d3-verify-missing-args-digest', 'A /1 approval without argsDigest is incomplete and does not verify.', (() => { const { argsDigest: _d, ...rest } = ok; return rest; })(), false);
    await gvec('d3-verify-key-not-trusted-for-authority', 'A key trusted for the agent authority cannot sign as the owner.', await signGovernanceApproval({ id: 'bot', authority: 'owner', ...bind, nonce: 'g-14' }, { keyId: 'test-agent', privateKey: SEED_AGENT }), false);
  }

  // d4 — limits and projected spend
  {
    const f = 'd4-limits-and-spend.json', base = 'desk';
    const bossPay = (projected: number | undefined, amount = 100) => greq('pay', 'bank', { participant: boss, args: { amount }, facts: projected === undefined ? {} : { projected_spend: projected } });
    add(f, { id: 'd4-projected-spend-at-cap-allow', principle: [9, 3], description: 'RULING 3: the harness supplies projected_spend (its reserve-then-commit arithmetic); exactly at the cap of 500 the rule (> 500) does not match: ALLOW.',
      base, request: bossPay(500), want: { status: 'ALLOW', reasons: ['role_permits_tool@builtin'] } });
    add(f, { id: 'd4-projected-spend-one-over-deny', principle: [9, 3], description: 'One over the cap: BLOCK cap. The engine compares; it never adds.',
      base, request: bossPay(501), want: { status: 'BLOCK', reasons: ['cap@owner'] } });
    add(f, { id: 'd4-projected-spend-missing-refused', principle: [4], description: 'Without the projected fact the payment is BLOCK required_facts: a missing total is never zero.',
      base, request: bossPay(undefined), want: { status: 'BLOCK', reasons: ['required_facts@builtin'] } });
    add(f, { id: 'd4-first-reservation-passes', principle: [9], description: 'Two 300s against 400 remaining, as the harness projects them: the first reservation (100 spent + 300 held = 400) passes…',
      base, request: bossPay(400, 300), want: { status: 'ALLOW', reasons: ['role_permits_tool@builtin'] } });
    add(f, { id: 'd4-second-reservation-denied', principle: [9], description: '…and the second, projected while the first is still held (100 + 300 + 300 = 700), is denied. The atomic reserve is the harness\'s; the engine only sees the fact (the concurrent proof is in the adapter tests).',
      base, request: bossPay(700, 300), want: { status: 'BLOCK', reasons: ['cap@owner'] } });
    add(f, { id: 'd4-limit-within-allow', principle: [9], description: 'A limit is a ceiling: a write asking 500 bytes under a 1000-byte limit is ALLOW with the limit reported.',
      base, request: greq('write', 'files', { args: { path: 'a.md', bytes: 500 } }), want: { status: 'ALLOW', reasons: ['role_permits_tool@builtin', 'small_writes@owner'], limits: { max_bytes: 1000 } } });
    add(f, { id: 'd4-limit-over-limits', principle: [9], description: 'Asking 2000 bytes: LIMIT, go ahead within 1000.',
      base, request: greq('write', 'files', { args: { path: 'a.md', bytes: 2000 } }), want: { status: 'LIMIT', reasons: ['small_writes@owner'], limits: { max_bytes: 1000 } } });
    add(f, { id: 'd4-limit-unbounded-limits', principle: [9], description: 'No requested size at all: LIMIT, the ceiling applies.',
      base, request: greq('write', 'files', { args: { path: 'a.md' } }), want: { status: 'LIMIT', reasons: ['small_writes@owner'], limits: { max_bytes: 1000 } } });
  }

  // d5 — missions: plans as tightening overlays
  {
    const f = 'd5-plans.json', base = 'desk-mission';
    const readDone = [{ tool: 'read', scope: 'files' }];
    add(f, { id: 'd5-mission-denies-unpermitted-tool', principle: [3, 2], description: 'A mission permits read, write and pay; send is denied by the compiled rule mission_tools at the plan authority.',
      base, request: greq('send', 'mail', { args: { to: 'x.example' }, facts: { external: false } }), want: { status: 'BLOCK', reasons: ['mission_tools@plan'] } });
    add(f, { id: 'd5-mission-denies-scope', principle: [3, 2], description: 'write is permitted only in files: a write to the shared drive is BLOCK write_in_files_only (history carries the read, so the order rule is satisfied).',
      base, request: greq('write', 'shared', { args: { path: 'a.md' }, history: readDone }), want: { status: 'BLOCK', reasons: ['write_in_files_only@plan'] } });
    add(f, { id: 'd5-mission-approval-wait', principle: [3, 6], description: 'A mission can add a wait: the boss, who pays freely under the permanent rules, waits for the owner under m1 (mission_pay_approval).',
      base, request: greq('pay', 'bank', { participant: boss, args: { amount: 50 }, facts: { projected_spend: 50 } }), want: { status: 'PAUSE', reasons: ['mission_pay_approval@plan'], asks: ['mission_pay_approval@owner'] } });
    add(f, { id: 'd5-order-violated', principle: [3], description: 'PLAN ORDER AS HISTORY: write before any read is BLOCK read_first (the compiled rule counts read in the harness-supplied history, < 1).',
      base, request: greq('write', 'files', { args: { path: 'a.md' }, history: [] }), want: { status: 'BLOCK', reasons: ['read_first@plan'] } });
    add(f, { id: 'd5-order-satisfied', principle: [3], description: 'With a read in history the write proceeds under the permanent limit rule: LIMIT small_writes.',
      base, request: greq('write', 'files', { args: { path: 'a.md' }, history: readDone }), want: { status: 'LIMIT', reasons: ['small_writes@owner'], limits: { max_bytes: 1000 } } });
    add(f, { id: 'd5-order-needs-history', principle: [4], description: 'The order rule needs history: a write with none supplied is BLOCK required_facts (a harness must always supply it).',
      base, request: greq('write', 'files', { args: { path: 'a.md' } }), want: { status: 'BLOCK', reasons: ['required_facts@builtin'] } });
    add(f, { id: 'd5-mission-cannot-loosen-never-rule', principle: [2, 3], description: 'A mission that permits send does not loosen the law: external mail is still BLOCK no_external.',
      base: 'desk', mission: { format: 'neuroverse-governance-plan/1', id: 'm2', objective: 'send mail', permits: [{ tool: 'send' }] }, request: greq('send', 'mail', { args: { to: 'x.example' }, facts: { external: true } }), want: { status: 'BLOCK', reasons: ['no_external@law'] } });
    add(f, { id: 'd5-mission-cannot-loosen-cap', principle: [2, 3], description: 'A mission that permits pay does not loosen the owner\'s cap: 501 projected is still BLOCK cap.',
      base, request: greq('pay', 'bank', { participant: boss, args: { amount: 1 }, facts: { projected_spend: 501 } }), want: { status: 'BLOCK', reasons: ['cap@owner'] } });
    add(f, { id: 'd5-mission-fingerprint-covers-plan', principle: [5], description: 'The mission rulebook has its own fingerprint (every decision under it carries it): the base rulebook\'s fingerprint is not it.',
      base, request: greq('read', 'files'), want: { status: 'ALLOW', reasons: ['role_permits_tool@builtin'] } });
    if (missionRb.fingerprint === deskRb.fingerprint) fail('d5-mission-fingerprint-covers-plan', 'mission fingerprint equals the base fingerprint');
    const gplan = (steps: GovernancePlan['steps'], patch: Partial<GovernancePlan> = {}): GovernancePlan => ({ principal: sam, participant: worker, initialFacts: {}, steps, ...patch });
    add(f, { id: 'd5-plan-read-then-write', principle: [3], description: 'evaluatePlan on a /1 plan: read then write in files satisfies read_first (the first step is in the history the second sees), must_write and one_pay; the write is LIMIT without a size.',
      base, plan: gplan([{ tool: 'read', scope: 'files' }, { tool: 'write', args: { path: 'a.md' } }]), want: { status: 'LIMIT', steps: ['ALLOW', 'LIMIT'], planChecks: ['one_pay:ALLOW', 'must_write:ALLOW'] } });
    add(f, { id: 'd5-plan-write-first-refused', principle: [3], description: 'A plan that writes before reading: the write step is BLOCK read_first.',
      base, plan: gplan([{ tool: 'write', scope: 'files', args: { path: 'a.md' } }]), want: { status: 'BLOCK', steps: ['BLOCK'], planChecks: ['one_pay:ALLOW', 'must_write:ALLOW'], firstViolation: 'read_first@plan#0:step' } });
    add(f, { id: 'd5-plan-missing-required-step', principle: [3], description: 'AT_LEAST: a plan with no write breaks must_write (requires), cited at the last step.',
      base, plan: gplan([{ tool: 'read', scope: 'files' }, { tool: 'read' }]), want: { status: 'BLOCK', steps: ['ALLOW', 'ALLOW'], planChecks: ['one_pay:ALLOW', 'must_write:BLOCK'], firstViolation: 'must_write@plan#1:plan' } });
    add(f, { id: 'd5-plan-two-payments-refused', principle: [3], description: 'AT_MOST: two payments break one_pay; each payment step also waits (pay_waits and mission_pay_approval), and the approval requests are collected.',
      base, plan: gplan([{ tool: 'read', scope: 'files' }, { tool: 'write', args: { path: 'a.md' } }, { tool: 'pay', scope: 'bank', args: { amount: 1 }, facts: { projected_spend: 1 } }, { tool: 'pay', args: { amount: 1 }, facts: { projected_spend: 2 } }]),
      want: { status: 'BLOCK', steps: ['ALLOW', 'LIMIT', 'PAUSE', 'PAUSE'], planChecks: ['one_pay:BLOCK', 'must_write:ALLOW'], firstViolation: 'one_pay@plan#3:plan', asks: ['pay_waits@owner', 'mission_pay_approval@owner'] } });
    add(f, { id: 'd5-plan-step-in-its-own-scope', principle: [3], description: 'A /1 step lands in the scope it names (no continuity check: a call does not carry the participant): the write to the shared drive is judged there and the mission denies it.',
      base, plan: gplan([{ tool: 'read', scope: 'files' }, { tool: 'write', scope: 'shared', args: { path: 'a.md' } }]), want: { status: 'BLOCK', steps: ['ALLOW', 'BLOCK'], planChecks: ['one_pay:ALLOW', 'must_write:ALLOW'], firstViolation: 'write_in_files_only@plan#1:step' } });
    add(f, { id: 'd5-mission-record-malformed-rejected', principle: [4], description: 'A mission rulebook whose mission record is malformed is invalid.',
      base, tamper: rb => { (rb as unknown as GovernanceRulebook).mission = { id: '' } as unknown as GovernanceRulebook['mission']; }, want: { error: true } });
  }

  // d7 — backtest of a /1 log (SPEC.md § 16.11): the adapter's requests with an outcome, through the desk rulebooks.
  {
    const f = 'd7-backtest.json';
    const at = (h: number, m: number) => `2026-10-16T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;
    const ev = (t: string, request: GovernanceRequest, outcome?: BacktestEvent['outcome']): BacktestEvent => ({ at: t, request, ...(outcome ? { outcome } : {}) });
    const bt = (id: string, description: string, base: string, events: BacktestEvent[], want: NonNullable<Want['backtest']>, options?: BacktestOptions) =>
      add(f, { id, principle: [5, 3], description, base, events, options, want: { backtest: want } });
    bt('d7-totals-rows-and-scopes', 'A /1 log replayed through a /1 rulebook: one row per event with tool, scope, status and reasons; totals; counts by scope and by role; every rule\'s matched/decided counts; the rulebook\'s fingerprint.', 'desk',
      [ev(at(9, 0), greq('read', 'files')), ev(at(9, 1), greq('write', 'files', { args: { path: 'a.md', bytes: 10 } })), ev(at(9, 2), greq('write', 'files', { args: { path: 'a.md' } })), ev(at(9, 3), greq('pay', 'bank', { participant: boss, args: { amount: 10 }, facts: { projected_spend: 600 } })), ev(at(9, 4), greq('pay', 'bank', { args: { amount: 10 }, facts: { projected_spend: 10 } }))],
      { totals: '2/1/1/1/0', neverFired: ['scope_role_limits:mail:deny', 'no_external'], stalls: ['cap:BLOCK:1', 'pay_waits:PAUSE:1'] });
    bt('d7-missing-facts-and-gaps', 'A log that lacks what the rulebook needs is reported, never guessed: a payment without projected_spend is a missing-facts row (named by fact), a call of an undeclared tool is a gap (by tool), a call with malformed arguments a missing-facts row named args.', 'desk',
      [ev(at(10, 0), greq('pay', 'bank', { participant: boss, args: { amount: 10 } })), ev(at(10, 1), greq('shell', 'files', { args: {} })), ev(at(10, 2), greq('write', 'files', { args: { path: 7 } })), ev(at(10, 3), greq('write', 'files', { args: 'a.md' }))],
      { totals: '0/0/0/1/3', neverFired: ['scope_role_limits:mail:deny', 'cap', 'pay_waits', 'no_external', 'small_writes'], stalls: ['unknown_tool:BLOCK:1'], gaps: ['shell:1'], missing: ['args:2', 'projected_spend:1'] });
    bt('d7-history-built-from-earlier-events', 'Under the mission rulebook, the order rule reads the history the backtest builds from this participant\'s earlier events (tool, scope, at): a write before any read is refused, a write after a read is not; a request that carries its own history is decided on it.', 'desk-mission',
      [ev(at(11, 0), greq('write', 'files', { args: { path: 'a.md' } })), ev(at(11, 1), greq('read', 'files')), ev(at(11, 2), greq('write', 'files', { args: { path: 'a.md' } })), ev(at(11, 3), greq('write', 'files', { args: { path: 'b.md' }, history: [] }))],
      { totals: '1/1/0/2/0', neverFired: ['scope_role_limits:mail:deny', 'cap', 'pay_waits', 'no_external', 'mission_tools', 'write_in_files_only', 'mission_pay_approval'], stalls: ['read_first:BLOCK:2'], conflicts: ['small_writes+read_first:2'] });
    bt('d7-differences-rule-vs-record', 'The record\'s outcome is reported, never decided on: a refused call the record says happened, and an allowed call it says did not, are differences; the report does not say which is right.', 'desk',
      [ev(at(12, 0), greq('send', 'mail', { args: { to: 'x.example' }, facts: { external: true } }), 'happened'), ev(at(12, 1), greq('read', 'files'), 'did_not_happen'), ev(at(12, 2), greq('read', 'files'), 'happened'), ev(at(12, 3), greq('read', 'files'), 'unknown')],
      { totals: '3/0/0/1/0', neverFired: ['scope_role_limits:mail:deny', 'cap', 'pay_waits', 'small_writes'], stalls: ['no_external:BLOCK:1'], differences: ['0:BLOCK:happened', '1:ALLOW:did_not_happen'] });
    bt('d7-conflicts-that-occurred', 'A finding counts as occurred when both of its rules matched a recorded request: under the mission, a worker\'s payment matches both pay_waits and mission_pay_approval (two waits for the same owner), and the cap on an over-budget one.', 'desk-mission',
      [ev(at(13, 0), greq('pay', 'bank', { args: { amount: 10 }, facts: { projected_spend: 600 } }))],
      { totals: '0/0/0/1/0', neverFired: ['scope_role_limits:mail:deny', 'no_external', 'small_writes', 'mission_tools', 'write_in_files_only', 'read_first'], stalls: ['cap:BLOCK:1'], conflicts: ['pay_waits+mission_pay_approval:1'] });
    const spendLog = [ev(at(14, 0), greq('pay', 'bank', { participant: boss, args: { amount: 300 }, facts: { projected_spend: 300 } })), ev(at(14, 1), greq('pay', 'bank', { participant: boss, args: { amount: 300 }, facts: { projected_spend: 600 } })), ev(at(14, 2), greq('pay', 'bank', { participant: boss, args: { amount: 300 }, facts: { projected_spend: 900 } }))];
    add(f, { id: 'd7-compare-raised-cap', principle: [5, 9], description: 'Current versus proposed on the same log: raising the cap from 500 to 750 newly allows the payment projected at 600 and still blocks the one at 900; nothing becomes blocked.',
      base: 'desk', events: spendLog, govProposed: desk(DESK_RULES.map(r => (r.id === 'cap' ? grule('cap', { answer: 'deny' }, { does: 'pay', when: [{ fact: 'projected_spend', op: '>', value: 750 }] }) : r))), want: { comparison: { newlyBlocked: 0, newlyAllowed: 1, other: 0 } } });
  }

  // d6 — enforcement through the tool-call adapter (SPEC.md § 16.9): run with a spy executor against a harness built from data.
  {
    const f = 'd6-enforcement.json';
    const session = { principal: sam, participant: worker };
    const enforce = async (id: string, description: string, base: string, call: unknown, harness: HarnessData, want: { status: string; executed: boolean; reasons?: string[]; limits?: Record<string, number>; error?: string }) => {
      const rulebook = bases[base] as GovernanceRulebook;
      const calls: unknown[] = [];
      const outcome = await govern(call, { ...session, rulebook }, harnessFromData(harness), async (tool, args, ctx) => { calls.push({ tool, args, limits: ctx.limits }); if (harness.fault === 'executor_throws') throw new Error('executor failed (test fault)'); return { ran: tool }; });
      if (outcome.status !== want.status) fail(id, `status: want ${want.status}, got ${outcome.status} (${outcome.decision.reasons.map(r => r.reason).join('; ')})`);
      if (outcome.executed !== want.executed || calls.length !== (want.executed ? 1 : 0)) fail(id, `executed: want ${want.executed}, got ${outcome.executed} (${calls.length} calls)`);
      const reasons = outcome.decision.reasons.map(r => r.ruleId);
      if (want.reasons && JSON.stringify(reasons) !== JSON.stringify(want.reasons)) fail(id, `reasons: want ${JSON.stringify(want.reasons)}, got ${JSON.stringify(reasons)}`);
      const limits = (calls[0] as { limits?: unknown } | undefined)?.limits;
      if (JSON.stringify(limits) !== JSON.stringify(want.limits)) fail(id, `limits: want ${JSON.stringify(want.limits)}, got ${JSON.stringify(limits)}`);
      if ((outcome.error?.stage) !== want.error) fail(id, `error stage: want ${want.error}, got ${outcome.error?.stage}`);
      if (JSON.stringify(outcome).includes('"signature"')) fail(id, 'the outcome carries a signature');
      (files[f] ??= []).push({ id, principle: [3, 4, 9], description, rulebookRef: `rulebooks/${base}.json`, call, session, harness, forbidKeys: ['signature', 'privateKey'], expect: { enforcement: { status: want.status, executed: want.executed, reasons, ...(want.limits ? { limits: want.limits } : {}), ...(want.error ? { error: want.error } : {}) } } });
      count++;
    };
    await enforce('d6-block-never-executes', 'ENFORCEMENT: a call the rules refuse (external mail with the never rule) never reaches the executor.', 'desk',
      { id: 'c1', function: { name: 'send', arguments: JSON.stringify({ to: 'acme.example' }) } }, { scope: 'mail', facts: { external: true } }, { status: 'BLOCK', executed: false, reasons: ['no_external'] });
    await enforce('d6-pause-never-executes', 'A call that waits for approval (a worker\'s payment) never reaches the executor either.', 'desk',
      { function: { name: 'pay', arguments: '{"amount": 50}' } }, { scope: 'bank', ledger: { fact: 'projected_spend', amountArg: 'amount', spent: 0 } }, { status: 'PAUSE', executed: false, reasons: ['pay_waits'] });
    await enforce('d6-allow-executes-once', 'An allowed call runs the executor exactly once (the OpenAI shape with stringified arguments).', 'desk',
      { id: 'c3', function: { name: 'read', arguments: '{}' } }, { scope: 'files' }, { status: 'ALLOW', executed: true, reasons: ['role_permits_tool'] });
    await enforce('d6-limit-executes-with-limits', 'A LIMIT call runs the executor once and hands it the effective limits.', 'desk',
      { name: 'write', args: { path: 'a.md' } }, { scope: 'files' }, { status: 'LIMIT', executed: true, reasons: ['small_writes'], limits: { max_bytes: 1000 } });
    await enforce('d6-malformed-arguments-json', 'Arguments that are not JSON are BLOCK args_wellformed by the adapter; nothing runs.', 'desk',
      { function: { name: 'write', arguments: '{"path": ' } }, { scope: 'files' }, { status: 'BLOCK', executed: false, reasons: ['args_wellformed'], error: 'parse' });
    await enforce('d6-arguments-not-object', 'Arguments that parse to a string are BLOCK args_wellformed; nothing runs.', 'desk',
      { function: { name: 'write', arguments: '"a.md"' } }, { scope: 'files' }, { status: 'BLOCK', executed: false, reasons: ['args_wellformed'], error: 'parse' });
    await enforce('d6-no-tool-name', 'A call naming no tool is BLOCK tool_call_malformed; nothing runs.', 'desk',
      { function: { arguments: '{}' } }, { scope: 'files' }, { status: 'BLOCK', executed: false, reasons: ['tool_call_malformed'], error: 'parse' });
    await enforce('d6-scope-resolver-throws', 'A harness whose scope resolver throws: BLOCK harness_failed, nothing runs.', 'desk',
      { name: 'read' }, { fault: 'scope_throws' }, { status: 'BLOCK', executed: false, reasons: ['harness_failed'], error: 'harness' });
    await enforce('d6-scope-resolver-not-a-string', 'A resolver that returns something other than a scope id: BLOCK harness_failed.', 'desk',
      { name: 'read' }, { fault: 'scope_not_string' }, { status: 'BLOCK', executed: false, reasons: ['harness_failed'], error: 'harness' });
    await enforce('d6-fact-supplier-throws', 'A fact supplier that throws: BLOCK harness_failed, nothing runs.', 'desk',
      { name: 'read' }, { scope: 'files', fault: 'facts_throws' }, { status: 'BLOCK', executed: false, reasons: ['harness_failed'], error: 'harness' });
    await enforce('d6-ledger-throws', 'A spend ledger that throws: BLOCK harness_failed, nothing runs.', 'desk',
      { name: 'pay', args: { amount: 1 } }, { scope: 'bank', fault: 'reserve_throws' }, { status: 'BLOCK', executed: false, reasons: ['harness_failed'], error: 'harness' });
    await enforce('d6-missing-derived-fact', 'A harness that supplies no projected spend for a payment: the evaluator refuses (required_facts); nothing runs.', 'desk',
      { name: 'pay', args: { amount: 1 } }, { scope: 'bank' }, { status: 'BLOCK', executed: false, reasons: ['required_facts'] });
    await enforce('d6-executor-throws-recorded', 'An executor that throws after ALLOW: the outcome records the executor error; the call counts as executed once.', 'desk',
      { name: 'read' }, { scope: 'files', fault: 'executor_throws' }, { status: 'ALLOW', executed: true, reasons: ['role_permits_tool'], error: 'executor' });
    await enforce('d6-projected-spend-from-ledger', 'The harness ledger projects the spend (100 spent + 300 asked = 400): allowed and executed; the engine only compares.', 'desk',
      { name: 'pay', args: { amount: 300 } }, { scope: 'bank', ledger: { fact: 'projected_spend', amountArg: 'amount', spent: 100 } }, { status: 'PAUSE', executed: false, reasons: ['pay_waits'] });
    await enforce('d6-projected-spend-over-cap', 'With 300 already spent, a 300 payment projects 600: BLOCK cap, nothing runs (the boss, who needs no approval).', 'desk',
      { name: 'pay', args: { amount: 300 } }, { scope: 'bank', ledger: { fact: 'projected_spend', amountArg: 'amount', spent: 300 } }, { status: 'BLOCK', executed: false, reasons: ['cap'] });
    await enforce('d6-mission-refuses-through-adapter', 'Under a mission the adapter enforces the mission rulebook: send is BLOCK mission_tools, nothing runs.', 'desk-mission',
      { name: 'send', args: { to: 'x.example' } }, { scope: 'mail', facts: { external: false } }, { status: 'BLOCK', executed: false, reasons: ['mission_tools'] });
    // A /3 rulebook at the adapter: refused by name, nothing runs.
    {
      const id = 'd6-v3-rulebook-refused-at-adapter';
      const calls: unknown[] = [];
      const outcome = await govern({ name: 'go' }, { ...session, rulebook: bases.tiny as unknown as GovernanceRulebook }, harnessFromData({ scope: 'floor' }), async () => { calls.push(1); });
      if (outcome.status !== 'BLOCK' || outcome.executed || calls.length || outcome.decision.reasons[0].ruleId !== 'rulebook_version') fail(id, `want BLOCK rulebook_version not executed, got ${outcome.status} ${JSON.stringify(outcome.decision.reasons)}`);
      (files[f] ??= []).push({ id, principle: [4, 5], description: 'The adapter governs /1 rulebooks only: a /3 rulebook is BLOCK rulebook_version and nothing runs.', rulebookRef: 'rulebooks/tiny.json', call: { name: 'go' }, session, harness: { scope: 'floor' }, expect: { enforcement: { status: 'BLOCK', executed: false, reasons: ['rulebook_version'], error: 'evaluate' } } });
      count++;
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(join(OUT, 'rulebooks'), { recursive: true });
  bases.tiny = compileDomain(tiny([]));
  bases.shared = compileDomain(shared([
    rule('no_looking_outside', { answer: 'deny' }, { does: 'look', where: 'yard' }),
    rule('agents_plan_with_approval', { answer: 'wait', for: 'approval', by: 'tag:staff' }, { who: 'kind:agent', does: 'plan' }),
    rule('non_staff_out_of_lab', { answer: 'deny' }, { who: ['kind:person', '!tag:staff'], where: 'lab' }),
  ]));
  bases.grocery = grocery.rulebook;
  for (const [name, rb] of Object.entries(bases)) writeFileSync(join(OUT, 'rulebooks', `${name}.json`), JSON.stringify(rb, null, 2) + '\n');

  p1(); p2(); p3(); p4(); p5(); p6(); p7(); p8(); p9();
  plans(); history(); backtestCases();
  fingerprintCases();
  await approvals();
  versions();
  integrity();
  await digital();
  await Promise.all(pending);

  for (const [file, cases] of Object.entries(files)) writeFileSync(join(OUT, file), JSON.stringify(cases, null, 2) + '\n');
  console.log(`wrote ${count} cases in ${Object.keys(files).length} files`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
