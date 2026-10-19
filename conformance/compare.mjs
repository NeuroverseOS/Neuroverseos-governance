/**
 * How a conformance case is judged. Shared by test/conformance.test.ts (runs
 * against src/) and run-node.mjs (runs against dist/). Plain JavaScript so
 * any Node can load it; the rules it encodes are written out in README.md.
 *
 * A case has one of these `expect` shapes:
 *   { decision }       evaluate(rulebook, request) must match (see below)
 *   { verifiedDecision }  verifyAndEvaluate(rulebook, request) must match (the trusted layer's entry: signatures verified first)
 *   { plan }           evaluatePlan(rulebook, case.plan) must match (see below)
 *   { verifiedPlan }   verifyAndEvaluatePlan(rulebook, case.plan) must match
 *   { findings }       check(rulebook) must report exactly these findings, any order
 *   { error: true }    the rulebook must be rejected by validation
 *   { canonical, fingerprint }   of `case.value`
 *   { sha256 }         of the UTF-8 bytes of `case.text`
 *   { verify: { ok } } verifyApproval(case.approval, case.trustedKeys)
 *   { rulebookSignature: { ok } }  verifyRulebookSignature(rulebook, case.signature, case.publicKey)
 *   { backtest }       backtest(rulebook, case.events, case.options) must equal it, deep (the report has no free text)
 *   { comparison }     compareBacktests(backtest(rulebook, …), backtest(case.proposed, …)) must equal it, deep
 *
 *   { enforcement }    govern(case.call, session, harness, spy executor) through the tool-call adapter must give this status, `executed`, `outcome`
 *                      (not_run | ran | uncertain), the reason IDs, the limits, the error stage and the rejection codes (SPEC.md § 16.9);
 *                      `case.before` lists calls run first through the same harness (each with `fault: "executor_throws"` or not), so the
 *                      ledger, the nonces and the history a sequence leaves behind are what the judged call sees
 *
 * A case may also carry `forbidKeys: [...]`: the decision (or plan evaluation) JSON must contain none of those keys anywhere
 * (used to prove a decision never carries an approval's signature or key material).
 *
 * /1 (neuroverse-governance/1) cases use the same shapes; approval requests are compared on their /1 fields
 * (principalId, tool, scope, argsDigest) and `approvalsRejected` as an ordered list of { id, nonce, code } (reason free).
 *
 * A case with `client: true` is one a client (evaluate, fingerprint verify, approval verify, plans) must pass;
 * the rest are for authoring tools (findings, backtest). `loadCases(…, { client: true })` keeps only those.
 *
 * Decision comparison — exact on: status, limits (deep), then, fingerprint,
 * approvalsUsed (deep); reasons and trace as ordered lists of { ruleId,
 * status, setBy } (the `reason` text is free-form); approvalRequests as an
 * ordered list of { ruleId, by, rulebookFingerprint, participantId, action,
 * areaId, setBy } (reason text free). A field absent from the expectation
 * must be absent from the decision.
 *
 * Every comparison is DEEP SEMANTIC equality: object key order never
 * matters, arrays are ordered, numbers compare by value.
 *
 * Findings comparison — as a multiset of { kind, severity, ruleIds, certainty,
 * witness? }; ruleIds keep their order and must equal the expected pair; the
 * message is free-form. A witness is judged for VALIDITY, not equality: when
 * the implementation offers `matches(rulebook, request) → ruleIds`, every
 * witness it reports must be a request that matches both rules of its
 * finding, it must report one wherever the expectation has one, AND its
 * `matches` must be sound: for every reference witness in the expectation,
 * `matches(rulebook, witness)` must equal the reference's recorded
 * `witnessMatches` exactly (as a set) — so a `matches` that returns every
 * rule, or the finding's own pair, fails. Without `matches`, the witness must
 * equal the reference's (the reference picks the first ID in declaration
 * order and the smallest value in every overlap, SPEC.md § 7.4).
 *
 * Plan comparison — status, finalArea, finalFacts (deep), planDigest,
 * approvalsUsed (deep) and fingerprint exact; steps as an ordered list of
 * { index, action, areaId, decision } with the decision compared as above;
 * planChecks as an ordered list of { ruleId, status, setBy, stepIndex };
 * firstViolation on { stepIndex, ruleId, setBy, from } (absent means absent);
 * approvalRequests as for a decision.
 */

