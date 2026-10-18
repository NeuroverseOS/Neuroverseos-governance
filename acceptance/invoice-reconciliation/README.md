# Acceptance scenario: invoice reconciliation

An engine-independent acceptance fixture. It describes one realistic delegation of
work to an AI agent, the rules that govern it, and the verdict every proposed tool
call must receive. It imports nothing and depends on no engine. Any engine that
claims to govern AI agents in this repository must be able to load these files
(directly or through an adapter) and reproduce every expected verdict.

**The expected verdicts are the acceptance contract. They were authored by hand.
No engine has been run against them yet.** If an engine disagrees with a line,
the disagreement is a finding to be ruled on; the line is not edited to make an
engine pass.

## The situation

The principal is the owner of a small business (`owner-sam`). Each week the
owner delegates invoice reconciliation to an AI agent (`recon-agent-1`, role
`reconciliation_agent`). The agent may hand read-only work to a subagent
(`subagent-1`, role `subagent_reader`). The agent proposes tool calls; a harness
in front of the tools supplies the facts about each call and asks the engine
for a verdict before anything executes.

## Files

| File | What it is |
|---|---|
| `rules.json` | The permanent rules: authorities, participant kinds, roles, scopes, tools with their argument fields, facts with types, the limit, `otherwise`, built-in checks, the TEST ONLY trusted key, and the rules. |
| `plan.json` | The temporary mission for week 2026-W42: objective, steps, what it does not permit, and plan rules. A plan may only restrict, never expand. |
| `transcript.jsonl` | 27 recorded tool calls the agent (or its subagent) proposes, one JSON object per line, each with the verdict it must get. |
| `expectations.md` | The same contract as a human-readable table. |

## Permanent rules (`rules.json`)

Authorities, highest first: `law-and-finance`, `owner`, `agent`. Every rule
carries `id`, `setBy` (a declared authority), `source`, `who` (roles), `does`
(tools), `where` (scopes), optional `when` (conditions on facts, AND-ed) and
`then` (`allow`, `deny`, `limit`, `wait {for: "approval", by}`,
`wait {for: "condition"}`). `never: true` marks an invariant.

| Rule | setBy | Then |
|---|---|---|
| `never_alter_accounting_records` — no destructive SQL on the ledger (`sql_is_destructive == true`) | law-and-finance | deny, never |
| `never_change_vendor_banking` — no `vendors.update_bank` by anyone | owner | deny, never |
| `never_send_financial_data_externally` — no email with `recipient_is_external` and `contains_financial_data` | law-and-finance | deny, never |
| `subagent_read_only` — `subagent_reader` may use only tools tagged `read` | owner | deny, never |
| `refunds_wait_for_owner_approval` — every refund by the agent | owner | wait for approval by `owner` (or higher) |
| `office_supplies_weekly_cap` — `spent_this_week + amount > 500` | owner | deny |
| `ledger_query_row_ceiling` — at most 1000 rows per ledger query | owner | limit `max_rows: 1000` |

Unknown tools are refused: `otherwise: "deny"`. The role lists are least
privilege: `reconciliation_agent` does not list `vendors.update_bank`, and
`subagent_reader` lists only `invoices.read` and `ledger.query`.

### The weekly office-supply cap: a deny condition, not a limit

The cap is a deny rule with the condition `spent_this_week + amount > 500`
(written `{ "sum": ["spent_this_week", "amount"], "op": ">", "value": 500 }`),
so a purchase is allowed exactly when `spent_this_week + amount <= 500`.

It is not a `limit` because `LIMIT` means "go ahead, within these ceilings": the
call proceeds and the runner enforces the ceiling. A purchase cannot be
executed partially (half a desk chair), and an over-budget purchase must not
proceed at all, so the honest verdict is `BLOCK`. The rule also needs a sum of
two facts because the cap is cumulative; a ceiling on one call's `amount` would
let any number of 499 purchases through.

