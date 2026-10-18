# Provenance of the engine (seeded under `engine/`, now the repository root)

> Slice 7c moved `engine/*` to the root paths listed in `CUT-PLAN.md` § 2 (`engine/src` → `src`, `engine/spec` → `spec`, `engine/conformance` → `conformance`, `engine/adapters` → `adapters`, `engine/examples` → `examples`, `engine/test` → `test`, the package files and the documents to the root, these records to `docs/provenance/`). The paths below are as they were when written.

This directory is a seed copy of the robot-domain-rules engine, the first step
of Path B (generalising that engine into this repository). It is a private
package (`@neuroverseos/governance-engine@0.0.0-seed`) and is not wired into
this repository's root `package.json`, build or tests.

## Source

| | |
|---|---|
| Repository | https://github.com/NeuroverseOS/robot-domain-rules |
| Commit | `ef13e1941aa72d0f3a46107d4499ca00d1037248` |
| Version | 0.5.3 |
| Spec | `robot-domain-rules/3` (rulebook format `neuroverse-domain-rules/3`, approval contract `robot-domain-rules-approval/3`) |

## Paths copied

- `src/` (all of it, including `src/templates/`)
- `spec/` (all ten JSON Schemas)
- `conformance/` — every file in it: all `*.json` case files (`approvals`, `backtest`, `fingerprint`, `history`, `integrity`, `p1-source` … `p9-boundary`, `plans`, `versions`), `rulebooks/` (`grocery.json`, `shared.json`, `signed.json`, `tiny.json`), `compare.mjs`, `compare.d.mts`, `run-node.mjs`, `validate-schemas.mjs`, `generate.ts`, `README.md`
- `test/conformance.test.ts`, `test/domain-rules.test.ts`, `test/z3-crosscheck.test.ts` (every file in the source `test/`)
- `examples/` (slice 3b) — wholesale: `backtest/`, `harness/`, `mcp/` (files only; no `npm install` was run in `examples/mcp`), `clinic.ts`, `demo.ts`, `grocery-store.ts`, `legacy-store-0.2.ts`, `warehouse.ts`
- `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`
- `SPEC.md`, `PRINCIPLES.md`, `BOUNDARY.md`, `KNOWN-GAPS.md`, `RELATED-WORK.md`, `AGENTS.md`, `CHANGELOG.md`, `LICENSE`

## Paths deliberately not copied

- `site/`, `adapters/` (only `adapters/cedar/` exists), `docs/`, `.github/` — excluded by the Path B stage 1 brief. (`examples/` was excluded in slice 3 and copied in slice 3b, because `test/domain-rules.test.ts` and `conformance/generate.ts` import it.)
- `README.md` — not in the brief's list of documents to copy.

## Edits

The copy is byte-identical to the source except for these edits, all in
`package.json`:

```diff
-  "name": "@neuroverseos/robot-domain-rules",
-  "version": "0.5.3",
+  "name": "@neuroverseos/governance-engine",
+  "version": "0.0.0-seed",
+  "private": true,
```

No other file was edited. `tsconfig.json` was not edited. `package-lock.json` is unchanged and still names the package
`@neuroverseos/robot-domain-rules` 0.5.3; `npm ci` accepted it.

## Additions (files that do not exist in the source)

- `PROVENANCE.md` (this file).
- `vitest.config.ts` (slice 3b): `defineConfig({ test: { dir: 'test' } })`. The source repository has no vitest config; without one here, vitest walks up to the governance root's `vitest.config.ts` and fails to start. This file stops that walk and reproduces the source's defaults, restricted to `test/` as its `npm test` script (`vitest run --dir test`) already does.

## Verification of the byte-identical claim

Run from the governance repository with the source clone at
`/home/user/neuroverseos/robot-domain-rules`:

```
diff -r <source>/src         engine/src           -> no output, exit 0
diff -r <source>/spec        engine/spec          -> no output, exit 0
diff -r <source>/conformance engine/conformance   -> no output, exit 0
diff -r <source>/examples    engine/examples      -> no output, exit 0   (slice 3b)
diff <source>/test/<f> engine/test/<f>            -> no output, exit 0 for all three test files
diff -q on package-lock.json, tsconfig.json, .gitignore, SPEC.md, PRINCIPLES.md,
  BOUNDARY.md, KNOWN-GAPS.md, RELATED-WORK.md, AGENTS.md, CHANGELOG.md, LICENSE
                                                  -> identical, exit 0 for each
diff <source>/package.json engine/package.json    -> exit 1:
2,3c2,4
<   "name": "@neuroverseos/robot-domain-rules",
<   "version": "0.5.3",
---
>   "name": "@neuroverseos/governance-engine",
>   "version": "0.0.0-seed",
>   "private": true,
```

## Stage 2 (Path B slices 4–6): what changed after the seed

The seed above is history. From slice 4 on, `engine/` is this repository's
own engine and no longer byte-identical to robot-domain-rules; the byte-identity
claim applies to the slice 3/3b commits only. Stage 2 changed, in `engine/`:

