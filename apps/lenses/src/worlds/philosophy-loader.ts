/**
 * Philosophy World Loader
 *
 * Loads .nv-world.md philosophy files and extracts the sections
 * needed to build AI system prompts. These are NOT governance worlds —
 * they're knowledge bases that power the voice × mode architecture.
 *
 * Voice → World mapping:
 *   Stoic       → stoicism.nv-world.md
 *   Coach       → icf-coaching.nv-world.md
 *   NFL Coach   → accountability.nv-world.md
 *   Monk        → mindfulness.nv-world.md
 *   Hype Man    → positive-psychology.nv-world.md
 *   Closer      → strategic-influence.nv-world.md
 *
 * Additional worlds (available in Settings > Advanced):
 *   Bushido, Socratic Method, CBT, Existentialism
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PhilosophyWorld {
  id: string;
  name: string;
  defaultMode: string;
  thesis: string;
  principles: string;
  voices: string;
  practices: string;
  boundaries: string;
  modes: Record<string, ModeDefinition>;
  tone: { formality: string; verbosity: string; emotion: string; confidence: string };
}

export interface ModeDefinition {
  name: string;
  tagline: string;
  description: string;
  directives: string; // Raw directive text (response_framing + behavior_shaping)
}

/** The 6 user-facing voices and their world file mappings */
export type VoiceId = 'stoic' | 'coach' | 'nfl_coach' | 'monk' | 'hype_man' | 'closer';

export interface Voice {
  id: VoiceId;
  name: string;
  tagline: string;
  worldFile: string;
}

export const VOICES: Voice[] = [
  { id: 'stoic',     name: 'Stoic',     tagline: 'Focus on what you can control.',            worldFile: 'stoicism.nv-world.md' },
  { id: 'coach',     name: 'Coach',     tagline: 'What do you really want here?',             worldFile: 'icf-coaching.nv-world.md' },
  { id: 'nfl_coach', name: 'NFL Coach', tagline: 'No excuses. Execute.',                      worldFile: 'accountability.nv-world.md' },
  { id: 'monk',      name: 'Monk',      tagline: 'One thing at a time. You\'re okay.',        worldFile: 'mindfulness.nv-world.md' },
  { id: 'hype_man',  name: 'Hype Man',  tagline: 'You just did that.',                        worldFile: 'positive-psychology.nv-world.md' },
  { id: 'closer',    name: 'Closer',    tagline: 'Here\'s the play.',                         worldFile: 'strategic-influence.nv-world.md' },
];

/** Additional worlds available in Settings > Advanced */
export const ADVANCED_WORLDS: Array<{ id: string; name: string; worldFile: string }> = [
  { id: 'bushido',         name: 'Bushido',         worldFile: 'bushido.nv-world.md' },
  { id: 'socratic',        name: 'Socratic',        worldFile: 'socratic-method.nv-world.md' },
  { id: 'cbt',             name: 'CBT',             worldFile: 'cbt.nv-world.md' },
  { id: 'existentialism',  name: 'Existentialism',  worldFile: 'existentialism.nv-world.md' },
];

// ─── Validation ─────────────────────────────────────────────────────────────

export interface PhilosophyValidationIssue {
  section: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

/** Required sections for a valid philosophy world */
const REQUIRED_SECTIONS = ['Thesis', 'Principles', 'Voices', 'Modes'];
const OPTIONAL_SECTIONS = ['Practices', 'Boundaries', 'Tone'];
const KNOWN_SECTIONS = new Set([...REQUIRED_SECTIONS, ...OPTIONAL_SECTIONS].map(s => s.toLowerCase()));

/** Required modes that every philosophy world must define */
const REQUIRED_MODES = ['direct', 'translate', 'reflect', 'challenge', 'teach'];

/** Required frontmatter fields */
const REQUIRED_FRONTMATTER = ['world_id', 'name', 'type'];

/**
 * Validate a philosophy world file.
 * Returns issues found — errors mean the world is not usable.
 *
 * This mirrors the governance engine's parseWorldMarkdown validation
 * rigor, but for philosophy document schema instead of governance schema.
 */
export function validatePhilosophyWorld(raw: string): PhilosophyValidationIssue[] {
  const issues: PhilosophyValidationIssue[] = [];

  // ── Frontmatter ──────────────────────────────────────────────────────
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    issues.push({ section: 'frontmatter', message: 'Missing YAML frontmatter (---)', severity: 'error' });
  } else {
    const fm: Record<string, string> = {};
    for (const line of fmMatch[1].split('\n')) {
      const [key, ...rest] = line.split(':');
      if (key && rest.length > 0) fm[key.trim()] = rest.join(':').trim();
    }

    for (const field of REQUIRED_FRONTMATTER) {
      if (!fm[field]) {
        issues.push({ section: 'frontmatter', message: `Missing required field: ${field}`, severity: 'error' });
      }
    }

    if (fm['type'] && fm['type'] !== 'philosophy') {
      issues.push({ section: 'frontmatter', message: `type must be "philosophy", got "${fm['type']}"`, severity: 'error' });
    }
  }

