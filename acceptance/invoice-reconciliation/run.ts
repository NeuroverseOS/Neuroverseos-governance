/**
 * Replays transcript.jsonl through the real engine via the enforcing adapter
 * and compares every line with its hand-authored expectation.
 *
 *   cd engine && npx tsx ../acceptance/invoice-reconciliation/run.ts
 *
 * The reference harness here is written for this business: a scope resolver
 * (which store, which domain, which directory a call lands in), derived-fact
 * functions (is this SQL destructive? is this domain external?), a classifier
 * verdict replayed from the recording (contains_financial_data — the one fact
 * no function in this file can compute), an in-memory spend ledger with
 * reserve-then-commit, a nonce set and a history store that carry over from
 * line to line, and a clock that reads each line's `now`. The harness's
 * recorded outputs on each line (`scope`, `facts`) are cross-checked against
 * what this harness computes; a disagreement fails the line.
 *
 * Prints one row per line and `N/M`; exits non-zero on any mismatch. It never
 * edits the fixture.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileGovernance, compileMission, govern, referenceHarness, SpendLedger, NonceSet, HistoryStore,
  type GovernanceCompileInput, type Mission, type Governed, type Session,
} from '../../engine/src/index';

const here = dirname(fileURLToPath(import.meta.url));
const OWN_DOMAIN = 'smallbiz.example';
const WEEK = '2026-W42';

interface Line {
  seq: number; mission: string | null; now: string;
  participant: { id: string; kind: string; roleId: string; delegatedBy?: string }; delegation?: Array<{ id: string; roleId: string }>;
  tool: string; args: unknown; scope: string; facts: Record<string, unknown>;
  approvedBy?: unknown; harnessFaults?: { omitDerived?: string[] };
  expect: { status: string; decidingRuleIds: string[]; executed: boolean; limits?: Record<string, number>; approvalsRejected?: string[]; note: string };
}

/** The business's own derived-fact functions. Integrator-declared; never the requester's, never a model's. */
const derive = {
  sql_is_destructive: (args: Record<string, unknown>) => /^\s*(delete|update|insert|truncate|drop|alter)\b/i.test(String(args.sql ?? '')),
  recipient_is_external: (args: Record<string, unknown>) => String(args.to_domain ?? '').toLowerCase() !== OWN_DOMAIN,
};
/** Where a call lands. Unknown tools cannot be resolved; the recorded scope stands in for whatever the real harness said. */
const resolveScope = (tool: string, args: Record<string, unknown>, recorded: string): string => {
  switch (tool) {
    case 'invoices.read': case 'ledger.query': return 'accounting';
    case 'report.write': return String(args.path ?? '').startsWith(`reports/${WEEK}/`) ? 'reporting' : 'files_other';
    case 'vendors.update_bank': return 'vendors';
    case 'payments.refund': return 'payments';
    case 'email.send': return String(args.to_domain ?? '').toLowerCase() === OWN_DOMAIN ? 'internal_email' : 'external_email';
    case 'purchases.buy': return 'office_supplies';
    default: return recorded;
  }
};
const KNOWN = new Set(['invoices.read', 'ledger.query', 'report.write', 'vendors.update_bank', 'payments.refund', 'email.send', 'purchases.buy']);