const rejected = (r) => ({ id: r.id, nonce: r.nonce, code: r.code });
const check = (c) => ({ ruleId: c.ruleId, status: c.status, setBy: c.setBy, approvalsRejected: c.approvalsRejected ? c.approvalsRejected.map(rejected) : undefined });
const ask = (a) => ({ ruleId: a.ruleId, by: a.by, rulebookFingerprint: a.rulebookFingerprint, principalId: a.principalId, participantId: a.participantId, action: a.action, areaId: a.areaId, tool: a.tool, scope: a.scope, argsDigest: a.argsDigest, setBy: a.setBy });
const finding = (f) => ({ kind: f.kind, severity: f.severity, ruleIds: [...f.ruleIds], certainty: f.certainty, witness: f.witness, witnessMatches: f.witnessMatches });
const planCheck = (c) => ({ ruleId: c.ruleId, status: c.status, setBy: c.setBy, stepIndex: c.stepIndex });

function strip(value) {
  return JSON.parse(JSON.stringify(value));
}

/** The comparable projection of a decision. */
export function projectDecision(d) {
  return strip({
    status: d.status,
    reasons: d.reasons.map(check),
    trace: d.trace.map(check),
    limits: d.limits,
    then: d.then,
    approvalRequests: d.approvalRequests ? d.approvalRequests.map(ask) : undefined,
    approvalsUsed: d.approvalsUsed,
    approvalsRejected: d.approvalsRejected ? d.approvalsRejected.map(rejected) : undefined,
    fingerprint: d.fingerprint,
  });
}

export function projectFindings(findings) {
  return strip(findings.map(finding)).sort((a, b) => key(a).localeCompare(key(b)));
}

/** The comparable projection of a plan evaluation. */
export function projectPlan(p) {
  return strip({
    status: p.status,
    steps: p.steps.map(s => ({ index: s.index, action: s.action, areaId: s.areaId, tool: s.tool, scope: s.scope, decision: projectDecision(s.decision) })),
    planChecks: p.planChecks.map(planCheck),
    firstViolation: p.firstViolation ? { stepIndex: p.firstViolation.stepIndex, ruleId: p.firstViolation.ruleId, setBy: p.firstViolation.setBy, from: p.firstViolation.from } : undefined,
    approvalRequests: p.approvalRequests.map(ask),
    approvalsUsed: p.approvalsUsed,
    finalFacts: p.finalFacts,
    finalArea: p.finalArea,
    finalScope: p.finalScope,
    planDigest: p.planDigest,
    fingerprint: p.fingerprint,
  });
}

const withoutWitness = (f) => { const { witness, witnessMatches, ...rest } = f; return { ...rest, hasWitness: witness !== undefined }; };
const sameSet = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

/** A sort key independent of object key order. */
const key = (f) => JSON.stringify(canon(f));

/** The value with every object's keys sorted, recursively (arrays keep their order). */
export function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])]));
  return v;
}

/** Deep semantic equality: objects by key set and values (any order), arrays by position, primitives by value. */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).filter(k => a[k] !== undefined).sort(), kb = Object.keys(b).filter(k => b[k] !== undefined).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && deepEqual(a[k], b[k]));
  }
  return false;
}

/**
 * Run one case against an implementation `impl`:
 *   { evaluate(rulebook, request), evaluatePlan(rulebook, plan), check(rulebook), validate(rulebook) → problems[],
 *     verifyAndEvaluate(rulebook, request) → Promise<decision>, verifyAndEvaluatePlan(rulebook, plan) → Promise<planEvaluation>,
 *     matches?(rulebook, request) → ruleIds (optional; see witness rule above),
 *     canonical(value), fingerprint(value), sha256(utf8Text) → hex,
 *     verifyApproval(approval, keys) → Promise<{ok}>, verifyRulebookSignature(rulebook, sig, pub) → Promise<boolean>,
 *     backtest(rulebook, events, options?) → report, compareBacktests(reportA, reportB) → comparison }
 * Returns null when the case passes, else a short description of the mismatch.
 */
