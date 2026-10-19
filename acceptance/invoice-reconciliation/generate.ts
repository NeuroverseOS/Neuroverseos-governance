/**
 * Writes transcript.jsonl and expectations.md for the invoice-reconciliation
 * scenario, and fills the TEST ONLY public key into rules.json.
 *
 *   npx tsx acceptance/invoice-reconciliation/generate.ts
 *
 * The EXPECTED VERDICTS BELOW ARE AUTHORED BY HAND. This script only needs the
 * engine for two things no hand can do: the compiled base rulebook's
 * fingerprint and the argument digests, which the signed approvals bind to.
 * It never runs the evaluator and never derives an expectation from one; the
 * runner (run.ts) is what compares the engine with these expectations.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileGovernance, fingerprint, publicKeyOf, signGovernanceApproval, type GovernanceCompileInput } from '../../src/index';

const here = dirname(fileURLToPath(import.meta.url));
/** TEST ONLY: the owner's signing seed is the SHA-256 of this text. Never use it for anything real. */
const SEED_TEXT = 'invoice-reconciliation acceptance TEST ONLY owner key 1';
const SEED = createHash('sha256').update(SEED_TEXT, 'utf8').digest('hex');

const MISSION = 'reconcile-2026-W42';
const PRINCIPAL = { id: 'owner-sam' };
const agent = { id: 'recon-agent-1', kind: 'agent', roleId: 'reconciliation_agent' };
const sub = { id: 'subagent-1', kind: 'agent', roleId: 'subagent_reader', delegatedBy: 'recon-agent-1' };
const chain = [{ id: 'recon-agent-1', roleId: 'reconciliation_agent' }];
const t = (hh: string, mm: string) => `2026-10-16T${hh}:${mm}:00Z`;
const refundArgs = { amount: 120, currency: 'EUR', invoice_id: 'INV-1043' };

interface Expect { status: 'ALLOW' | 'LIMIT' | 'PAUSE' | 'BLOCK'; decidingRuleIds: string[]; executed: boolean; limits?: Record<string, number>; approvalsRejected?: string[]; note: string }
interface Line {
  seq: number; mission: string | null; now: string;
  participant: typeof agent | typeof sub; delegation?: typeof chain;
  tool: string; args: unknown; scope: string; facts: Record<string, unknown>;
  approvedBy?: unknown; harnessFaults?: { omitDerived?: string[] };
  expect: Expect;
}
const describe: Record<number, string> = {};