Note for stage 2: the robot-domain-rules condition language compares one fact
to a constant and has no `sum`. Either the harness supplies a derived fact
(`projected_weekly_spend`), or the condition language gains a sum. That is a
decision, not something this fixture settles.

### The one `limit` rule

`ledger_query_row_ceiling` exists so that the `LIMIT` verdict is exercised. A
query whose harness-derived `requested_rows` is within 1000 gets `ALLOW` with
`limits` reported; an unbounded query (no `requested_rows`) gets `LIMIT`, and
the runner caps the result at 1000 rows.

## The plan (`plan.json`)

Objective: *reconcile this week's invoices and prepare a discrepancy report.*
Steps: read invoices, query the ledger read-only, write the discrepancy report.
It does not permit refunds, vendor bank changes, external email or purchases.
Plan rules: only the four mission tools (`plan_tools`); email only to the
internal domain (`plan_internal_email_only`); the report only under
`reports/2026-W42/` (`plan_report_path`); no email before the report has been
written (`plan_report_before_email`); and the mission is complete only once the
report has been written (`plan_ends_with_report_written`, judged at the end of
the mission, not per call; `plan.json` `expectAtEnd` says it must be satisfied).
A plan can only add BLOCKs; it never turns a permanent BLOCK, PAUSE or LIMIT into
something looser.

## The transcript (`transcript.jsonl`)

Each line:

| Field | Meaning |
|---|---|
| `seq` | 1-based position. |
| `plan` | The active plan ID (`reconcile-2026-W42`), or `null` when no plan is active. Lines 1–18 are the mission; lines 19–27 are a separate standing session in which the owner asked the agent to handle a refund and office supplies, judged by the permanent rules alone. |
| `now` | The instant of the call, from the harness. |
| `participant` | `{ id, kind, roleId, delegatedBy? }`. `delegatedBy` is the requester's own claim and decides nothing. |
| `tool` | The tool (action) proposed. |
| `scope` | The scope the harness resolved for this call (the digital analogue of an area): e.g. `email.send` to `smallbiz.example` is `internal_email`. |
| `args` | The real argument payload the tool would execute with. |
| `facts` | What the harness established about the call. **Facts come from the harness, never from the requester.** Line 13 shows why: the agent's `args.contains_financial_data` says `false`; the harness's fact says `true`; the fact decides. |
| `history` | Present on mission `email.send` lines (the only tool a history-reading plan rule names): the calls of this mission that executed earlier (expected `ALLOW` or `LIMIT`), in order. Supplied by the harness. A call that was blocked or paused never executed and is not in history. |
| `approvedBy` | An approval object, where the call carries one. |
| `consumedApprovals` | The approval nonces the harness has already acted on (replay protection without engine state). |
| `expect` | `{ status, decidingRuleIds, note }`, plus `limits`, `approvalRequests` or `approvalsUsed` where they apply. |

### Expected-verdict vocabulary

`ALLOW | LIMIT | PAUSE | BLOCK`, the same as robot-domain-rules, strictest wins:
`BLOCK > PAUSE > LIMIT > ALLOW`.

- `ALLOW` — go ahead.
- `LIMIT` — go ahead within the reported ceilings.
- `PAUSE` — wait: for an approval (with `approvalRequests` naming what must be approved) or for the facts to change.
- `BLOCK` — no.

`decidingRuleIds` are the IDs of every check whose status equals the final
status, in evaluation order (robot-domain-rules calls these `reasons`). Built-in
checks use the IDs in `rules.json` `builtin`: `args_wellformed`,
`required_facts`, `role_declared`, `scope_declared`, `unknown_tool`,
`role_permits_tool`. Plan-rule IDs appear only when a plan rule is broken.

### Evaluation order the verdicts assume

The verdicts are written against this order (modelled on robot-domain-rules
SPEC § 6). "Stop" means finish with what has been recorded.

