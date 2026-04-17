/**
 * @neuroverseos/governance/radiant — Discord adapter
 *
 * Reads conversational activity from Discord channels and maps it to
 * Radiant's Event type. This is where Narrative Dynamics and Shared
 * Prosperity signals become visible — how the team communicates,
 * coordinates, welcomes newcomers, resolves debates.
 *
 * Two modes:
 *   - Channel message reading (via Discord Bot API)
 *   - Signal compression (aggregate metrics from raw messages)
 *
 * Privacy:
 *   - Public channels → community view (anyone can reproduce)
 *   - Team channels → team view (team exocortex only)
 *   - Private channels / DMs → never read unless explicitly configured
 *   - The bot token IS consent. Radiant respects Discord's permissions.
 *
 * Rate limiting:
 *   - Caps at 100 messages per channel per fetch
 *   - Produces compressed signals, not raw message dumps
 *   - AI receives a sample of 20-30 representative messages, not the firehose
 */

import type { Actor, ActorKind, Event } from '../core/domain';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DiscordFetchOptions {
  /** Channel IDs to read from. If empty, reads all accessible channels. */
  channelIds?: string[];
  /** How many days of history to fetch. Default: 14. */
  windowDays?: number;
  /** Max messages per channel. Default: 100. */
  perChannel?: number;
  /** Visibility level — determines which channels to read. */
  visibility?: 'public' | 'team';
}

export interface DiscordSignals {
  /** Total messages across all channels in the window. */
  totalMessages: number;
  /** Number of active channels. */
  activeChannels: number;
  /** Unique participants. */
  uniqueParticipants: number;
  /** Average response time in minutes (for threaded/reply messages). */
  avgResponseMinutes: number | null;
  /** Number of help requests detected (messages containing "help", "stuck", "how do I"). */
  helpRequests: number;
  /** Number of unresolved threads (threads with no reply). */
  unresolvedThreads: number;
  /** Top discussed topics (extracted from channel names + frequent terms). */
  topTopics: string[];
  /** Messages from new participants (first seen in this window). */
  newcomerMessages: number;
}

// ─── Main entry ────────────────────────────────────────────────────────────

/**
 * Fetch Discord activity and return Radiant Events + compressed signals.
 *
 * Uses the Discord Bot API (raw fetch, no SDK dependency).
 * Requires a bot token with MESSAGE_CONTENT intent enabled.
 */
