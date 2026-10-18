/**
 * Plan checking — a whole plan in, a verdict per step and for the plan out.
 *
 *   evaluatePlan(rulebook, plan) → PlanEvaluation
 *
 * An AI planner (or anyone) proposes a plan: one participant, steps in order,
 * the facts before the first step. The rulebook checks it the way it checks
 * a single action — deterministically, with no model and no clock — by
 * evaluating each step against the facts PROJECTED from the earlier steps:
 *
 *   facts₀ = initialFacts
 *   step i is decided on  facts_i ⊕ step.facts   (the planner's own expectations last)
 *   facts_{i+1} = facts_i after the step's action's declared `effects`
 *   the area of step i defaults to where step i-1 left the participant
 *   (a `move` effect moves it to the step's area); the clock fact, when
 *   named, advances by stepDurationSeconds per step; each decided step is
 *   appended to the history the next step sees.
 *
 * Plan rules (rulebook.planRules) judge the shape of the whole plan: where it
 * ends, what must come before what, how many of something. They can only
 * reject, and they carry the authority that set them.
 *
 * Honest limits: this predicts only the effects the site declared and
 * trusts the planner's description of the plan and the facts it supplies;
 * it checks plans, it does not write them. A plan verdict is a verdict on
 * the plan as described: at execution time each step is asked again, with
 * `evaluateDomainAction`, on the facts then current — projected planning
 * facts are never assumed to equal execution-time facts, and an approval
 * collected for a step authorises that step's rule, participant, action and
 * area only; the live facts still decide everything else. Nothing is projected past the
 * first BLOCK, because a plan does not continue past a refusal. A PAUSE
 * does not stop projection: the result lists every approval the plan would
 * need, so they can be collected up front, and the steps after a PAUSE are
 * checked as if the wait had been cleared.
 *
 * Approvals are consumed step by step: a nonce a step uses is in the
 * consumed set every later step sees, so one single-use approval clears one
 * step's wait and no other; `approvalsUsed` at plan level is every instance
 * the plan would spend. A rulebook of another format is refused at the door
 * (`rulebook_version`), never reinterpreted.
 */

import type {
  ApprovalRequest, DelegationLink, DomainDecision, DomainDecisionStatus, DomainRequest, GovernanceApprovalRequest, GovernanceHistoryEntry, GovernancePlan, GovernancePlanEvaluation,
  GovernancePlanStep, GovernanceRequest, GovernanceRulebook, HistoryEntry, Plan, PlanEvaluation, PlanRule, PlanRuleCheck, PlanStepResult, Rulebook,
} from './types';
import { evaluate } from './evaluate';
import { fingerprint } from './canonical';
import { RULEBOOK_VERSION_CHECK, rulebookVersionProblem } from './version';
import { dialectOf, normalizeRulebook, type Dialect, type InternalRulebook } from './model';
import { SEVERITY, addSeconds, hhmm, isTimestamp, isValidTime, minutesOf, resolveSelector, timeOfDay, vocabularyOf, type Vocabulary } from './vocabulary';

/** A plan in internal words, whichever format it arrived in; `/1` extras ride along. */
interface InternalPlan extends Plan {
  principal?: { id: string };
  participant: Plan['participant'] & { delegatedBy?: string };
  delegation?: DelegationLink[];
  steps: Array<Plan['steps'][number] & { args?: unknown }>;
}

/** A `/1` plan in internal words: `tool` → `action`, `scope` → `area`, history likewise. Only names change. */
function internalPlan(plan: GovernancePlan): InternalPlan {
  if (!plan || typeof plan !== 'object') return plan as unknown as InternalPlan;
  const p = plan as GovernancePlan & Record<string, unknown>;
  const { steps, history, ...rest } = p;
  const out = { ...rest } as unknown as InternalPlan;
  if (steps !== undefined) out.steps = Array.isArray(steps) ? steps.map((s: GovernancePlanStep) => (s && typeof s === 'object' ? { ...(({ tool: _t, scope: _s, ...r }) => r)(s as GovernancePlanStep & Record<string, unknown>), action: s.tool, ...(s.scope !== undefined ? { area: s.scope } : {}) } as InternalPlan['steps'][number] : (s as unknown as InternalPlan['steps'][number]))) : (steps as unknown as InternalPlan['steps']);
  if (history !== undefined) out.history = Array.isArray(history) ? history.map((e: GovernanceHistoryEntry) => (e && typeof e === 'object' ? { action: e.tool, areaId: e.scope, ...(e.at !== undefined ? { at: e.at } : {}) } : (e as unknown as HistoryEntry))) : (history as unknown as HistoryEntry[]);
  return out;
}

