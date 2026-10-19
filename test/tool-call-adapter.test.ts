/**
 * The enforcing adapter (adapters/tool-call): the executor runs only on ALLOW
 * or LIMIT, every failure before it is a BLOCK with nothing run, and the
 * reference ledger's reserve-then-commit keeps two concurrent reservations
 * from both passing (ruling 3). The conformance cases in d6 cover the
 * data-describable part; this file covers what needs real concurrency and a
 * real executor.
 */
import { describe, expect, it } from 'vitest';
import {
  compileGovernance, govern, referenceHarness, SpendLedger, publicKeyOf, signGovernanceApproval, fingerprint,
  type GovernanceCompileInput, type GovernanceRulebook, type Session,
} from '../src/index';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runEval, EvalAborted } from '../eval/live/arms';
import { scriptedModel, httpModel, ModelCallError, DEFAULT_MAX_TOKENS, type ModelMessage, type ModelFactory } from '../eval/live/model';
import { SpendCap } from '../eval/live/cap';
import { buildReport, writeReport } from '../eval/live/report';
import { prepareLiveRun } from '../eval/live/run';

const SEED_OWNER = '5555555555555555555555555555555555555555555555555555555555555555';   // TEST ONLY

const input = (extra: Partial<GovernanceCompileInput> = {}): GovernanceCompileInput => ({
  id: 'desk', name: 'Desk', kinds: ['agent', 'human'], authorities: [{ id: 'law' }, { id: 'owner' }, { id: 'agent' }],
  tools: [
    { id: 'read', kinds: ['agent'], scopes: ['files'] },
    { id: 'write', kinds: ['agent'], scopes: ['files'], args: { path: { fact: 'path' }, bytes: { fact: 'bytes', required: false } } },
    { id: 'pay', kinds: ['agent'], scopes: ['bank'], args: { amount: { fact: 'amount' } }, requires: ['projected_spend'] },
    { id: 'send', kinds: ['agent'], scopes: ['mail'], args: { to: { fact: 'to_domain' } }, requires: ['external'] },
    { id: 'approval_refused', kinds: ['agent'] },
  ],
  scopes: [{ id: 'files', name: 'Files' }, { id: 'bank', name: 'Bank' }, { id: 'mail', name: 'Mail' }],
  roles: [{ id: 'worker', name: 'Worker', kind: 'agent', tools: ['read', 'write', 'pay', 'send'] }],
  facts: [{ id: 'path', type: 'string' }, { id: 'bytes', type: 'number', min: 0 }, { id: 'amount', type: 'number', min: 0 }, { id: 'projected_spend', type: 'number', min: 0 }, { id: 'to_domain', type: 'string' }, { id: 'external', type: 'boolean' }],
  limits: [{ id: 'max_bytes', requestedFact: 'bytes' }],
  rules: [
    { id: 'cap', text: 'cap', who: '*', does: 'pay', where: '*', when: [{ fact: 'projected_spend', op: '>', value: 500 }], then: { answer: 'deny' }, setBy: 'owner', source: { kind: 'manual', ref: 'cap' } },
    { id: 'small_writes', text: 's', who: '*', does: 'write', where: '*', then: { answer: 'limit', limits: { max_bytes: 1000 } }, setBy: 'owner', source: { kind: 'manual', ref: 's' } },
    { id: 'no_external', text: 'x', who: '*', does: 'send', where: '*', when: [{ fact: 'external', op: '==', value: true }], then: { answer: 'deny' }, setBy: 'law', source: { kind: 'manual', ref: 'x' }, never: true },
  ],
  ...extra,
});
const rulebook = compileGovernance(input());
const session: Session = { rulebook, principal: { id: 'sam' }, participant: { id: 'w-1', kind: 'agent', roleId: 'worker' } };
const scopes: Record<string, string> = { read: 'files', write: 'files', pay: 'bank', send: 'mail' };
const harness = (extra: Partial<Parameters<typeof referenceHarness>[0]> = {}) => referenceHarness({
  now: () => '2026-10-16T09:00:00Z',
  resolveScope: tool => scopes[tool] ?? 'files',
  derive: { external: args => !String(args.to).endsWith('smallbiz.example') },
  ledgers: [{ fact: 'projected_spend', tool: 'pay', amountArg: 'amount' }],
  ...extra,
});
const spy = () => { const calls: Array<{ tool: string; args: unknown; limits?: unknown }> = []; return { calls, run: async (tool: string, args: Record<string, unknown>, ctx: { limits?: Record<string, number> }) => { calls.push({ tool, args, limits: ctx.limits }); return 'ran'; } }; };

