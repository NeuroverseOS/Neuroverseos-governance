# Boundary: what this layer is, is not, and defends against

## What it is

Task- and permission-level authorization for robots, AI agents and people wearing glasses in a shared physical space. One question in — *may this participant do this action, in this area, given these facts?* — and one answer out: `ALLOW`, `LIMIT` (with the ceilings), `PAUSE` (for a person, or for the situation to change) or `BLOCK`, with the rules that decided, the authority behind each, and the fingerprint of the rulebook that was in force. The same question over a whole plan: every step checked on the facts the earlier steps leave behind, as far as the site declared what its actions do, plus the rules the site set about plans as a whole.

It sits between the thing that proposes an action (a planner, an agent, a wearer, a fleet manager) and the thing that executes it (a robot controller, a glasses runtime, an agent harness). It is called before the action, with facts the surrounding system already knows.

## What it is not

- **Not motion control.** It never computes a path, a velocity or a stop. A `LIMIT` is a ceiling the controller enforces; a `BLOCK` is a refusal the controller honours. How the robot slows or stops is the controller's business.
- **Not a safety system.** It is not a safety PLC, not a safety-rated stop, not a navigation stack, and it does not replace ISO 10218, ISO 3691-4, ISO 13482 or any certified safety function. Those stay in charge of physical safety and act whether or not this layer is consulted. This layer decides *permission*; a correct permission does not make an unsafe motion safe.
- **Not a sensor, a map or a clock.** It does not locate anything, count anyone, or know what time it is. Every fact arrives in the request.
- **Not a model.** No AI is inside the decision. Models may draft rules, propose plans and explain decisions outside it.
- **Not a planner.** It checks the plan it is handed and predicts only the declared effects; it does not search for a plan, re-order steps, or know what an action does beyond what the site wrote down.

## Integration rule #1: facts come from the harness, never from the requester

The agent, robot or wearer that asks says who it is and what it wants to do. Everything else in the request — the area, every fact, `history`, `now`, `consumedApprovals` — is assembled by the caller's trusted layer (the harness, the spatial system, the fleet manager) from its own sources. A requester that could supply its own facts could talk the rulebook into anything. One thing the request cannot carry at all: that an approval was verified. Nothing in request data asserts it (a `verified` member is ignored); only the object `verifyApproval` returned counts, and only the trusted layer holds one. [`examples/mcp/`](examples/mcp/) shows the shape: the tool takes `participant` and `action` only; the server fills in the rest from a stub harness.

## What it trusts

- **The facts in the request.** Where the participant is, how many people are there, whether an alarm is active, what time it is (`now`): the layer takes these as true. The trusted layer that assembles the request is the fact source. The same for `history` (what the participant did recently) and, in a plan, for the planner's description of the steps and the facts it expects — a plan verdict is a verdict on the plan as described; each step is asked again on the facts current when it comes up.
- **The rulebook it was handed.** It checks the rulebook's declared version, structure and fingerprint, and can verify a signature with a key you pin outside the rulebook. It cannot know whether the rulebook is the one the space meant to be in force; that is deployment's job.
- **Verified approvals.** When a rulebook declares `trustedKeys`, the caller's trusted layer verifies an approval's Ed25519 signature *before* evaluation (`verifyApproval`, or `verifyAndEvaluate` which does both) and passes the verified handle in — the very object `verifyApproval` returned. The evaluator checks that it is that object (not a copy, not data with a flag), is a `/3` approval bound to this rule, this rulebook's fingerprint, this participant, this action and this area, is within its validity window at `now`, has a nonce not in the caller's consumed set, and holds what the rule names. It does not re-verify the signature (evaluation is synchronous and pure); given request data alone it clears nothing and says to use `verifyAndEvaluate`. An approval clears only that rule's wait, and at most one wait; every other check runs on the facts current now. **Without `trustedKeys`** a plain `{ id, authority }` is accepted and the approver's authority is self-declared — nothing checks it. That is the development path, not a defence.

## What it protects against