/** An internal request back in `/1` words for the evaluator's `/1` door. */
function governanceRequest(req: DomainRequest & { principal?: { id: string }; delegation?: DelegationLink[]; args?: unknown }): GovernanceRequest {
  const { action, areaId, history, principal, delegation, args, ...rest } = req;
  return {
    ...(rest as Omit<GovernanceRequest, 'tool' | 'scope' | 'principal'>),
    principal: principal!,
    ...(delegation !== undefined ? { delegation } : {}),
    tool: action,
    scope: areaId!,
    ...(args !== undefined ? { args } : {}),
    ...(history !== undefined ? { history: history.map(e => ({ tool: e.action, scope: e.areaId, ...(e.at !== undefined ? { at: e.at } : {}) })) } : {}),
  };
}

export function evaluatePlan(rulebook: Rulebook, plan: Plan): PlanEvaluation;
export function evaluatePlan(rulebook: GovernanceRulebook, plan: GovernancePlan): GovernancePlanEvaluation;
export function evaluatePlan(rulebook: Rulebook | GovernanceRulebook, plan: Plan | GovernancePlan): PlanEvaluation | GovernancePlanEvaluation;
export function evaluatePlan(rulebook: Rulebook | GovernanceRulebook, plan: Plan | GovernancePlan): PlanEvaluation | GovernancePlanEvaluation {
  const d = dialectOf((rulebook as { format?: unknown } | null)?.format);
  const result = evaluateInternalPlan(rulebook, d.governance ? internalPlan(plan as GovernancePlan) : (plan as InternalPlan), planDigestOf(plan), d);
  if (!d.governance) return result;
  const { steps, finalArea, ...rest } = result;
  return {
    ...rest,
    steps: steps.map(s => { const { action, areaId, decision, ...r } = s; return { ...r, tool: action, scope: areaId, decision: decision as unknown as GovernancePlanEvaluation['steps'][number]['decision'] }; }),
    approvalRequests: rest.approvalRequests as unknown as GovernanceApprovalRequest[],
    finalScope: finalArea,
  };
}

