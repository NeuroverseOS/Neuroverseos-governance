/**
 * Chat governance — reading and validating a chatbot rulebook.
 *
 * A chatbot rulebook is a .nv-world.md file with these sections:
 *
 *   # Thesis        what the chatbot exists to do
 *   # Invariants    lines it never crosses (rules)
 *   # Lenses        its persona, and `>` lines for how it behaves (habits)
 *   # Escalations   hard moments: situation, example phrasings, fixed response
 *   # Responses     optional: `- unavailable:` and `- fallback:` wording
 *
 * Every rule and habit is checked by meaning on every reply unless it is
 * explicitly marked prompt-only: `(prompt)` at the end of an invariant, or
 * `[check: prompt]` anywhere in a rule or habit. Validation lists every
 * prompt-only rule, so "just asking the AI" is always a visible choice.
 *
 * Nothing is dropped or changed silently: a rule, habit, or response line
 * that can't be read is an error, not a skipped line, and a parenthetical at
 * the end of a rule is only read as settings when every word in it is one
 * (`structural`, `operational`, `prompt`, `mutable`, `immutable`).
 *
 * Pure: no file system, no network. Runs in Node.js, Deno, and browsers.
 */

import { parseWorldMarkdown } from '../engine/bootstrap-parser';
import type {
  ChatRule,
  ChatRulebook,
  EnforcementLine,
  HardMoment,
  RulebookIssue,
} from './types';

export const DEFAULT_UNAVAILABLE_RESPONSE =
  "I'm having trouble right now, so I can't answer safely. Please try again in a moment.";

export const DEFAULT_FALLBACK_RESPONSE =
  "I want to make sure I get this right for you. Could you tell me a bit more about what you're working on?";

const PROMPT_TAG = /\s*\[check:\s*prompt\]\s*/i;
const MIN_EXAMPLES = 3;
const ENFORCEMENT_FLAGS = new Set(['structural', 'operational', 'prompt', 'mutable', 'immutable']);
const PLACEHOLDER = /\[CREATOR\b[^\]]*\]/i;
/** The judge answers "none" when no hard moment matches, so no moment may use that id. */
const RESERVED_MOMENT_IDS = new Set(['none']);

/**
 * Read `# Invariants` lines: `` - `id` — what the chatbot does (flags) ``.
 * A trailing parenthetical is read as settings only if every word in it is a
 * known setting; otherwise it stays part of the rule's text.
 */
function parseRules(section: string | undefined, issues: RulebookIssue[]): ChatRule[] {
  const rules: ChatRule[] = [];
  for (const raw of (section ?? '').split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('- ')) continue;
    const m =
      line.match(/^-\s+`([^`]+)`\s*[—–-]\s*(.+)$/) ??
      line.match(/^-\s+\*\*([^*]+)\*\*\s*[—–-]\s*(.+)$/);
    if (!m) {
      issues.push({
        severity: 'error',
        message: `This rule line can't be read, so it would be skipped: "${line}". Write it as: - \`rule_id\` — what the chatbot does.`,
      });
      continue;
    }
    const id = line.includes('`') ? m[1].trim() : m[1].trim().toLowerCase().replace(/\s+/g, '_');
    let text = m[2].trim();
    let flags: string[] = [];
    const tail = text.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
    if (tail) {
      const words = tail[2].split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
      if (words.length > 0 && words.every((w) => ENFORCEMENT_FLAGS.has(w))) {
        text = tail[1].trim();
        flags = words;
      }
    }
    const prompt = flags.includes('prompt') || PROMPT_TAG.test(text);
    rules.push({ id, text: text.replace(PROMPT_TAG, ' ').trim(), kind: 'rule', check: prompt ? 'prompt' : 'meaning' });
  }
  return rules;
}

/** Report `>` lines under # Lenses that are neither a `> scope: habit` line nor a continuation of one. */
function checkHabitLines(section: string | undefined, issues: RulebookIssue[]): void {
  let previousWasHabit = false;
  for (const raw of (section ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) { previousWasHabit = false; continue; }
    if (!line.startsWith('>')) { previousWasHabit = false; continue; }
    if (/^>\s*[A-Za-z_]+\s*:/.test(line) || previousWasHabit) { previousWasHabit = true; continue; }
    issues.push({
      severity: 'error',
      message: `This habit line can't be read, so it would be skipped: "${line}". Start it with a scope, like: > behavior_shaping: ${line.replace(/^>\s*/, '')}`,
    });
  }
}

