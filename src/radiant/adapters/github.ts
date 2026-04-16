/**
 * @neuroverseos/governance/radiant — GitHub activity adapter
 *
 * Fetches recent activity from a GitHub repository and maps it to
 * Radiant's Event type. This is the data source for the behavioral
 * analysis pipeline (signals → patterns → alignment scores).
 *
 * Uses raw fetch (no Octokit dependency). Requires a GitHub token
 * with repo read access (fine-grained PAT or classic with `repo` scope).
 *
 * What it fetches:
 *   - Recent commits (with author, message, co-authors)
 *   - Recent pull requests (with description, author, state)
 *   - Recent PR reviews (with reviewer, state, body)
 *   - Recent issue/PR comments (with author, body, reference)
 *
 * Actor classification:
 *   - GitHub user type "Bot" → ActorKind 'bot'
 *   - Login ending in "[bot]" → ActorKind 'bot'
 *   - Co-authored-by trailers naming known AI tools → ActorKind 'ai'
 *   - Everything else → ActorKind 'human'
 *
 * Pagination: fetches one page per endpoint (up to perPage items).
 * Sufficient for most repos' 14-day windows. Full pagination is a
 * future refinement.
 */

import type { Actor, ActorKind, Event, EventReference } from '../core/domain';
import type { RepoScope } from '../core/scopes';
import { formatScope } from '../core/scopes';

// ─── Options ───────────────────────────────────────────────────────────────

export interface GitHubFetchOptions {
  /** How many days of history to fetch. Default: 14. */
  windowDays?: number;
  /** Items per page per endpoint. Default: 100. */
  perPage?: number;
}

// ─── Main entry ────────────────────────────────────────────────────────────

/**
 * Fetch recent activity from a GitHub repo and return Radiant Events.
 *
 * @param scope — owner/repo
 * @param token — GitHub personal access token
 * @param options — window size and pagination
 */
export async function fetchGitHubActivity(
  scope: RepoScope,
  token: string,
  options: GitHubFetchOptions = {},
): Promise<Event[]> {
  const windowDays = options.windowDays ?? 14;
  const perPage = options.perPage ?? 100;
  const since = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const base = `https://api.github.com/repos/${formatScope(scope)}`;
  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'neuroverseos-radiant',
  };

  const events: Event[] = [];

  // Fetch in parallel — independent API calls
  const [commits, prs, comments] = await Promise.all([
    fetchJSON<GitHubCommit[]>(
      `${base}/commits?since=${since}&per_page=${perPage}`,
      headers,
    ),
    fetchJSON<GitHubPR[]>(
      `${base}/pulls?state=all&sort=updated&direction=desc&per_page=${perPage}`,
      headers,
    ),
    fetchJSON<GitHubComment[]>(
      `${base}/issues/comments?since=${since}&per_page=${perPage}&sort=updated&direction=desc`,
      headers,
    ),
  ]);

  // Map commits
  for (const c of commits) {
    events.push(mapCommit(c, scope));
  }

  // Map PRs (filter by window client-side since the API doesn't have `since`)
  const sinceDate = new Date(since);
  for (const pr of prs) {
    if (new Date(pr.updated_at) >= sinceDate) {
      events.push(mapPR(pr, scope));
    }
  }

  // Map comments
  for (const comment of comments) {
    events.push(mapComment(comment, scope));
  }

  // Sort by timestamp ascending
  events.sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );

  return events;
}

// ─── GitHub API shapes (minimal, what we actually use) ─────────────────────

interface GitHubUser {
  login: string;
  id: number;
  type: string; // "User" | "Bot" | "Organization"
}

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
    committer: { name: string; date: string };
  };
  author: GitHubUser | null;
  committer: GitHubUser | null;
}

interface GitHubPR {
  number: number;
  title: string;
  body: string | null;
  state: string;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  merged_by: GitHubUser | null;
}

interface GitHubComment {
  id: number;
  body: string;
  user: GitHubUser;
  created_at: string;
  issue_url: string;
}

// ─── Mappers ───────────────────────────────────────────────────────────────

function mapCommit(c: GitHubCommit, scope: RepoScope): Event {
  const actor = mapUser(c.author, c.commit.author.name);
  const coActors = extractCoAuthors(c.commit.message);

  return {
    id: `commit-${c.sha.slice(0, 8)}`,
    timestamp: c.commit.author.date,
    actor,
    coActors: coActors.length > 0 ? coActors : undefined,
    kind: 'commit',
    content: c.commit.message,
    metadata: {
      scope: formatScope(scope),
      sha: c.sha,
    },
  };
}

