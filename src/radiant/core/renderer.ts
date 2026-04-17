/**
 * @neuroverseos/governance/radiant — renderer
 *
 * Takes signals + patterns + scores + lens metadata and produces the
 * structured output Nils reads. Two output modes:
 *   - text: the EMERGENT / MEANING / MOVE structure for terminal display
 *   - yaml+text: Memory Palace coded read file (YAML frontmatter + prose)
 *
 * The renderer enforces the lens's voice rules: forbidden phrases are
 * checked, bucket names are never leaked, vocabulary is Auki-native.
 */

import type {
  ObservedPattern,
  RenderingLens,
  Score,
} from '../types';
import type { Signal } from './signals';
import type { Scope } from './scopes';
import type { GovernanceAudit } from './governance';
import { isScored } from '../types';
import { formatScope } from './scopes';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface RenderInput {
  scope: Scope;
  windowDays: number;
  eventCount: number;
  signals: readonly Signal[];
  patterns: readonly ObservedPattern[];
  scores: {
    A_L: Score;
    A_C: Score;
    A_N: Score;
    R: Score;
  };
  lens: RenderingLens;
  /** AI-generated meaning + move sections (from the interpretation step). */
  meaning?: string;
  move?: string;
  /** Number of prior Radiant reads available (0 = first run). */
  priorReadCount?: number;
  /** Governance audit trail — events evaluated against the worldmodel. */
  governance?: GovernanceAudit;
}

export interface RenderOutput {
  /** The human-readable text output for terminal display. */
  text: string;
  /** The Memory Palace coded YAML frontmatter (Tier 2 structured signals). */
  frontmatter: string;
}

// ─── Main entry ────────────────────────────────────────────────────────────

export function render(input: RenderInput): RenderOutput {
  const text = renderText(input);
  const frontmatter = renderFrontmatter(input);
  return { text, frontmatter };
}

// ─── Text renderer (terminal output) ───────────────────────────────────────

function renderText(input: RenderInput): string {
  const sections: string[] = [];

  // Header
  sections.push(
    `Scope:  ${formatScope(input.scope)}\n` +
    `Window: last ${input.windowDays} days · ${input.eventCount} events\n` +
    `Lens:   ${input.lens.name}`,
  );

  // EMERGENT — patterns
  if (input.patterns.length > 0) {
    let emergentBlock = 'EMERGENT\n';

    for (const p of input.patterns) {
      emergentBlock += `\n  ${p.name}\n`;
      emergentBlock += `    ${p.description}\n`;
      if (p.evidence.cited_invariant) {
        emergentBlock += `    Cited invariant: ${p.evidence.cited_invariant}\n`;
      }
    }

    sections.push(emergentBlock.trimEnd());
  }

  // MEANING
  if (input.meaning) {
    sections.push(`MEANING\n\n  ${input.meaning.split('\n').join('\n  ')}`);
  }

  // MOVE
  if (input.move) {
    sections.push(`MOVE\n\n  ${input.move.split('\n').join('\n  ')}`);
  }

  // ALIGNMENT scores
  const alignBlock = [
    'ALIGNMENT',
    '',
    `  Human work:                ${formatScore(input.scores.A_L)}`,
    `  AI work:                   ${formatScore(input.scores.A_C)}`,
    `  Human–AI collaboration:    ${formatScore(input.scores.A_N)}`,
    `  Composite:                 ${formatScore(input.scores.R)}`,
  ].join('\n');

  sections.push(alignBlock);

  // GOVERNANCE — audit trail
  if (input.governance && input.governance.totalEvents > 0) {
    const gov = input.governance;
    const govLines = ['GOVERNANCE', '', `  ${gov.summary}`];

    const showSide = (label: string, side: typeof gov.human) => {
      if (side.allow + side.modify + side.block === 0) return;
      govLines.push('');
      govLines.push(`  ${label}:`);
      govLines.push(`    ${side.allow} ALLOW · ${side.modify} MODIFY · ${side.block} BLOCK`);
      for (const d of side.details.slice(0, 3)) {
        const reason = d.reason ? ` → ${d.reason}` : '';
        govLines.push(`    ${d.status}: ${d.eventId}${reason}`);
      }
      if (side.details.length > 3) {
        govLines.push(`    ... and ${side.details.length - 3} more`);
      }
    };

    showSide('Human side', gov.human);
    showSide('AI side', gov.cyber);
    showSide('Human–AI joint', gov.joint);

    sections.push(govLines.join('\n'));
  }

  // DEPTH — tell the reader what Radiant can and can't see at this point
  sections.push(renderDepth(input.priorReadCount ?? 0, input.windowDays));

  return sections.join('\n\n');
}

