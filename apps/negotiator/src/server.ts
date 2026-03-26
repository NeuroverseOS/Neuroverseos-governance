#!/usr/bin/env npx tsx
/**
 * Negotiator — A MentraOS App
 *
 * Real-time behavioral signal detection for smart glasses.
 * "We don't detect lies. We detect when something doesn't add up."
 *
 * Architecture:
 *   - Proactive-first: signals surface automatically during conversation
 *   - User taps for on-demand analysis or follow-up
 *   - Camera optional: adds signal weight but never initiates flags
 *   - Sensitivity setting: conservative / standard / sensitive
 *
 * Signal Display (monochrome green, punctuation system):
 *   ~    light — "something to notice"
 *   ~~   medium — "worth exploring"
 *   ~~~  strong — "slow down, multiple things don't line up"
 *
 * Governance: strictest of any NeuroverseOS app.
 *   - No truth claims about other people
 *   - No single-signal escalation
 *   - Context before signal
 *   - Camera never primary
 *   - Human dignity floor
 *
 * BYO-Key Model: same as Lenses.
 */

import { AppServer } from '@mentra/sdk';
import type { AppSession, ButtonPress, TranscriptionData } from '@mentra/sdk';

import {
  MentraGovernedExecutor,
  DEFAULT_USER_RULES,
} from 'neuroverseos-governance/adapters/mentraos';
import type { AppContext } from 'neuroverseos-governance/adapters/mentraos';
import { evaluateGuard } from 'neuroverseos-governance/engine/guard-engine';
import { simulateWorld } from 'neuroverseos-governance/engine/simulate-engine';
import type { GuardEvent, WorldDefinition } from 'neuroverseos-governance/types';
import { parseWorldMarkdown } from 'neuroverseos-governance/engine/bootstrap-parser';
import { emitWorldDefinition } from 'neuroverseos-governance/engine/bootstrap-emitter';

import {
  SignalClassifier,
  type Sensitivity,
  type SignalClassification,
} from './signal-classifier';

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Constants ───────────────────────────────────────────────────────────────

const APP_ID = 'com.neuroverse.negotiator';
const DEFAULT_AMBIENT_BUFFER_SECONDS = 120;
const MAX_AMBIENT_TOKENS_ESTIMATE = 700;

const FOLLOW_UP_WINDOW_MS = 30_000;
const RECENCY_BOOST_SECONDS = 15;

/** Delay after speech before classifying signals (seconds of silence) */
const CLASSIFY_DELAY_MS = 3_000;
const MIN_CLASSIFY_WORDS = 8;

/** Word limits — nothing exceeds 50 words on the glasses display */
const WORDS_GLANCE = 15;
const WORDS_DEPTH = 50;
const WORDS_FOLLOWUP = 35;

/** Pattern to detect help request */
const HELP_PATTERN = /^(?:help|show\s+me\s+commands|how\s+does\s+this\s+work)\b/i;

/** Pattern to detect new conversation / reset */
const RESET_PATTERN = /\b(?:new\s+(?:conversation|chat|call|meeting)|reset|start\s+over|clear)\b/i;

/** Pattern to detect "negotiating with [person]" for profile lookup */
const NEGOTIATING_WITH_PATTERN = /\b(?:negotiating\s+with|meeting\s+with|talking\s+to|call\s+with)\s+(\w+)\b/i;

/** Trigger word for on-demand analysis */
const NEGOTIATE_TRIGGER = /\b(?:negotiate|read\s+(?:the\s+)?room|what\s+do\s+you\s+see)\b/i;

const AI_MODELS: Record<string, { provider: 'openai' | 'anthropic'; model: string }> = {
  'auto': { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  'claude-haiku-4-5-20251001': { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  'gpt-4o-mini': { provider: 'openai', model: 'gpt-4o-mini' },
};

// ─── AI Provider ─────────────────────────────────────────────────────────────

interface AIProvider { name: 'openai' | 'anthropic'; apiKey: string; model: string; }

async function callUserAI(
  provider: AIProvider, systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  userMessage: string, maxWords: number,
): Promise<{ text: string; tokensUsed?: number }> {
  const maxTokens = Math.max(50, maxWords * 3);
  const allMessages = [...messages, { role: 'user' as const, content: userMessage }];

  if (provider.name === 'anthropic') {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: provider.apiKey });
    const response = await client.messages.create({ model: provider.model, max_tokens: maxTokens, system: systemPrompt, messages: allMessages });
    const textBlock = response.content.find(b => b.type === 'text');
    return { text: textBlock?.text ?? '', tokensUsed: response.usage.input_tokens + response.usage.output_tokens };
  }
  if (provider.name === 'openai') {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: provider.apiKey });
    const response = await client.chat.completions.create({ model: provider.model, max_tokens: maxTokens, messages: [{ role: 'system' as const, content: systemPrompt }, ...allMessages] });
    return { text: response.choices[0]?.message?.content ?? '', tokensUsed: response.usage?.total_tokens };
  }
  throw new Error(`Unsupported provider: ${provider.name}`);
}