function evaluateInternalPlan(rulebook: Rulebook | GovernanceRulebook, plan: InternalPlan, planDigest: string, d: Dialect): PlanEvaluation {
  const bad = (reason: string, ruleId = 'required_facts'): PlanEvaluation => ({
    status: 'BLOCK',
    steps: [],
    planChecks: [],
    firstViolation: { stepIndex: 0, ruleId, reason, setBy: 'builtin', from: 'plan' },
    approvalRequests: [],
    approvalsUsed: [],
    finalFacts: {},
    finalArea: '',
    planDigest,
    fingerprint: typeof (rulebook as { fingerprint?: unknown } | null)?.fingerprint === 'string' ? rulebook.fingerprint : '',
  });
  const versionProblem = rulebookVersionProblem(rulebook);
  if (versionProblem) return bad(`This rulebook cannot be decided with: ${versionProblem}`, RULEBOOK_VERSION_CHECK);
  const rb: InternalRulebook = normalizeRulebook(rulebook);
  const vocab = vocabularyOf(rb);

  // The plan must have a shape we can govern. A bad plan is a BLOCK, never a throw.
  if (!plan || typeof plan !== 'object' || !plan.participant || typeof plan.participant !== 'object') return bad('The plan is incomplete: participant is missing.');
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) return bad('The plan is incomplete: it has no steps.');
  if (!plan.initialFacts || typeof plan.initialFacts !== 'object') return bad('The plan is incomplete: initialFacts are missing.');
  if (plan.steps.some(s => !s || typeof s !== 'object' || typeof s.action !== 'string' || !s.action)) return bad(`The plan is incomplete: every step needs ${d.governance ? 'a tool' : 'an action'}.`);
  if (typeof plan.steps[0].area !== 'string' || !plan.steps[0].area) return bad(`The plan is incomplete: the first step must say which ${d.place} it is in.`);
  if (d.governance && (!plan.principal || typeof plan.principal !== 'object' || typeof plan.principal.id !== 'string' || !plan.principal.id)) return bad('The plan is incomplete: principal.id is missing.');
  if (plan.clock !== undefined) {
    const def = vocab.facts.get(plan.clock);
    if (!def || def.type !== 'time') return bad(`The plan names clock "${String(plan.clock)}", which is not a declared time fact.`);
    if (plan.startTime !== undefined && !isValidTime(plan.startTime)) return bad(`The plan's startTime must be "HH:MM", got ${JSON.stringify(plan.startTime)}.`);
  }
  if (plan.history !== undefined && !Array.isArray(plan.history)) return bad(`The plan's history must be a list of ${d.historyShape}.`);
  if (plan.now !== undefined && !isTimestamp(plan.now)) return bad(`The plan's now must be a timestamp with a date ("YYYY-MM-DDTHH:MM", optional seconds and offset), got ${JSON.stringify(plan.now)}.`);
  if (plan.stepDurationSeconds !== undefined && (typeof plan.stepDurationSeconds !== 'number' || !Number.isFinite(plan.stepDurationSeconds) || plan.stepDurationSeconds < 0)) return bad('The plan\'s stepDurationSeconds must be a number, 0 or more.');

  // The plan's areas, as described: step.area, or where the previous step left the participant. A step that names
  // another area without an action that moves there is a break in continuity, refused when that step is reached.
  const areas: string[] = [], after: string[] = [], discontinuous: boolean[] = [];
  let here = plan.steps[0].area;
  for (const step of plan.steps) {
    const moves = vocab.actions.get(step.action)?.effects?.some(e => e.op === 'move') ?? false;
    // A /3 participant is somewhere and must be moved; a /1 call lands in the scope the step names (or the previous step's), so no continuity check applies.
    discontinuous.push(!d.governance && step.area !== undefined && step.area !== here && !moves);
    areas.push(step.area ?? here);
    if (moves || d.governance) here = step.area ?? here;
    after.push(here);
  }

  // Plan rules judge the described plan first; they need no projection.
  const planChecks = checkPlanRules(rb.planRules ?? [], plan, areas, after, vocab);

  // Then every step, on projected facts, until the first BLOCK.
  const steps: PlanStepResult[] = [];
  const approvalRequests: ApprovalRequest[] = [];
  const approvalsUsed: Array<{ ruleId: string; nonce: string }> = [];
  // Nonces spent so far: what the caller already consumed, plus every instance an earlier step of this plan used.
  const consumed: string[] = Array.isArray(plan.consumedApprovals) ? [...plan.consumedApprovals] : [];
  const consumedGiven = plan.consumedApprovals !== undefined && !Array.isArray(plan.consumedApprovals);   // not a list: passed as given so the step says so
  const history: HistoryEntry[] = [...(plan.history ?? [])];
  let facts: Record<string, unknown> = { ...plan.initialFacts };
  // The clock starts at startTime, else at the wall-clock time `now` names in its own offset (the site's local evening is its evening).
  const startTime = plan.startTime ?? (plan.now !== undefined ? timeOfDay(plan.now) : undefined);
  const start = plan.clock && startTime ? minutesOf(startTime) : null;
  const duration = plan.stepDurationSeconds ?? 0;
  let evaluated = 0;
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const areaId = areas[i];
    evaluated = i + 1;
    if (start !== null) facts[plan.clock!] = hhmm((start + Math.floor((i * duration) / 60)) % 1440);
    const stepFacts: Record<string, unknown> = { ...facts, ...(step.facts ?? {}) };
    const now = plan.now !== undefined ? addSeconds(plan.now, i * duration) : undefined;
    const request: DomainRequest & { principal?: { id: string }; delegation?: DelegationLink[]; args?: unknown } = {
      participant: { ...plan.participant }, action: step.action, areaId, facts: stepFacts, history: [...history],
      ...(now !== undefined ? { now } : {}), ...(consumedGiven ? { consumedApprovals: plan.consumedApprovals } : consumed.length || plan.consumedApprovals !== undefined ? { consumedApprovals: [...consumed] } : {}),
      ...(d.governance ? { principal: plan.principal, ...(plan.delegation !== undefined ? { delegation: plan.delegation } : {}), ...(step.args !== undefined ? { args: step.args } : {}) } : {}),
    };
    const decision: DomainDecision = discontinuous[i]
      ? continuityRefusal(rb, step.action, step.area!, after[i - 1] ?? areas[0], vocab, d)
      : (d.governance ? evaluate(rulebook as GovernanceRulebook, governanceRequest(request)) : evaluate(rulebook as Rulebook, request)) as DomainDecision;
    steps.push({ index: i, action: step.action, areaId, facts: stepFacts, decision, ...(step.note !== undefined ? { note: step.note } : {}) });
    const same = (x: ApprovalRequest, a: ApprovalRequest) => d.governance
      ? x.ruleId === a.ruleId && (x as unknown as GovernanceApprovalRequest).tool === (a as unknown as GovernanceApprovalRequest).tool && (x as unknown as GovernanceApprovalRequest).scope === (a as unknown as GovernanceApprovalRequest).scope
      : x.ruleId === a.ruleId && x.action === a.action && x.areaId === a.areaId;
    for (const a of decision.approvalRequests ?? []) if (!approvalRequests.some(x => same(x, a))) approvalRequests.push(a);
    for (const u of decision.approvalsUsed ?? []) { approvalsUsed.push(u); consumed.push(u.nonce); }
    if (decision.status === 'BLOCK') { facts = stepFacts; break; }
    // Project the step's effects for the next step. The planner's own step facts persist into the projection.
    facts = applyEffects(stepFacts, step.action, vocab);
    history.push({ action: step.action, areaId, ...(now !== undefined ? { at: now } : {}) });
  }

  let status: DomainDecisionStatus = 'ALLOW';
  for (const c of planChecks) if (SEVERITY[c.status] > SEVERITY[status]) status = c.status;
  for (const s of steps) if (SEVERITY[s.decision.status] > SEVERITY[status]) status = s.decision.status;

  // The first violation: the earliest BLOCK by step index; at the same step, the step's own refusal comes first.
  let firstViolation: PlanEvaluation['firstViolation'];
  const consider = (v: NonNullable<PlanEvaluation['firstViolation']>) => { if (!firstViolation || v.stepIndex < firstViolation.stepIndex) firstViolation = v; };
  const blocked = steps.find(s => s.decision.status === 'BLOCK');
  if (blocked) { const r = blocked.decision.reasons[0]; consider({ stepIndex: blocked.index, ruleId: r.ruleId, reason: r.reason, setBy: r.setBy, from: 'step' }); }
  for (const c of planChecks) if (c.status === 'BLOCK') consider({ stepIndex: c.stepIndex ?? plan.steps.length - 1, ruleId: c.ruleId, reason: c.reason, setBy: c.setBy, from: 'plan' });

  // Where the participant is after the last evaluated step: a refused step leaves it where that step was asked — unless the
  // refusal was that it is not there (plan_area_continuity), in which case it is where the earlier steps left it.
  const last = steps[steps.length - 1];
  const finalArea = last.decision.status !== 'BLOCK' ? after[evaluated - 1] : discontinuous[last.index] ? (after[last.index - 1] ?? areas[0]) : last.areaId;
  return {
    status,
    steps,
    planChecks,
    ...(firstViolation ? { firstViolation } : {}),
    approvalRequests,
    approvalsUsed,
    finalFacts: facts,
    finalArea,
    planDigest,
    fingerprint: rb.fingerprint,
  };
}

