/**
 * A reference harness: in-memory stores an integrator can start from or
 * replace. The engine never sees any of this; it sees the facts.
 *
 *   SpendLedger   atomic reserve-then-commit for cumulative limits (ruling 3):
 *                 `reserve(bucket, amount)` returns the projected total with the
 *                 reservation HELD, so a second reservation made before the first
 *                 commits or releases sees it. Two 300s against 400 remaining
 *                 project 400 then 700; the engine denies the second.
 *   NonceSet      the approvals acted on (replay protection without engine state).
 *   HistoryStore  what each participant did, as recorded by the harness.
 *   referenceHarness(options) → Harness, wiring these with the integrator's
 *                 scope resolver, derived-fact functions and ledger declarations.
 *
 * Atomicity here is JavaScript's single-threaded run-to-completion: `reserve`
 * reads and updates the held total synchronously, so no await can interleave
 * two reservations. A harness over a shared database must provide the same
 * guarantee with a transaction or a conditional update.
 */

import type { GovernanceHistoryEntry, Timestamp } from '../../src/types';
import type { CallContext, Harness, Reservation } from './index';

export class SpendLedger {
  private spent = new Map<string, number>();
  private held = new Map<string, number>();

  constructor(initial: Record<string, number> = {}) {
    for (const [bucket, amount] of Object.entries(initial)) this.spent.set(bucket, amount);
  }

  /** Committed spend in a bucket. */
  spentIn(bucket: string): number { return this.spent.get(bucket) ?? 0; }
  /** Reserved but not yet committed. */
  heldIn(bucket: string): number { return this.held.get(bucket) ?? 0; }

  /**
   * Reserve `amount` in `bucket`: the projected total (committed + held, this
   * reservation included) with the reservation held until `commit` (the call
   * ran: the amount becomes spent) or `release` (it did not). Synchronous and
   * run-to-completion, so concurrent reservations see each other.
   */
  reserve(bucket: string, amount: number): { projected: number; commit(): void; release(): void } {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) throw new Error(`SpendLedger: amount must be a finite number, 0 or more, got ${JSON.stringify(amount)}`);
    this.held.set(bucket, this.heldIn(bucket) + amount);
    const projected = this.spentIn(bucket) + this.heldIn(bucket);
    let settled = false;
    const settle = (commit: boolean) => {
      if (settled) return;
      settled = true;
      this.held.set(bucket, this.heldIn(bucket) - amount);
      if (commit) this.spent.set(bucket, this.spentIn(bucket) + amount);
    };
    return { projected, commit: () => settle(true), release: () => settle(false) };
  }
}

export class NonceSet {
  private set = new Set<string>();
  constructor(initial: Iterable<string> = []) { for (const n of initial) this.set.add(n); }
  has(nonce: string): boolean { return this.set.has(nonce); }
  add(nonce: string): void { this.set.add(nonce); }
  list(): string[] { return [...this.set]; }
}

export class HistoryStore {
  private byParticipant = new Map<string, GovernanceHistoryEntry[]>();
  of(participantId: string): GovernanceHistoryEntry[] { return [...(this.byParticipant.get(participantId) ?? [])]; }
  append(participantId: string, entry: GovernanceHistoryEntry): void {
    const list = this.byParticipant.get(participantId) ?? [];
    list.push({ ...entry });
    this.byParticipant.set(participantId, list);
  }
  /** Every entry of every participant, for reports. */
  all(): Array<{ participantId: string } & GovernanceHistoryEntry> {
    return [...this.byParticipant.entries()].flatMap(([participantId, list]) => list.map(e => ({ participantId, ...e })));
  }
}

/** A cumulative limit the harness keeps: for calls of `tool`, reserve `args[amountArg]` in `bucket` and supply the projected total as `fact`. */
export interface LedgerDeclaration {
  fact: string;
  tool: string;
  amountArg: string;
  /** The bucket the spend accrues to (a week, an account, a vendor). Default: one bucket per fact. */
  bucket?: (args: Record<string, unknown>, ctx: CallContext) => string;
}

export interface ReferenceHarnessOptions {
  now: () => Timestamp;
  resolveScope: Harness['resolveScope'];
  facts?: Harness['facts'];
  derive?: Harness['derive'];
  approvals?: Harness['approvals'];
  ledger?: SpendLedger;
  ledgers?: LedgerDeclaration[];
  consumed?: NonceSet;
  history?: HistoryStore;
  recordRefusals?: boolean;
}

/** Wire the in-memory stores and the integrator's functions into a Harness. */
export function referenceHarness(options: ReferenceHarnessOptions): Harness & { ledger: SpendLedger; consumed: NonceSet; history: HistoryStore } {
  const ledger = options.ledger ?? new SpendLedger();
  const consumed = options.consumed ?? new NonceSet();
  const history = options.history ?? new HistoryStore();
  const ledgers = options.ledgers ?? [];
  return {
    ledger, consumed, history,
    now: options.now,
    resolveScope: options.resolveScope,
    ...(options.facts ? { facts: options.facts } : {}),
    ...(options.derive ? { derive: options.derive } : {}),
    ...(options.approvals ? { approvals: options.approvals } : {}),
    ...(options.recordRefusals !== undefined ? { recordRefusals: options.recordRefusals } : {}),
    reserve(tool, args, ctx): Reservation | null {
      const decls = ledgers.filter(l => l.tool === tool);
      if (!decls.length) return null;
      const facts: Record<string, number> = {};
      const parts: Array<{ commit(): void; release(): void }> = [];
      for (const l of decls) {
        const amount = args[l.amountArg];
        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) continue;   // the evaluator refuses the argument; no projected fact is supplied
        const r = ledger.reserve(l.bucket ? l.bucket(args, ctx) : l.fact, amount);
        facts[l.fact] = r.projected;
        parts.push(r);
      }
      return { facts, commit: () => parts.forEach(p => p.commit()), release: () => parts.forEach(p => p.release()) };
    },
  };
}
