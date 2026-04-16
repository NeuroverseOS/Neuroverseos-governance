/**
 * @neuroverseos/governance/radiant — signal extraction
 *
 * Step 4: turn a list of classified events into the 5 × 3 signal matrix
 * that downstream steps (pattern composition, rendering lens, renderer)
 * read to produce alignment output.
 *
 * The matrix is:  { signal_id × actor_domain } → ScoredObservation,
 * i.e. 5 signals × 3 domains (life / cyber / joint) = 15 cells by default.
 * Scores are 0–100 and each cell reports its own eventCount and confidence
 * so the evidence gate (from step 2) can decide presence downstream.
 *
 * Defaults declared by the NeuroVerse base worldmodel:
 *   clarity · ownership · follow_through · alignment · decision_momentum
 *
 * A worldmodel can declare additional signals by providing extra extractors.
 * The extractor interface is deterministic and stateless — no LLM calls, no
 * heuristics that depend on run order.
 *
 * Step-4 scope note: the default extractors below are intentionally simple
 * heuristics. They produce defensible numbers on synthetic and real events,
 * but Phase-4 validation with Auki's repos is where the scoring gets tuned.
 * Extractors are pluggable precisely so they can be replaced without
 * touching downstream math.
 */

import type { ActorDomain, Event } from './domain';
import { classifyActorDomain } from './domain';

// ─── Types ─────────────────────────────────────────────────────────────────

/**
 * An Event that has been tagged with its ActorDomain. Produced by
 * `classifyEvents` and consumed by extractors. Pre-classifying once avoids
 * re-running the classifier for every (signal × domain) cell.
 */
export interface ClassifiedEvent {
  event: Event;
  domain: ActorDomain;
}

/**
 * One cell of the signal matrix: a score for a given signal in a given
 * actor_domain. Downstream math reads `score`, `eventCount`, `confidence`
 * and passes each cell through the evidence gate.
 */
export interface Signal {
  id: string;
  domain: ActorDomain;
  score: number;
  eventCount: number;
  confidence: number;
}

/** The computed 5 × 3 matrix (or whichever dimensions the extractors define). */
export type SignalMatrix = readonly Signal[];

/**
 * The three-tuple a SignalExtractor returns for a given (signal, domain).
 */
export interface ExtractionResult {
  score: number;
  eventCount: number;
  confidence: number;
}

/**
 * A named extraction routine. Given all classified events and a target
 * domain, produce a score for this signal in that domain.
 *
 * Extractors must be:
 *   - deterministic (same input → same output)
 *   - stateless (no hidden mutable state between calls)
 *   - side-effect free (no IO, no LLM calls, no wall-clock reads)
 *
 * An extractor that can't score its signal in a given domain should still
 * return a well-formed ExtractionResult — typically `{ score: 0,
 * eventCount: 0, confidence: 0 }` — which the evidence gate will filter
 * out as not-present.
 */
export interface SignalExtractor {
  id: string;
  description: string;
  extract(
    events: readonly ClassifiedEvent[],
    domain: ActorDomain,
  ): ExtractionResult;
}

// ─── Pipeline ──────────────────────────────────────────────────────────────

/**
 * Tag every event with its domain, once. Downstream extractors read the
 * tagged stream without reclassifying.
 */
export function classifyEvents(events: readonly Event[]): ClassifiedEvent[] {
  return events.map((event) => ({
    event,
    domain: classifyActorDomain(event),
  }));
}

/**
 * Compute the signal matrix. For each extractor × each domain, run the
 * extractor and collect the resulting Signal.
 *
 * The output is a flat list of Signal cells. Consumers that need the matrix
 * by name or by domain can group as needed; keeping the wire format flat
 * avoids encoding the domain enumeration in the shape.
 */
export function extractSignals(
  events: readonly ClassifiedEvent[],
  extractors: readonly SignalExtractor[] = DEFAULT_SIGNAL_EXTRACTORS,
): SignalMatrix {
  const domains: readonly ActorDomain[] = ['life', 'cyber', 'joint'];
  const out: Signal[] = [];
  for (const extractor of extractors) {
    for (const domain of domains) {
      const r = extractor.extract(events, domain);
      out.push({
        id: extractor.id,
        domain,
        score: r.score,
        eventCount: r.eventCount,
        confidence: r.confidence,
      });
    }
  }
  return out;
}

// ─── Default extractor helpers ─────────────────────────────────────────────

const ZERO: ExtractionResult = { score: 0, eventCount: 0, confidence: 0 };

/** Filter to events in a specific domain. */
function inDomain(
  events: readonly ClassifiedEvent[],
  domain: ActorDomain,
): ClassifiedEvent[] {
  return events.filter((e) => e.domain === domain);
}

/**
 * Confidence scales with event count in this domain: 10 events → 1.0
 * confidence. This aligns with the default evidence gate (k=3, c=0.5):
 * a dimension with 5 events reaches confidence 0.5 and can pass the gate.
 *
 * The linear scaling is crude on purpose — it's the minimum logic needed
 * to produce "more evidence = more trust," with tuning deferred until
 * we have real deployment data to calibrate against.
 */
function confidenceFromCount(count: number): number {
  return Math.min(1, count / 10);
}

