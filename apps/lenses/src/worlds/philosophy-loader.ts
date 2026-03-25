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

export type UserContext = 'work' | 'personal';

// ─── Loader ─────────────────────────────────────────────────────────────────

const worldCache = new Map<string, PhilosophyWorld>();

/**
 * Load and parse a philosophy world file.
 * Returns a PhilosophyWorld with all sections extracted.
 * Results are cached in memory (worlds don't change during runtime).
 */
export function loadPhilosophyWorld(worldFile: string): PhilosophyWorld {
  const cached = worldCache.get(worldFile);
  if (cached) return cached;

  const worldPath = resolve(__dirname, worldFile);
  const raw = readFileSync(worldPath, 'utf-8');

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
 * Build the complete system prompt for a voice + context combination.
 *
 * The AI receives:
 *   1. The world's thesis and principles (what to think through)
 *   2. The world's voices (who to channel)
 *   3. ALL five modes with directives (so the AI can pick the right one)
 *   4. Context constraints (Work vs Personal)
 *   5. The intent classifier instruction
 *
 * The AI auto-selects the mode per message. No user command needed.
 */
export function buildSystemPrompt(
  world: PhilosophyWorld,
  voice: Voice | { id: string; name: string; tagline: string },
  context: UserContext,
  maxWords: number,
): string {
  const contextBlock = context === 'work'
    ? `## Context: Work
You are helping the user navigate their work day — meetings, decisions, conflict, politics, deadlines.
Keep language professional. No relationship advice. No clinical territory.
Reference situations they'd encounter at work: colleagues, bosses, clients, presentations, negotiations.`
    : `## Context: Personal
You are helping the user navigate their personal life — relationships, identity, purpose, habits, stress.
You can go deeper emotionally. Give more space. Reference family, friendships, self-discovery, meaning.`;

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

${contextBlock}

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

## Constraints
You are responding through smart glasses. The user tapped or said "lens me" — they want your perspective NOW.
Keep responses under ${maxWords} words. Be conversational. No bullet points. No markdown. No emojis.
No preamble. No "as a Stoic..." or "from a coaching perspective..." — just BE the voice.
One response. Make it count.`;
}
