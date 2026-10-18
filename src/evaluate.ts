/**
 * Evaluator — one request in, one decision out. One evaluator for both formats.
 *
 *   evaluate(rulebook, request) → DomainDecision | GovernanceDecision
 *   (evaluateDomainAction is the same function under its /3 name)
 *
 * Pure and synchronous: no clock (time is a fact; `request.now` is a fact the
 * caller's trusted layer supplies), no network, no model. Every check that
 * runs is recorded in `trace`, and the decision is the strictest check:
 * BLOCK > PAUSE > LIMIT > ALLOW.
 *
 * Order (the first BLOCK ends the trace; otherwise all run):
 *   1. request shape, declared area, declared role        (required_facts, area_declared, role_declared)
 *   1b. /1 only: the call's arguments against the tool's declared fields;
 *       declared arguments become facts                   (args_wellformed)
 *   2. the facts the decision needs, typed and complete    (required_facts)
 *   3. never rules — nothing overrides them                (their IDs)
 *   4. the role lists the action, or the action is unknown (role_permits_action, unknown_action)
 *   4b. /1 only: the tool is called in one of its scopes; every role in the
 *       delegation chain lists it                          (scope_permits_tool, delegation_exceeds_authority)
 *   5. every rule that matches; limits combine by MIN      (their IDs)
 *
 * A `/1` rulebook (neuroverse-governance/1) runs the same steps through its
 * own words: `tool` for action, `scope` for area, `scope_declared`,
 * `role_permits_tool`, `unknown_tool`; its approvals bind to the principal,
 * the tool, the scope and a digest of the exact arguments as well; and every
 * approval that clears nothing is named in `approvalsRejected` with a code.
 * The dialect table in model.ts holds the names; nothing else differs.
 *
 * Two kinds of PAUSE:
 *   - approval  — a person must approve this action. Re-send the same request
 *                 with `facts.approvedBy` set. If the rule names who may
 *                 approve (`by`), the approver must hold that authority (or a
 *                 higher one), that role, or that role tag.
 *   - condition — the situation must change (people leave, staff arrive).
 *                 `approvedBy` does not override these.
 *
 * An approval clears ONLY the approval wait of the rule it names. Every
 * other check — never rules, condition waits, limits, other rules — is
 * decided on the facts the request carries now. An approval is never a
 * statement about the facts. A rejected approval never turns a wait into a
 * refusal: the wait stays unmet (PAUSE) and the decision says why.
 *
 * A PAUSE for approval carries `approvalRequests`: one per rule still
 * waiting, naming the rule, the rulebook, the participant, the action and
 * the area to sign for. When the rulebook declares `trustedKeys`, only the
 * verified approval object `verifyApproval` returned (see verified.ts —
 * request data can never assert verification; a `verified` member is
 * ignored) bound to exactly those, within its validity window at
 * `request.now`, and whose nonce is not in `request.consumedApprovals`,
 * clears the wait. `facts.approvedBy` may be one approval or a list; each
 * approval clears at most one wait in a decision.
 *
 * Missing or invalid facts are never permission: they BLOCK with
 * `required_facts`. Never rules and every matching rule apply to every
 * action, including an approved unknown one. A rulebook of another format
 * is refused at the door: BLOCK `rulebook_version`, never a reinterpretation.
 */

import type {
  ActionDef, Approval, ApprovalRejection, ApprovalRejectionCode, ApprovalRequest, DecisionOf, DelegationLink, DomainCheck, DomainDecision, DomainDecisionStatus, DomainRequest, FactValue,
  GovernanceApprovalRequest, GovernanceDecision, GovernanceRequest, GovernanceRulebook, HistoryEntry, Rule, Rulebook,
} from './types';
import { APPROVAL_SPEC, GOVERNANCE_APPROVAL_SPEC } from './types';
import { fingerprint, fingerprintVersion } from './canonical';
import { isVerified } from './verified';
import { RULEBOOK_VERSION_CHECK, rulebookVersionProblem } from './version';
import { dialectOf, normalizeRulebook, type Dialect, type InternalRulebook } from './model';
import {
  SEVERITY, authorityRank, conditionHolds, factProblem, historyConditionHolds, historyProblems, parseTimestamp, resolveSelector, selectorExcludesId, selectorIsOpen, show, vocabularyOf,
  type Vocabulary,
} from './vocabulary';

/** An approval as the evaluator sees it: the request's data plus whether it is the object `verifyApproval` produced. */
interface SeenApproval extends Approval { handle: boolean; principalId?: string; tool?: string; scope?: string; argsDigest?: string }

/** A request in the engine's internal words, whichever format it arrived in. */
interface InternalRequest extends DomainRequest {
  principal?: { id: string };
  delegation?: DelegationLink[];
  args?: unknown;
}

type AnyApprovalRequest = ApprovalRequest | GovernanceApprovalRequest;
type AnyDecision = DecisionOf<AnyApprovalRequest>;

/** The refusal every door gives a rulebook of another format: a decision, never a throw. */
export function versionRefusal(rulebook: unknown, problem: string): DomainDecision {
  const check: DomainCheck = { ruleId: RULEBOOK_VERSION_CHECK, status: 'BLOCK', reason: `This rulebook cannot be decided with: ${problem}`, setBy: 'builtin' };
  const claimed = (rulebook as { fingerprint?: unknown } | null)?.fingerprint;
  return { status: 'BLOCK', reasons: [check], trace: [check], fingerprint: typeof claimed === 'string' ? claimed : '' };
}

