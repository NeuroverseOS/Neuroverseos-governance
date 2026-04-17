/**
 * @neuroverseos/governance/radiant — world discovery
 *
 * Automatically discovers and loads worldmodels from three sources,
 * in precedence order:
 *
 *   1. NeuroVerse base (built-in, universal — always loaded)
 *   2. User worlds (~/.neuroverse/worlds/ — your personal model)
 *   3. Repo worlds (./worlds/ in the current repo — local authority)
 *
 * Worlds live where the work lives. You don't switch between them —
 * you walk into them. Open an Auki repo → Auki's worlds load.
 * Leave → they disappear. No toggle, no config, no removal.
 *
 * Precedence: repo > user > base. When you're in someone else's
 * system, their worlds take authority. Your personal world stays
 * as your baseline perspective. The NeuroVerse base is the universal
 * foundation both sit on top of.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve, basename } from 'path';
import { homedir } from 'os';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DiscoveredWorld {
  name: string;
  source: 'base' | 'user' | 'repo';
  path: string;
  content: string;
}

export interface WorldStack {
  worlds: DiscoveredWorld[];
  /** Combined content for the AI prompt (compressed by the caller). */
  combinedContent: string;
  /** Human-readable list of what's loaded. */
  summary: string;
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
}): WorldStack {
  const worlds: DiscoveredWorld[] = [];

  // 1. User worlds (~/.neuroverse/worlds/)
  const userDir = options?.userWorldsDir ?? join(homedir(), '.neuroverse', 'worlds');
  if (existsSync(userDir)) {
    worlds.push(...loadWorldsFromDir(userDir, 'user'));
  }

  // 2. Repo worlds (./worlds/ or ./.neuroverse/worlds/ in the repo)
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

  // Combine content (user first, then repo — repo takes precedence in interpretation)
  const combinedContent = worlds
    .map((w) => `<!-- world: ${w.name} (${w.source}) -->\n${w.content}`)
    .join('\n\n---\n\n');

  // Summary for CLI output
  const summary = worlds.length === 0
    ? 'no worlds discovered'
    : worlds
        .map((w) => `${w.name} (${w.source})`)
        .join(', ');

  return { worlds, combinedContent, summary };
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
      'this repo';
    lines.push(`  ${w.name} (${sourceLabel})`);
  }
  return lines.join('\n');
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function loadWorldsFromDir(
  dirPath: string,
  source: 'base' | 'user' | 'repo',
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
