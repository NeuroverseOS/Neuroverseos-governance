/**
 * @neuroverseos/governance/radiant — ExoCortex adapter
 *
 * Reads stated intent from an exocortex directory. This is the "should"
 * side of the intent-vs-behavior comparison. GitHub provides the "did."
 * Radiant reads both and surfaces where they diverge.
 *
 * The adapter reads standard exocortex files:
 *   - attention.md — what the person/team is focused on RIGHT NOW
 *   - goals.md — what they're working toward
 *   - identity.md — who they are, what they value
 *   - sprint.md or src/sprint.md — current sprint focus
 *   - org/organization.md — org mission and values (if symlinked)
 *   - org/methods.md — how the org operates (if symlinked)
 *
 * Returns a structured ExocortexContext that the AI interpretation
 * prompt uses to compare stated intent against observed behavior.
 *
 * All file reads are optional — missing files are silently skipped.
 * An exocortex with only attention.md is still useful.
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ExocortexContext {
  /** What the person/team says they're focused on right now. */
  attention: string | null;
  /** What they're working toward. */
  goals: string | null;
  /** Who they are, what they value. */
  identity: string | null;
  /** Current sprint focus. */
  sprint: string | null;
  /** Org mission and values (from org/organization.md). */
  organization: string | null;
  /** How the org operates (from org/methods.md). */
  methods: string | null;
  /** The directory path that was read. */
  source: string;
  /** How many files were found and loaded. */
  filesLoaded: number;
}

// ─── Reader ────────────────────────────────────────────────────────────────

/**
 * Read stated intent from an exocortex directory.
 *
 * Silently skips missing files. Returns whatever it finds. An exocortex
 * with only attention.md is still useful — partial context is better
 * than no context.
 */
export function readExocortex(dirPath: string): ExocortexContext {
  const dir = resolve(dirPath);
  let filesLoaded = 0;

  function tryRead(...paths: string[]): string | null {
    for (const p of paths) {
      const full = join(dir, p);
      if (existsSync(full)) {
        try {
          const content = readFileSync(full, 'utf-8').trim();
          if (content) {
            filesLoaded++;
            return content;
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
    return null;
  }

  const ctx: ExocortexContext = {
    attention: tryRead('attention.md'),
    goals: tryRead('goals.md'),
    identity: tryRead('identity.md'),
    sprint: tryRead('sprint.md', 'src/sprint.md'),
    organization: tryRead('org/organization.md', 'org/src/organization.md'),
    methods: tryRead('org/methods.md', 'org/src/methods.md'),
    source: dir,
    filesLoaded,
  };

  return ctx;
}

/**
 * Format the exocortex context as a section for the AI interpretation
 * prompt. Only includes fields that were actually loaded.
 */
export function formatExocortexForPrompt(ctx: ExocortexContext): string {
  if (ctx.filesLoaded === 0) return '';

  const sections: string[] = [];

  sections.push(
    '## Stated Intent (from exocortex)\n\n' +
    'The following is what the person/team SAYS they are doing, focused on, ' +
    'and working toward. Compare this against the ACTUAL activity from GitHub. ' +
    'Where stated intent and observed behavior diverge, that gap is the ' +
    'most valuable signal in this read. Name it directly.',
  );

  if (ctx.attention) {
    sections.push(`### Current attention\n\n${ctx.attention}`);
  }

  if (ctx.goals) {
    sections.push(`### Goals\n\n${ctx.goals}`);
  }

  if (ctx.sprint) {
    sections.push(`### Sprint focus\n\n${ctx.sprint}`);
  }

  if (ctx.identity) {
    sections.push(`### Identity and values\n\n${ctx.identity}`);
  }

  if (ctx.organization) {
    sections.push(`### Organization\n\n${ctx.organization}`);
  }

  if (ctx.methods) {
    sections.push(`### Methods\n\n${ctx.methods}`);
  }

  return sections.join('\n\n');
}

/**
 * One-line summary of what was loaded, for CLI status output.
 */
export function summarizeExocortex(ctx: ExocortexContext): string {
  if (ctx.filesLoaded === 0) return 'no exocortex files found';

  const loaded: string[] = [];
  if (ctx.attention) loaded.push('attention');
  if (ctx.goals) loaded.push('goals');
  if (ctx.sprint) loaded.push('sprint');
  if (ctx.identity) loaded.push('identity');
  if (ctx.organization) loaded.push('org');
  if (ctx.methods) loaded.push('methods');

  return `${loaded.join(', ')} (${ctx.filesLoaded} files)`;
}
