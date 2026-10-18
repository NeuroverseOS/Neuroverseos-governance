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
  it('an executor that throws is recorded, the reservation released and no nonce consumed', async () => {
    const h = harness();
    const r = await govern({ name: 'pay', args: { amount: 50 } }, session, h, async () => { throw new Error('bank down'); });
    expect(r.status).toBe('ALLOW');
    expect(r.executed).toBe(true);
    expect(r.error).toEqual({ stage: 'executor', message: 'bank down' });
    expect(h.ledger.spentIn('projected_spend')).toBe(0);
    expect(h.ledger.heldIn('projected_spend')).toBe(0);
    expect(h.history.of('w-1')).toEqual([]);
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
