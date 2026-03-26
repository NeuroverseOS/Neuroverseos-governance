/**
 * StarTalk Sign Loader — World Stacking for Zodiac Signs
 *
 * This is the key innovation: sun sign (dominant) + rising sign (secondary)
 * merge into a single system prompt with weighted priority.
 *
 * A Cancer with Aries rising is VERY different from a Cancer with Cancer rising.
 * The sun sign sets the core traits. The rising sign adjusts communication style.
 *
 * When the user also knows the OTHER person's sign, compatibility notes
 * get injected — "As a Cancer talking to a Taurus, lean into shared
 * emotional depth but slow down on the decisions."
 *
 * This is the first real test of NeuroverseOS world stacking.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ZodiacWorld {
  id: string;
  name: string;
  element: string;
  modality: string;
  dates: string;
  rulingPlanet: string;
  thesis: string;
  traits: string;
  communication: string;
  modes: Record<string, ModeDefinition>;
  compatibility: { bestWith: string; tensionWith: string };
  tone: { formality: string; verbosity: string; emotion: string; confidence: string };
}

export interface ModeDefinition {
  name: string;
  tagline: string;
  directives: string;
}

export type SignId =
  | 'aries' | 'taurus' | 'gemini' | 'cancer'
  | 'leo' | 'virgo' | 'libra' | 'scorpio'
  | 'sagittarius' | 'capricorn' | 'aquarius' | 'pisces';

export interface UserProfile {
  sunSign: SignId;
  risingSign?: SignId;
}

export const ALL_SIGNS: Array<{ id: SignId; name: string; dates: string; symbol: string }> = [
  { id: 'aries',       name: 'Aries',       dates: 'Mar 21 - Apr 19', symbol: 'The Ram' },
  { id: 'taurus',      name: 'Taurus',      dates: 'Apr 20 - May 20', symbol: 'The Bull' },
  { id: 'gemini',      name: 'Gemini',      dates: 'May 21 - Jun 20', symbol: 'The Twins' },
  { id: 'cancer',      name: 'Cancer',       dates: 'Jun 21 - Jul 22', symbol: 'The Crab' },
  { id: 'leo',         name: 'Leo',         dates: 'Jul 23 - Aug 22', symbol: 'The Lion' },
  { id: 'virgo',       name: 'Virgo',       dates: 'Aug 23 - Sep 22', symbol: 'The Maiden' },
  { id: 'libra',       name: 'Libra',       dates: 'Sep 23 - Oct 22', symbol: 'The Scales' },
  { id: 'scorpio',     name: 'Scorpio',     dates: 'Oct 23 - Nov 21', symbol: 'The Scorpion' },
  { id: 'sagittarius', name: 'Sagittarius', dates: 'Nov 22 - Dec 21', symbol: 'The Archer' },
  { id: 'capricorn',   name: 'Capricorn',   dates: 'Dec 22 - Jan 19', symbol: 'The Sea-Goat' },
  { id: 'aquarius',    name: 'Aquarius',    dates: 'Jan 20 - Feb 18', symbol: 'The Water Bearer' },
  { id: 'pisces',      name: 'Pisces',      dates: 'Feb 19 - Mar 20', symbol: 'The Fish' },
];

// ─── Loader ─────────────────────────────────────────────────────────────────

const signCache = new Map<string, ZodiacWorld>();

export function loadSign(signId: SignId): ZodiacWorld {
  const cached = signCache.get(signId);
  if (cached) return cached;

  const signPath = resolve(__dirname, 'signs', `${signId}.nv-world.md`);
  const raw = readFileSync(signPath, 'utf-8');
  const world = parseZodiacWorld(raw);
  signCache.set(signId, world);
  return world;
}

export function getSignInfo(signId: string): typeof ALL_SIGNS[0] | undefined {
  return ALL_SIGNS.find(s => s.id === signId);
}

// ─── Parser ─────────────────────────────────────────────────────────────────

function parseZodiacWorld(raw: string): ZodiacWorld {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  const fm: Record<string, string> = {};
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const [key, ...rest] = line.split(':');
      if (key && rest.length > 0) fm[key.trim()] = rest.join(':').trim();
    }
  }

  const sections = extractSections(raw);
  const modes = parseModes(sections['Modes'] ?? '');
  const toneSection = sections['Tone'] ?? '';

  // Parse compatibility
  const compatSection = sections['Compatibility'] ?? '';
  const bestWith = extractSubsection(compatSection, 'best_with');
  const tensionWith = extractSubsection(compatSection, 'tension_with');

  return {
    id: fm['world_id'] ?? 'unknown',
    name: fm['name'] ?? 'Unknown',
    element: fm['element'] ?? '',
    modality: fm['modality'] ?? '',
    dates: fm['dates'] ?? '',
    rulingPlanet: fm['ruling_planet'] ?? '',
    thesis: sections['Thesis'] ?? '',
    traits: sections['Traits'] ?? '',
    communication: sections['Communication'] ?? '',
    modes,
    compatibility: { bestWith, tensionWith },
    tone: {
      formality: extractToneValue(toneSection, 'formality') ?? 'casual',
      verbosity: extractToneValue(toneSection, 'verbosity') ?? 'concise',
      emotion: extractToneValue(toneSection, 'emotion') ?? 'warm',
      confidence: extractToneValue(toneSection, 'confidence') ?? 'balanced',
    },
  };
}

function extractSections(raw: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const regex = /^# (.+)$/gm;
  const matches: Array<{ name: string; start: number }> = [];

  let match;
  while ((match = regex.exec(raw)) !== null) {
    matches.push({ name: match[1].trim(), start: match.index + match[0].length });
  }

  for (let i = 0; i < matches.length; i++) {
    const end = i + 1 < matches.length ? matches[i + 1].start - matches[i + 1].name.length - 2 : raw.length;
    sections[matches[i].name] = raw.slice(matches[i].start, end).trim();
  }

  return sections;
}

function parseModes(modesSection: string): Record<string, ModeDefinition> {
  const modes: Record<string, ModeDefinition> = {};
  const modeBlocks = modesSection.split(/^## /m).filter(Boolean);

  for (const block of modeBlocks) {
    const lines = block.trim().split('\n');
    const modeId = lines[0].trim().toLowerCase();
    let name = modeId;
    let tagline = '';
    const directiveLines: string[] = [];

    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- name:')) name = trimmed.replace('- name:', '').trim();
      else if (trimmed.startsWith('- tagline:')) tagline = trimmed.replace('- tagline:', '').trim();
      else if (trimmed.startsWith('>')) directiveLines.push(trimmed.slice(1).trim());
    }

    modes[modeId] = { name, tagline, directives: directiveLines.join('\n') };
  }

  return modes;
}

function extractSubsection(section: string, heading: string): string {
  const regex = new RegExp(`^## ${heading}\\b`, 'mi');
  const match = regex.exec(section);
  if (!match) return '';

  const start = match.index + match[0].length;
  const nextHeading = section.slice(start).match(/^## /m);
  const end = nextHeading ? start + nextHeading.index! : section.length;
  return section.slice(start, end).trim();
}

function extractToneValue(section: string, key: string): string | undefined {
  const match = section.match(new RegExp(`-\\s*${key}:\\s*(.+)`, 'i'));
  return match?.[1]?.trim();
}

// ─── World Stacking: Sun + Rising ───────────────────────────────────────────

/**
 * Build a stacked system prompt from sun sign (dominant) + rising sign (secondary).
 *
 * The sun sign provides:
 *   - Core traits (all 6)
 *   - Primary communication style
 *   - Mode directives (these drive behavior)
 *
 * The rising sign provides:
 *   - Communication style overlay (how the sun sign PRESENTS)
 *   - Secondary traits that modify the primary
 *
 * Think of it as: sun = WHO you are, rising = HOW you come across.
 *
 * If the user also knows the OTHER person's sign, compatibility notes
 * get injected for real-time translation.
 */
