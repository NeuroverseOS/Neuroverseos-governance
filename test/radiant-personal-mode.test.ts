/**
 * Radiant — personal-mode filter tests
 *
 * Covers the local-facilitator stance: when --personal is set, Radiant
 * reads only the specified user's activity. No one else is observed.
 * This is the behavior that answers the "global observer" concern —
 * scope can be broad, but the signal is strictly the caller's own.
 */

import { describe, it, expect } from 'vitest';
import { filterEventsByUser } from '../src/radiant/index';
import type { Actor, Event } from '../src/radiant/index';

// ─── Helpers ───────────────────────────────────────────────────────────────

const alice: Actor = { id: 'alice', kind: 'human' };
const bob: Actor = { id: 'Bob', kind: 'human' };
const claudeBot: Actor = { id: 'claude[bot]', kind: 'bot' };

function ev(id: string, actor: Actor): Event {
  return {
    id,
    actor,
    kind: 'commit',
    timestamp: '2024-01-01T00:00:00Z',
    content: `event ${id}`,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('filterEventsByUser', () => {
  it('keeps only events whose actor.id matches the username', () => {
    const events = [
      ev('e1', alice),
      ev('e2', bob),
      ev('e3', alice),
      ev('e4', claudeBot),
    ];
    const out = filterEventsByUser(events, 'alice');
    expect(out.map((e) => e.id)).toEqual(['e1', 'e3']);
  });

  it('is case-insensitive on both sides', () => {
    const events = [ev('e1', alice), ev('e2', bob)];
    expect(filterEventsByUser(events, 'ALICE').map((e) => e.id)).toEqual(['e1']);
    expect(filterEventsByUser(events, 'bob').map((e) => e.id)).toEqual(['e2']);
  });

  it('returns an empty array when no events match', () => {
    const events = [ev('e1', alice), ev('e2', bob)];
    expect(filterEventsByUser(events, 'nobody')).toEqual([]);
  });

  it('returns an empty array on empty input', () => {
    expect(filterEventsByUser([], 'alice')).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const events = [ev('e1', alice), ev('e2', bob)];
    const snapshot = events.slice();
    filterEventsByUser(events, 'alice');
    expect(events).toEqual(snapshot);
  });
});
