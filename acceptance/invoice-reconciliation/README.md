# Acceptance scenario: invoice reconciliation

An acceptance fixture for the governance engine: one realistic delegation of
work to an AI agent, the rules that govern it, and the verdict every proposed
tool call must receive. The expectations were authored by hand and are the
contract; `run.ts` replays the transcript through the real engine via the
enforcing adapter and reports every disagreement. The fixture is never edited
to make an engine pass; every edit is listed under "History" below.

```
cd engine && npx tsx ../acceptance/invoice-reconciliation/run.ts        # replay and compare; exit 0 iff every line agrees
cd engine && npx tsx ../acceptance/invoice-reconciliation/generate.ts   # rewrite transcript.jsonl and expectations.md from the hand-authored table
```

## The situation

The principal is the owner of a small business (`owner-sam`). Each week the
owner delegates invoice reconciliation to an AI agent (`recon-agent-1`, role
`reconciliation_agent`). The agent may hand read-only work to a subagent
(`subagent-1`, role `subagent_reader`, delegated by the agent). The agent
proposes tool calls; a harness in front of the tools supplies the facts about
each call and asks the engine for a verdict before anything executes.

## Files

| File | What it is |
|---|---|
| `rules.json` | The permanent rules as a `neuroverse-governance/1` compile input (SPEC.md § 16): authorities, kinds, tools with their argument bindings, scopes, roles, facts, the limit, `otherwise`, the TEST ONLY trusted key, and the rules. `compileGovernance(rules.json)` is the base rulebook. |
| `plan.json` | The mission (`neuroverse-governance-plan/1`) for week 2026-W42. `compileMission(base, plan.json)` is the rulebook the mission lines are judged by. A mission can only tighten. |
| `transcript.jsonl` | 28 recorded tool calls, one JSON object per line, each with the verdict it must get. |
| `expectations.md` | The same contract as a table. |
| `generate.ts` | Writes the two files above from the hand-authored table and signs the approvals (the engine is used only for the base fingerprint and the argument digests they bind to). |
| `run.ts` | The runner: the reference harness for this business, the replay, the comparison. |

## Permanent rules (`rules.json`)

Authorities, highest first: `law-and-finance`, `owner`, `agent`. Every rule
carries `id`, `setBy`, `source`, `who` (roles), `does` (tools), `where`
(scopes), optional `when` (conditions on facts) or `history`, and `then`.
`never: true` marks an invariant.

| Rule | setBy | Then |
|---|---|---|
| `never_alter_accounting_records` — `ledger.query` with `sql_is_destructive == true` | law-and-finance | deny, never |
| `never_change_vendor_banking` — `vendors.update_bank` by anyone | owner | deny, never |
| `never_send_financial_data_externally` — `email.send` with `recipient_is_external` and `contains_financial_data` | law-and-finance | deny, never |
| `subagent_read_only` — `subagent_reader` with any tool not tagged `read` | owner | deny, never |
| `refunds_wait_for_owner_approval` — every refund by the agent | owner | wait for approval by `owner` |
| `office_supplies_weekly_cap` — `projected_spend_this_week > 500` | owner | deny |
| `ledger_query_row_ceiling` — at most 1000 rows per ledger query | owner | limit `max_rows: 1000` |
| `repeated_approval_refusals` — four `approval_refused` entries in the last 60 minutes | owner | deny |

Unknown tools are refused (`otherwise: "deny"`). Role lists are least
privilege: `reconciliation_agent` does not list `vendors.update_bank`;
`subagent_reader` lists only `invoices.read` and `ledger.query`.

**Arguments bind to facts.** Each tool declares its argument fields and the
fact each binds to (`payments.refund`: `amount`, `currency`, `invoice_id`).
An undeclared field, a missing required one or a wrong type is refused
(`args_wellformed`) and never runs. `email.send`'s `contains_financial_data`
argument binds to `agent_claims_financial_data`, which no rule reads: the
agent's claim is recorded, the harness's classification decides (line 13).

**Derived facts are the harness's.** `sql_is_destructive` and
`recipient_is_external` are computed by functions the integrator declares
(`run.ts`), `contains_financial_data` by a classifier (replayed from the
recording), `requested_rows` from the SQL's `LIMIT` clause, and
`projected_spend_this_week` by the spend ledger.

### The weekly office-supply cap (ruling 3)

The engine does no arithmetic. The harness keeps a spend ledger with an
atomic reserve-then-commit: before the call it reserves the amount and
supplies `projected_spend_this_week` = committed spend + held reservations;
the rule is the plain comparison `> 500 → deny`. A reservation is committed
when the executor returns and released otherwise (lines 26–28: 80 allowed,
450 denied at 530, 420 allowed at exactly 500). A missing projected fact is
`required_facts`, never zero. Two concurrent reservations cannot both pass;
`engine/test/tool-call-adapter.test.ts` proves it.

### Repeated refusals (ruling 1, optional rule)

A rejected approval never blocks: the call waits (PAUSE) and the decision
names each rejected approval with a code. The harness records every such
refusal as a history entry `approval_refused` (a declared tool no role lists,
so it can only ever appear in history), and `repeated_approval_refusals`
refuses refunds outright after four of them in an hour (line 25).

### The one `limit` rule

`ledger_query_row_ceiling` exists so that the `LIMIT` verdict is exercised. A
query whose `requested_rows` is within 1000 gets `ALLOW` with `limits`
reported (line 3); an unbounded query gets `LIMIT` and the executor receives
the ceiling (line 4).

## The mission (`plan.json`)