/**
 * A `/1` request in internal words: `tool` → `action`, `scope` → `areaId`,
 * history entries likewise; `principal`, `delegation` and `args` ride along.
 * Only names change; a malformed value stays malformed so the shape check
 * reports it.
 */
export function internalRequest(request: GovernanceRequest): InternalRequest {
  if (!request || typeof request !== 'object') return request as unknown as InternalRequest;
  const r = request as GovernanceRequest & Record<string, unknown>;
  const out: InternalRequest = {
    participant: r.participant as InternalRequest['participant'],
    action: r.tool as string,
    areaId: r.scope as string,
    facts: r.facts,
  };
  if (r.principal !== undefined) out.principal = r.principal;
  if (r.delegation !== undefined) out.delegation = r.delegation;
  if (r.args !== undefined) out.args = r.args;
  if (r.history !== undefined) out.history = Array.isArray(r.history) ? r.history.map(e => (e && typeof e === 'object' ? { action: (e as { tool?: string }).tool as string, areaId: (e as { scope?: string }).scope as string, ...((e as { at?: string }).at !== undefined ? { at: (e as { at?: string }).at } : {}) } : (e as unknown as HistoryEntry))) : (r.history as unknown as HistoryEntry[]);
  if (r.now !== undefined) out.now = r.now;
  if (r.consumedApprovals !== undefined) out.consumedApprovals = r.consumedApprovals;
  return out;
}

