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

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve, basename } from 'path';

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
 * Read stated intent from an exocortex directory, optionally scoped
 * to a specific project.
 *
 * When a repoName is provided (e.g. "reconstruction-server"), the reader
 * looks for a matching subdirectory in the exocortex (symlinked project
 * repos in the Auki exocortex pattern) and reads project-specific
 * sprint.md and roadmap.md alongside the global personal context.
 *
 * Silently skips missing files. Partial context is better than no context.
 */
export function readExocortex(
  dirPath: string,
  repoName?: string,
): ExocortexContext {
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

  // Global personal context (always read)
  const attention = tryRead('attention.md');
  const goals = tryRead('goals.md');
  const identity = tryRead('identity.md', 'user.md');
  const organization = tryRead('org/organization.md', 'org/src/organization.md');
  const methods = tryRead('org/methods.md', 'org/src/methods.md');

  // Sprint: project-scoped first, then global fallback
  let sprint: string | null = null;
  let projectContext: string | null = null;

  if (repoName) {
    // Look for project-specific subdirectory matching the repo name
    const projectPaths = [
      repoName,
      repoName.toLowerCase(),
      repoName.replace(/-/g, '_'),
    ];

    for (const projectDir of projectPaths) {
      const projectSprint = tryRead(
        `${projectDir}/src/sprint.md`,
        `${projectDir}/sprint.md`,
      );
      if (projectSprint) {
        sprint = projectSprint;
        break;
      }
    }

    // Also read project roadmap if available
    for (const projectDir of projectPaths) {
      const roadmap = tryRead(
        `${projectDir}/roadmap.md`,
        `${projectDir}/src/roadmap.md`,
      );
      if (roadmap) {
        projectContext = roadmap;
        break;
      }
    }
  }

  // Fall back to global sprint if no project-specific one found
  if (!sprint) {
    sprint = tryRead('sprint.md', 'src/sprint.md');
  }

  const ctx: ExocortexContext = {
    attention,
    goals,
    identity,
    sprint,
    organization,
    methods,
    source: dir,
    filesLoaded,
  };

  // Append project-specific context to sprint if found
  if (projectContext && ctx.sprint) {
    ctx.sprint = `${ctx.sprint}\n\n---\nProject roadmap:\n${projectContext}`;
  } else if (projectContext) {
    ctx.sprint = `Project roadmap:\n${projectContext}`;
    ctx.filesLoaded++;
  }

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

// ─── Cross-exocortex reader ────────────────────────────────────────────────

/**
 * Read multiple exocortices from a team directory. Each subdirectory
 * (or symlink) is treated as one person's exocortex.
 *
 * Returns an array of { name, context } for each person.
 */
export function readTeamExocortices(
  teamDir: string,
): Array<{ name: string; context: ExocortexContext }> {
  const dir = resolve(teamDir);
  if (!existsSync(dir)) return [];

  const entries = readdirSync(dir);
  const results: Array<{ name: string; context: ExocortexContext }> = [];

  for (const entry of entries) {
    const entryPath = join(dir, entry);
    try {
      const stat = statSync(entryPath);
      if (stat.isDirectory()) {
        const ctx = readExocortex(entryPath);
        if (ctx.filesLoaded > 0) {
          results.push({ name: entry, context: ctx });
        }
      }
    } catch {
      // Skip unreadable entries
    }
  }

  return results;
}

/**
 * Format multiple exocortices for the AI prompt — shows each person's
 * stated intent so the AI can compare them against each other and
 * against observed activity.
 */
export function formatTeamExocorticesForPrompt(
  team: Array<{ name: string; context: ExocortexContext }>,
): string {
  if (team.length === 0) return '';

  const sections: string[] = [
    '## Team Intent (cross-exocortex read)',
    '',
    `Reading ${team.length} team members\' exocortices. Compare each person\'s`,
    'stated intent against the observed activity AND against each other.',
    'Surface: duplicate focus, missing coverage, silent pivots,',
    'and areas where no one is carrying the work.',
    '',
  ];

  for (const { name, context } of team) {
    sections.push(`### ${name}`);
    if (context.attention) sections.push(`**Attention:** ${context.attention.split('\n')[0]}`);
    if (context.goals) sections.push(`**Goals:** ${context.goals.split('\n').slice(0, 3).join('; ')}`);
    if (context.sprint) sections.push(`**Sprint:** ${context.sprint.split('\n').slice(0, 3).join('; ')}`);
    sections.push('');
  }

  return sections.join('\n');
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
