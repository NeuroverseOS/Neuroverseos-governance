/**
 * Rule Preview Renderer — Plain English Display
 *
 * Renders compiled rules in a format that makes sense to humans.
 * Three output formats:
 *
 *   1. Terminal (ANSI) — for the CLI demo and debugging
 *   2. Structured data — for UI frameworks (React, SwiftUI, etc.)
 *   3. Markdown — for export and sharing
 *
 * Design principle: the user sees what they chose, in their own words.
 * No governance jargon. No technical identifiers. Just plain sentences
 * with toggles.
 */

import type { CompiledRule, CompiledRuleSet } from './compiler';
import type { GovernanceQuestion } from './questions';
import { CATEGORY_LABELS, CATEGORY_ORDER } from './questions';

// ─── Structured Preview (for UI frameworks) ─────────────────────────────────

export interface RulePreviewItem {
  /** Rule identifier */
  id: string;

  /** Plain English description */
  description: string;

  /** Visual icon hint */
  icon: 'block' | 'confirm' | 'allow' | 'limit';

  /** Whether this rule is active */
  enabled: boolean;

  /** Category for section grouping */
  category: GovernanceQuestion['category'];

  /** Category display label */
  categoryLabel: string;
}

export interface RulePreviewSection {
  /** Category identifier */
  category: GovernanceQuestion['category'];

  /** Category display label */
  label: string;

  /** Rules in this section */
  rules: RulePreviewItem[];
}

/**
 * Convert a compiled rule set into structured preview data
 * for rendering in any UI framework.
 */
export function toPreviewSections(ruleSet: CompiledRuleSet): RulePreviewSection[] {
  const sections: RulePreviewSection[] = [];

  for (const category of CATEGORY_ORDER) {
    const categoryRules = ruleSet.rules.filter(r => r.category === category);
    if (categoryRules.length === 0) continue;

    sections.push({
      category,
      label: CATEGORY_LABELS[category],
      rules: categoryRules.map(r => ({
        id: r.id,
        description: r.description,
        icon: r.constraint,
        enabled: r.enabled,
        category: r.category,
        categoryLabel: CATEGORY_LABELS[r.category],
      })),
    });
  }

  return sections;
}

// ─── Terminal Preview (ANSI) ────────────────────────────────────────────────

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

const CONSTRAINT_ICONS: Record<CompiledRule['constraint'], string> = {
  block: `${RED}BLOCKED${RESET}`,
  confirm: `${YELLOW}CONFIRM${RESET}`,
  allow: `${GREEN}ALLOWED${RESET}`,
  limit: `${BLUE}LIMITED${RESET}`,
};

const CONSTRAINT_SYMBOLS: Record<CompiledRule['constraint'], string> = {
  block: `${RED}x${RESET}`,
  confirm: `${YELLOW}?${RESET}`,
  allow: `${GREEN}v${RESET}`,
  limit: `${BLUE}~${RESET}`,
};

/**
 * Render the rule set as a terminal-friendly display.
 * Returns a string ready for console.log().
 */
export function renderTerminalPreview(ruleSet: CompiledRuleSet): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(`${BOLD}${CYAN}  Your AI Rules${RESET}`);
  lines.push(`${DIM}  ${ruleSet.rules.filter(r => r.enabled).length} active rules${RESET}`);
  lines.push('');

  const sections = toPreviewSections(ruleSet);

  for (const section of sections) {
    lines.push(`  ${BOLD}${section.label}${RESET}`);

    for (const rule of section.rules) {
      const symbol = CONSTRAINT_SYMBOLS[rule.icon];
      const status = rule.enabled ? '' : `${DIM} (disabled)${RESET}`;
      const desc = rule.enabled ? rule.description : `${DIM}${rule.description}${RESET}`;
      lines.push(`    ${symbol}  ${desc}${status}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Render a single rule as a one-line terminal display.
 */
export function renderTerminalRule(rule: CompiledRule): string {
  const symbol = CONSTRAINT_SYMBOLS[rule.constraint];
  const tag = CONSTRAINT_ICONS[rule.constraint];
  return `  ${symbol}  ${rule.description}  ${DIM}[${tag}${DIM}]${RESET}`;
}

// ─── Markdown Preview ───────────────────────────────────────────────────────

const CONSTRAINT_EMOJI: Record<CompiledRule['constraint'], string> = {
  block: 'x',
  confirm: '?',
  allow: 'v',
  limit: '~',
};

/**
 * Render the rule set as Markdown for export.
 */
export function renderMarkdownPreview(ruleSet: CompiledRuleSet): string {
  const lines: string[] = [];

  lines.push('# My AI Rules');
  lines.push('');
  lines.push(`${ruleSet.rules.filter(r => r.enabled).length} active rules.`);
  lines.push('');

  const sections = toPreviewSections(ruleSet);

  for (const section of sections) {
    lines.push(`## ${section.label}`);
    lines.push('');

    for (const rule of section.rules) {
      const prefix = rule.enabled ? '-' : '- ~~';
      const suffix = rule.enabled ? '' : '~~';
      const tag = rule.icon === 'block' ? ' **BLOCKED**'
        : rule.icon === 'confirm' ? ' *requires confirmation*'
        : rule.icon === 'limit' ? ' *limited*'
        : '';
      lines.push(`${prefix} ${rule.description}${tag}${suffix}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

// ─── Summary Stats ──────────────────────────────────────────────────────────

export interface RuleSummary {
  total: number;
  enabled: number;
  blocked: number;
  confirmed: number;
  allowed: number;
  limited: number;
}

/**
 * Get summary statistics for a rule set.
 */
export function getRuleSummary(ruleSet: CompiledRuleSet): RuleSummary {
  const enabled = ruleSet.rules.filter(r => r.enabled);
  return {
    total: ruleSet.rules.length,
    enabled: enabled.length,
    blocked: enabled.filter(r => r.constraint === 'block').length,
    confirmed: enabled.filter(r => r.constraint === 'confirm').length,
    allowed: enabled.filter(r => r.constraint === 'allow').length,
    limited: enabled.filter(r => r.constraint === 'limit').length,
  };
}

/**
 * Render a one-line summary for terminal.
 */
export function renderTerminalSummary(ruleSet: CompiledRuleSet): string {
  const s = getRuleSummary(ruleSet);
  return `  ${s.enabled} rules active: ${RED}${s.blocked} blocked${RESET}, ${YELLOW}${s.confirmed} confirm${RESET}, ${GREEN}${s.allowed} allowed${RESET}, ${BLUE}${s.limited} limited${RESET}`;
}
