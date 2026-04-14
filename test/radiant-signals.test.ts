/**
 * Radiant — signal extraction tests
 *
 * Covers:
 *   - The 5 default signals (clarity, ownership, follow_through, alignment,
 *     decision_momentum)
 *   - The 5 × 3 matrix shape (5 signals × 3 domains = 15 cells)
 *   - Per-extractor behavior (each heuristic does what it says)
 *   - Pluggability (custom extractors can replace or augment defaults)
 *   - Determinism and pre-classification (classifyEvents → extractSignals)
 */

import { describe, it, expect } from 'vitest';
import {
  classifyEvents,
  extractSignals,
  DEFAULT_SIGNAL_EXTRACTORS,
} from '../src/radiant/index';
import type {
  Actor,
  Event,
  Signal,
  SignalExtractor,
  ActorDomain,
} from '../src/radiant/index';

// ─── Helpers ───────────────────────────────────────────────────────────────

const human: Actor = { id: 'alice', kind: 'human' };
const anotherHuman: Actor = { id: 'bob', kind: 'human' };
const ai: Actor = { id: 'claude', kind: 'ai' };
const unknown: Actor = { id: 'anon', kind: 'unknown' };

let counter = 0;
function mkEvent(overrides: Partial<Event> = {}): Event {
  counter += 1;
  return {
    id: `evt-${counter}`,
    timestamp: new Date(
      Date.parse('2026-04-14T00:00:00Z') + counter * 60_000,
    ).toISOString(),
    actor: human,
    ...overrides,
  };
}

function pick(matrix: readonly Signal[], id: string, domain: ActorDomain): Signal {
  const found = matrix.find((s) => s.id === id && s.domain === domain);
  if (!found) throw new Error(`missing ${id}/${domain}`);
  return found;
}

// ─── Matrix shape ──────────────────────────────────────────────────────────

describe('extractSignals — matrix shape', () => {
  it('produces exactly 5 × 3 cells with the default extractors', () => {
    const events = classifyEvents([mkEvent({ actor: human })]);
    const matrix = extractSignals(events);
    expect(matrix).toHaveLength(15);

    const ids = new Set(matrix.map((s) => s.id));
    expect(ids).toEqual(
      new Set([
        'clarity',
        'ownership',
        'follow_through',
        'alignment',
        'decision_momentum',
      ]),
    );

    for (const id of ids) {
      const domains = matrix.filter((s) => s.id === id).map((s) => s.domain);
      expect(new Set(domains)).toEqual(new Set(['life', 'cyber', 'joint']));
    }
  });

  it('produces well-formed cells even when a domain has no events', () => {
    // Only life events — cyber and joint domains should still produce cells,
    // just with eventCount 0 and low confidence.
    const events = classifyEvents([
      mkEvent({ actor: human, content: 'good clear message' }),
      mkEvent({ actor: human, content: 'another one' }),
      mkEvent({ actor: human, content: 'third' }),
    ]);
    const matrix = extractSignals(events);
    const cyberClarity = pick(matrix, 'clarity', 'cyber');
    expect(cyberClarity.eventCount).toBe(0);
    expect(cyberClarity.score).toBe(0);
    expect(cyberClarity.confidence).toBe(0);
  });
});

// ─── clarity extractor ─────────────────────────────────────────────────────

describe('extractSignals — clarity', () => {
  it('rewards longer content (up to the 200-char cap)', () => {
    const longContent = 'x'.repeat(200);
    const events = classifyEvents([
      mkEvent({ actor: human, content: longContent }),
    ]);
    const s = pick(extractSignals(events), 'clarity', 'life');
    expect(s.score).toBe(100);
  });

  it('gives low scores for empty content', () => {
    const events = classifyEvents([
      mkEvent({ actor: human, content: '' }),
      mkEvent({ actor: human }), // no content at all
    ]);
    const s = pick(extractSignals(events), 'clarity', 'life');
    expect(s.score).toBe(0);
    expect(s.eventCount).toBe(2);
  });

  it('averages across events in-domain', () => {
    const events = classifyEvents([
      mkEvent({ actor: human, content: 'x'.repeat(200) }), // 100
      mkEvent({ actor: human, content: 'x'.repeat(100) }), // 50
    ]);
    const s = pick(extractSignals(events), 'clarity', 'life');
    expect(s.score).toBe(75);
  });
});

// ─── ownership extractor ───────────────────────────────────────────────────