// ─── Governance ──────────────────────────────────────────────────────────────

function loadPlatformWorld() {
  const govRoot = resolve(require.resolve('neuroverseos-governance/package.json'), '..');
  const worldPath = resolve(govRoot, 'src/worlds/mentraos-smartglasses.nv-world.md');
  const worldMd = readFileSync(worldPath, 'utf-8');
  const parseResult = parseWorldMarkdown(worldMd);
  if (!parseResult.world || parseResult.issues.some(i => i.severity === 'error')) {
    throw new Error('Failed to load platform governance world');
  }
  return emitWorldDefinition(parseResult.world).world;
}

function loadAppWorld(): WorldDefinition | null {
  try {
    const worldPath = resolve(__dirname, 'worlds/negotiator-app.nv-world.md');
    const worldMd = readFileSync(worldPath, 'utf-8');
    const parseResult = parseWorldMarkdown(worldMd);
    if (parseResult.world && !parseResult.issues.some(i => i.severity === 'error')) {
      return emitWorldDefinition(parseResult.world).world;
    }
  } catch { /* optional */ }
  return null;
}

function loadBehavioralWorld(): string {
  try {
    const worldPath = resolve(__dirname, 'worlds/behavioral-signals.nv-world.md');
    return readFileSync(worldPath, 'utf-8');
  } catch (err) {
    console.error('[Negotiator] Failed to load behavioral world:', err instanceof Error ? err.message : err);
    // Minimal fallback — app still functions but with generic prompt
    return '# Thesis\nDetect behavioral signals in conversation. Surface when something doesn\'t add up.\n';
  }
}

// ─── Content Governance (kernel boundary checking) ───────────────────────────
// This is the REAL governance showcase: checking actual user speech and AI
// responses against the kernel's forbidden patterns (prompt injection,
// API key leaks, system prompt leaks).
//
// The MentraGovernedExecutor checks intents (can this action happen?).
// evaluateGuard() with contentFields checks CONTENT (is this text safe?).

/**
 * Check user input for prompt injection and other forbidden patterns.
 * Returns true if the content is safe, false if it should be blocked.
 */
function checkInputContent(text: string, world: WorldDefinition): { safe: boolean; reason?: string } {
  const event: GuardEvent = {
    intent: 'user_input_content',
    direction: 'input',
    contentFields: {
      customer_input: text,
      raw: text,
    },
  };

  const verdict = evaluateGuard(event, world, { level: 'standard' });

  if (verdict.status === 'BLOCK') {
    console.log(`[Negotiator] INPUT BLOCKED by kernel: ${verdict.reason}`);
    return { safe: false, reason: verdict.reason };
  }
  return { safe: true };
}

/**
 * Check AI output for API key leaks, system prompt leaks, and other
 * forbidden output patterns before displaying to the user.
 */
function checkOutputContent(text: string, world: WorldDefinition): { safe: boolean; reason?: string } {
  const event: GuardEvent = {
    intent: 'ai_output_content',
    direction: 'output',
    contentFields: {
      draft_reply: text,
      raw: text,
    },
  };

  const verdict = evaluateGuard(event, world, { level: 'standard' });

  if (verdict.status === 'BLOCK') {
    console.log(`[Negotiator] OUTPUT BLOCKED by kernel: ${verdict.reason}`);
    return { safe: false, reason: verdict.reason };
  }
  return { safe: true };
}

// ─── Governance State Bridge (invisible to user) ─────────────────────────────
// The user never sees trust scores, gate names, or governance warnings.
// They just feel it: responses get shorter or richer, proactive gets
// quieter or more confident. Like a good assistant who reads the room.
//
// How it works:
//   1. After each action, feed metrics into simulateWorld()
//   2. The rule engine computes session_trust based on world file rules
//   3. Gate classification determines behavior adjustments
//   4. Adjustments are invisible — no UI, just behavioral changes

type GovernanceGate = 'ACTIVE' | 'DEGRADED' | 'SUSPENDED' | 'REVOKED';

interface GovernanceState {
  sessionTrust: number;
  gate: GovernanceGate;
}

