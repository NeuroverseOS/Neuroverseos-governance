#!/usr/bin/env node
/**
 * Runs the conformance cases against the built package (dist/), with no test
 * framework. From the repo root after `npm run build`:
 *
 *   node conformance/run-node.mjs            # every case
 *   node conformance/run-node.mjs --client   # only the client subset (cases marked `client: true`)
 *
 * Exit code 0 when every case passes. To run the cases against ANOTHER
 * implementation, copy this file and replace `impl` with calls into yours
 * (or port the loop: it is ten lines, see README.md).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCases, runCase } from './compare.mjs';
import * as core from '../dist/index.js';

const impl = {
  evaluate: core.evaluateDomainAction,
  evaluatePlan: core.evaluatePlan,
  verifyAndEvaluate: core.verifyAndEvaluate,
  verifyAndEvaluatePlan: core.verifyAndEvaluatePlan,
  check: core.checkRulebook,
  matches: core.matchingRules,
  validate: core.validateRulebook,
  canonical: core.canonicalJson,
  fingerprint: core.fingerprint,
  sha256: core.sha256Utf8,
  verifyApproval: core.verifyApproval,
  verifyRulebookSignature: core.verifyRulebookSignature,
  backtest: core.backtest,
  compareBacktests: core.compareBacktests,
  // The tool-call adapter, with a harness built from the case's data (SPEC.md § 16.9).
  govern: async (call, session, harnessData, executor, before = []) => {
    const h = core.harnessFromData(harnessData);   // one harness for the whole sequence: its ledger, nonces and history carry over
    for (const b of before) await core.govern(b.call, session, h, async (tool) => { if (b.fault === 'executor_throws') throw new Error('executor failed (test fault)'); return { ran: tool }; });
    return core.govern(call, session, h, executor);
  },
};

const dir = path.dirname(fileURLToPath(import.meta.url));
const client = process.argv.includes('--client');
const all = await loadCases(fs, path, dir, { client });
let failed = 0;
for (const { file, case: c, rulebook } of all) {
  const problem = await runCase(c, impl, rulebook);
  if (problem) { failed++; console.log(`FAIL ${file} ${c.id}\n  ${c.description}\n  ${problem}`); }
}
console.log(`${all.length - failed}/${all.length} conformance cases pass${client ? ' (client subset)' : ''}`);
process.exit(failed ? 1 : 0);