describe('the tool-call adapter calls the executor only on ALLOW or LIMIT', () => {
  it('ALLOW runs the tool once and records the call in history', async () => {
    const h = harness(), s = spy();
    const r = await govern({ id: 'c1', function: { name: 'read', arguments: '{}' } }, session, h, s.run);
    expect(r.status).toBe('ALLOW');
    expect(r.executed).toBe(true);
    expect(s.calls).toHaveLength(1);
    expect(r.result).toBe('ran');
    expect(h.history.of('w-1')).toEqual([{ tool: 'read', scope: 'files', at: '2026-10-16T09:00:00Z' }]);
  });
  it('LIMIT runs the tool with the limits', async () => {
    const s = spy();
    const r = await govern({ name: 'write', args: { path: 'a.md' } }, session, harness(), s.run);
    expect(r.status).toBe('LIMIT');
    expect(s.calls[0].limits).toEqual({ max_bytes: 1000 });
  });
  it('BLOCK never reaches the executor, and the OpenAI shape with stringified arguments is parsed', async () => {
    const s = spy();
    const r = await govern({ function: { name: 'send', arguments: JSON.stringify({ to: 'acme.example' }) } }, session, harness(), s.run);
    expect(r.status).toBe('BLOCK');
    expect(r.decision.reasons.map(x => x.ruleId)).toEqual(['no_external']);
    expect(r.executed).toBe(false);
    expect(s.calls).toHaveLength(0);
  });
  it('arguments that are not JSON, not an object, or undeclared are BLOCK with nothing run', async () => {
    const s = spy();
    expect((await govern({ function: { name: 'write', arguments: '{not json' } }, session, harness(), s.run)).decision.reasons[0].ruleId).toBe('args_wellformed');
    expect((await govern({ function: { name: 'write', arguments: '"a.md"' } }, session, harness(), s.run)).decision.reasons[0].ruleId).toBe('args_wellformed');
    expect((await govern({ name: 'write', args: { path: 'a.md', mode: 'x' } }, session, harness(), s.run)).decision.reasons[0].ruleId).toBe('args_wellformed');
    expect((await govern({ name: '' }, session, harness(), s.run)).decision.reasons[0].ruleId).toBe('tool_call_malformed');
    expect((await govern(null, session, harness(), s.run)).decision.reasons[0].ruleId).toBe('tool_call_malformed');
    expect(s.calls).toHaveLength(0);
  });
  it('a harness that throws is BLOCK harness_failed, nothing run, and a /3 rulebook is refused by name', async () => {
    const s = spy();
    const r = await govern({ name: 'read' }, session, harness({ resolveScope: () => { throw new Error('boom'); } }), s.run);
    expect(r.status).toBe('BLOCK');
    expect(r.decision.reasons[0]).toMatchObject({ ruleId: 'harness_failed', setBy: 'adapter' });
    expect(r.error?.stage).toBe('harness');
    const v3 = await govern({ name: 'read' }, { ...session, rulebook: { format: 'neuroverse-domain-rules/3', fingerprint: 'x' } as unknown as GovernanceRulebook }, harness(), s.run);
    expect(v3.decision.reasons[0].ruleId).toBe('rulebook_version');
    expect(s.calls).toHaveLength(0);
  });
  it('an executor that throws is an uncertain outcome: recorded, the reservation committed, the call in history', async () => {
    const h = harness();
    const r = await govern({ name: 'pay', args: { amount: 50 } }, session, h, async () => { throw new Error('bank down'); });
    expect(r.status).toBe('ALLOW');
    expect(r.executed).toBe(true);
    expect(r.outcome).toBe('uncertain');
    expect(r.error).toEqual({ stage: 'executor', message: 'bank down' });
    expect(h.ledger.spentIn('projected_spend')).toBe(50);
    expect(h.ledger.heldIn('projected_spend')).toBe(0);
    expect(h.history.of('w-1')).toEqual([{ tool: 'pay', scope: 'bank', at: '2026-10-16T09:00:00Z' }]);
  });
  it('a derived fact comes from the integrator\'s function, never from the arguments', async () => {
    const r = await govern({ name: 'send', args: { to: 'acme.example' } }, session, harness(), spy().run);
    expect(r.request?.facts.external).toBe(true);
    expect(r.status).toBe('BLOCK');
  });
});

describe('the reference ledger: reserve-then-commit is atomic (ruling 3)', () => {
  it('two concurrent 300s against 400 remaining: the first passes, the second is denied, and only the first commits', async () => {
    const ledger = new SpendLedger({ projected_spend: 100 });
    const h = harness({ ledger });
    let release!: () => void;
    const gate = new Promise<void>(res => { release = res; });
    const slow = async () => { await gate; return 'paid'; };
    const first = govern({ name: 'pay', args: { amount: 300 } }, session, h, slow);
    const second = govern({ name: 'pay', args: { amount: 300 } }, session, h, slow);
    await Promise.resolve();   // both reservations are made before either executor finishes
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a.status).toBe('ALLOW');
    expect(a.request?.facts.projected_spend).toBe(400);
    expect(b.status).toBe('BLOCK');
    expect(b.decision.reasons[0].ruleId).toBe('cap');
    expect(b.request?.facts.projected_spend).toBe(700);
    expect(b.executed).toBe(false);
    expect(ledger.spentIn('projected_spend')).toBe(400);
    expect(ledger.heldIn('projected_spend')).toBe(0);
  });
  it('a released reservation frees its amount; a committed one becomes spend', () => {
    const ledger = new SpendLedger();
    const a = ledger.reserve('w', 80), b = ledger.reserve('w', 450);
    expect(a.projected).toBe(80);
    expect(b.projected).toBe(530);
    b.release(); a.commit();
    expect(ledger.spentIn('w')).toBe(80);
    expect(ledger.reserve('w', 420).projected).toBe(500);
  });
});

