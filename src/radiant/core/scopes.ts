/**
 * @neuroverseos/governance/radiant — scope resolution
 *
 * Parses scope strings into typed scope objects that adapters know how
 * to fetch. Supports two levels:
 *
 *   "owner/repo"  → RepoScope (single repo)
 *   "owner/"      → OrgScope (entire organization)
 *   "owner"       → OrgScope (entire organization)
 */

/**
 * A GitHub repository scope — single repo.
 */
export interface RepoScope {
  type: 'repo';
  owner: string;
  repo: string;
}

/**
 * A GitHub organization scope — all repos in an org.
 */
export interface OrgScope {
  type: 'org';
  owner: string;
}

export type Scope = RepoScope | OrgScope;

/**
 * Parse a scope string into a RepoScope or OrgScope.
 *
 * Accepts:
 *   "owner/repo"                    → RepoScope
 *   "owner/" or "owner"             → OrgScope
 *   "https://github.com/owner/repo" → RepoScope
 *   "https://github.com/owner"      → OrgScope
 */
export function parseScope(scope: string): Scope {
  const cleaned = scope
    .replace(/^https?:\/\//, '')
    .replace(/^github\.com\//, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '');

  const parts = cleaned.split('/').filter(Boolean);

  if (parts.length === 0 || !parts[0]) {
    throw new Error(
      `Cannot parse scope: "${scope}". Expected "owner/repo" or "owner".`,
    );
  }

  if (parts.length === 1) {
    return { type: 'org', owner: parts[0] };
  }

  return { type: 'repo', owner: parts[0], repo: parts[1] };
}

/**
 * Backward-compatible: parse as RepoScope only. Throws if org-level.
 */
export function parseRepoScope(scope: string): RepoScope {
  const parsed = parseScope(scope);
  if (parsed.type === 'org') {
    throw new Error(
      `Expected "owner/repo" but got org-level scope "${parsed.owner}". Use parseScope() for org-level.`,
    );
  }
  return parsed;
}

/**
 * Format any scope back to a display string.
 */
export function formatScope(scope: Scope): string {
  if (scope.type === 'org') return `${scope.owner} (org)`;
  return `${scope.owner}/${scope.repo}`;
}