/**
 * Evaluate the current governance state by feeding app metrics into
 * the world's rule engine. Returns the new trust score and gate.
 *
 * The world file defines rules like:
 *   "When false_positive_dismissals > 5 → session_trust *= 0.85"
 *   "When ai_calls_made > 10 AND governance_blocks == 0 → session_trust *= 1.05"
 *
 * We feed real metrics, the engine computes trust, we read the gate.
 */
function evaluateGovernanceState(
  world: WorldDefinition | null,
  metrics: NegotiatorSession['metrics'],
  currentTrust: number,
): GovernanceState {
  if (!world) return { sessionTrust: currentTrust, gate: 'ACTIVE' };

  try {
    const result = simulateWorld(world, {
      stateOverrides: {
        session_trust: currentTrust,
        ai_calls_made: metrics.aiCalls,
        signals_surfaced: metrics.signalsSurfaced,
        false_positive_dismissals: metrics.dismissals,
        governance_blocks: metrics.governanceBlocks,
      },
    });

    const newTrust = (result.finalState.session_trust as number) ?? currentTrust;

    // Map trust to gate (from negotiator-app.nv-world.md)
    let gate: GovernanceGate = 'ACTIVE';
    if (newTrust <= 10) gate = 'REVOKED';
    else if (newTrust <= 30) gate = 'SUSPENDED';
    else if (newTrust < 70) gate = 'DEGRADED';

    return { sessionTrust: newTrust, gate };
  } catch {
    // If simulation fails, don't crash — stay at current state
    return { sessionTrust: currentTrust, gate: currentTrust >= 70 ? 'ACTIVE' : 'DEGRADED' };
  }
}

/**
 * Apply invisible behavioral adjustments based on the current gate.
 * The user never sees these — they just feel the app adjust.
 */
function gateAdjustments(gate: GovernanceGate): {
  maxWords: number;
  proactiveEnabled: boolean;
  classifyDelayMs: number;
} {
  switch (gate) {
    case 'ACTIVE':
      return { maxWords: WORDS_DEPTH, proactiveEnabled: true, classifyDelayMs: CLASSIFY_DELAY_MS };
    case 'DEGRADED':
      // Shorter responses, slower proactive, still functional
      return { maxWords: Math.round(WORDS_DEPTH * 0.6), proactiveEnabled: true, classifyDelayMs: CLASSIFY_DELAY_MS * 2 };
    case 'SUSPENDED':
      // Minimal responses, no proactive
      return { maxWords: WORDS_GLANCE, proactiveEnabled: false, classifyDelayMs: Infinity };
    case 'REVOKED':
      // Nothing works
      return { maxWords: 0, proactiveEnabled: false, classifyDelayMs: Infinity };
  }
}

function buildNegotiatorPrompt(maxWords: number): string {
  const worldContent = loadBehavioralWorld();
  // Extract the key sections for the system prompt
  return `## Negotiator
"We don't detect lies. We detect when something doesn't add up."

${worldContent.split('# Tone')[0]}

## Constraints
You are responding through smart glasses during a live conversation.
Keep responses under ${maxWords} words. Start with the ~ prefix matching signal strength.
Be conversational. No bullet points. No markdown. No emojis.
No "I detected..." — just give the insight and the move.
One sentence. Make it count.`;
}

// ─── Ambient Buffer (same pattern as Lenses) ─────────────────────────────────

interface AmbientEntry { text: string; timestamp: number; }
interface AmbientBuffer { enabled: boolean; bystanderAcknowledged: boolean; entries: AmbientEntry[]; maxBufferSeconds: number; maxTokensPerCall: number; sends: number; }

function purgeExpiredAmbient(buffer: AmbientBuffer): void {
  const cutoff = Date.now() - (buffer.maxBufferSeconds * 1000);
  buffer.entries = buffer.entries.filter(e => e.timestamp >= cutoff);
}

function getAmbientContext(buffer: AmbientBuffer): string {
  purgeExpiredAmbient(buffer);
  if (buffer.entries.length === 0) return '';
  const now = Date.now();
  const recentCutoff = now - (RECENCY_BOOST_SECONDS * 1000);
  const recent = buffer.entries.filter(e => e.timestamp >= recentCutoff);
  const older = buffer.entries.filter(e => e.timestamp < recentCutoff);
  const maxWords = Math.floor(buffer.maxTokensPerCall * 0.75);
  const build = (entries: AmbientEntry[], budget: number) => {
    const parts: string[] = []; let wc = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
      const w = entries[i].text.split(/\s+/);
      if (wc + w.length > budget) break;
      parts.unshift(entries[i].text); wc += w.length;
    }
    return parts.join(' ');
  };
  return [build(older, Math.floor(maxWords * 0.25)), build(recent, Math.floor(maxWords * 0.75))].filter(Boolean).join(' ');
}

