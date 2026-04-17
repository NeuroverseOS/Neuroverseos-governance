/**
 * @neuroverseos/governance/radiant — Memory Palace file operations
 *
 * Writes Radiant reads to the exocortex as dated markdown files (with
 * YAML frontmatter for structured signal data). Reads prior files to
 * detect pattern persistence across runs.
 *
 * The exocortex directory IS the Memory Palace. Files are the tiers:
 *   - reads/YYYY-MM-DD.md = Tier 2 (structured signals) + Tier 3 (narrative)
 *   - knowledge.md = accumulated pattern facts with persistence counts
 *
 * No database. The file system is the time series. Git is the versioning.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PriorRead {
  date: string;
  filename: string;
  /** Pattern names found in this read (parsed from frontmatter). */
  patternNames: string[];
  /** Raw frontmatter content for signal comparison. */
  frontmatter: string;
}

export interface PatternPersistence {
  name: string;
  /** How many prior reads contained this pattern. */
  occurrences: number;
  /** Dates this pattern was observed. */
  dates: string[];
}

// ─── Write a read ──────────────────────────────────────────────────────────

/**
 * Write a Radiant read to the exocortex. Creates the directory structure
 * if it doesn't exist.
 *
 * @param exocortexDir — root of the exocortex (e.g. ~/exocortex/)
 * @param frontmatter — YAML frontmatter (Tier 2 structured signals)
 * @param text — prose output (Tier 3 narrative)
 * @returns the path of the written file
 */
export function writeRead(
  exocortexDir: string,
  frontmatter: string,
  text: string,
): string {
  const dir = resolve(exocortexDir, 'radiant', 'reads');
  mkdirSync(dir, { recursive: true });

  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const filename = `${date}.md`;
  const filepath = join(dir, filename);

  const content = `${frontmatter}\n\n${text}\n`;
  writeFileSync(filepath, content, 'utf-8');

  return filepath;
}

/**
 * Items from the worldmodel that Radiant tracks for subtraction proposals.
 */
export interface WorldmodelItem {
  type: 'invariant' | 'drift_behavior' | 'aligned_behavior' | 'decision_priority';
  name: string;
}

/**
 * Update the knowledge file with:
 *   - Pattern persistence (what keeps recurring → consider adding)
 *   - Subtraction proposals (what hasn't fired → consider removing)
 *   - Active items (what recently triggered → keep)
 *
 * The leader reads this file and makes deliberate, rare, bidirectional
 * changes to the worldmodel. Radiant proposes; the human decides.
 */
export function updateKnowledge(
  exocortexDir: string,
  persistence: PatternPersistence[],
  options?: {
    /** Items declared in the worldmodel (invariants, drift behaviors, etc.) */
    declaredItems?: WorldmodelItem[];
    /** Item names that triggered governance in this read */
    triggeredItems?: string[];
    /** Total number of reads completed (for "hasn't fired in N reads" tracking) */
    totalReads?: number;
  },
): string {
  const dir = resolve(exocortexDir, 'radiant');
  mkdirSync(dir, { recursive: true });

  const filepath = join(dir, 'knowledge.md');
  const totalReads = options?.totalReads ?? 0;

  // Load existing knowledge to track untriggered counts
  const existingUntriggered = loadUntriggeredCounts(filepath);

  const lines: string[] = [
    '# Radiant — Accumulated Behavioral Knowledge',
    '',
    `Last updated: ${new Date().toISOString().split('T')[0]}`,
    `Total reads: ${totalReads}`,
    '',
    '---',
    '',
    '## Evolution proposals',
    '',
  ];

  // ─── Consider adding (persistent candidate patterns) ────────────────

  const addCandidates = persistence.filter((p) => p.occurrences >= 3);
  if (addCandidates.length > 0) {
    lines.push('### Consider adding');
    lines.push('');
    lines.push('These candidate patterns keep recurring. They are not yet in the worldmodel.');
    lines.push('If they represent real behavioral patterns worth tracking, add them.');
    lines.push('If they were temporary, dismiss them.');
    lines.push('');
    for (const p of addCandidates) {
      lines.push(
        `- **${p.name}** — observed ${p.occurrences} times (${p.dates.join(', ')}). ` +
        `Add to auki-strategy.worldmodel.md → Evolution Layer → Drift Behaviors (if concerning) or Aligned Behaviors (if healthy).`,
      );
    }
    lines.push('');
  }

  // ─── Consider removing (declared items that never fire) ─────────────

  if (options?.declaredItems && options.declaredItems.length > 0) {
    const triggered = new Set(options.triggeredItems ?? []);
    const removeCandidates: Array<{ item: WorldmodelItem; weeksSilent: number }> = [];

    for (const item of options.declaredItems) {
      if (!triggered.has(item.name)) {
        // Increment untriggered count
        const prior = existingUntriggered.get(item.name) ?? 0;
        const count = prior + 1;
        existingUntriggered.set(item.name, count);
        if (count >= 4) {
          removeCandidates.push({ item, weeksSilent: count });
        }
      } else {
        // Reset — it fired this read
        existingUntriggered.set(item.name, 0);
      }
    }

    if (removeCandidates.length > 0) {
      lines.push('### Consider removing');
      lines.push('');
      lines.push('These items are declared in the worldmodel but haven\'t triggered in multiple reads.');
      lines.push('Either the team has internalized them (the rule is redundant) or they haven\'t been tested.');
      lines.push('A lean worldmodel with 5 sharp invariants is stronger than a bloated one with 20.');
      lines.push('');
      for (const { item, weeksSilent } of removeCandidates) {
        lines.push(
          `- **${item.name}** (${item.type}) — hasn't triggered in ${weeksSilent} reads. ` +
          `Internalized or untested? Review whether it still earns its place.`,
        );
      }
      lines.push('');
    }
  }

  // ─── Keep (recently active) ─────────────────────────────────────────

  if (options?.triggeredItems && options.triggeredItems.length > 0) {
    lines.push('### Keep (recently active)');
    lines.push('');
    lines.push('These worldmodel items triggered governance in the most recent read. They\'re earning their place.');
    lines.push('');
    for (const name of options.triggeredItems) {
      lines.push(`- **${name}** — triggered this read. Holding.`);
    }
    lines.push('');
  }

  // ─── Pattern persistence (full log) ─────────────────────────────────

  lines.push('---');
  lines.push('');
  lines.push('## Pattern persistence (all observed)');
  lines.push('');

  for (const p of persistence) {
    const status =
      p.occurrences >= 4
        ? '**persistent**'
        : p.occurrences >= 2
          ? 'recurring'
          : 'observed once';

    lines.push(`### ${p.name}`);
    lines.push(`- Status: ${status}`);
    lines.push(`- Observed ${p.occurrences} time${p.occurrences > 1 ? 's' : ''}: ${p.dates.join(', ')}`);
    lines.push('');
  }

  // ─── Untriggered counts (persisted for next run) ────────────────────

  lines.push('---');
  lines.push('');
  lines.push('<!-- untriggered_counts (machine-readable, do not edit)');
  for (const [name, count] of existingUntriggered.entries()) {
    lines.push(`${name}=${count}`);
  }
  lines.push('-->');

  writeFileSync(filepath, lines.join('\n'), 'utf-8');
  return filepath;
}

