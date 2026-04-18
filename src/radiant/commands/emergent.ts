/**
 * @neuroverseos/governance/radiant — `emergent` command
 *
 * The behavioral analysis command. Reads GitHub activity for a repo,
 * classifies events, extracts signals, asks the AI to interpret patterns,
 * computes L/C/N/R alignment scores, applies the rendering lens, and
 * produces the EMERGENT / MEANING / MOVE output.
 *
 * This is the command that produces the output Nils reads.
 *
 * Usage (programmatic):
 *   import { emergent } from '@neuroverseos/governance/radiant';
 *   const result = await emergent({ scope, token, ... });
 *   console.log(result.text);
 *
 * Usage (CLI — wired in cli/radiant.ts):
 *   neuroverse radiant emergent aukiverse/posemesh --lens auki-builder
 */

import type { RenderingLens, Score } from '../types';
import type { RadiantAI } from '../core/ai';
import type { RepoScope, OrgScope } from '../core/scopes';
import type { Event } from '../core/domain';
import type { Signal } from '../core/signals';
import type { RenderOutput } from '../core/renderer';
import { getLens } from '../lenses/index';
import { fetchGitHubActivity, fetchGitHubOrgActivity } from '../adapters/github';
import { fetchDiscordActivity, formatDiscordSignalsForPrompt } from '../adapters/discord';
import { fetchSlackActivity, formatSlackSignalsForPrompt } from '../adapters/slack';
import { fetchNotionActivity, formatNotionSignalsForPrompt } from '../adapters/notion';
import { discoverWorlds, formatActiveWorlds, type WorldStack } from '../core/discovery';
import { readExocortex, formatExocortexForPrompt, type ExocortexContext } from '../adapters/exocortex';
import { loadPriorReads, formatPriorReadsForPrompt, writeRead, computePersistence, updateKnowledge } from '../memory/palace';
import { compressExocortex, compressPriorReads } from '../core/compress';
import { auditGovernance, type GovernanceAudit } from '../core/governance';
import { classifyEvents, extractSignals } from '../core/signals';
import { extractDeclaredVocabulary } from '../core/vocabulary';
import { scoreLife, scoreCyber, scoreNeuroVerse, scoreComposite } from '../core/math';
import { interpretPatterns } from '../core/patterns';
import { render } from '../core/renderer';
import { checkForbiddenPhrases, type VoiceViolation } from '../core/voice-check';
import type { LifeCapability, CyberCapability, BridgingComponentScore } from '../types';
import { DEFAULT_EVIDENCE_GATE } from '../types';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface EmergentInput {
  scope: RepoScope | OrgScope;
  githubToken: string;
  worldmodelContent: string;
  lensId: string;
  ai: RadiantAI;
  windowDays?: number;
  canonicalPatterns?: readonly string[];
  /** Path to an exocortex directory. When present, Radiant reads stated
   *  intent (attention, goals, sprint) and compares against observed
   *  behavior from GitHub. The gap is the most valuable signal. */
  exocortexPath?: string;
  /** Path to a compiled world directory (for governance audit).
   *  When present, each event is evaluated through evaluateGuard
   *  and the GOVERNANCE section appears in the output. */
  worldPath?: string;
}

export interface EmergentResult {
  /** The rendered text output (EMERGENT / MEANING / MOVE). */
  text: string;
  /** The YAML frontmatter for Mind Palace coding. */
  frontmatter: string;
  /** Voice violations detected in AI output. */
  voiceViolations: VoiceViolation[];
  voiceClean: boolean;
  /** Raw signal matrix for inspection. */
  signals: readonly Signal[];
  /** Raw scores for inspection. */
  scores: { A_L: Score; A_C: Score; A_N: Score; R: Score };
  /** Event count fetched from GitHub. */
  eventCount: number;
  /** Active adapters used in this read. */
  activeAdapters?: string[];
  /** World stack — what worlds were discovered and loaded. */
  worldStack?: WorldStack;
}

// ─── Command ───────────────────────────────────────────────────────────────

