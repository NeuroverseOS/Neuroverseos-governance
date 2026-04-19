/**
 * @neuroverseos/governance/radiant — governance audit
 *
 * Runs each GitHub event through the NeuroverseOS guard engine against
 * the compiled worldmodel. Produces an audit trail showing which events
 * triggered governance (BLOCK/MODIFY), which side (human/AI/joint),
 * and what invariants were tested.
 *
 * This is where Radiant meets the NeuroverseOS governance engine.
 * Same evaluateGuard() that runs at API-level, applied retroactively
 * to activity that already happened. The audit trail is the proof that
 * the cocoon's walls are holding — or shows where they're being tested.
 */

import { evaluateGuard } from '../../engine/guard-engine';
import { loadWorld } from '../../loader/world-loader';
import type { WorldDefinition } from '../../types';
import type { ClassifiedEvent } from '../core/signals';
import type { ActorDomain } from '../core/domain';
import type { Crossing } from '../../engine/audit-behavior';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface GovernanceVerdict {
  eventId: string;
  domain: ActorDomain;
  status: 'ALLOW' | 'BLOCK' | 'MODIFY' | 'PAUSE' | 'PENALIZE' | 'REWARD';
  reason?: string;
  ruleId?: string;
  warning?: string;
}

export interface GovernanceAudit {
  totalEvents: number;
  human: { allow: number; modify: number; block: number; details: GovernanceVerdict[] };
  cyber: { allow: number; modify: number; block: number; details: GovernanceVerdict[] };
  joint: { allow: number; modify: number; block: number; details: GovernanceVerdict[] };
  /**
   * Crossings — events that WOULD have been blocked/paused/modified in
   * enforce mode. Populated by running the guard engine in observe mode,
   * so nothing is actually stopped; callers record the crossing for the
   * leader to see. Each crossing carries shadowStatus + shadowReason so
   * downstream tooling (Bevia, Radiant UIs, audit logs) can surface
   * specific moments the worldmodel was touched.
   */
  crossings: Crossing[];
  /** Summary for rendering — most important findings. */
  summary: string;
}

// ─── Audit function ────────────────────────────────────────────────────────

/**
 * Run each classified event through the guard engine against the compiled
 * worldmodel. Returns a structured audit with human/cyber/joint breakdown.
 *
 * @param events — classified events from the GitHub adapter
 * @param worldPath — path to a compiled .nv-world.md or world directory
 */
