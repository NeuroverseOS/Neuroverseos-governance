# Design note: the digital generalisation (`neuroverse-governance/1`)

Path B stage 2. This note says how the robot-domain-rules engine (`/3`) gains a
second input format for AI agents calling tools, with one evaluator serving
both. It is written before the code; where the code ends up differing, the
code and SPEC.md win and this note is updated.

## 1. Vocabulary: `/3` ↔ `/1`

| Concept | `/3` (`neuroverse-domain-rules/3`) | `/1` (`neuroverse-governance/1`) |
|---|---|---|
| The thing asked for | `action` (`actions[]`, request `action`) | `tool` (`tools[]`, request `tool`) |
| Where it happens | `area` (`areas[]`, request `areaId`) | `scope` (`scopes[]`, request `scope`) |
| Who asks | `participant { id, kind, roleId }` | `participant { id, kind, roleId, delegatedBy? }` |
| Whose authority the asker acts under | — (the site) | `principal { id }` |
| Delegation | — | `delegation: [{ id, roleId }]`, harness-assembled, outermost first |
| Tool arguments | — | `args` (the real payload); declared per tool, bound to facts |
| Facts | `facts` | `facts` (harness-supplied) ∪ facts bound from `args` |
| Tag lists | `tags.actions`, `tags.areas`, `tags.roles` | `tags.tools`, `tags.scopes`, `tags.roles` |
| Site identity | `site { id, name, hours? }` | `id`, `name` |
| Role limits per place | `area_role_limits:<area>[:deny]` | `scope_role_limits:<scope>[:deny]` |
| Built-in refusals | `required_facts`, `area_declared`, `role_declared`, `role_permits_action`, `unknown_action`, `plan_area_continuity` | `required_facts`, `args_wellformed`, `scope_declared`, `role_declared`, `scope_permits_tool`, `role_permits_tool`, `unknown_tool`, `delegation_exceeds_authority` (no continuity check: a tool call lands in its own scope and does not carry the participant — decided while building d5) |
| Approval contract | `robot-domain-rules-approval/3` | `neuroverse-governance-approval/1` |
| Approval binding | rule, rulebook, participant, action, area, nonce, window | rule, rulebook, **principal**, participant, tool, scope, **argsDigest**, nonce, window (+ authority via key and `by`) |
| Rejected approvals | prose in the PAUSE reason | prose **and** `approvalsRejected: [{ id, nonce?, code, reason }]` on the decision and on the trace entry |
| Rulebook of the other format at a door | refused by name (`rulebook_version`) | refused by name (`rulebook_version`) |

`rulebook_version` stays outside `builtin` for both formats, for the reason
SPEC.md § 5 gives.

## 2. One evaluator, two formats

**Choice: one normalised internal model plus a dialect table; no second
evaluator and no translation of decisions after the fact.**

`src/model.ts` adds `normalize(rulebook)`. For a `/3` rulebook it returns the
rulebook itself (same object, no copy) tagged with the `/3` dialect, so the
`/3` path runs exactly the code it runs today. For a `/1` rulebook it returns a
view in the engine's internal shape: `tools` become the `actions` map,
`scopes` the `areas` map, `tags.tools`/`tags.scopes` the action/area tag sets.
`vocabularyOf` gains a `dialect` member. The dialect is a small table:

```
dialect = {
  format, approvalSpec,
  subjectField: 'action' | 'tool',  placeField: 'areaId' | 'scope',
  builtin: { required_facts, place_declared, role_declared, role_permits, unknown, plan_continuity, ... },
  roleLimitPrefix: 'area_role_limits:' | 'scope_role_limits:',
  approvalFields: [...the string fields an approval may carry...],
}
```