describe('extractSignals — ownership', () => {
  it('scores 100 when every event has a known actor', () => {
    const events = classifyEvents([
      mkEvent({ actor: human }),
      mkEvent({ actor: anotherHuman }),
    ]);
    const s = pick(extractSignals(events), 'ownership', 'life');
    expect(s.score).toBe(100);
  });

  it('penalizes unknown actors', () => {
    const events = classifyEvents([
      mkEvent({ actor: human }),
      mkEvent({ actor: unknown }),
    ]);
    // Both events classify as life (unknown defaults to life-side).
    // One known, one unknown → 50.
    const s = pick(extractSignals(events), 'ownership', 'life');
    expect(s.score).toBe(50);
  });
});

// ─── follow_through extractor ──────────────────────────────────────────────

describe('extractSignals — follow_through', () => {
  it('scores based on events that are referenced by later events', () => {
    const first = mkEvent({ id: 'a', actor: human });
    const second = mkEvent({
      id: 'b',
      actor: human,
      respondsTo: { eventId: 'a', actor: human },
    });
    const events = classifyEvents([first, second]);
    const s = pick(extractSignals(events), 'follow_through', 'life');
    // 'a' is referenced by 'b'; 'b' is not referenced → 50.
    expect(s.score).toBe(50);
  });

  it('scores 0 when nothing was followed up on', () => {
    const events = classifyEvents([
      mkEvent({ actor: human }),
      mkEvent({ actor: human }),
    ]);
    const s = pick(extractSignals(events), 'follow_through', 'life');
    expect(s.score).toBe(0);
  });

  it('counts cross-domain references correctly', () => {
    // Human event followed up by an AI response → cross-domain (joint).
    // The human event's follow_through should count.
    const first = mkEvent({ id: 'a', actor: human });
    const second = mkEvent({
      id: 'b',
      actor: ai,
      respondsTo: { eventId: 'a', actor: human },
    });
    const events = classifyEvents([first, second]);
    // 'first' is in domain 'life', got referenced by 'second' (in 'joint').
    const lifeSignal = pick(extractSignals(events), 'follow_through', 'life');
    expect(lifeSignal.eventCount).toBe(1);
    expect(lifeSignal.score).toBe(100);
  });
});

// ─── alignment extractor ───────────────────────────────────────────────────

describe('extractSignals — alignment', () => {
  it('scores based on events that reference a prior event', () => {
    const events = classifyEvents([
      mkEvent({ actor: human }),
      mkEvent({
        actor: human,
        respondsTo: { eventId: 'prior', actor: human },
      }),
    ]);
    // One has respondsTo, one doesn't → 50.
    const s = pick(extractSignals(events), 'alignment', 'life');
    expect(s.score).toBe(50);
  });

  it('scores 0 when activity is entirely ungrounded', () => {
    const events = classifyEvents([
      mkEvent({ actor: human }),
      mkEvent({ actor: human }),
      mkEvent({ actor: human }),
    ]);
    const s = pick(extractSignals(events), 'alignment', 'life');
    expect(s.score).toBe(0);
  });
});

// ─── decision_momentum extractor ───────────────────────────────────────────

