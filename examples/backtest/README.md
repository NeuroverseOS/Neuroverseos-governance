# Test a rulebook against recorded activity

**Synthetic sample week: illustrative data, not from a real store.** Every event in `sample-week.ts` / `sample-week.jsonl` is made up and generated the same way every time.

```bash
npx tsx examples/backtest/backtest.ts
```

A store manager writes a rule — "only two robots can be in aisle 5 at the same time" — and, before it goes live, asks what the rulebook *would have decided* for last week's recorded requests. That is `backtest(rulebook, events)`: pure, deterministic, no model, no clock (every time comes from the log). The site supplies the recorded events and the facts each one carried; the tool only applies the rules. It says what the rules would have decided; it never says why things happened.

| File | What it is |
|---|---|
| `rulebook.ts` | The sample site: the grocery template, the switchboard's grocery vocabulary, aisle 5, a `robotsInZone` count fact every request must bring, the rule under test (`aisle5_robot_limit`, limit 2 — `sampleSite(3)` gives the proposed version), a history rule (`scan_budget`), the grocery example's manager rules (two deliberately at odds with the company's answers), and one rule nothing ever reaches. |
| `sample-week.ts` | Seven days, Mon 2026-10-05 to Sun 2026-10-11, 189 events, hand-structured: robots file into aisle 5 one after another (a fourth on four days); three events with no occupancy count and one with no people count; a shopper's photo and a lunchtime voice note that hit the conflicting rules; five scans of one aisle in an hour; a planner asking for an action the rulebook does not know; a Saturday-afternoon restock, a fire alarm, a robot after hours. Each event carries an `outcome` — what the imaginary record says happened next. |
| `sample-week.jsonl` | The same week written out by `backtest.ts`, one event per line after a header record (the switchboard's importer skips the header). Import it in the switchboard's Test mode, or feed it to your own tooling. |
| `backtest.ts` | Runs the backtest, prints the report, then compares limit 2 with limit 3 on the same week. |

What the report shows for this week: the aisle-5 rule would have blocked 11 entries that the record says happened (the rule was not live when the week was recorded); three Wednesday-evening requests could not be decided at all because the log carried no `robotsInZone`; `back_room_evening_approval` never fired; the shopper-photo override and the lunchtime-audio contradiction both occurred; `open_door` is a gap. Raising the limit to three newly allows exactly the seven third-robot entries and nothing else.

The event format is SPEC.md § 13: `{ at, request, outcome? }`, in time order, where `request` is exactly what `evaluateDomainAction` receives and `outcome` is `happened`, `did_not_happen` or `unknown` — reported, never decided on.
