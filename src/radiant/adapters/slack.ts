/**
 * @neuroverseos/governance/radiant — Slack adapter
 *
 * Reads conversational activity from Slack workspaces. For Auki, Slack
 * is used for external client and partner communication — FairPrice,
 * retail pilots, Intercognitive coalition partners.
 *
 * What it captures:
 *   - Partner coordination patterns (peaq, Mawari, GEODNET)
 *   - Client communication quality (responsiveness, follow-through)
 *   - External contributor onboarding
 *   - Cross-organization alignment signals
 *   - Decision-making in channels (debates → outcomes)
 *
 * Privacy: workspace token controls access. Bot tokens see channels
 * the bot is invited to. User tokens see what the user sees. Private
 * channels and DMs only accessible if explicitly configured.
 *
 * Uses Slack Web API via raw fetch (no SDK dependency).
 * Requires a Bot Token with channels:history + channels:read scopes.
 */

import type { Actor, ActorKind, Event } from '../core/domain';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SlackFetchOptions {
  /** Channel IDs to read. If empty, reads all public channels the bot can see. */
  channelIds?: string[];
  /** How many days of history to fetch. Default: 14. */
  windowDays?: number;
  /** Max messages per channel. Default: 100. */
  perChannel?: number;
  /** Visibility level. */
  visibility?: 'public' | 'team';
}

export interface SlackSignals {
  totalMessages: number;
  activeChannels: number;
  uniqueParticipants: number;
  avgResponseMinutes: number | null;
  externalParticipants: number;
  unresolvedThreads: number;
  topChannels: string[];
  reactionCount: number;
}

// ─── Main entry ────────────────────────────────────────────────────────────

/**
 * Fetch Slack activity and return Radiant Events + compressed signals.
 */
export async function fetchSlackActivity(
  token: string,
  options: SlackFetchOptions = {},
): Promise<{ events: Event[]; signals: SlackSignals }> {
  const windowDays = options.windowDays ?? 14;
  const perChannel = options.perChannel ?? 100;
  const oldest = String(
    Math.floor((Date.now() - windowDays * 24 * 60 * 60 * 1000) / 1000),
  );

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Fetch channel list
  const channelsResponse = await fetchSlackAPI<{
    channels: SlackChannel[];
  }>('https://slack.com/api/conversations.list?types=public_channel&limit=200', headers);

  let channels = channelsResponse.channels ?? [];

  // Filter by configured channel IDs
  if (options.channelIds && options.channelIds.length > 0) {
    const ids = new Set(options.channelIds);
    channels = channels.filter((c) => ids.has(c.id));
  }

  // For public visibility, only read public non-archived channels
  if (options.visibility === 'public') {
    channels = channels.filter((c) => !c.is_private && !c.is_archived);
  }

  const events: Event[] = [];
  let totalMessages = 0;
  let reactionCount = 0;
  let unresolvedThreads = 0;
  const responseTimes: number[] = [];
  const participants = new Set<string>();
  const externalParticipants = new Set<string>();
  const channelMessageCounts = new Map<string, number>();

  for (const channel of channels.slice(0, 15)) {
    try {
      const historyResponse = await fetchSlackAPI<{
        messages: SlackMessage[];
      }>(
        `https://slack.com/api/conversations.history?channel=${channel.id}&limit=${perChannel}&oldest=${oldest}`,
        headers,
      );

      const messages = historyResponse.messages ?? [];
      totalMessages += messages.length;
      channelMessageCounts.set(channel.name, messages.length);

      for (const msg of messages) {
        if (msg.subtype === 'channel_join' || msg.subtype === 'channel_leave') continue;

        const actor = mapSlackUser(msg.user ?? 'unknown');
        participants.add(actor.id);

        // Count reactions
        if (msg.reactions) {
          reactionCount += msg.reactions.reduce(
            (sum, r) => sum + (r.count ?? 0),
            0,
          );
        }

        // Track thread response times
        if (msg.thread_ts && msg.thread_ts !== msg.ts) {
          const parentTs = parseFloat(msg.thread_ts) * 1000;
          const msgTs = parseFloat(msg.ts) * 1000;
          const diffMinutes = (msgTs - parentTs) / 60000;
          if (diffMinutes > 0 && diffMinutes < 10080) {
            responseTimes.push(diffMinutes);
          }
        }

        // Detect unresolved threads (messages with thread_ts = self, reply_count 0)
        if (msg.thread_ts === msg.ts && (!msg.reply_count || msg.reply_count === 0)) {
          // Question-like messages with no replies
          if (msg.text && (msg.text.includes('?') || msg.text.toLowerCase().includes('help'))) {
            unresolvedThreads++;
          }
        }

        // Map to Event
        const timestamp = new Date(parseFloat(msg.ts) * 1000).toISOString();
        events.push({
          id: `slack-${msg.ts}`,
          timestamp,
          actor,
          kind: 'slack_message',
          content: (msg.text ?? '').slice(0, 500),
          respondsTo: msg.thread_ts && msg.thread_ts !== msg.ts
            ? {
                eventId: `slack-${msg.thread_ts}`,
                actor: { id: 'thread-parent', kind: 'unknown' as ActorKind },
              }
            : undefined,
          metadata: {
            channel: channel.name,
            isPrivate: channel.is_private,
            hasReactions: (msg.reactions?.length ?? 0) > 0,
          },
        });
      }
    } catch {
      // Skip channels that fail
    }
  }

  const avgResponseMinutes =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null;

  const topChannels = [...channelMessageCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  const signals: SlackSignals = {
    totalMessages,
    activeChannels: channelMessageCounts.size,
    uniqueParticipants: participants.size,
    avgResponseMinutes,
    externalParticipants: externalParticipants.size,
    unresolvedThreads,
    topChannels,
    reactionCount,
  };

  events.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  return { events, signals };
}

/**
 * Format Slack signals for the AI interpretation prompt.
 */
export function formatSlackSignalsForPrompt(signals: SlackSignals): string {
  if (signals.totalMessages === 0) return '';

  const lines = [
    '## Slack Activity (external coordination)',
    '',
    `${signals.totalMessages} messages across ${signals.activeChannels} channels.`,
    `${signals.uniqueParticipants} unique participants.`,
  ];

  if (signals.avgResponseMinutes !== null) {
    lines.push(`Average thread response time: ${signals.avgResponseMinutes} minutes.`);
  }
  if (signals.unresolvedThreads > 0) {
    lines.push(`${signals.unresolvedThreads} questions/threads with no reply.`);
  }
  if (signals.reactionCount > 0) {
    lines.push(`${signals.reactionCount} reactions (engagement signal).`);
  }
  if (signals.topChannels.length > 0) {
    lines.push(`Most active channels: ${signals.topChannels.join(', ')}.`);
  }

  lines.push('');
  lines.push('Slack carries external coordination — partner and client communication.');
  lines.push('Compare partner engagement against internal activity. Where partners are');
  lines.push('active but internal follow-through is low, name the gap.');

  return lines.join('\n');
}

// ─── Slack API shapes ──────────────────────────────────────────────────────

interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_archived: boolean;
}

interface SlackMessage {
  ts: string;
  text?: string;
  user?: string;
  subtype?: string;
  thread_ts?: string;
  reply_count?: number;
  reactions?: Array<{ name: string; count?: number }>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function mapSlackUser(userId: string): Actor {
  return {
    id: userId,
    kind: 'human',
    name: userId,
  };
}

async function fetchSlackAPI<T>(
  url: string,
  headers: Record<string, string>,
): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Slack API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { ok: boolean; error?: string } & T;
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error ?? 'unknown'}`);
  }
  return data;
}