export function evaluate(rulebook: Rulebook, request: DomainRequest): DomainDecision;
export function evaluate(rulebook: GovernanceRulebook, request: GovernanceRequest): GovernanceDecision;
export function evaluate(rulebook: Rulebook | GovernanceRulebook, request: DomainRequest | GovernanceRequest): AnyDecision;
export function evaluate(rulebook: Rulebook | GovernanceRulebook, request: DomainRequest | GovernanceRequest): AnyDecision {
  const versionProblem = rulebookVersionProblem(rulebook);
  if (versionProblem) return versionRefusal(rulebook, versionProblem);
  const rb = normalizeRulebook(rulebook);
  const d = dialectOf(rb.format);
  const vocab = vocabularyOf(rb);
  const req: InternalRequest = d.governance ? internalRequest(request as GovernanceRequest) : (request as InternalRequest);
  const trace: DomainCheck[] = [];
  const check = (ruleId: string, status: DomainDecisionStatus, reason: string, setBy = 'builtin', rejected?: ApprovalRejection[]) => { trace.push({ ruleId, status, reason, setBy, ...(rejected?.length ? { approvalsRejected: rejected } : {}) }); };
  let limits: Record<string, number> | undefined;
  let then: string | undefined;
  const approvalRequests: AnyApprovalRequest[] = [];
  const approvalsUsed: Array<{ ruleId: string; nonce: string }> = [];
  const rejectedAll: ApprovalRejection[] = [];
  const decide = () => finish(trace, rb.fingerprint, limits, then, approvalRequests, approvalsUsed, rejectedAll);

  // 1. The request must have a shape we can govern, and name a declared area and role.
  const shape = shapeProblems(req, vocab, d);
  if (shape.length) {
    check(d.builtin.requiredFacts, 'BLOCK', `The request is incomplete: ${shape.join('; ')}.`);
    return decide();
  }
  const { participant, action } = req;
  const areaId = req.areaId ?? req.zoneId!;
  const area = vocab.areas.get(areaId);
  if (!area) {
    check(d.builtin.placeDeclared, 'BLOCK', `${cap(d.place)} "${areaId}" is not declared for ${rb.site.name}.`);
    return decide();
  }
  const role = vocab.roles.get(participant.roleId);
  if (!role || role.kind !== participant.kind) {
    check(d.builtin.roleDeclared, 'BLOCK', `"${participant.roleId}" is not a declared ${participant.kind} role.`);
    return decide();
  }
  const actionDef = vocab.actions.get(action);

  // 1b. /1: the arguments are judged against the tool's declaration before anything is decided on them, and the declared ones become facts.
  let argsDigest: string | undefined;
  let given: Record<string, unknown> = req.facts;
  if (d.governance) {
    const bound = bindArgs(actionDef, req.args, req.facts, vocab);
    if (bound.problems.length) {
      check(d.builtin.args!, 'BLOCK', `The arguments cannot be run: ${bound.problems.join('; ')}.`);
      return decide();
    }
    given = bound.facts;
    argsDigest = bound.digest;
  }

  // 2. Every fact the decision needs must be supplied and valid. Missing is never permission.
  const { problems, facts, approvals, nowMs, consumed } = validateFacts(rb, vocab, { ...req, facts: given }, actionDef?.requires ?? [], d);
  const inScope = (r: Rule) => selectorsMatch(r, role.id, action, actionDef !== undefined, area.id, vocab);
  // A rule in scope that conditions on history needs the caller's history; a window also needs times and `now`.
  const needHistory = rb.rules.filter(r => r.history?.length && inScope(r));
  if (needHistory.length) {
    const needTimes = needHistory.some(r => r.history!.some(h => h.withinMinutes !== undefined));
    if (req.history === undefined) problems.push(`history is required (rule ${needHistory.map(r => `"${r.id}"`).join(', ')} counts what ${participant.id} did recently), got nothing`);
    else problems.push(...historyProblems(req.history, needTimes, d.historyShape));
    if (needTimes && nowMs === null && req.now === undefined) problems.push(`now is required (a rule counts history within a time window, measured back from now), got nothing`);
  }
  if (problems.length) {
    check(d.builtin.requiredFacts, 'BLOCK', `Facts missing or invalid: ${problems.join('; ')}.`);
    return decide();
  }
  const history = (req.history ?? []) as HistoryEntry[];

  const matches = (r: Rule) => inScope(r)
    && (r.when ?? []).every(c => conditionHolds(c, facts, vocab))
    && (r.history ?? []).every(h => historyConditionHolds(h, history, area.id, nowMs, vocab));
  const reasonOf = (r: Rule) => r.reason ?? r.text;

  // 3. Never rules. Nothing overrides them.
  let stopped = false;
  for (const r of rb.rules) {
    if (!r.never || !matches(r)) continue;
    check(r.id, 'BLOCK', reasonOf(r), r.setBy);
    if (r.then.answer === 'deny' && r.then.instead && !then) then = r.then.instead;
    stopped = true;
  }
  if (stopped) return decide();

  // 4. The role must list the action; an action the rulebook does not know follows `otherwise`.
  const matched = rb.rules.filter(r => !r.never && matches(r));
  const unknownWaits = !actionDef && rb.otherwise === 'wait-for-approval';
  if ((unknownWaits || matched.some(r => r.then.answer === 'wait' && r.then.for === 'approval')) && !nonEmpty(participant.id)) {
    check(d.builtin.requiredFacts, 'BLOCK', 'Facts missing or invalid: participant.id must be a non-empty string when an approval is needed (an approval binds to the participant).');
    return decide();
  }
  const binding = { participantId: participant.id, action, areaId: area.id, principalId: req.principal?.id, argsDigest };
  // Each approval the request carries clears at most one wait in this decision; the first that is bound and sufficient is taken.
  const spent = new Set<number>();
  const needsApproval = (ruleId: string, what: string, by: string | undefined, setBy: string) => {
    const ask = () => approvalRequests.push(d.governance
      ? { ruleId, ...(by ? { by } : {}), rulebookFingerprint: rb.fingerprint, principalId: req.principal!.id, participantId: participant.id, tool: action, scope: area.id, argsDigest: argsDigest!, reason: what, setBy }
      : { ruleId, ...(by ? { by } : {}), rulebookFingerprint: rb.fingerprint, participantId: participant.id, action, areaId: area.id, reason: what, setBy });
    if (!approvals.length) { check(ruleId, 'PAUSE', `${what} — needs a person's approval${by ? ` (${by})` : ''}.`, setBy); ask(); return; }
    const why: string[] = [];
    const rejected: ApprovalRejection[] = [];
    const reject = (approval: SeenApproval, code: ApprovalRejectionCode, reason: string) => {
      why.push(reason);
      rejected.push({ id: approval.id, ...(approval.nonce !== undefined ? { nonce: approval.nonce } : {}), code, reason });
    };
    for (let i = 0; i < approvals.length; i++) {
      const approval = approvals[i];
      if (spent.has(i)) { reject(approval, 'spent', `${approval.id}'s approval already cleared another wait in this decision`); continue; }
      const unbound = d.governance ? approvalBound1(approval, rb, ruleId, binding, nowMs, consumed) : approvalBound3(approval, rb, ruleId, binding, nowMs, consumed);
      if (unbound) { reject(approval, unbound.code, `${approval.id}'s approval does not count here: ${unbound.reason}`); continue; }
      const short = approvalSufficient(approval, by, vocab);
      if (short) { reject(approval, 'insufficient', `approval needs ${by}; ${approval.id} doesn't hold it (${short})`); continue; }
      spent.add(i);
      check(ruleId, 'ALLOW', `${what} — approved by ${approval.id}.`, setBy);
      if (approval.nonce !== undefined) approvalsUsed.push({ ruleId, nonce: approval.nonce });
      return;
    }
    if (d.governance) for (const r of rejected) if (!rejectedAll.some(x => x.id === r.id && x.nonce === r.nonce && x.code === r.code)) rejectedAll.push(r);
    check(ruleId, 'PAUSE', `${what} — ${why.join('; ')}.`, setBy, d.governance ? rejected : undefined); ask();
  };
  if (!actionDef) {
    if (rb.otherwise === 'deny') {
      check(d.builtin.unknown, 'BLOCK', `No rule covers "${action}" for a ${participant.kind}.`);
      return decide();
    }
    // An approved unknown action still faces every matching rule below.
    needsApproval(d.builtin.unknown, `No rule covers "${action}" for a ${participant.kind}`, undefined, 'builtin');
  } else if (!role.actions.includes(action)) {
    check(d.builtin.rolePermits, 'BLOCK', `${role.name} may not ${actionName(actionDef.name, action)}.`);
    return decide();
  } else {
    check(d.builtin.rolePermits, 'ALLOW', `${role.name} may ${actionName(actionDef.name, action)}.`);
    // 4b. /1: the tool's own scopes, and the delegation chain — delegated authority never grows.
    if (d.governance) {
      if (actionDef.scopes && !actionDef.scopes.includes(area.id)) {
        check(d.builtin.scopePermits!, 'BLOCK', `${actionName(actionDef.name, action)} may be called in ${actionDef.scopes.join(', ')}, not in ${area.name} (${area.id}).`);
        return decide();
      }
      const chain = req.delegation ?? [];
      for (let i = 0; i < chain.length; i++) {
        const link = chain[i];
        const linkRole = vocab.roles.get(link.roleId);
        if (!linkRole) { check(d.builtin.roleDeclared, 'BLOCK', `delegation[${i}] (${link.id}) holds role "${link.roleId}", which is not declared.`); return decide(); }
        if (!linkRole.actions.includes(action)) {
          check(d.builtin.delegation!, 'BLOCK', `Delegated authority stays bounded: delegation[${i}] (${link.id}, ${linkRole.name}) may not ${actionName(actionDef.name, action)}, so ${participant.id} may not do it on its behalf.`);
          return decide();
        }
      }
      if (chain.length) check(d.builtin.delegation!, 'ALLOW', `Every role in the delegation chain (${chain.map(l => `${l.id}: ${l.roleId}`).join(' → ')}) may ${actionName(actionDef.name, action)}.`);
    }
  }

  // 5. Every matching rule. Limits combine by MIN per name; the rule(s) at the minimum decide.
  const effective: Record<string, number> = {};
  for (const r of matched) if (r.then.answer === 'limit') {
    for (const [name, v] of Object.entries(r.then.limits)) effective[name] = name in effective ? Math.min(effective[name], v) : v;
  }
  if (Object.keys(effective).length) limits = effective;

  for (const r of matched) {
    const t = r.then;
    switch (t.answer) {
      case 'allow': check(r.id, 'ALLOW', reasonOf(r), r.setBy); break;
      case 'deny': check(r.id, 'BLOCK', reasonOf(r), r.setBy); if (t.instead && !then) then = t.instead; break;
      case 'wait':
        if (t.for === 'condition') check(r.id, 'PAUSE', `${reasonOf(r)} (Wait: only a change in the facts clears this.)`, r.setBy);
        else needsApproval(r.id, reasonOf(r), t.by, r.setBy);
        break;
      case 'limit': {
        const parts: string[] = [];
        let status: DomainDecisionStatus = 'ALLOW';
        for (const [name, v] of Object.entries(t.limits)) {
          const def = vocab.limits.get(name)!;
          const unit = def.unit ? ` ${def.unit}` : '';
          if (v > effective[name]) { parts.push(`${name} ${v}${unit} is not the tightest (${effective[name]}${unit} applies)`); continue; }
          const asked = def.requestedFact ? facts[def.requestedFact] : undefined;
          if (asked === undefined) { status = 'LIMIT'; parts.push(`at most ${v}${unit} ${name}`); }
          else if ((asked as number) > v) { status = 'LIMIT'; parts.push(`asked for ${asked}${unit}; at most ${v}${unit} ${name}`); }
          else parts.push(`${asked}${unit} is within the ${v}${unit} ${name}`);
        }
        check(r.id, status, `${reasonOf(r)} (${parts.join('; ')}.)`, r.setBy);
      }
    }
  }
  return decide();
}

