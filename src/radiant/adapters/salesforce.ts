/**
 * @neuroverseos/governance/radiant — Salesforce adapter
 *
 * Reads the leader's Salesforce activity and normalizes it into Event[]
 * for the Radiant pipeline. Opens the entire sales-leader market —
 * every sales org of any scale runs on Salesforce, and "is the pipeline
 * drifting from what we declared we'd close" is the exact job Radiant
 * does for that audience.
 *
 * v1 scope:
 *   - Recent Opportunity changes: stage transitions, amount updates,
 *     close-date changes (the signal set for deal-drift detection)
 *   - Recent Tasks + logged Calls (activity per rep)
 *   - Chatter FeedItems if accessible (how the team talks about deals)
 *
 * Auth: Salesforce OAuth — access token + instance URL. Each org has
 * its own `my.salesforce.com` endpoint; the token alone isn't enough,
 * the caller must also pass the instance URL.
 *
 * Individual-rep or individual-manager OAuth works without admin
 * consent — this adapter assumes one Salesforce user's view. For
 * enterprise admin-consent + org-wide access, a later adapter
 * variant can use the Reports API or a service-user token.
 *
 * Deno / browser / Node — native fetch only.
 */

import type { Event } from '../core/domain';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SalesforceFetchOptions {
  /** OAuth access token with api + refresh_token scopes. */
  accessToken: string;
  /**
   * Salesforce instance URL — e.g. https://acme.my.salesforce.com.
   * Comes back in the token response; caller must persist it.
   */
  instanceUrl: string;
  /** How many days of history to fetch. Default: 14. */
  windowDays?: number;
  /** Max records per entity. Default: 200 (hard cap on SOQL page). */
  maxRecords?: number;
  /** The leader's own Salesforce user name / email, if known. */
  leaderName?: string;
}

export interface SalesforceSignals {
  opportunitiesMoved: number;
  stageTransitions: number;
  amountChanges: number;
  closedWon: number;
  closedLost: number;
  tasksLogged: number;
  callsLogged: number;
  feedPostsByLeader: number;
  totalPipelineAmount: number;
  topStages: Array<{ stage: string; count: number }>;
}

// ─── Main entry ────────────────────────────────────────────────────────────

export async function fetchSalesforceActivity(
  options: SalesforceFetchOptions,
): Promise<{ events: Event[]; signals: SalesforceSignals }> {
  const windowDays = options.windowDays ?? 14;
  const maxRecords = Math.min(options.maxRecords ?? 200, 200);
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const sinceSoql = since.toISOString();

  const events: Event[] = [];
  const signals: SalesforceSignals = {
    opportunitiesMoved: 0,
    stageTransitions: 0,
    amountChanges: 0,
    closedWon: 0,
    closedLost: 0,
    tasksLogged: 0,
    callsLogged: 0,
    feedPostsByLeader: 0,
    totalPipelineAmount: 0,
    topStages: [],
  };

  // ─── Opportunities moved in window ─────────────────────────────────────
  const opps = await soqlQuery<{
    Id: string;
    Name: string;
    StageName: string;
    Amount: number | null;
    CloseDate: string;
    IsClosed: boolean;
    IsWon: boolean;
    LastModifiedDate: string;
    Owner: { Name?: string };
  }>(
    options,
    `SELECT Id, Name, StageName, Amount, CloseDate, IsClosed, IsWon, LastModifiedDate, Owner.Name
     FROM Opportunity
     WHERE LastModifiedDate >= ${sinceSoql}
     ORDER BY LastModifiedDate DESC
     LIMIT ${maxRecords}`,
  );

  const stageCounts = new Map<string, number>();
  for (const opp of opps) {
    signals.opportunitiesMoved++;
    signals.totalPipelineAmount += opp.Amount ?? 0;
    stageCounts.set(opp.StageName, (stageCounts.get(opp.StageName) ?? 0) + 1);
    if (opp.IsClosed && opp.IsWon) signals.closedWon++;
    if (opp.IsClosed && !opp.IsWon) signals.closedLost++;

    events.push({
      id: `sf-opp-${opp.Id}`,
      timestamp: opp.LastModifiedDate,
      actor: {
        id: opp.Owner?.Name ?? 'unknown',
        kind: 'human',
        name: opp.Owner?.Name ?? 'unknown',
      },
      kind: opp.IsClosed ? (opp.IsWon ? 'deal_won' : 'deal_lost') : 'deal_updated',
      content: `${opp.Name} — ${opp.StageName}${
        opp.Amount ? ` · $${Math.round(opp.Amount).toLocaleString()}` : ''
      } · close ${opp.CloseDate}`,
      metadata: {
        opportunityId: opp.Id,
        stage: opp.StageName,
        amount: opp.Amount,
        closeDate: opp.CloseDate,
      },
    });
  }
  signals.topStages = [...stageCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([stage, count]) => ({ stage, count }));

  // ─── Opportunity history — stage + amount transitions ────────────────
  const history = await soqlQuery<{
    Id: string;
    OpportunityId: string;
    Field: string;
    OldValue: unknown;
    NewValue: unknown;
    CreatedDate: string;
    CreatedBy: { Name?: string };
  }>(
    options,
    `SELECT Id, OpportunityId, Field, OldValue, NewValue, CreatedDate, CreatedBy.Name
     FROM OpportunityFieldHistory
     WHERE CreatedDate >= ${sinceSoql} AND Field IN ('StageName', 'Amount', 'CloseDate')
     ORDER BY CreatedDate DESC
     LIMIT ${maxRecords}`,
  ).catch(() => []);

  for (const h of history) {
    if (h.Field === 'StageName') signals.stageTransitions++;
    if (h.Field === 'Amount') signals.amountChanges++;
    events.push({
      id: `sf-hist-${h.Id}`,
      timestamp: h.CreatedDate,
      actor: {
        id: h.CreatedBy?.Name ?? 'unknown',
        kind: 'human',
        name: h.CreatedBy?.Name ?? 'unknown',
      },
      kind: `deal_${h.Field.toLowerCase()}_changed`,
      content: `${h.Field}: ${String(h.OldValue)} → ${String(h.NewValue)}`,
      metadata: {
        opportunityId: h.OpportunityId,
        field: h.Field,
      },
    });
  }

  // ─── Tasks + Calls ──────────────────────────────────────────────────────
  const tasks = await soqlQuery<{
    Id: string;
    Subject: string;
    Status: string;
    Type: string | null;
    CreatedDate: string;
    Owner: { Name?: string };
  }>(
    options,
    `SELECT Id, Subject, Status, Type, CreatedDate, Owner.Name
     FROM Task
     WHERE CreatedDate >= ${sinceSoql}
     ORDER BY CreatedDate DESC
     LIMIT ${maxRecords}`,
  ).catch(() => []);

  for (const t of tasks) {
    signals.tasksLogged++;
    if (t.Type === 'Call' || (t.Subject || '').toLowerCase().includes('call')) {
      signals.callsLogged++;
    }
    events.push({
      id: `sf-task-${t.Id}`,
      timestamp: t.CreatedDate,
      actor: {
        id: t.Owner?.Name ?? 'unknown',
        kind: 'human',
        name: t.Owner?.Name ?? 'unknown',
      },
      kind: t.Type === 'Call' ? 'call_logged' : 'task_logged',
      content: `${t.Subject} — ${t.Status}`,
      metadata: { taskId: t.Id, type: t.Type, status: t.Status },
    });
  }

  // ─── Feed posts by leader (Chatter) ────────────────────────────────────
  if (options.leaderName) {
    const feed = await soqlQuery<{
      Id: string;
      Body: string;
      CreatedDate: string;
      CreatedBy: { Name?: string };
      ParentId: string;
    }>(
      options,
      `SELECT Id, Body, CreatedDate, CreatedBy.Name, ParentId
       FROM FeedItem
       WHERE CreatedDate >= ${sinceSoql} AND CreatedBy.Name = '${escapeSoql(options.leaderName)}'
       ORDER BY CreatedDate DESC
       LIMIT ${Math.min(maxRecords, 50)}`,
    ).catch(() => []);
    for (const f of feed) {
      signals.feedPostsByLeader++;
      events.push({
        id: `sf-feed-${f.Id}`,
        timestamp: f.CreatedDate,
        actor: {
          id: f.CreatedBy?.Name ?? 'unknown',
          kind: 'human',
          name: f.CreatedBy?.Name ?? 'unknown',
        },
        kind: 'feed_post',
        content: (f.Body || '').slice(0, 280),
        metadata: { feedId: f.Id, parent: f.ParentId },
      });
    }
  }

  events.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  return { events, signals };
}

