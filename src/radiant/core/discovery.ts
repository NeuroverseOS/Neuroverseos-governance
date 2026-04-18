/**
 * @neuroverseos/governance/radiant — world discovery
 *
 * Automatically discovers and loads worldmodels from four sources,
 * in precedence order (later tiers override earlier ones):
 *
 *   1. NeuroVerse base (built-in, universal — always loaded)
 *   2. User worlds (~/.neuroverse/worlds/ — your personal model)
 *   3. Extends (declared in .neuroverse/config.json — org-wide truth)
 *   4. Repo worlds (./worlds/ in the current repo — local authority)
 *
 * Worlds live where the work lives. You don't switch between them —
 * you walk into them. Open an Auki repo → Auki's worlds load.
 * Leave → they disappear. No toggle, no config, no removal.
 *
 * The extends tier lets one source-of-truth repo govern many others:
 * drop a `.neuroverse/config.json` with `extends: ["github:org/worlds"]`
 * into every repo in an org, and they all inherit the same worldmodel.
 * Change the truth in one place, every repo sees it.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve, basename } from 'path';
import { homedir } from 'os';
import {
  resolveAllExtends,
  type Fetcher,
  type ResolveResult,
} from './extends';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DiscoveredWorld {
  name: string;
  source: 'base' | 'user' | 'extends' | 'repo';
  path: string;
  content: string;
  /** For extends-sourced worlds: the original spec (e.g. "github:auki/worlds"). */
  extendsFrom?: string;
}

export interface WorldStack {
  worlds: DiscoveredWorld[];
  /** Combined content for the AI prompt (compressed by the caller). */
  combinedContent: string;
  /** Human-readable list of what's loaded. */
  summary: string;
  /** Non-fatal warnings (e.g. failed extends fetch, stale cache). */
  warnings: string[];
}

// ─── Discovery ─────────────────────────────────────────────────────────────

/**
 * Discover and load worldmodels from all three sources.
 *
 * @param repoDir — the repo being analyzed (for repo-level worlds).
 *   If not provided, skips repo-level discovery.
 * @param userWorldsDir — override for user worlds location.
 *   Default: ~/.neuroverse/worlds/
 * @param explicitWorldsDir — explicit --worlds flag (overrides discovery).
 *   When provided, this is used AS the repo-level source.
 */
export function discoverWorlds(options?: {
  repoDir?: string;
  userWorldsDir?: string;
  explicitWorldsDir?: string;
  /** Override the extends cache location (default ~/.neuroverse/cache/extends/). */
  extendsCacheDir?: string;
  /** Inject a fetcher (tests use this to avoid real network calls). */
  extendsFetcher?: Fetcher;
  /** Cache TTL for github: extends (default 1 hour). */
  extendsTtlMs?: number;
  /** Disable extends resolution entirely. */
  disableExtends?: boolean;
}): WorldStack {
  const worlds: DiscoveredWorld[] = [];
  const warnings: string[] = [];

  // 1. User worlds (~/.neuroverse/worlds/)
  const userDir = options?.userWorldsDir ?? join(homedir(), '.neuroverse', 'worlds');
  if (existsSync(userDir)) {
    worlds.push(...loadWorldsFromDir(userDir, 'user'));
  }

  // 2. Extends (declared in <repoDir>/.neuroverse/config.json)
  if (options?.repoDir && !options.disableExtends && !options.explicitWorldsDir) {
    const forceRefresh = process.env.NEUROVERSE_REFRESH === '1';
    const noFetch = process.env.NEUROVERSE_NO_FETCH === '1';
    const results = resolveAllExtends(options.repoDir, {
      cacheDir: options.extendsCacheDir,
      fetcher: options.extendsFetcher,
      ttlMs: options.extendsTtlMs,
      forceRefresh,
      noFetch,
    });
    for (const result of results) {
      worlds.push(...loadExtendsWorlds(result));
      if (result.warning) warnings.push(result.warning);
    }
  }

  // 3. Repo worlds (./worlds/ or ./.neuroverse/worlds/ in the repo)
  if (options?.explicitWorldsDir) {
    worlds.push(...loadWorldsFromDir(options.explicitWorldsDir, 'repo'));
  } else if (options?.repoDir) {
    const repoPaths = [
      join(options.repoDir, 'worlds'),
      join(options.repoDir, '.neuroverse', 'worlds'),
    ];
    for (const p of repoPaths) {
      if (existsSync(p)) {
        worlds.push(...loadWorldsFromDir(p, 'repo'));
        break;
      }
    }
  }

  // Combine content — order matters: later entries override earlier.
  // user → extends → repo gives repos the final say for local adaptations
  // while extends carries the org-wide truth.
  const combinedContent = worlds
    .map((w) => {
      const tag = w.extendsFrom
        ? `<!-- world: ${w.name} (${w.source} ${w.extendsFrom}) -->`
        : `<!-- world: ${w.name} (${w.source}) -->`;
      return `${tag}\n${w.content}`;
    })
    .join('\n\n---\n\n');

  // Summary for CLI output
  const summary = worlds.length === 0
    ? 'no worlds discovered'
    : worlds
        .map((w) => `${w.name} (${w.source})`)
        .join(', ');

  return { worlds, combinedContent, summary, warnings };
}

/**
 * Format the active worlds list for display in the output header.
 */
export function formatActiveWorlds(stack: WorldStack): string {
  if (stack.worlds.length === 0) return 'No worlds loaded.';

  const lines = ['ACTIVE WORLDS', ''];
  for (const w of stack.worlds) {
    const sourceLabel =
      w.source === 'base' ? 'universal' :
      w.source === 'user' ? 'personal' :
      w.source === 'extends' ? `shared (${w.extendsFrom ?? 'extends'})` :
      'this repo';
    lines.push(`  ${w.name} (${sourceLabel})`);
  }
  if (stack.warnings.length > 0) {
    lines.push('', 'WARNINGS');
    for (const w of stack.warnings) lines.push(`  ${w}`);
  }
  return lines.join('\n');
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function loadExtendsWorlds(result: ResolveResult): DiscoveredWorld[] {
  if (!result.dir) return [];
  const loaded = loadWorldsFromDir(result.dir, 'extends');
  return loaded.map((w) => ({ ...w, extendsFrom: result.spec.raw }));
}

function loadWorldsFromDir(
  dirPath: string,
  source: DiscoveredWorld['source'],
): DiscoveredWorld[] {
  const dir = resolve(dirPath);
  if (!existsSync(dir)) return [];

  const stat = statSync(dir);

  // If pointed at a single file
  if (stat.isFile() && dir.endsWith('.md')) {
    try {
      return [{
        name: basename(dir).replace(/\.worldmodel\.md$/, '').replace(/\.nv-world\.md$/, ''),
        source,
        path: dir,
        content: readFileSync(dir, 'utf-8'),
      }];
    } catch {
      return [];
    }
  }

  if (!stat.isDirectory()) return [];

  const files = readdirSync(dir)
    .filter((f) =>
      f.endsWith('.worldmodel.md') || f.endsWith('.nv-world.md'),
    )
    .sort();

  return files.map((f) => {
    const fullPath = join(dir, f);
    return {
      name: f.replace(/\.worldmodel\.md$/, '').replace(/\.nv-world\.md$/, ''),
      source,
      path: fullPath,
      content: readFileSync(fullPath, 'utf-8'),
    };
  });
}