export async function emergent(input: EmergentInput): Promise<EmergentResult> {
  const lens = resolveLens(input.lensId);
  const windowDays = input.windowDays ?? 14;

  // Discover worlds — explicit content takes priority, then auto-discovery
  let worldStack: WorldStack | undefined;
  let worldmodelContent = input.worldmodelContent;
  if (!worldmodelContent || worldmodelContent.trim() === '') {
    worldStack = discoverWorlds({ explicitWorldsDir: input.worldPath });
    worldmodelContent = worldStack.combinedContent;
  }

  // 0. Read exocortex stated intent + prior Radiant reads (if provided)
  let statedIntent: string | undefined;
  let exocortexContext: ExocortexContext | undefined;
  let priorReadContext = '';
  if (input.exocortexPath) {
    // Scope to the repo name if available (reads project-specific sprint/roadmap)
    const repoName = input.scope.type === 'repo' ? input.scope.repo : undefined;
    exocortexContext = readExocortex(input.exocortexPath, repoName);
    // Compress exocortex to one-line summaries (Mind Palace discipline)
    const compressed = compressExocortex(exocortexContext);
    if (compressed) {
      statedIntent = `## Stated Intent (from exocortex, compressed)\n\n${compressed}\n\nCompare stated intent against actual GitHub activity. Gaps = drift.`;
    }

    // Compress prior reads to pattern names + counts
    const priorReads = loadPriorReads(input.exocortexPath);
    if (priorReads.length > 0) {
      priorReadContext = compressPriorReads(priorReads);
    }
  }

  // 1. Fetch events from GitHub (single repo or entire org)
  let events: Event[];
  let orgRepos: string[] | undefined;

  if (input.scope.type === 'org') {
    const orgResult = await fetchGitHubOrgActivity(
      input.scope,
      input.githubToken,
      { windowDays },
    );
    events = orgResult.events;
    orgRepos = orgResult.repos;
  } else {
    events = await fetchGitHubActivity(input.scope, input.githubToken, {
      windowDays,
    });
  }

  // 1b. Auto-detect additional adapters from environment tokens
  let adapterSignals = '';
  const activeAdapters: string[] = ['github'];

  // Discord
  const discordToken = process.env.DISCORD_TOKEN;
  const discordGuild = process.env.DISCORD_GUILD_ID;
  if (discordToken && discordGuild) {
    try {
      const discord = await fetchDiscordActivity(discordGuild, discordToken, { windowDays });
      events.push(...discord.events);
      adapterSignals += '\n\n' + formatDiscordSignalsForPrompt(discord.signals);
      activeAdapters.push('discord');
    } catch {
      // Non-fatal — Discord unavailable doesn't break the read
    }
  }

  // Slack
  const slackToken = process.env.SLACK_TOKEN;
  if (slackToken) {
    try {
      const slack = await fetchSlackActivity(slackToken, { windowDays });
      events.push(...slack.events);
      adapterSignals += '\n\n' + formatSlackSignalsForPrompt(slack.signals);
      activeAdapters.push('slack');
    } catch {
      // Non-fatal
    }
  }

  // Notion
  const notionToken = process.env.NOTION_TOKEN;
  if (notionToken) {
    try {
      const notion = await fetchNotionActivity(notionToken, { windowDays });
      events.push(...notion.events);
      adapterSignals += '\n\n' + formatNotionSignalsForPrompt(notion.signals);
      activeAdapters.push('notion');
    } catch {
      // Non-fatal
    }
  }

  // Re-sort all events by timestamp after merging adapters
  events.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  // 2. Classify each event (life / cyber / joint)
  const classified = classifyEvents(events);

  // 3. Extract signals (5×3 matrix)
  const signals = extractSignals(classified);

  // 4. Compute L/C/N/R scores from the signal matrix
  const scores = computeScores(signals, input.worldmodelContent !== '');

  // 5. AI pattern interpretation (with stated intent if exocortex loaded)
  // Extract declared vocabulary from the worldmodel so the AI is told the
  // exact canonical names to use — and so any candidate whose description
  // matches a declared behavior's prose gets reclassified to the declared
  // name. This closes Radiant's fidelity loop: it governs its own output
  // against the vocabulary it claims to read.
  const declaredVocabulary = extractDeclaredVocabulary(worldmodelContent);

  const { patterns, meaning, move } = await interpretPatterns({
    signals,
    events: classified,
    worldmodelContent: input.worldmodelContent,
    lens,
    ai: input.ai,
    canonicalPatterns: input.canonicalPatterns,
    declaredVocabulary,
    statedIntent: [statedIntent, adapterSignals, priorReadContext]
      .filter(Boolean)
      .join('\n\n') || undefined,
  });

  // 6. Apply lens rewrite to each pattern
  const rewrittenPatterns = patterns.map((p) => lens.rewrite(p));

  // 7. Voice-check pattern descriptions
  const allDescriptions = rewrittenPatterns
    .map((p) => p.description)
    .join('\n');
  const voiceViolations = checkForbiddenPhrases(lens, allDescriptions);

  // 8. Governance audit (if compiled world available)
  let governance: GovernanceAudit | undefined;
  if (input.worldPath) {
    try {
      governance = await auditGovernance(classified, input.worldPath);
    } catch {
      // Non-fatal — governance audit failure shouldn't break the read
    }
  }

  // 9. Render output
  const rendered = render({
    scope: input.scope,
    windowDays,
    eventCount: events.length,
    signals,
    patterns: rewrittenPatterns,
    scores,
    lens,
    meaning: meaning || undefined,
    move: move || undefined,
    governance,
  });

  // 9. Write Mind Palace read to exocortex (if exocortex provided)
  if (input.exocortexPath) {
    try {
      const readPath = writeRead(input.exocortexPath, rendered.frontmatter, rendered.text);
      const priorReads = loadPriorReads(input.exocortexPath);
      const currentPatternNames = rewrittenPatterns.map((p) => p.name);
      const persistence = computePersistence(priorReads, currentPatternNames);

      // Collect governance-triggered items for subtraction tracking
      const triggeredItems = governance
        ? [
            ...governance.human.details.map((d) => d.ruleId).filter(Boolean),
            ...governance.cyber.details.map((d) => d.ruleId).filter(Boolean),
            ...governance.joint.details.map((d) => d.ruleId).filter(Boolean),
          ] as string[]
        : [];

      updateKnowledge(input.exocortexPath, persistence, {
        triggeredItems,
        totalReads: priorReads.length + 1,
      });
    } catch {
      // Non-fatal — write-back failure shouldn't break the read
    }
  }

  return {
    text: rendered.text,
    frontmatter: rendered.frontmatter,
    voiceViolations,
    voiceClean: voiceViolations.length === 0,
    signals,
    scores,
    eventCount: events.length,
    activeAdapters,
    worldStack,
  };
}