/**
 * Format Salesforce signals for the AI interpretation prompt.
 */
export function formatSalesforceSignalsForPrompt(signals: SalesforceSignals): string {
  if (
    signals.opportunitiesMoved === 0 &&
    signals.tasksLogged === 0 &&
    signals.stageTransitions === 0
  ) {
    return '';
  }

  const lines = [
    '## Salesforce Activity (stated pipeline vs observed motion)',
    '',
  ];
  if (signals.opportunitiesMoved > 0) {
    const pipelineM = Math.round(signals.totalPipelineAmount / 10_000) / 100;
    lines.push(
      `${signals.opportunitiesMoved} opportunities touched in window ($${pipelineM}M total pipeline represented).`,
    );
    lines.push(
      `${signals.stageTransitions} stage changes, ${signals.amountChanges} amount changes.`,
    );
    if (signals.closedWon + signals.closedLost > 0) {
      lines.push(`${signals.closedWon} closed won, ${signals.closedLost} closed lost.`);
    }
    if (signals.topStages.length > 0) {
      lines.push(
        `Most active stages: ${signals.topStages
          .map((s) => `${s.stage} (${s.count})`)
          .join(', ')}.`,
      );
    }
  }
  if (signals.tasksLogged > 0) {
    lines.push(
      `${signals.tasksLogged} tasks logged (${signals.callsLogged} calls).`,
    );
  }
  if (signals.feedPostsByLeader > 0) {
    lines.push(`${signals.feedPostsByLeader} feed posts by the leader.`);
  }

  lines.push('');
  lines.push(
    'Salesforce shows what the team said would happen (stages, forecast) vs. what is actually happening (movement, activity, close).',
  );
  lines.push(
    'Compare stage transitions against stated strategy — are the deals the leader said would close actually moving, or is the pipeline drifting?',
  );

  return lines.join('\n');
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function soqlQuery<T>(
  opts: SalesforceFetchOptions,
  query: string,
): Promise<T[]> {
  const url = new URL(`${opts.instanceUrl}/services/data/v59.0/query`);
  url.searchParams.set('q', query);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${opts.accessToken}` },
  });
  if (!res.ok) {
    // Let the caller decide whether a single table's failure is fatal;
    // callers that tolerate missing permissions use .catch(() => []).
    throw new Error(
      `Salesforce SOQL ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as { records?: T[] };
  return json.records ?? [];
}

function escapeSoql(raw: string): string {
  // Defensive — strip single quotes and backslashes from string
  // literals interpolated into SOQL. Better: use typed binds when the
  // SF client supports them, but this is v1 and the leaderName comes
  // from the leader's own OAuth userinfo, not user input.
  return raw.replace(/['\\]/g, '');
}