/** /3 only: a step that names an area the participant is not in, with an action that does not move it: BLOCK `plan_area_continuity`, by the evaluator. */
function continuityRefusal(rulebook: InternalRulebook, action: string, area: string, here: string, vocab: Vocabulary, d: Dialect): DomainDecision {
  const name = (id: string) => vocab.areas.get(id)?.name ?? id;
  const check = { ruleId: d.builtin.planContinuity!, status: 'BLOCK' as const, reason: `Step "${action}" is placed in ${name(area)}, but the plan leaves the participant in ${name(here)} and "${action}" does not move it (no \`move\` effect). Add a moving step, or drop the ${d.place}.`, setBy: 'builtin' };
  return { status: 'BLOCK', reasons: [check], trace: [check], fingerprint: rulebook.fingerprint };
}

/**
 * The plan's identity: `fingerprint` of the plan with every `approvedBy` (in
 * `initialFacts` and each step's `facts`) and `consumedApprovals` left out,
 * so collecting approvals for it does not change it. The plan is taken as
 * JSON first (JSON.stringify semantics: NaN and infinities become null,
 * functions and undefined members drop), so a plan that is not JSON still
 * has a digest and is refused, never thrown on. A value that is not an
 * object digests as `null`.
 */
export function planDigestOf(plan: unknown): string {
  const asJson = plan === undefined ? undefined : JSON.parse(JSON.stringify(plan, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v)));
  if (!asJson || typeof asJson !== 'object') return fingerprint(null);
  const p = asJson as Plan;
  const strip = (facts: unknown) => { if (!facts || typeof facts !== 'object') return facts; const { approvedBy: _a, ...rest } = facts as Record<string, unknown>; return rest; };
  const { consumedApprovals: _c, ...rest } = p;
  // A step's `facts` that is empty once approvals are gone is dropped, so adding an approval to a step without facts changes nothing.
  const step = (s: Plan['steps'][number]) => { if (!s || typeof s !== 'object' || s.facts === undefined) return s; const facts = strip(s.facts); const { facts: _f, ...other } = s; return facts && typeof facts === 'object' && Object.keys(facts).length === 0 ? other : { ...other, facts }; };
  return fingerprint({
    ...rest,
    ...(p.initialFacts !== undefined ? { initialFacts: strip(p.initialFacts) } : {}),
    ...(Array.isArray(p.steps) ? { steps: p.steps.map(step) } : {}),
  });
}

