/**
 * @neuroverseos/governance/radiant — scope resolution
 *
 * Parses scope strings like "aukiverse/posemesh" into typed scope objects
 * that adapters (GitHub, etc.) know how to fetch.
 */

/**
 * A GitHub repository scope — the unit of activity Radiant reads.
 */
export interface RepoScope {
  owner: string;
  repo: string;
}

/**
 * Parse a scope string into a RepoScope.
 *
 * Accepts:
 *   "owner/repo"
 *   "https://github.com/owner/repo"
 *   "github.com/owner/repo"
 *
 * Throws on unparseable input.
 */
export function parseRepoScope(scope: string): RepoScope {
  const cleaned = scope
    .replace(/^https?:\/\//, '')
    .replace(/^github\.com\//, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '');

  const parts = cleaned.split('/');
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Cannot parse repo scope: "${scope}". Expected "owner/repo" or a GitHub URL.`,
    );
  }

  return { owner: parts[0], repo: parts[1] };
}

/**
 * Format a RepoScope back to a display string.
 */
export function formatScope(scope: RepoScope): string {
  return `${scope.owner}/${scope.repo}`;
}
