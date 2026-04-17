/**
 * @neuroverseos/governance/radiant — Notion adapter
 *
 * Reads documentation and knowledge-base activity from Notion.
 * For Auki, Notion is where team documentation lives — specs, meeting
 * notes, strategy docs, project plans, decision records.
 *
 * What it captures:
 *   - Documentation freshness (when pages were last edited)
 *   - Who maintains what (authorship patterns across pages)
 *   - Knowledge gaps (sprint mentions things that have no doc page)
 *   - Decision crystallization (are debates in Discord becoming docs in Notion?)
 *   - Documentation velocity alongside code velocity
 *
 * The behavioral signal: high code shipping + low documentation =
 * the team is building but not recording what they learn. That's a
 * Narrative Dynamics gap — the story of what's being built isn't
 * being told, even internally.
 *
 * Uses Notion API v1 via raw fetch (no SDK dependency).
 * Requires an internal integration token with read access.
 */

import type { Actor, Event } from '../core/domain';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface NotionFetchOptions {
  /** Specific database IDs to query. If empty, searches all accessible pages. */
  databaseIds?: string[];
  /** How many days of history to fetch. Default: 14. */
  windowDays?: number;
  /** Max pages to fetch. Default: 100. */
  maxPages?: number;
}

export interface NotionSignals {
  /** Total pages created or updated in the window. */
  pagesActive: number;
  /** Pages created (new docs). */
  pagesCreated: number;
  /** Pages updated (edited docs). */
  pagesUpdated: number;
  /** Unique editors. */
  uniqueEditors: number;
  /** Pages not touched in 30+ days. */
  stalePages: number;
  /** Average days since last edit across all tracked pages. */
  avgDaysSinceEdit: number | null;
  /** Top page titles by recent activity. */
  topPages: string[];
}

// ─── Main entry ────────────────────────────────────────────────────────────

/**
 * Fetch Notion page activity and return Radiant Events + compressed signals.
 */
export async function fetchNotionActivity(
  token: string,
  options: NotionFetchOptions = {},
): Promise<{ events: Event[]; signals: NotionSignals }> {
  const windowDays = options.windowDays ?? 14;
  const maxPages = options.maxPages ?? 100;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const headers = {
    Authorization: `Bearer ${token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  // Search for recently edited pages
  const searchResponse = await fetchNotionAPI<{
    results: NotionPage[];
  }>('https://api.notion.com/v1/search', headers, {
    method: 'POST',
    body: JSON.stringify({
      filter: { property: 'object', value: 'page' },
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      page_size: maxPages,
    }),
  });

  const pages = searchResponse.results ?? [];
  const events: Event[] = [];
  const editors = new Set<string>();
  let pagesCreated = 0;
  let pagesUpdated = 0;
  let stalePages = 0;
  const editAges: number[] = [];
  const topPages: Array<{ title: string; editedAt: string }> = [];

  const now = Date.now();

  for (const page of pages) {
    const lastEdited = new Date(page.last_edited_time);
    const created = new Date(page.created_time);
    const daysSinceEdit = (now - lastEdited.getTime()) / (24 * 60 * 60 * 1000);
    editAges.push(daysSinceEdit);

    if (daysSinceEdit > 30) stalePages++;

    const title = extractTitle(page);
    const editorId = page.last_edited_by?.id ?? 'unknown';
    editors.add(editorId);

    // Only create events for pages active in the window
    if (lastEdited >= since) {
      const isNew = created >= since;
      if (isNew) pagesCreated++;
      else pagesUpdated++;

      topPages.push({ title, editedAt: page.last_edited_time });

      events.push({
        id: `notion-${page.id}`,
        timestamp: page.last_edited_time,
        actor: {
          id: editorId,
          kind: 'human',
          name: editorId,
        },
        kind: isNew ? 'doc_created' : 'doc_updated',
        content: `${isNew ? 'Created' : 'Updated'}: ${title}`,
        metadata: {
          pageId: page.id,
          url: page.url,
          createdAt: page.created_time,
        },
      });
    }
  }

  const avgDaysSinceEdit =
    editAges.length > 0
      ? Math.round(editAges.reduce((a, b) => a + b, 0) / editAges.length)
      : null;

  const signals: NotionSignals = {
    pagesActive: pagesCreated + pagesUpdated,
    pagesCreated,
    pagesUpdated,
    uniqueEditors: editors.size,
    stalePages,
    avgDaysSinceEdit,
    topPages: topPages.slice(0, 5).map((p) => p.title),
  };

  events.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  return { events, signals };
}

/**
 * Format Notion signals for the AI interpretation prompt.
 */
export function formatNotionSignalsForPrompt(signals: NotionSignals): string {
  if (signals.pagesActive === 0 && signals.stalePages === 0) return '';

  const lines = [
    '## Notion Activity (documentation behavior)',
    '',
    `${signals.pagesActive} pages active in window (${signals.pagesCreated} created, ${signals.pagesUpdated} updated).`,
    `${signals.uniqueEditors} unique editors.`,
  ];

  if (signals.stalePages > 0) {
    lines.push(`${signals.stalePages} pages haven't been touched in 30+ days.`);
  }
  if (signals.avgDaysSinceEdit !== null) {
    lines.push(`Average page age since last edit: ${signals.avgDaysSinceEdit} days.`);
  }
  if (signals.topPages.length > 0) {
    lines.push(`Recently active pages: ${signals.topPages.join(', ')}.`);
  }

  lines.push('');
  lines.push('Documentation is how the team crystallizes and shares knowledge.');
  lines.push('High code velocity + low documentation = building without recording.');
  lines.push('High documentation + low code = planning without shipping.');
  lines.push('Compare Notion activity against GitHub and Discord to find the balance.');

  return lines.join('\n');
}

// ─── Notion API shapes ────────────────────────────────────────────────────

interface NotionPage {
  id: string;
  url: string;
  created_time: string;
  last_edited_time: string;
  last_edited_by?: { id: string };
  properties: Record<string, NotionProperty>;
}

interface NotionProperty {
  type: string;
  title?: Array<{ plain_text: string }>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function extractTitle(page: NotionPage): string {
  for (const prop of Object.values(page.properties)) {
    if (prop.type === 'title' && prop.title) {
      return prop.title.map((t) => t.plain_text).join('') || 'Untitled';
    }
  }
  return 'Untitled';
}

async function fetchNotionAPI<T>(
  url: string,
  headers: Record<string, string>,
  init?: { method?: string; body?: string },
): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body,
  });
  if (!res.ok) {
    throw new Error(
      `Notion API error ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  }
  return (await res.json()) as T;
}
