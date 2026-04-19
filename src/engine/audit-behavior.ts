/**
 * @neuroverseos/governance — auditBehavior
 *
 * Takes an observed event (from the Radiant pipeline: a commit, a PR, a
 * Slack message, a Notion edit) and evaluates it against a worldmodel in
 * observe mode — without any enforcement side effects. Returns the shadow
 * verdict so callers can record crossings of declared invariants.
 *
 * This is the primitive that lets Bevia / Radiant / Mirror-Mode tooling
 * show leaders where their worldmodel is being bumped against, without
 * imposing any stop/pause/modify semantics on the team's work.
 *
 * Relationship to evaluateGuard:
 *
 *   evaluateGuard({ intent, ... }, world, { mode: 'enforce' })
 *     → what an AI agent receives when governance says "BLOCK this action"
 *
 *   evaluateGuard({ intent, ... }, world, { mode: 'observe' })
 *     → what tooling like Bevia receives when governance says "this would
 *        have been blocked if enforced, but pass through and record"
 *
 *   auditBehavior(event, world)
 *     → convenience on top of the observe path that (a) maps a
 *        behavioral event into a synthetic GuardEvent, (b) calls
 *        evaluateGuard in observe mode, and (c) returns a Crossing
 *        record shaped for behavioral logs.
 *
 * The mapping from behavioral events to GuardEvents is intentionally
 * conservative: we use the event's `kind` as the tool, its `content` as
 * the intent, and pass through timestamp + actor as metadata. Callers
 * that want richer mappings (classifying event semantics into tool
 * namespaces, etc.) can construct a GuardEvent directly and call
 * evaluateGuard themselves.
 */

import { evaluateGuard } from './guard-engine';
import type { GuardEvent, GuardStatus, GuardVerdict } from '../contracts/guard-contract';
import type { WorldDefinition } from '../types';

/**
 * Minimal shape an observed event needs to be auditable. Matches the
 * Radiant `Event` type's relevant fields but doesn't require importing
 * the full radiant domain module — keeps auditBehavior consumable by any
 * adapter that emits events.
 */
export interface AuditableEvent {
  /** Source-system-unique id (e.g. "github-push-abc123", "slack-msg-789"). */
  id: string;
  /** ISO 8601. */
  timestamp: string;
  /** Free-form kind tag from the adapter — 'commit', 'pr_opened', 'chat_message', etc. */
  kind?: string;
  /** Textual content of the event — commit message, PR body, chat text, etc. */
  content?: string;
  /** Actor id that produced the event. */
  actorId?: string;
  /** Actor kind — 'human' | 'ai' | 'bot' | 'unknown'. */
  actorKind?: string;
  /** Optional repo / channel / page reference, passed through as GuardEvent.scope. */
  scope?: string;
}

/**
 * A single crossing record — an observed event that would have triggered
 * a non-ALLOW verdict if the world were running in enforce mode.
 *
 * When `wouldHaveBlocked` is `false`, the event passed all layers cleanly
 * and no crossing occurred. Crossing records are most useful when
 * `wouldHaveBlocked` is `true` — that's a moment the leader said they
 * cared about, and here's evidence their team bumped into it.
 */
export interface Crossing {
  eventId: string;
  timestamp: string;
  kind?: string;
  actorId?: string;
  /** The status the engine would have returned in enforce mode. */
  shadowStatus: GuardStatus;
  /** Human-readable reason the shadow verdict fired. */
  shadowReason?: string;
  /** Rule or guard id that produced the shadow verdict. */
  ruleId?: string;
  /** Shortened quote of the event content — useful for a crossings panel. */
  excerpt?: string;
  /** True when the engine would have blocked/paused/etc. in enforce mode. */
  wouldHaveBlocked: boolean;
  /** Full verdict in case callers want the complete object. */
  verdict: GuardVerdict;
}

/**
 * Evaluate a single behavioral event against a world in observe mode.
 */
export function auditBehavior(
  event: AuditableEvent,
  world: WorldDefinition,
): Crossing {
  const guardEvent = toGuardEvent(event);
  const verdict = evaluateGuard(guardEvent, world, { mode: 'observe' });
  const wouldHaveBlocked = verdict.shadowStatus !== undefined && verdict.shadowStatus !== 'ALLOW';

  return {
    eventId: event.id,
    timestamp: event.timestamp,
    kind: event.kind,
    actorId: event.actorId,
    shadowStatus: verdict.shadowStatus ?? 'ALLOW',
    shadowReason: verdict.shadowReason,
    ruleId: verdict.ruleId,
    excerpt: event.content ? excerptContent(event.content) : undefined,
    wouldHaveBlocked,
    verdict,
  };
}

/**
 * Convenience: audit a whole stream of events. Returns one Crossing per
 * event; the caller can filter `wouldHaveBlocked` to get only the
 * interesting ones. Deterministic — same events + same world = same
 * crossings, every time.
 */
export function auditBehaviors(
  events: AuditableEvent[],
  world: WorldDefinition,
): Crossing[] {
  return events.map((e) => auditBehavior(e, world));
}

// ─── Mapping helpers ──────────────────────────────────────────────────────

function toGuardEvent(event: AuditableEvent): GuardEvent {
  return {
    intent: event.content ?? event.kind ?? 'unspecified',
    tool: event.kind,
    scope: event.scope,
    payload: {
      actorId: event.actorId,
      actorKind: event.actorKind,
      timestamp: event.timestamp,
      sourceEventId: event.id,
    },
  };
}

function excerptContent(content: string, max = 280): string {
  if (content.length <= max) return content;
  return content.slice(0, max - 1).trimEnd() + '…';
}
