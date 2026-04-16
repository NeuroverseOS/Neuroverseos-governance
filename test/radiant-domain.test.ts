/**
 * Radiant — actor_domain classifier tests
 *
 * Covers the three classification rules from radiant/PROJECT-PLAN.md:
 *   1. Mixed authorship across the life/cyber boundary → joint
 *   2. Cross-boundary response → joint
 *   3. Homogeneous events → classified by primary actor kind
 *
 * Plus the conservative default: unknown actor → life (not classified as
 * cyber on absence of evidence; upgrading requires positive evidence).
 */

import { describe, it, expect } from 'vitest';
import { classifyActorDomain } from '../src/radiant/index';
import type { Actor, Event } from '../src/radiant/index';

// ─── Helpers ───────────────────────────────────────────────────────────────

const human: Actor = { id: 'alice', kind: 'human', name: 'Alice' };
const anotherHuman: Actor = { id: 'bob', kind: 'human', name: 'Bob' };
const ai: Actor = { id: 'claude', kind: 'ai', name: 'Claude' };
const bot: Actor = { id: 'dependabot', kind: 'bot', name: 'Dependabot' };
const unknown: Actor = { id: 'unknown-hash', kind: 'unknown' };

function event(overrides: Partial<Event>): Event {
  return {
    id: 'evt-1',
    timestamp: '2026-04-14T12:00:00Z',
    actor: human,
    ...overrides,
  };
}

// ─── life ──────────────────────────────────────────────────────────────────

describe('classifyActorDomain — life', () => {
  it('tags a plain human commit as life', () => {
    expect(classifyActorDomain(event({ actor: human }))).toBe('life');
  });

  it('tags a human responding to another human as life', () => {
    const e = event({
      actor: human,
      respondsTo: { eventId: 'prior', actor: anotherHuman },
    });
    expect(classifyActorDomain(e)).toBe('life');
  });

  it('tags a human with human co-authors as life', () => {
    const e = event({
      actor: human,
      coActors: [anotherHuman],
    });
    expect(classifyActorDomain(e)).toBe('life');
  });

  it('tags an unknown actor as life (conservative default)', () => {
    // When an adapter cannot determine actor kind, default to life. Upgrading
    // to cyber requires positive evidence, not absence.
    expect(classifyActorDomain(event({ actor: unknown }))).toBe('life');
  });

  it('tags unknown responding to human as life', () => {
    const e = event({
      actor: unknown,
      respondsTo: { eventId: 'prior', actor: human },
    });
    expect(classifyActorDomain(e)).toBe('life');
  });
});

// ─── cyber ─────────────────────────────────────────────────────────────────

describe('classifyActorDomain — cyber', () => {
  it('tags an AI-authored commit as cyber', () => {
    expect(classifyActorDomain(event({ actor: ai }))).toBe('cyber');
  });

  it('tags a bot commit as cyber', () => {
    expect(classifyActorDomain(event({ actor: bot }))).toBe('cyber');
  });

  it('tags AI responding to another AI as cyber', () => {
    const e = event({
      actor: ai,
      respondsTo: { eventId: 'prior', actor: ai },
    });
    expect(classifyActorDomain(e)).toBe('cyber');
  });

  it('tags AI with AI co-authors as cyber', () => {
    const anotherAi: Actor = { id: 'copilot', kind: 'ai' };
    const e = event({
      actor: ai,
      coActors: [anotherAi, bot],
    });
    expect(classifyActorDomain(e)).toBe('cyber');
  });

  it('tags a bot responding to another bot as cyber', () => {
    const e = event({
      actor: bot,
      respondsTo: { eventId: 'prior', actor: bot },
    });
    expect(classifyActorDomain(e)).toBe('cyber');
  });
});

// ─── joint ─────────────────────────────────────────────────────────────────

describe('classifyActorDomain — joint (cross-boundary)', () => {
  it('tags a human merging an AI-authored PR as joint', () => {
    const e = event({
      actor: human,
      respondsTo: { eventId: 'ai-pr', actor: ai },
    });
    expect(classifyActorDomain(e)).toBe('joint');
  });

  it('tags an AI commenting on a human-authored issue as joint', () => {
    const e = event({
      actor: ai,
      respondsTo: { eventId: 'human-issue', actor: human },
    });
    expect(classifyActorDomain(e)).toBe('joint');
  });

  it('tags a human reviewing a bot PR as joint', () => {
    const e = event({
      actor: human,
      respondsTo: { eventId: 'bot-pr', actor: bot },
    });
    expect(classifyActorDomain(e)).toBe('joint');
  });

  it('tags a commit with a human author and an AI co-author as joint', () => {
    // The classic "Co-authored-by: Claude" trailer case.
    const e = event({
      actor: human,
      coActors: [ai],
    });
    expect(classifyActorDomain(e)).toBe('joint');
  });

  it('tags an AI commit with a human co-author as joint', () => {
    const e = event({
      actor: ai,
      coActors: [human],
    });
    expect(classifyActorDomain(e)).toBe('joint');
  });

  it('tags joint when multiple co-authors span the boundary', () => {
    const e = event({
      actor: human,
      coActors: [anotherHuman, ai],
    });
    expect(classifyActorDomain(e)).toBe('joint');
  });

  it('mixed authorship overrides a same-side respondsTo', () => {
    // Even if respondsTo is same-side, mixed co-authors still produce joint.
    const e = event({
      actor: human,
      coActors: [ai],
      respondsTo: { eventId: 'prior', actor: anotherHuman },
    });
    expect(classifyActorDomain(e)).toBe('joint');
  });
});

// ─── edge cases ────────────────────────────────────────────────────────────

describe('classifyActorDomain — edge cases', () => {
  it('handles an empty coActors list as no co-authors', () => {
    expect(classifyActorDomain(event({ actor: human, coActors: [] }))).toBe(
      'life',
    );
    expect(classifyActorDomain(event({ actor: ai, coActors: [] }))).toBe(
      'cyber',
    );
  });

  it('does not classify as joint when respondsTo target is also life-side', () => {
    // human respondsTo unknown → both life-side → not cross-boundary
    const e = event({
      actor: human,
      respondsTo: { eventId: 'prior', actor: unknown },
    });
    expect(classifyActorDomain(e)).toBe('life');
  });

  it('treats unknown as life-side for respondsTo boundary checks', () => {
    // AI responding to unknown → cross-boundary (cyber ↔ life-side) → joint
    const e = event({
      actor: ai,
      respondsTo: { eventId: 'prior', actor: unknown },
    });
    expect(classifyActorDomain(e)).toBe('joint');
  });

  it('is deterministic — same input produces same output', () => {
    const e = event({
      actor: human,
      coActors: [ai],
      respondsTo: { eventId: 'prior', actor: bot },
    });
    const first = classifyActorDomain(e);
    const second = classifyActorDomain(e);
    expect(first).toBe(second);
    expect(first).toBe('joint');
  });
});