  // ── Sections ─────────────────────────────────────────────────────────
  const sections = extractSections(raw);
  const sectionNames = Object.keys(sections);

  for (const req of REQUIRED_SECTIONS) {
    if (!sections[req]) {
      issues.push({ section: req, message: `Missing required section: # ${req}`, severity: 'error' });
    }
  }

  for (const name of sectionNames) {
    if (!KNOWN_SECTIONS.has(name.toLowerCase())) {
      issues.push({ section: name, message: `Unrecognized section "${name}" — will be ignored`, severity: 'info' });
    }
  }

  // ── Principles ───────────────────────────────────────────────────────
  if (sections['Principles']) {
    const principleCount = (sections['Principles'].match(/^## /gm) ?? []).length;
    if (principleCount === 0) {
      issues.push({ section: 'Principles', message: 'No principles defined (expected ## headings)', severity: 'error' });
    }
    if (principleCount < 3) {
      issues.push({ section: 'Principles', message: `Only ${principleCount} principles — consider adding more depth`, severity: 'warning' });
    }
  }

  // ── Voices ───────────────────────────────────────────────────────────
  if (sections['Voices']) {
    const voiceCount = (sections['Voices'].match(/^## /gm) ?? []).length;
    if (voiceCount === 0) {
      issues.push({ section: 'Voices', message: 'No voices defined (expected ## headings)', severity: 'error' });
    }
  }

  // ── Modes ────────────────────────────────────────────────────────────
  if (sections['Modes']) {
    const modes = parseModes(sections['Modes']);
    const definedModes = Object.keys(modes);

    for (const req of REQUIRED_MODES) {
      if (!definedModes.includes(req)) {
        issues.push({ section: 'Modes', message: `Missing required mode: ${req}`, severity: 'error' });
      }
    }

    for (const [id, mode] of Object.entries(modes)) {
      if (!mode.directives || mode.directives.trim().length === 0) {
        issues.push({ section: 'Modes', message: `Mode "${id}" has no directives (expected > lines)`, severity: 'warning' });
      }
    }
  }

  // ── Boundaries ───────────────────────────────────────────────────────
  if (!sections['Boundaries']) {
    issues.push({ section: 'Boundaries', message: 'Missing # Boundaries section — philosophy worlds should define clinical referral triggers and scope limits', severity: 'warning' });
  } else {
    if (!sections['Boundaries'].includes('clinical_referral')) {
      issues.push({ section: 'Boundaries', message: 'No clinical_referrals subsection — philosophy worlds should define when to refer to professionals', severity: 'warning' });
    }
  }

  return issues;
}

/**
 * Validate all bundled philosophy world files.
 * Returns a map of worldFile → issues.
 */
export function validateAllWorlds(): Map<string, PhilosophyValidationIssue[]> {
  const results = new Map<string, PhilosophyValidationIssue[]>();

  const allWorldFiles = [
    ...VOICES.map(v => v.worldFile),
    ...ADVANCED_WORLDS.map(w => w.worldFile),
  ];

  for (const worldFile of allWorldFiles) {
    try {
      const worldPath = resolve(__dirname, worldFile);
      const raw = readFileSync(worldPath, 'utf-8');
      const issues = validatePhilosophyWorld(raw);
      results.set(worldFile, issues);
    } catch (err) {
      results.set(worldFile, [{
        section: 'file',
        message: `Cannot read file: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error',
      }]);
    }
  }

  return results;
}

// ─── Loader ─────────────────────────────────────────────────────────────────

const worldCache = new Map<string, PhilosophyWorld>();

/**
 * Load, validate, and parse a philosophy world file.
 * Logs validation warnings. Throws on validation errors.
 * Results are cached in memory (worlds don't change during runtime).
 */
export function loadPhilosophyWorld(worldFile: string): PhilosophyWorld {
  const cached = worldCache.get(worldFile);
  if (cached) return cached;

  const worldPath = resolve(__dirname, worldFile);
  const raw = readFileSync(worldPath, 'utf-8');

  // Validate before parsing
  const issues = validatePhilosophyWorld(raw);
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  if (warnings.length > 0) {
    for (const w of warnings) {
      console.warn(`[Lenses] ${worldFile} warning (${w.section}): ${w.message}`);
    }
  }

  if (errors.length > 0) {
    const errorMessages = errors.map(e => `  ${e.section}: ${e.message}`).join('\n');
    throw new Error(`Philosophy world "${worldFile}" failed validation:\n${errorMessages}`);
  }

  const world = parsePhilosophyWorld(raw);
  worldCache.set(worldFile, world);
  return world;
}

/**
 * Get a Voice by ID. Returns undefined if not found.
 */
export function getVoice(voiceId: string): Voice | undefined {
  return VOICES.find(v => v.id === voiceId);
}

/**
 * Load the philosophy world for a voice.
 */
export function loadWorldForVoice(voiceId: string): PhilosophyWorld | undefined {
  const voice = VOICES.find(v => v.id === voiceId);
  if (!voice) {
    // Check advanced worlds
    const adv = ADVANCED_WORLDS.find(w => w.id === voiceId);
    if (!adv) return undefined;
    return loadPhilosophyWorld(adv.worldFile);
  }
  return loadPhilosophyWorld(voice.worldFile);
}

// ─── Parser ─────────────────────────────────────────────────────────────────

function parsePhilosophyWorld(raw: string): PhilosophyWorld {
  // Extract frontmatter
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter: Record<string, string> = {};
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const [key, ...rest] = line.split(':');
      if (key && rest.length > 0) {
        frontmatter[key.trim()] = rest.join(':').trim();
      }
    }
  }

  // Extract sections by # headings
  const sections = extractSections(raw);

  // Parse modes from the Modes section
  const modes = parseModes(sections['Modes'] ?? '');

  // Parse tone
  const toneSection = sections['Tone'] ?? '';
  const tone = {
    formality: extractToneValue(toneSection, 'formality') ?? 'neutral',
    verbosity: extractToneValue(toneSection, 'verbosity') ?? 'concise',
    emotion: extractToneValue(toneSection, 'emotion') ?? 'neutral',
    confidence: extractToneValue(toneSection, 'confidence') ?? 'balanced',
  };

  return {
    id: frontmatter['world_id'] ?? 'unknown',
    name: frontmatter['name'] ?? 'Unknown',
    defaultMode: frontmatter['default_mode'] ?? 'direct',
    thesis: sections['Thesis'] ?? '',
    principles: sections['Principles'] ?? '',
    voices: sections['Voices'] ?? '',
    practices: sections['Practices'] ?? '',
    boundaries: sections['Boundaries'] ?? '',
    modes,
    tone,
  };
}

function extractSections(raw: string): Record<string, string> {
  const sections: Record<string, string> = {};
  // Match top-level sections (# Heading)
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

  // Split by ## headings
  const modeBlocks = modesSection.split(/^## /m).filter(Boolean);

  for (const block of modeBlocks) {
    const lines = block.trim().split('\n');
    const modeId = lines[0].trim().toLowerCase();

    let name = modeId;
    let tagline = '';
    let description = '';
    const directiveLines: string[] = [];

    for (const line of lines.slice(1)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- name:')) name = trimmed.replace('- name:', '').trim();
      else if (trimmed.startsWith('- tagline:')) tagline = trimmed.replace('- tagline:', '').trim();
      else if (trimmed.startsWith('- description:')) description = trimmed.replace('- description:', '').trim();
      else if (trimmed.startsWith('>')) directiveLines.push(trimmed.slice(1).trim());
    }

    modes[modeId] = { name, tagline, description, directives: directiveLines.join('\n') };
  }

  return modes;
}

function extractToneValue(section: string, key: string): string | undefined {
  const match = section.match(new RegExp(`-\\s*${key}:\\s*(.+)`, 'i'));
  return match?.[1]?.trim();
}

// ─── System Prompt Builder ──────────────────────────────────────────────────

/**
 * Build the complete system prompt for a voice.
 *
 * The AI receives:
 *   1. The world's thesis and principles (what to think through)
 *   2. The world's voices (who to channel)
 *   3. ALL five modes with directives (so the AI can pick the right one)
 *   4. The intent classifier instruction
 *
 * No Work/Personal context — the AI reads the situation from ambient.
 * Response length is auto-scaled by the caller (glance vs depth vs follow-up).
 */
export function buildSystemPrompt(
  world: PhilosophyWorld,
  voice: Voice | { id: string; name: string; tagline: string },
  maxWords: number,
): string {
  const modeBlock = Object.entries(world.modes)
    .map(([id, mode]) => `### ${id.toUpperCase()}: ${mode.name}
${mode.description}
${mode.directives}`)
    .join('\n\n');

  return `## ${voice.name}
"${voice.tagline}"

## Philosophy
${world.thesis}

## Principles
${world.principles}

## Voices You Channel
${world.voices}

## Practices You Can Suggest
${world.practices}

## Boundaries
${world.boundaries}

## Your Modes
You have five interaction modes. READ THE CONVERSATION and pick the right one automatically.
Do not announce which mode you're using. Just respond in the right way.

${modeBlock}

## Mode Selection
Pick the mode that fits what just happened:
- TRANSLATE when the user just experienced something and needs to understand it differently
- REFLECT when the user needs to look inward — they're processing, uncertain, or emotionally charged
- CHALLENGE when the user is stuck, making excuses, avoiding something, or holding a belief that isn't serving them
- TEACH when the user is curious about a concept or would benefit from understanding the principle at work
- DIRECT when the user needs a clear answer, action step, or recommendation — or when none of the above fit

When in doubt, use DIRECT. Bias toward action.

## Situation Awareness
Read the ambient context to understand the situation. If the conversation is about work — respond
for work. If it's personal — go deeper emotionally. Don't ask which context — just read the room.

## Constraints
You are responding through smart glasses. The user tapped or said "lens" — they want your perspective NOW.
Keep responses under ${maxWords} words. Be conversational. No bullet points. No markdown. No emojis.
No preamble. No "as a Stoic..." or "from a coaching perspective..." — just BE the voice.
One response. Make it count.`;
}