/**
 * Parse untriggered counts from existing knowledge.md.
 * Stored as a hidden HTML comment at the bottom for persistence.
 */
function loadUntriggeredCounts(filepath: string): Map<string, number> {
  const counts = new Map<string, number>();
  if (!existsSync(filepath)) return counts;

  try {
    const content = readFileSync(filepath, 'utf-8');
    const match = content.match(
      /<!-- untriggered_counts[\s\S]*?-->/,
    );
    if (match) {
      const lines = match[0].split('\n');
      for (const line of lines) {
        const eq = line.match(/^([^=]+)=(\d+)$/);
        if (eq) {
          counts.set(eq[1], parseInt(eq[2], 10));
        }
      }
    }
  } catch {
    // Fresh start if file can't be read
  }

  return counts;
}

// ─── Read prior reads ──────────────────────────────────────────────────────

/**
 * Load prior Radiant reads from the exocortex. Returns them sorted by
 * date (oldest first). Each read has its pattern names extracted from
 * the frontmatter.
 */
export function loadPriorReads(exocortexDir: string): PriorRead[] {
  const dir = resolve(exocortexDir, 'radiant', 'reads');
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort(); // YYYY-MM-DD sorts chronologically

  const reads: PriorRead[] = [];

  for (const filename of files) {
    const filepath = join(dir, filename);
    const content = readFileSync(filepath, 'utf-8');

    // Extract date from filename
    const date = filename.replace('.md', '');

    // Extract frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const frontmatter = fmMatch ? fmMatch[1] : '';

    // Extract pattern names from frontmatter (look for "name:" entries)
    const patternNames: string[] = [];
    const nameMatches = frontmatter.matchAll(/- name: ["']?([^"'\n]+)["']?/g);
    for (const m of nameMatches) {
      patternNames.push(m[1].trim());
    }

    reads.push({ date, filename, patternNames, frontmatter });
  }

  return reads;
}

/**
 * Compute pattern persistence across prior reads + the current patterns.
 */
export function computePersistence(
  priorReads: PriorRead[],
  currentPatternNames: string[],
): PatternPersistence[] {
  const allPatterns = new Map<string, string[]>();

  // Count occurrences in prior reads
  for (const read of priorReads) {
    for (const name of read.patternNames) {
      const dates = allPatterns.get(name) ?? [];
      if (!dates.includes(read.date)) dates.push(read.date);
      allPatterns.set(name, dates);
    }
  }

  // Add current run
  const today = new Date().toISOString().split('T')[0];
  for (const name of currentPatternNames) {
    const dates = allPatterns.get(name) ?? [];
    if (!dates.includes(today)) dates.push(today);
    allPatterns.set(name, dates);
  }

  // Convert to sorted array
  return Array.from(allPatterns.entries())
    .map(([name, dates]) => ({
      name,
      occurrences: dates.length,
      dates: dates.sort(),
    }))
    .sort((a, b) => b.occurrences - a.occurrences);
}

/**
 * Format prior-read context for the AI interpretation prompt.
 * Tells the AI what patterns were seen in previous runs so it can
 * reference persistence.
 */
export function formatPriorReadsForPrompt(priorReads: PriorRead[]): string {
  if (priorReads.length === 0) return '';

  const lines: string[] = [
    '## Prior Radiant reads (history)',
    '',
    `Radiant has run ${priorReads.length} time${priorReads.length > 1 ? 's' : ''} before on this scope.`,
    'If you see patterns that appeared in prior reads, note their persistence.',
    'Patterns that recur across 3+ reads are strong candidates for declaration in the strategy file.',
    '',
  ];

  for (const read of priorReads.slice(-4)) { // last 4 reads
    lines.push(`### Read from ${read.date}`);
    if (read.patternNames.length > 0) {
      lines.push(`Patterns observed: ${read.patternNames.join(', ')}`);
    } else {
      lines.push('No patterns extracted from frontmatter.');
    }
    lines.push('');
  }

  return lines.join('\n');
}
