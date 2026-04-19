/**
 * Observe Mode + auditBehavior tests.
 *
 * Verifies the two guarantees that callers rely on:
 *
 *   1. mode: 'observe' always returns ALLOW at the top level, even when
 *      the real verdict would have been BLOCK / PAUSE / MODIFY / PENALIZE.
 *      The original verdict is preserved on shadowStatus + shadowReason.
 *
 *   2. mode: 'enforce' (the default) returns exactly what it always did —
 *      no regression for existing callers.
 *
 *   3. auditBehavior wraps observe-mode evaluation into a Crossing record
 *      shaped for behavioral audit logs.
 *
 * We don't load a full world from disk — a minimal inline WorldDefinition
 * with one blocking guard gives us everything we need.
 */

import { describe, it, expect } from 'vitest';
import { evaluateGuard } from '../src/engine/guard-engine';
import { auditBehavior, auditBehaviors } from '../src/engine/audit-behavior';
import type { WorldDefinition } from '../src/types';
import type { GuardEvent } from '../src/contracts/guard-contract';

// A minimal world: one guard that blocks any intent containing "delete".
const world: WorldDefinition = {
  world: {
    id: 'test-observe',
    name: 'Observe Mode Test World',
    version: '1.0',
    domain: 'test',
    purpose: 'exercise observe mode without loading a fixture from disk',
  },
  invariants: [],
  assumptions: { context: 'test', player_archetype: 'agent' },
  stateSchema: { variables: [] },
  rules: [],
  gates: { stages: [] },
  outcomes: { outcomes: [] },
  guards: {
    guards: [
      {
        id: 'no-delete',
        label: 'No deletions',
        description: 'Deletion intents are blocked',
        category: 'structural',
        enforcement: 'block',
        immutable: true,
        intent_patterns: ['delete'],
      },
    ],
    intent_vocabulary: { delete: { label: 'Delete', pattern: 'delete' } },
  },
} as WorldDefinition;

const deleteEvent: GuardEvent = { intent: 'delete all user data' };
const benignEvent: GuardEvent = { intent: 'read configuration' };

describe('evaluateGuard — enforce mode (default)', () => {
  it('returns BLOCK for a matching intent', () => {
    const verdict = evaluateGuard(deleteEvent, world);
    expect(verdict.status).toBe('BLOCK');
    expect(verdict.shadowStatus).toBeUndefined();
  });

  it('returns ALLOW for a benign intent', () => {
    const verdict = evaluateGuard(benignEvent, world);
    expect(verdict.status).toBe('ALLOW');
    expect(verdict.shadowStatus).toBeUndefined();
  });
});

describe('evaluateGuard — observe mode', () => {
  it('coerces BLOCK → ALLOW and records shadowStatus', () => {
    const verdict = evaluateGuard(deleteEvent, world, { mode: 'observe' });
    expect(verdict.status).toBe('ALLOW');
    expect(verdict.shadowStatus).toBe('BLOCK');
    // Original reason moves to shadowReason; top-level reason is cleared
    // so UIs that render `reason` for BLOCK/PAUSE don't accidentally
    // surface an enforcement message.
    expect(verdict.shadowReason).toBeDefined();
    expect(verdict.reason).toBeUndefined();
    // Warning flags observe-mode explicitly so logs are unambiguous.
    expect(verdict.warning).toMatch(/Observe mode/i);
  });

  it('passes ALLOW verdicts through untouched', () => {
    const verdict = evaluateGuard(benignEvent, world, { mode: 'observe' });
    expect(verdict.status).toBe('ALLOW');
    expect(verdict.shadowStatus).toBeUndefined();
    expect(verdict.shadowReason).toBeUndefined();
  });

  it('preserves ruleId so callers know which rule crossed', () => {
    const verdict = evaluateGuard(deleteEvent, world, { mode: 'observe' });
    // guard-engine prefixes guard IDs with "guard-" on every return path
    // (see src/engine/guard-engine.ts L841+). Tests assert the prefixed
    // form so they catch regressions in that contract.
    expect(verdict.ruleId).toBe('guard-no-delete');
  });
});

describe('auditBehavior', () => {
  it('flags wouldHaveBlocked for a crossing event', () => {
    const crossing = auditBehavior(
      {
        id: 'evt-1',
        timestamp: '2026-04-18T09:00:00Z',
        kind: 'commit',
        content: 'delete the shared database',
        actorId: 'alex',
        actorKind: 'human',
      },
      world,
    );
    expect(crossing.wouldHaveBlocked).toBe(true);
    expect(crossing.shadowStatus).toBe('BLOCK');
    expect(crossing.ruleId).toBe('guard-no-delete');
    expect(crossing.excerpt).toBe('delete the shared database');
  });

  it('does not flag benign events', () => {
    const crossing = auditBehavior(
      {
        id: 'evt-2',
        timestamp: '2026-04-18T09:05:00Z',
        kind: 'commit',
        content: 'update the README',
      },
      world,
    );
    expect(crossing.wouldHaveBlocked).toBe(false);
    expect(crossing.shadowStatus).toBe('ALLOW');
  });

  it('truncates long content in the excerpt', () => {
    const content = 'delete ' + 'x'.repeat(1000);
    const crossing = auditBehavior(
      { id: 'e', timestamp: '2026-04-18T00:00:00Z', content },
      world,
    );
    expect(crossing.excerpt?.length).toBeLessThanOrEqual(280);
    expect(crossing.excerpt?.endsWith('…')).toBe(true);
  });
});

describe('auditBehaviors', () => {
  it('audits a stream and preserves ordering', () => {
    const crossings = auditBehaviors(
      [
        { id: 'a', timestamp: '2026-04-18T00:00:00Z', content: 'delete x' },
        { id: 'b', timestamp: '2026-04-18T00:00:01Z', content: 'read y' },
        { id: 'c', timestamp: '2026-04-18T00:00:02Z', content: 'delete z' },
      ],
      world,
    );
    expect(crossings).toHaveLength(3);
    expect(crossings.map((c) => c.wouldHaveBlocked)).toEqual([true, false, true]);
    expect(crossings.map((c) => c.eventId)).toEqual(['a', 'b', 'c']);
  });
});