/** The /3 name of the one evaluator. */
export const evaluateDomainAction: typeof evaluate = evaluate;

/** Do the rule's three selectors cover this role, action and area? (Conditions are checked separately.) */
function selectorsMatch(r: Rule, roleId: string, action: string, actionDeclared: boolean, areaId: string, vocab: Vocabulary): boolean {
  if (!resolveSelector(r.who, 'who', vocab).has(roleId)) return false;
  if (actionDeclared ? !resolveSelector(r.does, 'does', vocab).has(action) : !(selectorIsOpen(r.does) && !selectorExcludesId(r.does, action))) return false;
  return resolveSelector(r.where, 'where', vocab).has(areaId);
}

/**
 * The IDs of every rule (never rules included) whose selectors and conditions
 * hold for this request — the matching relation of SPEC.md § 6 step 4, on
 * its own. Used to check a finding's witness; unlike `evaluate` it does not
 * stop at a never rule. An incomplete or invalid request matches nothing.
 */
export function matchingRules(rulebook: Rulebook | GovernanceRulebook, request: DomainRequest | GovernanceRequest): string[] {
  if (rulebookVersionProblem(rulebook)) return [];
  const rb = normalizeRulebook(rulebook);
  const d = dialectOf(rb.format);
  const vocab = vocabularyOf(rb);
  const req: InternalRequest = d.governance ? internalRequest(request as GovernanceRequest) : (request as InternalRequest);
  if (shapeProblems(req, vocab, d).length) return [];
  const areaId = req.areaId ?? req.zoneId!;
  const area = vocab.areas.get(areaId);
  const role = vocab.roles.get(req.participant.roleId);
  if (!area || !role || role.kind !== req.participant.kind) return [];
  const actionDef = vocab.actions.get(req.action);
  let given = req.facts;
  if (d.governance) {
    const bound = bindArgs(actionDef, req.args, req.facts, vocab);
    if (bound.problems.length) return [];
    given = bound.facts;
  }
  const { problems, facts, nowMs } = validateFacts(rb, vocab, { ...req, facts: given }, actionDef?.requires ?? [], d);
  if (problems.length) return [];
  const history = Array.isArray(req.history) ? req.history as HistoryEntry[] : null;
  return rb.rules.filter(r => {
    if (!selectorsMatch(r, role.id, req.action, actionDef !== undefined, area.id, vocab)) return false;
    if (!(r.when ?? []).every(c => conditionHolds(c, facts, vocab))) return false;
    if (!r.history?.length) return true;
    const needTimes = r.history.some(h => h.withinMinutes !== undefined);
    if (!history || historyProblems(history, needTimes, d.historyShape).length || (needTimes && nowMs === null)) return false;
    return r.history.every(h => historyConditionHolds(h, history, area.id, nowMs, vocab));
  }).map(r => r.id);
}