// ─── Journal (SimpleStorage) ─────────────────────────────────────────────────
// Persists across sessions. Tracks signal effectiveness over time.
// The feedback loop: signal → user acted (follow-up/redirect) or didn't (dismiss/ignore)

interface SignalRecord {
  type: string;      // 'inconsistency' | 'deflection' | etc.
  acted: boolean;    // did the user follow up or redirect?
  dismissed: boolean; // did the user long-press dismiss?
}

interface NegotiatorJournal {
  totalSignals: number;
  totalDismissals: number;
  totalFollowThroughs: number;
  totalSessions: number;
  lastSessionDate: string;
  /** Rolling window of recent signals for effectiveness tracking */
  recentSignals: SignalRecord[];
  /** Signal type → { surfaced, acted, dismissed } for pattern learning */
  signalEffectiveness: Record<string, { surfaced: number; acted: number; dismissed: number }>;
}

const EMPTY_JOURNAL: NegotiatorJournal = {
  totalSignals: 0,
  totalDismissals: 0,
  totalFollowThroughs: 0,
  totalSessions: 0,
  lastSessionDate: '',
  recentSignals: [],
  signalEffectiveness: {},
};

/** Calculate follow-through rate (0-100) */
function followThroughRate(journal: NegotiatorJournal): number {
  if (journal.totalSignals === 0) return 0;
  return Math.round((journal.totalFollowThroughs / journal.totalSignals) * 100);
}

/** Get the user's most effective signal type */
function bestSignalType(journal: NegotiatorJournal): string | null {
  let best: string | null = null;
  let bestRate = 0;
  for (const [type, stats] of Object.entries(journal.signalEffectiveness)) {
    if (stats.surfaced < 3) continue; // need enough data
    const rate = stats.acted / stats.surfaced;
    if (rate > bestRate) { bestRate = rate; best = type; }
  }
  return best;
}

async function loadJournal(session: AppSession): Promise<NegotiatorJournal> {
  try {
    const stored = await session.storage.get('journal');
    if (stored) return stored as NegotiatorJournal;
  } catch { /* first session */ }
  return { ...EMPTY_JOURNAL };
}

async function saveJournal(session: AppSession, journal: NegotiatorJournal): Promise<void> {
  try {
    await session.storage.set('journal', journal);
  } catch (err) {
    console.warn('[Negotiator] Failed to save journal:', err instanceof Error ? err.message : err);
  }
}

// ─── Session State ───────────────────────────────────────────────────────────

interface NegotiatorSession {
  aiProvider: AIProvider | null;
  executor: MentraGovernedExecutor;
  appContext: AppContext;
  classifier: SignalClassifier;
  classifyTimer: ReturnType<typeof setTimeout> | null;
  ambientBuffer: AmbientBuffer;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  lastSignalTime: number;
  lastSignalText: string;
  transcriptionBuffer: string[];
  appSession: AppSession;
  journal: NegotiatorJournal;
  /** Governance state — trust score and gate (invisible to user) */
  governance: GovernanceState;
  /** Whether the last insight was proactive (for follow-through tracking) */
  lastWasProactive: boolean;
  /** Signal types from the last proactive insight (for effectiveness tracking) */
  lastSignalTypes: string[];
  metrics: { activations: number; aiCalls: number; signalsSurfaced: number; followThroughs: number; dismissals: number; governanceBlocks: number; ambientSends: number; sessionStart: number; };
}

const sessions = new Map<string, NegotiatorSession>();

// ─── The App ─────────────────────────────────────────────────────────────────

class NegotiatorApp extends AppServer {
  private platformWorld = loadPlatformWorld();
  private appWorld = loadAppWorld();

  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    const aiApiKey = session.settings.get<string>('ai_api_key', '');
    const aiProviderSetting = session.settings.get<string>('ai_provider', '');
    const aiModelSetting = session.settings.get<string>('ai_model', 'auto');
    const sensitivity = session.settings.get<string>('sensitivity', 'standard') as Sensitivity;
    const cameraEnabled = session.settings.get<boolean>('camera_signals', false);
    const ambientEnabled = session.settings.get<boolean>('ambient_context', false);
    const ambientBystanderAck = session.settings.get<boolean>('ambient_bystander_ack', false);
    const ambientBufferSeconds = session.settings.get<number>('ambient_buffer_duration', DEFAULT_AMBIENT_BUFFER_SECONDS);

    let aiProvider: AIProvider | null = null;
    if (aiApiKey) {
      const mc = AI_MODELS[aiModelSetting] ?? AI_MODELS['auto'];
      aiProvider = { name: aiProviderSetting === 'openai' ? 'openai' : mc.provider, apiKey: aiApiKey, model: mc.model };
    }

