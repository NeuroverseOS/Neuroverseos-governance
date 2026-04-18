/**
 * @neuroverseos/governance/radiant — extends (org-wide world sharing)
 *
 * Lets a repo declare worldmodels that live in another repo, so one
 * source of truth can govern many repos. Auki has 51 repos — one
 * `aukiNetwork/worlds` repo holds the canonical worldmodel, every
 * other repo declares `extends: ["github:aukiNetwork/worlds"]`.
 *
 * Spec grammar:
 *   github:OWNER/REPO               — latest default branch, repo root
 *   github:OWNER/REPO@REF           — specific ref (branch, tag, or sha)
 *   github:OWNER/REPO@REF:SUBPATH   — subpath inside the cloned repo
 *   ./relative/path                 — local dir relative to repo root
 *   /absolute/path                  — absolute local dir
 *
 * github: sources are shallow-cloned into ~/.neuroverse/cache/extends/<hash>/
 * Cache is reused for 1 hour; set NEUROVERSE_REFRESH=1 to force refetch,
 * or NEUROVERSE_NO_FETCH=1 to forbid network access (cache-or-nothing).
 */

import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { join, resolve, isAbsolute } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ExtendsSpec {
  raw: string;
  kind: 'github' | 'local';
  owner?: string;
  repo?: string;
  ref?: string;
  subpath?: string;
  path?: string;
}

export interface ExtendsConfig {
  extends?: string[];
}

export interface ResolveResult {
  spec: ExtendsSpec;
  dir: string | null;
  warning?: string;
}

export type Fetcher = (spec: ExtendsSpec, destDir: string) => void;

// ─── Config loading ────────────────────────────────────────────────────────

export function loadExtendsConfig(repoDir: string): ExtendsConfig | null {
  const configPath = join(repoDir, '.neuroverse', 'config.json');
  if (!existsSync(configPath)) return null;
  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as ExtendsConfig;
    return parsed;
  } catch {
    return null;
  }
}

// ─── Spec parsing ──────────────────────────────────────────────────────────

export function parseExtendsSpec(raw: string): ExtendsSpec | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('github:')) {
    const rest = trimmed.slice('github:'.length);
    // OWNER/REPO[@REF][:SUBPATH]
    const match = /^([^/]+)\/([^@:]+)(?:@([^:]+))?(?::(.+))?$/.exec(rest);
    if (!match) return null;
    return {
      raw: trimmed,
      kind: 'github',
      owner: match[1],
      repo: match[2],
      ref: match[3] ?? 'HEAD',
      subpath: match[4] ?? '',
    };
  }

  if (trimmed.startsWith('./') || trimmed.startsWith('../') || isAbsolute(trimmed)) {
    return { raw: trimmed, kind: 'local', path: trimmed };
  }

  return null;
}

// ─── Cache ─────────────────────────────────────────────────────────────────

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

export function getCacheDir(spec: ExtendsSpec, baseCacheDir?: string): string {
  const root = baseCacheDir ?? join(homedir(), '.neuroverse', 'cache', 'extends');
  const key = createHash('sha256').update(spec.raw).digest('hex').slice(0, 16);
  return join(root, key);
}

function isCacheFresh(cacheDir: string, ttlMs: number): boolean {
  const stampPath = join(cacheDir, '.neuroverse-fetched');
  if (!existsSync(stampPath)) return false;
  try {
    const stamp = statSync(stampPath);
    return Date.now() - stamp.mtimeMs < ttlMs;
  } catch {
    return false;
  }
}

function markCacheFresh(cacheDir: string): void {
  const stampPath = join(cacheDir, '.neuroverse-fetched');
  try {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(stampPath, new Date().toISOString());
  } catch {
    // best-effort; if we can't write the stamp, next run will re-fetch
  }
}

// ─── Default fetcher (git clone) ───────────────────────────────────────────

