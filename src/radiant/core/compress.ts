/**
 * @neuroverseos/governance/radiant — Memory Palace compression
 *
 * Applies the three-tier principle to everything that enters the AI
 * prompt: raw data is not the memory; structured signals are.
 *
 * Compresses worldmodel content, exocortex context, lens data, and
 * prior reads into the minimum tokens the AI needs to produce a
 * good interpretation. Cuts prompt size by 60-70%.
 */

import type { RenderingLens } from '../types';
import type { ExocortexContext } from '../adapters/exocortex';
import type { PriorRead } from '../memory/palace';

// ─── Worldmodel compression ───────────────────────────────────────────────

/**
 * Compress a worldmodel markdown file into just the structured elements
 * the AI needs: invariants, decision priorities, signals, domains,
 * and mission (one line). Strips prose, commentary, and structure.
 */
export function compressWorldmodel(content: string): string {
  const lines: string[] = [];

  // Extract mission (first paragraph after ## Mission)
  const missionMatch = content.match(/##\s*Mission\s*\n+(?:<!--[\s\S]*?-->\s*\n+)?(.*?)(?:\n\n|\n##|$)/s);
  if (missionMatch) {
    const mission = missionMatch[1].trim().split('\n')[0];
    lines.push(`Mission: ${mission}`);
  }

  // Extract domain names
  const domainMatches = content.matchAll(/###\s+([^\n]+)/g);
  const domains: string[] = [];
  for (const m of domainMatches) {
    const name = m[1].trim();
    if (name !== 'Skills' && name !== 'Values' && !name.startsWith('####')) {
      domains.push(name);
    }
  }
  if (domains.length > 0) {
    lines.push(`Domains: ${domains.join(', ')}`);
  }

  // Extract invariants (lines starting with - ` in invariant-like sections)
  const invariantSection = content.match(/(?:Invariants|## Invariants|invariants)([\s\S]*?)(?:\n#|\n---|\n\n\n)/i);
  if (invariantSection) {
    const invLines = invariantSection[1].match(/^[-*]\s+`?([^`\n]+)/gm);
    if (invLines) {
      lines.push('\nInvariants:');
      for (const inv of invLines.slice(0, 10)) {
        lines.push(inv.trim());
      }
    }
  }

  // Extract decision priorities (lines with >)
  const prioritySection = content.match(/(?:Decision Priorities|## Decision Priorities)([\s\S]*?)(?:\n#|\n---|\n\n\n)/i);
  if (prioritySection) {
    const priLines = prioritySection[1].match(/^[-*]\s+.+>.+/gm);
    if (priLines) {
      lines.push('\nPriorities:');
      for (const pri of priLines.slice(0, 10)) {
        lines.push(pri.trim());
      }
    }
  }

  // Extract signal names
  const signalSection = content.match(/(?:## Signals)([\s\S]*?)(?:\n#|\n---|\n\n\n)/i);
  if (signalSection) {
    const sigLines = signalSection[1].match(/^[-*]\s+(\w+)/gm);
    if (sigLines) {
      lines.push(`\nSignals: ${sigLines.map(s => s.replace(/^[-*]\s+/, '')).join(', ')}`);
    }
  }

  // Extract drift behaviors (brief)
  const driftSection = content.match(/(?:Drift Behaviors|## Drift Behaviors)([\s\S]*?)(?:\n#|\n---|\n\n\n)/i);
  if (driftSection) {
    const driftLines = driftSection[1].match(/^[-*]\s+(.+)/gm);
    if (driftLines) {
      lines.push('\nDrift behaviors:');
      for (const d of driftLines.slice(0, 5)) {
        lines.push(d.trim());
      }
    }
  }

  const compressed = lines.join('\n');

  // If compression failed to extract anything, return a truncated version
  if (compressed.length < 50) {
    return content.slice(0, 2000) + '\n[truncated]';
  }

  return compressed;
}

// ─── ExoCortex compression ────────────────────────────────────────────────

/**
 * Compress exocortex context into one-line summaries per field.
 * The AI doesn't need the full prose — just the essence.
 */
export function compressExocortex(ctx: ExocortexContext): string {
  const lines: string[] = [];

  if (ctx.attention) {
    lines.push(`Attention: ${firstMeaningfulLine(ctx.attention)}`);
  }
  if (ctx.goals) {
    lines.push(`Goals: ${firstNLines(ctx.goals, 3)}`);
  }
  if (ctx.sprint) {
    lines.push(`Sprint: ${firstNLines(ctx.sprint, 3)}`);
  }
  if (ctx.identity) {
    lines.push(`Identity: ${firstMeaningfulLine(ctx.identity)}`);
  }
  if (ctx.organization) {
    lines.push(`Org: ${firstMeaningfulLine(ctx.organization)}`);
  }

  return lines.join('\n');
}

// ─── Lens compression ─────────────────────────────────────────────────────

/**
 * Compress a rendering lens into just what the AI interpreter needs:
 * evaluation questions + forbidden phrases + jargon translations.
 * Vocabulary substitutions and voice directives go to the renderer,
 * not the interpreter.
 */
export function compressLens(lens: RenderingLens): {
  evaluationQuestions: string;
  scoringRubric: string;
  forbiddenPhrases: string;
  jargonTranslations: string;
  strategicPatterns: string;
} {
  return {
    evaluationQuestions: lens.primary_frame.evaluation_questions
      .map((q, i) => `${i + 1}. ${q}`)
      .join('\n'),
    scoringRubric: lens.primary_frame.scoring_rubric,
    forbiddenPhrases: lens.forbidden_phrases.join(', '),
    jargonTranslations: Object.entries(lens.vocabulary.jargon_translations)
      .map(([k, v]) => `${k} → ${v}`)
      .join('; '),
    strategicPatterns: lens.strategic_patterns.slice(0, 5).join('\n'),
  };
}

// ─── Prior read compression ───────────────────────────────────────────────

/**
 * Compress prior reads into pattern names + occurrence counts.
 * The AI needs to know WHAT was seen before and HOW OFTEN — not the
 * full frontmatter.
 */
export function compressPriorReads(reads: PriorRead[]): string {
  if (reads.length === 0) return '';

  // Count pattern occurrences across reads
  const patternCounts = new Map<string, number>();
  for (const read of reads) {
    for (const name of read.patternNames) {
      patternCounts.set(name, (patternCounts.get(name) ?? 0) + 1);
    }
  }

  const sorted = [...patternCounts.entries()]
    .sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) {
    return `${reads.length} prior reads, no patterns extracted.`;
  }

  const patternList = sorted
    .map(([name, count]) => `${name} (${count}x)`)
    .join(', ');

  return `${reads.length} prior reads. Patterns seen: ${patternList}. If these recur, note persistence.`;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function firstMeaningfulLine(text: string): string {
  const lines = text.split('\n').filter(l => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith('#') && !t.startsWith('<!--');
  });
  return lines[0]?.slice(0, 200) ?? '';
}

function firstNLines(text: string, n: number): string {
  const lines = text.split('\n').filter(l => {
    const t = l.trim();
    return t.length > 0 && !t.startsWith('#') && !t.startsWith('<!--');
  });
  return lines.slice(0, n).map(l => l.slice(0, 150)).join('; ');
}
