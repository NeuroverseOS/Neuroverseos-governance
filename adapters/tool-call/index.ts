/**
 * The enforcing adapter for tool calls (SPEC.md § 16.9).
 *
 *   govern(call, session, harness, executor) → Governed
 *
 * A model proposes a tool call. This adapter stands between the proposal and
 * the tool: it parses the call, asks the HARNESS for everything the decision
 * needs (the scope the call lands in, the facts, the projected spend, the
 * approvals it holds, the participant's history, the time, the consumed
 * nonces), verifies approvals in the trusted layer, asks the one evaluator,
 * and calls the executor ONLY on ALLOW or LIMIT (passing the limits). BLOCK
 * and PAUSE never reach the executor. Anything that goes wrong before the
 * executor is a BLOCK with the executor not called; an executor that throws
 * is recorded, its spend reservation released and no nonce consumed.
 *
 * Nothing here comes from the requester: the model's description of its
 * intent is not an input, and the facts are the harness's. Zero runtime
 * dependencies; the engine only.
 */

import type {
  DelegationLink, DomainCheck, GovernanceDecision, GovernanceHistoryEntry, GovernanceParticipant, GovernanceRequest, GovernanceRulebook, Timestamp,
} from '../../src/types';
import { verifyApproval } from '../../src/approvals';
import { evaluate } from '../../src/evaluate';
import { rulebookVersionProblem, RULEBOOK_VERSION_CHECK } from '../../src/version';

/** A tool call as a model emits it: the OpenAI shape, or a plain { name, args }. */
export type ToolCall =
  | { id?: string; type?: string; function: { name: string; arguments?: string | Record<string, unknown> } }
  | { id?: string; name: string; args?: unknown };

/** Who is calling, under whose authority, with which rulebook (a mission's compiled rulebook when one is active). */
export interface Session {
  rulebook: GovernanceRulebook;
  principal: { id: string };
  participant: GovernanceParticipant;
  delegation?: DelegationLink[];
}

/** What the adapter tells the harness about the call it is resolving. */
export interface CallContext {
  session: Session;
  callId?: string;
  now: Timestamp;
}

/** A spend reservation: the projected totals as facts, held until the adapter commits (the tool ran) or releases (it did not). */
export interface Reservation {
  facts: Record<string, number>;
  commit(): void;
  release(): void;
}

/**
 * The integrator's trusted layer. Everything the decision needs comes from
 * here, never from the requester.
 */
export interface Harness {
  /** The instant of the call (the engine has no clock). */
  now(): Timestamp;
  /** The scope the call lands in (a mail domain, a file tree, a payment rail, a data store), resolved from the tool and its arguments. */
  resolveScope(tool: string, args: Record<string, unknown>, ctx: CallContext): string;
  /** Facts the harness supplies for this call (a classifier's verdict, a record lookup). */
  facts?(tool: string, args: Record<string, unknown>, ctx: CallContext): Record<string, unknown>;
  /** Derived facts by fact ID, computed from the arguments by integrator-declared functions; computed for the facts the tool requires. */
  derive?: Record<string, (args: Record<string, unknown>, ctx: CallContext) => unknown>;
  /** The spend ledger's atomic reserve for this call, or null when no ledger applies. */
  reserve?(tool: string, args: Record<string, unknown>, ctx: CallContext): Reservation | null;
  /** The signed approvals the harness holds for this call (one, a list, or nothing). Verified by the adapter, never trusted as given. */
  approvals?(tool: string, args: Record<string, unknown>, ctx: CallContext): unknown;
  /** The nonces already acted on. */
  consumed: { has(nonce: string): boolean; add(nonce: string): void; list(): string[] };
  /** What each participant has done, as this harness recorded it. */
  history: { of(participantId: string): GovernanceHistoryEntry[]; append(participantId: string, entry: GovernanceHistoryEntry): void };
  /** Append `{ tool: "approval_refused", scope }` to the history on a PAUSE that rejected an approval. Default: when the rulebook declares a tool `approval_refused`. */
  recordRefusals?: boolean;
}

export type Executor = (tool: string, args: Record<string, unknown>, context: { limits?: Record<string, number>; decision: GovernanceDecision; request: GovernanceRequest }) => Promise<unknown> | unknown;