/**
 * Why a request would be BLOCK `required_facts`, as IDs: each declared fact
 * that is missing or invalid, `approvedBy` when the approval is malformed,
 * `now` when it is needed and missing or invalid, `history` when a rule in
 * scope counts history and the request has none or an invalid one,
 * `request` when the request's shape is incomplete (§ 6 step 1). Empty when
 * the facts are complete. The same checks as the evaluator's, returned as
 * names instead of sentences; used by `backtest`.
 */
export function missingFacts(rulebook: Rulebook | GovernanceRulebook, request0: DomainRequest | GovernanceRequest): string[] {
  if (rulebookVersionProblem(rulebook)) return [];
  const rb = normalizeRulebook(rulebook);
  const d = dialectOf(rb.format);
  const vocab = vocabularyOf(rb);
  const request: InternalRequest = d.governance ? internalRequest(request0 as GovernanceRequest) : (request0 as InternalRequest);
  if (shapeProblems(request, vocab, d).length) return ['request'];
  const areaId = request.areaId ?? request.zoneId!;
  const area = vocab.areas.get(areaId);
  const role = vocab.roles.get(request.participant.roleId);
  if (!area || !role || role.kind !== request.participant.kind) return [];
  const actionDef = vocab.actions.get(request.action);
  let given = request.facts;
  if (d.governance) {
    // Arguments that cannot be bound are an `args` problem; the facts they would have become are then simply absent.
    const bound = bindArgs(actionDef, request.args, request.facts, vocab);
    if (bound.problems.length) return ['args'];
    given = bound.facts;
  }
  const { problemFacts, nowMs } = validateFacts(rb, vocab, { ...request, facts: given }, actionDef?.requires ?? [], d);
  const out = [...problemFacts];
  const needHistory = rb.rules.filter(r => r.history?.length && selectorsMatch(r, role.id, request.action, actionDef !== undefined, area.id, vocab));
  if (needHistory.length) {
    const needTimes = needHistory.some(r => r.history!.some(h => h.withinMinutes !== undefined));
    if (request.history === undefined || historyProblems(request.history, needTimes, d.historyShape).length) out.push('history');
    if (needTimes && nowMs === null && !out.includes('now')) out.push('now');
  }
  return out;
}

function finish(trace: DomainCheck[], fingerprint: string, limits: Record<string, number> | undefined, then: string | undefined, approvalRequests: AnyApprovalRequest[], approvalsUsed: Array<{ ruleId: string; nonce: string }>, rejected: ApprovalRejection[]): AnyDecision {
  let status: DomainDecisionStatus = 'ALLOW';
  for (const c of trace) if (SEVERITY[c.status] > SEVERITY[status]) status = c.status;
  const reasons = trace.filter(c => c.status === status);
  return {
    status,
    reasons,
    ...(limits && (status === 'LIMIT' || status === 'ALLOW') ? { limits } : {}),
    ...(then && status === 'BLOCK' ? { then } : {}),
    ...(approvalRequests.length && status === 'PAUSE' ? { approvalRequests } : {}),
    ...(approvalsUsed.length && (status === 'ALLOW' || status === 'LIMIT') ? { approvalsUsed } : {}),
    ...(rejected.length ? { approvalsRejected: rejected } : {}),
    trace,
    fingerprint,
  };
}

// ─── /1: arguments bound to facts ────────────────────────────────────────────

/**
 * The call's arguments against the tool's declared fields (SPEC.md § 16.4),
 * fail closed: anything not declared, missing, of the wrong type, or given
 * twice (as an argument and as a fact) is a problem, and the call is refused
 * before any rule is weighed. Declared arguments become facts. For an
 * undeclared tool the arguments cannot be judged; they need only be an
 * object (the tool is refused as unknown afterwards). The digest is
 * `fingerprint(args ?? {})`, what a /1 approval binds to.
 */