async function main() {
  const input = JSON.parse(readFileSync(join(here, 'rules.json'), 'utf8')) as GovernanceCompileInput;
  const missionSpec = JSON.parse(readFileSync(join(here, 'plan.json'), 'utf8')) as Mission;
  const lines = readFileSync(join(here, 'transcript.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l) as Line);
  const base = compileGovernance(input);
  const mission = compileMission(base, missionSpec);
  console.log(`rulebook ${base.id}: ${base.rules.length} rules, fingerprint ${base.fingerprint}`);
  console.log(`mission ${mission.mission!.id}: ${mission.rules.length} rules (+${mission.rules.length - base.rules.length}), fingerprint ${mission.fingerprint}`);
  if (base.findings.length || mission.findings.length) console.log(`findings: ${[...base.findings, ...mission.findings].map(f => `${f.kind} ${f.ruleIds.join('+')}`).join('; ')}`);

  const ledger = new SpendLedger();
  const consumed = new NonceSet();
  const history = new HistoryStore();
  const rows: string[] = [];
  let pass = 0;
  const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
  for (const line of lines) {
    const faults = line.harnessFaults?.omitDerived ?? [];
    const derivedHere = Object.fromEntries(Object.entries(derive).filter(([k]) => !faults.includes(k))) as typeof derive;
    const harness = referenceHarness({
      now: () => line.now,
      resolveScope: (tool, args) => resolveScope(tool, args, line.scope),
      // The classifier's verdict is the one harness output this file cannot recompute: replay the recording. requested_rows comes from the LIMIT clause.
      facts: (tool, args) => {
        const out: Record<string, unknown> = {};
        if (line.facts.contains_financial_data !== undefined) out.contains_financial_data = line.facts.contains_financial_data;
        if (tool === 'ledger.query') { const m = /\bLIMIT\s+(\d+)\b/i.exec(String(args.sql ?? '')); if (m) out.requested_rows = Number(m[1]); }
        return out;
      },
      derive: derivedHere,
      ...(line.approvedBy !== undefined ? { approvals: () => line.approvedBy } : {}),
      ledger, consumed, history,
      ledgers: [{ fact: 'projected_spend_this_week', tool: 'purchases.buy', amountArg: 'amount', bucket: () => `office_supplies:${WEEK}` }],
    });
    const session: Session = { rulebook: line.mission ? mission : base, principal: { id: 'owner-sam' }, participant: line.participant, ...(line.delegation ? { delegation: line.delegation } : {}) };
    let ran: { limits?: Record<string, number> } | undefined;
    const outcome: Governed = await govern({ name: line.tool, args: line.args }, session, harness, async (_tool, _args, ctx) => { ran = { limits: ctx.limits }; return { ok: true }; });

    const problems: string[] = [];
    const got = outcome.decision.reasons.map(r => r.ruleId);
    if (outcome.status !== line.expect.status) problems.push(`status ${outcome.status} ≠ ${line.expect.status}`);
    if (JSON.stringify(got) !== JSON.stringify(line.expect.decidingRuleIds)) problems.push(`deciding ${JSON.stringify(got)} ≠ ${JSON.stringify(line.expect.decidingRuleIds)}`);
    if (outcome.executed !== line.expect.executed || (ran !== undefined) !== line.expect.executed) problems.push(`executed ${outcome.executed} ≠ ${line.expect.executed}`);
    if (JSON.stringify(ran?.limits) !== JSON.stringify(line.expect.limits)) problems.push(`limits ${JSON.stringify(ran?.limits)} ≠ ${JSON.stringify(line.expect.limits)}`);
    const codes = (outcome.decision.approvalsRejected ?? []).map(r => r.code);
    if (line.expect.approvalsRejected && JSON.stringify(codes) !== JSON.stringify(line.expect.approvalsRejected)) problems.push(`rejected ${JSON.stringify(codes)} ≠ ${JSON.stringify(line.expect.approvalsRejected)}`);
    if (outcome.status === 'PAUSE' && !(outcome.decision.approvalRequests?.length)) problems.push('PAUSE without an approval request');
    // Cross-check the recording against what this harness computed.
    if (outcome.request) {
      if (KNOWN.has(line.tool) && outcome.request.scope !== line.scope) problems.push(`recorded scope ${line.scope}, harness resolved ${outcome.request.scope}`);
      for (const [k, v] of Object.entries(line.facts)) if (outcome.request.facts[k] !== undefined && JSON.stringify(outcome.request.facts[k]) !== JSON.stringify(v)) problems.push(`recorded fact ${k}=${JSON.stringify(v)}, harness computed ${JSON.stringify(outcome.request.facts[k])}`);
    }
    // The decision (and its trace) must never carry an approval's signature; the echoed request naturally does, since the harness supplied the approval.
    if (JSON.stringify(outcome.decision).includes('"signature"')) problems.push('the decision carries a signature');
    const okRow = problems.length === 0;
    if (okRow) pass++;
    const detail = outcome.approvalsUnverified?.length ? ` (unverified: ${outcome.approvalsUnverified.map(u => u.reason).join('; ')})` : codes.length ? ` (rejected: ${codes.join(', ')})` : outcome.error ? ` (${outcome.error.stage}: ${outcome.error.message.slice(0, 60)})` : '';
    rows.push(`${okRow ? 'ok  ' : 'FAIL'} ${pad(String(line.seq), 3)} ${pad(line.mission ? 'M' : '-', 1)} ${pad(line.participant.id, 13)} ${pad(line.tool, 20)} ${pad(outcome.status, 5)} ${pad(line.expect.status, 5)} ${pad(outcome.executed ? 'ran' : '-', 3)} ${got.join(',')}${detail}${okRow ? '' : `\n     ${problems.join('; ')}`}`);
  }
  console.log(`\n${pad('', 4)} ${pad('seq', 3)} ${pad('m', 1)} ${pad('participant', 13)} ${pad('tool', 20)} ${pad('got', 5)} ${pad('want', 5)} ${pad('exe', 3)} deciding rules`);
  for (const r of rows) console.log(r);
  const missionHistory = history.of('recon-agent-1').filter(e => e.tool === 'report.write');
  const endOk = missionHistory.length >= 1;
  console.log(`\nend of mission: plan_ends_with_report_written ${endOk ? 'satisfied' : 'NOT satisfied'} (report.write executed ${missionHistory.length}×; expected satisfied)`);
  console.log(`ledger office_supplies:${WEEK}: spent ${ledger.spentIn(`office_supplies:${WEEK}`)}, held ${ledger.heldIn(`office_supplies:${WEEK}`)}; nonces consumed ${JSON.stringify(consumed.list())}; refusals recorded ${history.all().filter(e => e.tool === 'approval_refused').length}`);
  console.log(`${pass}/${lines.length} lines agree with the expectations`);
  process.exit(pass === lines.length && endOk ? 0 : 1);
}

main().catch(e => { console.error(e instanceof Error ? e.stack ?? e.message : String(e)); process.exit(1); });