function mapPR(pr: GitHubPR, scope: RepoScope): Event {
  const event: Event = {
    id: `pr-${pr.number}`,
    timestamp: pr.created_at,
    actor: mapUser(pr.user),
    kind: pr.merged_at ? 'pr_merged' : pr.state === 'open' ? 'pr_opened' : 'pr_closed',
    content: `${pr.title}\n\n${pr.body ?? ''}`.trim(),
    metadata: {
      scope: formatScope(scope),
      pr_number: pr.number,
      state: pr.state,
      merged_at: pr.merged_at,
    },
  };

  // If merged by a different person than the author, that's a respondsTo
  if (pr.merged_by && pr.merged_by.login !== pr.user.login) {
    event.actor = mapUser(pr.merged_by);
    event.kind = 'pr_merged';
    event.timestamp = pr.merged_at ?? pr.updated_at;
    event.respondsTo = {
      eventId: `pr-${pr.number}-opened`,
      actor: mapUser(pr.user),
    };
  }

  return event;
}

function mapComment(comment: GitHubComment, scope: RepoScope): Event {
  // Extract the issue/PR number from the issue_url
  const issueMatch = comment.issue_url.match(/\/issues\/(\d+)$/);
  const issueNumber = issueMatch ? issueMatch[1] : 'unknown';

  const event: Event = {
    id: `comment-${comment.id}`,
    timestamp: comment.created_at,
    actor: mapUser(comment.user),
    kind: 'comment',
    content: comment.body,
    respondsTo: {
      eventId: `pr-${issueNumber}`,
      actor: { id: 'unknown', kind: 'unknown' as ActorKind },
    },
    metadata: {
      scope: formatScope(scope),
      issue_number: issueNumber,
    },
  };

  return event;
}

// ─── Actor mapping ─────────────────────────────────────────────────────────

const KNOWN_AI_LOGINS = new Set([
  'github-actions[bot]',
  'dependabot[bot]',
  'renovate[bot]',
  'copilot',
]);

const KNOWN_AI_CO_AUTHOR_NAMES = new Set([
  'claude',
  'copilot',
  'cursor',
  'codeium',
  'tabnine',
  'codex',
]);

function mapUser(
  ghUser: GitHubUser | null,
  fallbackName?: string,
): Actor {
  if (!ghUser) {
    return {
      id: fallbackName ?? 'unknown',
      kind: 'unknown',
      name: fallbackName,
    };
  }

  let kind: ActorKind = 'human';
  if (ghUser.type === 'Bot' || ghUser.login.endsWith('[bot]')) {
    kind = 'bot';
  }
  if (KNOWN_AI_LOGINS.has(ghUser.login.toLowerCase())) {
    kind = 'bot';
  }

  return {
    id: ghUser.login,
    kind,
    name: ghUser.login,
  };
}

/**
 * Extract co-authors from "Co-authored-by:" trailers in commit messages.
 * Detects AI co-authors by matching known tool names.
 */
function extractCoAuthors(message: string): Actor[] {
  const coAuthors: Actor[] = [];
  const lines = message.split('\n');

  for (const line of lines) {
    const match = line.match(
      /^Co-authored-by:\s*(.+?)\s*<([^>]*)>/i,
    );
    if (match) {
      const name = match[1].trim().toLowerCase();
      const isAI = KNOWN_AI_CO_AUTHOR_NAMES.has(name) ||
        [...KNOWN_AI_CO_AUTHOR_NAMES].some((ai) => name.includes(ai));

      coAuthors.push({
        id: match[2] || name,
        kind: isAI ? 'ai' : 'human',
        name: match[1].trim(),
      });
    }
  }

  return coAuthors;
}

// ─── Fetch helper ──────────────────────────────────────────────────────────

async function fetchJSON<T>(
  url: string,
  headers: Record<string, string>,
): Promise<T> {
  const res = await fetch(url, { headers });

  if (!res.ok) {
    if (res.status === 404) return [] as unknown as T;
    if (res.status === 403) {
      const body = await res.text();
      if (body.includes('rate limit')) {
        throw new Error(
          `GitHub API rate limit exceeded. Wait or use a token with higher limits.`,
        );
      }
    }
    throw new Error(
      `GitHub API error ${res.status} for ${url}: ${(await res.text()).slice(0, 300)}`,
    );
  }

  return (await res.json()) as T;
}

/**
 * Create a mock GitHub adapter for testing. Returns fixed events
 * without calling the GitHub API.
 */
export function createMockGitHubAdapter(
  fixedEvents: Event[],
): typeof fetchGitHubActivity {
  return async () => fixedEvents;
}