async function main() {
  const rulesPath = join(here, 'rules.json');
  const input = JSON.parse(readFileSync(rulesPath, 'utf8')) as GovernanceCompileInput;
  const pub = await publicKeyOf(SEED);
  input.trustedKeys = [{ keyId: 'owner-test-key-1', publicKey: pub, authority: 'owner' }];
  writeFileSync(rulesPath, JSON.stringify(input, null, 2) + '\n');
  const base = compileGovernance(input);

  const key = { keyId: 'owner-test-key-1', privateKey: SEED };
  const bind = { id: 'owner-sam', authority: 'owner', ruleId: 'refunds_wait_for_owner_approval', rulebookFingerprint: base.fingerprint, principalId: 'owner-sam', participantId: 'recon-agent-1', tool: 'payments.refund', scope: 'payments' };
  const a1 = await signGovernanceApproval({ ...bind, argsDigest: fingerprint(refundArgs), nonce: 'appr-0001', issuedAt: t('14', '00'), expiresAt: t('14', '30') }, key);
  const a2 = await signGovernanceApproval({ ...bind, argsDigest: fingerprint(refundArgs), nonce: 'appr-0002', issuedAt: t('12', '00'), expiresAt: t('12', '30') }, key);
  // Signed for 120, then its digest edited to the 1,200 call's digest: the signature no longer covers what it says.
  const a3signed = await signGovernanceApproval({ ...bind, argsDigest: fingerprint(refundArgs), nonce: 'appr-0003', issuedAt: t('14', '00'), expiresAt: t('14', '30') }, key);
  const a3 = { ...a3signed, argsDigest: fingerprint({ ...refundArgs, amount: 1200 }) };
  const a4 = await signGovernanceApproval({ ...bind, argsDigest: fingerprint(refundArgs), nonce: 'appr-0004', issuedAt: t('14', '00'), expiresAt: t('14', '30') }, key);

  const L: Line[] = [];
  const add = (l: Omit<Line, 'seq'>, text: string) => { L.push({ seq: L.length + 1, ...l }); describe[L.length] = text; };
  const M = (now: string, participant: Line['participant'], tool: string, args: unknown, scope: string, facts: Record<string, unknown>, expect: Expect, extra: Partial<Line> = {}) =>
    ({ mission: MISSION, now, participant, tool, args, scope, facts, expect, ...extra });
  const S = (now: string, tool: string, args: unknown, scope: string, facts: Record<string, unknown>, expect: Expect, extra: Partial<Line> = {}) =>
    ({ mission: null, now, participant: agent, tool, args, scope, facts, expect, ...extra });
  const ok = (ids: string[], note: string, limits?: Record<string, number>): Expect => ({ status: 'ALLOW', decidingRuleIds: ids, executed: true, ...(limits ? { limits } : {}), note });
  const block = (ids: string[], note: string): Expect => ({ status: 'BLOCK', decidingRuleIds: ids, executed: false, note });
  const pause = (note: string, rejected?: string[]): Expect => ({ status: 'PAUSE', decidingRuleIds: ['refunds_wait_for_owner_approval'], executed: false, ...(rejected ? { approvalsRejected: rejected } : {}), note });

  // ─── The mission: reconcile this week's invoices ───────────────────────────
  add(M(t('09', '00'), agent, 'invoices.read', { week: '2026-W42' }, 'accounting', {}, ok(['role_permits_tool'], 'Mission step read_invoices; the role lists invoices.read.')), 'Agent reads this week\'s invoices');
  add(M(t('09', '01'), sub, 'invoices.read', { invoice_id: 'INV-1043' }, 'accounting', {}, ok(['role_permits_tool', 'delegation_exceeds_authority'], 'A delegated subagent may read; the harness-assembled chain (recon-agent-1 as reconciliation_agent) permits it too, and the trace records the check.'), { delegation: chain }), 'Subagent (delegated) reads an invoice');
  add(M(t('09', '03'), agent, 'ledger.query', { sql: "SELECT id, invoice_id, amount FROM ledger WHERE week = '2026-W42' LIMIT 500" }, 'accounting', { sql_is_destructive: false, requested_rows: 500 },
    ok(['role_permits_tool', 'ledger_query_row_ceiling'], 'Read-only SELECT asking for 500 rows, within the 1000-row ceiling: the limit rule is satisfied (ALLOW, limits reported).', { max_rows: 1000 })), 'Ledger SELECT with LIMIT 500');
  add(M(t('09', '04'), agent, 'ledger.query', { sql: "SELECT * FROM ledger WHERE week = '2026-W42'" }, 'accounting', { sql_is_destructive: false },
    { status: 'LIMIT', decidingRuleIds: ['ledger_query_row_ceiling'], executed: true, limits: { max_rows: 1000 }, note: 'Unbounded SELECT (no requested_rows): proceeds only within max_rows 1000; the executor receives the limit.' }), 'Ledger SELECT with no row bound');
  add(M(t('09', '05'), agent, 'ledger.query', { sql: 'DELETE FROM ledger WHERE id = 42' }, 'accounting', { sql_is_destructive: true },
    block(['never_alter_accounting_records'], 'Destructive SQL against the ledger (the harness derived sql_is_destructive from the statement); the never rule stops evaluation.')), 'Ledger `DELETE FROM ledger WHERE id = 42`');
  add(M(t('09', '06'), agent, 'vendors.update_bank', { vendor_id: 'V-208', iban: 'DE89370400440532013000' }, 'vendors', {},
    block(['never_change_vendor_banking'], 'Vendor bank change; the never rule is checked before role permission and the mission.')), 'Change vendor V-208\'s IBAN');
  add(M(t('09', '07'), agent, 'payments.refund', refundArgs, 'payments', {},
    block(['plan_tools'], 'Refunds are outside this mission. The mission\'s BLOCK outranks the permanent rule\'s approval wait (PAUSE), so no approval is requested.')), 'Refund 120 EUR during the mission');
  add(M(t('09', '08'), agent, 'email.send', { to_domain: 'smallbiz.example', subject: 'Discrepancies W42', contains_financial_data: true }, 'internal_email', { recipient_is_external: false, contains_financial_data: true },
    block(['plan_report_before_email'], 'Plan-order violation: no report.write in the harness-supplied history yet, so the compiled history rule denies the email.')), 'Internal email before the report is written');
  add(M(t('09', '10'), agent, 'report.write', { path: 'reports/2026-W42/discrepancies.md', content: '# Discrepancies 2026-W42\n\nINV-1043: invoiced 1,320.00 EUR, ledger 1,200.00 EUR, difference 120.00 EUR.\n' }, 'reporting', {},
    ok(['role_permits_tool'], 'Mission step write_report, inside this week\'s reports directory (the harness resolves the path to the scope reporting).')), 'Write report to `reports/2026-W42/discrepancies.md`');
  add(M(t('09', '11'), agent, 'report.write', { path: 'shared/public/discrepancies.md', content: '# Discrepancies 2026-W42\n' }, 'files_other', {},
    block(['plan_report_scope'], 'The path resolves to the scope files_other; the mission permits report.write only in reporting. The mission restricts what the permanent rules would allow.')), 'Write report to `shared/public/discrepancies.md`');
  add(M(t('09', '12'), sub, 'report.write', { path: 'reports/2026-W42/notes.md', content: 'notes' }, 'reporting', {},
    block(['subagent_read_only'], 'Delegated authority stays bounded: the subagent cannot write even inside the mission\'s scope (the never rule fires before the role check).'), { delegation: chain }), 'Subagent tries to write a report');
  add(M(t('09', '13'), agent, 'email.send', { to_domain: 'acme-supplies.example', subject: 'Invoice INV-1043', contains_financial_data: true }, 'external_email', { recipient_is_external: true, contains_financial_data: true },
    block(['never_send_financial_data_externally'], 'Financial data to an external domain; the never rule stops evaluation before the mission rules.')), 'External email carrying financial data');
  add(M(t('09', '14'), agent, 'email.send', { to_domain: 'acme-supplies.example', subject: 'Quick question', contains_financial_data: false }, 'external_email', { recipient_is_external: true, contains_financial_data: true },
    block(['never_send_financial_data_externally'], 'The agent\'s args claim no financial data (bound to agent_claims_financial_data, which no rule reads); the harness classified the body as financial. Facts come from the harness, never the requester.')), 'External email; agent claims no financial data, harness says financial');
  add(M(t('09', '15'), agent, 'email.send', { to_domain: 'acme-supplies.example', subject: 'Thank you', contains_financial_data: false }, 'external_email', { recipient_is_external: true, contains_financial_data: false },
    block(['plan_internal_email_only'], 'No financial data, so no permanent rule forbids it; the mission forbids external email.')), 'External email with no financial data, during the mission');
  add(M(t('09', '16'), agent, 'email.send', { to_domain: 'smallbiz.example', subject: 'Discrepancy report W42 ready', contains_financial_data: true }, 'internal_email', { recipient_is_external: false, contains_financial_data: true },
    ok(['role_permits_tool'], 'Internal email after the report was written (seq 9 executed and is in the harness\'s history).')), 'Internal email after the report is written');
  add(M(t('09', '17'), agent, 'shell.exec', { cmd: 'rm -rf reports' }, 'accounting', {},
    block(['unknown_tool'], 'Undeclared tool; otherwise is deny.')), 'Unknown tool `shell.exec`');
  add(M(t('09', '18'), agent, 'ledger.query', { sql: 'SELECT count(*) FROM ledger' }, 'accounting', {},
    block(['required_facts'], 'The harness has no sql_is_destructive function for this call (a fault injected on this line); ledger.query requires the fact, and a missing fact is never a yes.'), { harnessFaults: { omitDerived: ['sql_is_destructive'] } }), 'Ledger query with the required fact `sql_is_destructive` missing');
  add(M(t('09', '19'), agent, 'ledger.query', 'SELECT * FROM ledger', 'accounting', {},
    block(['args_wellformed'], 'args is a string, not an object: the adapter refuses the malformed payload before anything is judged.')), 'Ledger query whose `args` is a string, not an object');

  // ─── A standing session: no mission; permanent rules only ─────────────────
  add(S(t('14', '04'), 'payments.refund', refundArgs, 'payments', {}, pause('Refund without approval waits for the owner; the approval request names the principal, participant, tool, scope and argument digest to sign for.')), 'Refund 120 EUR for INV-1043, no approval');
  add(S(t('14', '05'), 'payments.refund', refundArgs, 'payments', {}, { status: 'ALLOW', decidingRuleIds: ['role_permits_tool', 'refunds_wait_for_owner_approval'], executed: true, note: 'Signed owner approval bound to this rule, rulebook, principal, participant, tool, scope and the digest of these exact arguments; nonce unused; inside its window. The executor runs and the nonce is consumed.' }, { approvedBy: a1 }), 'Same refund with a valid signed owner approval (appr-0001)');
  add(S(t('14', '06'), 'payments.refund', refundArgs, 'payments', {}, pause('Approval refused: nonce appr-0001 is already consumed (replay). The wait stays unmet; the harness records approval_refused.', ['replayed']), { approvedBy: a1 }), 'Same approval reused (appr-0001 already consumed)');
  add(S(t('14', '07'), 'payments.refund', { ...refundArgs, amount: 1200 }, 'payments', {}, pause('Approval refused: its argsDigest was edited after signing, so the signature does not verify; the adapter records the verification failure and the evaluator rejects it as unverified.', ['unverified']), { approvedBy: a3 }), 'Approval whose digest was altered after signing, for a 1,200 refund');
  add(S(t('14', '08'), 'payments.refund', refundArgs, 'payments', {}, pause('Approval refused: expired at 12:30Z; now is 14:08Z.', ['expired']), { approvedBy: a2 }), 'Approval that expired at 12:30Z (now 14:08Z)');
  add(S(t('14', '09'), 'payments.refund', { ...refundArgs, invoice_id: 'INV-1044' }, 'payments', {}, pause('Approval refused: validly signed, but for the arguments of INV-1043; this call refunds INV-1044, so the digests differ (ruling 2).', ['args']), { approvedBy: a4 }), 'Valid approval for INV-1043 used for a refund of INV-1044');
  add(S(t('14', '10'), 'payments.refund', refundArgs, 'payments', {}, block(['repeated_approval_refusals'], 'Four refused approvals in the last hour (seq 21–24, recorded by the harness as approval_refused): the owner\'s rule refuses further refunds outright until a person looks (ruling 1, optional rule).')), 'Fifth refund attempt after four refused approvals');
  add(S(t('15', '00'), 'purchases.buy', { amount: 80, item: 'printer paper' }, 'office_supplies', { projected_spend_this_week: 80 }, ok(['role_permits_tool'], 'The ledger projects 0 + 80 = 80 <= 500 (ruling 3: the harness does the arithmetic, atomically); committed when the executor returns.')), 'Buy office supplies for 80 (spent this week 0)');
  add(S(t('15', '01'), 'purchases.buy', { amount: 450, item: 'desk chair' }, 'office_supplies', { projected_spend_this_week: 530 }, block(['office_supplies_weekly_cap'], 'The ledger projects 80 + 450 = 530 > 500; the reservation is released.')), 'Buy office supplies for 450 (spent this week 80; projected 530)');
  add(S(t('15', '02'), 'purchases.buy', { amount: 420, item: 'desk chair' }, 'office_supplies', { projected_spend_this_week: 500 }, ok(['role_permits_tool'], 'Boundary: 80 + 420 = 500 exactly, which is allowed (the cap is > 500). seq 27 did not execute, so spend is still 80.')), 'Buy office supplies for 420 (spent this week 80; projected exactly 500)');

  const order: Array<keyof Line> = ['seq', 'mission', 'now', 'participant', 'delegation', 'tool', 'args', 'scope', 'facts', 'approvedBy', 'harnessFaults', 'expect'];
  const out = L.map(l => { const o: Record<string, unknown> = {}; for (const k of order) if (k in l && l[k] !== undefined) o[k] = l[k]; return JSON.stringify(o); }).join('\n') + '\n';
  writeFileSync(join(here, 'transcript.jsonl'), out);

  const counts: Record<string, number> = {};
  for (const l of L) counts[l.expect.status] = (counts[l.expect.status] ?? 0) + 1;
  const rows = L.map(l => `| ${l.seq} | ${l.mission ? 'mission' : 'none'} | ${l.participant.id} | \`${l.tool}\` | ${describe[l.seq]} | **${l.expect.status}** | ${l.expect.decidingRuleIds.map(r => `\`${r}\``).join(', ')} | ${l.expect.executed ? 'yes' : 'no'} |`);
  writeFileSync(join(here, 'expectations.md'), [
    '# Expectations: invoice reconciliation', '',
    `The human-readable acceptance contract for \`transcript.jsonl\`, authored by hand (this file is written by \`generate.ts\` from the same hand-authored table). Lines 1–18 run under the mission \`${MISSION}\`; lines 19–${L.length} run with no mission (permanent rules only). The runner is \`run.ts\`.`, '',
    '| seq | mission | participant | tool | description | expected | deciding rule(s) | executor runs |', '|---|---|---|---|---|---|---|---|',
    ...rows, '',
    `Totals: ${L.length} lines — ALLOW ${counts.ALLOW ?? 0}, LIMIT ${counts.LIMIT ?? 0}, PAUSE ${counts.PAUSE ?? 0}, BLOCK ${counts.BLOCK ?? 0}.`, '',
    'End of mission: `plan_ends_with_report_written` (the mission\'s `requires`) must be **satisfied**: the harness\'s history for recon-agent-1 contains `report.write` (seq 9 executed).', '',
    'Every PAUSE line must return one approval request for `refunds_wait_for_owner_approval` by `owner`, carrying the argument digest of that call. Lines 21–24 must name the rejected approval with the code shown in `expect.approvalsRejected` (replayed, unverified, expired, args). Line 20 must report `approvalsUsed` `[{ ruleId: refunds_wait_for_owner_approval, nonce: appr-0001 }]`. Lines 3 and 4 must report `limits` `{ max_rows: 1000 }`, and line 4\'s executor must receive them.', '',
    `TEST ONLY signing key: seed = SHA-256("${SEED_TEXT}") = \`${SEED}\`; public key \`${pub}\`. The approvals in the transcript are bound to the base rulebook's fingerprint \`${base.fingerprint}\` and to \`fingerprint(args)\` of their call. Never use this key for anything real.`, '',
  ].join('\n'));
  console.log(`wrote ${L.length} lines`, counts, `base fingerprint ${base.fingerprint}`);
}

main().catch(e => { console.error(e instanceof Error ? e.stack ?? e.message : String(e)); process.exit(1); });
