/**
 * Backtest the scenario's own recorded log (SPEC.md § 16.11).
 *
 *   npx tsx acceptance/invoice-reconciliation/backtest.ts
 *
 * The log is what the enforcing adapter saw: for every transcript line, the
 * request it built from the harness and the call (`Governed.request`), and
 * what then happened (`happened` when the executor ran, `did_not_happen`
 * otherwise). The mission lines are replayed through the mission rulebook and
 * the standing-session lines through the base rulebook; then the standing
 * log is replayed through a PROPOSED variant — the weekly office-supply cap
 * raised from 500 to 750 — and the two reports are compared. The engine does
 * what it would have decided; it never says why things happened.
 */
import { govern, backtest, compareBacktests, compileGovernance, type BacktestEvent, type GovernanceCompileInput } from '../../src/index';
import { loadScenario, stores, harnessFor, sessionFor } from './harness';

async function main() {
  const { input, base, mission, lines } = loadScenario();
  const s = stores();
  const missionLog: BacktestEvent[] = [], standingLog: BacktestEvent[] = [];
  for (const line of lines) {
    const outcome = await govern({ name: line.tool, args: line.args }, sessionFor(line, base, mission), harnessFor(line, s), async () => ({ ok: true }));
    if (!outcome.request) continue;   // a call the adapter refused before it became a request (malformed arguments) is not in the log
    (line.mission ? missionLog : standingLog).push({ at: line.now, request: outcome.request, outcome: outcome.executed ? 'happened' : 'did_not_happen' });
  }

  const show = (title: string, r: ReturnType<typeof backtest>) => {
    console.log(`\n== ${title}: ${r.events} events under ${r.fingerprint.slice(0, 12)}…`);
    console.log(`totals ALLOW ${r.totals.ALLOW} LIMIT ${r.totals.LIMIT} PAUSE ${r.totals.PAUSE} BLOCK ${r.totals.BLOCK} missingFacts ${r.totals.missingFacts}`);
    console.log(`by scope ${Object.entries('byScope' in r ? r.byScope : {}).map(([k, v]) => `${k}=${v.events}`).join(' ')}`);
    console.log(`never fired: ${r.neverFired.join(', ') || 'none'}`);
    console.log(`would stall: ${r.wouldStall.map(x => `${x.ruleId}:${x.status}×${x.count}`).join(', ') || 'none'}`);
    console.log(`conflicts occurred: ${r.conflictsOccurred.map(x => `${x.kind} ${x.ruleIds.join('+')}×${x.count}`).join(', ') || 'none'}`);
    console.log(`gaps: ${r.gaps.map(g => `${'tool' in g ? g.tool : (g as { action: string }).action}×${g.count}`).join(', ') || 'none'}; missing facts: ${r.missingFacts.map(m => `${m.fact}×${m.count}`).join(', ') || 'none'}`);
    console.log(`differences (rule vs record): ${r.differences.length}`);
  };
  const missionReport = backtest(mission, missionLog);
  const standingReport = backtest(base, standingLog);
  show('mission log through the mission rulebook', missionReport);
  show('standing log through the base rulebook', standingReport);

  const proposedInput: GovernanceCompileInput = JSON.parse(JSON.stringify(input));
  const cap = proposedInput.rules!.find(r => r.id === 'office_supplies_weekly_cap')!;
  (cap.when![0] as { value: number }).value = 750;
  cap.text = 'Office-supply purchases may total at most 750 in an ISO week.';
  const proposed = compileGovernance(proposedInput);
  const proposedReport = backtest(proposed, standingLog);
  const c = compareBacktests(standingReport, proposedReport);
  console.log(`\n== proposed: weekly office-supply cap 750 instead of 500, on the standing log (${c.events} events)`);
  console.log(`baseline ${c.baseline.slice(0, 12)}… → proposed ${c.proposed.slice(0, 12)}…`);
  console.log(`totals baseline ALLOW ${c.totals.baseline.ALLOW} LIMIT ${c.totals.baseline.LIMIT} PAUSE ${c.totals.baseline.PAUSE} BLOCK ${c.totals.baseline.BLOCK} | proposed ALLOW ${c.totals.proposed.ALLOW} LIMIT ${c.totals.proposed.LIMIT} PAUSE ${c.totals.proposed.PAUSE} BLOCK ${c.totals.proposed.BLOCK}`);
  console.log(`changed ${c.changed}: newly allowed ${c.newlyAllowed.length}, newly blocked ${c.newlyBlocked.length}, other ${c.otherChanges.length}`);
  for (const ch of [...c.newlyAllowed, ...c.newlyBlocked, ...c.otherChanges]) console.log(`  event ${ch.index} at ${ch.at}: ${ch.from} [${ch.before.join(', ')}] → ${ch.to} [${ch.after.join(', ')}]`);
  console.log(`by rule: ${c.byRule.filter(x => x.change !== 0).map(x => `${x.ruleId} ${x.baseline}→${x.proposed}`).join(', ') || 'no rule decided differently'}`);
  // What the comparison must say for this fixture: the 450 purchase (line 27, projected 530) is the one newly allowed event; nothing becomes
  // blocked; and the one approved refund (line 20) turns ALLOW → PAUSE, because its approval is bound to the current rulebook's fingerprint
  // and a changed rulebook needs a fresh approval (SPEC.md § 16.6) — the comparison shows the owner that cost before the change is made.
  const ok = c.newlyAllowed.length === 1 && c.newlyBlocked.length === 0 && c.otherChanges.length === 1 && c.otherChanges[0].to === 'PAUSE' && missionReport.events === 17 && standingReport.events === 10;
  console.log(ok ? '\nbacktest agrees with the recording: one purchase newly allowed under the raised cap, nothing newly blocked, one approval to re-issue under the new rulebook' : '\nUNEXPECTED comparison; see above');
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e instanceof Error ? e.stack ?? e.message : String(e)); process.exit(1); });