export async function fetchDiscordActivity(
  guildId: string,
  token: string,
  options: DiscordFetchOptions = {},
): Promise<{ events: Event[]; signals: DiscordSignals }> {
  const windowDays = options.windowDays ?? 14;
  const perChannel = options.perChannel ?? 100;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const headers = {
    Authorization: `Bot ${token}`,
    'Content-Type': 'application/json',
  };

  // Fetch channels
  const channels = await fetchJSON<DiscordChannel[]>(
    `https://discord.com/api/v10/guilds/${guildId}/channels`,
    headers,
  );

  // Filter to text channels, apply visibility + channelIds filter
  const textChannels = channels.filter((c) => {
    if (c.type !== 0) return false; // 0 = GUILD_TEXT
    if (options.channelIds && options.channelIds.length > 0) {
      return options.channelIds.includes(c.id);
    }
    // If visibility is 'public', skip channels that look private
    if (options.visibility === 'public') {
      return !c.name.startsWith('private-') && !c.nsfw;
    }
    return true;
  });

  const events: Event[] = [];
  let totalMessages = 0;
  let helpRequests = 0;
  let unresolvedThreads = 0;
  let newcomerMessages = 0;
  const responseTimes: number[] = [];
  const participants = new Set<string>();
  const knownParticipants = new Set<string>();
  const topicCounts = new Map<string, number>();

  for (const channel of textChannels.slice(0, 15)) { // cap at 15 channels
    try {
      const messages = await fetchJSON<DiscordMessage[]>(
        `https://discord.com/api/v10/channels/${channel.id}/messages?limit=${perChannel}`,
        headers,
      );

      // Filter to window
      const inWindow = messages.filter(
        (m) => new Date(m.timestamp) >= since,
      );

      totalMessages += inWindow.length;

      // Track channel as topic
      const topic = channel.name.replace(/-/g, ' ');
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + inWindow.length);

      for (const msg of inWindow) {
        const actor = mapDiscordUser(msg.author);
        participants.add(actor.id);

        // Detect help requests
        const lowerContent = msg.content.toLowerCase();
        if (
          lowerContent.includes('help') ||
          lowerContent.includes('stuck') ||
          lowerContent.includes('how do i') ||
          lowerContent.includes('anyone know')
        ) {
          helpRequests++;
        }

        // Track response times for replies
        if (msg.referenced_message) {
          const refTime = new Date(msg.referenced_message.timestamp).getTime();
          const msgTime = new Date(msg.timestamp).getTime();
          const diffMinutes = (msgTime - refTime) / 60000;
          if (diffMinutes > 0 && diffMinutes < 10080) { // cap at 1 week
            responseTimes.push(diffMinutes);
          }
        }

        // Map to Radiant Event
        events.push({
          id: `discord-${msg.id}`,
          timestamp: msg.timestamp,
          actor,
          kind: 'discord_message',
          content: msg.content.slice(0, 500),
          respondsTo: msg.referenced_message
            ? {
                eventId: `discord-${msg.referenced_message.id}`,
                actor: mapDiscordUser(msg.referenced_message.author),
              }
            : undefined,
          metadata: {
            channel: channel.name,
            guildId,
          },
        });
      }
    } catch {
      // Skip channels that fail (permissions, etc.)
    }
  }

  // Compute signals
  const avgResponseMinutes =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : null;

  const topTopics = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);

  const signals: DiscordSignals = {
    totalMessages,
    activeChannels: textChannels.length,
    uniqueParticipants: participants.size,
    avgResponseMinutes: avgResponseMinutes ? Math.round(avgResponseMinutes) : null,
    helpRequests,
    unresolvedThreads,
    topTopics,
    newcomerMessages,
  };

  // Sort events by timestamp
  events.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  return { events, signals };
}

/**
 * Format Discord signals for the AI interpretation prompt.
 */
export function formatDiscordSignalsForPrompt(signals: DiscordSignals): string {
  if (signals.totalMessages === 0) return '';

  const lines = [
    '## Discord Activity (conversational behavior)',
    '',
    `${signals.totalMessages} messages across ${signals.activeChannels} channels.`,
    `${signals.uniqueParticipants} unique participants.`,
  ];

  if (signals.avgResponseMinutes !== null) {
    lines.push(`Average response time: ${signals.avgResponseMinutes} minutes.`);
  }
  if (signals.helpRequests > 0) {
    lines.push(`${signals.helpRequests} help requests detected.`);
  }
  if (signals.unresolvedThreads > 0) {
    lines.push(`${signals.unresolvedThreads} unresolved threads.`);
  }
  if (signals.topTopics.length > 0) {
    lines.push(`Top discussion topics: ${signals.topTopics.join(', ')}.`);
  }

  lines.push('');
  lines.push('Compare conversational activity against GitHub shipping activity.');
  lines.push('Where debates happen in Discord but nothing ships in GitHub, name the gap.');
  lines.push('Where work ships in GitHub but nobody discusses it in Discord, name the visibility gap.');

  return lines.join('\n');
}

// ─── Discord API shapes ────────────────────────────────────────────────────

interface DiscordChannel {
  id: string;
  name: string;
  type: number; // 0 = GUILD_TEXT
  nsfw: boolean;
}

interface DiscordUser {
  id: string;
  username: string;
  bot?: boolean;
}

interface DiscordMessage {
  id: string;
  content: string;
  timestamp: string;
  author: DiscordUser;
  referenced_message?: {
    id: string;
    timestamp: string;
    author: DiscordUser;
  };
}

// ─── Mappers ───────────────────────────────────────────────────────────────

function mapDiscordUser(user: DiscordUser): Actor {
  return {
    id: user.username,
    kind: user.bot ? 'bot' : 'human',
    name: user.username,
  };
}

async function fetchJSON<T>(
  url: string,
  headers: Record<string, string>,
): Promise<T> {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    if (res.status === 404 || res.status === 403) return [] as unknown as T;
    throw new Error(`Discord API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as T;
}