    const appContext: AppContext = { appId: APP_ID, aiProviderDeclared: true, declaredAIProviders: ['openai', 'anthropic'], dataRetentionOptedIn: false, aiDataTypesSent: 0, glassesModel: undefined };
    const executor = new MentraGovernedExecutor(this.platformWorld, {
      onBlock: (r) => console.log(`[Negotiator] BLOCKED: ${r.verdict.reason}`),
      onPause: (r) => console.log(`[Negotiator] CONFIRM: ${r.verdict.reason}`),
    }, DEFAULT_USER_RULES);

    const journal = await loadJournal(session);

    const state: NegotiatorSession = {
      aiProvider, executor, appContext,
      classifier: new SignalClassifier(sensitivity, cameraEnabled),
      classifyTimer: null,
      ambientBuffer: { enabled: ambientEnabled, bystanderAcknowledged: ambientBystanderAck, entries: [], maxBufferSeconds: ambientBufferSeconds, maxTokensPerCall: MAX_AMBIENT_TOKENS_ESTIMATE, sends: 0 },
      conversationHistory: [],
      lastSignalTime: 0, lastSignalText: '',
      transcriptionBuffer: [],
      appSession: session,
      journal,
      governance: { sessionTrust: 100, gate: 'ACTIVE' },
      lastWasProactive: false,
      lastSignalTypes: [],
      metrics: { activations: 0, aiCalls: 0, signalsSurfaced: 0, followThroughs: 0, dismissals: 0, governanceBlocks: 0, ambientSends: 0, sessionStart: Date.now() },
    };
    sessions.set(sessionId, state);

    if (!aiProvider) {
      session.layouts.showDoubleTextWall('Negotiator', 'Add your AI API key in Settings.');
      return;
    }

    const displayCheck = state.executor.evaluate('display_response', state.appContext);
    if (displayCheck.allowed) {
      session.layouts.showTextWall(`Negotiator active. ${sensitivity} sensitivity.`);
    }

    // ── Button Events ────────────────────────────────────────────────────
    session.events.onButtonPress((data: ButtonPress) => {
      const s = sessions.get(sessionId);
      if (!s || !s.aiProvider) return;

      if (data.pressType === 'short') {
        const now = Date.now();
        const inWindow = s.lastSignalTime > 0 && (now - s.lastSignalTime) < FOLLOW_UP_WINDOW_MS;

        // ── Follow-through tracking ────────────────────────────────────
        // If the user taps after a proactive signal, they ACTED on it.
        // This is the closed feedback loop.
        if (inWindow && s.lastWasProactive) {
          s.metrics.followThroughs++;
          s.journal.totalFollowThroughs++;
          // Record effectiveness per signal type
          for (const type of s.lastSignalTypes) {
            const eff = s.journal.signalEffectiveness[type] ?? { surfaced: 0, acted: 0, dismissed: 0 };
            eff.acted++;
            s.journal.signalEffectiveness[type] = eff;
          }
          s.journal.recentSignals.push(...s.lastSignalTypes.map(t => ({ type: t, acted: true, dismissed: false })));
          s.lastWasProactive = false;
        }

        if (inWindow) {
          this.followUp(s, session, sessionId);
        } else {
          this.onDemandAnalysis(s, session, sessionId);
        }
      }

      if (data.pressType === 'long') {
        // ── Dismiss tracking ───────────────────────────────────────────
        // If the user dismisses after a proactive signal, they rejected it.
        if (s.lastWasProactive) {
          for (const type of s.lastSignalTypes) {
            const eff = s.journal.signalEffectiveness[type] ?? { surfaced: 0, acted: 0, dismissed: 0 };
            eff.dismissed++;
            s.journal.signalEffectiveness[type] = eff;
          }
          s.journal.recentSignals.push(...s.lastSignalTypes.map(t => ({ type: t, acted: false, dismissed: true })));
          s.lastWasProactive = false;
        }
        this.dismiss(s, session);
      }
    });

