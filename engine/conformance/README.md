# Conformance cases

Language-neutral JSON cases that any implementation of [SPEC.md](../SPEC.md) must pass. They are grouped by the principle they prove ([PRINCIPLES.md](../PRINCIPLES.md)); every case has a one-line `description` saying what it proves. Compiled rulebooks are inline or in `rulebooks/` (`rulebookRef`). The cases were generated from the TypeScript reference by `generate.ts` with the intent of each stated by hand; the JSON files are the authority.

| File | Proves |
|---|---|
| `p1-source.json` | Rules carry `source` and `setBy`; the engine invents nothing |
| `p2-authority.json` | Declared order; lower only tightens; approvals must hold what the rule names |
| `p3-rules-decide.json` | The structured outcome decides, never prose or anything outside the request |
| `p4-unknown-and-missing.json` | Every refusal for unknown or missing things, by builtin ID |
| `p5-explains.json` | Reasons, trace order, limits, `then`, fingerprint |
| `p6-waiting.json` | Approval waits vs condition waits; `approvalRequests` |
| `p7-conflicts.json` | Every finding kind (including `unmatched_selector` on one rule), certainty, reachability (roles, unconditional never rules, always-true conditions) and provable disjointness |
| `p8-one-law.json` | Robots, people and agents through one path; selectors; area role limits |
| `p9-boundary.json` | Facts are trusted; time is a fact; a limit is a ceiling |
| `plans.json` | Whole plans: effects projected step by step, the first BLOCK, plan rules, approvals collected, the clock starting at the wall-clock time `now` names in its own offset, malformed plans, effect and plan-rule validation |
| `history.json` | History conditions: counts in a window of a clock fact, same-area, missing history is a refusal, validation |
| `backtest.json` | A recorded log replayed through a rulebook: totals, history built from earlier events, missing facts named, gaps, stalls, conflicts that occurred, rule-versus-record differences, and a current-versus-proposed comparison |
| `fingerprint.json` | RFC 8785 canonical JSON and the SHA-256 fingerprint, byte for byte, with the number edges a port must reproduce; SHA-256 vectors |
| `approvals.json` | Ed25519 test vectors (TEST ONLY keys), verification, the `/3` binding (rule, rulebook, participant, action, area, nonce, window), replay, the verified handle (an unsigned object marked verified clears nothing; the pure evaluator never clears a trusted-keys wait), approval lists (one approval per wait), step-by-step consumption in a plan, sub-millisecond truncation, facts-change and current-BLOCK cases, `/2` refusal with and without keys, rulebook signatures |
| `versions.json` | A `/1` or `/2` rulebook is refused by name with its migration, never reinterpreted — by validation and by the evaluator, the plan evaluator and the trusted entry (`rulebook_version`) |
| `integrity.json` | Validation re-derives the area role-limit never rules and the findings: a rulebook with either stripped or altered is invalid even with a recomputed fingerprint; reworded findings are fine |
| `d1-tools-and-args.json` | **neuroverse-governance/1** (SPEC.md § 16): tools, scopes and arguments bound to facts — declared, undeclared, missing, wrong-type and non-object arguments; unknown tool and scope; a tool outside its scopes; a missing derived fact; the `/1` builtin list, the derived `scope_role_limits:` rule and the `/1` findings with witnesses in tool words; another `/1` version refused by name |
| `d2-delegation.json` | Delegation stays bounded: a tool is permitted only if the acting role and every role in the harness-assembled chain list it (`delegation_exceeds_authority` names the first link that does not); chain shape refusals; a mission binds delegates |
| `d3-bound-approvals.json` | Approvals bound to arguments (TEST ONLY keys): a `/1` signed approval clears the wait it names for this principal, participant, tool, scope and argument digest; every mismatch (args, expiry, not-yet-valid, replay, rule, principal, participant, tool, scope, rulebook, authority, unverified handle, a `/3` approval at a `/1` door and the reverse) is a PAUSE with `approvalsRejected` codes, never a BLOCK; a decision carries no signature; repeated refusals judged by a history rule |
| `d4-limits-and-spend.json` | Projected spend as a harness fact (at the cap, one over, missing, two reservations as the harness projects them) and a `/1` limit rule |
| `d5-plans.json` | Missions compiled onto the rulebook: unpermitted tools and scopes denied, approval waits added, plan order as a history rule (and the history it needs), a mission cannot loosen a never rule or a cap, the mission fingerprint, `/1` whole-plan evaluation with `at_least` and `at_most`, each step in its own scope |
| `d6-enforcement.json` | The tool-call adapter: the executor is never called on BLOCK or PAUSE, once on ALLOW, with limits on LIMIT; malformed arguments, harness faults and a `/3` rulebook are BLOCK with nothing run; an executor throw is recorded (SPEC.md § 16.9) |

