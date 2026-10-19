# Changelog

Versions 1.x of `@neuroverseos/governance` are the engine generalised from [robot-domain-rules](https://github.com/NeuroverseOS/robot-domain-rules). Versions 0.x were a different engine; their code and history live on the branch [`legacy/main`](https://github.com/NeuroverseOS/neuroverseos-governance/tree/legacy/main) and their entries are kept at the end of this file. The two specifications are versioned separately from the package: `neuroverse-governance/1` (SPEC.md § 16.10) and `robot-domain-rules/3` (SPEC.md § 11).

## Unreleased

### Changed — live evaluation harness

- `finish_reason` is recorded per turn; a reply with no tool call and `finish_reason: length` ends the phase with stop reason `length` (the reply was cut off by the completion budget), counted apart from `no_tool_calls` in the report and shown in `--verbose` as `[finish: length]`; the default `max_tokens` is 8192 (was 1024), `EVAL_MODEL_MAX_TOKENS` overrides it, and the spend cap's pre-check uses the configured number as the worst case instead of a hard-coded 1024.
- Resilience and diagnostics, after the first live run died on an HTTP 500 with no report written: `httpModel` retries 429/500/502/503/504 and network errors with backoff or `Retry-After` (four retries; each attempt through the cap's pre-check; a failed attempt settles nothing) and then throws `ModelCallError`; a case whose model fails for good is recorded as a *model error* (own column in the report; never a pass, never a forbidden effect) and the run continues; the report is always written, on Ctrl-C or a harness exception too, with the cases completed so far and why it stopped. The JSON report carries every case's transcript (turns, text, tool calls, truncated results, decisions with reason IDs) and each case's stop reason and turn count, shown per case in the Markdown; `--verbose` prints one line per turn; `--attacks a,b` runs a subset.
- `httpModel` keeps a provider-specific `extra_content` returned with a tool call (as `ModelToolCall.extra`, opaque, per call) and echoes it back unchanged on the assistant message's `tool_calls` when the history is replayed; some providers reject the replay without it (the first live run failed on its second turn for this reason). The harness never reads it; the report omits it.
- `eval/live/prices.json` gains `gemini-3.5-flash` (1.5 / 9 USD per million tokens) at its standard-tier list price as reported by OpenRouter and several pricing trackers on 2026-10-19; the note says which rows come from which source and date, and that this one was not confirmed on the provider's own page.
- `httpModel` sends `temperature` only when one is given and never sends `top_p` (some providers reject non-default sampling values; rc.1's harness always sent `temperature: 0`); `tool_choice` stays `auto`. `eval/live/prices.json` gains three priced models from a provider's published first-party price list as of 2026-10-06 (the smallest at its higher-tier price, so the cap errs toward stopping early).

### Documentation

- README gains "Which should I use?": the relationship to robot-domain-rules (one package for software agents, or agents and robots together; robot-domain-rules alone for the physical-space rulebook only) and how the two repositories are versioned separately, with the conformance suite as the compatibility check and pull requests as the only path for changes in either direction.

### Added — live adversarial evaluation harness (`eval/live/`, not in CI, no run yet)

A sandbox small business with recorded effects, the invoice-reconciliation rulebook and mission (plus a `body` argument on `email.send` for the sandbox classifier), two arms over the same seed and task script (`gated` through `govern` with the reference harness; `ungated` as the baseline, sandbox only), eight named attacks in `eval/live/attacks/` (seven lures and a clean-day control; hashed into every report), a provider-agnostic `Model` with a deterministic `scripted` stand-in and an OpenAI-compatible `http` client over `fetch`, a hard spend cap enforced before every call from `EVAL_SPEND_CAP_USD` and `eval/live/prices.json` (no cap or no price: the run refuses to start; cap reached: the run stops and the report says so), and a Markdown + JSON report whose prose claims only what was observed on these attacks with this model on this date. `npm run eval:live`, `-- --dry-run`, `-- --model scripted`. A live run refuses to start without `EVAL_MODEL_API_KEY`, `EVAL_MODEL_BASE_URL`, `EVAL_MODEL` and the cap; none has been made. Tests in `test/tool-call-adapter.test.ts` run the stand-in through both arms on the full set with no network: the ungated arm performs every forbidden effect, the gated arm none, both complete the task, the cap stops a run, a missing key refuses one.

### Fixed — settlement at the execution boundary (an outside review of rc.1 found both)

Both defects are in `adapters/tool-call/index.ts`, around the executor call; the engine (`evaluate`) is untouched. Each was reproduced by a failing test before the fix (`test/tool-call-adapter.test.ts`, "settlement at the execution boundary").

- **Concurrent reuse of one single-use approval.** rc.1 consumed an approval's nonce only after the executor returned, so two concurrent `govern` calls carrying the same signed approval both evaluated against an empty consumed set, both got ALLOW, and both ran. Now every nonce in `approvalsUsed` is **claimed atomically** (`NonceSet.claim(nonce) → boolean`, a synchronous critical section like the ledger's `reserve`; `Harness.consumed` gains `claim` and `release`) after the decision and before the executor. A concurrent call finds the nonce taken, its decision is re-made with that nonce consumed — PAUSE with `approvalsRejected` code `replayed`, the same code a replayed nonce gets, since to that caller that is what it is — and nothing runs. A claim is released only when the call is refused before the executor is invoked, never after. Proof: test (a) — two concurrent calls, one approval: exactly one executes, the other PAUSEs `replayed`; test (c) — a refusal before execution releases the reservation and every claim; cases `d6-refused-call-claims-no-nonce`, `d6-refused-call-releases-reservation`.
- **An executor throw treated as a non-event.** rc.1 released the spend reservation and left the nonce unconsumed when the executor threw, although the tool had been invoked and may have acted: spend was undercounted and the approval stayed reusable. Now a throw after invocation is an **uncertain outcome**: the reservation is committed (fail closed in the spend direction), the nonces stay consumed, the call is appended to history (so repeated-refusal and order rules see it), the outcome reports `executed: true`, `outcome: "uncertain"`, `error.stage: "executor"`, and `harness.reconcile(request, error, ctx)` is told when the harness provides it. Reconciling with the remote system is the harness's job; a committed reservation may be released by the harness only after it has confirmed the tool did not act. Proof: test (b); cases `d6-executor-throws-recorded` (expectation changed from "recorded, released" to uncertain), `d6-uncertain-outcome-commits-spend`, `d6-uncertain-outcome-counts-as-spend`, `d6-approval-refused-after-uncertain-outcome`.

### Added

- `Governed.outcome: "not_run" | "ran" | "uncertain"` on every adapter outcome; `Harness.reconcile?`; `NonceSet.claim` / `release`; `ReferenceHarnessOptions.reconcile`.
- Conformance: the `enforcement` expectation compares `outcome` and `rejected` (approval rejection codes), and a case may carry `before`, calls run first through the same harness so a sequence's ledger, nonces and history are what the judged call sees. Five new `d6` cases (376 cases in all; the 261 robot-domain-rules cases and every other file are byte-identical). `forbidKeys` on an enforcement case is checked on the outcome without its echoed `request` (which holds what the harness supplied, approvals included); the decision must never carry `signature`.
- SPEC.md § 16.9 gains the settlement table; BOUNDARY.md's rows for replayed approvals and executor failure say what is now defended and what the harness still owns.

### Changed

- `Harness.consumed` now requires `claim` and `release` (a harness over a shared store must make `claim` a transaction or a conditional insert). The reference `NonceSet` provides both. No release of this change yet; releases are batched.

## 1.0.0-rc.1 — 2026-10-18 — the engine replaced (not yet published)

### The package is a different engine

The 0.x engine (worlds, lenses, guards, the `neuroverse` CLI, its framework, HTTP, agent-orchestration and glasses adapters, Radiant, chat, spatial, the playground, the MCP server over the old engine) is gone from this tree. **Every 0.x export and subpath export (`./adapters/*`, `./chat`, `./radiant`, …) is removed; nothing of the 0.x API is exported here.** The package now exports the robot-domain-rules engine (0.5.3, commit `ef13e19`, copied byte for byte: `docs/provenance/PROVENANCE.md`) generalised to a second format for AI agents calling tools, with one evaluator for both.

**Migration from 0.x.** There is none in code: the formats, the API and the model of governance are different. The old engine, its documentation and its tests are on the public branch [`legacy/main`](https://github.com/NeuroverseOS/neuroverseos-governance/tree/legacy/main) (the last pre-cut tree is the ref `legacy/pre-cut`; a private archive also holds the full history); the last 0.x published to npm is 0.12. Deprecating the 0.x versions on npm is a founder decision at 1.0.0 stable, not at this release candidate. Code that imports `@neuroverseos/governance` for `validateWorld` or any other 0.x symbol must pin `<1.0.0` or move to the new formats.

### Added — `neuroverse-governance/1`, the general contract (SPEC.md § 16)

- **The format**: a participant (an AI agent) calls a `tool` in a `scope` under a `principal`'s authority, with `args` bound to declared facts, optionally through a harness-assembled `delegation` chain. `compileGovernance(input)` compiles it; `governanceInputOf` inverts. Schemas: `spec/governance-{rulebook,request,decision,plan,approval,backtest}.schema.json`, `spec/tool-call.schema.json`.
- **One evaluator** (`src/model.ts`): a dialect table (`DOMAIN_DIALECT`, `GOVERNANCE_DIALECT`) and `normalizeRulebook`; a `/3` rulebook is returned as the same object, a `/1` rulebook is viewed with tools as actions and scopes as areas; `evaluate`, `evaluatePlan`, `checkRulebook`, `validateRulebook`, `verifyApproval`, `verifyAndEvaluate(Plan)`, `signRulebook`, `verifyRulebookSignature`, `backtest` and `compareBacktests` take both formats. `evaluateDomainAction` remains as the same function under its old name.
- **Arguments bound to facts, fail closed** (`bindArgs`, step 1b): `tools[].args = { field: { fact, required? } }`; an undeclared, missing, mistyped, non-object, non-JSON or doubly-supplied argument is BLOCK `args_wellformed` before any rule is weighed; `argsDigest = fingerprint(args ?? {})`. Derived facts (`requires`) are never bound: the harness computes them.
- **Bounded delegation** (step 4b): a tool is permitted only if the acting role and every role in the chain list it; `delegation_exceeds_authority` names the first link that does not; chain shape is `required_facts`.
- **Approvals bound to the exact call** (`neuroverse-governance-approval/1`, `signGovernanceApproval`): rule, rulebook fingerprint, principal, participant, tool, scope, `argsDigest`, nonce, window. A rejected approval is a **PAUSE, never a BLOCK**, with `approvalsRejected: [{ id, nonce?, code, reason }]` (codes `spec, unverified, rule, rulebook, principal, participant, tool, scope, args, replayed, window_malformed, no_now, not_yet_valid, expired, insufficient, spent`) and never the approval, its signature or key material.
- **Missions** (`neuroverse-governance-plan/1`, `compileMission`, `validateMission`): a plan compiled onto a rulebook as deny, wait and history rules and `at_most`/`at_least` plan rules at a new lowest authority `plan` (`PLAN_AUTHORITY`); a mission has no `allow` and cannot loosen anything; the compiled fingerprint covers rulebook and mission.
- **`/1` plans**: `evaluatePlan` on `/1` rulebooks and plans (`steps[].tool/scope/args`, `finalScope`); a step lands in its own scope, so there is no continuity check for `/1`.
- **`/1` builtin checks**: `required_facts, args_wellformed, scope_declared, role_declared, scope_permits_tool, role_permits_tool, unknown_tool, delegation_exceeds_authority`; derived `scope_role_limits:<scope>[:deny]` never rules, re-derived at validation.
- **The enforcing adapter** (`adapters/tool-call/`, exported from the root): `govern(call, session, harness, executor)` takes a tool call as `{ id?, function: { name, arguments } }` or `{ name, args }`, builds the request from the harness alone, verifies approvals in the trusted layer, evaluates, and calls the executor only on ALLOW or LIMIT, with the limits; every failure before the executor is a BLOCK with nothing run (`tool_call_malformed`, `harness_failed`, `evaluation_failed`, `setBy: "adapter"`); an executor throw is recorded, its reservation released and no nonce consumed. The reference harness: `referenceHarness`, `SpendLedger` (synchronous `reserve(bucket, amount) → { projected, commit, release }`; cumulative limits are the harness's arithmetic, the engine only compares), `NonceSet`, `HistoryStore`; `harnessFromData` for data-described harnesses.
- **Backtest for `/1`** (SPEC.md § 16.11): `backtest` and `compareBacktests` replay a log of `/1` requests (the adapter's `Governed.request` plus an outcome) with `byScope`, `rows[].tool/scope`, `gaps[].tool`, `unknown_tool` gaps and unbound arguments as a missing-facts row named `args`; `GovernanceBacktestReport/Row/Gap` types.
- **Conformance**: 105 `/1` cases — `d1-tools-and-args` (25), `d2-delegation` (10), `d3-bound-approvals` (24, TEST ONLY keys), `d4-limits-and-spend` (8), `d5-plans` (15), `d6-enforcement` (17, the `enforcement` expectation through the adapter), `d7-backtest` (6) — and the rulebooks `desk`, `desk-signed`, `desk-mission`; `compare.mjs`, `run-node.mjs`, `validate-schemas.mjs` and `generate.ts` extended; `forbidKeys` on a case asserts a key appears nowhere in the output.
- **The acceptance scenario** (`acceptance/invoice-reconciliation/`): an engine-independent fixture — rules, a mission, 28 recorded tool calls with hand-authored verdicts — replayed through `govern` with a harness written for that business (`npm run acceptance`, 28/28), and its log backtested under the current rulebook and a proposed cap of 750 instead of 500 (`npm run acceptance:backtest`: one call newly allowed, none newly blocked, and the approved refund that becomes a PAUSE because its approval binds to the base rulebook's fingerprint).
- **Tests**: `test/tool-call-adapter.test.ts`, including the concurrent-reservation proof (two 300s against 400 remaining: the second is denied).

### Added — shared, pinned by additive `/3` cases (SPEC.md § 11 errata 0.6)

- The plan check `at_least { actions | tools, count }`. Cases `plan-rule-at-least`, `plan-rule-at-least-satisfied`.
- Condition scope: a rule may condition on a fact that is neither required nor defaulted when its `does` selector is closed and every action or tool it resolves to lists the fact in `requires`. Cases `p4-rule-on-action-required-fact-decides`, `p4-rule-on-action-required-fact-missing-refuses`, `p4-rule-on-action-required-fact-open-does-rejected`.

Neither changes any decision, finding, fingerprint or signature of a rulebook that was valid before; the 261 robot-domain-rules 0.5.3 cases are unchanged byte for byte.

### Changed

- Package: `@neuroverseos/governance@1.0.0-rc.1`, MIT (was Apache-2.0; the Apache text is on `legacy/main`), `NOTICE` preserving robot-domain-rules' MIT notice, zero runtime dependencies, Node 20+, one export (`.`) plus `./package.json`, no `bin`. `files` ships `dist`, `spec`, the conformance cases and runners, `adapters/tool-call`, the acceptance scenario, the robotics examples and the documents (100 files; `npm pack --dry-run`).
- CI: one job (`engine`) — typecheck, tests, build, conformance against `dist`, schemas, acceptance, acceptance backtest, `npm pack --dry-run` — with `concurrency: cancel-in-progress`, `permissions: contents: read`, a 15-minute timeout. The 0.x jobs (Node 20/22 matrices, `validate-world`) went with the code they tested.
- Documentation rewritten for both formats: `README.md`, `PRINCIPLES.md` (every "In code" line names `/1` and `/3` cases), `SPEC.md` (the header names both formats, § 16 is the general contract read first, § 1–15 the shared language in the robotics dialect's words; § 16.12 is the design record), `BOUNDARY.md` (the adapter is the harness; the threat table has a "Proved by" column naming cases and tests; what it does not protect against), `AGENTS.md`, `conformance/README.md`, `RELATED-WORK.md`.
- SPEC.md § 16.9 names `adapters/tool-call/` (was the pre-cut `engine/` path); § 16.10 lists `backtest` among the doors that take both formats (it was listed as `/3`-only before slice 7b generalised it).

### Removed

- Everything the 0.x engine was (225 files: `src/engine`, `src/contracts`, `src/loader`, `src/cli`, `src/adapters`, `src/runtime`, `src/builder`, `src/connectors`, `src/providers`, `src/worlds`, `src/viz`, the old `test/`, `docs/worlds`, `docs/sample-worlds`, `policies/`, the old examples, `simulate.html`, `trace.html`, `openapi.yaml`, `llms.txt`, `.well-known/`, the old build and test configuration, `LICENSE.md`) and the unrelated products that lived beside it (158 files: `src/radiant`, `src/spatial`, `src/admin`, `src/chat`, `apps/mirror`, `apps/shared`, `audit/`, `audits/`, `docs/audits/`, `skills/`, `hooks/`, `.claude-plugin/`, the MentraOS and Radiant examples). All of it is on `legacy/main`; the last pre-cut tree is the branch `legacy/pre-cut` (= `0600b27`).
- `KNOWN-GAPS.md` is not carried. Its items became lines in `BOUNDARY.md` "What it does not protect against" (fact provenance and freshness; replay without the caller's set; authority not bound to identity; persistence, versioning, distribution and revocation; no exceptions to strictest-wins; validation versus a pinned signature; history conditions in the conflict analysis as `possible` findings) or one robotics-dialect line (one area per request, robot-to-robot coordination, the drafter's limits, the semantic-volumes adapter's shape). Dropped with this line: the `acrossAreas` code sample for evaluating one request over several areas (the rule — evaluate once per area, strictest wins, minimum of every limit — stays in `BOUNDARY.md`; the sample is in robot-domain-rules 0.5.3).
- The stage design note (`DESIGN-digital.md`) and the cut plan (`CUT-PLAN.md`) are folded into SPEC.md § 16.12 and this entry; both are in this repository's history.
- Of robot-domain-rules 0.5.3, not carried: the switchboard site (`site/`) and the Cedar export (`adapters/cedar/`), both excluded by the Path B stage 1 brief.

### Not part of 1.0, and where it lives

- The chat module (`@neuroverseos/governance/chat`, `governTurn`) and the govern-my-chatbot coding-agent plugin (`skills/`, `hooks/`, `.claude-plugin/`): on `legacy/main`; the plugin's two URLs (marketplace and plugin manifests) are to point at `legacy/main` in this repository (founder decision, 2026-10-18).
- Spatial governance for smart glasses (`src/spatial`, the MentraOS adapter, `src/admin`), the `apps/mirror` MentraOS app and Radiant: on `legacy/main`. The `/3` glasses bridge (`glassesZoneRules`) and `zone-rules.ts` stay here as part of the robotics dialect. Follow-up on `legacy/main`, not in this tree: point `apps/mirror/package.json`'s dependency at `legacy/main` in this repository (`github:NeuroverseOS/neuroverseos-governance#legacy/main`) instead of the default branch (founder decision, 2026-10-18).

### Deprecated

- `src/legacy.ts`, the 0.2 robotics input shape (`LegacyCompileInput`, `LegacyZone`, `LegacyRole`), carried unchanged so the robotics dialect stays whole. Removed at 1.1 together with its tests, `examples/legacy-store-0.2.ts` and its cases.

### Follow-ups named, not built

- A `/1` MCP `may_i` example built on the tool-call adapter (`examples/mcp/` is the `/3` server, carried as is).
- A CLI, if asked for, built on the one evaluator and the adapter.
- The two `legacy/main` follow-ups above (the plugin manifests, the `apps/mirror` dependency). A private archive also holds the full history; every public pointer to the old code is `legacy/main` or `legacy/pre-cut` in this repository.

### The cut, as a record

Classification at `73ff13a` (514 tracked files): **A** replaced by the new engine, 225 → removed; **B** unrelated product or experiment, 158 → removed; **C** kept at the root, 131 (6 root files, 7 acceptance files, 118 engine files; `LICENSE` and `NOTICE` new); **D** seven founder questions. Founder decisions: **D-1** spatial and the MentraOS adapter removed (on `legacy/main`), the glasses bridge stays; **D-2** `apps/mirror`'s dependency re-pointed at `legacy/main`, on that branch, nothing here; **D-3** README and this file carry the "0.x API is gone" section, the last published 0.x is 0.12, npm deprecation at 1.0.0 stable; **D-4** the plugin removed, its manifests re-pointed at `legacy/main`; **D-5** no `bin`; **D-6** every `/3` tool carried unchanged, `legacy.ts` deprecated for 1.1; **D-7** `examples/mcp` carried as the `/3` example. Executed in four commits: removals and the CI job (`8b79cea`), `git mv engine/* → root` with no history rewritten (`ca15866`), the D decisions (`3717a65`), the package identity (`756da00`). Tag pushes were refused by the hosting; the rollback point is the branch `legacy/pre-cut`.

### Checks at this release

`npm run typecheck` 0 errors; `npm test` 4 files, 466 tests; `node conformance/run-node.mjs` 371/371 (`--client` 291/291); `npm run conformance:schemas` 861/861 with 75/75 invalid inputs rejected; `npm run acceptance` 28/28; `npm run acceptance:backtest` exit 0; `npm pack --dry-run` 100 files.

## Engine lineage: robot-domain-rules 0.1 → 0.5.3

The engine's own history before it came here — 0.1.0 (first release: one store, one evaluator, the glasses bridge), 0.2.x (missing facts never permission, per-zone role limits, MIT), 0.3.x (the generic model: declared kinds, actions, areas, roles, typed facts; the switchboard), 0.4.0 (principles, the spec `robot-domain-rules/1` with 144 conformance cases, signed approvals), 0.5.0 (`/2`: whole-plan checking, the exact conflict analysis cross-checked with Z3), 0.5.1 (backtest), 0.5.2 (`/3`: SHA-256 fingerprints, bound approvals with nonces and windows, dated history; the first audit), 0.5.3 (the second audit: the verified handle, integrity re-derivation, explicit versions at every door) — is preserved verbatim in [`docs/provenance/robot-domain-rules-CHANGELOG.md`](docs/provenance/robot-domain-rules-CHANGELOG.md).

---

## 0.x — the previous engine (`legacy/main`)

The entries below describe the engine that `legacy/main` holds. They are kept as a record; none of the code they describe is in this tree. The last 0.x published to npm is 0.12; the 0.13.0 and unreleased 0.14.0 entries describe code on `legacy/main`. These entries followed [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

### [Unreleased] — 0.14.0

#### Added
- **Chatbot governance (`@neuroverseos/governance/chat`)** — governs a chatbot turn by turn, checking every incoming message and every outgoing reply by meaning against the creator's rulebook, with no word lists. `parseChatRulebook` reads a `.nv-world.md` chatbot rulebook: `# Invariants` (rules), `# Lenses` `>` lines (habits), `# Escalations` (hard moments as a `situation` plus `example` phrasings and a fixed `response`), and optional `# Responses` (`unavailable`, `fallback`). `governTurn` runs the turn: a meaning check for hard moments (fixed response, chatbot never called), instructions built from the rulebook, then a meaning check of every draft against every rule and habit, with a retry naming the broken rules and the creator's fallback. Fails closed: if any check or the chatbot can't run, or the judge's answer is malformed, the `unavailable` response is sent and nothing unchecked reaches the user. Every rule is meaning-checked unless explicitly marked prompt-only (`(prompt)` or `[check: prompt]`); `validateChatRulebook` warns on every prompt-only rule, and `describeEnforcement` lists how each part is enforced. Provider-agnostic (`generate` and `judge` are caller-supplied model calls) and runtime-agnostic (Node.js, Deno, browsers). Turn traces never contain the user's words.

#### Fixed (chat module, from the govern-my-chatbot audit)
- **A judge answer naming an unknown or missing rule now fails closed.** `checkRules` used to drop a `broken` entry whose rule id didn't match, so the draft was treated as clean and sent. It now throws `JudgeUnavailableError` (case and surrounding spaces are forgiven), matching `checkMoments`.
- **Timeouts.** `governTurn` takes `timeoutMs` (default 60 s, `DEFAULT_TIMEOUT_MS`); a judge or chatbot call that takes longer sends the `unavailable` response instead of hanging.
- **No rule is dropped or downgraded silently.** `parseChatRulebook` now errors on rule, habit, and `# Responses` lines it can't read; on a second lens; on duplicate rule or moment ids; on a hard moment named `none`; on unfilled `[CREATOR: …]` placeholders; and when no rule is checked by meaning. A trailing parenthetical is read as settings only when every word is a known setting, so "(even when prompted)" stays part of the rule and the rule stays meaning-checked.
- Judge-supplied names are no longer echoed into turn traces.

### 0.13.0 — 2026-07-26 — Fail-closed hardening

Five fail-open holes closed, each pinned by a canary test
(`test/fail-closed-hardening.test.ts`):

1. **Broken guard patterns fail closed.** An uncompilable regex in
   `intent_vocabulary` or a kernel pattern is now a `validateWorld`
   ERROR (`canRun=false`); at runtime an enforcing guard whose authored
   patterns all fail to resolve PAUSEs (`guard-misconfigured-<id>`)
   instead of silently allowing everything.
2. **Guards and kernel rules see the payload.** Matching covers
   intent+tool+scope AND the JSON payload, so forbidden content cannot
   ride under a benign intent label.
3. **The session allowlist runs after the safety layer.** Allow-always
   can skip governance layers, never injection / scope-escape /
   execution screening.
4. **Expired plans fail closed.** New `PLAN_EXPIRED` status
   (allowed:false → BLOCK; exit code 5). `GuardEngineOptions.now`
   provides a deterministic evaluation clock.
5. **Kernel output boundaries are enforced** on `direction='output'`
   events — the "never emit credentials" family is live.

Over-blocker fixes: level constraints match words, not substrings
("confirm" no longer contains `rm `; "tokenizer" is not "token");
plan approval constraints require a real topical match instead of one
shared common word.

Breaking: expired plans now refuse actions (was: allowed as
PLAN_COMPLETE). `PlanStatus` gains `'PLAN_EXPIRED'`.

### [0.12.0] - 2026-04-19

#### Added
- **Google Workspace adapter** (`@neuroverseos/governance/radiant` — `fetchGoogleWorkspaceActivity`, `formatGoogleWorkspaceSignalsForPrompt`). Reads the leader's Gmail sent folder + primary Calendar in the window, normalizes both into `Event[]`, emits signals for email volume + unique recipients + meeting load + organized-vs-attended + total meeting minutes. Takes a Google OAuth access token (scopes: `gmail.readonly`, `calendar.readonly`). Opens the entire non-engineering-leader market — every leader has Gmail + Calendar, almost none of them have GitHub.
- **Salesforce adapter** (`fetchSalesforceActivity`, `formatSalesforceSignalsForPrompt`). Reads recent Opportunity movement, OpportunityFieldHistory (stage/amount/close-date transitions), Tasks + Calls, and Chatter FeedItems by the leader. Takes a Salesforce OAuth access token + instance URL. Emits signals for opportunities moved, stage transitions, amount changes, closed-won/lost, total pipeline represented, top-active stages. Opens the sales-leader market without requiring admin consent — individual reps/managers can authorize directly.

#### Notes
- The adapter priority order (Google Workspace → Salesforce → Microsoft Teams) reflects auth friction: Google and Salesforce can be authorized by an individual user without tenant-admin consent; Teams / MS Graph typically requires enterprise admin approval for most real companies, so it ships later even though Microsoft's seat count is larger.

### [0.11.0] - 2026-04-18

#### Added
- **Observe mode (`mode: 'observe'` on `evaluateGuard`)** — runs every evaluation layer identically to enforce mode, then coerces any non-ALLOW verdict to ALLOW before returning. The original status is preserved on `GuardVerdict.shadowStatus` and `shadowReason`. Nothing is blocked, paused, or modified; the caller passes the action through and reads the shadow fields to know what WOULD have happened. This is the primitive behind Bevia/Radiant's "Mirror Mode" framing: see where your team crosses what you said you lead by, without imposing enforcement.
- **`auditBehavior(event, world)` and `auditBehaviors(events, world)`** helpers (`@neuroverseos/governance`) — consume an `AuditableEvent` (loose shape covering commits, PRs, chat messages, etc.), wrap it into a synthetic `GuardEvent`, and evaluate in observe mode. Return `Crossing` records shaped for behavioral audit logs: `eventId`, `timestamp`, `shadowStatus`, `shadowReason`, `ruleId`, `excerpt`, `wouldHaveBlocked`, plus the full verdict.
- **`neuroverse audit` CLI** — observe-mode counterpart to `neuroverse guard`. Always exits 0. Supports `--multi` to evaluate a JSON array of events and `--crossings-only` to filter down to just the interesting ones. Useful for replaying past activity through a new world to preview its behavior before flipping it to enforce.
- **Radiant `GovernanceAudit.crossings`** (`@neuroverseos/governance/radiant`) — `auditGovernance` now evaluates in observe mode and emits a `crossings: Crossing[]` array alongside the existing human/cyber/joint buckets. Bevia surfaces these as "moments the team bumped against your worldmodel" in the dashboard and in `radiant_team_read` MCP responses.

#### Changed
- **Internal `evaluateGuard` refactor** — the body of the public `evaluateGuard` was renamed `evaluateGuardCore` and wrapped with a thin public function that applies observe-mode transformation. No behavior change for existing callers; `evaluateGuard(event, world)` without the new `mode` option returns exactly the same verdict as before.
- **`GovernanceAudit` shape** — added `crossings` field. Non-breaking additive change; existing consumers reading only `totalEvents`, `human`, `cyber`, `joint`, or `summary` are unaffected.

### [0.10.0] - 2026-04-18

#### Added
- **Linear adapter** (`@neuroverseos/governance/radiant` — `fetchLinearActivity`, `formatLinearSignalsForPrompt`) — the sixth Radiant source. Reads issues, cycles, and comments via the Linear GraphQL API and surfaces the gap between stated intent (what the team planned) and shipped outcome (what the GitHub adapter observes). Signals: issues created / completed / open / stalled, cycle completion rate, unique assignees, comment volume, top active projects. Auto-activates when `LINEAR_API_KEY` is set in the environment.
- **`--entire-org` required in the weekly workflow example** — `examples/radiant-weekly-workflow.yml` now reflects the consent-first posture: org-wide reads must opt in via `--entire-org` or Radiant narrows scope by default.

#### Changed
- **Mind Palace** (was: Memory Palace) — internal terminology now matches the published package.

### [0.5.0] - 2026-04-06

#### Added
- **World signing** — `neuroverse keygen`, `neuroverse sign`, `neuroverse verify` for cryptographic world artifact signing using Ed25519. SHA-256 manifest covers all files; any change invalidates the signature.
- **Schema migration** — `neuroverse migrate` detects world schema version and applies declarative migrations. Supports `--dry-run`, `--backup`, and `--target`. Ships with 1.0.0 → 1.1.0 migration.
- **Trace dashboard** — `trace.html` is a standalone HTML dashboard for visualizing governance audit logs. Drag-and-drop NDJSON, see timeline, rule frequency, blocked intents, and filterable event table. Zero dependencies.
- **Audit logging in CLI** — `neuroverse guard --log <path>` and `neuroverse run --log <path>` write JSONL audit trails for every verdict.
- **Policy golden tests** — `test/world-policy.test.ts` is a copy-and-adapt template for teams to write enforceable contract tests ("this intent must always BLOCK/ALLOW").
- **Simulation parity tests** — `test/simulation-parity.test.ts` documents and tests the architectural boundary between `simulateWorld()` and `evaluateGuard()`.

#### Fixed
- **Runtime hardening** — bounded agent state map (10K max with LRU eviction) and bounded pipe buffer (1MB max) in session manager. Closes both findings from the production audit.

#### Removed
- Bevia app and all internal planning/strategy documents (pricing, brainstorms, handoff specs)

### [0.2.2] - 2026-03-22

#### Added
- **Behavioral governance engine** — classifies agent adaptations, detects network-level patterns (coordinated silence, misinfo suppression, reward cascades), generates prose narratives
- **Decision flow engine** — intent-to-rule-to-outcome visualization showing governance value as the gap between what agents wanted and what actually happened
- **Impact reporting** — counterfactual governance analysis from audit logs
- **Input validation** — guard engine rejects inputs exceeding 100KB, MCP server enforces 10MB buffer limit
- **World loader warnings** — corrupt JSON files now warn on stderr instead of silently returning undefined
- **CI pipeline** — GitHub Actions workflow testing Node 18/20/22, type checking, and example world validation
- **SECURITY.md** — vulnerability disclosure policy

#### Fixed
- **Autoresearch adapter** — now routes through `evaluateGuard()` instead of custom evaluation logic
- **Playground XSS** — error messages escaped before DOM insertion
- **MCP server buffer overflow** — Content-Length validated, buffer size capped at 10MB
- **Playground request body limit** — POST requests capped at 1MB

#### Changed
- README rewritten to teach governance as a concept before showing API
- Validation documentation updated from 9 to 12 checks (reflecting actual implementation)
- Pipeline documentation updated to show all phases including invariants, cooldown, and allowlist

### [0.2.1] - 2026-03-15

#### Added
- **Incremental authoring** — `neuroverse add` command for adding rules, invariants, and guards to existing worlds
- **Deep agents adapter** — governance integration for multi-agent orchestration systems
- **Equity penalties** — PENALIZE/REWARD/NEUTRAL behavioral enforcement with per-agent state tracking
- **Decision flow visualization** — `neuroverse decision-flow` command
- **Adapter deduplication** — shared utilities extracted to `adapters/shared.ts`

### [0.2.0] - 2026-03-01

#### Added
- **Plan enforcement** — compile plan markdown into enforceable constraints, track progress, verified completion mode
- **MCP server** — JSON-RPC 2.0 governance server for Claude, Cursor, Windsurf
- **Red team command** — 28 adversarial attacks across 6 categories with containment scoring
- **Playground** — interactive web UI at localhost:4242 with visual trace pipeline
- **World management** — `neuroverse world` command with status, diff, snapshot, rollback
- **AI-assisted world synthesis** — `neuroverse derive` and `neuroverse build` commands
- **OpenAI adapter** — governed tool executor for function calling
- **LangChain adapter** — callback handler with plan progress tracking
- **OpenClaw adapter** — plugin with beforeAction/afterAction hooks
- **Express adapter** — governance middleware returning 403 on BLOCK

#### Changed
- Guard engine expanded to multi-phase pipeline (safety, plan, roles, guards, kernel, level)
- Validate engine expanded from 3 to 12 static analysis checks

### [0.1.0] - 2026-02-01

#### Added
- **Core guard engine** — deterministic evaluation of GuardEvents against WorldDefinitions
- **Bootstrap pipeline** — compile `.nv-world.md` markdown into world JSON files
- **Validate engine** — structural completeness, referential integrity, guard coverage
- **Simulate engine** — step-by-step state evolution with assumption profiles
- **CLI** — `neuroverse init`, `bootstrap`, `validate`, `guard`, `test`, `explain`, `simulate`, `improve`
- **World loader** — load WorldDefinition from directory of JSON files
- **303 tests** across 5 test suites
- Zero runtime dependencies
