# AGENTS.md — for people and coding agents working in this repo

Two formats, one engine. `neuroverse-governance/1` is the general contract (AI agents calling tools in scopes under a principal's authority, SPEC.md § 16); `robot-domain-rules/3` is the robotics dialect (actions in areas, SPEC.md § 1–15). Both are decided by one `evaluate`, one `evaluatePlan`, one conflict check and one backtest, through the dialect table in `src/model.ts`. The robotics dialect is robot-domain-rules 0.5.3 unchanged: its 261 conformance cases are byte for byte the published ones, and a change that alters any of them is a regression unless SPEC.md § 11 gets an erratum line and the change is additive.

## The invariants you must keep

[PRINCIPLES.md](PRINCIPLES.md) is the contract. Each principle is enforced by conformance cases in both formats, and any change that breaks one is a bug, not a redesign. In one line each:

1. **Every rule carries a declared authority.** `source` and `setBy` on every rule; the engine invents nothing; a rule from an agent or a system is weighed by `setBy`, never by who wrote it; a mission's rules carry the authority `plan`, below every declared one.
2. **Authority is declared, layered, and only tightens.** `authorities` highest first; a lower level can only tighten; `authority-override` is named and has no effect; approvals must hold what `wait.by` names; a mission has no `allow`; a delegate's authority never grows.
3. **AI writes and proposes; the rulebook decides.** No model and no clock in `evaluate.ts`, `plan.ts`, `check.ts`, `compile.ts`, `governance.ts`, `backtest.ts`; the structured `then` decides, never prose; a draft's `setBy` comes from the caller, never from the model. A plan is checked step by step on projected facts and by `planRules`; it is never written here. The model's text about its intent is not an input anywhere.
4. **Unknown means no; a missing fact is never a yes.** `/3`: `required_facts`, `area_declared`, `role_declared`, `role_permits_action`, `unknown_action`. `/1`: `required_facts`, `args_wellformed`, `scope_declared`, `role_declared`, `scope_permits_tool`, `role_permits_tool`, `unknown_tool`, `delegation_exceeds_authority`. Only declared defaults are filled in; history is the caller's and a rule that needs it and does not get it refuses; a projected fact out of range refuses, never clamps; an undeclared, missing, mistyped or doubly-supplied argument is `args_wellformed` before any rule is weighed.
5. **Every decision explains itself.** `reasons`, `trace`, `setBy`, `limits`, `then`, `fingerprint`; RFC 8785 canonical JSON and the SHA-256 fingerprint (over UTF-8, findings excluded) are reproduced byte for byte; a `/1` PAUSE that rejected approvals carries `approvalsRejected: [{ id, nonce?, code, reason }]` — those four members and nothing else, never the approval, its signature or key material.
6. **Waiting has two meanings, and approval is not a fact.** Approval waits return `approvalRequests` and are cleared by a sufficient approval; condition waits are cleared only by facts. With `trustedKeys` declared, only the verified handle `verifyApproval` returned (`src/verified.ts`; a `verified` member in request data is ignored) counts, bound to the rule, the rulebook fingerprint and — `/3` — the participant, action and area, or — `/1` — the principal, participant, tool, scope and `fingerprint(args)`, valid at `request.now`, with a nonce not in `consumedApprovals`; it clears that wait only, each approval clears at most one wait, a plan consumes nonces step by step. **A rejected approval is a PAUSE with a code, never a BLOCK.** Facts, `now`, `history`, the scope, the delegation chain and the approvals come from the harness, never from the requester.
7. **Conflicts are surfaced, never quietly resolved.** Eight finding kinds (`unmatched_selector` is on one rule, no witness); exact for the rule language on reachable requests, with a `witness` on every certain finding between two rules, in the rulebook's own words (tools and scopes for `/1`); "possible" only for history conditions; compile never hides findings and `validateRulebook` re-derives them. The Z3 cross-check (`test/z3-crosscheck.test.ts`) must keep agreeing on every pair.
8. **One law for everyone.** Robots, people and agents, both formats, through one `evaluate`; selectors by ID, kind, tag and exclusion; area and scope role limits as re-derived never rules; a subagent may use a tool only if its own role and every role in the chain list it, and a mission binds delegates (`who: "*"`).
9. **Rules say what may happen; evidence says what is true.** Facts are trusted; this is not a safety system and not a judge of text ([BOUNDARY.md](BOUNDARY.md)). The adapter runs the executor only on ALLOW or LIMIT, with the limits; anything that fails before it is a BLOCK with nothing run and the reservation and nonce claims given back; every nonce the decision used is claimed atomically (`consumed.claim`) before the executor, so two concurrent calls with one approval cannot both run; once the executor has been invoked a throw is an uncertain outcome (`outcome: "uncertain"`): spend committed, nonces consumed, history appended, `harness.reconcile` told — never a release, never an un-consume; the arithmetic behind a cumulative limit (reserve, commit, release) is the harness's, and the engine only compares.

Plus the mechanical ones: rulebooks are deep-frozen all the way down and detached from their input; bad config throws `DomainRulesError`, a bad request or plan never throws (SPEC.md § 15); **versions are explicit**: a rulebook, fingerprint or approval of another format is refused by name at every door (`src/version.ts`, SPEC.md § 11, § 16.10), never reinterpreted — `/3`-only doors (glasses, render, draft, templates, `legacy.ts`, `compileDomain`) refuse `/1`, `compileMission` and the adapter refuse `/3`, a `/3` approval at a `/1` rulebook and the reverse are rejected by `spec`; the glasses bridge only tightens; `normalizeRulebook` returns a `/3` rulebook as the same object, so the robotics path runs the code it always ran; `compileMission` refuses a rulebook that already carries a mission or declares a `plan` authority.

**Deprecated:** `src/legacy.ts` (the 0.2 robotics input shape) is carried unchanged in 1.0 and will be removed at 1.1 together with its tests, its example (`examples/legacy-store-0.2.ts`) and its cases. Do not extend it.

## Any behaviour change needs a conformance case

If a change alters what `evaluate`, `evaluatePlan`, `verifyAndEvaluate`, `verifyAndEvaluatePlan`, `matchingRules`, `missingFacts`, `bindArgs`, `check`/`checkRulebook`, `validateRulebook`, `compileGovernance`, `compileMission`, `fingerprint`, `backtest`, `compareBacktests`, `govern` or the approval functions return for any input, it needs a case in [`conformance/`](conformance/) — that is how other implementations learn about it. Add it to `conformance/generate.ts` in the function for its principle or its `d` file, stating the intent by hand (status, reason rule IDs with authorities, finding kinds, rejection codes, `executed`, or `error`); run `npx tsx conformance/generate.ts` (it refuses to write a case the implementation does not meet); read the JSON diff — **a `/3` case whose bytes changed is a finding to report, not a diff to accept**; run `npm test`. Update [SPEC.md](SPEC.md) in the same change. A change that alters a decision, finding, fingerprint or signature for an existing valid rulebook is a spec major bump (SPEC.md § 11); an addition that widens what a valid input may say and changes no existing output is an erratum line in § 11 with its pinned cases.

## The contract, briefly

**`/1` request** (SPEC.md § 16.3): `{ principal: { id }, participant: { id, kind, roleId, delegatedBy? }, delegation?: [{ id, roleId }], tool, scope, args?, facts: { ...harness facts, approvedBy? }, history?: [{ tool, scope, at }], now?, consumedApprovals? }`. `args` is the payload as the adapter parsed it; its declared fields become facts (§ 16.4); everything else is the harness's.

**`/1` decision**: as `/3` with `approvalRequests[] = { ruleId, by?, rulebookFingerprint, principalId, participantId, tool, scope, argsDigest, reason, setBy }` and `approvalsRejected?`. Codes: `spec, unverified, rule, rulebook, principal, participant, tool, scope, args, replayed, window_malformed, no_now, not_yet_valid, expired, insufficient, spent` (§ 16.6).

**`/1` signed approval** (`neuroverse-governance-approval/1`): `{ spec, id, authority?, roleId?, ruleId, rulebookFingerprint, principalId, participantId, tool, scope, argsDigest, nonce, issuedAt, expiresAt, keyId, signature }`.

**Mission** (`neuroverse-governance-plan/1`, § 16.7): `{ format, id, objective, permitsRuleId?, permits: [{ id?, tool, scopes? }], approvals?: [{ id?, tool, scopes?, by }], order?: [{ id?, first, then }], atMost?: [{ id?, tools, count }], requires?: [{ id?, tools }] }` → `compileMission(rulebook, mission)` → a new rulebook with the authority `plan` last, `mission: { id, objective, planDigest }`, and deny/wait/history rules plus `at_most`/`at_least` plan rules at `setBy: "plan"`.

**Adapter** (§ 16.9): `govern(call, session, harness, executor) → Governed { status, executed, decision, request?, result?, error?: { stage, message }, callId? }`. Adapter checks, `setBy: "adapter"`, never in a rulebook: `tool_call_malformed`, `harness_failed`, `evaluation_failed`. The reference harness is in-memory (`SpendLedger.reserve(bucket, amount) → { projected, commit, release }`, `NonceSet`, `HistoryStore`); production replaces the stores and keeps the contract.

**`/3` request**: `{ participant: { id, kind, roleId }, action, areaId, facts, history?: [{ action, areaId, at }], now?, consumedApprovals? }`. **Decision**: `{ status, reasons, limits?, then?, approvalRequests?, approvalsUsed?, trace, fingerprint }`, strictest wins (`BLOCK` > `PAUSE` > `LIMIT` > `ALLOW`), SPEC.md § 6. **Plan**: § 12 (`plan_area_continuity` is `/3`-only; a `/1` step lands in its own scope). **Signed approval** (`robot-domain-rules-approval/3`): § 9. **Rule**: `{ id, text, who, does, where, when?, history?, then, reason?, source, setBy, never? }`; **plan rule** `check.kind ∈ ends_in | ends_with | before | at_most | at_least`. **Finding**: `{ kind, severity, ruleIds, certainty, witness?, message }`. **Backtest** (§ 13, § 16.11): `backtest(rulebook, events: [{ at, request, outcome? }])` → a report with no free text and every list in a defined order (`byArea` or `byScope`); `compareBacktests(baseline, proposed)`.

## Files, in read order

| File | Read it for |
|---|---|
| `src/types.ts` | **First.** Every type, both formats (`Governance*` types beside the `/3` ones). |
| `src/model.ts` | The dialect table (`DOMAIN_DIALECT`, `GOVERNANCE_DIALECT`), `normalizeRulebook` (a `/3` rulebook is returned as itself; a `/1` rulebook is viewed with tools as actions and scopes as areas), the builtin lists, the in/out renamers for rules, history conditions, plan rules, witnesses and compile inputs. |
| `src/version.ts`, `src/verified.ts` | The one refusal every door gives another format (`Accepts: 'any' | 'domain' | 'governance'`); the verified-approval registry (object identity, never a flag). |
| `src/vocabulary.ts` | Selectors, fact validation, conditions, and the exact constraint sets the conflict check uses. |
| `src/compile.ts` | Input → rulebook: templates, validation, role inheritance, area/scope never rules, `validateRule`, `validateRulebook` (re-derives the never rules and the findings for both formats), freezing. |
| `src/governance.ts` | `compileGovernance` (the `/1` input through the same assembler and check, the `/1`-only declarations validated, the body renamed back and fingerprinted), `governanceInputOf`, `compileMission`, `validateMission`, `PLAN_AUTHORITY`. |
| `src/canonical.ts` | RFC 8785 canonical JSON (lone surrogates and non-JSON values refused), pure SHA-256, `fingerprint` — what other languages reproduce. |
| `src/evaluate.ts` | One request → one decision for both formats: shape (`shapeProblems`: principal, delegation), `bindArgs` (step 1b), the delegation walk (step 4b), approval binding for `/3` (`approvalBound3`) and `/1` (`approvalBound1`, the rejection codes), sufficiency, history conditions; `matchingRules` and `missingFacts` for witnesses and the backtest. |
| `src/plan.ts` | One plan → one evaluation: effects projected step by step, plan rules (`at_most`, `at_least`, …), approvals consumed step by step; a `/1` step in its own scope. |
| `src/check.ts` | The conflict check: exact overlap on reachable requests with a witness, classification, unmatched selectors, plain-English messages in the rulebook's own words; plan-rule duplicates. |
| `src/backtest.ts` | A recorded log replayed through a rulebook, both formats: the report and the current-versus-proposed comparison. Uses `evaluate`, `matchingRules`, `missingFacts` and the rulebook's findings; adds no semantics of its own. |
| `src/approvals.ts` | Ed25519 via WebCrypto: sign/verify `/3` and `/1` approvals (`signApproval`, `signGovernanceApproval`, `verifyApproval` branching on `spec`) and rulebooks; `verifyAndEvaluate`, `verifyAndEvaluatePlan`. Zero dependencies. |
| `adapters/tool-call/index.ts` | `govern`: parse → scope → facts → derived facts → reserve → verify approvals → request → `evaluate` → act; the fail-closed table of SPEC.md § 16.9; `ADAPTER_CHECKS`. |
| `adapters/tool-call/reference-harness.ts`, `case-harness.ts` | `referenceHarness` with `SpendLedger` (synchronous reserve/commit/release), `NonceSet`, `HistoryStore`, declared ledgers and derived-fact tables; `harnessFromData` builds a harness from the JSON a `d6` case carries. |
| `src/draft.ts`, `src/render.ts`, `src/glasses.ts`, `src/zone-rules.ts`, `src/legacy.ts`, `src/templates/` | The robotics dialect's tooling: deterministic text drafting and the model prompt/answer validation; rendering; the glasses bridge; the 0.2 input shape (deprecated); the two shipped templates. All `/3`-only doors. |
| `src/index.ts` | Public exports (engine, adapter, reference harness) and `DomainRulesBuilder`. |
| `spec/` | JSON Schemas, draft 2020-12: the `/3` set and `governance-{rulebook,request,decision,plan,approval,backtest}.schema.json`, `tool-call.schema.json`. |
| `conformance/` | The cases (`p*`, `plans`, `history`, `backtest`, `fingerprint`, `approvals`, `versions`, `integrity` for `/3`; `d1`–`d7` for `/1`; `client: true` marks the client subset), `rulebooks/` (`tiny`, `shared`, `grocery`, `signed`; `desk`, `desk-signed`, `desk-mission`), `compare.mjs` (the judging rules, deep semantic equality, `matches` soundness, `enforcement`), `run-node.mjs` (`--client`), `validate-schemas.mjs` (every case against `spec/`, plus inputs each schema must reject), `generate.ts`. |
| `acceptance/invoice-reconciliation/` | The engine-independent scenario: `rules.json`, `plan.json`, `transcript.jsonl` (28 calls with hand-authored verdicts), `expectations.md`, `run.ts` (through `govern` and a harness written for that business), `backtest.ts` (the log under the current and a proposed rulebook), `generate.ts`. The fixture is the contract; `run.ts` never edits it. |
| `test/domain-rules.test.ts` | One test per `/3` behaviour, plus the seeded exactness test. `test/tool-call-adapter.test.ts`: the adapter, including the concurrent-reservation proof. `test/conformance.test.ts` runs every case. `test/z3-crosscheck.test.ts` agrees with Z3 on every generated pair (z3-solver is a devDependency only). Do not add test files without being asked. |
| `examples/` | Robotics: `grocery-store.ts`, `warehouse.ts`, `clinic.ts`, `demo.ts`, `harness/` (volumes adapter, the robot replay, the planner replay), `backtest/` (the sample site, a synthetic week), `mcp/` (a `/3` MCP server, its own package), `legacy-store-0.2.ts`. |
| `docs/provenance/` | How the engine came to be: `PROVENANCE.md` (the byte-for-byte copy from robot-domain-rules), `robot-domain-rules-CHANGELOG.md` (0.1–0.5.3). The design record is SPEC.md § 16.12; the cut record is CHANGELOG.md. |

## How to extend

- **A tool, scope, role, fact, limit, authority or trusted key (`/1`); an action, area, role, fact, limit, authority or trusted key (`/3`):** declare it in the input. No code change.
- **A `/1` builtin check:** `src/model.ts` (`GOVERNANCE_BUILTIN_CHECKS`, the dialect), `src/evaluate.ts` (where in the order it runs — the order is normative, SPEC.md § 6 and § 16.4–16.5), `spec/governance-rulebook.schema.json` (`builtin`), the `desk*` rulebooks regenerated, SPEC.md § 16.1's table, a `d` case per outcome.
- **A rejection code:** `src/types.ts`, `src/evaluate.ts` (`approvalBound1`: the order of checks is the order of the table in § 16.6), `spec/governance-decision.schema.json`, a `d3` case.
- **An adapter check:** `adapters/tool-call/index.ts` (`ADAPTER_CHECKS`; `setBy: "adapter"`; never in a rulebook), the § 16.9 table, a `d6` case with `executed: false`.
- **A mission entry kind:** `src/governance.ts` (`validateMission`, `compileMission`: compile it to rules the engine already has — deny, wait, history, plan rules — never to new semantics), `spec/governance-plan.schema.json`, the § 16.7 table, `d5` cases including one that shows it cannot loosen.
- **A fact type or condition operator (both formats):** `types.ts`, then `vocabulary.ts` (`factProblem`, `validateCondition`, `conditionHolds`, and a constraint with exact `intersect`, `isSubset`, `isEmpty` and `witnessValue`), `render.ts`, `draft.ts`; SPEC.md § 3.2, § 7.1 and § 7.4; conformance cases proving overlap is still exact; encode it in `test/z3-crosscheck.test.ts` so Z3 keeps agreeing.
- **An effect or a plan-rule kind (both formats):** `types.ts`, `compile.ts` (`validateEffects` / `validatePlanRule`), `plan.ts`, `render.ts`, `model.ts` (`planRuleIn/Out`), `spec/common.schema.json`; SPEC.md § 2.1 / § 3.5 / § 12 and § 16.1; cases in `plans.json` and `d5-plans.json`.
- **A template (`/3`):** `src/templates/<id>.ts` exporting a `Template` (first option of every question is the safe one; each question names its `setBy`), registered in `src/templates/index.ts`, with an example and one test.
- **A text pattern (`/3`):** `draft.ts` only. Deterministic; keep `unmatched` honest.
- **A harness for a real deployment:** implement `Harness` (`adapters/tool-call/index.ts`) over your stores; keep `reserve` and `consumed.claim` atomic (a transaction or a conditional insert), implement `reconcile` for uncertain outcomes, and keep `facts`/`derive` yours; never let the requester's payload reach `facts` except through declared `args`. Prove it with the `d6` cases through `harnessFromData`'s shape, or with your own tests.

## Commands

```bash
npm install
npm run typecheck                  # tsc --noEmit (src, adapters/tool-call, examples except mcp, test, conformance/generate.ts; acceptance/ runs under tsx)
npm test                           # vitest run --dir test — core, adapter, Z3 cross-check, every conformance case
npm run build                      # tsup → dist/ (esm, cjs, d.ts)
npm run conformance                # node conformance/run-node.mjs — every case against dist/, no framework (--client for the client subset)
npm run conformance:schemas        # every case input and reference output against spec/*.schema.json (needs dist/)
npm run acceptance                 # the invoice scenario through govern and the reference harness: 28/28 or a non-zero exit
npm run acceptance:backtest        # the scenario's recorded log under the current and the proposed rulebook
npm run demo                       # tsx examples/demo.ts; add -- --json to write <site>.rules.json
npm run replay && npm run plan-replay && npm run backtest     # the robotics replays and the synthetic-week backtest
npm pack --dry-run                 # what ships (package.json "files")
# Releases: never `npm publish` from a machine. Only .github/workflows/publish.yml publishes (npm trusted publishing over OIDC,
# trusted publisher owner NeuroverseOS / repository neuroverseos-governance / workflow publish.yml; no token, no secret); it is the founder's to run.
cd examples/mcp && npm install && npm run typecheck
```

Run typecheck, test, build, the conformance runner, the schema validation, the acceptance scenario and its backtest before you say a change is done (`.github/workflows/ci.yml` runs all of them and `npm pack --dry-run`); the MCP example's typecheck if you touched `examples/mcp/` or anything it imports. `npm run conformance:generate` rewrites the case files from the implementation: read the diff; a `/3` case whose bytes changed is a regression to report, not a change to commit.

## Working rules

- Stage explicit paths (`git add <path>`), never `-A`, `-u` or `.`; read `git diff --cached --name-only` before every commit.
- Extend an existing test file; new test files and CI workflows need to be asked for.
- A `/3` behaviour that robot-domain-rules 0.5.3 has is not changed here without an erratum line in SPEC.md § 11 and pinned cases, and only additively. The upstream repository is never edited from here.
- No model call, and no paid API, anywhere in `src/`, `adapters/`, `conformance/`, `acceptance/` or `test/`.

## Do not build here

- **A judge of text.** Nothing reads the model's message, intent or reasoning. A classifier's verdict may enter as a derived fact the harness computes; it is never computed here.
- **A store, a clock, a ledger or a live feed for production.** The reference harness's in-memory `SpendLedger`, `NonceSet` and `HistoryStore` are the contract's shape, not a product; facts, `history`, `now` and `consumedApprovals` arrive in the request, the arithmetic is the harness's, a plan's clock is the plan's, a backtest's times come from its log.
- **Area geometry, localisation, membership, people counting, identity, sensors, maps.** The surrounding system owns that.
- **An explanation of why things happened.** A backtest applies rules to recorded requests and reports the decisions; reading evidence across sources is for an evidence system.
- **A planner.** `evaluatePlan` checks a plan it is handed and `compileMission` tightens a rulebook for one; neither searches for a plan.
- **A model call anywhere in the core.** `buildRuleDraftPrompt` / `parseRuleDraft` are the whole model surface.
- **A key store or HTTP service.** Key custody is the deployment's; expiry is in the approval and judged against the caller's `now`.
- **A CLI.** 1.0 ships none (`bin` is absent). If one returns it is built on the one evaluator and the adapter, and asked for first.
- **A second evaluator or a second decision path.** A new format is a dialect in `src/model.ts` and gated steps in the one evaluator, or it is not built.
