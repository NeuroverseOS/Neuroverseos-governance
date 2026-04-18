/**
 * @neuroverseos/governance/radiant — Linear adapter (DRAFT)
 *
 * Reads planned work from Linear and surfaces the gap between what the team
 * said it would ship (issues, cycles, projects) and what actually got built
 * (signals from the GitHub adapter).
 *
 * The behavioral signal Linear uniquely provides:
 *   stated intent (issues planned, cycle committed) vs.
 *   shipped outcome (PRs merged, features delivered)
 *
 * That gap is the clearest "agency drift" signal a team can produce — and
 * none of the dev-productivity tools (LinearB, Swarmia, Jellyfish) read
 * Linear and GitHub together through a worldmodel lens.
 *
 * What it captures:
 *   - Issues created (planning velocity)
 *   - Issues completed (shipping velocity)
 *   - Issues stalled (in-progress > N days without movement)
 *   - Cycle commitment vs. completion (did we finish what we committed to?)
 *   - Comments (how much the team debates vs. ships)
 *   - Project-level updates (direction signals above the issue layer)
 *
 * Uses Linear GraphQL v1 via raw fetch (no @linear/sdk dependency,
 * matching the shape of notion.ts / slack.ts / discord.ts).
 * Requires a Linear personal API key with read access.
 *
 * STATUS: Draft skeleton. API shape locked. Query bodies stubbed with TODO
 * markers for review before execution. Not wired into emergent.ts yet.
 */

import type { Actor, Event } from '../core/domain';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface LinearFetchOptions {
  /** Restrict to specific team IDs. If empty, reads all accessible teams. */
  teamIds?: string[];
  /** How many days of history to fetch. Default: 14. */
  windowDays?: number;
  /** Max issues to fetch. Default: 200. */
  maxIssues?: number;
}

export interface LinearSignals {
  /** Issues created in window. */
  issuesCreated: number;
  /** Issues completed (moved to a "completed" state) in window. */
  issuesCompleted: number;
  /** Issues still open at window end. */
  issuesOpen: number;
  /** Issues in an in-progress state for > 14 days with no update. */
  issuesStalled: number;
  /** Ratio of completed / committed for cycles that ended in window. */
  cycleCompletionRate: number | null;
  /** Unique assignees active in window. */
  uniqueAssignees: number;
  /** Total comments across issues in window. */
  commentsTotal: number;
  /** Top project titles active in window. */
  topProjects: string[];
}

// ─── Main entry ────────────────────────────────────────────────────────────

/**
 * Fetch Linear activity and return Radiant Events + compressed signals.
 *
 * Shape mirrors fetchNotionActivity / fetchSlackActivity so the radiant
 * pipeline composes uniformly. Call from commands/emergent.ts the same way
 * as the other adapters.
 */