`evaluate(rulebook, request)` is the one evaluator (`evaluateDomainAction`
stays as the same function under its old name). It reads the request through
the dialect (`request[subjectField]`, `request[placeField]`), names every
check through `dialect.builtin`, and builds approval requests with the
dialect's field names. The `/1`-only steps (§ 4–6 below) are gated on things a
`/3` rulebook cannot declare — tools with `args`, tools with `scopes`, a
`principal`, a `delegation` chain — so for `/3` they are no-ops and the trace
is byte-identical. The same goes for `evaluatePlan`, `checkRulebook`
(witnesses in the rulebook's own words), `validateRulebook` (re-derives
`scope_role_limits:` rules for `/1`) and `verifyApproval` (branches on
`spec`). `backtest`, the glasses bridge, rendering, drafting, templates and the
0.2 legacy input stay `/3`-only doors and refuse a `/1` rulebook by name
(message: what the door is, what it was given, which door to use); generalising
them is not part of stage 2. In particular `backtest` (and the audit idea built
on it: replaying a recorded tool-call log through a proposed rulebook, one of
the product's differentiators) stays `/3`-only in stage 2 and is a named stage 3
slice.

**Condition scope.** A rule may condition on a fact that is required, has a
default, or is listed in `requires` by every tool a closed `does` selector
resolves to (so it is present whenever the rule can match). This is a shared
clarification of SPEC § 3; no previously valid rulebook changes meaning. It is
what lets tool-specific facts such as `sql_is_destructive` drive rules without
a default that would turn a missing fact into permission.

Compilation: `compileGovernance(input)` renames the `/1` input into the
internal shape, runs the same `assemble` + `checkRulebook` the `/3` compiler
runs (with the dialect for the builtin list and the role-limit prefix),
validates the `/1`-only declarations (every `args` field binds to a declared
fact; every `tool.scopes` entry is a declared scope), renames the body back
into `/1` words and fingerprints that artifact. The fingerprint is SHA-256 over
RFC 8785 canonical JSON of the `/1` body without `findings`, exactly as § 8.

## 3. `/1` request and decision

Request:

```json
{ "principal": { "id": "owner-sam" },
  "participant": { "id": "subagent-1", "kind": "agent", "roleId": "subagent_reader", "delegatedBy": "recon-agent-1" },
  "delegation": [ { "id": "recon-agent-1", "roleId": "reconciliation_agent" } ],
  "tool": "ledger.query", "scope": "accounting",
  "args": { "sql": "SELECT …" },
  "facts": { "sql_is_destructive": false, "requested_rows": 500, "approvedBy": … },
  "history": [ { "tool": "report.write", "scope": "reporting", "at": "2026-10-16T09:10:00Z" } ],
  "now": "2026-10-16T09:16:00Z", "consumedApprovals": [] }
```

`principal.id` is required (shape; `required_facts`). History entries use
`tool`/`scope`. Everything but `tool` and `args` comes from the harness;
`args` is the payload the tool would run with, as the adapter parsed it.

Decision: as `/3` (`status`, `reasons`, `limits?`, `then?`,
`approvalRequests?`, `approvalsUsed?`, `trace`, `fingerprint`) with
`approvalRequests[]` = `{ ruleId, by?, rulebookFingerprint, principalId,
participantId, tool, scope, argsDigest, reason, setBy }` and the new
`approvalsRejected?: [{ id, nonce?, code, reason }]`, present iff the
request carried an approval that cleared nothing. Codes: `spec`,
`unverified`, `rule`, `rulebook`, `principal`, `participant`, `tool`, `scope`,
`args`, `replayed`, `not_yet_valid`, `expired`, `window_malformed`,
`insufficient`, `spent` (already cleared another wait in this decision),
`no_now`. The same list sits on the trace entry of the rule that stayed waiting.
Both carry only `{ id, nonce?, code, reason }`: never the approval object, its
signature or any key material (a d3 case asserts the decision JSON has no
`signature` anywhere).

## 4. Arguments → facts (fail closed)

A `/1` tool declares `args: { <field>: { fact: <factId>, required?: boolean } }`.
The field's type is the bound fact's type. Step 1b of the algorithm, right
after request shape and before `required_facts`:

| Condition | Outcome |
|---|---|
| tool declares args and `request.args` is not an object (absent, string, array, null) | BLOCK `args_wellformed` |
| a field present in `args` is not declared | BLOCK `args_wellformed` |
| a declared field with `required` (default true) is absent | BLOCK `args_wellformed` |
| a field's value is not valid for its fact's type (`factProblem`) | BLOCK `args_wellformed` |
| `request.facts` also carries a bound fact's ID | BLOCK `args_wellformed` (two sources for one fact) |
| tool declares no args and `request.args` is absent or `{}` | fine |
| tool declares no args and `request.args` has fields | BLOCK `args_wellformed` |
| the tool is undeclared | skip (it is refused as `unknown_tool` later; args cannot be judged) |

Bound facts are copied into the facts the rest of the evaluation sees; the
`argsDigest` is `fingerprint(args ?? {})`. Derived facts (`sql_is_destructive`
from `sql`, `recipient_is_external` from `to_domain`) are not bound: they are
declared facts the tool `requires`, and the harness supplies them from
integrator-declared functions. A missing derived fact is `required_facts`.

## 5. Delegation stays bounded

`participant.delegatedBy` names the immediate delegator. `request.delegation`
is the chain from the principal's direct agent down to that delegator, as the
harness assembled it. Shape rules (all `required_facts`): `delegatedBy` set ⇔
`delegation` is a non-empty list; the last link's `id` equals `delegatedBy`;
every link is `{ id, roleId }` with non-empty strings. A link whose role is
undeclared is `role_declared`. After `role_permits_tool` ALLOW (step 6), for
each link in order: if the link's role does not list the tool, BLOCK
`delegation_exceeds_authority` naming the link (`index`, `id`, `roleId`) and
stop; otherwise one ALLOW check `delegation_exceeds_authority` is recorded.
Never rules still run first. Plan overlays compile with `who: "*"`, so they
bind delegates by construction.

## 6. Approvals bound to arguments

Signed approval (`neuroverse-governance-approval/1`):

```
{ spec, id, authority?, roleId?, ruleId, rulebookFingerprint, principalId, participantId,
  tool, scope, argsDigest, nonce, issuedAt, expiresAt, keyId, signature }
```

Signature: Ed25519 over canonical JSON without `signature`, as `/3`.
`verifyApproval` branches on `spec`: for `/1` the required fields are the list
above, `argsDigest` and `rulebookFingerprint` are 64 hex, key/authority/role
checks as `/3`, and it returns the verified handle (object identity, as today).

The evaluator (step 8) clears a wait only when **all** hold, in this order,
the first failure being the rejection code: `spec` is the `/1` spec; with
`trustedKeys`, it is the verified handle; `ruleId`; `rulebookFingerprint` (the
fingerprint of the rulebook that is deciding, so a mission's compiled rulebook
when a plan is active); `principalId == request.principal.id`; `participantId`;
`tool`; `scope`; `argsDigest == fingerprint(request.args ?? {})`; `nonce` not in
`consumedApprovals`; `issuedAt <= now < expiresAt`; then sufficiency for `by`
(authority rank, role, role tag — unchanged). Any mismatch rejects the approval
(ruling 1): the wait stays unmet, status PAUSE, a fresh approval request is
returned, and `approvalsRejected` says why. A rejected approval is never a
BLOCK. Repeated refusals are the harness's to record: the reference harness
appends a history entry `{ tool: "approval_refused", scope }` on every PAUSE
that rejected an approval, and the scenario shows one rule using it
(`repeated_approval_refusals`: four refused approvals within 60 minutes deny
further refunds). `approval_refused` is declared as a tool no role lists, so it
can only ever appear in history.

## 7. Plans as tightening overlays

A `/1` plan (`neuroverse-governance-plan/1`) is a mission:

```
{ format, id, objective,
  permits: [ { tool, scopes? } ],                 // everything else is denied
  approvals?: [ { tool, scopes?, by } ],          // extra waits
  order?: [ { id?, first, then } ],               // `then` needs ≥1 `first` in history
  atMost?: [ { id?, tools, count } ], requires?: [ { id?, tools } ],   // whole-plan shape (evaluatePlan)
  steps?: [ { tool, scope?, args?, facts? } ] }   // the planner's proposed steps, for the pre-check
```

`compileMission(rulebook, plan)` returns a new `/1` rulebook: the authority
`plan` appended **below** every declared authority (an input that already
declares `plan` is refused), `mission: { id, objective, planDigest }`, and
rules added at `setBy: "plan"`, `source: { kind: "system", ref: "plan:<id>" }`,
`who: "*"`:

| Plan entry | Compiled rule |
|---|---|
| `permits` | `plan:tools` — deny, `does: ["!t₁", "!t₂", …]` (every permitted tool removed from the universe); omitted when every tool is permitted |
| `permits[i].scopes` | `plan:scope:<tool>` — deny, `does: <tool>`, `where: ["!s₁", …]` |
| `approvals[i]` | `plan:approve:<tool>` — `wait { for: approval, by }` |
| `order[i]` | `plan:before:<then>` — deny, `does: <then>`, `history: [{ actions: <first>, op: "<", value: 1 }]` (the engine's history conditions; the adapter always supplies history) |
| `atMost[i]`, `requires[i]` | engine `planRules` `at_most` / `at_least` (`at_least` is one new, additive plan-check kind: more than `count` steps may not be fewer than `count`) |

An entry may carry its own `id` so decisions cite the mission's own names.
The plan format has no `allow`: a plan only adds deny and wait rules at the
lowest authority, and strictest-wins makes anything looser than the permanent
rules ineffective. The compiled rulebook's fingerprint covers rulebook and
plan, and every decision carries it; an approval issued against the base
rulebook does not clear a wait under the mission rulebook (different
fingerprint), which is intended. `evaluatePlan` keeps working on `/1`
rulebooks and `/1` plans (`steps` with `tool`/`scope`/`args`), with
each step in the scope it names (or the previous step's); no continuity check.

## 8. The enforcing adapter (`engine/adapters/tool-call/`)

Zero runtime dependencies; imports the engine only.

```
govern(call, session, harness, executor) → Promise<Governed>

call      { id?, function: { name, arguments: string | object } }  |  { name, args }
session   { rulebook, principal: { id }, participant: { id, kind, roleId, delegatedBy? }, delegation?: [{ id, roleId }] }
harness   { now(): Timestamp,
            resolveScope(tool, args, ctx): string,
            facts?(tool, args, ctx): Record<string, unknown>,          // supplied facts
            derive?: { [factId]: (args, ctx) => FactValue },           // integrator-declared derived facts
            reserve?(tool, args, ctx): { facts, commit(), release() } | null,   // spend ledger (ruling 3)
            approvals?(tool, args, ctx): unknown[],                    // signed approvals the harness holds for this call
            consumed: { has(nonce), add(nonce) },
            history: { of(participantId): HistoryEntry[], append(participantId, entry) } }
executor  (tool, args, { limits?, decision }) => Promise<unknown>
Governed  { status, executed: boolean, decision, request?, result?, error?: { stage, message }, callId? }
```

Order: parse → resolve scope → supplied facts → derived facts → reserve →
verify approvals (`verifyApproval` against the rulebook's keys; failures are
passed through unverified so the decision says why) → build request →
`evaluate` → act. Facts never come from the requester; the model's text about
its intent is not an input.

| Input condition | Outcome | Executor called |
|---|---|---|
| call is not an object, or has no tool name | BLOCK `tool_call_malformed` (adapter check, `setBy: "adapter"`) | no |
| `arguments` is a string that is not JSON | BLOCK `args_wellformed` (adapter: "arguments are not JSON") | no |
| parsed arguments are not an object | BLOCK `args_wellformed` (evaluator) | no |
| undeclared / missing / wrong-type argument | BLOCK `args_wellformed` (evaluator) | no |
| `resolveScope` throws or returns a non-string | BLOCK `harness_failed` | no |
| a supplied/derived fact function throws | BLOCK `harness_failed` | no |
| a required derived fact has no function | BLOCK `required_facts` (evaluator) | no |
| `reserve` throws | BLOCK `harness_failed` | no |
| `verifyApproval` throws | BLOCK `harness_failed` | no |
| an approval does not verify or does not bind | PAUSE with `approvalsRejected` (evaluator) | no |
| session rulebook is not `/1` | BLOCK `rulebook_version` | no |
| `evaluate` throws | BLOCK `evaluation_failed` | no |
| decision BLOCK or PAUSE | as decided; reservation released; refusal history appended on PAUSE-with-rejections | no |
| decision ALLOW | ALLOW; executor once | yes |
| decision LIMIT | LIMIT; executor once with `limits` | yes |
| executor returns | reservation committed, `approvalsUsed` nonces consumed, history appended | — |
| executor throws | `executed: true`, `error.stage = "executor"`, reservation released, nonces **not** consumed, nothing appended | — |

Reference harness (`engine/adapters/tool-call/reference-harness.ts`):
in-memory `SpendLedger` with `reserve(bucket, amount) → { projected, commit, release }`
(synchronous critical section; held reservations count toward every later
`projected` until released or committed — so two concurrent 300s against
400 remaining see 400 then 700, and the second is denied; proven in
`test/tool-call-adapter.test.ts`), an in-memory nonce set, an in-memory
history store, and a scope resolver / derived-fact table the caller declares.

## 9. New built-in IDs

Evaluator (`/1` rulebooks, listed in `builtin`): `args_wellformed`,
`scope_declared`, `scope_permits_tool`, `role_permits_tool`, `unknown_tool`,
`delegation_exceeds_authority`, plus the shared
`required_facts` and `role_declared`. Outside `builtin`: `rulebook_version`.
Adapter (`setBy: "adapter"`, never in a rulebook): `tool_call_malformed`,
`harness_failed`, `evaluation_failed`.

## 10. Spec, schemas, versions

SPEC.md gains § 16 "neuroverse-governance/1" with the table of § 1, the
`/1` rulebook/request/decision/plan/approval formats, the algorithm deltas
(steps 1b, 6b, 8), the overlay compilation table, the adapter contract and
table, and the refusal IDs. `spec/` gains `governance-rulebook`,
`governance-request`, `governance-decision`, `governance-plan`,
`governance-approval` and `tool-call` schemas (`$id` under the same base).
`version.ts` knows both formats: core doors accept both; a `/3`-only door
refuses `/1` by name; the adapter refuses `/3` by name; a `/1` approval at a
`/3` rulebook and a `/3` approval at a `/1` rulebook are rejected by spec.

## 11. Conformance files (all new; the 261 `/3` cases are untouched)

Generated by `generate.ts` against a small digital site (`desk`: authorities
`law > owner > agent`, kinds `agent`/`human`, tools `read`, `write(path, bytes)`,
`pay(amount)`, `send(to)`, `approval_refused`; scopes `files`, `shared`, `bank`,
`mail`; roles `worker`, `reader`, `boss`; a `max_bytes` limit; a `projected_spend`
fact). New expectation kinds in `compare.mjs`: `decision`/`verifiedDecision`/
`plan`/`error`/`verify` work unchanged for `/1`; `enforcement: { status,
executed, limits? }` runs `case.call` through the adapter with a data-described
harness (`case.harness: { scope, facts, approvals?, now, consumed, history,
fault? }`) and a spy executor.

| File | Cases (positive and negative) |
|---|---|
| `d1-tools-and-args.json` | declared args allow; undeclared field; missing required field; wrong type; args not an object; args absent for a tool with args; no-args tool with and without `{}`; bound fact also in facts; unknown tool; unknown scope; tool outside its scopes; missing derived fact; `/1` builtin list and `scope_role_limits:` derived rule (integrity); compile errors: arg bound to undeclared fact, tool scope undeclared; `/1` rulebook with a wrong format string refused by name |
| `d2-delegation.json` | one-link chain permitted; link 1 lacks the tool; link 2 lacks the tool; acting role lacks it (`role_permits_tool` wins); `delegatedBy` without chain; chain without `delegatedBy`; last link ≠ `delegatedBy`; undeclared chain role; plan overlay denies a delegate |
| `d3-bound-approvals.json` | TEST keys; PAUSE with `argsDigest` in the request; valid approval ALLOW with `approvalsUsed`; rejected for: args, expired, not yet valid, replayed, wrong rule, wrong principal, wrong participant, wrong tool, wrong scope, wrong rulebook fingerprint, unverified handle (`evaluate` on signed data), `/3` approval at a `/1` door, `/1` approval at a `/3` door; `verify` cases ok/not ok; a second approval clears a second wait |
| `d4-limits-and-spend.json` | projected spend exactly at the cap (ALLOW); one over (BLOCK); missing (`required_facts`); `max_bytes` within (ALLOW + limits), over (LIMIT), unbounded (LIMIT); enforcement sequence: two sequential reservations through one ledger (the concurrent proof is in the vitest file, since a JSON case is sequential by nature) |
| `d5-plans.json` | overlay denies an unpermitted tool; overlay denies a scope; plan approval wait; order rule before/after; plan cannot loosen a permanent deny or wait; mission fingerprint ≠ base; `evaluatePlan` on a `/1` plan with `at_least`, `at_most`, a step in its own scope; a malformed mission record → error |
| `d6-enforcement.json` | executor never called on BLOCK; never on PAUSE; once on ALLOW; receives limits on LIMIT; malformed arguments JSON; scope resolver throws; fact function throws; executor throws (recorded, not re-run); `/3` rulebook at the adapter |

## 12. The scenario against the engine

`acceptance/invoice-reconciliation/run.ts` compiles `rules.json` with
`compileGovernance`, `plan.json` with `compileMission`, and replays
`transcript.jsonl` through `govern` with the reference harness (a resolver and
derived-fact table written for this business, the in-memory ledger, the TEST
key's public key as the trusted key, history from executed lines). It prints
one row per line and `N/M`, exits non-zero on a mismatch, and never edits the
fixture. Fixture edits forced by the rulings and by this design are listed in
the stage 2 report and in the fixture README.
