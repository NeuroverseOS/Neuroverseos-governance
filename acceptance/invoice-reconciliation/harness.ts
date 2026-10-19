/**
 * The reference harness for the invoice-reconciliation scenario, shared by
 * run.ts (the replay) and backtest.ts (the backtest of the recorded log).
 *
 * Written for this business: a scope resolver (which store, which domain,
 * which directory a call lands in), derived-fact functions (is this SQL
 * destructive? is this domain external?), a classifier verdict replayed from
 * the recording (contains_financial_data, the one fact no function here can
 * compute), an in-memory spend ledger with reserve-then-commit, a nonce set
 * and a history store that carry over from line to line, and a clock that
 * reads each line's `now`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileGovernance, compileMission, referenceHarness, SpendLedger, NonceSet, HistoryStore,
  type GovernanceCompileInput, type GovernanceRulebook, type Mission, type Session, type Harness,
} from '../../src/index';

export const here = dirname(fileURLToPath(import.meta.url));
export const OWN_DOMAIN = 'smallbiz.example';
export const WEEK = '2026-W42';
export const PRINCIPAL = { id: 'owner-sam' };

export interface Line {
  seq: number; mission: string | null; now: string;
  participant: { id: string; kind: string; roleId: string; delegatedBy?: string }; delegation?: Array<{ id: string; roleId: string }>;
  tool: string; args: unknown; scope: string; facts: Record<string, unknown>;
  approvedBy?: unknown; harnessFaults?: { omitDerived?: string[] };
  expect: { status: string; decidingRuleIds: string[]; executed: boolean; limits?: Record<string, number>; approvalsRejected?: string[]; note: string };
}

/** The business's own derived-fact functions. Integrator-declared; never the requester's, never a model's. */
export const derive = {
  sql_is_destructive: (args: Record<string, unknown>) => /^\s*(delete|update|insert|truncate|drop|alter)\b/i.test(String(args.sql ?? '')),
  recipient_is_external: (args: Record<string, unknown>) => String(args.to_domain ?? '').toLowerCase() !== OWN_DOMAIN,
};
/** Where a call lands. Unknown tools cannot be resolved; the recorded scope stands in for whatever the real harness said. */
export const resolveScope = (tool: string, args: Record<string, unknown>, recorded: string): string => {
  switch (tool) {
    case 'invoices.read': case 'ledger.query': return 'accounting';
    case 'report.write': return String(args.path ?? '').startsWith(`reports/${WEEK}/`) ? 'reporting' : 'files_other';
    case 'vendors.update_bank': return 'vendors';
    case 'payments.refund': return 'payments';
    case 'email.send': return String(args.to_domain ?? '').toLowerCase() === OWN_DOMAIN ? 'internal_email' : 'external_email';
    case 'purchases.buy': return 'office_supplies';
    default: return recorded;
  }
};
export const KNOWN = new Set(['invoices.read', 'ledger.query', 'report.write', 'vendors.update_bank', 'payments.refund', 'email.send', 'purchases.buy']);

/** The fixture: compiled base and mission rulebooks, and the transcript lines. */
export function loadScenario(): { input: GovernanceCompileInput; missionSpec: Mission; base: GovernanceRulebook; mission: GovernanceRulebook; lines: Line[] } {
  const input = JSON.parse(readFileSync(join(here, 'rules.json'), 'utf8')) as GovernanceCompileInput;
  const missionSpec = JSON.parse(readFileSync(join(here, 'plan.json'), 'utf8')) as Mission;
  const lines = readFileSync(join(here, 'transcript.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l) as Line);
  const base = compileGovernance(input);
  const mission = compileMission(base, missionSpec);
  return { input, missionSpec, base, mission, lines };
}

/** The stores that carry over from line to line. */
export interface Stores { ledger: SpendLedger; consumed: NonceSet; history: HistoryStore }
export const stores = (): Stores => ({ ledger: new SpendLedger(), consumed: new NonceSet(), history: new HistoryStore() });

/** The harness for one line, over the shared stores. */
export function harnessFor(line: Line, s: Stores): Harness {
  const faults = line.harnessFaults?.omitDerived ?? [];
  const derivedHere = Object.fromEntries(Object.entries(derive).filter(([k]) => !faults.includes(k))) as typeof derive;
  return referenceHarness({
    now: () => line.now,
    resolveScope: (tool, args) => resolveScope(tool, args, line.scope),
    // The classifier's verdict is the one harness output this file cannot recompute: replay the recording. requested_rows comes from the LIMIT clause.
    facts: (tool, args) => {
      const out: Record<string, unknown> = {};
      if (line.facts.contains_financial_data !== undefined) out.contains_financial_data = line.facts.contains_financial_data;
      if (tool === 'ledger.query') { const m = /\bLIMIT\s+(\d+)\b/i.exec(String(args.sql ?? '')); if (m) out.requested_rows = Number(m[1]); }
      return out;
    },
    derive: derivedHere,
    ...(line.approvedBy !== undefined ? { approvals: () => line.approvedBy } : {}),
    ledger: s.ledger, consumed: s.consumed, history: s.history,
    ledgers: [{ fact: 'projected_spend_this_week', tool: 'purchases.buy', amountArg: 'amount', bucket: () => `office_supplies:${WEEK}` }],
  });
}

/** The session for one line: the mission rulebook when the line is under the mission, the base otherwise. */
export function sessionFor(line: Line, base: GovernanceRulebook, mission: GovernanceRulebook): Session {
  return { rulebook: line.mission ? mission : base, principal: PRINCIPAL, participant: line.participant, ...(line.delegation ? { delegation: line.delegation } : {}) };
}