export function bindArgs(tool: ActionDef | undefined, args: unknown, facts: Record<string, unknown>, vocab: Vocabulary): { problems: string[]; facts: Record<string, unknown>; digest: string } {
  const problems: string[] = [];
  const isObject = args !== undefined && args !== null && typeof args === 'object' && !Array.isArray(args);
  if (args !== undefined && !isObject) problems.push(`args must be an object, got ${show(args)}`);
  const given = isObject ? (args as Record<string, unknown>) : {};
  const bound: Record<string, unknown> = {};
  if (tool && isObject || (tool && args === undefined)) {
    const declared = tool.args ?? {};
    for (const field of Object.keys(given)) if (!(field in declared)) problems.push(`argument "${field}" is not declared for ${tool.id}${Object.keys(declared).length ? ` (declared: ${Object.keys(declared).join(', ')})` : ' (it takes no arguments)'}`);
    for (const [field, b] of Object.entries(declared)) {
      const v = given[field];
      if (v === undefined) { if (b.required !== false) problems.push(`argument "${field}" is required`); continue; }
      const def = vocab.facts.get(b.fact);
      if (!def) { problems.push(`argument "${field}" binds to undeclared fact "${b.fact}"`); continue; }
      const p = factProblem(def, v);
      if (p) { problems.push(`argument "${field}": ${p}`); continue; }
      if (facts && typeof facts === 'object' && facts[b.fact] !== undefined) { problems.push(`fact "${b.fact}" is bound to argument "${field}" and may not also be supplied as a fact`); continue; }
      bound[b.fact] = v;
    }
  }
  let digest = '';
  if (!problems.length) {
    try { digest = fingerprint(args ?? {}); } catch (e) { problems.push(`args are not plain JSON (${e instanceof Error ? e.message : String(e)})`); }
  }
  return { problems, facts: facts && typeof facts === 'object' ? { ...facts, ...bound } : facts, digest };
}

// ─── Approval authority ──────────────────────────────────────────────────────

interface Binding { participantId: string; action: string; areaId: string; principalId?: string; argsDigest?: string }
interface Unbound { code: ApprovalRejectionCode; reason: string }

/**
 * /3: a /2 approval (requestDigest binding, or a 16-hex rulebook fingerprint),
 * or one declaring another spec, is refused by name whether or not the
 * rulebook declares trusted keys. When it does, an approval must further be
 * the verified object `verifyApproval` produced, for this very rule,
 * rulebook, participant, action and area, valid at `now`, and not yet used.
 * Why it is not, in plain words; null when it is.
 */
function approvalBound3(approval: SeenApproval, rulebook: InternalRulebook, ruleId: string, b: Binding, nowMs: number | null, consumed: Set<string>): Unbound | null {
  if (approval.requestDigest !== undefined || fingerprintVersion(approval.rulebookFingerprint) === 2) return { code: 'spec', reason: `it is a robot-domain-rules/2 approval (bound by requestDigest); this implementation is /3 and does not reinterpret it — have it re-issued under ${APPROVAL_SPEC}` };
  if (approval.spec !== undefined && approval.spec !== APPROVAL_SPEC) return { code: 'spec', reason: `it declares spec ${JSON.stringify(approval.spec)}, not ${APPROVAL_SPEC}` };
  if (!rulebook.trustedKeys?.length) return null;
  if (approval.spec !== APPROVAL_SPEC) return { code: 'spec', reason: `it does not declare spec ${APPROVAL_SPEC}` };
  if (!approval.handle) return { code: 'unverified', reason: 'this rulebook accepts only approvals verified against its trusted keys, and nothing in a request can assert that — verify first with verifyApproval, or use verifyAndEvaluate' };
  if (approval.ruleId !== ruleId) return { code: 'rule', reason: `it is for rule "${approval.ruleId ?? ''}", not "${ruleId}"` };
  if (approval.rulebookFingerprint !== rulebook.fingerprint) return { code: 'rulebook', reason: `it was given under another rulebook (${approval.rulebookFingerprint ?? 'missing'}, this one is ${rulebook.fingerprint})` };
  if (approval.participantId !== b.participantId) return { code: 'participant', reason: `it is for participant "${approval.participantId ?? ''}", not "${b.participantId}"` };
  if (approval.action !== b.action) return { code: 'tool', reason: `it is for action "${approval.action ?? ''}", not "${b.action}"` };
  if (approval.areaId !== b.areaId) return { code: 'scope', reason: `it is for area "${approval.areaId ?? ''}", not "${b.areaId}"` };
  return windowBound(approval, nowMs, consumed);
}

/**
 * /1 (SPEC.md § 16.6): the approval must declare the /1 spec; with trusted
 * keys it must be the verified handle and bind to this rule, this rulebook's
 * fingerprint, the principal, the participant, the tool, the scope and the
 * digest of these exact arguments, with an unconsumed nonce, inside its
 * window at `now`. The first failure is the rejection code. Without trusted
 * keys a plain approval is accepted (development only), as in /3.
 */