/** The facts after an action's declared effects. Only declared facts change; unknown facts pass through untouched. */
export function applyEffects(facts: Record<string, unknown>, action: string, vocab: Vocabulary): Record<string, unknown> {
  const def = vocab.actions.get(action);
  const out = { ...facts };
  for (const e of def?.effects ?? []) {
    if (e.op === 'move') continue;
    if (e.op === 'set') { out[e.fact] = e.value; continue; }
    const current = out[e.fact];
    const base = typeof current === 'number' ? current : (vocab.facts.get(e.fact)?.default as number | undefined);
    if (typeof base !== 'number') { out[e.fact] = current; continue; }   // nothing to add to: the next step reports the missing fact
    out[e.fact] = e.op === 'add' ? base + e.value : base - e.value;
  }
  return out;
}

function checkPlanRules(rules: PlanRule[], plan: InternalPlan, areas: string[], after: string[], vocab: Vocabulary): PlanRuleCheck[] {
  const out: PlanRuleCheck[] = [];
  const role = vocab.roles.get(plan.participant.roleId);
  if (!role || role.kind !== plan.participant.kind) return out;   // the step evaluation reports the undeclared role
  const n = plan.steps.length;
  for (const r of rules) {
    if (!resolveSelector(r.who, 'who', vocab).has(role.id)) continue;
    const reason = r.reason ?? r.text;
    const c = r.check;
    const ok = (): void => { out.push({ ruleId: r.id, status: 'ALLOW', reason, setBy: r.setBy }); };
    const no = (stepIndex: number, detail: string): void => { out.push({ ruleId: r.id, status: 'BLOCK', reason: `${reason} (${detail})`, setBy: r.setBy, stepIndex }); };
    switch (c.kind) {
      case 'ends_in': {
        const end = after[n - 1];
        if (resolveSelector(c.areas, 'where', vocab).has(end)) ok(); else no(n - 1, `the plan ends in ${vocab.areas.get(end)?.name ?? end}`);
        break;
      }
      case 'ends_with': {
        const end = plan.steps[n - 1].action;
        if (resolveSelector(c.actions, 'does', vocab).has(end)) ok(); else no(n - 1, `the plan ends with ${end}`);
        break;
      }
      case 'before': {
        const first = resolveSelector(c.first, 'does', vocab), then = resolveSelector(c.then, 'does', vocab);
        let offender = -1;
        for (let i = 0; i < n && offender < 0; i++) {
          if (!then.has(plan.steps[i].action)) continue;
          const earlier = [...(plan.history ?? []).map(h => ({ action: h.action, areaId: h.areaId })), ...plan.steps.slice(0, i).map((s, j) => ({ action: s.action, areaId: areas[j] }))];
          if (!earlier.some(e => first.has(e.action) && (!c.sameArea || e.areaId === areas[i]))) offender = i;
        }
        if (offender < 0) ok(); else no(offender, `step ${offender + 1} (${plan.steps[offender].action}) has no earlier ${[...first].join('/')}${c.sameArea ? ' in the same area' : ''}`);
        break;
      }
      case 'at_most': {
        const set = resolveSelector(c.actions, 'does', vocab);
        let count = 0, offender = -1;
        for (let i = 0; i < n; i++) if (set.has(plan.steps[i].action) && ++count > c.count && offender < 0) offender = i;
        if (offender < 0) ok(); else no(offender, `step ${offender + 1} is number ${c.count + 1}; at most ${c.count} allowed`);
        break;
      }
      case 'at_least': {
        const set = resolveSelector(c.actions, 'does', vocab);
        const count = plan.steps.filter(s => set.has(s.action)).length;
        if (count >= c.count) ok(); else no(n - 1, `the plan has ${count} of ${[...set].join('/')}; at least ${c.count} required`);
        break;
      }
    }
  }
  return out;
}
