# Cut plan: making the new engine the repository (Path B stage 3, slice 7a)

Analysis only. Nothing in this slice moves, nothing is deleted, no license
changes, nothing is published. The founder approves the cut from this plan;
slice 7c executes it.

Method: `git ls-files` for the census; `grep`/import tracing (`from '…'`
across `src`, `apps`, `test`, `examples`, root files) for who depends on what;
the engine's own tree (`engine/`) is what stage 1–2 built. Counts below are
tracked files at `73ff13a`.

## 1. Classification of the governance root

Classes: **A** replaced by the new engine → holding; **B** unrelated product or
experiment → holding; **C** keep at root after the cut; **D** undecided, question
for the founder. "Imported from outside" names anything outside the path that
imports it; the `neuroverse-os` app repo depends on the *published* npm package
(`import { validateWorld } from '@neuroverseos/governance'` in
`src/world-engine/compiler.ts`), not on this tree, so it is never a blocker for
moving files — it is a question for the 1.0 publish (D-3).

### A — replaced by the new engine (→ holding)

| Path | Files | What it is | Imported from outside it |
|---|---|---|---|
| `src/engine/**` | 28 | The old guard engine: `guard-engine`, `plan-engine`, `condition-engine`, `validate-engine`, `bootstrap-parser/emitter`, `worldmodel-*`, `audit-logger`, `impact-report`, `decision-flow-engine`, `ai-guard`, `intent-classifier`, `simulate-engine` | 59 files: `src/index.ts`, `src/cli/*`, `src/adapters/*`, `src/runtime/*`, `src/builder/*`, `src/chat/*`, `src/radiant/*`, `test/*`, `apps/mirror` (via the package), `examples/*` |
| `src/contracts/**` | 7 | Verdict/plan/validate/bootstrap contracts and exit codes of the old engine | 60 files (same set) |
| `src/loader/**` | 2 | `.nv-world.md` loading and org-detect resolution | 31 files |
| `src/types.ts`, `src/index.ts`, `src/browser.ts` | 3 | The old public surface and the IIFE browser bundle (`simulate.html`) | `apps/*`, `test/*`, `examples/*`, root `package.json` exports |
| `src/cli/**` | 39 | The `neuroverse` CLI over the old engine (init, bootstrap, guard, test, redteam, playground, plan, run, mcp, derive, radiant, …) | `package.json` `bin`; `.well-known/mcp.json`; `README.md` |
| `src/adapters/**` | 10 | OpenAI, LangChain, OpenClaw, Express, autoresearch, deep-agents, MentraOS, GitHub adapters over the old `evaluateGuard` | `apps/mirror` (`neuroverseos-governance/adapters/mentraos`), `examples/deep-agents`, `examples/mentraos-*`, `package.json` exports |
| `src/runtime/**` | 5 | Governed session, model adapter, old MCP server | `src/cli/run.ts`, `src/cli/mcp.ts`, `test/runtime.test.ts` |
| `src/builder/**` | 8 | "Tell your AI how to behave" questionnaire → old worlds | `src/cli/*`, `examples/governance-builder` |
| `src/connectors/**` | 1 | OpenClaw process plugin over the old engine | none |
| `src/providers/**` | 2 | AI-provider config for `neuroverse derive` | `src/cli/derive.ts`, `src/engine/ai-guard.ts` |
| `src/worlds/**` | 12 | Bundled `.nv-world.md` / `.worldmodel.md` | `src/loader/*`, build script copies them into `dist/worlds` |
| `src/viz/**` | 4 | React "observation deck" over the old simulate engine | `vite.config.ts`, `build:viz` |
| `test/**` | 27 | Tests of the old engine, runtime and Radiant | — |
| `docs/worlds/**`, `docs/sample-worlds/**` | 44 | Old world files; CI `validate-world` validates two of them | `.github/workflows/ci.yml` (job removed by the cut) |
| `policies/*.txt` | 6 | Old plain-text rule sets, shipped in `files` | `package.json` `files` |
| `examples/governance-builder`, `lenses`, `behavioral-lens-demo`, `deep-agents`, `stoic-translator`, `social-media-sim`, `startup-marketing`, `autoresearch` | 13 | Examples of the old engine (lenses, builder, old adapters) | `package.json` `files` (`examples/social-media-sim`) |
| `simulate.html`, `trace.html` | 2 | Standalone pages over `dist/browser.global.js` | `package.json` `files` |
| `openapi.yaml`, `llms.txt`, `.well-known/**` | 4 | API description, LLM notes and MCP manifest for the old CLI/server (`npx @neuroverseos/governance mcp`) | `package.json` `files` |
| `vite.config.ts`, `vitest.config.ts`, `scripts-vitest-runner.mjs`, `tsconfig.json`, `package.json`, `package-lock.json` | 6 | Root build/test config of the old package | — (replaced by the engine's) |
| `LICENSE.md` (Apache-2.0 text) | 1 | The old license text; the founder ruled MIT | replaced by `LICENSE` (MIT); the Apache text stays in history and in holding |

A total: **225 files** (`git ls-files` over the paths above).

### B — unrelated product or experiment (→ holding)

| Path | Files | What it is | Imported from outside it |
|---|---|---|---|
| `src/radiant/**` | 54 | Radiant, behavioral intelligence for collaboration (Linear/GitHub/git signals, lenses, MCP) | `src/cli/radiant.ts`, `src/index.ts` (re-export), 18 tests in `test/radiant-*`, `examples/radiant-weekly-workflow.yml` |
| `src/spatial/**` | 6 | Spatial governance for smart glasses (zones, consent, `ZoneRules`) | `src/adapters/mentraos.ts`, `src/admin/*`; the engine's `glasses.ts` produces the same `ZoneRules` shape by design but does not import it |
| `src/admin/**` | 5 | Enterprise management layer for MentraOS | none |
| `src/chat/**` | 6 | Chatbot governance by meaning (`governTurn`), the govern-my-chatbot engine | `src/index.ts`, `test/chat.test.ts`, `skills/govern-my-chatbot/templates/*` |
| `apps/mirror/**`, `apps/shared/**` | 35 | A MentraOS app and its journal helper; `apps/mirror/package.json` depends on `"neuroverseos-governance": "github:NeuroverseOS/neuroverseos-governance"` (this repo's default branch) | — (it consumes the package by git URL; see D-2) |
| `audit/**`, `audits/**`, `docs/audits/**` | 32 | The govern-my-chatbot section-4 audit (cases, metrics, rulebooks) and five earlier written audits | none |
| `skills/**`, `hooks/hooks.json`, `.claude-plugin/**` | 14 | The govern-my-chatbot Claude Code skill, its rulebook-guard hook, plugin and marketplace manifests (homepage URL points at this repo's `main`) | none in code; the marketplace entry points at `tree/main/skills/govern-my-chatbot` (see D-4) |
| `examples/mentraos-lenses-app`, `examples/mentraos-shared-session`, `examples/radiant-weekly-workflow.yml` | 6 | MentraOS and Radiant examples | — |

B total: **158 files**.

### C — keep at root after the cut

| Path | Action |
|---|---|
| `.github/workflows/ci.yml` | Rewritten: the engine job becomes the only job, plus `npm pack --dry-run` (§ 2). |
| `.gitignore` | Merged with `engine/.gitignore` (`node_modules`, `dist`, `*.tgz`, `.DS_Store`, `domain-rules.json`, `*.rules.json`). |
| `README.md` | Rewritten for governance (§ 4). |
| `AGENTS.md` | Replaced by `engine/AGENTS.md`, rewritten for the two formats (§ 4). |
| `CHANGELOG.md` | Kept; a `1.0.0-rc.1` entry on top; the engine's `CHANGELOG.md` (robot-domain-rules 0.1–0.5.3) appended as "Engine lineage". |
| `SECURITY.md` | Kept as is. |
| `LICENSE` (new, MIT) + `NOTICE` | MIT, copyright NeuroverseOS; `NOTICE` preserves the robot-domain-rules MIT notice ("Copyright (c) 2026 NeuroVerse OS Contributors") for the derived engine and names the source commit `ef13e19`. |
| `acceptance/**` | Stays; import paths change from `../../engine/src/index` to `../../src/index`. |
| `engine/**` (118 files) | Moves to the root paths in § 2. |

C total: **131 files** (6 root files, 7 acceptance files, 118 engine files; `LICENSE` and `NOTICE` are new).

### D — undecided: questions for the founder (answered; see "Founder decisions" below)

- **D-1 `src/spatial/**` and `src/adapters/mentraos.ts`.** The robotics engine's `glassesZoneRules()` was built to feed this repo's spatial `ZoneRules`. With `src/spatial` in holding, does MentraOS integration continue from the holding package, or should `ZoneRules` (6 files, no old-engine dependency except `mentraos.ts`) be carried into the new tree as `adapters/mentraos/`? Default in this plan: holding (B).
- **D-2 `apps/mirror` git dependency.** It depends on `github:NeuroverseOS/neuroverseos-governance` (default branch). After the cut that URL resolves to a tree without `adapters/mentraos`. Re-point it to `github:NeuroverseOS/neuroverseos-governance-holding` (or a pinned commit `#73ff13a`) in the holding copy? It is a one-line change in a repository that is itself moving to holding; who owns mirror decides.
- **D-3 `@neuroverseos/governance@1.0.0-rc.1` replaces a package other code imports** (`neuroverse-os` uses `validateWorld`; the old subpath exports `./adapters/openai`, `./chat`, `./radiant`, … disappear). A major bump says so; should the rc README carry a "0.14.x API lives at the holding repository / `npm i @neuroverseos/governance@0.14`" section, and should 0.14.0 be deprecated on npm at 1.0.0 or left?
- **D-4 The govern-my-chatbot Claude plugin.** `.claude-plugin/marketplace.json` and `plugin.json` point at `…/Neuroverseos-governance/tree/main/skills/govern-my-chatbot`. Moving them to holding breaks that link for anyone who installed the plugin. Re-home the plugin at the holding repository (update the two URLs there), or retire it?
- **D-5 `bin`.** The old package shipped the `neuroverse` CLI. The engine has none. Ship 1.0.0-rc.1 without `bin` (recommended: nothing to maintain, nothing to mis-document) and add a CLI later if asked?
- **D-6 `/3` extras carried into 1.0.** `src/templates/` (grocery-store, warehouse), `src/legacy.ts` (the 0.2 robotics input shape, "deprecated, removed in 0.6" per the robotics AGENTS.md), `src/draft.ts` (the plain-text drafter) and `src/glasses.ts`/`zone-rules.ts` are `/3`-only tooling. Carry all of them (the robotics dialect stays whole) or drop `legacy.ts` at 1.0 as its own text promised?
- **D-7 `examples/mcp`** (the robotics MCP server example, its own package, not installed in CI) — keep as an example of a `/3` MCP server, or leave in holding until a `/1` MCP example exists?

Counts: **A 225 · B 158 · C 131 · D 7 questions** (D-1, D-4, D-6, D-7 name files whose default class is given above; 225 + 158 + 131 = 514). Tracked files at `73ff13a`: 514.

## 2. Target root layout after the cut

```
README.md  PRINCIPLES.md  SPEC.md  BOUNDARY.md  RELATED-WORK.md  AGENTS.md  CHANGELOG.md  SECURITY.md  LICENSE  NOTICE
package.json  package-lock.json  tsconfig.json  vitest.config.ts  .gitignore
.github/workflows/ci.yml
spec/            conformance/      src/            adapters/tool-call/
acceptance/      examples/         test/
docs/provenance/ (PROVENANCE.md, DESIGN-digital.md, CUT-PLAN.md)
```

| `engine/*` path | Root path after the cut |
|---|---|
| `engine/src/**` | `src/**` |
| `engine/spec/**` | `spec/**` |
| `engine/conformance/**` | `conformance/**` |
| `engine/adapters/tool-call/**` | `adapters/tool-call/**` |
| `engine/examples/**` | `examples/**` |
| `engine/test/**` | `test/**` |
| `engine/package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts` | root (replacing the old ones) |
| `engine/SPEC.md`, `PRINCIPLES.md`, `BOUNDARY.md`, `RELATED-WORK.md`, `AGENTS.md` | root (rewritten in the documentation slice, § 4) |
| `engine/LICENSE` | `NOTICE` (the preserved MIT notice); a new `LICENSE` (MIT, NeuroverseOS) is written |
| `engine/CHANGELOG.md` | appended to `CHANGELOG.md` as "Engine lineage" |
| `engine/PROVENANCE.md`, `DESIGN-digital.md`, `CUT-PLAN.md` | `docs/provenance/` |
| `engine/KNOWN-GAPS.md` | not carried (§ 4) |
| `engine/.gitignore` | merged into `.gitignore` |

**`package.json` becomes:**

```json
{
  "name": "@neuroverseos/governance",
  "version": "1.0.0-rc.1",
  "description": "Rules for AI agents, robots and people under one law: a declared-authority rulebook, one deterministic evaluator (ALLOW | LIMIT | PAUSE | BLOCK with reasons), arguments bound to facts, bounded delegation, approvals bound to the exact call, missions that only tighten, an enforcing tool-call adapter, a backtest, and a language-neutral spec (neuroverse-governance/1; robot-domain-rules/3 as the robotics dialect) with conformance tests.",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.cjs", "module": "./dist/index.js", "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "require": "./dist/index.cjs" }, "./package.json": "./package.json" },
  "files": ["dist", "spec", "conformance/*.json", "conformance/rulebooks", "conformance/compare.mjs", "conformance/compare.d.mts", "conformance/run-node.mjs", "conformance/validate-schemas.mjs", "conformance/README.md",
            "adapters/tool-call", "acceptance/invoice-reconciliation", "examples/*.ts", "examples/harness", "examples/backtest",
            "README.md", "PRINCIPLES.md", "SPEC.md", "BOUNDARY.md", "RELATED-WORK.md", "AGENTS.md", "CHANGELOG.md", "LICENSE", "NOTICE"],
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts --clean",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --dir test",
    "conformance": "node conformance/run-node.mjs",
    "conformance:schemas": "node conformance/validate-schemas.mjs",
    "conformance:generate": "tsx conformance/generate.ts",
    "acceptance": "tsx acceptance/invoice-reconciliation/run.ts",
    "acceptance:backtest": "tsx acceptance/invoice-reconciliation/backtest.ts",
    "demo": "tsx examples/demo.ts", "replay": "tsx examples/harness/replay.ts", "plan-replay": "tsx examples/harness/plan-replay.ts", "backtest": "tsx examples/backtest/backtest.ts",
    "prepublishOnly": "npm run typecheck && npm test && npm run build && npm run conformance && npm run conformance:schemas && npm run acceptance"
  },
  "devDependencies": { "@types/node", "ajv", "tsup", "tsx", "typescript", "vitest", "z3-solver" (as in engine/package.json) },
  "repository": "git+https://github.com/NeuroverseOS/neuroverseos-governance.git",
  "engines": { "node": ">=20" }
}
```

No `bin` (D-5). No runtime dependencies. The adapter is exported from the root bundle (`govern`, `referenceHarness`, …); no `./adapters/*` subpaths. Keywords: governance, ai-agents, tool-calls, authorization, rules, robotics, conformance, backtesting.

**CI becomes** one job (the current `engine` job at the root, `working-directory` removed), the robotics `permissions: contents: read` and `timeout-minutes: 15`, and `npm pack --dry-run` as the last step:

```yaml
jobs:
  core:
    steps: checkout; setup-node 22 (cache npm); npm ci; npm run typecheck; npm test; npm run build;
           node conformance/run-node.mjs; npm run conformance:schemas; npm run acceptance; npm run acceptance:backtest;
           npm run demo && npm run replay && npm run plan-replay && npm run backtest; npm pack --dry-run
```

with the existing top-level `concurrency: ci-${{ github.ref }}`, `cancel-in-progress: true`. The root `test (20)`, `test (22)` and `validate-world` jobs go with the code they test.

## 3. The cut, as git operations

Preconditions: PR #152 merged to `main` (or the cut branch is taken from `path-b/engine-seed`; the commands below assume `main` after the merge); the founder has created the empty repository `NeuroverseOS/neuroverseos-governance-holding` (no README, no license file — the push below brings everything); the session has push rights to both. No history is rewritten anywhere; `main` is never force-pushed.

```bash
cd neuroverseos-governance
git fetch origin --tags
git checkout main && git pull --ff-only

# 1. Rollback point: an annotated tag on the last pre-cut commit. (Tag pushes were refused from the stage 1 session; if that recurs, push the same commit as branch legacy/pre-cut.)
git tag -a legacy/pre-cut -m "Last commit before the Path B cut: the full governance tree with engine/ alongside it." main
git push origin refs/tags/legacy/pre-cut            # or: git push origin main:refs/heads/legacy/pre-cut

# 2. The holding repository gets the FULL history first: main, legacy/main, the Path B branch and every tag.
git remote add holding https://github.com/NeuroverseOS/neuroverseos-governance-holding
git push holding main legacy/main path-b/engine-seed --tags
git ls-remote holding                                # verify: refs/heads/main == origin main, legacy/main, path-b/engine-seed, tags present
# (In the holding copy, one follow-up commit: apps/mirror/package.json "neuroverseos-governance": "github:NeuroverseOS/neuroverseos-governance-holding", and the two plugin URLs — D-2, D-4 — only if the founder answers "re-home".)

# 3. The cut branch. Removals first (the files live on in holding and in this repository's history), then the engine moves to the root.
git checkout -b path-b/cut main
git rm -r -q src apps audit audits docs examples hooks policies skills test .claude-plugin .well-known \
             simulate.html trace.html openapi.yaml llms.txt vite.config.ts vitest.config.ts scripts-vitest-runner.mjs \
             tsconfig.json package.json package-lock.json LICENSE.md
git mv engine/src src;  git mv engine/spec spec;  git mv engine/conformance conformance
git mv engine/adapters adapters;  git mv engine/examples examples;  git mv engine/test test
git mv engine/package.json package.json;  git mv engine/package-lock.json package-lock.json
git mv engine/tsconfig.json tsconfig.json;  git mv engine/vitest.config.ts vitest.config.ts
git mv engine/SPEC.md SPEC.md;  git mv engine/PRINCIPLES.md PRINCIPLES.md;  git mv engine/BOUNDARY.md BOUNDARY.md
git mv engine/RELATED-WORK.md RELATED-WORK.md;  git mv engine/AGENTS.md AGENTS.md
git mv engine/LICENSE NOTICE                            # the preserved robot-domain-rules MIT notice; LICENSE (MIT, NeuroverseOS) is written new
mkdir -p docs/provenance
git mv engine/PROVENANCE.md docs/provenance/PROVENANCE.md;  git mv engine/DESIGN-digital.md docs/provenance/DESIGN-digital.md
git mv engine/CUT-PLAN.md docs/provenance/CUT-PLAN.md
cat engine/CHANGELOG.md >> CHANGELOG.md   # as a titled "Engine lineage" section, then: git rm engine/CHANGELOG.md
git rm engine/KNOWN-GAPS.md               # after its /1-relevant items became cases or BOUNDARY lines (documentation slice)
git mv engine/.gitignore .gitignore.engine && cat .gitignore.engine >> .gitignore && git rm -q .gitignore.engine   # then dedupe by hand
git ls-files engine                       # must print nothing; then: rmdir engine

# 4. Path fixes, in the same branch: acceptance/*/{run,generate,backtest}.ts import '../../src/index';
#    package.json name/version/description/files/exports/scripts as § 2; .github/workflows/ci.yml as § 2; new LICENSE (MIT, NeuroverseOS).
npm ci && npm run typecheck && npm test && npm run build && npm run conformance && npm run conformance:schemas && npm run acceptance && npm pack --dry-run

# 5. Commit (one commit for the moves, one for the edits, so `git log --follow` and the diff stay readable), push, PR, CI green, founder merges.
git add -A -- .   # NOT used: stage explicitly — git add <each path above>, then git diff --cached --stat
git commit -m "Path B slice 7c: the cut — engine to the root, old tree to holding (no history rewritten)"
git push -u origin path-b/cut

# Rollback at any point before the merge: close the PR; main is untouched. After the merge: git revert -m 1 <merge sha> on a branch, PR, merge; legacy/pre-cut names the pre-cut tree for comparison. Never force-push.
```

`git mv` keeps `git log --follow` history for every moved file; the removed files keep their history on `main` and in holding. The holding push is step 2 so that nothing is removed anywhere before a second full copy exists.

## 4. The documentation slice after the cut

Rewritten for governance (agents first, robots as the same law):

- **`PRINCIPLES.md`** — the nine principles restated for agents and robots under one law: every example gets a digital reading beside the physical one (a tool call under a principal's authority; a scope for an area; arguments bound to facts under principle 4; the adapter as the harness under 9). Each principle names its `/1` cases (`d1`–`d6`) beside its `/3` ones.
- **`BOUNDARY.md`** — the adapter is the harness: what it is (`govern` stands between the proposal and the tool), what it trusts (the harness: scope, facts, derived facts, ledger, approvals, history, time), integration rule #1 restated for tool calls (nothing from the requester: not the model's intent, not its claim about its own arguments), and a **threat table with a "proved by" column** pointing at cases: undeclared/mistyped arguments → `d1-*-refused`; unknown tool/scope → `d1-unknown-*`; delegation escalation → `d2-link-*`; replayed/altered/expired/misbound approvals → `d3-*-rejected`; a decision leaking a signature → `d3-rejection-carries-no-signature`; cumulative-limit races → `d4-*`, `tool-call-adapter.test.ts`; a mission loosening a law → `d5-mission-cannot-loosen-*`; executor called on refusal → `d6-block-never-executes`, `d6-pause-never-executes`; harness failure → `d6-*-throws`; a `/3` rulebook at the adapter → `d6-v3-rulebook-refused-at-adapter`. What it does not protect against stays honest (a harness that lies, a compromised key, a tool that does more than its declaration).
- **`SPEC.md`** — `/1` first: § 1–§ 10 state the shared language in `/1` words with the `/3` names in a column; the robotics-specific parts (areas as physical places, `move` effects, `plan_area_continuity`, the glasses bridge, the 0.2 legacy input) become one section "robot-domain-rules/3: the robotics dialect"; today's § 16 dissolves into the body; § 11 versioning covers both format strings; § 13 backtest covers both (slice 7b); § 14 porting notes name what a `/1`-only client needs.
- **`README.md`** — one sentence ("AI agents and robots propose; the rulebook decides, with a reason and the authority behind it"), then the engineer's ladder (PRINCIPLES → SPEC → run the conformance cases → run the invoice scenario → backtest your own log → trust or check the conflict analysis), the repo map, and the invoice scenario as the first thing to run (`npm run acceptance`), with the `/3` robotics quick start kept below it.
- **`AGENTS.md`** — the invariants for both formats (one evaluator, the dialect table, args→facts, delegation, bound approvals, missions only tighten, the adapter never runs a refusal), the file map of the new root, the commands.
- **`conformance/README.md`** — already covers `d1`–`d6`; gets `d7` (7b) and loses the robotics-only framing.
- **`RELATED-WORK.md`** — kept; gains the agent-side comparisons (tool-call guardrails that judge text, policy engines that take facts from the caller).

Deleted rather than rewritten:

- **`KNOWN-GAPS.md`** is not carried. Of its items: "fact provenance and freshness", "replay protection depends on the caller's set", "authority not bound to identity", "no persistence, versioning or distribution", "validation re-derives what it can; a signature protects the rest" apply to `/1` and become BOUNDARY lines (each with its "proved by" case or an explicit "not proved: out of scope"); "the conflict analysis does not model history conditions" becomes a BOUNDARY line pointing at the `possible` certainty and at `d5`'s order rules; "overlapping or nested areas", "robot-to-robot coordination", "the semantic-volumes adapter", "the plain-text drafter" are robotics-dialect notes and move into the robotics section of BOUNDARY.
- The old root `README.md` (946 lines, two products), `AGENTS.md` (old CLI and adapters), `llms.txt`, `openapi.yaml`: replaced, not merged; their content describes the holding tree.
- `engine/DESIGN-digital.md` and this plan are not user documentation: they go to `docs/provenance/` as the record of how the engine came to be.

## Founder decisions on D (received during slice 7c, applied in 7c-3)

- **D-1** Holding. `src/spatial/**` and `src/adapters/mentraos.ts` removed from the tree (they live on in `legacy/main`); the `/3` glasses bridge and zone-rules stay in the engine as part of the robotics dialect.
- **D-2** Holding-repo follow-up, nothing in this repository: when the founder creates `NeuroverseOS/neuroverseos-governance-holding` and pushes `legacy/main` there, pin `apps/mirror/package.json`'s dependency to the pre-cut commit (`#73ff13a` or the `legacy/pre-cut` ref) in that copy.
- **D-3** README and CHANGELOG carry a short "0.x API" section: the old engine and its subpath exports live at `legacy/main` (and at the holding repository once it exists); the last published 0.x on npm is 0.12. Deprecating 0.x on npm is a founder decision at 1.0.0 stable, not at the rc.
- **D-4** Holding. `skills/**`, `hooks/hooks.json` and `.claude-plugin/**` removed from the tree; the govern-my-chatbot plugin re-homes at the holding repository (its two URLs are updated there, as the holding follow-up). The chat module and the plugin are not part of 1.0; CHANGELOG says where they live.
- **D-5** No `bin` in 1.0.0-rc.1. A CLI may return if asked, built on the one evaluator (CHANGELOG).
- **D-6** All `/3` tooling carried unchanged in rc.1 (templates, draft, glasses, zone-rules, `legacy.ts`), so the robotics dialect and its 346 seed tests stay byte-identical. `legacy.ts` (the 0.2 input shape) is marked deprecated in CHANGELOG and AGENTS.md, for removal at 1.1 together with its tests and cases.
- **D-7** `examples/mcp` carried as the `/3` example. "A `/1` MCP `may_i` example built on the tool-call adapter" is a named follow-up in CHANGELOG; not built in this stage.

Rollback point: tag pushes were refused again (HTTP 403), so the pre-cut tree is the branch `legacy/pre-cut` (= `0600b27`), as the plan allowed.