function approvalBound1(approval: SeenApproval, rulebook: InternalRulebook, ruleId: string, b: Binding, nowMs: number | null, consumed: Set<string>): Unbound | null {
  if (approval.spec === APPROVAL_SPEC || approval.requestDigest !== undefined || (approval.spec === undefined && approval.action !== undefined)) return { code: 'spec', reason: `it is a robot-domain-rules approval (${approval.spec ?? 'bound to an action and an area'}); a ${GOVERNANCE_APPROVAL_SPEC} approval binds to the principal, the tool, the scope and the arguments — have it re-issued` };
  if (approval.spec !== undefined && approval.spec !== GOVERNANCE_APPROVAL_SPEC) return { code: 'spec', reason: `it declares spec ${JSON.stringify(approval.spec)}, not ${GOVERNANCE_APPROVAL_SPEC}` };
  if (!rulebook.trustedKeys?.length) return null;
  if (approval.spec !== GOVERNANCE_APPROVAL_SPEC) return { code: 'spec', reason: `it does not declare spec ${GOVERNANCE_APPROVAL_SPEC}` };
  if (!approval.handle) return { code: 'unverified', reason: 'this rulebook accepts only approvals verified against its trusted keys, and nothing in a request can assert that — verify first with verifyApproval, or use verifyAndEvaluate' };
  if (approval.ruleId !== ruleId) return { code: 'rule', reason: `it is for rule "${approval.ruleId ?? ''}", not "${ruleId}"` };
  if (approval.rulebookFingerprint !== rulebook.fingerprint) return { code: 'rulebook', reason: `it was given under another rulebook (${approval.rulebookFingerprint ?? 'missing'}, this one is ${rulebook.fingerprint})` };
  if (approval.principalId !== b.principalId) return { code: 'principal', reason: `it is for principal "${approval.principalId ?? ''}", not "${b.principalId ?? ''}"` };
  if (approval.participantId !== b.participantId) return { code: 'participant', reason: `it is for participant "${approval.participantId ?? ''}", not "${b.participantId}"` };
  if (approval.tool !== b.action) return { code: 'tool', reason: `it is for tool "${approval.tool ?? ''}", not "${b.action}"` };
  if (approval.scope !== b.areaId) return { code: 'scope', reason: `it is for scope "${approval.scope ?? ''}", not "${b.areaId}"` };
  if (approval.argsDigest !== b.argsDigest) return { code: 'args', reason: `it approves arguments with digest ${approval.argsDigest ?? 'missing'}; this call's arguments have digest ${b.argsDigest} (an approval binds to the exact arguments)` };
  return windowBound(approval, nowMs, consumed);
}

/** Nonce and validity window, shared by both formats. */
function windowBound(approval: SeenApproval, nowMs: number | null, consumed: Set<string>): Unbound | null {
  if (approval.nonce === undefined || consumed.has(approval.nonce)) return { code: 'replayed', reason: `approval ${approval.nonce ?? ''} was already used (it is in consumedApprovals)` };
  const issued = parseTimestamp(approval.issuedAt), expires = parseTimestamp(approval.expiresAt);
  if (issued === null || expires === null) return { code: 'window_malformed', reason: 'its issuedAt or expiresAt is not a timestamp' };
  if (nowMs === null) return { code: 'no_now', reason: 'the request carries no `now` to check its validity window against' };
  if (nowMs < issued) return { code: 'not_yet_valid', reason: `it is not valid yet (issued ${approval.issuedAt}, now ${new Date(nowMs).toISOString()})` };
  if (nowMs >= expires) return { code: 'expired', reason: `it expired at ${approval.expiresAt} (now ${new Date(nowMs).toISOString()})` };
  return null;
}

/** Why the approval is not enough, in plain words; null when it is. */
function approvalSufficient(approval: SeenApproval, by: string | undefined, vocab: Vocabulary): string | null {
  if (!by) return null;
  const need = authorityRank(vocab, by);
  if (need >= 0) {
    if (!approval.authority) return `the approval names no authority`;
    const has = authorityRank(vocab, approval.authority);
    return has >= 0 && has <= need ? null : `${approval.authority} is below ${by}`;
  }
  if (by.startsWith('tag:')) {
    const tag = by.slice(4);
    const role = approval.roleId ? vocab.roles.get(approval.roleId) : undefined;
    return role?.tags?.includes(tag) ? null : `the approver's role is not tagged ${tag}`;
  }
  return approval.roleId === by ? null : `the approver's role is not ${by}`;
}

// ─── Request shape and facts ─────────────────────────────────────────────────

function shapeProblems(request: InternalRequest, vocab: Vocabulary, d: Dialect): string[] {
  const problems: string[] = [];
  if (!request || typeof request !== 'object') return ['no request was given'];
  const p = request.participant;
  if (!p || typeof p !== 'object') problems.push('participant is missing');
  else {
    if (!nonEmpty(p.kind) || !vocab.kinds.has(p.kind)) problems.push(`participant.kind must be one of ${[...vocab.kinds].join(', ')}, got ${show(p.kind)}`);
    if (!nonEmpty(p.roleId)) problems.push('participant.roleId must be a non-empty string');
  }
  if (!nonEmpty(request.areaId ?? request.zoneId)) problems.push(`${d.placeField} must be a non-empty string`);
  if (!nonEmpty(request.action)) problems.push(`${d.subjectField} must be a non-empty string`);
  if (!request.facts || typeof request.facts !== 'object') problems.push('facts are missing');
  if (d.governance) {
    const pr = request.principal;
    if (!pr || typeof pr !== 'object' || !nonEmpty(pr.id)) problems.push('principal.id must be a non-empty string (the human whose authority the participant acts under)');
    if (p && typeof p === 'object') {
      const by = (p as { delegatedBy?: unknown }).delegatedBy;
      const chain = request.delegation;
      if (by !== undefined && !nonEmpty(by)) problems.push(`participant.delegatedBy must be a non-empty string when given, got ${show(by)}`);
      if (nonEmpty(by) && chain === undefined) problems.push('delegation is required when participant.delegatedBy is set: the chain of { id, roleId } the harness assembled, outermost first');
      if (chain !== undefined) {
        if (!Array.isArray(chain) || chain.length === 0) problems.push(`delegation must be a non-empty list of { id, roleId }, got ${show(chain)}`);
        else {
          chain.forEach((l, i) => { if (!l || typeof l !== 'object' || !nonEmpty(l.id) || !nonEmpty(l.roleId)) problems.push(`delegation[${i}] must be { id, roleId } with non-empty strings, got ${show(l)}`); });
          if (!nonEmpty(by)) problems.push('participant.delegatedBy is required when a delegation chain is given');
          else if (chain[chain.length - 1] && chain[chain.length - 1].id !== by) problems.push(`the last link of delegation ("${String(chain[chain.length - 1].id)}") must be participant.delegatedBy ("${by}")`);
        }
      }
    }
  }
  return problems;
}