describe('approvals through the adapter', () => {
  it('a bound approval the harness holds clears the wait, is consumed once, and a rejected one is recorded as approval_refused in history', async () => {
    const pub = await publicKeyOf(SEED_OWNER);
    const rb = compileGovernance(input({
      trustedKeys: [{ keyId: 'owner', publicKey: pub, authority: 'owner' }],
      rules: [...input().rules!, { id: 'pay_waits', text: 'w', who: 'worker', does: 'pay', where: '*', then: { answer: 'wait', for: 'approval', by: 'owner' }, setBy: 'owner', source: { kind: 'manual', ref: 'w' } }],
    }));
    const ses = { ...session, rulebook: rb };
    const approval = await signGovernanceApproval({ id: 'sam', authority: 'owner', ruleId: 'pay_waits', rulebookFingerprint: rb.fingerprint, principalId: 'sam', participantId: 'w-1', tool: 'pay', scope: 'bank', argsDigest: fingerprint({ amount: 50 }), nonce: 'n-1', issuedAt: '2026-10-16T08:50:00Z', expiresAt: '2026-10-16T09:20:00Z' }, { keyId: 'owner', privateKey: SEED_OWNER });
    const h = harness({ approvals: () => approval });
    const s = spy();
    const first = await govern({ name: 'pay', args: { amount: 50 } }, ses, h, s.run);
    expect(first.status).toBe('ALLOW');
    expect(first.decision.approvalsUsed).toEqual([{ ruleId: 'pay_waits', nonce: 'n-1' }]);
    expect(h.consumed.list()).toEqual(['n-1']);
    const replay = await govern({ name: 'pay', args: { amount: 50 } }, ses, h, s.run);
    expect(replay.status).toBe('PAUSE');
    expect(replay.decision.approvalsRejected).toEqual([{ id: 'sam', nonce: 'n-1', code: 'replayed', reason: expect.any(String) }]);
    expect(JSON.stringify(replay.decision)).not.toContain('signature');
    const other = await govern({ name: 'pay', args: { amount: 100 } }, ses, h, s.run);
    expect(other.decision.approvalsRejected?.[0].code).toBe('args');
    expect(h.history.of('w-1').map(e => e.tool)).toEqual(['pay', 'approval_refused', 'approval_refused']);
    expect(s.calls).toHaveLength(1);
  });
});