export const defaultGitFetcher: Fetcher = (spec, destDir) => {
  if (spec.kind !== 'github') return;
  const url = `https://github.com/${spec.owner}/${spec.repo}.git`;
  const parent = resolve(destDir, '..');
  mkdirSync(parent, { recursive: true });

  // Remove any stale cache so clone into a clean dir
  if (existsSync(destDir)) {
    rmSync(destDir, { recursive: true, force: true });
  }

  const args = ['clone', '--depth', '1', '--filter=blob:none'];
  if (spec.ref && spec.ref !== 'HEAD') {
    args.push('--branch', spec.ref);
  }
  args.push(url, destDir);

  execFileSync('git', args, { stdio: 'pipe' });
};

// ─── Resolve one spec to a local directory ─────────────────────────────────

export function resolveExtendsSpec(
  spec: ExtendsSpec,
  repoDir: string,
  options?: {
    cacheDir?: string;
    fetcher?: Fetcher;
    ttlMs?: number;
    forceRefresh?: boolean;
    noFetch?: boolean;
  },
): ResolveResult {
  if (spec.kind === 'local') {
    const full = isAbsolute(spec.path!) ? spec.path! : resolve(repoDir, spec.path!);
    if (!existsSync(full)) {
      return { spec, dir: null, warning: `local extends path not found: ${full}` };
    }
    return { spec, dir: full };
  }

  // github:
  const cacheRoot = options?.cacheDir;
  const ttl = options?.ttlMs ?? DEFAULT_TTL_MS;
  const cacheDir = getCacheDir(spec, cacheRoot);
  const fresh = isCacheFresh(cacheDir, ttl);
  const needsFetch = options?.forceRefresh || !fresh || !existsSync(cacheDir);

  if (needsFetch && options?.noFetch) {
    if (existsSync(cacheDir) && existsSync(join(cacheDir, '.neuroverse-fetched'))) {
      // stale but usable cache
      return resolveSubpath(spec, cacheDir);
    }
    return { spec, dir: null, warning: `NEUROVERSE_NO_FETCH set and no cache for ${spec.raw}` };
  }

  if (needsFetch) {
    const fetcher = options?.fetcher ?? defaultGitFetcher;
    try {
      fetcher(spec, cacheDir);
      markCacheFresh(cacheDir);
    } catch (err) {
      if (existsSync(cacheDir) && existsSync(join(cacheDir, '.neuroverse-fetched'))) {
        // fetch failed but stale cache exists — use it
        return {
          ...resolveSubpath(spec, cacheDir),
          warning: `fetch failed for ${spec.raw}, using stale cache: ${(err as Error).message}`,
        };
      }
      return { spec, dir: null, warning: `fetch failed for ${spec.raw}: ${(err as Error).message}` };
    }
  }

  return resolveSubpath(spec, cacheDir);
}

function resolveSubpath(spec: ExtendsSpec, cacheDir: string): ResolveResult {
  const target = spec.subpath ? join(cacheDir, spec.subpath) : cacheDir;
  if (!existsSync(target)) {
    return { spec, dir: null, warning: `subpath not found in ${spec.raw}: ${spec.subpath}` };
  }
  // If target is the repo root, prefer ./worlds/ or ./.neuroverse/worlds/
  if (!spec.subpath) {
    const candidates = [
      join(target, 'worlds'),
      join(target, '.neuroverse', 'worlds'),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return { spec, dir: c };
    }
  }
  return { spec, dir: target };
}

// ─── High-level: resolve all extends for a repo ────────────────────────────

export function resolveAllExtends(
  repoDir: string,
  options?: {
    cacheDir?: string;
    fetcher?: Fetcher;
    ttlMs?: number;
    forceRefresh?: boolean;
    noFetch?: boolean;
    config?: ExtendsConfig | null;
  },
): ResolveResult[] {
  const config = options?.config !== undefined ? options.config : loadExtendsConfig(repoDir);
  if (!config?.extends || config.extends.length === 0) return [];

  const results: ResolveResult[] = [];
  for (const raw of config.extends) {
    const spec = parseExtendsSpec(raw);
    if (!spec) {
      results.push({
        spec: { raw, kind: 'local' },
        dir: null,
        warning: `unparseable extends spec: ${raw}`,
      });
      continue;
    }
    results.push(resolveExtendsSpec(spec, repoDir, options));
  }
  return results;
}
