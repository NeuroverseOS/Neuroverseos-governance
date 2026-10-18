/**
 * A harness built from plain data, so a conformance case can describe one in
 * JSON (SPEC.md § 16.9, `conformance/d6-enforcement.json`): the scope the call
 * lands in, the facts, the approvals the harness holds, the time, the consumed
 * nonces, the history, and an optional fault to inject. Not for production:
 * a real harness resolves scopes and facts from its own systems.
 */

import type { GovernanceHistoryEntry, Timestamp } from '../../src/types';
import type { Harness } from './index';
import { HistoryStore, NonceSet, SpendLedger } from './reference-harness';

export interface HarnessData {
  /** The scope the resolver returns for this call. */
  scope?: string;
  /** The facts the harness supplies. */
  facts?: Record<string, unknown>;
  /** The approvals the harness holds for this call. */
  approvals?: unknown;
  now?: Timestamp;
  consumed?: string[];
  history?: GovernanceHistoryEntry[];
  /** A spend ledger: the projected fact to supply, the argument carrying the amount, and what is already spent. */
  ledger?: { fact: string; amountArg: string; spent?: number };
  /** A fault to inject: the resolver throws, the fact function throws, the executor throws (the runner's spy does that), or the reservation throws. */
  fault?: 'scope_throws' | 'facts_throws' | 'reserve_throws' | 'executor_throws' | 'scope_not_string';
}

export function harnessFromData(data: HarnessData = {}): Harness & { ledger: SpendLedger; store: HistoryStore; consumed: NonceSet } {
  const ledger = new SpendLedger(data.ledger ? { [data.ledger.fact]: data.ledger.spent ?? 0 } : {});
  const store = new HistoryStore();
  const consumed = new NonceSet(data.consumed ?? []);
  const participantHistory = data.history ?? [];
  return {
    ledger, store, consumed,
    now: () => data.now ?? '2026-10-16T09:00:00Z',
    resolveScope: () => {
      if (data.fault === 'scope_throws') throw new Error('scope resolver failed (test fault)');
      if (data.fault === 'scope_not_string') return 7 as unknown as string;
      return data.scope ?? 'files';
    },
    facts: () => {
      if (data.fault === 'facts_throws') throw new Error('fact supplier failed (test fault)');
      return { ...(data.facts ?? {}) };
    },
    ...(data.approvals !== undefined ? { approvals: () => data.approvals } : {}),
    reserve: (_tool, args) => {
      if (data.fault === 'reserve_throws') throw new Error('ledger failed (test fault)');
      if (!data.ledger) return null;
      const amount = args[data.ledger.amountArg];
      if (typeof amount !== 'number') return null;
      const r = ledger.reserve(data.ledger.fact, amount);
      return { facts: { [data.ledger.fact]: r.projected }, commit: r.commit, release: r.release };
    },
    history: {
      of: (participantId) => [...participantHistory, ...store.of(participantId)],
      append: (participantId, entry) => store.append(participantId, entry),
    },
  };
}