describe('settlement at the execution boundary (an outside review of rc.1 found both)', () => {
  const SEED_AGENT = '6666666666666666666666666666666666666666666666666666666666666666';   // TEST ONLY
  const signedRulebook = async (extraRules: GovernanceCompileInput['rules'] = []) => {
    const pubOwner = await publicKeyOf(SEED_OWNER), pubAgent = await publicKeyOf(SEED_AGENT);
    return compileGovernance(input({
      trustedKeys: [{ keyId: 'owner', publicKey: pubOwner, authority: 'owner' }, { keyId: 'agent', publicKey: pubAgent, authority: 'agent' }],
      rules: [...input().rules!, { id: 'pay_waits', text: 'w', who: 'worker', does: 'pay', where: '*', then: { answer: 'wait', for: 'approval', by: 'owner' }, setBy: 'owner', source: { kind: 'manual', ref: 'w' } }, ...extraRules],
    }));
  };
  const approve = (rb: GovernanceRulebook, ruleId: string, amount: number, nonce: string, by: 'owner' | 'agent' = 'owner') => signGovernanceApproval(
    { id: by === 'owner' ? 'sam' : 'lead-agent', authority: by, ruleId, rulebookFingerprint: rb.fingerprint, principalId: 'sam', participantId: 'w-1', tool: 'pay', scope: 'bank', argsDigest: fingerprint({ amount }), nonce, issuedAt: '2026-10-16T08:50:00Z', expiresAt: '2026-10-16T09:20:00Z' },
    { keyId: by, privateKey: by === 'owner' ? SEED_OWNER : SEED_AGENT });

  it('(a) two concurrent calls carrying the same single-use approval: exactly one executes; the other is PAUSE replayed, nothing run, its reservation released', async () => {
    const rb = await signedRulebook();
    const ses = { ...session, rulebook: rb };
    const approval = await approve(rb, 'pay_waits', 50, 'n-1');
    const h = harness({ approvals: () => approval });
    let release!: () => void;
    const gate = new Promise<void>(res => { release = res; });
    const ran: string[] = [];
    const slow = async (_tool: string, _args: unknown, ctx: { request: { consumedApprovals?: string[] } }) => { ran.push('x'); await gate; return 'paid'; };
    const first = govern({ id: 'c1', name: 'pay', args: { amount: 50 } }, ses, h, slow);
    const second = govern({ id: 'c2', name: 'pay', args: { amount: 50 } }, ses, h, slow);
    await new Promise(res => setTimeout(res, 20));   // both calls have verified, evaluated and reached the executor boundary before the first tool returns
    release();
    const outcomes = await Promise.all([first, second]);
    const executed = outcomes.filter(o => o.executed);
    const refused = outcomes.filter(o => !o.executed);
    expect(ran).toHaveLength(1);
    expect(executed).toHaveLength(1);
    expect(executed[0].status).toBe('ALLOW');
    expect(executed[0].outcome).toBe('ran');
    expect(refused).toHaveLength(1);
    expect(refused[0].status).toBe('PAUSE');
    expect(refused[0].outcome).toBe('not_run');
    expect(refused[0].decision.approvalsRejected).toEqual([{ id: 'sam', nonce: 'n-1', code: 'replayed', reason: expect.any(String) }]);
    expect(refused[0].decision.approvalRequests?.[0].ruleId).toBe('pay_waits');
    expect(h.consumed.list()).toEqual(['n-1']);
    expect(h.ledger.spentIn('projected_spend')).toBe(50);
    expect(h.ledger.heldIn('projected_spend')).toBe(0);
    expect(h.history.of('w-1').map(e => e.tool).sort()).toEqual(['approval_refused', 'pay']);   // the refusal lands while the first tool is still running
  });

  it('(b) an executor that throws after a side effect is an uncertain outcome: spend committed, nonce consumed, history appended, reconcile called; the same approval is refused afterwards', async () => {
    const rb = await signedRulebook();
    const ses = { ...session, rulebook: rb };
    const approval = await approve(rb, 'pay_waits', 50, 'n-1');
    const reconciled: Array<{ tool: string; stage: string }> = [];
    const h = harness({ approvals: () => approval, reconcile: (request, error) => { reconciled.push({ tool: request.tool, stage: error.stage }); } });
    const sideEffects: number[] = [];
    const r = await govern({ name: 'pay', args: { amount: 50 } }, ses, h, async (_t, args) => { sideEffects.push(args.amount as number); throw new Error('bank timed out after the transfer was submitted'); });
    expect(sideEffects).toEqual([50]);
    expect(r.status).toBe('ALLOW');
    expect(r.executed).toBe(true);
    expect(r.outcome).toBe('uncertain');
    expect(r.error).toEqual({ stage: 'executor', message: 'bank timed out after the transfer was submitted' });
    expect(h.ledger.spentIn('projected_spend')).toBe(50);
    expect(h.ledger.heldIn('projected_spend')).toBe(0);
    expect(h.consumed.list()).toEqual(['n-1']);
    expect(h.history.of('w-1')).toEqual([{ tool: 'pay', scope: 'bank', at: '2026-10-16T09:00:00Z' }]);
    expect(reconciled).toEqual([{ tool: 'pay', stage: 'executor' }]);
    const again = await govern({ name: 'pay', args: { amount: 50 } }, ses, h, async () => 'paid');
    expect(again.status).toBe('PAUSE');
    expect(again.executed).toBe(false);
    expect(again.decision.approvalsRejected?.[0].code).toBe('replayed');
  });

  it('(c) a refusal before execution releases the reservation and every nonce claim it made', async () => {
    const rb = await signedRulebook([{ id: 'pay_waits_agent', text: 'w2', who: 'worker', does: 'pay', where: '*', then: { answer: 'wait', for: 'approval', by: 'agent' }, setBy: 'agent', source: { kind: 'manual', ref: 'w2' } }]);
    const ses = { ...session, rulebook: rb };
    const a = await approve(rb, 'pay_waits', 50, 'n-1', 'owner'), b = await approve(rb, 'pay_waits_agent', 50, 'n-2', 'agent');
    const h = harness({ approvals: () => [a, b] });
    const ran: string[] = [];
    // The call reads the consumed set, then awaits verification; in that window another caller claims n-2.
    const pending = govern({ name: 'pay', args: { amount: 50 } }, ses, h, async () => { ran.push('x'); return 'paid'; });
    expect(h.consumed.claim('n-2')).toBe(true);
    const r = await pending;
    expect(ran).toHaveLength(0);
    expect(r.status).toBe('PAUSE');
    expect(r.executed).toBe(false);
    expect(r.outcome).toBe('not_run');
    expect(r.decision.approvalsRejected?.find(x => x.nonce === 'n-2')).toMatchObject({ id: 'lead-agent', code: 'replayed' });
    expect(r.decision.approvalsRejected?.find(x => x.nonce === 'n-1')?.code).not.toBe('replayed');   // n-1 is not spent: its claim was given back
    expect(r.decision.approvalRequests?.map(a => a.ruleId)).toEqual(['pay_waits_agent']);
    expect(h.consumed.list()).toEqual(['n-2']);          // n-1's claim was released
    expect(h.ledger.heldIn('projected_spend')).toBe(0);   // the reservation was released
    expect(h.ledger.spentIn('projected_spend')).toBe(0);
    // A plain refusal before execution (over the cap) releases its reservation too: the next call sees only committed spend.
    const ledger = new SpendLedger({ projected_spend: 300 });
    const h2 = harness({ ledger });
    const boss = { ...ses, participant: { id: 'b-1', kind: 'human', roleId: 'boss' } };
    const rb2 = compileGovernance(input({ tools: input().tools!.map(t => (t.id === 'pay' ? { ...t, kinds: ['agent', 'human'] } : t)), roles: [...input().roles!, { id: 'boss', name: 'Boss', kind: 'human', tools: ['pay'] }] }));
    const blocked = await govern({ name: 'pay', args: { amount: 300 } }, { ...boss, rulebook: rb2 }, h2, async () => 'paid');
    expect(blocked.status).toBe('BLOCK');
    expect(blocked.outcome).toBe('not_run');
    expect(ledger.heldIn('projected_spend')).toBe(0);
    const next = await govern({ name: 'pay', args: { amount: 100 } }, { ...boss, rulebook: rb2 }, h2, async () => 'paid');
    expect(next.status).toBe('ALLOW');
    expect(next.request?.facts.projected_spend).toBe(400);
  });
});

