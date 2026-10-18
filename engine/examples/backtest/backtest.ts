#!/usr/bin/env npx tsx
/**
 * Test a rulebook against recorded activity before it goes live.
 *
 *   npx tsx examples/backtest/backtest.ts
 *
 * Replays the synthetic sample week (sample-week.ts; illustrative data, not
 * from a real store) through the sample site's rulebook (rulebook.ts) and
 * prints what the rulebook WOULD HAVE DECIDED for every recorded request:
 * the totals, the rules that never fired, the rules that would have stalled
 * work, the conflicts that actually occurred, the gaps, the facts the log did
 * not carry, and where the rule and the record differ. Then it compares the
 * current rulebook ("at most two robots in aisle 5") with a proposed one
 * ("at most three") on the same week.
 *
 * Pure and deterministic: no model, no clock, no network. Writes the week as
 * sample-week.jsonl (the first line is a header record the switchboard's
 * importer skips) so the same log can be imported elsewhere.
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import { backtest, compareBacktests, type BacktestReport } from '../../src/index';
import { sampleSite } from './rulebook';
import { SAMPLE_WEEK, SAMPLE_WEEK_NOTE } from './sample-week';

const current = sampleSite(2), proposed = sampleSite(3);
const a = backtest(current.rulebook, SAMPLE_WEEK), b = backtest(proposed.rulebook, SAMPLE_WEEK);
const c = compareBacktests(a, b);

const dir = import.meta.dirname;
writeFileSync(join(dir, 'sample-week.jsonl'), [JSON.stringify({ note: SAMPLE_WEEK_NOTE, events: SAMPLE_WEEK.length, rulebook: current.rulebook.fingerprint }), ...SAMPLE_WEEK.map(e => JSON.stringify(e))].join('\n') + '\n');

const name = (id: string) => current.rulebook.areas.find(x => x.id === id)?.name ?? id;
const totals = (t: BacktestReport['totals']) => `${t.ALLOW} allowed, ${t.LIMIT} slower, ${t.PAUSE} wait, ${t.BLOCK} blocked, ${t.missingFacts} missing facts`;
const when = (xs: string[]) => xs.map(x => x.slice(5, 16).replace('T', ' ')).join(', ');

console.log(`${SAMPLE_WEEK_NOTE}\n`);
console.log(`Rulebook ${a.fingerprint} ("at most two robots in aisle 5") over ${a.events} recorded requests: ${totals(a.totals)}.`);
console.log(`Replays recorded events through the rules. It shows what the rules would have decided — not why things happened.\n`);
console.log('By area:');
for (const [id, t] of Object.entries(a.byArea)) console.log(`  ${name(id).padEnd(18)} ${totals(t)}`);
console.log('By role:');
for (const [id, t] of Object.entries(a.byRole)) console.log(`  ${id.padEnd(18)} ${totals(t)}`);
console.log(`\nRules that never fired this week: ${a.neverFired.join(', ') || 'none'}`);
console.log('\nRules that would have stalled work (PAUSE or BLOCK), most often first:');
for (const s of a.wouldStall) console.log(`  ${String(s.count).padStart(3)}× ${s.status.padEnd(5)} ${s.ruleId} [${s.setBy}] — e.g. ${when(s.examples)}`);
console.log('\nConflicts that actually occurred (both rules matched a recorded request):');
for (const x of a.conflictsOccurred) console.log(`  ${String(x.count).padStart(3)}× ${x.kind} (${x.severity}) ${x.ruleIds.join(' vs ')} — first ${when([x.firstAt])}`);
console.log('\nGaps (no rule covers the action):');
for (const g of a.gaps) console.log(`  ${String(g.count).padStart(3)}× ${g.action} — e.g. ${when(g.examples)}`);
console.log('\nFacts the log did not carry:');
for (const m of a.missingFacts) console.log(`  ${String(m.count).padStart(3)}× ${m.fact} — e.g. ${when(m.examples)}`);
console.log(`\nThe rule and the record differ (${a.differences.length}; neither is judged right):`);
for (const x of a.differences.slice(0, 8)) console.log(`  ${when([x.at])}  rule says ${x.status} (${x.ruleIds.join(', ')}), record says ${x.outcome.replace(/_/g, ' ')}`);
if (a.differences.length > 8) console.log(`  … and ${a.differences.length - 8} more`);

console.log(`\n── Compare: current (limit 2, ${c.baseline}) vs proposed (limit 3, ${c.proposed}) on the same ${c.events} events ──`);
console.log(`Current:  ${totals(c.totals.baseline)}`);
console.log(`Proposed: ${totals(c.totals.proposed)}`);
console.log(`${c.changed} decisions change: ${c.newlyAllowed.length} newly allowed, ${c.newlyBlocked.length} newly blocked, ${c.otherChanges.length} other.`);
for (const x of c.newlyAllowed) console.log(`  ${when([x.at])}  ${x.from} → ${x.to}  (was ${x.before.join(', ')}; now ${x.after.join(', ')})`);
for (const x of c.newlyBlocked) console.log(`  ${when([x.at])}  ${x.from} → ${x.to}  (was ${x.before.join(', ')}; now ${x.after.join(', ')})`);
console.log('By rule (decided events, current → proposed):');
for (const r of c.byRule.filter(x => x.change !== 0)) console.log(`  ${r.ruleId.padEnd(26)} ${r.baseline} → ${r.proposed} (${r.change > 0 ? '+' : ''}${r.change})`);
console.log(`\n→ sample-week.jsonl (${SAMPLE_WEEK.length} events)`);