function validateFacts(rulebook: InternalRulebook, vocab: Vocabulary, request: InternalRequest, alsoRequired: string[], d: Dialect):
  { problems: string[]; problemFacts: string[]; facts: Record<string, FactValue>; approvals: SeenApproval[]; nowMs: number | null; consumed: Set<string> } {
  const problems: string[] = [];
  /** The IDs behind `problems`, in order, once each (`approvedBy` for the built-in approval, `now`, `consumedApprovals`). */
  const problemFacts: string[] = [];
  const flag = (id: string) => { if (!problemFacts.includes(id)) problemFacts.push(id); };
  const facts: Record<string, FactValue> = {};
  const given: Record<string, unknown> = { ...request.facts };
  if (request.targetRobotId !== undefined && given.targetRobotId === undefined) given.targetRobotId = request.targetRobotId;
  for (const def of rulebook.facts) {
    const v = given[def.id];
    if (v === undefined) {
      if (def.required || alsoRequired.includes(def.id)) { problems.push(`${def.id} is required (${describeType(def)}), got nothing`); flag(def.id); }
      else if (def.default !== undefined) facts[def.id] = def.default;
      continue;
    }
    const p = factProblem(def, v);
    if (p) { problems.push(p); flag(def.id); } else facts[def.id] = v as FactValue;
  }
  let nowMs: number | null = null;
  if (request.now !== undefined) {
    nowMs = parseTimestamp(request.now);
    if (nowMs === null) { problems.push(`now must be a timestamp with a date ("YYYY-MM-DDTHH:MM", optional seconds and offset), got ${show(request.now)}`); flag('now'); }
  }
  const consumed = new Set<string>();
  if (request.consumedApprovals !== undefined) {
    if (!Array.isArray(request.consumedApprovals) || request.consumedApprovals.some(n => typeof n !== 'string')) { problems.push(`consumedApprovals must be a list of strings when given, got ${show(request.consumedApprovals)}`); flag('consumedApprovals'); }
    else for (const n of request.consumedApprovals) consumed.add(n);
  }
  // approvedBy: one approval or a list of them. Any `verified` member is ignored: only object identity (verified.ts) says an approval was verified.
  const approvals: SeenApproval[] = [];
  const fields = d.approvalFields as readonly (keyof SeenApproval)[];
  const readApproval = (a: unknown, where: string): void => {
    if (nonEmpty(a)) { approvals.push({ id: a, handle: false }); return; }
    if (a && typeof a === 'object' && !Array.isArray(a) && nonEmpty((a as Approval).id)) {
      const o = a as Record<string, unknown>;
      const approval: SeenApproval = { id: o.id as string, handle: isVerified(a) };
      for (const field of fields) {
        if (o[field] !== undefined) { if (typeof o[field] !== 'string') problems.push(`${where}.${field} must be a string when given, got ${show(o[field])}`); else (approval as unknown as Record<string, unknown>)[field] = o[field]; }
      }
      if (o.authority !== undefined) {
        if (authorityRank(vocab, String(o.authority)) < 0) problems.push(`${where}.authority "${String(o.authority)}" is not a declared authority`);
        else approval.authority = o.authority as string;
      }
      if (o.roleId !== undefined) {
        if (!vocab.roles.has(String(o.roleId))) problems.push(`${where}.roleId "${String(o.roleId)}" is not a declared role`);
        else approval.roleId = o.roleId as string;
      }
      // A signed approval under a rulebook with trusted keys is checked against `now`: without it the validity window cannot be judged.
      if (rulebook.trustedKeys?.length && request.now === undefined) { problems.push('now is required to check the approval\'s validity window (issuedAt/expiresAt), got nothing'); flag('now'); }
      approvals.push(approval);
      return;
    }
    problems.push(`${where} must be a non-empty string or { id, authority?, roleId?, ... } when given, got ${show(a)}`);
  };
  const a = given.approvedBy;
  if (a !== undefined) {
    if (Array.isArray(a)) {
      if (a.length === 0) problems.push('approvedBy, when a list, must hold at least one approval');
      a.forEach((x, i) => readApproval(x, `approvedBy[${i}]`));
    } else readApproval(a, 'approvedBy');
    if (problems.some(x => x.startsWith('approvedBy'))) flag('approvedBy');
  }
  return { problems, problemFacts, facts, approvals, nowMs, consumed };
}

function describeType(def: Rulebook['facts'][number]): string {
  switch (def.type) {
    case 'number': return `${def.integer ? 'a whole number' : 'a number'}${def.min !== undefined ? `, ${def.min} or more` : ''}${def.max !== undefined ? `, ${def.max} or less` : ''}`;
    case 'time': return '"HH:MM"';
    case 'enum': return `one of ${(def.values ?? []).join(', ')}`;
    case 'day': return 'mon..sun';
    case 'boolean': return 'true or false';
    case 'string': return 'a non-empty string';
  }
}

function nonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function actionName(name: string | undefined, id: string): string {
  return name ?? id.replace(/_/g, ' ');
}
