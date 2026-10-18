#!/usr/bin/env node
/**
 * Validates every conformance case against the JSON Schemas in spec/:
 * the inputs as written (rulebooks, requests, plans, event logs, approvals
 * that are meant to verify) and the reference outputs recomputed from the
 * built package (decisions, plan evaluations, findings, backtest reports).
 * Then the NEGATIVE side: a list of inputs each schema must REJECT (a
 * schema that accepts everything would pass the positive side alone).
 * Exit code 0 when nothing drifts. From the repo root after `npm run build`:
 *
 *   node conformance/validate-schemas.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { loadCases } from './compare.mjs';
import * as core from '../dist/index.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const specDir = path.join(dir, '..', 'spec');
const ajv = new Ajv2020({ strict: false, allErrors: true });
for (const file of fs.readdirSync(specDir).filter(f => f.endsWith('.schema.json'))) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(specDir, file), 'utf8')));
const base = 'https://neuroverseos.github.io/robot-domain-rules/spec/';
const validators = {
  rulebook: ajv.getSchema(`${base}rulebook.schema.json`),
  request: ajv.getSchema(`${base}request.schema.json`),
  decision: ajv.getSchema(`${base}decision.schema.json`),
  plan: ajv.getSchema(`${base}plan.schema.json`),
  planEvaluation: ajv.getSchema(`${base}plan-evaluation.schema.json`),
  findings: ajv.getSchema(`${base}findings.schema.json`),
  backtest: ajv.getSchema(`${base}backtest.schema.json`),
  backtestReport: ajv.getSchema(`${base}backtest-report.schema.json`),
  signedApproval: ajv.getSchema(`${base}approval.schema.json#/$defs/signedApproval`),
  approvalRequest: ajv.getSchema(`${base}approval.schema.json#/$defs/approvalRequest`),
};
for (const [k, v] of Object.entries(validators)) if (!v) { console.error(`no validator for ${k}`); process.exit(2); }

let checked = 0, failed = 0, skipped = 0;
/** A case whose point is that the input is incomplete (the reference refuses it as required_facts) is not expected to fit the input schema. */
const intentionallyIncomplete = (c) => {
  const e = c.expect;
  const d = e.decision ?? e.verifiedDecision;
  if (d) return d.reasons.some(r => r.ruleId === 'required_facts');
  const p = e.plan ?? e.verifiedPlan;
  if (p) return p.firstViolation?.ruleId === 'required_facts';
  if (e.backtest) return e.backtest.rows.some(r => r.missingFacts);
  return false;
};
/** A case whose point is that the RULEBOOK is refused by version (reason rulebook_version): its rulebook is not expected to fit the rulebook schema. */
const refusedRulebook = (c) => {
  const e = c.expect;
  const d = e.decision ?? e.verifiedDecision, p = e.plan ?? e.verifiedPlan;
  return (d && d.reasons.some(r => r.ruleId === 'rulebook_version')) || (p && p.firstViolation?.ruleId === 'rulebook_version');
};
const check = (what, validator, value, where) => {
  checked++;
  if (validator(value)) return;
  failed++;
  console.log(`DRIFT ${where}: ${what} does not match its schema\n  ${ajv.errorsText(validator.errors, { separator: '\n  ' })}`);
};

const all = await loadCases(fs, path, dir);
for (const { file, case: c, rulebook } of all) {
  const where = `${file} ${c.id}`;
  const e = c.expect;
  if (rulebook && !e.error && !refusedRulebook(c)) check('rulebook', validators.rulebook, rulebook, where);
  const inputOk = !intentionallyIncomplete(c);
  if (!inputOk) skipped++;
  if (c.request && (e.decision || e.verifiedDecision)) {
    if (inputOk) check('request', validators.request, c.request, where);
    const d = e.decision ? core.evaluateDomainAction(rulebook, c.request) : await core.verifyAndEvaluate(rulebook, c.request);
    check('decision', validators.decision, d, where);
    for (const a of d.approvalRequests ?? []) check('approvalRequest', validators.approvalRequest, a, where);
  }
  if ('plan' in c && c.plan !== null && (e.plan || e.verifiedPlan)) {
    if (inputOk) check('plan', validators.plan, c.plan, where);
    check('plan evaluation', validators.planEvaluation, e.plan ? core.evaluatePlan(rulebook, c.plan) : await core.verifyAndEvaluatePlan(rulebook, c.plan), where);
  }
  if (e.findings) check('findings', validators.findings, core.checkRulebook(rulebook), where);
  if (c.events) {
    if (inputOk) check('backtest input', validators.backtest, { events: c.events, ...(c.options ? { options: c.options } : {}) }, where);
    check('backtest report', validators.backtestReport, core.backtest(rulebook, c.events, c.options), where);
    if (c.proposed) check('proposed rulebook', validators.rulebook, c.proposed, where);
  }
  if (c.approval && e.verify?.ok) check('signed approval', validators.signedApproval, c.approval, where);
}
for (const file of fs.readdirSync(path.join(dir, 'rulebooks'))) check('shared rulebook', validators.rulebook, JSON.parse(fs.readFileSync(path.join(dir, 'rulebooks', file), 'utf8')), `rulebooks/${file}`);
const positive = checked;