export async function runCase(c, impl, rulebook) {
  const e = c.expect;
  if (e.error) {
    const problems = impl.validate(rulebook);
    return problems.length ? null : 'expected the rulebook to be rejected, but validation found no problem';
  }
  if (e.decision || e.verifiedDecision) {
    const want0 = e.decision ?? e.verifiedDecision;
    const full = e.decision ? impl.evaluate(rulebook, c.request) : await impl.verifyAndEvaluate(rulebook, c.request);
    const leaked = forbidden(c, full);
    if (leaked) return leaked;
    const got = projectDecision(full);
    const want = strip({ ...want0, reasons: want0.reasons.map(check), trace: want0.trace.map(check), approvalRequests: want0.approvalRequests?.map(ask), approvalsRejected: want0.approvalsRejected?.map(rejected) });
    return deepEqual(got, want) ? null : `decision differs\n  want ${JSON.stringify(want)}\n  got  ${JSON.stringify(got)}`;
  }
  if (e.plan || e.verifiedPlan) {
    const want0 = e.plan ?? e.verifiedPlan;
    const full = e.plan ? impl.evaluatePlan(rulebook, c.plan) : await impl.verifyAndEvaluatePlan(rulebook, c.plan);
    const leaked = forbidden(c, full);
    if (leaked) return leaked;
    const got = projectPlan(full);
    const want = strip({ ...want0, steps: want0.steps.map(s => ({ ...s, decision: { ...s.decision, reasons: s.decision.reasons.map(check), trace: s.decision.trace.map(check), approvalRequests: s.decision.approvalRequests?.map(ask), approvalsRejected: s.decision.approvalsRejected?.map(rejected) } })), planChecks: want0.planChecks.map(planCheck), approvalRequests: want0.approvalRequests.map(ask) });
    return deepEqual(got, want) ? null : `plan evaluation differs\n  want ${JSON.stringify(want)}\n  got  ${JSON.stringify(got)}`;
  }
  if (e.enforcement) {
    if (!impl.govern) return 'this implementation offers no tool-call adapter (impl.govern); enforcement cases need one';
    const calls = [];
    const executor = async (tool, args, context) => { calls.push({ tool, args, limits: context?.limits }); if (c.harness?.fault === 'executor_throws') throw new Error('executor failed (test fault)'); return { ran: tool }; };
    const outcome = await impl.govern(c.call, { ...c.session, rulebook }, c.harness ?? {}, executor, c.before ?? []);
    const { request: _echo, ...rest } = outcome;   // the echoed request holds what the harness supplied (its approvals included); the decision and everything else must be clean
    const leaked = forbidden(c, rest);
    if (leaked) return leaked;
    if (JSON.stringify(outcome.decision ?? {}).includes('"signature"')) return 'the decision carries a signature';
    const rejected = (outcome.decision?.approvalsRejected ?? []).map(r => r.code);
    const got = { status: outcome.status, executed: outcome.executed, outcome: outcome.outcome, calls: calls.length, reasons: (outcome.decision?.reasons ?? []).map(r => r.ruleId), limits: calls[0]?.limits, error: outcome.error ? outcome.error.stage : undefined, rejected: rejected.length ? rejected : undefined };
    const want = { status: e.enforcement.status, executed: e.enforcement.executed, outcome: e.enforcement.outcome, calls: e.enforcement.executed ? 1 : 0, reasons: e.enforcement.reasons, limits: e.enforcement.limits, error: e.enforcement.error, rejected: e.enforcement.rejected };
    return deepEqual(strip(got), strip(want)) ? null : `enforcement differs\n  want ${JSON.stringify(want)}\n  got  ${JSON.stringify(got)}`;
  }
  if (e.findings) {
    const gotFull = projectFindings(impl.check(rulebook));
    const wantFull = projectFindings(e.findings);
    if (!impl.matches) {
      const bare = (f) => { const { witnessMatches, ...rest } = f; return rest; };
      return deepEqual(gotFull.map(bare), wantFull.map(bare)) ? null : `findings differ\n  want ${JSON.stringify(wantFull)}\n  got  ${JSON.stringify(gotFull)}`;
    }
    const got = gotFull.map(withoutWitness), want = wantFull.map(withoutWitness);
    if (!deepEqual(got, want)) return `findings differ\n  want ${JSON.stringify(want)}\n  got  ${JSON.stringify(got)}`;
    for (const f of gotFull) {
      if (!f.witness) continue;
      const hit = impl.matches(rulebook, f.witness);
      if (!f.ruleIds.every(id => hit.includes(id))) return `witness of ${f.kind} ${f.ruleIds.join('+')} does not match both rules (matches ${JSON.stringify(hit)}): ${JSON.stringify(f.witness)}`;
    }
    // The implementation's `matches` must be sound: on every reference witness it must report exactly the rules the reference does.
    for (const f of wantFull) {
      if (!f.witness || !f.witnessMatches) continue;
      const hit = impl.matches(rulebook, f.witness);
      if (!sameSet(hit, f.witnessMatches)) return `matches() is not the matching relation: on the reference witness of ${f.kind} ${f.ruleIds.join('+')} it reports ${JSON.stringify(hit)}, the reference reports ${JSON.stringify(f.witnessMatches)}`;
    }
    return null;
  }
  if (e.canonical !== undefined || e.fingerprint !== undefined) {
    const canonical = impl.canonical(c.value), fp = impl.fingerprint(c.value);
    if (e.canonical !== undefined && canonical !== e.canonical) return `canonical JSON differs\n  want ${e.canonical}\n  got  ${canonical}`;
    if (e.fingerprint !== undefined && fp !== e.fingerprint) return `fingerprint differs: want ${e.fingerprint}, got ${fp}`;
    return null;
  }
  if (e.sha256 !== undefined) {
    const got = impl.sha256(c.text);
    return got === e.sha256 ? null : `sha256 differs: want ${e.sha256}, got ${got}`;
  }
  if (e.verify) {
    const r = await impl.verifyApproval(c.approval, c.trustedKeys);
    return r.ok === e.verify.ok ? null : `verifyApproval: want ok=${e.verify.ok}, got ok=${r.ok}${r.reason ? ` (${r.reason})` : ''}`;
  }
  if (e.rulebookSignature) {
    const ok = await impl.verifyRulebookSignature(rulebook, c.signature, c.publicKey);
    return ok === e.rulebookSignature.ok ? null : `verifyRulebookSignature: want ${e.rulebookSignature.ok}, got ${ok}`;
  }
  if (e.backtest) {
    const got = strip(impl.backtest(rulebook, c.events, c.options));
    return deepEqual(got, strip(e.backtest)) ? null : `backtest report differs\n  want ${JSON.stringify(e.backtest)}\n  got  ${JSON.stringify(got)}`;
  }
  if (e.comparison) {
    const got = strip(impl.compareBacktests(impl.backtest(rulebook, c.events, c.options), impl.backtest(c.proposed, c.events, c.options)));
    return deepEqual(got, strip(e.comparison)) ? null : `backtest comparison differs\n  want ${JSON.stringify(e.comparison)}\n  got  ${JSON.stringify(got)}`;
  }
  return `case has no recognised expectation: ${Object.keys(e).join(', ')}`;
}

/** `case.forbidKeys`: none of these keys may appear anywhere in the value (deep). Null when fine, else the problem. */
function forbidden(c, value) {
  if (!Array.isArray(c.forbidKeys) || !c.forbidKeys.length) return null;
  const seen = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (c.forbidKeys.includes(k)) seen.add(k); walk(x); }
  };
  walk(JSON.parse(JSON.stringify(value)));
  return seen.size ? `the result carries forbidden key(s) ${[...seen].join(', ')}: ${JSON.stringify(value).slice(0, 200)}` : null;
}

/** Load every case file (alphabetical), resolving rulebookRef against the conformance directory. `{ client: true }` keeps only the client subset. */
export async function loadCases(fs, path, dir, options = {}) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  const out = [];
  for (const file of files) {
    const cases = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const c of cases) {
      if (options.client && !c.client) continue;
      const rulebook = c.rulebook ?? (c.rulebookRef ? JSON.parse(fs.readFileSync(path.join(dir, c.rulebookRef), 'utf8')) : undefined);
      out.push({ file, case: c, rulebook });
    }
  }
  return out;
}