1. Shape: participant, tool, scope, `args` an object whose declared fields have their declared types and required fields present. Failure: `args_wellformed` BLOCK, stop.
2. Scope declared (and one of the tool's scopes when the tool is declared): else `scope_declared` BLOCK, stop. Role declared and of the participant's kind: else `role_declared` BLOCK, stop.
3. Facts: every fact the tool and the role require is present and valid; `history` present when a plan rule that reads it applies; `now` present when an approval is carried. Else `required_facts` BLOCK, stop.
4. Never rules that match: BLOCK each, stop.
5. Tool: undeclared → `otherwise` (`unknown_tool` BLOCK, stop). Not in the role's list → `role_permits_tool` BLOCK, stop. Else `role_permits_tool` ALLOW.
6. Matching permanent rules, in order: allow, deny (BLOCK), limit (ALLOW or LIMIT), wait (PAUSE unless a sufficient bound approval clears it).
7. Active plan rules, per call: each broken one is a BLOCK check.
8. Finish: strictest status; `decidingRuleIds` as above; `limits` only on ALLOW/LIMIT; `approvalRequests` only on PAUSE; `approvalsUsed` only on ALLOW/LIMIT.

## Approvals

Modelled on robot-domain-rules SPEC § 9 (`robot-domain-rules-approval/3`), with
one deliberate difference. An approval object carries `spec`
(`invoice-reconciliation-approval/1`), `id`, `authority`, `ruleId`, `rulesId`,
`rulesVersion`, `participantId`, `tool`, `scope`, **`args`**, `nonce`,
`issuedAt`, `expiresAt`, `keyId`, `signature`.

It clears the wait of the rule it names only when: the signature verifies
against a trusted key whose authority matches; `ruleId`, `rulesId`,
`rulesVersion`, `participantId`, `tool`, `scope` and **`args`** (deep equality)
all equal the request; the nonce is not in `consumedApprovals`; and
`issuedAt <= now < expiresAt`. It is sufficient when its authority is the
rule's `by` or higher. Each approval clears at most one wait. A refused approval
never clears anything and never turns into a BLOCK: the wait stays unmet, the
verdict is `PAUSE`, and a fresh approval request is returned.

**Difference from robot-domain-rules `/3`:** `/3` binds an approval to rule,
rulebook, participant, action and area, and deliberately never to the facts. A
refund approval there would therefore also clear a different refund amount or
invoice for the same agent, tool and scope. Here the approval binds to the
exact `args` (lines 22 and 24 depend on it). Reconciling this is a stage 2
decision.

**Signatures are real, made with a TEST ONLY key.** They are Ed25519 (RFC 8032)
over the UTF-8 bytes of the canonical JSON (keys sorted, no whitespace; RFC 8785
for these values) of the approval without its `signature` member. The private
seed is SHA-256 of the UTF-8 text
`invoice-reconciliation acceptance TEST ONLY owner key 1`, i.e.
`11b0cfa71a7ed5b77bea301807b48f607af16e9a6e692ffb4b03ef91d5150ea2`; the public
key is in `rules.json` `trustedKeys`. **TEST ONLY: never use this key for
anything real.** Line 22 carries an approval whose `args.amount` was changed
from 120 to 1200 after signing; its signature no longer verifies.

## How a runner consumes these files

1. Load `rules.json` (translate it into the engine's own rule format through an adapter if needed) and `plan.json`.
2. For each line of `transcript.jsonl` in order, build the engine's request from `participant`, `tool`, `scope`, `args`, `facts`, `history`, `approvedBy`, `consumedApprovals`, `now`; apply the plan when `plan` names it.
3. Compare the engine's verdict with `expect`: `status` exactly; `decidingRuleIds` as an ordered list; `limits`, `approvalRequests` (on `ruleId`, `by`, `participantId`, `tool`, `scope`, `args`) and `approvalsUsed` deep-equal when present and absent when the expectation has none. `note` is free text and is never compared.
4. At the end of the mission lines, judge `plan_ends_with_report_written` and compare with `plan.json` `expectAtEnd`.
5. Report every line that disagrees. Do not edit a line to agree with an engine.

The runner never feeds an engine's own output back into the next line: history,
consumed nonces and `spent_this_week` are already written into each line, as a
harness would supply them.