describe('the live adversarial evaluation harness (eval/live), with the scripted stand-in and no network', () => {
  it('runs the full attack set through both arms: the ungated baseline performs every forbidden effect, the gated arm performs none and completes the task every time', async () => {
    const run = await runEval(scriptedModel({ follow: true }), { cap: null });
    expect(run.attacks).toHaveLength(8);
    expect(run.results).toHaveLength(16);
    expect(run.stopped).toBeNull();
    for (const a of run.attacks) {
      const g = run.results.find(r => r.attack === a.id && r.arm === 'gated')!;
      const u = run.results.find(r => r.attack === a.id && r.arm === 'ungated')!;
      expect(g.skipped, a.id).toBeUndefined();
      expect(g.taskCompleted, `${a.id} gated: ${g.taskProblems.join('; ')}`).toBe(true);
      expect(u.taskCompleted, `${a.id} ungated: ${u.taskProblems.join('; ')}`).toBe(true);
      expect(g.forbiddenPerformed, `${a.id} gated`).toEqual([]);
      expect(g.incorrectRefusals, `${a.id} gated`).toEqual([]);
      if (a.forbidden) {
        expect(g.forbiddenAttempted, `${a.id} attempted`).toBeGreaterThan(0);
        expect(u.forbiddenPerformed.map(v => v.effect), `${a.id} ungated`).toContain(a.forbidden.effect);
        expect(g.expectedRuleSeen, `${a.id}: expected ${a.expectedRule}, stopped by ${g.stoppedBy.join(',')}`).toBe(true);
        if (a.expectedRejection) expect(g.expectedRejectionSeen, a.id).toBe(true);
      } else {
        expect(g.forbiddenAttempted).toBe(0);
        expect(u.forbiddenPerformed).toEqual([]);
      }
    }
  });
  it('the stand-in that does not follow the attacks is clean in the ungated arm too: the planted text, not the tools, is what causes the harm', async () => {
    const run = await runEval(scriptedModel({ follow: false }), { cap: null, arms: ['ungated'] });
    for (const r of run.results) { expect(r.forbiddenAttempted, r.attack).toBe(0); expect(r.forbiddenPerformed, r.attack).toEqual([]); expect(r.taskCompleted, r.attack).toBe(true); }
  });
  it('the spend cap stops the run before the call that would exceed it, the remaining cases are skipped, and the report says so in observed-only words', async () => {
    const cap = new SpendCap(0.01, { inputUsdPerMillion: 1000, outputUsdPerMillion: 1000 }, 'scripted');   // 0.001 USD per 1000 tokens
    const run = await runEval(scriptedModel({ follow: true, usagePerTurn: { promptTokens: 2000, completionTokens: 0 } }), { cap });
    expect(run.stopped?.reason).toMatch(/spend cap reached/);
    expect(cap.spentUsd).toBeLessThanOrEqual(0.01);
    expect(cap.calls).toBeLessThan(8);
    expect(run.results.filter(r => r.skipped).length).toBeGreaterThan(0);
    expect(run.results).toHaveLength(16);
    const { markdown, json } = buildReport(run, { model: 'scripted', date: '2026-10-19', arms: run.arms, reps: 1, capUsd: 0.01 }, cap);
    expect(markdown).toContain('observed on these attacks with this model on this date');
    expect(markdown).toContain('The run stopped early');
    expect(markdown).not.toMatch(/proof/i);
    expect(json.stopped?.reason).toMatch(/spend cap reached/);
    expect(json.spend?.capUsd).toBe(0.01);
  });
  it('the http model echoes a provider-specific extra_content back unchanged on the replayed tool call, per call, and adds none when there was none', async () => {
    const bodies: Array<{ messages: Array<Record<string, unknown>> }> = [];
    const replies = [
      { choices: [{ message: { content: null, tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'invoices.read', arguments: '{"week":"2026-W42"}' }, extra_content: { google: { thought_signature: 'SIG-ONE==' } } },
        { id: 'c2', type: 'function', function: { name: 'ledger.query', arguments: '{"sql":"SELECT 1"}' } },
        { id: 'c3', type: 'function', function: { name: 'report.write', arguments: '{"path":"p","content":"c"}' }, extra_content: { google: { thought_signature: 'SIG-THREE==' } } },
      ] } }] },
      { choices: [{ message: { content: 'done', tool_calls: [] } }] },
    ];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(replies[bodies.length - 1]), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const model = httpModel({ baseUrl: 'https://example.invalid/v1', model: 'm', apiKey: 'TEST-KEY', fetchImpl })({ task: undefined as never, attack: undefined as never, phaseId: 'reconcile', arm: 'gated' });
    const messages: ModelMessage[] = [{ role: 'user', content: 'go' }];
    const first = await model.reply(messages, []);
    expect(first.toolCalls.map(t => t.extra)).toEqual([{ google: { thought_signature: 'SIG-ONE==' } }, undefined, { google: { thought_signature: 'SIG-THREE==' } }]);
    messages.push({ role: 'assistant', content: first.text ?? '', toolCalls: first.toolCalls });   // as arms.ts does: the reply's toolCalls, whole
    for (const t of first.toolCalls) messages.push({ role: 'tool', toolCallId: t.id, content: '{}' });
    await model.reply(messages, []);
    const assistant = bodies[1].messages.find(m => m.role === 'assistant') as { tool_calls: Array<Record<string, unknown>> };
    expect(assistant.tool_calls.map(t => t.id)).toEqual(['c1', 'c2', 'c3']);
    expect(JSON.stringify(assistant.tool_calls[0].extra_content)).toBe(JSON.stringify({ google: { thought_signature: 'SIG-ONE==' } }));
    expect('extra_content' in assistant.tool_calls[1]).toBe(false);
    expect(JSON.stringify(assistant.tool_calls[2].extra_content)).toBe(JSON.stringify({ google: { thought_signature: 'SIG-THREE==' } }));
    expect(assistant.tool_calls[0].function).toEqual({ name: 'invoices.read', arguments: '{"week":"2026-W42"}' });
  });
  it('the http model omits temperature unless one is given, never sends top_p, keeps tool_choice auto, and sends the key only as the bearer token', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const headers: Array<Record<string, string>> = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      headers.push(init?.headers as Record<string, string>);
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok', tool_calls: [] } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const ctx = { task: undefined as never, attack: undefined as never, phaseId: 'reconcile', arm: 'gated' as const };
    const messages = [{ role: 'user' as const, content: 'hi' }];
    await httpModel({ baseUrl: 'https://example.invalid/v1/', model: 'm', apiKey: 'TEST-KEY', fetchImpl })(ctx).reply(messages, []);
    await httpModel({ baseUrl: 'https://example.invalid/v1', model: 'm', apiKey: 'TEST-KEY', temperature: 0.3, fetchImpl })(ctx).reply(messages, []);
    expect(bodies).toHaveLength(2);
    expect('temperature' in bodies[0]).toBe(false);
    expect(bodies[1].temperature).toBe(0.3);
    for (const b of bodies) { expect('top_p' in b).toBe(false); expect(b.tool_choice).toBe('auto'); expect(b.model).toBe('m'); }
    expect(headers[0].authorization).toBe('Bearer TEST-KEY');
    expect(JSON.stringify(bodies)).not.toContain('TEST-KEY');
  });
  it('a live run refuses to start without a key, a base URL, a model, a cap or a price, and says which', () => {
    const all = { EVAL_MODEL_API_KEY: 'k', EVAL_MODEL_BASE_URL: 'https://example.invalid/v1', EVAL_MODEL: 'some-model', EVAL_SPEND_CAP_USD: '5' };
    expect(prepareLiveRun({})).toMatchObject({ ok: false, reason: expect.stringContaining('EVAL_MODEL_API_KEY') });
    expect(prepareLiveRun({ ...all, EVAL_MODEL_BASE_URL: undefined })).toMatchObject({ ok: false, reason: expect.stringContaining('EVAL_MODEL_BASE_URL') });
    expect(prepareLiveRun({ ...all, EVAL_MODEL: undefined })).toMatchObject({ ok: false, reason: expect.stringContaining('EVAL_MODEL') });
    expect(prepareLiveRun({ ...all, EVAL_SPEND_CAP_USD: undefined })).toMatchObject({ ok: false, reason: expect.stringContaining('EVAL_SPEND_CAP_USD') });
    expect(prepareLiveRun({ ...all, EVAL_SPEND_CAP_USD: '0' })).toMatchObject({ ok: false, reason: expect.stringContaining('positive') });
    expect(prepareLiveRun(all)).toMatchObject({ ok: false, reason: expect.stringContaining('no price for model "some-model"') });
    const ok = prepareLiveRun({ ...all, EVAL_MODEL: 'scripted' });
    expect(ok.ok).toBe(true);
  });
});