/** Clamp to [0, 100]. Score invariant guarded at the extractor layer. */
function clamp100(n: number): number {
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

// ─── Default extractors ────────────────────────────────────────────────────

/**
 * clarity — how informative event content is in this domain.
 *
 * Proxy: mean normalized content length. Each event's content length is
 * normalized against a 200-character cap (beyond 200, extra length yields
 * no extra credit — avoids rewarding verbosity). Events with no content
 * contribute 0 to the mean but still count toward eventCount.
 */
const CLARITY_EXTRACTOR: SignalExtractor = {
  id: 'clarity',
  description: 'Informativeness of event content — commit messages, PR bodies, review text',
  extract(events, domain) {
    const sub = inDomain(events, domain);
    if (sub.length === 0) return ZERO;
    const totalScore = sub.reduce((acc, e) => {
      const len = (e.event.content ?? '').length;
      const norm = Math.min(len, 200) / 200; // 0..1
      return acc + norm * 100;
    }, 0);
    return {
      score: clamp100(totalScore / sub.length),
      eventCount: sub.length,
      confidence: confidenceFromCount(sub.length),
    };
  },
};

/**
 * ownership — clarity of accountability for work in this domain.
 *
 * Proxy: fraction of events with a known (non-unknown) primary actor.
 * Events with `actor.kind === 'unknown'` indicate the adapter couldn't
 * attribute the work — treated as a hit to ownership signal.
 */
const OWNERSHIP_EXTRACTOR: SignalExtractor = {
  id: 'ownership',
  description: 'Clarity of accountability — fraction of events with a known primary actor',
  extract(events, domain) {
    const sub = inDomain(events, domain);
    if (sub.length === 0) return ZERO;
    const attributed = sub.filter((e) => e.event.actor.kind !== 'unknown').length;
    return {
      score: clamp100((attributed / sub.length) * 100),
      eventCount: sub.length,
      confidence: confidenceFromCount(sub.length),
    };
  },
};

/**
 * follow_through — work picked up and continued in this domain.
 *
 * Proxy: fraction of events in this domain that are the target of a
 * `respondsTo` reference from another event. If your event was followed
 * up on, something followed through.
 *
 * This uses the full event stream (across all domains) to compute
 * references, then scores per-domain.
 */
const FOLLOW_THROUGH_EXTRACTOR: SignalExtractor = {
  id: 'follow_through',
  description: 'Fraction of events that were followed up — i.e. referenced by a later event',
  extract(events, domain) {
    const sub = inDomain(events, domain);
    if (sub.length === 0) return ZERO;
    // Collect all respondsTo targets from the full stream
    const referencedIds = new Set<string>();
    for (const e of events) {
      const ref = e.event.respondsTo?.eventId;
      if (ref) referencedIds.add(ref);
    }
    const followedUp = sub.filter((e) => referencedIds.has(e.event.id)).length;
    return {
      score: clamp100((followedUp / sub.length) * 100),
      eventCount: sub.length,
      confidence: confidenceFromCount(sub.length),
    };
  },
};

/**
 * alignment — coordination pressure observable in activity.
 *
 * Proxy: fraction of events in this domain that reference prior events
 * (`respondsTo` set). A high reference rate means activity is
 * conversationally threaded — decisions are being tied to prior context.
 * A low reference rate means activity is scattered.
 *
 * Note: this is the *observable* alignment signal — the coordination
 * proxy. Lens-based alignment scoring (matching activity against
 * worldmodel invariants) happens downstream in lens evaluation, not here.
 */
const ALIGNMENT_EXTRACTOR: SignalExtractor = {
  id: 'alignment',
  description: 'Coordination pressure — fraction of events that reference a prior event',
  extract(events, domain) {
    const sub = inDomain(events, domain);
    if (sub.length === 0) return ZERO;
    const referencing = sub.filter((e) => e.event.respondsTo !== undefined).length;
    return {
      score: clamp100((referencing / sub.length) * 100),
      eventCount: sub.length,
      confidence: confidenceFromCount(sub.length),
    };
  },
};

/**
 * decision_momentum — rate of decisioning in this domain.
 *
 * Proxy: events per day in this domain, normalized against a cap of 10
 * events/day (beyond 10, extra velocity yields no extra credit — avoids
 * rewarding thrash). Computed from the span between the earliest and
 * latest event timestamps in this domain.
 *
 * With fewer than 2 events in-domain, there's no span to compute — score
 * falls back to eventCount as a rough proxy, confidence stays low.
 */
const DECISION_MOMENTUM_EXTRACTOR: SignalExtractor = {
  id: 'decision_momentum',
  description: 'Rate of activity in this domain — events per day, capped at 10/day',
  extract(events, domain) {
    const sub = inDomain(events, domain);
    if (sub.length === 0) return ZERO;
    if (sub.length < 2) {
      return {
        score: 20, // token non-zero score — single event = some motion
        eventCount: sub.length,
        confidence: confidenceFromCount(sub.length),
      };
    }
    const ts = sub.map((e) => Date.parse(e.event.timestamp)).sort((a, b) => a - b);
    const spanMs = ts[ts.length - 1] - ts[0];
    const spanDays = Math.max(spanMs / (24 * 60 * 60 * 1000), 1 / 24); // min 1 hour
    const perDay = sub.length / spanDays;
    const normalized = Math.min(perDay, 10) / 10;
    return {
      score: clamp100(normalized * 100),
      eventCount: sub.length,
      confidence: confidenceFromCount(sub.length),
    };
  },
};

/**
 * The five default extractors declared by the NeuroVerse base worldmodel.
 * Each is a simple, defensible heuristic for Phase 1 — all are pluggable
 * and intended to be tuned against real deployment data in Phase 4.
 */
export const DEFAULT_SIGNAL_EXTRACTORS: readonly SignalExtractor[] = Object.freeze([
  CLARITY_EXTRACTOR,
  OWNERSHIP_EXTRACTOR,
  FOLLOW_THROUGH_EXTRACTOR,
  ALIGNMENT_EXTRACTOR,
  DECISION_MOMENTUM_EXTRACTOR,
]);
