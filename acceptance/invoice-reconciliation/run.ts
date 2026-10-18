/**
 * Replays transcript.jsonl through the real engine via the enforcing adapter
 * and compares every line with its hand-authored expectation.
 *
 *   cd engine && npx tsx ../acceptance/invoice-reconciliation/run.ts
 *
 * The reference harness for this business lives in harness.ts (shared with
 * backtest.ts). The harness's recorded outputs on each line (`scope`,
 * `facts`) are cross-checked against what it computes; a disagreement fails
 * the line.
 *
 * Prints one row per line and `N/M`; exits non-zero on any mismatch. It never
 * edits the fixture.
 */
import { govern, type Governed } from '../../engine/src/index';
import { loadScenario, stores, harnessFor, sessionFor, KNOWN, WEEK } from './harness';

async function main() {
  const { base, mission, lines } = loadScenario();
  console.log(`rulebook ${base.id}: ${base.rules.length} rules, fingerprint ${base.fingerprint}`);
  console.log(`mission ${mission.mission!.id}: ${mission.rules.length} rules (+${mission.rules.length - base.rules.length}), fingerprint ${mission.fingerprint}`);
  if (base.findings.length || mission.findings.length) console.log(`findings: ${[...base.findings, ...mission.findings].map(f => `${f.kind} ${f.ruleIds.join('+')}`).join('; ')}`);

  const s = stores();
  const { ledger, consumed, history } = s;
  const rows: string[] = [];
  let pass = 0;
  const pad = (x: string, n: number) => (x.length >= n ? x : x + ' '.repeat(n - x.length));
  for (const line of lines) {
    const harness = harnessFor(line, s);
    const session = sessionFor(line, base, mission);
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