describe('extractSignals — decision_momentum', () => {
  it('gives a token score when only one event is present', () => {
    const events = classifyEvents([mkEvent({ actor: human })]);
    const s = pick(extractSignals(events), 'decision_momentum', 'life');
    expect(s.score).toBe(20);
    expect(s.eventCount).toBe(1);
  });

  it('scores high when many events occur over a short span', () => {
    // 11 events within an hour → > 10/day rate → caps at 100.
    const events: Event[] = [];
    for (let i = 0; i < 11; i += 1) {
      events.push({
        id: `hi-${i}`,
        timestamp: new Date(
          Date.parse('2026-04-14T00:00:00Z') + i * 60_000,
        ).toISOString(),
        actor: human,
      });
    }
    const s = pick(
      extractSignals(classifyEvents(events)),
      'decision_momentum',
      'life',
    );
    expect(s.score).toBe(100);
  });

  it('scores lower when the same events are spread across many days', () => {
    // 10 events over 100 days → 0.1/day → 1/10 of cap = 10.
    const events: Event[] = [];
    for (let i = 0; i < 10; i += 1) {
      events.push({
        id: `slow-${i}`,
        timestamp: new Date(
          Date.parse('2026-01-01T00:00:00Z') + i * 10 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        actor: human,
      });
    }
    const s = pick(
      extractSignals(classifyEvents(events)),
      'decision_momentum',
      'life',
    );
    expect(s.score).toBeGreaterThan(0);
    expect(s.score).toBeLessThan(20);
  });
});

// ─── Confidence scaling ────────────────────────────────────────────────────

describe('extractSignals — confidence scaling', () => {
  it('confidence rises linearly with event count until 10 events → 1.0', () => {
    const fiveEvents = classifyEvents(
      Array.from({ length: 5 }, () => mkEvent({ actor: human })),
    );
    const tenEvents = classifyEvents(
      Array.from({ length: 10 }, () => mkEvent({ actor: human })),
    );
    const twentyEvents = classifyEvents(
      Array.from({ length: 20 }, () => mkEvent({ actor: human })),
    );

    const fiveClarity = pick(extractSignals(fiveEvents), 'clarity', 'life');
    const tenClarity = pick(extractSignals(tenEvents), 'clarity', 'life');
    const twentyClarity = pick(extractSignals(twentyEvents), 'clarity', 'life');

    expect(fiveClarity.confidence).toBe(0.5);
    expect(tenClarity.confidence).toBe(1);
    expect(twentyClarity.confidence).toBe(1); // caps at 1
  });

  it('5 events in a domain is enough to pass the default evidence gate', () => {
    // Default gate: k=3, c=0.5. confidenceFromCount(5) = 0.5, eventCount = 5.
    // Both conditions met — this cell would count as present for L/C math.
    const events = classifyEvents(
      Array.from({ length: 5 }, () => mkEvent({ actor: human, content: 'x'.repeat(100) })),
    );
    const s = pick(extractSignals(events), 'clarity', 'life');
    expect(s.eventCount).toBe(5);
    expect(s.confidence).toBe(0.5);
  });
});

// ─── Domain partitioning ───────────────────────────────────────────────────

describe('extractSignals — domain partitioning', () => {
  it('routes events to the correct domain via the classifier', () => {
    const events = classifyEvents([
      mkEvent({ actor: human, content: 'long human message here xxxxxxxxxx' }),
      mkEvent({ actor: ai, content: 'ai message' }),
      mkEvent({
        actor: human,
        coActors: [ai],
        content: 'human + ai co-authored',
      }),
    ]);
    const life = pick(extractSignals(events), 'clarity', 'life');
    const cyber = pick(extractSignals(events), 'clarity', 'cyber');
    const joint = pick(extractSignals(events), 'clarity', 'joint');
    expect(life.eventCount).toBe(1);
    expect(cyber.eventCount).toBe(1);
    expect(joint.eventCount).toBe(1);
  });
});

// ─── Pluggability ──────────────────────────────────────────────────────────

describe('extractSignals — pluggable extractors', () => {
  it('accepts custom extractors in place of the defaults', () => {
    const custom: SignalExtractor = {
      id: 'always_50',
      description: 'test extractor — always returns 50',
      extract: () => ({ score: 50, eventCount: 1, confidence: 1 }),
    };
    const matrix = extractSignals(classifyEvents([mkEvent({ actor: human })]), [custom]);
    expect(matrix).toHaveLength(3); // 1 extractor × 3 domains
    for (const cell of matrix) {
      expect(cell.id).toBe('always_50');
      expect(cell.score).toBe(50);
    }
  });

  it('allows stacking defaults with additional extractors', () => {
    const extra: SignalExtractor = {
      id: 'extra_signal',
      description: 'test',
      extract: () => ({ score: 0, eventCount: 0, confidence: 0 }),
    };
    const matrix = extractSignals(classifyEvents([mkEvent({ actor: human })]), [
      ...DEFAULT_SIGNAL_EXTRACTORS,
      extra,
    ]);
    expect(matrix).toHaveLength((5 + 1) * 3);
  });
});

// ─── Determinism ───────────────────────────────────────────────────────────

describe('extractSignals — determinism', () => {
  it('same input produces identical output', () => {
    const events = classifyEvents([
      mkEvent({ actor: human, content: 'hello world this is a commit' }),
      mkEvent({
        actor: ai,
        content: 'ai produced some code',
        respondsTo: { eventId: 'somewhere', actor: human },
      }),
    ]);
    const a = extractSignals(events);
    const b = extractSignals(events);
    expect(a).toEqual(b);
  });
});
