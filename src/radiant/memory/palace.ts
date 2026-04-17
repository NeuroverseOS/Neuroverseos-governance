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
 * Update the knowledge file with pattern persistence data.
 * Appends or updates entries based on which patterns keep recurring.
 */
export function updateKnowledge(
  exocortexDir: string,
  persistence: PatternPersistence[],
): string {
  const dir = resolve(exocortexDir, 'radiant');
  mkdirSync(dir, { recursive: true });

  const filepath = join(dir, 'knowledge.md');

  const lines: string[] = [
    '# Radiant — Accumulated Behavioral Knowledge',
    '',
    `Last updated: ${new Date().toISOString().split('T')[0]}`,
    '',
    '## Pattern persistence',
    '',
  ];

  for (const p of persistence) {
    const status =
      p.occurrences >= 4
        ? '**persistent** — consider declaring in worldmodel'
        : p.occurrences >= 2
          ? 'recurring'
          : 'observed once';

    lines.push(`### ${p.name}`);
    lines.push(`- Status: ${status}`);
    lines.push(`- Observed ${p.occurrences} time${p.occurrences > 1 ? 's' : ''}: ${p.dates.join(', ')}`);
    if (p.occurrences >= 3) {
      lines.push(
        `- **Evolution proposal:** Add to auki-strategy.worldmodel.md → Evolution Layer → Drift Behaviors (if negative) or Aligned Behaviors (if positive).`,
      );
    }
    lines.push('');
  }

  writeFileSync(filepath, lines.join('\n'), 'utf-8');
  return filepath;
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