## Case shape

```json
{
  "id": "p4-missing-required-fact",
  "principle": [4],
  "description": "A required fact that is absent is BLOCK required_facts, never a default and never permission.",
  "rulebookRef": "rulebooks/tiny.json",        // or "rulebook": { ...a compiled rulebook... }
  "request": { "participant": {...}, "action": "go", "areaId": "floor", "facts": {...} },
  "expect": { "decision": { ... } }
}
```

A case marked `client: true` is one a client must pass (SPEC.md § 14); `loadCases(fs, path, dir, { client: true })` and `run-node.mjs --client` select them. `expect` has exactly one of:

| Expectation | Inputs | Your implementation must |
|---|---|---|
| `decision` | `rulebook`, `request` | `evaluate(rulebook, request)` — the pure evaluator, which verifies nothing — and match as below |
| `verifiedDecision` | `rulebook`, `request` | `verifyAndEvaluate(rulebook, request)` — verify every signed approval in `facts.approvedBy` against the rulebook's trusted keys, pass the verified handles to `evaluate` — and match as below |
| `plan` | `rulebook`, `plan` | `evaluatePlan(rulebook, plan)` and match as below |
| `verifiedPlan` | `rulebook`, `plan` | `verifyAndEvaluatePlan(rulebook, plan)` (the same, for every step's facts and the initial facts) and match as below |
| `findings` | `rulebook` | `check(rulebook)` and report exactly these findings, in any order, each with a valid witness where the reference has one; your `matches` must agree with the reference on every reference witness |
| `error: true` | `rulebook` | reject the rulebook at validation (any message; `note` shows the reference's) |
| `canonical`, `fingerprint` | `value` | produce exactly this canonical JSON text and this fingerprint |
| `sha256` | `text` | produce exactly this SHA-256 of the UTF-8 bytes of `text` |
| `verify: { ok }` | `approval`, `trustedKeys` | `verifyApproval` returns this `ok` |
| `rulebookSignature: { ok }` | `rulebook`, `signature`, `publicKey` | `verifyRulebookSignature` returns this `ok` |
| `backtest` | `rulebook`, `events`, `options?` | `backtest(rulebook, events, options)` equals this report exactly (SPEC.md § 13) |
| `comparison` | `rulebook`, `proposed`, `events`, `options?` | `compareBacktests(backtest(rulebook, …), backtest(proposed, …))` equals this exactly |
| `enforcement: { status, executed, limits?, reasons?, error? }` | `rulebook`, `call`, `session`, `harness` | run `call` through the tool-call adapter with a session on this rulebook, a harness built from the `harness` data (scope, facts, approvals, now, consumed nonces, history, an optional `fault`) and a spy executor: the outcome's status, whether the executor ran (and how often), the limits it received, the reason IDs and the recorded error stage must match (SPEC.md § 16.9) |

A case may also carry `forbidKeys`: the full decision (or plan evaluation, or adapter outcome) as JSON must contain none of those keys anywhere — used to prove a decision never carries an approval's `signature` or key material.

**`/1` cases** (`d1`–`d6`, rulebooks `desk`, `desk-signed`, `desk-mission`) use the same shapes with `/1` words: requests carry `principal`, `tool`, `scope`, `args`, `delegation`; approval requests are compared on `ruleId`, `by`, `rulebookFingerprint`, `principalId`, `participantId`, `tool`, `scope`, `argsDigest`, `setBy`; `approvalsRejected` as an ordered list of `{ id, nonce, code }` (`reason` free); plan steps on `tool`, `scope`; the plan's `finalScope`.

The first entry of `approvals.json` (`approvals-test-keys`) lists the TEST ONLY private seeds behind every signature in that file, so you can reproduce the signatures, not just verify them.

## Comparison rules

Every comparison is **deep semantic equality**: objects by key set and values in any order, arrays by position, numbers by value. Nothing depends on the order of keys in the JSON.

**Decision.** Compare these and only these:

- `status` — exact.
- `reasons` — an ordered list; each entry compared on `ruleId`, `status`, `setBy`. The `reason` text is free-form and never compared.
- `trace` — same, ordered.
- `limits` — deep-equal when present; must be absent when the expectation has none.
- `then` — exact when present; absent otherwise.
- `approvalRequests` — ordered list compared on `ruleId`, `by` (absent means absent), `rulebookFingerprint`, `participantId`, `action`, `areaId`, `setBy`. `reason` is free-form.
- `approvalsUsed` — deep-equal when present; absent otherwise.
- `fingerprint` — exact.

**Plan.** `status`, `finalArea`, `finalFacts` (deep), `planDigest`, `approvalsUsed` (deep), `fingerprint` — exact. `steps` — ordered, each on `index`, `action`, `areaId` and its `decision` compared as above (the step's `facts` and `note` are not compared). `planChecks` — ordered, on `ruleId`, `status`, `setBy`, `stepIndex`. `firstViolation` — on `stepIndex`, `ruleId`, `setBy`, `from`; absent means absent. `approvalRequests` — as for a decision.

**Findings.** Compare as a multiset of `{ kind, severity, ruleIds, certainty }` plus whether a `witness` is present. `ruleIds` keeps its order and must equal the expected pair exactly (the reference puts the looser or narrower rule first, as the spec says; `unmatched_selector` has one). `message` is free-form. A **witness** is judged for validity, not equality: the runner calls your `matches(rulebook, witness)` — the matching relation of SPEC.md § 6 step 4 on its own, returning the IDs of every rule the request matches — and both of the finding's rules must be in it. Your `matches` is then checked for soundness: for every witness in the expectation, `matches(rulebook, thatWitness)` must equal the reference's recorded `witnessMatches` as a set — so a `matches` that returns every rule, or echoes the finding's pair, fails. If you do not provide `matches`, your witness must equal the reference's exactly (SPEC.md § 7.4 says how the reference chooses).

**Error.** Validation must fail; the reason is yours.

**Canonical JSON, SHA-256 and fingerprint.** Byte for byte (SPEC.md § 8).

**Backtest and comparison.** Deep-equal on the whole report or comparison: neither carries free text, and every list has a defined order (SPEC.md § 13).

## The loop

```
for each file in conformance/*.json (alphabetical):
  for each case in file:
    rulebook = case.rulebook, or read case.rulebookRef relative to conformance/
    if   case.expect.decision:  compare project(evaluate(rulebook, case.request)) with case.expect.decision
    elif case.expect.verifiedDecision: compare project(verifyAndEvaluate(rulebook, case.request)) with case.expect.verifiedDecision
    elif case.expect.plan:      compare project(evaluatePlan(rulebook, case.plan)) with case.expect.plan
    elif case.expect.verifiedPlan: compare project(verifyAndEvaluatePlan(rulebook, case.plan)) with case.expect.verifiedPlan
    elif case.expect.findings:  compare sort(project(check(rulebook))) with sort(case.expect.findings);
                                for each finding with a witness: assert both ruleIds ∈ matches(rulebook, witness);
                                for each expected finding with a witness: assert set(matches(rulebook, witness)) == set(witnessMatches)
    elif case.expect.error:     assert validate(rulebook) reports at least one problem
    elif case.expect.canonical: assert canonical(case.value) == expect.canonical and fingerprint(case.value) == expect.fingerprint
    elif case.expect.sha256:    assert sha256(utf8(case.text)) == expect.sha256
    elif case.expect.verify:    assert verifyApproval(case.approval, case.trustedKeys).ok == expect.verify.ok
    elif case.expect.rulebookSignature: assert verifyRulebookSignature(rulebook, case.signature, case.publicKey) == expect.rulebookSignature.ok
    elif case.expect.backtest:  assert backtest(rulebook, case.events, case.options) == expect.backtest
    elif case.expect.comparison: assert compareBacktests(backtest(rulebook, case.events, case.options), backtest(case.proposed, case.events, case.options)) == expect.comparison
```

`project` keeps the compared fields above and drops the rest. The reference loop is [`compare.mjs`](compare.mjs) (plain JavaScript, 100 lines); [`run-node.mjs`](run-node.mjs) runs it against the built package with no test framework:

```bash
npm run build && node conformance/run-node.mjs
node conformance/run-node.mjs --client    # the client subset only
node conformance/validate-schemas.mjs     # every case input and reference output against spec/*.schema.json, and the inputs each schema must reject
```

**Which cases a client needs** (evaluate, fingerprint verify, approval verify, plans): every case marked `client: true` — the `decision`, `verifiedDecision`, `plan`, `verifiedPlan`, `error`, `canonical`/`fingerprint`/`sha256`, `verify` and `rulebookSignature` cases, including `versions.json` and `integrity.json`. The `findings`, `backtest` and `comparison` cases are for authoring tools (SPEC.md § 14). `node conformance/run-node.mjs --client` runs the client subset against `dist/`.

To run the cases against your own implementation from Node, copy `run-node.mjs` and replace `impl`. From another language, port the loop; the comparison rules above are the whole contract.

## Adding a case

Any behaviour change to the reference needs a case. Add it to `generate.ts` in the function for its principle, stating the intent by hand (status, reason rule IDs and authorities, findings, or `error`), run `npx tsx conformance/generate.ts` (it refuses to write a case the implementation does not meet), review the diff of the JSON, and run `npm test`.