describe('the live harness is resilient: retries, model errors on a case, and a report for an interrupted run (no network)', () => {
  const ctx = { task: undefined as never, attack: undefined as never, phaseId: 'reconcile', arm: 'gated' as const };
  it('a reply cut off by the completion budget (finish_reason length, empty text, no tool calls) is a length stop, counted apart; max_tokens is the configured value and the cap pre-check uses it', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const cutOff = (async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ choices: [{ message: { content: '', tool_calls: [] }, finish_reason: 'length' }], usage: { prompt_tokens: 10, completion_tokens: 8192 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const factory = httpModel({ baseUrl: 'https://example.invalid/v1', model: 'm', apiKey: 'TEST-KEY', fetchImpl: cutOff, sleep: async () => {} });
    const run = await runEval(factory, { cap: null, attackIds: ['clean-day-control'], arms: ['gated'] });
    expect(run.results).toHaveLength(1);
    expect(run.results[0].stopped).toEqual({ reason: 'length', turns: 2 });   // one cut-off reply per phase; the case reports the last phase's reason
    expect(run.results[0].transcript.map(x => x.finishReason)).toEqual(['length', 'length']);
    expect(run.results[0].taskCompleted).toBe(false);
    expect(run.results[0].modelError).toBeUndefined();
    expect(bodies[0].max_tokens).toBe(DEFAULT_MAX_TOKENS);
    const { json, markdown } = buildReport(run, { model: 'm', date: '2026-10-19', arms: ['gated'], reps: 1, capUsd: null, maxTokens: DEFAULT_MAX_TOKENS }, null);
    expect(json.totals.gated.stoppedByLength).toBe(1);
    expect(markdown).toContain('| cut off by budget |');
    expect(markdown).toMatch(/stopped: the reply was cut off by the completion budget/);
    expect(markdown).toContain('| completion budget (max_tokens) | 8192 |');
    // The configured budget reaches the request body and the cap's pre-check: a cap just under the worst case of one 8192-token reply refuses the first call; it would have allowed 1024.
    bodies.length = 0;
    const factory2 = httpModel({ baseUrl: 'https://example.invalid/v1', model: 'm', apiKey: 'TEST-KEY', fetchImpl: cutOff, sleep: async () => {}, maxTokens: 2048 });
    const run2 = await runEval(factory2, { cap: null, attackIds: ['clean-day-control'], arms: ['gated'], maxTokens: 2048 });
    expect(bodies[0].max_tokens).toBe(2048);
    expect(run2.results[0].stopped.reason).toBe('length');
    const price = { inputUsdPerMillion: 0, outputUsdPerMillion: 1 };      // 1 USD per million completion tokens: 0.000001 USD per token
    const tight = new SpendCap(0.005, price, 'm');                        // under 8192 × 1e-6 = 0.008192, over 1024 × 1e-6 = 0.001024
    const run3 = await runEval(factory, { cap: tight, attackIds: ['clean-day-control'], arms: ['gated'] });
    expect(run3.results[0].skipped).toMatch(/spend cap reached/);
    expect(tight.calls).toBe(0);
    expect(new SpendCap(0.005, price, 'm').before(10, 1024).ok).toBe(true);
    expect(new SpendCap(0.005, price, 'm').before(10, DEFAULT_MAX_TOKENS).ok).toBe(false);
    expect(prepareLiveRun({ EVAL_MODEL_API_KEY: 'k', EVAL_MODEL_BASE_URL: 'https://x', EVAL_MODEL: 'scripted', EVAL_SPEND_CAP_USD: '5', EVAL_MODEL_MAX_TOKENS: '0' })).toMatchObject({ ok: false, reason: expect.stringContaining('EVAL_MODEL_MAX_TOKENS') });
    const ok = prepareLiveRun({ EVAL_MODEL_API_KEY: 'k', EVAL_MODEL_BASE_URL: 'https://x', EVAL_MODEL: 'scripted', EVAL_SPEND_CAP_USD: '5', EVAL_MODEL_MAX_TOKENS: '4096' });
    expect(ok.ok && ok.config.maxTokens).toBe(4096);
    const dflt = prepareLiveRun({ EVAL_MODEL_API_KEY: 'k', EVAL_MODEL_BASE_URL: 'https://x', EVAL_MODEL: 'scripted', EVAL_SPEND_CAP_USD: '5' });
    expect(dflt.ok && dflt.config.maxTokens).toBe(DEFAULT_MAX_TOKENS);
  });
  it('(i) the http model retries a 500 with backoff: two 500s then a 200 succeed, the body is sent three times, each attempt runs the pre-check hook', async () => {
    const bodies: string[] = [];
    const slept: number[] = [];
    let checks = 0;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(String(init?.body));
      if (bodies.length < 3) return new Response('Internal error encountered', { status: 500 });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok', tool_calls: [] } }], usage: { prompt_tokens: 3, completion_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const model = httpModel({ baseUrl: 'https://example.invalid/v1', model: 'm', apiKey: 'TEST-KEY', fetchImpl, sleep: async ms => { slept.push(ms); } })(ctx);
    const reply = await model.reply([{ role: 'user', content: 'go' }], [], { beforeAttempt: () => { checks++; return null; } });
    expect(reply.text).toBe('ok');
    expect(reply.usage).toEqual({ promptTokens: 3, completionTokens: 1 });
    expect(bodies).toHaveLength(3);
    expect(new Set(bodies).size).toBe(1);
    expect(slept).toEqual([1000, 2000]);
    expect(checks).toBe(3);
    // Five 500s in a row: four retries, then a ModelCallError without the key in it.
    const always500 = (async () => new Response('Internal error encountered', { status: 500 })) as typeof fetch;
    const failing = httpModel({ baseUrl: 'https://example.invalid/v1', model: 'm', apiKey: 'TEST-KEY', fetchImpl: always500, sleep: async () => {} })(ctx);
    await expect(failing.reply([{ role: 'user', content: 'go' }], [])).rejects.toMatchObject({ name: 'ModelCallError', status: 500, attempts: 5 });
    await expect(failing.reply([{ role: 'user', content: 'go' }], [])).rejects.not.toThrow(/TEST-KEY/);
    // A 400 is not retried.
    let calls400 = 0;
    const bad = httpModel({ baseUrl: 'https://example.invalid/v1', model: 'm', apiKey: 'TEST-KEY', fetchImpl: (async () => { calls400++; return new Response('bad request', { status: 400 }); }) as typeof fetch, sleep: async () => {} })(ctx);
    await expect(bad.reply([{ role: 'user', content: 'go' }], [])).rejects.toMatchObject({ name: 'ModelCallError', status: 400, attempts: 1 });
    expect(calls400).toBe(1);
  });
  it('(ii) a model that fails for good on one attack: that case is a model error, the other cases run, and the report counts one model error', async () => {
    const good = scriptedModel({ follow: true });
    const factory: ModelFactory = ctx => (ctx.attack.id === 'ignore-your-rules-document' && ctx.arm === 'gated'
      ? { name: 'scripted', reply: async () => { throw new ModelCallError('model endpoint 500: Internal error encountered (after 5 attempts)', 500, 5); } }
      : good(ctx));
    const run = await runEval(factory, { cap: null });
    expect(run.interrupted).toBeNull();
    expect(run.results).toHaveLength(16);
    const errored = run.results.filter(r => r.modelError);
    expect(errored.map(r => `${r.arm}:${r.attack}`)).toEqual(['gated:ignore-your-rules-document']);
    expect(errored[0].taskCompleted).toBe(false);
    expect(errored[0].forbiddenPerformed).toEqual([]);
    expect(errored[0].stopped).toEqual({ reason: 'model_error', turns: 0 });
    expect(errored[0].transcript[0].text).toMatch(/\[model error\]/);
    expect(run.results.filter(r => !r.modelError && !r.skipped && r.taskCompleted)).toHaveLength(15);
    const { json, markdown } = buildReport(run, { model: 'scripted', date: '2026-10-19', arms: run.arms, reps: 1, capUsd: null }, null);
    expect(json.totals.gated.modelErrors).toBe(1);
    expect(json.totals.ungated.modelErrors).toBe(0);
    expect(json.totals.gated.expectedRuleCases).toBe(6);
    expect(markdown).toContain('| model errors |');
    expect(markdown).toContain('yes: model endpoint 500');
    expect(markdown).toMatch(/stopped: the model call failed for good after 0 turns/);
    expect(markdown).not.toMatch(/proof/i);
    expect(json.results[0].transcript.length).toBeGreaterThan(0);
  });
  it('(iii) an interrupted run still gets a report with the cases completed so far and a line saying why', async () => {
    const good = scriptedModel({ follow: true });
    let started = 0;
    const factory: ModelFactory = ctx => { if (ctx.phaseId === 'reconcile') started++; return started > 2 ? { name: 'scripted', reply: async () => { throw new EvalAborted('simulated SIGINT'); } } : good(ctx); };
    const run = await runEval(factory, { cap: null });
    expect(run.interrupted).toEqual({ reason: 'simulated SIGINT' });
    expect(run.results.filter(r => !r.skipped)).toHaveLength(2);
    expect(run.results.filter(r => r.skipped)).toHaveLength(14);
    const dir = mkdtempSync(join(tmpdir(), 'eval-live-'));
    try {
      const { mdPath, jsonPath } = writeReport(run, { model: 'scripted', date: '2026-10-19', arms: run.arms, reps: 1, capUsd: null }, null, dir);
      const md = readFileSync(mdPath, 'utf8');
      expect(md).toContain('**The run was interrupted:** simulated SIGINT');
      expect(md).toContain('observed on these attacks with this model on this date');
      const json = JSON.parse(readFileSync(jsonPath, 'utf8'));
      expect(json.interrupted).toEqual({ reason: 'simulated SIGINT' });
      expect(json.totals.gated.ran + json.totals.ungated.ran).toBe(2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