- `src/`: the `neuroverse-governance/1` format on the one evaluator (SPEC.md § 16): `model.ts`, `governance.ts` added; `version.ts`, `types.ts`, `evaluate.ts`, `compile.ts`, `check.ts`, `plan.ts`, `approvals.ts`, `vocabulary.ts`, `index.ts`, `render.ts`, `draft.ts`, `backtest.ts`, `glasses.ts` edited. Two shared additions pinned by additive `/3` cases (SPEC.md § 11 errata): the `at_least` plan check and the condition-scope clarification.
- `adapters/tool-call/`: the enforcing adapter, the reference harness and the data-driven case harness (new). `tsconfig.json` includes it (and excludes `adapters/cedar` instead of all of `adapters`).
- `spec/`: six `/1` schemas added; `common.schema.json` gains `at_least`.
- `conformance/`: `d1`–`d6` case files and the `desk*` rulebooks added; `generate.ts`, `compare.mjs`, `run-node.mjs`, `validate-schemas.mjs`, `README.md` extended; `p4-unknown-and-missing.json` and `plans.json` gained the pinned cases (additions only; the 261 seed cases are byte-identical).
- `test/`: `tool-call-adapter.test.ts` added; `conformance.test.ts` wires the adapter.
- `SPEC.md` § 16 and § 11 errata; `DESIGN-digital.md`; this file.
- `package.json`: unchanged beyond the slice 3 edits (no new dependencies; `npm test` picks up the new test file through `--dir test`; `build` bundles the adapter through `src/index.ts`).

## Results after slice 3b (Node v22.22.0, inside `engine/`)

With `examples/` and `vitest.config.ts` in place, nothing else changed:

| Step | Result |
|---|---|
| `npm run typecheck` | passed, exit 0 (`tsc --noEmit`, no output) |
| `npm test` (`vitest run --dir test`) | `✓ test/conformance.test.ts (262 tests)`, `✓ test/domain-rules.test.ts (83 tests)`, `✓ test/z3-crosscheck.test.ts (1 test) 15025ms`; `Test Files  3 passed (3)`, `Tests  346 passed (346)`. Z3 line: `z3 cross-check: 341 rulebooks, 2046 pairs (796 overlapping, 1250 disjoint; 241 overlapping on facts but unreachable), 122 unconditional never rules, 796 witnesses, 14.4 s` |
| `node conformance/run-node.mjs` | `261/261 conformance cases pass` |
| `npm run conformance:schemas` | `579/579 schema validations pass across 261 cases (30 inputs are intentionally incomplete and were not held to the input schema; their outputs were); 51/51 invalid inputs rejected` |
| `npm run demo` | exit 0; 446 lines of output (its three sections: grocery store, warehouse, clinic), 32 decision lines; no errors; it wrote no files (run without `--json`) |

## Results at seed time, slice 3 (before `examples/` and `vitest.config.ts`)

| Step | Result |
|---|---|
| `npm ci` | succeeded (npm reported 6 audit advisories in devDependencies: 3 moderate, 1 high, 2 critical) |
| `npm run typecheck` | **FAILED**, exit 2 — see below |
| `npm run build` | succeeded: `dist/index.js` 190.79 KB, `dist/index.cjs` 194.26 KB, `dist/index.d.ts` 77.32 KB |
| `node conformance/run-node.mjs` | `261/261 conformance cases pass` |
| `node conformance/run-node.mjs --client` | `205/205 conformance cases pass (client subset)` |
| `npm run conformance:schemas` | `579/579 schema validations pass across 261 cases (30 inputs are intentionally incomplete and were not held to the input schema; their outputs were); 51/51 invalid inputs rejected` |
| `npx vitest run test/conformance.test.ts` | as written, **FAILED** to start (see below); with a neutral empty config: `✓ test/conformance.test.ts (262 tests)`, `Test Files 1 passed (1)`, `Tests 262 passed (262)` (261 cases plus one test of the client-subset membership) |
| `npx vitest run test/domain-rules.test.ts` | **FAILED** both ways: `Error: Failed to load url ../examples/legacy-store-0.2 … Does the file exist?`, `Test Files 1 failed (1)`, `Tests no tests` |
| `npx vitest run test/z3-crosscheck.test.ts` | as written, **FAILED** to start; with a neutral empty config: `✓ test/z3-crosscheck.test.ts (1 test) 15522ms`, `Test Files 1 passed (1)`, `Tests 1 passed (1)` |

**Typecheck.** `tsc --noEmit` fails because `test/domain-rules.test.ts` and
`conformance/generate.ts` import from `../examples/`, which was not copied:

```
conformance/generate.ts(25,26): error TS2307: Cannot find module '../examples/grocery-store' or its corresponding type declarations.
test/domain-rules.test.ts(23,23): error TS2307: Cannot find module '../examples/legacy-store-0.2' or its corresponding type declarations.
test/domain-rules.test.ts(24,26): error TS2307: Cannot find module '../examples/grocery-store' or its corresponding type declarations.
test/domain-rules.test.ts(25,32): error TS2307: Cannot find module '../examples/clinic' or its corresponding type declarations.
test/domain-rules.test.ts(26,28): error TS2307: Cannot find module '../examples/backtest/rulebook' or its corresponding type declarations.
```

followed by seven `TS7006`/`TS7031` implicit-any errors in
`test/domain-rules.test.ts` that follow from those missing modules. The
`examples/**/*.ts` include in `tsconfig.json` matches nothing, but that is not
what breaks the typecheck, so `tsconfig.json` was left unchanged; excluding the
two importing files would hide a test from the typecheck. A diagnostic
typecheck (a temporary tsconfig outside the repository that extends this one
and includes only `src/**/*.ts`, `test/conformance.test.ts` and
`test/z3-crosscheck.test.ts`) passed with exit 0.

**Vitest start-up.** With no vitest config in `engine/`, vitest walks up to the
governance root's `vitest.config.ts`, which imports `vitest/config` from the
root's (uninstalled) `node_modules` and fails:
`failed to load config from /home/user/neuroverseos-governance/vitest.config.ts`,
`Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vitest' imported from …`.
The source repository has no vitest config, so the equivalent run is with an
empty config: `npx vitest run --config <scratch>/vitest.neutral.config.mjs --root engine test/<file>`
where the config file is `export default {};` and lives outside the repository.
The figures above for the neutral run come from that command.

`node_modules/` and `dist/` are ignored (the copied `.gitignore`) and are not
committed.