export interface Governed {
  status: 'ALLOW' | 'LIMIT' | 'PAUSE' | 'BLOCK';
  /** Whether the executor was called. True only on ALLOW or LIMIT. */
  executed: boolean;
  decision: GovernanceDecision;
  /** The request as built from the harness and the call; absent when the call never became one. */
  request?: GovernanceRequest;
  result?: unknown;
  /** Approvals the harness held that did not verify (bad signature, untrusted key, malformed): the evaluator then rejects them as `unverified`; this says why. Never the approval itself. */
  approvalsUnverified?: Array<{ id: string; reason: string }>;
  error?: { stage: 'parse' | 'harness' | 'evaluate' | 'executor'; message: string };
  callId?: string;
  tool?: string;
  scope?: string;
}

/** The adapter's own refusals: never in a rulebook, always `setBy: "adapter"`. */
export const ADAPTER_CHECKS = {
  malformed: 'tool_call_malformed',
  args: 'args_wellformed',
  harness: 'harness_failed',
  evaluate: 'evaluation_failed',
} as const;

const refusal = (ruleId: string, reason: string, fingerprint: string): GovernanceDecision => {
  const check: DomainCheck = { ruleId, status: 'BLOCK', reason, setBy: ruleId === RULEBOOK_VERSION_CHECK ? 'builtin' : 'adapter' };
  return { status: 'BLOCK', reasons: [check], trace: [check], fingerprint };
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Parse the call into a tool name and an argument object; a problem is a reason string. */
export function parseToolCall(call: unknown): { tool: string; args: Record<string, unknown>; callId?: string } | { problem: string; ruleId: string } {
  if (!call || typeof call !== 'object') return { problem: `the tool call is not an object, got ${JSON.stringify(call)}`, ruleId: ADAPTER_CHECKS.malformed };
  const c = call as { id?: unknown; function?: unknown; name?: unknown; args?: unknown };
  const callId = typeof c.id === 'string' ? c.id : undefined;
  let name: unknown, raw: unknown;
  if (c.function !== undefined) {
    if (!c.function || typeof c.function !== 'object') return { problem: 'function must be an object { name, arguments }', ruleId: ADAPTER_CHECKS.malformed };
    name = (c.function as { name?: unknown }).name;
    raw = (c.function as { arguments?: unknown }).arguments;
  } else { name = c.name; raw = c.args; }
  if (typeof name !== 'string' || !name) return { problem: 'the tool call names no tool', ruleId: ADAPTER_CHECKS.malformed };
  let args: unknown;
  if (raw === undefined || raw === null || raw === '') args = {};
  else if (typeof raw === 'string') {
    try { args = JSON.parse(raw); } catch (e) { return { problem: `arguments are not JSON (${message(e)}): ${raw.slice(0, 120)}`, ruleId: ADAPTER_CHECKS.args }; }
  } else args = raw;
  if (!args || typeof args !== 'object' || Array.isArray(args)) return { problem: `arguments must be a JSON object, got ${JSON.stringify(args)}`, ruleId: ADAPTER_CHECKS.args };
  return { tool: name, args: args as Record<string, unknown>, ...(callId !== undefined ? { callId } : {}) };
}

export async function govern(call: unknown, session: Session, harness: Harness, executor: Executor): Promise<Governed> {
  const rulebook = session?.rulebook;
  const fingerprint = typeof (rulebook as { fingerprint?: unknown } | undefined)?.fingerprint === 'string' ? rulebook.fingerprint : '';
  const blocked = (ruleId: string, stage: Governed['error'] extends infer E ? E extends { stage: infer S } ? S : never : never, reason: string, extra: Partial<Governed> = {}): Governed =>
    ({ status: 'BLOCK', executed: false, decision: refusal(ruleId, reason, fingerprint), error: { stage, message: reason }, ...extra });

  const versionProblem = rulebookVersionProblem(rulebook, 'governance');
  if (versionProblem) return blocked(RULEBOOK_VERSION_CHECK, 'evaluate', `This rulebook cannot be decided with: ${versionProblem}`);

  // 1. Parse. A call that cannot be read is refused; nothing runs.
  const parsed = parseToolCall(call);
  if ('problem' in parsed) return blocked(parsed.ruleId, 'parse', `The tool call cannot be run: ${parsed.problem}.`);
  const { tool, args, callId } = parsed;

  // 2. Ask the harness. Facts, scope, spend, approvals, history, time: the trusted layer's, never the requester's.
  let scope: string, now: Timestamp, facts: Record<string, unknown>, reservation: Reservation | null = null, approvals: unknown, history: GovernanceHistoryEntry[], consumed: string[];
  try {
    now = harness.now();
    const ctx: CallContext = { session, now, ...(callId !== undefined ? { callId } : {}) };
    scope = harness.resolveScope(tool, args, ctx);
    if (typeof scope !== 'string' || !scope) throw new Error(`resolveScope returned ${JSON.stringify(scope)}, not a scope id`);
    facts = { ...(harness.facts?.(tool, args, ctx) ?? {}) };
    const toolDef = rulebook.tools.find(t => t.id === tool);
    for (const factId of toolDef?.requires ?? []) {
      const fn = harness.derive?.[factId];
      if (fn && facts[factId] === undefined) facts[factId] = fn(args, ctx);
    }
    reservation = harness.reserve?.(tool, args, ctx) ?? null;
    if (reservation) Object.assign(facts, reservation.facts);
    approvals = harness.approvals?.(tool, args, ctx);
    history = harness.history.of(session.participant.id);
    consumed = harness.consumed.list();
  } catch (e) {
    try { reservation?.release(); } catch { /* the reservation is the harness's; a failing release is reported with the cause below */ }
    return blocked(ADAPTER_CHECKS.harness, 'harness', `The harness failed, so the call cannot be judged: ${message(e)}`, { callId, tool });
  }

  // 3. Verify the approvals the harness holds (the trusted layer's job), build the request, decide. The evaluator stays pure.
  const approvalsUnverified: Array<{ id: string; reason: string }> = [];
  let decision: GovernanceDecision;
  let request: GovernanceRequest;
  try {
    const verified = await verifyAll(approvals, rulebook, approvalsUnverified);
    request = {
      principal: session.principal,
      participant: session.participant,
      ...(session.delegation !== undefined ? { delegation: session.delegation } : {}),
      tool, scope, args,
      facts: verified !== undefined ? { ...facts, approvedBy: verified } : facts,
      history, now, consumedApprovals: consumed,
    };
    decision = evaluate(rulebook, request);
  } catch (e) {
    try { reservation?.release(); } catch { /* reported below */ }
    return blocked(ADAPTER_CHECKS.evaluate, 'evaluate', `Evaluation failed, so the call cannot be judged: ${message(e)}`, { callId, tool, scope });
  }
  const extra = approvalsUnverified.length ? { approvalsUnverified } : {};

  // 4. Act — only on ALLOW or LIMIT.
  if (decision.status === 'BLOCK' || decision.status === 'PAUSE') {
    reservation?.release();
    const refusals = harness.recordRefusals ?? rulebook.tools.some(t => t.id === 'approval_refused');
    if (refusals && decision.status === 'PAUSE' && decision.approvalsRejected?.length) harness.history.append(session.participant.id, { tool: 'approval_refused', scope, at: now });
    return { status: decision.status, executed: false, decision, request, callId, tool, scope, ...extra };
  }
  let result: unknown;
  try {
    result = await executor(tool, args, { ...(decision.limits ? { limits: decision.limits } : {}), decision, request });
  } catch (e) {
    reservation?.release();
    return { status: decision.status, executed: true, decision, request, error: { stage: 'executor', message: message(e) }, callId, tool, scope, ...extra };
  }
  reservation?.commit();
  for (const u of decision.approvalsUsed ?? []) harness.consumed.add(u.nonce);
  harness.history.append(session.participant.id, { tool, scope, at: now });
  return { status: decision.status, executed: true, decision, request, result, callId, tool, scope, ...extra };
}

/**
 * Verify every approval object the harness holds against the rulebook's
 * trusted keys. A verified one becomes the handle the evaluator accepts; one
 * that does not verify is passed through as given (the evaluator rejects it
 * as `unverified`) and the reason is recorded. Strings (plain approvals, the
 * development path without trusted keys) pass through. Returns what to put in
 * `facts.approvedBy`, or undefined when there is nothing.
 */
async function verifyAll(approvals: unknown, rulebook: GovernanceRulebook, unverified: Array<{ id: string; reason: string }>): Promise<unknown> {
  if (approvals === undefined || approvals === null) return undefined;
  const list = Array.isArray(approvals) ? approvals : [approvals];
  if (!list.length) return undefined;
  const one = async (a: unknown): Promise<unknown> => {
    if (!a || typeof a !== 'object' || !rulebook.trustedKeys?.length) return a;
    const r = await verifyApproval(a, rulebook);
    if (r.ok) return r.approval;
    unverified.push({ id: String((a as { id?: unknown }).id ?? ''), reason: r.reason ?? 'the approval does not verify' });
    return a;
  };
  const out = await Promise.all(list.map(one));
  return Array.isArray(approvals) ? out : out[0];
}
