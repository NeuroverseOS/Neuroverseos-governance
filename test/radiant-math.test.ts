/**
 * Radiant — L / C / N / R math tests
 *
 * Covers the Universal Math frame:
 *   - Presence-based averaging (no weights)
 *   - Asymmetric Life/Cyber capability spaces
 *   - N returns UNAVAILABLE without a loaded worldmodel
 *   - INSUFFICIENT_EVIDENCE is first-class — silence is never scored as neutral
 *   - R excludes sentinels from the composite (never zeros them)
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EVIDENCE_GATE,
  isPresent,
  presenceAverage,
  scoreLife,
  scoreCyber,
  scoreNeuroVerse,
  scoreComposite,
  isScored,
  isSentinel,
} from '../src/radiant/index';
import type {
  BridgingComponentScore,
  CyberCapability,
  EvidenceGate,
  LifeCapability,
  Score,
} from '../src/radiant/index';

// ─── isPresent ─────────────────────────────────────────────────────────────

describe('Radiant math — isPresent', () => {
  it('uses the default gate k=3, c=0.5', () => {
    expect(DEFAULT_EVIDENCE_GATE).toEqual({ k: 3, c: 0.5 });
  });

  it('requires event_count >= k AND confidence >= c', () => {
    expect(isPresent({ eventCount: 3, confidence: 0.5 })).toBe(true);
    expect(isPresent({ eventCount: 2, confidence: 0.5 })).toBe(false); // below k
    expect(isPresent({ eventCount: 3, confidence: 0.49 })).toBe(false); // below c
    expect(isPresent({ eventCount: 10, confidence: 0.9 })).toBe(true);
    expect(isPresent({ eventCount: 0, confidence: 0 })).toBe(false);
  });

  it('accepts a custom gate', () => {
    const strict: EvidenceGate = { k: 10, c: 0.8 };
    expect(isPresent({ eventCount: 5, confidence: 0.9 }, strict)).toBe(false);
    expect(isPresent({ eventCount: 10, confidence: 0.8 }, strict)).toBe(true);
    expect(isPresent({ eventCount: 100, confidence: 0.79 }, strict)).toBe(false);
  });
});

// ─── presenceAverage ───────────────────────────────────────────────────────

describe('Radiant math — presenceAverage', () => {
  it('averages only items that pass the gate', () => {
    const items = [
      { score: 80, eventCount: 10, confidence: 0.9 }, // in
      { score: 50, eventCount: 1, confidence: 0.2 }, // out — below both
      { score: 60, eventCount: 5, confidence: 0.8 }, // in
    ];
    expect(presenceAverage(items)).toBe(70); // avg(80, 60)
  });

  it('returns INSUFFICIENT_EVIDENCE when no items pass the gate', () => {
    const items = [
      { score: 80, eventCount: 1, confidence: 0.3 },
      { score: 70, eventCount: 2, confidence: 0.4 },
    ];
    expect(presenceAverage(items)).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('returns INSUFFICIENT_EVIDENCE for empty input', () => {
    expect(presenceAverage([])).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('treats absence as exclusion, not as zero', () => {
    // One high-scoring present item and one failing item should NOT produce
    // avg(high, 0). The failing item is excluded entirely.
    const items = [
      { score: 90, eventCount: 10, confidence: 0.9 },
      { score: 10, eventCount: 0, confidence: 0 },
    ];
    expect(presenceAverage(items)).toBe(90);
  });

  it('respects a custom gate', () => {
    const items = [
      { score: 80, eventCount: 5, confidence: 0.6 },
      { score: 60, eventCount: 15, confidence: 0.85 },
    ];
    const strict: EvidenceGate = { k: 10, c: 0.8 };
    expect(presenceAverage(items, strict)).toBe(60);
  });
});

// ─── scoreLife ─────────────────────────────────────────────────────────────

describe('Radiant math — scoreLife', () => {
  it('averages over present life-native dimensions', () => {
    const capability: LifeCapability = {
      dimensions: [
        { id: 'cognition', score: 80, eventCount: 10, confidence: 0.9 },
        { id: 'creativity', score: 60, eventCount: 5, confidence: 0.8 },
        { id: 'sensory', score: 70, eventCount: 8, confidence: 0.7 },
      ],
    };
    expect(scoreLife(capability)).toBe(70);
  });

  it('pure-cognition team: L scores the full 0–100 range (not capped)', () => {
    // This is the killer test. With weighted math, this team would cap at ~40.
    // With presence-based averaging, they score against their cognition alone.
    const capability: LifeCapability = {
      dimensions: [
        { id: 'cognition', score: 85, eventCount: 12, confidence: 0.9 },
        { id: 'creativity', score: 40, eventCount: 1, confidence: 0.3 }, // below gate
        { id: 'sensory', score: 30, eventCount: 0, confidence: 0 }, // below gate
      ],
    };
    expect(scoreLife(capability)).toBe(85);
  });

  it('returns INSUFFICIENT_EVIDENCE when no dimension passes the gate', () => {
    const capability: LifeCapability = {
      dimensions: [
        { id: 'cognition', score: 80, eventCount: 0, confidence: 0 },
        { id: 'creativity', score: 70, eventCount: 1, confidence: 0.4 },
      ],
    };
    expect(scoreLife(capability)).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('returns INSUFFICIENT_EVIDENCE for an empty capability', () => {
    expect(scoreLife({ dimensions: [] })).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('honors a custom gate (e.g. tighter for high-trust contexts)', () => {
    const capability: LifeCapability = {
      dimensions: [
        { id: 'cognition', score: 90, eventCount: 4, confidence: 0.6 },
      ],
    };
    // With default gate (k=3, c=0.5), this is present.
    expect(scoreLife(capability)).toBe(90);
    // With strict gate, it's below c.
    expect(scoreLife(capability, { k: 3, c: 0.75 })).toBe('INSUFFICIENT_EVIDENCE');
  });
});

// ─── scoreCyber ────────────────────────────────────────────────────────────

describe('Radiant math — scoreCyber', () => {
  it('averages over present cyber-native dimensions', () => {
    const capability: CyberCapability = {
      dimensions: [
        { id: 'ai-reasoning', score: 75, eventCount: 10, confidence: 0.8 },
        { id: 'ar-adaptivity', score: 65, eventCount: 5, confidence: 0.9 },
        { id: 'spatial', score: 50, eventCount: 1, confidence: 0.2 }, // below gate
      ],
    };
    expect(scoreCyber(capability)).toBe(70); // avg(75, 65)
  });

  it('dimensions are asymmetric to Life: an all-AI pipeline scores fully', () => {
    // A Cyber gyroscope with three cyber-native dimensions should produce a
    // full score regardless of anything Life is or isn't doing.
    const capability: CyberCapability = {
      dimensions: [
        { id: 'ai-reasoning', score: 80, eventCount: 15, confidence: 0.9 },
        { id: 'ar-adaptivity', score: 70, eventCount: 10, confidence: 0.85 },
        { id: 'spatial', score: 90, eventCount: 8, confidence: 0.8 },
      ],
    };
    expect(scoreCyber(capability)).toBe(80);
  });

  it('returns INSUFFICIENT_EVIDENCE when nothing passes the gate', () => {
    const capability: CyberCapability = {
      dimensions: [
        { id: 'ai-reasoning', score: 90, eventCount: 1, confidence: 0.4 },
      ],
    };
    expect(scoreCyber(capability)).toBe('INSUFFICIENT_EVIDENCE');
  });
});

// ─── scoreNeuroVerse ───────────────────────────────────────────────────────

describe('Radiant math — scoreNeuroVerse', () => {
  it('returns UNAVAILABLE when no worldmodel is loaded', () => {
    const components: BridgingComponentScore[] = [
      { component: 'ALIGN', score: 80, eventCount: 10, confidence: 0.9 },
      { component: 'HANDOFF', score: 70, eventCount: 5, confidence: 0.8 },
    ];
    // Even with evidence, no universe → coherence is undefined, not zero.
    expect(scoreNeuroVerse(components, false)).toBe('UNAVAILABLE');
  });

  it('returns INSUFFICIENT_EVIDENCE when worldmodel loaded but no corridor opens', () => {
    const components: BridgingComponentScore[] = [
      { component: 'ALIGN', score: 80, eventCount: 0, confidence: 0 },
      { component: 'HANDOFF', score: 70, eventCount: 1, confidence: 0.3 },
    ];
    expect(scoreNeuroVerse(components, true)).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('presence-averages over the four components that have evidence', () => {
    const components: BridgingComponentScore[] = [
      { component: 'ALIGN', score: 80, eventCount: 5, confidence: 0.8 },
      { component: 'HANDOFF', score: 60, eventCount: 4, confidence: 0.7 },
      // CO_DECISION and CO_EXECUTION have no evidence — excluded, not zeroed.
    ];
    expect(scoreNeuroVerse(components, true)).toBe(70);
  });

  it('high L and high C can still produce low N (translation, not sync)', () => {
    // Two excellent intelligences working past each other without opening a
    // genuine corridor score a low N. This is correct behavior — N is not
    // synchronization.
    const components: BridgingComponentScore[] = [
      { component: 'ALIGN', score: 20, eventCount: 5, confidence: 0.8 },
      { component: 'HANDOFF', score: 15, eventCount: 4, confidence: 0.7 },
    ];
    expect(scoreNeuroVerse(components, true)).toBe(17.5);
  });

  it('empty component list with worldmodel loaded → INSUFFICIENT_EVIDENCE', () => {
    expect(scoreNeuroVerse([], true)).toBe('INSUFFICIENT_EVIDENCE');
  });
});

// ─── scoreComposite ────────────────────────────────────────────────────────

describe('Radiant math — scoreComposite', () => {
  it('all-human deployment (A_C, A_N unavailable): R = A_L', () => {
    expect(scoreComposite(85, 'UNAVAILABLE', 'UNAVAILABLE')).toBe(85);
  });

  it('all-AI pipeline (A_L, A_N unavailable): R = A_C', () => {
    expect(scoreComposite('UNAVAILABLE', 75, 'UNAVAILABLE')).toBe(75);
  });

  it('hybrid with worldmodel loaded: R = avg(A_L, A_C, A_N)', () => {
    expect(scoreComposite(80, 70, 60)).toBe(70);
  });

  it('excludes INSUFFICIENT_EVIDENCE rather than zeroing it', () => {
    // If A_N is INSUFFICIENT_EVIDENCE, R averages the other two — it does not
    // count A_N as a 0, which would wrongly drag R down.
    expect(scoreComposite(80, 70, 'INSUFFICIENT_EVIDENCE')).toBe(75);
  });

  it('excludes UNAVAILABLE the same way', () => {
    expect(scoreComposite(80, 'UNAVAILABLE', 'INSUFFICIENT_EVIDENCE')).toBe(80);
  });

  it('returns INSUFFICIENT_EVIDENCE when nothing is available', () => {
    expect(
      scoreComposite('INSUFFICIENT_EVIDENCE', 'UNAVAILABLE', 'UNAVAILABLE'),
    ).toBe('INSUFFICIENT_EVIDENCE');
  });
});

// ─── Type guards ───────────────────────────────────────────────────────────

describe('Radiant math — Score type guards', () => {
  it('isScored distinguishes numbers from sentinels', () => {
    const s1: Score = 72;
    const s2: Score = 'INSUFFICIENT_EVIDENCE';
    const s3: Score = 'UNAVAILABLE';
    expect(isScored(s1)).toBe(true);
    expect(isScored(s2)).toBe(false);
    expect(isScored(s3)).toBe(false);
  });

  it('isSentinel distinguishes sentinels from numbers', () => {
    const s1: Score = 72;
    const s2: Score = 'INSUFFICIENT_EVIDENCE';
    expect(isSentinel(s1)).toBe(false);
    expect(isSentinel(s2)).toBe(true);
  });

  it('isScored and isSentinel are complementary', () => {
    const samples: Score[] = [0, 50, 100, 'INSUFFICIENT_EVIDENCE', 'UNAVAILABLE'];
    for (const s of samples) {
      expect(isScored(s)).toBe(!isSentinel(s));
    }
  });
});
