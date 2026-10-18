/**
 * Runs every case in conformance/ against this implementation (src/), so the
 * reference passes its own suite. The judging rules live in
 * conformance/compare.mjs and are written out in conformance/README.md.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  evaluateDomainAction, evaluatePlan, matchingRules, checkRulebook, validateRulebook, canonicalJson, fingerprint, sha256Utf8, verifyApproval, verifyRulebookSignature,
  verifyAndEvaluate, verifyAndEvaluatePlan, backtest, compareBacktests, govern, harnessFromData,
  type Rulebook, type Session, type Executor, type HarnessData,
} from '../src/index';
import { loadCases, runCase } from '../conformance/compare.mjs';

const impl = {
  evaluate: evaluateDomainAction,
  evaluatePlan,
  verifyAndEvaluate,
  verifyAndEvaluatePlan,
  check: (rb: Rulebook) => checkRulebook(rb),
  matches: matchingRules,
  validate: validateRulebook,
  canonical: canonicalJson,
  fingerprint,
  sha256: sha256Utf8,
  verifyApproval,
  verifyRulebookSignature,
  backtest,
  compareBacktests,
  govern: (call: unknown, session: Session, harness: HarnessData, executor: Executor) => govern(call, session, harnessFromData(harness), executor),
};

const dir = path.join(__dirname, '..', 'conformance');
const all = await loadCases(fs, path, dir);
const clientCount = all.filter(x => x.case.client).length;

describe(`conformance (${all.length} cases, ${clientCount} in the client subset)`, () => {
  for (const { file, case: c, rulebook } of all) {
    it(`${file} ${c.id} — ${c.description}`, async () => {
      expect(await runCase(c, impl, rulebook)).toBeNull();
    });
  }
  it('the client subset is the decision, plan, error, canonical, sha256, verify, rulebookSignature and versions cases, and nothing else', () => {
    for (const { case: c } of all) {
      const e = c.expect;
      const clientKind = !!(e.decision || e.verifiedDecision || e.plan || e.verifiedPlan || e.error || e.canonical !== undefined || e.sha256 !== undefined || e.verify || e.rulebookSignature);
      expect(!!c.client, c.id).toBe(clientKind);
    }
    expect(clientCount).toBeGreaterThan(150);
  });
});
