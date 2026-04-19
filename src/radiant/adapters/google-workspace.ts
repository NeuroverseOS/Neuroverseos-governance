/**
 * @neuroverseos/governance/radiant — Google Workspace adapter
 *
 * Reads the leader's Gmail (sent messages) + Calendar (events in the
 * window) and normalizes both into Event[] for the Radiant pipeline.
 *
 * Why Google Workspace matters:
 *   - It's the most universal source. Every non-MS-shop leader has
 *     Gmail + Calendar. Non-engineering leaders who never touch GitHub
 *     or Linear still live in these two apps.
 *   - Gmail sent folder = external coordination signal. What the
 *     leader's actually pushing out into the world. Drift between
 *     stated strategy and actual outreach shows up here first.
 *   - Calendar = meeting load vs. output. Heavy meetings + thin
 *     shipping = the drift pattern leaders most want to catch.
 *
 * v1 scope:
 *   - Gmail: list the leader's own sent messages in the window.
 *     Subject + snippet + recipients + timestamp. No body (privacy +
 *     payload size).
 *   - Calendar: list events in the window from the primary calendar.
 *     Title + attendees count + duration + whether the leader
 *     organized.
 *
 * Auth: Google OAuth access token with scopes
 *   https://www.googleapis.com/auth/gmail.readonly
 *   https://www.googleapis.com/auth/calendar.readonly
 * Token lifecycle (refresh) is the caller's job — this adapter takes
 * a valid access token as input.
 *
 * Deno / browser / Node all work — uses native fetch only.
 */

import type { Event } from '../core/domain';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface GoogleWorkspaceFetchOptions {
  /** Access token with gmail.readonly + calendar.readonly scopes. */
  accessToken: string;
  /** How many days of history to fetch. Default: 14. */
  windowDays?: number;
  /** Max emails to include. Default: 100. */
  maxEmails?: number;
  /** Max calendar events to include. Default: 100. */
  maxEvents?: number;
  /** The leader's own email address — used to identify their events. */
  leaderEmail?: string;
}

export interface GoogleWorkspaceSignals {
  emailsSent: number;
  uniqueRecipients: number;
  topRecipients: string[];
  meetingsHeld: number;
  meetingsOrganized: number;
  uniqueAttendees: number;
  totalMeetingMinutes: number;
  avgMeetingAttendees: number | null;
}

// ─── Main entry ────────────────────────────────────────────────────────────

export async function fetchGoogleWorkspaceActivity(
  options: GoogleWorkspaceFetchOptions,
): Promise<{ events: Event[]; signals: GoogleWorkspaceSignals }> {
  const windowDays = options.windowDays ?? 14;
  const maxEmails = options.maxEmails ?? 100;
  const maxEvents = options.maxEvents ?? 100;
  const leaderEmail = options.leaderEmail?.toLowerCase();
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [emailEvents, emailSignals] = await fetchGmailSent(
    options.accessToken,
    since,
    maxEmails,
    leaderEmail,
  );
  const [calendarEvents, calendarSignals] = await fetchCalendarEvents(
    options.accessToken,
    since,
    maxEvents,
    leaderEmail,
  );

  const events = [...emailEvents, ...calendarEvents].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );

  return {
    events,
    signals: {
      ...emailSignals,
      ...calendarSignals,
    },
  };
}

/**
 * Format Google Workspace signals for the AI interpretation prompt.
 */
export function formatGoogleWorkspaceSignalsForPrompt(
  signals: GoogleWorkspaceSignals,
): string {
  if (signals.emailsSent === 0 && signals.meetingsHeld === 0) return '';

  const lines = [
    '## Google Workspace Activity (external coordination + meeting load)',
    '',
  ];

  if (signals.emailsSent > 0) {
    lines.push(
      `${signals.emailsSent} emails sent in window, to ${signals.uniqueRecipients} unique recipients.`,
    );
    if (signals.topRecipients.length > 0) {
      lines.push(`Most-emailed: ${signals.topRecipients.slice(0, 5).join(', ')}.`);
    }
  }

  if (signals.meetingsHeld > 0) {
    const hours = Math.round((signals.totalMeetingMinutes / 60) * 10) / 10;
    lines.push(
      `${signals.meetingsHeld} meetings held (${signals.meetingsOrganized} organized by the leader), ${hours}h total.`,
    );
    if (signals.avgMeetingAttendees !== null) {
      lines.push(
        `Average ${signals.avgMeetingAttendees} attendees per meeting, ${signals.uniqueAttendees} unique attendees total.`,
      );
    }
  }

  lines.push('');
  lines.push(
    "Gmail sent volume + Calendar meeting load reveal a leader's external coordination shape.",
  );
  lines.push(
    'Compare against shipped work (GitHub, Linear) to find the stated-strategy-vs-actual-time gap.',
  );

  return lines.join('\n');
}

// ─── Gmail ─────────────────────────────────────────────────────────────────