export async function auditGovernance(
  events: readonly ClassifiedEvent[],
  worldPath: string,
): Promise<GovernanceAudit> {
  let world: WorldDefinition;
  try {
    world = await loadWorld(worldPath);
  } catch {
    return emptyAudit(events.length, 'Could not load compiled worldmodel for governance audit.');
  }

  const verdicts: GovernanceVerdict[] = [];
  const crossings: Crossing[] = [];

  for (const ce of events) {
    const intent = ce.event.content?.slice(0, 500) || ce.event.kind || 'activity';
    const scope = (ce.event.metadata?.scope as string) || undefined;

    try {
      // Observe mode — this evaluation is retroactive (the action
      // already happened on GitHub). The engine must NOT attempt to
      // enforce; it should report what WOULD have happened and let
      // Bevia / Radiant surface the crossing to the leader.
      const result = evaluateGuard(
        {
          intent,
          scope,
          actionCategory: mapKindToCategory(ce.event.kind),
        },
        world,
        { mode: 'observe' },
      );

      // In observe mode `status` is always ALLOW. The real verdict
      // lives on `shadowStatus` / `shadowReason`.
      const shadow = result.shadowStatus ?? 'ALLOW';

      verdicts.push({
        eventId: ce.event.id,
        domain: ce.domain,
        status: shadow as GovernanceVerdict['status'],
        reason: result.shadowReason,
        ruleId: result.ruleId,
        warning: result.warning,
      });

      if (shadow !== 'ALLOW') {
        crossings.push({
          eventId: ce.event.id,
          timestamp: ce.event.timestamp,
          kind: ce.event.kind,
          actorId: ce.event.actor.id,
          shadowStatus: shadow,
          shadowReason: result.shadowReason,
          ruleId: result.ruleId,
          excerpt: intent.length > 280 ? intent.slice(0, 279) + '…' : intent,
          wouldHaveBlocked: true,
          verdict: result,
        });
      }
    } catch {
      verdicts.push({
        eventId: ce.event.id,
        domain: ce.domain,
        status: 'ALLOW',
        reason: 'guard evaluation skipped (error)',
      });
    }
  }

  // Bucket by domain
  const human = bucketVerdicts(verdicts.filter((v) => v.domain === 'life'));
  const cyber = bucketVerdicts(verdicts.filter((v) => v.domain === 'cyber'));
  const joint = bucketVerdicts(verdicts.filter((v) => v.domain === 'joint'));

  const summary = buildSummary(human, cyber, joint, events.length);

  return {
    totalEvents: events.length,
    human,
    cyber,
    joint,
    crossings,
    summary,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function bucketVerdicts(verdicts: GovernanceVerdict[]): {
  allow: number;
  modify: number;
  block: number;
  details: GovernanceVerdict[];
} {
  const nonAllow = verdicts.filter((v) => v.status !== 'ALLOW');
  return {
    allow: verdicts.filter((v) => v.status === 'ALLOW').length,
    modify: verdicts.filter((v) => v.status === 'MODIFY').length,
    block: verdicts.filter((v) => v.status === 'BLOCK').length,
    details: nonAllow,
  };
}

function buildSummary(
  human: ReturnType<typeof bucketVerdicts>,
  cyber: ReturnType<typeof bucketVerdicts>,
  joint: ReturnType<typeof bucketVerdicts>,
  total: number,
): string {
  const humanTriggered = human.modify + human.block;
  const cyberTriggered = cyber.modify + cyber.block;
  const jointTriggered = joint.modify + joint.block;
  const totalTriggered = humanTriggered + cyberTriggered + jointTriggered;

  if (totalTriggered === 0) {
    return `${total} events evaluated. All passed. The cocoon held — no governance triggered.`;
  }

  const parts: string[] = [];
  parts.push(`${total} events evaluated. ${totalTriggered} triggered governance.`);

  if (humanTriggered > 0) {
    parts.push(`Human side: ${humanTriggered} (${human.block} blocked, ${human.modify} modified).`);
  }
  if (cyberTriggered > 0) {
    parts.push(`AI side: ${cyberTriggered} (${cyber.block} blocked, ${cyber.modify} modified).`);
  }
  if (jointTriggered > 0) {
    parts.push(`Joint work: ${jointTriggered} (${joint.block} blocked, ${joint.modify} modified).`);
  }

  if (humanTriggered > 0 && cyberTriggered > 0) {
    const ratio = humanTriggered / cyberTriggered;
    if (ratio > 2) {
      parts.push('Human side is testing the frame more than AI. Either the worldmodel needs calibrating for human workflows, or humans are genuinely drifting.');
    } else if (ratio < 0.5) {
      parts.push('AI side is testing the frame more than humans. Check whether the AI\'s output patterns match the declared invariants.');
    } else {
      parts.push('Roughly balanced between human and AI — both sides are testing the frame.');
    }
  }

  return parts.join(' ');
}

function mapKindToCategory(kind?: string): 'read' | 'write' | 'other' {
  if (!kind) return 'other';
  if (kind.includes('commit') || kind.includes('merge')) return 'write';
  if (kind.includes('review') || kind.includes('comment')) return 'read';
  return 'other';
}

function emptyAudit(total: number, reason: string): GovernanceAudit {
  return {
    totalEvents: total,
    human: { allow: 0, modify: 0, block: 0, details: [] },
    cyber: { allow: 0, modify: 0, block: 0, details: [] },
    joint: { allow: 0, modify: 0, block: 0, details: [] },
    crossings: [],
    summary: reason,
  };
}