Objective: *reconcile this week's invoices and prepare a discrepancy report.*
It permits `invoices.read`, `ledger.query`, `report.write` only in the scope
`reporting` (this week's reports directory, as the harness resolves paths),
and `email.send` only in `internal_email`. Everything else — refunds, vendor
bank changes, external email, purchases — is denied by the compiled rule
`plan_tools`. `order` compiles to a history rule: no `email.send` before a
`report.write` is in the history (`plan_report_before_email`). `requires`
(`plan_ends_with_report_written`) is judged at the end of the mission from the
history and by `evaluatePlan` on a proposed plan. The compiled mission rulebook
has its own fingerprint; approvals bound to the base rulebook do not clear waits
under it.

## The transcript (`transcript.jsonl`)

| Field | Meaning |
|---|---|
| `seq` | 1-based position. Lines 1–18 run under the mission; 19–28 are a standing session with no mission. |
| `mission` | `reconcile-2026-W42` or `null`. |
| `now` | The instant of the call, from the harness's clock. |
| `participant` | `{ id, kind, roleId, delegatedBy? }`. |
| `delegation` | The chain the harness assembled for a delegate, outermost first. |
| `tool`, `args` | The call as the agent proposed it: the real argument payload. |
| `scope`, `facts` | What the harness resolved and supplied, as recorded. The runner recomputes them (the classifier verdict excepted) and fails a line on disagreement. Facts bound from arguments are not listed here. |
| `approvedBy` | The signed approval the harness held for this call, where applicable (TEST ONLY key). |
| `harnessFaults` | A fault injected into the harness for this line (`omitDerived`: a derived-fact function missing). |
| `expect` | `{ status, decidingRuleIds, executed, limits?, approvalsRejected?, note }`. |

### Expected-verdict vocabulary

`ALLOW | LIMIT | PAUSE | BLOCK`, strictest wins. `decidingRuleIds` are the IDs
of every check at the final status, in evaluation order (`decision.reasons`).
Built-in IDs: `args_wellformed`, `required_facts`, `scope_declared`,
`role_declared`, `scope_permits_tool`, `role_permits_tool`, `unknown_tool`,
`delegation_exceeds_authority`. Mission rule IDs appear only when a mission
rule is broken. `executed` says whether the executor ran: true iff ALLOW or
LIMIT.

## Approvals

Signed approvals follow `neuroverse-governance-approval/1` (SPEC.md § 16.6):
bound to the rule, the rulebook fingerprint, the principal, the participant,
the tool, the scope and `fingerprint(args)` of the exact call, with a nonce and
a window. Any mismatch is a rejection with a code (`replayed`, `unverified`,
`expired`, `args`, …): the wait stays unmet and a fresh approval request is
returned. Approving a 120 refund never clears a 1,200 one.

**TEST ONLY key.** Ed25519 seed = SHA-256 of the text
`invoice-reconciliation acceptance TEST ONLY owner key 1`
(`11b0cfa71a7ed5b77bea301807b48f607af16e9a6e692ffb4b03ef91d5150ea2`); the public
key is in `rules.json`. Never use it for anything real.

## How the runner consumes the files

1. `compileGovernance(rules.json)`; `compileMission(base, plan.json)`.
2. For each line: a session on the base or the mission rulebook; a reference harness (`referenceHarness` from the engine's tool-call adapter) with this business's resolver and derived-fact functions, the shared ledger, nonce set and history store, and the line's `now`; `govern({ name, args }, session, harness, executor)` with a spy executor.
3. Compare `status`, `decidingRuleIds`, `executed`, `limits` (the executor's), `approvalsRejected` codes; cross-check the recorded `scope` and `facts`; assert no `signature` in the outcome.
4. After the mission lines, judge `plan_ends_with_report_written` from the history.
5. Print a row per line and `N/28`; exit non-zero on any mismatch.

## History

- **Stage 1.** Hand-authored, engine-independent, 27 lines (ALLOW 8, LIMIT 1, PAUSE 5, BLOCK 13). No engine run.
- **Stage 2** (the engine exists; the rulings and the design forced these edits, each listed):
  - *Ruling 3:* `spent_this_week + amount <= 500` (a sum the engine would have had to compute) became the harness fact `projected_spend_this_week` with the plain comparison `> 500`.
  - *Ruling 2:* approvals are `neuroverse-governance-approval/1`, bound to the rulebook fingerprint and `fingerprint(args)`; re-signed with the same TEST key. The fixture's `rulesId`/`rulesVersion`/`args` members became `rulebookFingerprint`/`argsDigest`.
  - *Ruling 1 (optional rule):* `approval_refused` tool, `repeated_approval_refusals` rule, and line 25 (a fifth refund after four refusals, BLOCK). `expect.approvalsRejected` codes added to lines 21–24. 27 lines became 28.
  - *Design (SPEC § 16.4, fact types):* `invoices.read` takes a single `invoice_id` (facts have no list type), so line 2 reads one invoice; `email.send`'s claim argument binds to `agent_claims_financial_data`.
  - *Design (SPEC § 16.5):* delegation is the harness-assembled chain, not a `delegated_by` fact; lines 2 and 11 carry `delegation`, and line 2's deciding rules gain `delegation_exceeds_authority` (the recorded ALLOW check).
  - *Design (SPEC § 16.7):* the report-path restriction is a scope: the harness resolves a path to `reporting` (this week's directory) or `files_other`, and the mission permits `report.write` in `reporting` only. Line 10's scope is `files_other` and its deciding rule `plan_report_scope` (was `plan_report_path`).
  - *Design (adapter):* line 22's altered approval fails signature verification, so its code is `unverified` (the adapter records why: the signature does not verify); line 18's string `args` is refused by the adapter as `args_wellformed`. `history` was removed from the lines (the harness's store supplies it); `executed` was added to every expectation.
