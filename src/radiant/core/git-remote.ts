/**
 * @neuroverseos/governance/radiant — git remote introspection
 *
 * Reads the current repo's origin remote and parses out the host/owner/repo.
 * Used by the org-level discovery tier to ask "what GitHub org owns this
 * repo?" and then look for a conventional <org>/worlds source of truth.
 *
 * Works for both `.git/` directories and `.git` files (git worktrees /
 * submodules, which store a `gitdir: <path>` pointer instead of a full dir).
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

export interface ParsedRemote {
  host: string;
  owner: string;
  repo: string;
}

/**
 * Resolve the actual git config path for a repo, handling `.git` files
 * that point elsewhere (worktrees, submodules).
 */
function resolveGitConfigPath(repoDir: string): string | null {
  const dotGit = join(repoDir, '.git');
  if (!existsSync(dotGit)) return null;

  try {
    const stat = statSync(dotGit);
    if (stat.isDirectory()) {
      return join(dotGit, 'config');
    }
    if (stat.isFile()) {
      const content = readFileSync(dotGit, 'utf-8');
      const match = /^gitdir:\s*(.+)$/m.exec(content);
      if (!match) return null;
      const gitDir = resolve(repoDir, match[1].trim());
      const configPath = join(gitDir, 'config');
      return existsSync(configPath) ? configPath : null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Read the `origin` remote URL from a repo's git config.
 * Returns null if no repo, no remote, or read fails.
 */
export function readOriginRemote(repoDir: string): string | null {
  const configPath = resolveGitConfigPath(repoDir);
  if (!configPath) return null;

  try {
    const raw = readFileSync(configPath, 'utf-8');
    // Match [remote "origin"] section and extract url = ... from it
    const sectionRe = /\[remote "origin"\]\s*\n((?:(?!\[)[^\n]*\n?)*)/;
    const section = sectionRe.exec(raw);
    if (!section) return null;
    const urlRe = /^\s*url\s*=\s*(.+?)\s*$/m;
    const url = urlRe.exec(section[1]);
    return url ? url[1] : null;
  } catch {
    return null;
  }
}

/**
 * Parse a git remote URL into host/owner/repo.
 *
 * Supported forms:
 *   https://github.com/OWNER/REPO(.git)
 *   http://github.com/OWNER/REPO(.git)
 *   git@github.com:OWNER/REPO(.git)
 *   ssh://git@github.com/OWNER/REPO(.git)
 */
export function parseRemoteUrl(url: string): ParsedRemote | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // git@host:owner/repo(.git)
  const ssh = /^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(trimmed);
  if (ssh) return { host: ssh[1], owner: ssh[2], repo: ssh[3] };

  // ssh://git@host/owner/repo(.git)
  const sshProto = /^ssh:\/\/git@([^/]+)\/([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(trimmed);
  if (sshProto) return { host: sshProto[1], owner: sshProto[2], repo: sshProto[3] };

  // https?://host/owner/repo(.git)
  const https = /^https?:\/\/(?:[^@/]+@)?([^/]+)\/([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(trimmed);
  if (https) return { host: https[1], owner: https[2], repo: https[3] };

  return null;
}

/**
 * One-shot: read origin and parse it.
 */
export function getRepoOrigin(repoDir: string): ParsedRemote | null {
  const url = readOriginRemote(repoDir);
  if (!url) return null;
  return parseRemoteUrl(url);
}