export async function fetchLinearActivity(
  apiKey: string,
  options: LinearFetchOptions = {},
): Promise<{ events: Event[]; signals: LinearSignals }> {
  const windowDays = options.windowDays ?? 14;
  const maxIssues = options.maxIssues ?? 200;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  // TODO(phase-1.2): replace stub with the GraphQL query below once shape is reviewed.
  // Linear GraphQL endpoint: https://api.linear.app/graphql
  // Auth header: { Authorization: <api-key> } — note: NOT "Bearer <key>"
  //
  // Planned query (one round-trip):
  //   issues(
  //     filter: {
  //       updatedAt: { gte: $since }
  //       team: { id: { in: $teamIds } }
  //     }
  //     first: $maxIssues
  //     orderBy: updatedAt
  //   ) {
  //     nodes {
  //       id, identifier, title, url,
  //       createdAt, updatedAt, completedAt, canceledAt,
  //       state { name, type }
  //       assignee { id, name, email }
  //       creator { id, name }
  //       team { id, name }
  //       project { id, name }
  //       cycle { id, number, startsAt, endsAt }
  //       comments(first: 20) { nodes { id, body, createdAt, user { id, name } } }
  //     }
  //   }
  //
  // Cycles query for cycleCompletionRate (separate round-trip):
  //   cycles(
  //     filter: { endsAt: { gte: $since, lte: $now } }
  //     first: 20
  //   ) {
  //     nodes {
  //       id, number, startsAt, endsAt,
  //       issueCountHistory, completedIssueCountHistory,
  //       team { id, name }
  //     }
  //   }
  const rawIssues: LinearIssue[] = []; // ← populated by fetchLinearGraphQL once stub is lifted
  const rawCycles: LinearCycle[] = []; // ← populated by fetchLinearGraphQL once stub is lifted

  const events: Event[] = [];
  const assignees = new Set<string>();
  const projects = new Map<string, number>();
  let issuesCreated = 0;
  let issuesCompleted = 0;
  let issuesOpen = 0;
  let issuesStalled = 0;
  let commentsTotal = 0;
  const now = Date.now();
  const stallThresholdMs = 14 * 24 * 60 * 60 * 1000;

  for (const issue of rawIssues) {
    const created = new Date(issue.createdAt);
    const updated = new Date(issue.updatedAt);
    const completed = issue.completedAt ? new Date(issue.completedAt) : null;
    const assigneeId = issue.assignee?.id ?? 'unassigned';
    if (assigneeId !== 'unassigned') assignees.add(assigneeId);

    if (issue.project) {
      projects.set(issue.project.name, (projects.get(issue.project.name) ?? 0) + 1);
    }

    const actor: Actor = {
      id: assigneeId,
      kind: 'human',
      name: issue.assignee?.name ?? 'unassigned',
    };

    // Creation event (planning signal)
    if (created >= since) {
      issuesCreated++;
      events.push({
        id: `linear-created-${issue.id}`,
        timestamp: issue.createdAt,
        actor: {
          id: issue.creator?.id ?? 'unknown',
          kind: 'human',
          name: issue.creator?.name ?? 'unknown',
        },
        kind: 'issue_created',
        content: `[${issue.identifier}] ${issue.title}`,
        metadata: {
          issueId: issue.id,
          url: issue.url,
          team: issue.team?.name,
          project: issue.project?.name,
          state: issue.state?.name,
        },
      });
    }

    // Completion event (shipping signal — the one that matches vs. GitHub)
    if (completed && completed >= since) {
      issuesCompleted++;
      events.push({
        id: `linear-completed-${issue.id}`,
        timestamp: issue.completedAt!,
        actor,
        kind: 'issue_completed',
        content: `[${issue.identifier}] ${issue.title}`,
        metadata: {
          issueId: issue.id,
          url: issue.url,
          team: issue.team?.name,
          project: issue.project?.name,
          cycleDays:
            issue.cycle?.startsAt && issue.completedAt
              ? Math.round(
                  (new Date(issue.completedAt).getTime() -
                    new Date(issue.cycle.startsAt).getTime()) /
                    (24 * 60 * 60 * 1000),
                )
              : null,
        },
      });
    }

    // Open / stalled bookkeeping
    if (!completed && !issue.canceledAt) {
      issuesOpen++;
      const isInProgress = issue.state?.type === 'started';
      const idleMs = now - updated.getTime();
      if (isInProgress && idleMs > stallThresholdMs) issuesStalled++;
    }

    // Comment events — how much the team debates vs. ships
    for (const comment of issue.comments?.nodes ?? []) {
      const commentedAt = new Date(comment.createdAt);
      if (commentedAt < since) continue;
      commentsTotal++;
      events.push({
        id: `linear-comment-${comment.id}`,
        timestamp: comment.createdAt,
        actor: {
          id: comment.user?.id ?? 'unknown',
          kind: 'human',
          name: comment.user?.name ?? 'unknown',
        },
        kind: 'issue_comment',
        content: comment.body.slice(0, 280),
        metadata: {
          issueId: issue.id,
          issueIdentifier: issue.identifier,
          url: issue.url,
        },
      });
    }
  }

  // Cycle completion rate: average of (completed / committed) across cycles ended in window
  let cycleCompletionRate: number | null = null;
  if (rawCycles.length > 0) {
    const rates: number[] = [];
    for (const cycle of rawCycles) {
      const committed = cycle.issueCountHistory?.at(0) ?? 0;
      const completed = cycle.completedIssueCountHistory?.at(-1) ?? 0;
      if (committed > 0) rates.push(completed / committed);
    }
    if (rates.length > 0) {
      cycleCompletionRate =
        Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100) / 100;
    }
  }

  const topProjects = [...projects.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  const signals: LinearSignals = {
    issuesCreated,
    issuesCompleted,
    issuesOpen,
    issuesStalled,
    cycleCompletionRate,
    uniqueAssignees: assignees.size,
    commentsTotal,
    topProjects,
  };

  events.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  return { events, signals };
}

/**
 * Format Linear signals for the AI interpretation prompt.
 * Emphasizes the stated-intent-vs-shipped-outcome framing so the lens
 * can pick up agency drift without the adapter naming it directly.
 */
export function formatLinearSignalsForPrompt(signals: LinearSignals): string {
  if (signals.issuesCreated === 0 && signals.issuesCompleted === 0 && signals.issuesOpen === 0) {
    return '';
  }

  const lines = [
    '## Linear Activity (planned work vs. shipped outcome)',
    '',
    `${signals.issuesCreated} issues created, ${signals.issuesCompleted} completed in window.`,
    `${signals.issuesOpen} issues still open.`,
  ];

  if (signals.issuesStalled > 0) {
    lines.push(
      `${signals.issuesStalled} in-progress issues haven't moved in 14+ days (stalled).`,
    );
  }
  if (signals.cycleCompletionRate !== null) {
    const pct = Math.round(signals.cycleCompletionRate * 100);
    lines.push(`Cycles ended in window completed ${pct}% of what was committed.`);
  }
  if (signals.uniqueAssignees > 0) {
    lines.push(`${signals.uniqueAssignees} unique assignees active.`);
  }
  if (signals.commentsTotal > 0) {
    lines.push(`${signals.commentsTotal} comments across issues in window.`);
  }
  if (signals.topProjects.length > 0) {
    lines.push(`Most active projects: ${signals.topProjects.join(', ')}.`);
  }

  lines.push('');
  lines.push('Linear is where the team states what it will build.');
  lines.push('GitHub is where the team reveals what actually got built.');
  lines.push('Low completion rate + high creation rate = planning faster than shipping.');
  lines.push('High stalled count = commitments made but not honored.');
  lines.push('Compare Linear signals against GitHub to find the stated-vs-shipped gap.');

  return lines.join('\n');
}

// ─── Linear GraphQL shapes ─────────────────────────────────────────────────

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  canceledAt?: string | null;
  state?: { name: string; type: string };
  assignee?: { id: string; name: string; email?: string };
  creator?: { id: string; name: string };
  team?: { id: string; name: string };
  project?: { id: string; name: string };
  cycle?: { id: string; number: number; startsAt: string; endsAt: string };
  comments?: { nodes: LinearComment[] };
}

interface LinearComment {
  id: string;
  body: string;
  createdAt: string;
  user?: { id: string; name: string };
}

interface LinearCycle {
  id: string;
  number: number;
  startsAt: string;
  endsAt: string;
  issueCountHistory?: number[];
  completedIssueCountHistory?: number[];
  team?: { id: string; name: string };
}