export function buildStarTalkPrompt(
  profile: UserProfile,
  otherSign?: SignId,
  maxWords: number = 80,
): string {
  const sun = loadSign(profile.sunSign);
  const rising = profile.risingSign ? loadSign(profile.risingSign) : null;
  const other = otherSign ? loadSign(otherSign) : null;

  const sunInfo = getSignInfo(profile.sunSign)!;
  const risingInfo = profile.risingSign ? getSignInfo(profile.risingSign) : null;

  // ── Identity block ────────────────────────────────────────────────────

  let identity = `## You Are: ${sun.name}`;
  if (rising && rising.id !== sun.id) {
    identity += ` with ${rising.name} Rising`;
  }
  identity += `\n${sun.element} sign. ${sun.modality}. Ruled by ${sun.rulingPlanet}.`;

  // ── Core personality (sun sign dominant) ──────────────────────────────

  const coreBlock = `## Core Personality (${sun.name} Sun)
${sun.thesis}

## Traits
${sun.traits}`;

  // ── Communication style (rising modifies sun) ─────────────────────────

  let commBlock = `## Communication Style (${sun.name})
${sun.communication}`;

  if (rising && rising.id !== sun.id) {
    commBlock += `\n\n## Rising Influence (${rising.name})
Your ${sun.name} core is filtered through ${rising.name} energy in first impressions and social style.
${rising.communication}

Key tension: Your ${sun.name} nature may feel one way inside while your ${rising.name} rising presents differently on the surface. Help the user navigate this gap.`;
  }

  // ── Other person's sign (if known) ────────────────────────────────────

  let compatBlock = '';
  if (other) {
    compatBlock = `## The Person You're Talking To: ${other.name}
${other.thesis}

Their traits:
${other.traits}

Their communication style:
${other.communication}`;

    // Check compatibility
    const isBestWith = sun.compatibility.bestWith.toLowerCase().includes(other.id);
    const isTension = sun.compatibility.tensionWith.toLowerCase().includes(other.id);

    if (isBestWith) {
      compatBlock += `\n\n## Compatibility: Natural Allies
${sun.name} and ${other.name} typically connect well. Lean into shared strengths.
${sun.compatibility.bestWith}`;
    } else if (isTension) {
      compatBlock += `\n\n## Compatibility: Watch Points
${sun.name} and ${other.name} can create friction. Be aware of these dynamics.
${sun.compatibility.tensionWith}`;
    } else {
      compatBlock += `\n\n## Compatibility: Neutral Ground
${sun.name} and ${other.name} don't have strong natural chemistry or friction. Read the specific situation.`;
    }
  }

  // ── Modes (from sun sign) ─────────────────────────────────────────────

  const modeBlock = Object.entries(sun.modes)
    .map(([id, mode]) => `### ${id.toUpperCase()}: ${mode.name}
${mode.directives}`)
    .join('\n\n');

  // ── Assemble ──────────────────────────────────────────────────────────

  return `${identity}

${coreBlock}

${commBlock}

${compatBlock}

## Your Modes
You have five interaction modes. READ THE CONVERSATION and pick the right one automatically.
Do not announce which mode you're using. Just respond in the right way.

${modeBlock}

## Mode Selection
- TRANSLATE when the user needs to understand what someone else just said/did through their astrological lens
- REFLECT when the user needs to understand their own behavior through their sign's patterns
- CHALLENGE when the user is falling into their sign's shadow traits
- TEACH when the user would benefit from understanding the astrological dynamic at play
- DIRECT when the user needs a clear recommendation for how to handle the moment

When in doubt, use TRANSLATE. StarTalk's primary value is helping people understand each other.

## Tone
Keep it playful but accurate. Astrology should feel like insight, not fortune-telling.
Root observations in real behavior patterns, not mysticism.
${other ? `You're translating between a ${sun.name} and a ${other.name}. Be specific to their dynamic.` : ''}

## Constraints
You are responding through smart glasses. The user tapped or said "star" — they want cosmic perspective NOW.
Keep responses under ${maxWords} words. Be conversational. No bullet points. No markdown. No emojis.
No preamble. No "as a ${sun.name}..." — just give the insight.
Keep it playful. Astrology should feel like insight with a wink, not a personality report.
One response. Make it count.

## Mode Declaration
Before your response, output a mode tag on its own line: [MODE:translate] or [MODE:direct] etc.
This tag will be stripped before display — the user won't see it. It helps us track which modes work best.`;
}
