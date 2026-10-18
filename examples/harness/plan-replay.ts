#!/usr/bin/env npx tsx
/**
 * Planner replay: an AI planner's plan is rejected, revised, approved, accepted.
 *
 *   npx tsx examples/harness/plan-replay.ts
 *
 * Reads plans.jsonl — two versions of a plan from a (simulated, deterministic,
 * no model call) AI planner for a restock robot — and checks each against the
 * harness rulebook with `evaluatePlan`:
 *
 *   v1  skips the shelf scan, carries stock into the checkout and ends away
 *       from the dock → rejected at the first violation, with the rule, its
 *       reason and the authority behind it; every other violation is listed too
 *   v2  scans first, puts the stock down in the back room, fetches a part
 *       from the electrical room, docks → one step needs a person's approval;
 *       the result says which rule, participant, action and area to sign for
 *   v2 + Dana's signed approval (Ed25519, TEST ONLY key, as in replay.ts)
 *       → accepted, with the projected facts and the area it ends in
 *
 * Writes a readable transcript to stdout and an append-only log,
 * plan-decisions.jsonl (plan, evaluation, rulebook fingerprint, approval
 * refs). Deterministic: times come from the plan, the signature from a fixed
 * seed. The rulebook is the grocery template over the semantic-volume areas
 * (volumes-to-areas.ts) plus the manager's rules and two plan rules.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  DomainRulesBuilder, compileDomain, evaluatePlan, publicKeyOf, signApproval, verifyApproval,
  type Plan, type PlanEvaluation, type Rulebook,
} from '../../src/index';
import { parseSemanticVolumes, volumesToAreas } from './volumes-to-areas';

const dir = import.meta.dirname;
const volumes = parseSemanticVolumes(JSON.parse(readFileSync(join(dir, 'semantic-volumes.json'), 'utf8')), 'harness-store-scene');

// TEST ONLY signing key for the manager's glasses (the same as replay.ts). Real keys live in your key management.
const DANA_SEED = '4444444444444444444444444444444444444444444444444444444444444444';

export async function harnessRulebook(): Promise<Rulebook> {
  const danaPublicKey = await publicKeyOf(DANA_SEED);
  const builder = new DomainRulesBuilder({ id: 'harness-store', name: 'Harness store', hours: { open: '07:00', close: '22:00' } }).fromTemplate('grocery-store');
  for (const area of volumesToAreas(volumes)) builder.area(area);
  builder
    .role({ id: 'inventory_robot', name: 'Inventory robot', kind: 'robot', actions: ['enter_zone', 'move', 'scan', 'dock'] })
    .role({ id: 'restock_robot', name: 'Restock robot', kind: 'robot', inherits: 'inventory_robot', actions: ['manipulate', 'place'] })
    .role({ id: 'staff', name: 'Staff', kind: 'person', actions: ['ai_overlay', 'camera_capture', 'share_location', 'command_robot'], tags: ['staff'] })
    .answer('robots_near_people', 'slow').answer('robot_speed', 'walking').answer('robots_staff_zones', 'when_staff_present')
    .answer('robots_restricted_zones', 'with_approval').answer('robot_scan_near_people', 'pause').answer('glasses_capture', 'staff_only')
    .answer('robot_commands', 'staff_only').answer('emergency', 'stop_then_dock').answer('unknown_actions', 'block')
    .as('site-manager');
  builder.confirm(builder.addRuleFromText('robots slow to 0.3 m/s in checkout', { id: 'checkout_speed' }));
  builder.addRule({
    id: 'no_carrying_through_checkout', text: 'Robots carrying stock do not enter the checkout.',
    who: 'kind:robot', does: 'enter_zone', where: '7f2d9a10-1b3c-4d5e-8f60-000000000003', when: [{ fact: 'carrying', op: '==', value: true }],
    then: { answer: 'deny', instead: 'place' }, reason: 'Robots carrying stock do not enter the checkout; put it down first.',
  });
  builder.addPlanRule({ id: 'scan_before_restock', text: 'A robot scans a shelf before it restocks it.', who: 'kind:robot', check: { kind: 'before', first: 'scan', then: 'manipulate', sameArea: true }, reason: 'Scan the shelf before restocking it.' });
  builder.addPlanRule({ id: 'end_at_dock', text: 'Every robot plan ends at a charging dock.', who: 'kind:robot', check: { kind: 'ends_in', areas: 'tag:dock' }, reason: 'Every plan ends at a charging dock.' });
  return compileDomain({ ...builder.toInput(), trustedKeys: [{ keyId: 'dana-glasses', publicKey: danaPublicKey, authority: 'site-manager' }] });
}

function transcript(label: string, plan: Plan, r: PlanEvaluation, rulebook: Rulebook): string[] {
  const L: string[] = [];
  const name = (id: string) => rulebook.areas.find(a => a.id === id)?.name ?? id;
  L.push(`${label} — ${r.status}${r.firstViolation ? ` (rejected at step ${r.firstViolation.stepIndex + 1}: ${r.firstViolation.ruleId} [${r.firstViolation.setBy}] — ${r.firstViolation.reason})` : ''}`);
  for (const s of r.steps) {
    const d = s.decision;
    const why = d.reasons.map(x => `${x.ruleId} [${x.setBy}]`).join(', ');
    const extra = d.limits ? ` limits ${JSON.stringify(d.limits)}` : d.then ? ` → then ${d.then}` : d.approvalRequests ? ` → needs approval by ${d.approvalRequests.map(a => a.by ?? 'anyone').join('/')}` : '';
    L.push(`  ${String(s.index + 1).padStart(2)}. ${s.facts.localTime}  ${d.status.padEnd(5)} ${s.action.padEnd(11)} in ${name(s.areaId).padEnd(15)} carrying=${String(s.facts.carrying ?? false).padEnd(5)} — ${why}${extra}${plan.steps[s.index].note ? `   ← ${plan.steps[s.index].note}` : ''}`);
  }
  if (r.steps.length < plan.steps.length) L.push(`      (${plan.steps.length - r.steps.length} later step${plan.steps.length - r.steps.length === 1 ? '' : 's'} not projected: the plan does not continue past a refusal)`);
  for (const c of r.planChecks) L.push(`  plan rule ${c.ruleId} [${c.setBy}]: ${c.status}${c.stepIndex !== undefined ? ` at step ${c.stepIndex + 1}` : ''} — ${c.reason}`);
  if (r.approvalRequests.length) L.push(`  approvals needed before this plan can run: ${r.approvalRequests.map(a => `${a.ruleId} by ${a.by ?? 'anyone'} (${a.participantId} ${a.action} in ${name(a.areaId)})`).join('; ')}`);
  if (r.status !== 'BLOCK') L.push(`  ends in ${name(r.finalArea)}; final facts carrying=${String(r.finalFacts.carrying)}, localTime=${String(r.finalFacts.localTime)}`);
  return L;
}

async function main() {
  const rulebook = await harnessRulebook();
  const lines = readFileSync(join(dir, 'plans.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as { version: string; by: string; t: string; note: string; plan: Plan });
  const log: Array<Record<string, unknown>> = [];
  const out: string[] = [];
  out.push(`Rulebook ${rulebook.fingerprint} — ${rulebook.areas.length} areas from ${volumes.items.length} semantic volumes, ${rulebook.rules.length} rules, ${rulebook.planRules?.length ?? 0} plan rules, findings: ${rulebook.findings.length}`, '');

  let seq = 0;
  let pending: PlanEvaluation | null = null;
  let last: { version: string; plan: Plan } | null = null;
  for (const entry of lines) {
    const r = evaluatePlan(rulebook, entry.plan);
    seq++;
    log.push({ seq, t: entry.t, by: entry.by, version: entry.version, plan: entry.plan, evaluation: r, rulebookFingerprint: rulebook.fingerprint });
    out.push(`${entry.t.slice(11, 16)}  ${entry.by}: ${entry.note}`, ...transcript(`Plan ${entry.version}`, entry.plan, r, rulebook), '');
    pending = r.status === 'PAUSE' ? r : null;
    last = { version: entry.version, plan: entry.plan };
  }

  // The manager signs the one approval the accepted shape still needs; the harness verifies it, then the planner re-sends the plan with it on that step.
  if (pending && last) {
    const ask = pending.approvalRequests[0];
    const t = '2026-10-12T09:33:00Z';
    const signed = await signApproval({ id: 'dana', authority: 'site-manager', ruleId: ask.ruleId, rulebookFingerprint: ask.rulebookFingerprint, participantId: ask.participantId, action: ask.action, areaId: ask.areaId, nonce: 'dana-glasses-plan-1', issuedAt: t, expiresAt: '2026-10-12T10:33:00Z' }, { keyId: 'dana-glasses', privateKey: DANA_SEED });
    const verified = await verifyApproval(signed, rulebook);
    if (!verified.ok) throw new Error(`approval did not verify: ${verified.reason}`);
    out.push(`${t.slice(11, 16)}  dana: signs the approval request her glasses showed her (rule ${ask.ruleId}, key ${signed.keyId}, signature ${signed.signature.slice(0, 12)}…; valid until 10:33, one use)`, '');
    const stepIndex = pending.steps.findIndex(s => s.decision.approvalRequests?.some(a => a.ruleId === ask.ruleId && a.action === ask.action && a.areaId === ask.areaId));
    const approvedPlan: Plan = { ...last.plan, steps: last.plan.steps.map((s, i) => (i === stepIndex ? { ...s, facts: { ...(s.facts ?? {}), approvedBy: verified.approval } } : s)) };
    const r = evaluatePlan(rulebook, approvedPlan);
    seq++;
    log.push({ seq, t: '2026-10-12T09:33:05Z', by: 'planner-1', version: `${last.version}+approval`, plan: approvedPlan, evaluation: r, rulebookFingerprint: rulebook.fingerprint, approvalRef: { keyId: signed.keyId, signature: signed.signature, nonce: signed.nonce } });
    out.push(`09:33  planner-1: re-sends plan ${last.version} with Dana's signed approval on step ${stepIndex + 1}.`, ...transcript(`Plan ${last.version} + approval`, approvedPlan, r, rulebook), '');
    out.push('  (A plan verdict is a verdict on the plan as described. As each step comes up, the harness asks again with evaluateDomainAction on the facts then current; the approval authorises that one step\'s rule, participant, action and area, once, until it expires.)', '');
  }

  writeFileSync(join(dir, 'plan-decisions.jsonl'), log.map(l => JSON.stringify(l)).join('\n') + '\n');
  console.log(out.join('\n'));
  console.log(`${seq} plan evaluations → plan-decisions.jsonl`);
}

main().catch(e => { console.error(e); process.exit(1); });