// ─── Negative: inputs every schema must reject ────────────────────────────────
const tiny = JSON.parse(fs.readFileSync(path.join(dir, 'rulebooks', 'tiny.json'), 'utf8'));
const signedApproval = all.find(x => x.case.id === 'approvals-verify-ok').case.approval;
const request = { participant: { id: 'b-1', kind: 'robot', roleId: 'bot' }, action: 'go', areaId: 'floor', facts: { people: 0 } };
const plan = { participant: request.participant, initialFacts: {}, steps: [{ action: 'go', area: 'floor' }] };
const rule = tiny.rules[0] ?? { id: 'r', text: 'r', who: '*', does: '*', where: '*', then: { answer: 'deny' }, setBy: 'high', source: { kind: 'manual', ref: 'r' } };
const negatives = [
  ['rulebook', 'a /2 format', { ...tiny, format: 'neuroverse-domain-rules/2' }],
  ['rulebook', 'a 16-hex (/2) fingerprint', { ...tiny, fingerprint: '5f8c2e1a9b3d4c70' }],
  ['rulebook', 'no authorities', { ...tiny, authorities: [] }],
  ['rulebook', 'no areas', { ...tiny, areas: [] }],
  ['rulebook', 'an empty planRules list', { ...tiny, planRules: [] }],
  ['rulebook', 'an unknown fact type', { ...tiny, facts: [{ id: 'x', type: 'date' }] }],
  ['rulebook', 'an id with a colon', { ...tiny, areas: [{ id: 'a:b', name: 'A' }] }],
  ['rulebook', 'a rule with no setBy', { ...tiny, rules: [{ ...rule, setBy: undefined }] }],
  ['rulebook', 'a rule with no source', { ...tiny, rules: [{ ...rule, source: undefined }] }],
  ['rulebook', 'a condition wait naming an approver (by on a condition wait)', { ...tiny, rules: [{ ...rule, then: { answer: 'wait', for: 'condition', by: 'high' } }] }],
  ['rulebook', 'a wait with no for', { ...tiny, rules: [{ ...rule, then: { answer: 'wait' } }] }],
  ['rulebook', 'a limit outcome with no limits', { ...tiny, rules: [{ ...rule, then: { answer: 'limit', limits: {} } }] }],
  ['rulebook', 'a negative limit', { ...tiny, rules: [{ ...rule, then: { answer: 'limit', limits: { speed: -1 } } }] }],
  ['rulebook', 'an unknown outcome', { ...tiny, rules: [{ ...rule, then: { answer: 'maybe' } }] }],
  ['rulebook', 'a between condition with a bad time', { ...tiny, rules: [{ ...rule, when: [{ fact: 'time', op: 'between', from: '9:00', to: '10:00' }] }] }],
  ['rulebook', 'an in condition with no values', { ...tiny, rules: [{ ...rule, when: [{ fact: 'mode', op: 'in', values: [] }] }] }],
  ['rulebook', 'a history condition with the /2 clock member', { ...tiny, rules: [{ ...rule, history: [{ actions: 'go', clock: 'time', op: '>=', value: 1 }] }] }],
  ['rulebook', 'a history window over a day', { ...tiny, rules: [{ ...rule, history: [{ actions: 'go', withinMinutes: 1441, op: '>=', value: 1 }] }] }],
  ['rulebook', 'a trusted key with a short public key', { ...tiny, trustedKeys: [{ keyId: 'k', publicKey: 'abc' }] }],
  ['rulebook', 'an effect on no fact', { ...tiny, actions: [{ id: 'go', kinds: ['robot'], effects: [{ op: 'add', value: 1 }] }] }],
  ['rulebook', 'a finding of an unknown kind', { ...tiny, findings: [{ kind: 'mystery', severity: 'info', ruleIds: ['a', 'b'], certainty: 'certain', message: '' }] }],
  ['rulebook', 'a finding with three rule IDs', { ...tiny, findings: [{ kind: 'duplicate', severity: 'info', ruleIds: ['a', 'b', 'c'], certainty: 'certain', message: '' }] }],
  ['request', 'no facts', { ...request, facts: undefined }],
  ['request', 'no area', { ...request, areaId: undefined }],
  ['request', 'an empty participant id', { ...request, participant: { ...request.participant, id: '' } }],
  ['request', 'a now without a date', { ...request, now: '10:00' }],
  ['request', 'consumedApprovals that are not strings', { ...request, consumedApprovals: [1] }],
  ['request', 'an approval object with no id', { ...request, facts: { approvedBy: { authority: 'high' } } }],
  ['request', 'an empty approval list', { ...request, facts: { approvedBy: [] } }],
  ['request', 'an approval list holding a number', { ...request, facts: { approvedBy: [1] } }],
  ['request', 'a history entry with no area', { ...request, history: [{ action: 'go' }] }],
  ['plan', 'no steps', { ...plan, steps: [] }],
  ['plan', 'a step with no action', { ...plan, steps: [{ area: 'floor' }] }],
  ['plan', 'no initialFacts', { ...plan, initialFacts: undefined }],
  ['plan', 'a bad startTime', { ...plan, startTime: '25:00' }],
  ['plan', 'a negative step duration', { ...plan, stepDurationSeconds: -1 }],
  ['plan', 'a clock id with a colon', { ...plan, clock: 'a:b' }],
  ['signedApproval', 'no nonce', { ...signedApproval, nonce: undefined }],
  ['signedApproval', 'no expiresAt', { ...signedApproval, expiresAt: undefined }],
  ['signedApproval', 'a /2 spec', { ...signedApproval, spec: 'robot-domain-rules-approval/2' }],
  ['signedApproval', 'a requestDigest member (a /2 binding)', { ...signedApproval, requestDigest: 'a972a032bcabeaaf' }],
  ['signedApproval', 'a 16-hex rulebook fingerprint', { ...signedApproval, rulebookFingerprint: '96be85f891da7c40' }],
  ['signedApproval', 'a signature that is not 64 bytes of hex', { ...signedApproval, signature: 'zz' }],
  ['signedApproval', 'an unknown member', { ...signedApproval, verified: true }],
  ['decision', 'no reasons', { status: 'ALLOW', reasons: [], trace: [], fingerprint: tiny.fingerprint }],
  ['decision', 'an unknown status', { status: 'MAYBE', reasons: [{ ruleId: 'x', status: 'ALLOW', reason: '', setBy: 'builtin' }], trace: [{ ruleId: 'x', status: 'ALLOW', reason: '', setBy: 'builtin' }], fingerprint: tiny.fingerprint }],
  ['decision', 'an approvalsUsed entry without a nonce', { status: 'ALLOW', reasons: [{ ruleId: 'x', status: 'ALLOW', reason: '', setBy: 'builtin' }], trace: [{ ruleId: 'x', status: 'ALLOW', reason: '', setBy: 'builtin' }], approvalsUsed: [{ ruleId: 'x' }], fingerprint: tiny.fingerprint }],
  ['approvalRequest', 'no participant', { ruleId: 'x', rulebookFingerprint: tiny.fingerprint, action: 'go', areaId: 'floor', reason: '', setBy: 'high' }],
  ['backtest', 'an event with no at', { events: [{ request }] }],
  ['backtest', 'an unknown outcome', { events: [{ at: '2026-10-05T09:00', request, outcome: 'maybe' }] }],
  ['backtest', 'the /2 clock option', { events: [], options: { clock: 'time' } }],
];
let rejected = 0;
for (const [what, why, value] of negatives) {
  checked++;
  if (validators[what](JSON.parse(JSON.stringify(value)))) { failed++; console.log(`ACCEPTED ${what} schema accepts ${why}: ${JSON.stringify(value).slice(0, 160)}`); }
  else rejected++;
}
console.log(`${positive - (failed - (negatives.length - rejected))}/${positive} schema validations pass across ${all.length} cases (${skipped} inputs are intentionally incomplete and were not held to the input schema; their outputs were); ${rejected}/${negatives.length} invalid inputs rejected`);
process.exit(failed ? 1 : 0);