// ─── Score computation from signal matrix ──────────────────────────────────

function computeScores(
  signals: readonly Signal[],
  worldmodelLoaded: boolean,
): { A_L: Score; A_C: Score; A_N: Score; R: Score } {
  const gate = DEFAULT_EVIDENCE_GATE;

  // Life score — average life-domain signals
  const lifeSignals = signals.filter((s) => s.domain === 'life');
  const A_L = scoreLife(
    { dimensions: lifeSignals.map(signalToDimension) },
    gate,
  );

  // Cyber score — average cyber-domain signals
  const cyberSignals = signals.filter((s) => s.domain === 'cyber');
  const A_C = scoreCyber(
    { dimensions: cyberSignals.map(signalToDimension) },
    gate,
  );

  // Joint/N score — average joint-domain signals as bridging proxy
  const jointSignals = signals.filter((s) => s.domain === 'joint');
  const A_N = scoreNeuroVerse(
    jointSignals.map(signalToBridging),
    worldmodelLoaded,
    gate,
  );

  const R = scoreComposite(A_L, A_C, A_N);

  return { A_L, A_C, A_N, R };
}

function signalToDimension(s: Signal) {
  return {
    id: s.id,
    score: s.score,
    eventCount: s.eventCount,
    confidence: s.confidence,
  };
}

function signalToBridging(s: Signal): BridgingComponentScore {
  return {
    component: 'ALIGN' as const, // Proxy: joint signals → ALIGN component
    score: s.score,
    eventCount: s.eventCount,
    confidence: s.confidence,
  };
}

// ─── Internal ──────────────────────────────────────────────────────────────

function resolveLens(id: string): RenderingLens {
  const lens = getLens(id);
  if (!lens) {
    throw new Error(
      `Lens "${id}" not found. Check the id or register the lens.`,
    );
  }
  return lens;
}