function renderDepth(priorReads: number, windowDays: number): string {
  if (priorReads === 0) {
    return [
      'DEPTH',
      '',
      `  This is your first read. Radiant sees ${windowDays} days of activity`,
      '  but has no prior baseline to compare against.',
      '',
      '  Available now:',
      '    ✓ Signal extraction across life / cyber / joint domains',
      '    ✓ Pattern identification (canonical + candidates)',
      '    ✓ Alignment scoring',
      '',
      '  Available after 2+ reads:',
      '    · Drift detection (is alignment improving or degrading?)',
      '    · Baselines (what does "normal" look like for this team?)',
      '    · Pattern confidence (are these patterns persistent or noise?)',
      '    · Evolution proposals (should the worldmodel adapt?)',
      '',
      '  Run again next week. The read gets sharper every time.',
    ].join('\n');
  }

  if (priorReads < 4) {
    return [
      'DEPTH',
      '',
      `  Read ${priorReads + 1} of this scope. Baseline forming.`,
      '',
      '  Available now:',
      '    ✓ Signal extraction + pattern identification + alignment scoring',
      `    ✓ Drift detection (comparing against ${priorReads} prior read${priorReads > 1 ? 's' : ''})`,
      '    · Baselines stabilizing (need 4+ reads for reliable averages)',
      '    · Pattern confidence accumulating',
      '',
      '  The read sharpens with each run.',
    ].join('\n');
  }

  return [
    'DEPTH',
    '',
    `  Read ${priorReads + 1} of this scope. Baseline established.`,
    '',
    '  Available:',
    '    ✓ Signal extraction + pattern identification + alignment scoring',
    '    ✓ Drift detection against established baseline',
    '    ✓ Pattern confidence (persistent vs noise)',
    '    ✓ Evolution proposals (candidate patterns with enough history to evaluate)',
  ].join('\n');
}

function formatScore(s: Score): string {
  if (!isScored(s)) {
    if (s === 'UNAVAILABLE') return 'not available (no worldmodel loaded)';
    return 'not enough signal to call yet';
  }
  const n = Math.round(s);
  let label: string;
  if (n >= 75) label = 'STRONG';
  else if (n >= 60) label = 'STABLE';
  else if (n >= 45) label = 'needs attention';
  else if (n >= 30) label = 'concerning';
  else label = 'critical';
  return `${n} · ${label}`;
}

// ─── YAML frontmatter (Memory Palace Tier 2) ───────────────────────────────

function renderFrontmatter(input: RenderInput): string {
  const now = new Date().toISOString();
  const signalsByDomain = groupSignalsByDomain(input.signals);

  const patternEntries = input.patterns.map((p) => {
    const entry: Record<string, unknown> = {
      name: p.name,
      type: p.type,
      conf: Number(p.confidence.toFixed(2)),
      evidence_signals: p.evidence.signals,
      evidence_events: p.evidence.events,
    };
    if (p.evidence.cited_invariant) {
      entry.cited_invariant = p.evidence.cited_invariant;
    }
    return entry;
  });

  const frontmatter: Record<string, unknown> = {
    radiant_read: {
      scope: formatScope(input.scope),
      window: `${input.windowDays}d`,
      timestamp: now,
      lens: input.lens.name,
    },
    events: {
      total: input.eventCount,
    },
    signals: signalsByDomain,
    scores: {
      A_L: isScored(input.scores.A_L) ? Math.round(input.scores.A_L) : String(input.scores.A_L),
      A_C: isScored(input.scores.A_C) ? Math.round(input.scores.A_C) : String(input.scores.A_C),
      A_N: isScored(input.scores.A_N) ? Math.round(input.scores.A_N) : String(input.scores.A_N),
      R: isScored(input.scores.R) ? Math.round(input.scores.R) : String(input.scores.R),
    },
    patterns: patternEntries,
  };

  // Simple YAML serialization (no dependency)
  return '---\n' + serializeYAML(frontmatter) + '---';
}

function groupSignalsByDomain(
  signals: readonly Signal[],
): Record<string, Record<string, { score: number; n: number; conf: number }>> {
  const result: Record<string, Record<string, { score: number; n: number; conf: number }>> = {};
  for (const s of signals) {
    if (!result[s.domain]) result[s.domain] = {};
    result[s.domain][s.id] = {
      score: Number(s.score.toFixed(1)),
      n: s.eventCount,
      conf: Number(s.confidence.toFixed(2)),
    };
  }
  return result;
}

// ─── Minimal YAML serializer (avoids adding a dependency) ──────────────────

function serializeYAML(obj: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);

  if (obj === null || obj === undefined) return 'null\n';
  if (typeof obj === 'string') return `${JSON.stringify(obj)}\n`;
  if (typeof obj === 'number' || typeof obj === 'boolean') return `${obj}\n`;

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]\n';
    // Simple arrays of strings/numbers → inline
    if (obj.every((item) => typeof item === 'string' || typeof item === 'number')) {
      return `[${obj.map((item) => JSON.stringify(item)).join(', ')}]\n`;
    }
    // Complex arrays → block
    let result = '\n';
    for (const item of obj) {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const entries = Object.entries(item as Record<string, unknown>);
        result += `${pad}- ${entries[0][0]}: ${serializeYAML(entries[0][1], 0).trim()}\n`;
        for (let i = 1; i < entries.length; i++) {
          result += `${pad}  ${entries[i][0]}: ${serializeYAML(entries[i][1], indent + 2).trim()}\n`;
        }
      } else {
        result += `${pad}- ${serializeYAML(item, indent + 1).trim()}\n`;
      }
    }
    return result;
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return '{}\n';
    let result = '\n';
    for (const [key, value] of entries) {
      if (typeof value === 'object' && value !== null) {
        result += `${pad}${key}:${serializeYAML(value, indent + 1)}`;
      } else {
        result += `${pad}${key}: ${serializeYAML(value, indent).trim()}\n`;
      }
    }
    return result;
  }

  return `${obj}\n`;
}