async function fetchGmailSent(
  token: string,
  since: Date,
  maxEmails: number,
  leaderEmail: string | undefined,
): Promise<[Event[], Pick<GoogleWorkspaceSignals, 'emailsSent' | 'uniqueRecipients' | 'topRecipients'>]> {
  // Gmail search query: in:sent after:<unix ts seconds>. Uses the
  // authenticated user's own mailbox.
  const sinceUnix = Math.floor(since.getTime() / 1000);
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  listUrl.searchParams.set('q', `in:sent after:${sinceUnix}`);
  listUrl.searchParams.set('maxResults', String(Math.min(maxEmails, 100)));

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) {
    throw new Error(`Gmail list failed ${listRes.status}: ${(await listRes.text()).slice(0, 200)}`);
  }
  const listJson = (await listRes.json()) as { messages?: Array<{ id: string }> };
  const ids = (listJson.messages ?? []).slice(0, maxEmails);

  const events: Event[] = [];
  const recipientCounts = new Map<string, number>();

  // Fetch each message's metadata. Gmail doesn't batch nicely in v1; parallel-limit.
  const PARALLEL = 5;
  for (let i = 0; i < ids.length; i += PARALLEL) {
    const chunk = ids.slice(i, i + PARALLEL);
    const results = await Promise.all(
      chunk.map((m) =>
        fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    );
    for (const msg of results) {
      if (!msg) continue;
      const headers = ((msg as { payload?: { headers?: Array<{ name: string; value: string }> } }).payload?.headers) || [];
      const header = (n: string) =>
        headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? '';
      const subject = header('Subject') || '(no subject)';
      const to = header('To');
      const dateHdr = header('Date');
      const timestamp = dateHdr ? new Date(dateHdr).toISOString() : new Date().toISOString();
      const snippet = (msg as { snippet?: string }).snippet ?? '';

      const recipients = parseAddressList(to);
      for (const r of recipients) {
        recipientCounts.set(r, (recipientCounts.get(r) ?? 0) + 1);
      }

      events.push({
        id: `gmail-${(msg as { id: string }).id}`,
        timestamp,
        actor: {
          id: leaderEmail ?? 'leader',
          kind: 'human',
          name: leaderEmail ?? 'Leader',
        },
        kind: 'email_sent',
        content: `${subject} — ${snippet.slice(0, 200)}`,
        metadata: {
          to: recipients.slice(0, 5),
          subject,
        },
      });
    }
  }

  const topRecipients = [...recipientCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([addr]) => addr);

  return [
    events,
    {
      emailsSent: events.length,
      uniqueRecipients: recipientCounts.size,
      topRecipients,
    },
  ];
}

function parseAddressList(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((a) => {
      const match = a.match(/<([^>]+)>/);
      const addr = (match ? match[1] : a).trim().toLowerCase();
      return addr;
    })
    .filter((a) => a.includes('@') && a.length < 100);
}

// ─── Calendar ──────────────────────────────────────────────────────────────

async function fetchCalendarEvents(
  token: string,
  since: Date,
  maxEvents: number,
  leaderEmail: string | undefined,
): Promise<[Event[], Omit<GoogleWorkspaceSignals, 'emailsSent' | 'uniqueRecipients' | 'topRecipients'>]> {
  const timeMin = since.toISOString();
  const timeMax = new Date().toISOString();
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', String(Math.min(maxEvents, 250)));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Calendar list failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    items?: Array<{
      id: string;
      summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      organizer?: { email?: string };
      attendees?: Array<{ email?: string; responseStatus?: string }>;
      status?: string;
    }>;
  };

  const events: Event[] = [];
  const attendeeSet = new Set<string>();
  let totalMinutes = 0;
  let meetingsOrganized = 0;
  const attendeeCounts: number[] = [];

  for (const ev of json.items ?? []) {
    if (ev.status === 'cancelled') continue;

    const start = ev.start?.dateTime || ev.start?.date;
    const end = ev.end?.dateTime || ev.end?.date;
    if (!start) continue;

    const startMs = new Date(start).getTime();
    const endMs = end ? new Date(end).getTime() : startMs;
    const minutes = Math.max(0, Math.round((endMs - startMs) / 60_000));
    totalMinutes += minutes;

    const attendees = (ev.attendees ?? [])
      .map((a) => a.email?.toLowerCase())
      .filter((e): e is string => !!e && e.includes('@'));
    for (const a of attendees) attendeeSet.add(a);
    attendeeCounts.push(attendees.length);

    const organizedByLeader =
      leaderEmail && ev.organizer?.email?.toLowerCase() === leaderEmail;
    if (organizedByLeader) meetingsOrganized++;

    events.push({
      id: `gcal-${ev.id}`,
      timestamp: start,
      actor: {
        id: leaderEmail ?? 'leader',
        kind: 'human',
        name: leaderEmail ?? 'Leader',
      },
      kind: organizedByLeader ? 'meeting_organized' : 'meeting_attended',
      content: `${ev.summary ?? '(no title)'} — ${minutes}min, ${attendees.length} attendees`,
      metadata: {
        attendees: attendees.slice(0, 10),
        minutes,
        organizer: ev.organizer?.email,
      },
    });
  }

  const avgAttendees =
    attendeeCounts.length > 0
      ? Math.round(
          attendeeCounts.reduce((a, b) => a + b, 0) / attendeeCounts.length,
        )
      : null;

  return [
    events,
    {
      meetingsHeld: events.length,
      meetingsOrganized,
      uniqueAttendees: attendeeSet.size,
      totalMeetingMinutes: totalMinutes,
      avgMeetingAttendees: avgAttendees,
    },
  ];
}
