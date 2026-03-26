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

const WORDS_GLANCE = 15;
const WORDS_DEPTH = 50;
const WORDS_FOLLOWUP = 40;

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

function loadBehavioralWorld(): string {
  const worldPath = resolve(__dirname, 'worlds/behavioral-signals.nv-world.md');
  return readFileSync(worldPath, 'utf-8');
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
  metrics: { activations: number; aiCalls: number; signalsSurfaced: number; dismissals: number; ambientSends: number; sessionStart: number; };
}

const sessions = new Map<string, NegotiatorSession>();

// ─── The App ─────────────────────────────────────────────────────────────────

class NegotiatorApp extends AppServer {
  private platformWorld = loadPlatformWorld();

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

    const state: NegotiatorSession = {
      aiProvider, executor, appContext,
      classifier: new SignalClassifier(sensitivity, cameraEnabled),
      classifyTimer: null,
      ambientBuffer: { enabled: ambientEnabled, bystanderAcknowledged: ambientBystanderAck, entries: [], maxBufferSeconds: ambientBufferSeconds, maxTokensPerCall: MAX_AMBIENT_TOKENS_ESTIMATE, sends: 0 },
      conversationHistory: [],
      lastSignalTime: 0, lastSignalText: '',
      transcriptionBuffer: [],
      appSession: session,
      metrics: { activations: 0, aiCalls: 0, signalsSurfaced: 0, dismissals: 0, ambientSends: 0, sessionStart: Date.now() },
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
        if (inWindow) {
          this.followUp(s, session, sessionId);
        } else {
          this.onDemandAnalysis(s, session, sessionId);
        }
      }

      if (data.pressType === 'long') {
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
          s.classifyTimer = setTimeout(() => {
            this.proactiveClassify(s, session, sessionId);
          }, CLASSIFY_DELAY_MS);
        }
      }
    });
  }

  // ── Proactive Signal Classification ────────────────────────────────────

  private async proactiveClassify(s: NegotiatorSession, session: AppSession, sessionId: string): Promise<void> {
    if (!s.aiProvider) return;

    // Governance: both AI calls go through the guard
    const classifyCheck = s.executor.evaluate('ai_send_transcription', s.appContext);
    if (!classifyCheck.allowed) return;
    const ambientCheck = s.executor.evaluate('ai_send_ambient', s.appContext);
    if (!ambientCheck.allowed) return;

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
        s.conversationHistory.push(
          { role: 'user', content: `[Proactive signal: ${signalContext}]` },
          { role: 'assistant', content: display },
        );
        if (s.conversationHistory.length > 6) s.conversationHistory = s.conversationHistory.slice(-6);

        s.lastSignalTime = Date.now();
        s.lastSignalText = display;
        s.metrics.signalsSurfaced++;
      }
    } catch (err) {
      console.error(`[Negotiator] AI call failed:`, err instanceof Error ? err.message : err);
    }
  }

  // ── On-Demand Analysis (user taps or says "negotiate") ─────────────────

  private async onDemandAnalysis(s: NegotiatorSession, session: AppSession, sessionId: string): Promise<void> {
    s.metrics.activations++;

    const ambientText = s.ambientBuffer.enabled && s.ambientBuffer.bystanderAcknowledged
      ? getAmbientContext(s.ambientBuffer)
      : '';

    const systemPrompt = buildNegotiatorPrompt(WORDS_DEPTH);

    const permCheck = s.executor.evaluate('ai_send_transcription', s.appContext);
    if (!permCheck.allowed) return;

    s.metrics.aiCalls++;

    const userMessage = ambientText
      ? `[The user tapped for a negotiation read. Here's the recent conversation — analyze for behavioral signals and give a tactical insight.]\n${ambientText}`
      : s.conversationHistory.length > 0
        ? '[The user tapped for a negotiation read. Analyze the conversation so far.]'
        : '[First activation. Give a brief negotiation principle to keep in mind.]';

    try {
      const response = await callUserAI(s.aiProvider!, systemPrompt, s.conversationHistory.slice(-4), userMessage, WORDS_DEPTH);
      if (response.text) {
        const displayCheck = s.executor.evaluate('display_response', s.appContext);
        if (displayCheck.allowed) session.layouts.showTextWall(response.text);

        s.conversationHistory.push({ role: 'user', content: userMessage }, { role: 'assistant', content: response.text });
        if (s.conversationHistory.length > 6) s.conversationHistory = s.conversationHistory.slice(-6);
        s.lastSignalTime = Date.now();
        s.lastSignalText = response.text;
      }
    } catch (err) {
      session.layouts.showTextWall('Something went wrong. Try again.');
    }
  }

  // ── Follow-Up ──────────────────────────────────────────────────────────

  private async followUp(s: NegotiatorSession, session: AppSession, sessionId: string): Promise<void> {
    s.metrics.activations++;

    const systemPrompt = buildNegotiatorPrompt(WORDS_FOLLOWUP);
    const permCheck = s.executor.evaluate('ai_send_transcription', s.appContext);
    if (!permCheck.allowed) return;

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
        const displayCheck = s.executor.evaluate('display_response', s.appContext);
        if (displayCheck.allowed) session.layouts.showTextWall(response.text);
        s.conversationHistory.push({ role: 'user', content: '[follow-up]' }, { role: 'assistant', content: response.text });
        if (s.conversationHistory.length > 6) s.conversationHistory = s.conversationHistory.slice(-6);
        s.lastSignalTime = Date.now();
      }
    } catch (err) {
      session.layouts.showTextWall('Something went wrong. Try again.');
    }
  }

  // ── Dismiss ────────────────────────────────────────────────────────────

  private dismiss(s: NegotiatorSession, session: AppSession): void {
    s.metrics.dismissals++;
    s.lastSignalTime = 0;
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
      const d = Math.round((Date.now() - s.metrics.sessionStart) / 1000);
      console.log(`[Negotiator] Session ended after ${d}s — ${s.metrics.signalsSurfaced} signals, ${s.metrics.dismissals} dismissed, ${s.metrics.aiCalls} AI calls`);
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