    // ── Transcription Events ─────────────────────────────────────────────
    session.events.onTranscription(async (data: TranscriptionData) => {
      const s = sessions.get(sessionId);
      if (!s || !s.aiProvider) return;
      if (!data.text || data.text.trim().length === 0) return;
      if (!data.isFinal) return;

      const userText = data.text.trim();

      // Ambient buffer
      if (s.ambientBuffer.enabled && s.ambientBuffer.bystanderAcknowledged) {
        s.ambientBuffer.entries.push({ text: userText, timestamp: Date.now() });
        purgeExpiredAmbient(s.ambientBuffer);
      }

      // ── Help command ────────────────────────────────────────────────────
      if (HELP_PATTERN.test(userText)) {
        const helpSteps = [
          'Tap to read the room. Signals appear automatically.',
          'Tap again within 30s for a deeper tactical read.',
          'Long press to dismiss a bad signal.',
          'Say "new call" to reset between conversations. Settings on your phone for sensitivity + API key.',
        ];
        const step = s.metrics.activations % helpSteps.length;
        const displayCheck = s.executor.evaluate('display_response', s.appContext);
        if (displayCheck.allowed) session.layouts.showTextWall(helpSteps[step]);
        return;
      }

      // ── Reset / new conversation ───────────────────────────────────────
      if (RESET_PATTERN.test(userText)) {
        s.conversationHistory = [];
        s.ambientBuffer.entries = [];
        s.classifier.destroy();
        s.lastSignalTime = 0;
        s.lastSignalText = '';
        s.lastWasProactive = false;
        s.lastSignalTypes = [];
        const displayCheck = s.executor.evaluate('display_response', s.appContext);
        if (displayCheck.allowed) {
          session.layouts.showTextWall('New conversation. Listening.');
        }
        return;
      }

      // Voice trigger
      if (NEGOTIATE_TRIGGER.test(userText)) {
        await this.onDemandAnalysis(s, session, sessionId);
        return;
      }

      // Proactive classification — every utterance, after a pause
      if (s.ambientBuffer.enabled) {
        s.classifier.addUtterance(userText);

        if (s.classifyTimer) clearTimeout(s.classifyTimer);

        const wordCount = userText.split(/\s+/).length;
        if (wordCount >= MIN_CLASSIFY_WORDS) {
          // Classify delay adjusts with governance gate (degraded = slower)
          const delay = gateAdjustments(s.governance.gate).classifyDelayMs;
          if (delay === Infinity) return; // Gate says no proactive

          s.classifyTimer = setTimeout(() => {
            if (!sessions.has(sessionId)) return;
            this.proactiveClassify(s, session, sessionId);
          }, delay);
        }
      }
    });
  }

  // ── Proactive Signal Classification ────────────────────────────────────

  private async proactiveClassify(s: NegotiatorSession, session: AppSession, sessionId: string): Promise<void> {
    if (!s.aiProvider) return;

    // ── Governance gate check (invisible) ────────────────────────────
    // Re-evaluate trust based on current metrics. Adjust behavior silently.
    s.governance = evaluateGovernanceState(this.appWorld, s.metrics, s.governance.sessionTrust);
    const adjustments = gateAdjustments(s.governance.gate);

    // If gate says no proactive, stop silently
    if (!adjustments.proactiveEnabled) return;

    // Governance: both AI calls go through the guard
    const classifyCheck = s.executor.evaluate('ai_send_transcription', s.appContext);
    if (!classifyCheck.allowed) { s.metrics.governanceBlocks++; return; }
    const ambientCheck = s.executor.evaluate('ai_send_ambient', s.appContext);
    if (!ambientCheck.allowed) { s.metrics.governanceBlocks++; return; }

    s.metrics.aiCalls++;

    const classification = await s.classifier.classify(
      async (systemPrompt, userMessage) => {
        const response = await callUserAI(s.aiProvider!, systemPrompt, [], userMessage, 100);
        return response.text;
      },
    );

    if (classification.action === 'SILENT') return;

    // Build the insight text
    const insightText = s.classifier.buildInsightText(classification);
    if (!insightText || s.classifier.isDuplicate(insightText)) return;

    // Generate the full negotiation insight using the behavioral world
    const systemPrompt = buildNegotiatorPrompt(WORDS_GLANCE);
    const signalContext = classification.signals.map(sig => `${sig.type}: ${sig.description}`).join('. ');

    // Governance: second AI call also goes through the guard
    const insightPermCheck = s.executor.evaluate('ai_send_transcription', s.appContext);
    if (!insightPermCheck.allowed) { s.metrics.governanceBlocks++; return; }

    s.metrics.aiCalls++;

    try {
      const response = await callUserAI(
        s.aiProvider!,
        systemPrompt,
        s.conversationHistory.slice(-4),
        `[SIGNALS DETECTED: ${signalContext}. Suggested move: ${classification.suggestedMove ?? 'clarify'}. Give the user a ${classification.prefix} prefixed negotiation insight.]`,
        WORDS_GLANCE,
      );

      if (response.text) {
        // ── Kernel: check proactive output for leaks ──────────────────
        if (this.appWorld) {
          const outputCheck = checkOutputContent(response.text, this.appWorld);
          if (!outputCheck.safe) {
            console.log(`[Negotiator] Proactive output blocked: ${outputCheck.reason}`);
            return;
          }
        }

        // Ensure the prefix is present
        let display = response.text;
        if (!display.startsWith('~')) {
          display = `${classification.prefix} ${display}`;
        }

        const displayCheck = s.executor.evaluate('display_response', s.appContext);
        if (displayCheck.allowed) {
          session.layouts.showTextWall(display);
        }

        s.classifier.recordInsight(display);

        // Update dashboard with follow-through rate
        const dur = Math.round((Date.now() - s.metrics.sessionStart) / 60000);
        const ftRate = followThroughRate(s.journal);
        const cost = (s.metrics.aiCalls * 0.001).toFixed(3);
        const signalCount = s.metrics.signalsSurfaced + 1;
        session.dashboard.content.writeToMain(`${signalCount} signals (~$${cost}) · ${ftRate}% led to action · ${dur}m`);

        s.conversationHistory.push(
          { role: 'user', content: `[Proactive signal: ${signalContext}]` },
          { role: 'assistant', content: display },
        );
        if (s.conversationHistory.length > 6) s.conversationHistory = s.conversationHistory.slice(-6);

        s.lastSignalTime = Date.now();
        s.lastSignalText = display;
        s.lastWasProactive = true;
        s.lastSignalTypes = classification.signals.map(sig => sig.type);
        s.metrics.signalsSurfaced++;

        // Record signal surfaced in effectiveness tracking
        for (const sig of classification.signals) {
          const eff = s.journal.signalEffectiveness[sig.type] ?? { surfaced: 0, acted: 0, dismissed: 0 };
          eff.surfaced++;
          s.journal.signalEffectiveness[sig.type] = eff;
        }
      }
    } catch (err) {
      console.error(`[Negotiator] AI call failed:`, err instanceof Error ? err.message : err);
    }
  }

  // ── On-Demand Analysis (user taps or says "negotiate") ─────────────────

  private async onDemandAnalysis(s: NegotiatorSession, session: AppSession, sessionId: string): Promise<void> {
    s.metrics.activations++;

    // Re-evaluate governance (invisible to user)
    s.governance = evaluateGovernanceState(this.appWorld, s.metrics, s.governance.sessionTrust);
    const adjustments = gateAdjustments(s.governance.gate);

    // REVOKED = nothing works. User still tapped, so give them a brief note.
    if (adjustments.maxWords === 0) return;

    const ambientText = s.ambientBuffer.enabled && s.ambientBuffer.bystanderAcknowledged
      ? getAmbientContext(s.ambientBuffer)
      : '';

    // Word limit adjusts with gate — degraded sessions get shorter responses
    const systemPrompt = buildNegotiatorPrompt(adjustments.maxWords);

    const permCheck = s.executor.evaluate('ai_send_transcription', s.appContext);
    if (!permCheck.allowed) { s.metrics.governanceBlocks++; return; }

    s.metrics.aiCalls++;

    const userMessage = ambientText
      ? `[The user tapped for a negotiation read. Here's the recent conversation — analyze for behavioral signals and give a tactical insight.]\n${ambientText}`
      : s.conversationHistory.length > 0
        ? '[The user tapped for a negotiation read. Analyze the conversation so far.]'
        : '[First activation. Give a brief negotiation principle to keep in mind.]';

    // ── Kernel: check user input for prompt injection ────────────────
    if (this.appWorld && ambientText) {
      const inputCheck = checkInputContent(ambientText, this.appWorld);
      if (!inputCheck.safe) {
        console.log(`[Negotiator] Input blocked: ${inputCheck.reason}`);
        s.metrics.governanceBlocks++;
        return;
      }
    }

    try {
      const response = await callUserAI(s.aiProvider!, systemPrompt, s.conversationHistory.slice(-4), userMessage, WORDS_DEPTH);
      if (response.text) {
        // ── Kernel: check AI output for leaks before display ──────────
        if (this.appWorld) {
          const outputCheck = checkOutputContent(response.text, this.appWorld);
          if (!outputCheck.safe) {
            console.log(`[Negotiator] Output blocked: ${outputCheck.reason}`);
            return; // Don't display unsafe output
          }
        }

        const displayCheck = s.executor.evaluate('display_response', s.appContext);
        if (displayCheck.allowed) session.layouts.showTextWall(response.text);

        s.conversationHistory.push({ role: 'user', content: userMessage }, { role: 'assistant', content: response.text });
        if (s.conversationHistory.length > 6) s.conversationHistory = s.conversationHistory.slice(-6);
        s.lastSignalTime = Date.now();
        s.lastSignalText = response.text;
      }
    } catch (err) {
      const errCheck = s.executor.evaluate('display_response', s.appContext);
      if (errCheck.allowed) session.layouts.showTextWall('Something went wrong. Try again.');
    }
  }

  // ── Follow-Up ──────────────────────────────────────────────────────────

  private async followUp(s: NegotiatorSession, session: AppSession, sessionId: string): Promise<void> {
    s.metrics.activations++;

    const systemPrompt = buildNegotiatorPrompt(WORDS_FOLLOWUP);
    const permCheck = s.executor.evaluate('ai_send_transcription', s.appContext);
    if (!permCheck.allowed) { s.metrics.governanceBlocks++; return; }

    s.metrics.aiCalls++;

    try {
      const response = await callUserAI(
        s.aiProvider!,
        systemPrompt,
        s.conversationHistory.slice(-4),
        '[The user tapped again — they want a deeper read or a specific negotiation move. What should they do or say next?]',
        WORDS_FOLLOWUP,
      );
      if (response.text) {
        // Kernel: check follow-up output for leaks before display
        if (this.appWorld) {
          const outputCheck = checkOutputContent(response.text, this.appWorld);
          if (!outputCheck.safe) return;
        }

        const displayCheck = s.executor.evaluate('display_response', s.appContext);
        if (displayCheck.allowed) session.layouts.showTextWall(response.text);
        s.conversationHistory.push({ role: 'user', content: '[follow-up]' }, { role: 'assistant', content: response.text });
        if (s.conversationHistory.length > 6) s.conversationHistory = s.conversationHistory.slice(-6);
        s.lastSignalTime = Date.now();
      }
    } catch (err) {
      const errCheck = s.executor.evaluate('display_response', s.appContext);
      if (errCheck.allowed) session.layouts.showTextWall('Something went wrong. Try again.');
    }
  }

  // ── Dismiss ────────────────────────────────────────────────────────────

  private dismiss(s: NegotiatorSession, session: AppSession): void {
    s.metrics.dismissals++;
    s.lastSignalTime = 0;

    // Governance: re-evaluate trust after dismiss (dismiss = signal quality feedback)
    s.governance = evaluateGovernanceState(this.appWorld, s.metrics, s.governance.sessionTrust);

    if (s.conversationHistory.length >= 2) s.conversationHistory = s.conversationHistory.slice(0, -2);
    s.conversationHistory.push(
      { role: 'user', content: '[Dismissed — that signal was wrong. Adjust sensitivity.]' },
      { role: 'assistant', content: 'Noted. Raising threshold.' },
    );
    const displayCheck = s.executor.evaluate('display_response', s.appContext);
    if (displayCheck.allowed) session.layouts.showTextWall('Got it. Recalibrating.');
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  protected async onStop(sessionId: string, _userId: string, _reason: string): Promise<void> {
    const s = sessions.get(sessionId);
    if (s) {
      s.ambientBuffer.entries = [];
      if (s.classifyTimer) clearTimeout(s.classifyTimer);
      s.classifier.destroy();

      // Persist journal to SimpleStorage
      if (s.metrics.activations > 0 || s.metrics.signalsSurfaced > 0) {
        s.journal.totalSignals += s.metrics.signalsSurfaced;
        s.journal.totalDismissals += s.metrics.dismissals;
        s.journal.totalFollowThroughs += s.metrics.followThroughs;
        s.journal.totalSessions++;
        s.journal.lastSessionDate = new Date().toISOString().slice(0, 10);

        // Trim recent signals to last 50 (keep it under 100KB)
        if (s.journal.recentSignals.length > 50) {
          s.journal.recentSignals = s.journal.recentSignals.slice(-50);
        }

        await saveJournal(s.appSession, s.journal);
      }

      const ftRate = followThroughRate(s.journal);
      const best = bestSignalType(s.journal);

      const d = Math.round((Date.now() - s.metrics.sessionStart) / 1000);
      console.log(`[Negotiator] Session ended after ${d}s — ${s.metrics.signalsSurfaced} signals, ${s.metrics.followThroughs} acted, ${s.metrics.dismissals} dismissed, ${ftRate}% follow-through${best ? `, best signal: ${best}` : ''}, ${s.metrics.aiCalls} AI calls`);
    }
    sessions.delete(sessionId);
  }
}

// ─── Start ───────────────────────────────────────────────────────────────────

const app = new NegotiatorApp({
  packageName: APP_ID,
  apiKey: process.env.MENTRA_APP_API_KEY ?? '',
  port: Number(process.env.PORT) || 3002,
});

app.start();
console.log(`[Negotiator] Running on port ${Number(process.env.PORT) || 3002}`);