/** Split a markdown document into its `# Heading` sections. */
function sections(markdown: string): Map<string, string> {
  const out = new Map<string, string>();
  const withoutComments = markdown.replace(/<!--[\s\S]*?-->/g, '');
  const parts = withoutComments.split(/^# /m).slice(1);
  for (const part of parts) {
    const newline = part.indexOf('\n');
    const title = (newline === -1 ? part : part.slice(0, newline)).trim().toLowerCase();
    out.set(title, newline === -1 ? '' : part.slice(newline + 1));
  }
  return out;
}

function parseMoments(section: string | undefined, issues: RulebookIssue[]): HardMoment[] {
  if (!section) return [];
  return section
    .split(/^## /m)
    .slice(1)
    .map((block) => {
      const lines = block.split('\n');
      const id = lines[0].trim();
      const field = (name: string) =>
        lines
          .map((l) => l.trim())
          .filter((l) => l.toLowerCase().startsWith(`- ${name}:`))
          .map((l) => l.slice(name.length + 3).trim());

      if (field('triggers').length > 0) {
        issues.push({
          severity: 'warning',
          ref: id,
          message:
            `Hard moment "${id}" has a "triggers:" line. Trigger words are not used: ` +
            'moments are recognized by meaning. Turn them into "- example:" lines.',
        });
      }

      const response = lines
        .map((l) => l.trim())
        .filter((l) => l.startsWith('>'))
        .map((l) => l.replace(/^>\s?/, '').replace(/^response:\s*/i, ''))
        .join(' ')
        .trim();

      return {
        id,
        situation: field('situation')[0] ?? '',
        examples: field('example'),
        response,
      };
    });
}

function parseResponses(section: string | undefined, issues: RulebookIssue[]) {
  const found: Record<string, string> = {};
  for (const raw of (section ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^-\s*(unavailable|fallback)\s*:\s*(.*)$/i);
    if (!m) {
      issues.push({
        severity: 'error',
        message: `This line under # Responses can't be read: "${line}". Write it as "- unavailable: …" or "- fallback: …".`,
      });
      continue;
    }
    if (!m[2].trim()) {
      issues.push({ severity: 'error', message: `The "${m[1].toLowerCase()}" response under # Responses is empty.` });
      continue;
    }
    found[m[1].toLowerCase()] = m[2].trim();
  }
  return {
    unavailable: found.unavailable || DEFAULT_UNAVAILABLE_RESPONSE,
    fallback: found.fallback || DEFAULT_FALLBACK_RESPONSE,
  };
}

/** Check a rulebook for problems and prompt-only rules. */
export function validateChatRulebook(rulebook: ChatRulebook): RulebookIssue[] {
  const issues: RulebookIssue[] = [];

  if (!rulebook.purpose.trim()) {
    issues.push({ severity: 'error', message: 'The # Thesis section is empty: say what the chatbot exists to do.' });
  }

  if (rulebook.moments.length === 0) {
    issues.push({
      severity: 'warning',
      message:
        'No hard moments in # Escalations. Every chatbot should at least define what happens ' +
        'when someone may be in crisis.',
    });
  }

  for (const m of rulebook.moments) {
    if (!m.situation) {
      issues.push({ severity: 'error', ref: m.id, message: `Hard moment "${m.id}" has no "- situation:" description.` });
    }
    if (!m.response) {
      issues.push({ severity: 'error', ref: m.id, message: `Hard moment "${m.id}" has no "> response:" wording.` });
    }
    if (m.examples.length < MIN_EXAMPLES) {
      issues.push({
        severity: 'warning',
        ref: m.id,
        message:
          `Hard moment "${m.id}" has ${m.examples.length} example phrasing(s). Add at least ` +
          `${MIN_EXAMPLES}, including indirect ones: they teach the checker what this moment sounds like.`,
      });
    }
  }

  if (rulebook.rules.length === 0) {
    issues.push({ severity: 'error', message: 'There are no rules: add at least one line under # Invariants.' });
  } else if (!rulebook.rules.some((r) => r.check === 'meaning')) {
    issues.push({
      severity: 'error',
      message: 'Every rule is prompt-only, so nothing would check the chatbot\'s replies. Remove the prompt-only mark from at least one rule.',
    });
  }

  const seen = new Set<string>();
  for (const r of rulebook.rules) {
    const key = r.id.toLowerCase();
    if (seen.has(key)) issues.push({ severity: 'error', ref: r.id, message: `Two rules share the id "${r.id}". Give each rule its own id.` });
    seen.add(key);
  }
  const seenMoments = new Set<string>();
  for (const m of rulebook.moments) {
    const key = m.id.toLowerCase();
    if (RESERVED_MOMENT_IDS.has(key)) {
      issues.push({ severity: 'error', ref: m.id, message: `A hard moment can't be called "${m.id}": the checker uses that word to mean "no hard moment". Rename it.` });
    }
    if (seenMoments.has(key)) issues.push({ severity: 'error', ref: m.id, message: `Two hard moments share the name "${m.id}". Give each its own name.` });
    seenMoments.add(key);
  }

  const texts: [string, string][] = [
    ['# Thesis', rulebook.purpose],
    ...rulebook.rules.map((r): [string, string] => [`rule "${r.id}"`, r.text]),
    ...rulebook.moments.flatMap((m): [string, string][] => [[`hard moment "${m.id}"`, m.situation], [`hard moment "${m.id}"`, m.response]]),
    ['the unavailable response', rulebook.responses.unavailable],
    ['the fallback response', rulebook.responses.fallback],
  ];
  for (const [where, text] of texts) {
    const hit = text.match(PLACEHOLDER);
    if (hit) issues.push({ severity: 'error', message: `${where} still has a placeholder to fill in: ${hit[0]}` });
  }

  for (const r of rulebook.rules) {
    if (r.check === 'prompt') {
      issues.push({
        severity: 'warning',
        ref: r.id,
        message: `"${r.text}" is prompt-only: the chatbot is asked to follow it, but nothing checks.`,
      });
    }
  }

  return issues;
}

/**
 * Read a chatbot rulebook from its markdown. Returns the rulebook (null if it
 * can't be read) and every issue found, including validation warnings.
 */
export function parseChatRulebook(markdown: string): { rulebook: ChatRulebook | null; issues: RulebookIssue[] } {
  const issues: RulebookIssue[] = [];
  const { world, issues: parseIssues } = parseWorldMarkdown(markdown);

  for (const i of parseIssues) {
    // Simulation sections (State, Rules, Gates, ...) don't apply to chatbots.
    if (i.severity === 'error') issues.push({ severity: 'error', message: `${i.section}: ${i.message}` });
  }
  if (!world || issues.some((i) => i.severity === 'error')) return { rulebook: null, issues };

  const s = sections(markdown);
  const rules = parseRules(s.get('invariants'), issues);

  if (world.lenses.length > 1) {
    issues.push({
      severity: 'error',
      message: `# Lenses has ${world.lenses.length} personalities (## sections); a chatbot uses exactly one. Merge them into one.`,
    });
  }
  checkHabitLines(s.get('lenses'), issues);
  const lens = world.lenses[0];
  for (const d of lens?.directives ?? []) {
    const prompt = PROMPT_TAG.test(d.instruction);
    rules.push({ id: d.id, text: d.instruction.replace(PROMPT_TAG, ' ').trim(), kind: 'habit', check: prompt ? 'prompt' : 'meaning' });
  }

  const rulebook: ChatRulebook = {
    id: world.frontmatter.world_id,
    name: world.frontmatter.name,
    purpose: world.thesis ?? '',
    rules,
    moments: parseMoments(s.get('escalations'), issues),
    persona: lens && {
      name: lens.name,
      formality: lens.formality,
      verbosity: lens.verbosity,
      emotion: lens.emotion,
      confidence: lens.confidence,
    },
    responses: parseResponses(s.get('responses'), issues),
  };

  issues.push(...validateChatRulebook(rulebook));
  return { rulebook, issues };
}

/** How each part of the rulebook is enforced, in plain words. */
export function describeEnforcement(rulebook: ChatRulebook): EnforcementLine[] {
  return [
    ...rulebook.moments.map((m) => ({
      ref: m.id,
      what: m.situation,
      enforcedBy: 'fixed response (checked by meaning before the chatbot)' as const,
    })),
    ...rulebook.rules.map((r) => ({
      ref: r.id,
      what: r.text,
      enforcedBy:
        r.check === 'meaning' ? ('meaning check on every reply' as const) : ('prompt only (asked, not checked)' as const),
    })),
  ];
}