| Threat | Defence | Proved by |
|---|---|---|
| An action nobody wrote a rule for slips through | Unknown action, area, role or kind is a refusal, or a wait if the space chose so; never permission | `conformance/p4-*` |
| A missing or malformed fact reads as "safe" | `required_facts` BLOCK; only declared defaults are ever assumed | `conformance/p4-*` |
| A site, a staff member or a vendor loosens what law or the company set | Lower authority may only tighten; overrides are reported and have no effect | `conformance/p2-*` |
| Someone approves who may not | **With `trustedKeys`:** the approval must be signed by a key trusted for the authority or role it claims, and hold the named authority (or higher), role or tag; an undeclared authority is an invalid fact. **Without `trustedKeys`** the authority is self-declared and this row does not hold (development only) | `approvals-verify-overclaim`, `approvals-verified-but-insufficient`; the plain-approval mechanics in `conformance/p2-*`, `p6-*` |
| A forged approval (once the space declares trusted keys) | Ed25519 signature under a key trusted for that authority/role, verified in the trusted layer; the evaluator accepts only the object that verification returned, so an unsigned object marked `verified: true`, a bogus signature, or a valid approval passed to the pure evaluator clear nothing | `conformance/approvals.json` (`verify-forged`, `verify-untrusted-key`, `verify-overclaim`, `unsigned-verified-flag-clears-nothing`, `unsigned-verified-flag-clears-nothing-via-trusted-layer`, `bogus-signature-does-not-clear`, `forged-with-flag-does-not-clear`, `evaluate-alone-never-clears`, `unverified-does-not-clear`) |
| An approval re-used for another rule, participant, action, area or rulebook | The approval names all five; any mismatch and it does not apply | `approvals-other-*`, `approvals-other-rulebook-does-not-clear` |
| An approval used after it should have lapsed | Required `expiresAt`, checked against the caller-supplied `now`; `issuedAt` in the future is refused too | `approvals-expired-is-refused`, `approvals-not-yet-valid-is-refused` |
| An approval replayed within its window | Single-use `nonce`; the caller passes the nonces it has acted on (`consumedApprovals`) and is told which were used (`approvalsUsed`); inside a plan the nonce a step spends is consumed for every later step, and each approval in a request clears at most one wait. **Across requests it holds only if the caller keeps that set** (KNOWN-GAPS.md) | `approvals-replayed-is-refused`, `approvals-plan-consumes-step-by-step`, `approvals-list-one-approval-cannot-clear-two-waits` |
| An approval used to override the facts | An approval clears only its rule's wait; a condition wait, a deny or a never rule on the current facts still decides | `approvals-facts-changed-condition-wait-still-holds`, `approvals-current-never-rule-still-blocks`, `approvals-current-deny-still-blocks`, `p6-approval-never-clears-condition` |
| A `/2` rulebook, fingerprint or approval read as if it were `/3` | Every artifact declares its version; older ones are refused by name with the migration at every door — validation, `evaluate`, `evaluatePlan`, the check, the backtest — and a `/2` approval is refused with or without trusted keys | `conformance/versions.json` (validation and evaluator cases), `approvals-verify-v2-approval-refused`, `approvals-v2-approval-does-not-clear`, `approvals-v2-approval-refused-without-keys` |
| Two rules disagree and the robot picks one in silence | Findings on every rulebook, strictest-wins at decision time, exact overlap on reachable requests; the reachability law (roles, unconditional never rules, always-true conditions) is cross-checked with Z3 on every generated pair | `conformance/p7-*`, `test/z3-crosscheck.test.ts` |
| A rule that names something no area, role or action carries (a mistyped tag, a `semantic_type` with different case) silently binds nothing | `unmatched_selector` warning on the rule, naming the near miss | `p7-unmatched-selector-is-a-finding` |
| A rulebook is altered in transit or at rest | Two layers, and they protect different things. **Validation** (`validateRulebook`) catches an accidental change to anything the fingerprint covers (fingerprint mismatch) and a deliberate change to the two derived parts even with the fingerprint recomputed — the area role-limit never rules and the findings are re-derived and compared. It cannot catch a deliberate change to the rules themselves with the fingerprint recomputed: that is what a **pinned Ed25519 rulebook signature** (`verifyRulebookSignature` with a key held outside the rulebook) catches, and only it. Deploy with both | `conformance/fingerprint.json`, `integrity.json`, `approvals-rulebook-signature-*` |
| A decision cannot be audited later | Every decision cites rule IDs, authorities, the full trace and the rulebook fingerprint | `conformance/p5-*` |
| A plan that "teleports": a step in an area the plan never moved to | `plan_area_continuity` refuses the step | `conformance/plans.json` |

## What it does not protect against

- **Lying or broken fact sources.** If the spatial system reports zero people in an aisle with three in it, the decision is wrong and this layer cannot tell. Fact integrity is upstream.
- **Compromised signing keys.** A stolen approver key signs valid approvals. Key custody, rotation and revocation are outside the rulebook (replace the key in `trustedKeys` and re-sign the rulebook).
- **A trusted layer that lets the requester supply facts, or passes an approval it did not verify through `verifyApproval` as if it had.** The evaluator cannot tell where a fact came from; it can tell a verified handle from data, so a flag in the data is not a risk any more, but a trusted layer that calls `verifyApproval` against the wrong keys is. Only the harness should build requests.
- **A tampered rulebook with a recomputed fingerprint, where the deployment pins no signing key.** Validation catches tampering of the derived parts; a changed rule with a matching fingerprint passes validation. Pin a key.
- **A controller that ignores the decision.** Nothing here forces the robot to obey. Enforcement is the controller's; this layer only makes the right answer available and auditable.
- **Rulebook substitution with a valid signature.** If the deployment accepts any signed rulebook rather than one signed by its pinned key, a signed-but-wrong rulebook passes. Pin the rulebook signing key outside the rulebook.
- **A wrong clock.** Approval windows are judged against the `now` the caller supplies. No expiry is enforced on rulebooks themselves.
- **Denial of service, side channels, resource limits.** Evaluation is bounded by the rulebook size and pure, but nothing here rate-limits or isolates callers.

## Where each check belongs

| Check | Who does it | When |
|---|---|---|
| Is the robot physically safe to move? | Safety controller / PLC | Always, independently |
| Where is the participant? How many people are near? | Spatial system | Before the request is built |
| Is this rulebook the one in force? Is it unaltered? | Deployment: `validateRulebook` (format, structure, fingerprint, re-derived never rules and findings), `verifyRulebookSignature` with a pinned key (everything else) | When a rulebook is loaded — the evaluator refuses only the format on its own |
| Is this approval genuine? | Caller's trusted layer: `verifyApproval` against `trustedKeys` (or `verifyAndEvaluate`), passing the returned handle | Before evaluation, on each approval |
| Is this approval still valid, and unused? | This layer, from the caller's `now` and `consumedApprovals`; the caller records `approvalsUsed` | At evaluation; after acting |
| What did this participant do recently? What time is it? | Caller: `request.history`, `request.now` | Before evaluation |
| May this participant do this, here, now? | This layer: `evaluateDomainAction` | Before the action |
| May this whole plan run, step by step? | This layer: `evaluatePlan` | Before the first step; then each step again with `evaluateDomainAction` as it comes up, on real facts |
| Did the robot actually obey? | Controller and your audit of the decision log | After |
