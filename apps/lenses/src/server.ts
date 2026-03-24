#!/usr/bin/env npx tsx
/**
 * Lenses — A MentraOS App
 *
 * Pick who you want in your corner. Same AI, different perspective.
 *
 * This is a real, deployable MentraOS app server. Not an example.
 *
 * Architecture:
 *   - User brings their own AI API key (OpenAI or Anthropic)
 *   - User picks a lens (worldview) — Stoic, Coach, Hype Man, etc.
 *   - User activates AI via tap, double-tap, wake word, or always-on
 *   - Governance checks every action at three layers:
 *       1. User Rules (personal, cross-app — user is king)
 *       2. Platform World (MentraOS hardware + session safety)
 *       3. App World (Lenses-specific rules — user-customizable)
 *   - Lens overlay injected into AI system prompt (zero-cost governance)
 *   - User's API key calls their AI provider
 *   - Response displayed on glasses through the lens
 *
 * BYO-Key Model:
 *   Users paste their API key in app settings on their phone.
 *   We never store it on our servers — it lives in the user's
 *   MentraOS session config. Their key, their cost, their data.
 */

import { AppServer } from '@mentra/sdk';
import type { AppSession, TouchEvent, TranscriptionEvent } from '@mentra/sdk';

import {
  compileLensOverlay,
  getLens,
  getLenses,
  type Lens,
  type LensOverlay,
} from '../../../src/builder/lens';

import {
  MentraGovernedExecutor,
  DEFAULT_USER_RULES,
} from '../../../src/adapters/mentraos';
import type { AppContext, UserRules } from '../../../src/adapters/mentraos';

import { parseWorldMarkdown } from '../../../src/engine/bootstrap-parser';
import { emitWorldDefinition } from '../../../src/engine/bootstrap-emitter';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Constants ───────────────────────────────────────────────────────────────

const APP_ID = 'com.neuroverse.lenses';
const DEFAULT_LENS_ID = 'stoic';
const DEFAULT_MAX_WORDS = 30;
const DEFAULT_ACTIVATION = 'tap_hold';
const DEFAULT_AMBIENT_BUFFER_SECONDS = 120;
const MAX_AMBIENT_TOKENS_ESTIMATE = 700; // ~500 words ≈ 700 tokens, truncate from oldest

const AI_MODELS: Record<string, { provider: 'openai' | 'anthropic'; model: string }> = {
  'auto': { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  'claude-sonnet-4-20250514': { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
  'claude-haiku-4-5-20251001': { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  'gpt-4o-mini': { provider: 'openai', model: 'gpt-4o-mini' },
  'gpt-4o': { provider: 'openai', model: 'gpt-4o' },
};

// ─── AI Provider ─────────────────────────────────────────────────────────────

interface AIProvider {
  name: 'openai' | 'anthropic';
  apiKey: string;
  model: string;
}

interface AIResponse {
  text: string;
  tokensUsed?: number;
}

async function callUserAI(
  provider: AIProvider,
  systemPrompt: string,
  conversationMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  userMessage: string,
  maxWords: number,
): Promise<AIResponse> {
  const maxTokens = Math.max(50, maxWords * 3);

  // Build the full message array: ambient context + conversation history + current input
  const allMessages = [
    ...conversationMessages,
    { role: 'user' as const, content: userMessage },
  ];

  if (provider.name === 'anthropic') {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: provider.apiKey });

    const response = await client.messages.create({
      model: provider.model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: allMessages,
    });

    const textBlock = response.content.find(b => b.type === 'text');
    return {
      text: textBlock?.text ?? '',
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    };
  }

  if (provider.name === 'openai') {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: provider.apiKey });

    const response = await client.chat.completions.create({
      model: provider.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system' as const, content: systemPrompt },
        ...allMessages,
      ],
    });

    return {
      text: response.choices[0]?.message?.content ?? '',
      tokensUsed: response.usage?.total_tokens,
    };
  }

  throw new Error(`Unsupported AI provider: ${provider.name}`);
}

// ─── Governance Setup ────────────────────────────────────────────────────────

function loadPlatformWorld() {
  const worldPath = resolve(__dirname, '../../../src/worlds/mentraos-smartglasses.nv-world.md');
  const worldMd = readFileSync(worldPath, 'utf-8');
  const parseResult = parseWorldMarkdown(worldMd);

  if (!parseResult.world || parseResult.issues.some(i => i.severity === 'error')) {
    throw new Error('Failed to load platform governance world');
  }

  return emitWorldDefinition(parseResult.world).world;
}

function loadAppWorld() {
  const worldPath = resolve(__dirname, './worlds/lenses-app.nv-world.md');
  try {
    const worldMd = readFileSync(worldPath, 'utf-8');
    const parseResult = parseWorldMarkdown(worldMd);
    if (parseResult.world && !parseResult.issues.some(i => i.severity === 'error')) {
      return emitWorldDefinition(parseResult.world).world;
    }
  } catch {
    // App world is optional — platform world is sufficient
  }
  return null;
}

// ─── Session State ───────────────────────────────────────────────────────────

type ActivationMode = 'tap_hold' | 'double_tap' | 'wake_word' | 'always_on';

// ─── Ambient Context Buffer ───────────────────────────────────────────────────

interface AmbientEntry {
  text: string;
  timestamp: number;
}

interface AmbientBuffer {
  /** Whether user has opted in to ambient context */
  enabled: boolean;
  /** Whether user has acknowledged bystander disclosure */
  bystanderAcknowledged: boolean;
  /** Rolling buffer of recent ambient speech (RAM only, never persisted) */
  entries: AmbientEntry[];
  /** Max age of entries in seconds */
  maxBufferSeconds: number;
  /** Max estimated tokens to include in AI call */
  maxTokensPerCall: number;
  /** Session counter: how many AI calls included ambient */
  sends: number;
}

/**
 * Purge expired entries from the ambient buffer.
 * Enforces governance rule-011: stale context is worse than no context.
 */
function purgeExpiredAmbient(buffer: AmbientBuffer): void {
  const cutoff = Date.now() - (buffer.maxBufferSeconds * 1000);
  buffer.entries = buffer.entries.filter(e => e.timestamp >= cutoff);
}

/**
 * Get ambient context text, truncated to token budget.
 * Enforces governance rule-010: truncate from beginning (oldest first).
 * Newest speech is always most relevant.
 */
function getAmbientContext(buffer: AmbientBuffer): string {
  purgeExpiredAmbient(buffer);

  if (buffer.entries.length === 0) return '';

  // Build from newest to oldest, stop when we hit token budget
  // Rough estimate: 1 token ≈ 0.75 words, so maxTokens * 0.75 = max words
  const maxWords = Math.floor(buffer.maxTokensPerCall * 0.75);
  const parts: string[] = [];
  let wordCount = 0;

  for (let i = buffer.entries.length - 1; i >= 0; i--) {
    const words = buffer.entries[i].text.split(/\s+/);
    if (wordCount + words.length > maxWords) break;
    parts.unshift(buffer.entries[i].text);
    wordCount += words.length;
  }

  return parts.join(' ');
}

interface LensSession {
  /** Currently active lens(es) */
  activeLenses: Lens[];
  /** Compiled overlay (cached — recompiled only on lens change) */
  overlay: LensOverlay;
  /** User's AI provider config */
  aiProvider: AIProvider | null;
  /** Governance executor for this session */
  executor: MentraGovernedExecutor;
  /** App context for governance checks */
  appContext: AppContext;
  /** How the user activates AI */
  activationMode: ActivationMode;
  /** Whether the user is currently holding the touchpad (tap_hold mode) */
  isActivated: boolean;
  /** Buffered transcription while activated */
  transcriptionBuffer: string[];
  /** Max response words */
  maxWords: number;
  /** Camera context enabled */
  cameraContext: boolean;
  /** Ambient context buffer (governed — RAM only, never persisted) */
  ambientBuffer: AmbientBuffer;
  /** Recent conversation for context (last 3 exchanges) */
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Session metrics */
  metrics: {
    activations: number;
    aiCalls: number;
    aiFailures: number;
    lensSwitches: number;
    cameraUses: number;
    ambientSends: number;
    sessionStart: number;
  };
}

const sessions = new Map<string, LensSession>();

// ─── The App ─────────────────────────────────────────────────────────────────

class LensesApp extends AppServer {
  private platformWorld = loadPlatformWorld();
  private appWorld = loadAppWorld();

  protected async onSession(
    session: AppSession,
    sessionId: string,
    userId: string,
  ): Promise<void> {
    // ── Read user settings ──────────────────────────────────────────────────

    const settings = session.settings.getAll();
    const savedLensId = (settings?.active_lens as string) ?? DEFAULT_LENS_ID;
    const aiProviderSetting = settings?.ai_provider as string | undefined;
    const aiApiKey = settings?.ai_api_key as string | undefined;
    const aiModelSetting = (settings?.ai_model as string) ?? 'auto';
    const activationMode = (settings?.activation_mode as ActivationMode) ?? DEFAULT_ACTIVATION;
    const maxWords = (settings?.max_response_words as number) ?? DEFAULT_MAX_WORDS;
    const cameraContext = (settings?.camera_context as boolean) ?? false;
    const ambientContextEnabled = (settings?.ambient_context as boolean) ?? false;
    const ambientBufferSeconds = (settings?.ambient_buffer_duration as number) ?? DEFAULT_AMBIENT_BUFFER_SECONDS;
    const ambientBystanderAck = (settings?.ambient_bystander_ack as boolean) ?? false;

    // ── Resolve AI provider ─────────────────────────────────────────────────

    let aiProvider: AIProvider | null = null;
    if (aiApiKey) {
      const modelConfig = AI_MODELS[aiModelSetting] ?? AI_MODELS['auto'];
      // If user picked a specific provider, honor it. If auto, use model default.
      const providerName = aiProviderSetting === 'openai' || aiProviderSetting === 'anthropic'
        ? aiProviderSetting
        : modelConfig.provider;

      aiProvider = {
        name: providerName,
        apiKey: aiApiKey,
        model: modelConfig.model,
      };
    }

    // ── Resolve lens ────────────────────────────────────────────────────────

    const activeLens = getLens(savedLensId) ?? getLens(DEFAULT_LENS_ID)!;
    const activeLenses = [activeLens];
    const overlay = compileLensOverlay(activeLenses);

    // ── Build governance ────────────────────────────────────────────────────

    const appContext: AppContext = {
      appId: APP_ID,
      aiProviderDeclared: true,
      declaredAIProviders: ['openai', 'anthropic'],
      dataRetentionOptedIn: false,
      aiDataTypesSent: 0,
      glassesModel: undefined, // Filled by SDK at runtime
    };

    const executor = new MentraGovernedExecutor(
      this.platformWorld,
      {
        onBlock: (result) => {
          console.log(`[Lenses] BLOCKED: ${result.verdict.reason} (${result.decidingLayer})`);
        },
        onPause: (result) => {
          console.log(`[Lenses] CONFIRM: ${result.verdict.reason} (${result.decidingLayer})`);
        },
      },
      DEFAULT_USER_RULES,
    );

    // ── Initialize session ──────────────────────────────────────────────────

    const state: LensSession = {
      activeLenses,
      overlay,
      aiProvider,
      executor,
      appContext,
      activationMode,
      isActivated: activationMode === 'always_on',
      transcriptionBuffer: [],
      maxWords,
      cameraContext,
      ambientBuffer: {
        enabled: ambientContextEnabled,
        bystanderAcknowledged: ambientBystanderAck,
        entries: [],
        maxBufferSeconds: ambientBufferSeconds,
        maxTokensPerCall: MAX_AMBIENT_TOKENS_ESTIMATE,
        sends: 0,
      },
      conversationHistory: [],
      metrics: {
        activations: 0,
        aiCalls: 0,
        aiFailures: 0,
        lensSwitches: 0,
        cameraUses: 0,
        ambientSends: 0,
        sessionStart: Date.now(),
      },
    };
    sessions.set(sessionId, state);

    // ── Onboarding ──────────────────────────────────────────────────────────

    if (!aiProvider) {
      session.layouts.showDoubleTextWall(
        'Welcome to Lenses',
        'Go to Settings to add your AI API key. You bring your own key — we never see it.',
      );
      return;
    }

    // Show active lens
    session.layouts.showTextWall(
      `${activeLens.name} active. "${activeLens.tagline}" — ${this.activationLabel(activationMode)} to talk.`,
    );

    // ── Touch Events: Activation ─────────────────────────────────────────

    session.events.onTouch((event: TouchEvent) => {
      const s = sessions.get(sessionId);
      if (!s || !s.aiProvider) return;

      if (s.activationMode === 'tap_hold') {
        if (event.type === 'long_press_start') {
          this.activate(s, session);
        } else if (event.type === 'long_press_end') {
          this.deactivate(s, session, sessionId);
        }
      } else if (s.activationMode === 'double_tap') {
        if (event.type === 'double_tap') {
          if (s.isActivated) {
            this.deactivate(s, session, sessionId);
          } else {
            this.activate(s, session);
            // Auto-deactivate after 10 seconds of silence
            setTimeout(() => {
              const current = sessions.get(sessionId);
              if (current?.isActivated && current.transcriptionBuffer.length === 0) {
                this.deactivate(current, session, sessionId);
              }
            }, 10_000);
          }
        }
      }

      // Single tap while active: switch to next lens
      if (event.type === 'single_tap' && s.isActivated) {
        this.cycleLens(s, session);
      }
    });

    // ── Transcription Events ─────────────────────────────────────────────

    session.events.onTranscription(async (data: TranscriptionEvent) => {
      const s = sessions.get(sessionId);
      if (!s || !s.aiProvider) return;
      if (!data.text || data.text.trim().length === 0) return;

      const userText = data.text.trim();

      // ── Ambient Buffer: passively capture all speech (governed) ────────
      // Invariant: ambient-never-persisted — RAM only, purged on expiry
      // Invariant: ambient-user-initiated-only — buffer is passive, never acts
      if (s.ambientBuffer.enabled && s.ambientBuffer.bystanderAcknowledged) {
        s.ambientBuffer.entries.push({ text: userText, timestamp: Date.now() });
        purgeExpiredAmbient(s.ambientBuffer);
      }

      // ── Voice Commands (always processed) ──────────────────────────────

      // Wake word activation
      if (s.activationMode === 'wake_word' && /^hey\s+lens/i.test(userText)) {
        this.activate(s, session);
        const remainder = userText.replace(/^hey\s+lens\s*/i, '').trim();
        if (remainder) {
          s.transcriptionBuffer.push(remainder);
          await this.processBuffer(s, session, sessionId);
        }
        // Auto-deactivate after response
        setTimeout(() => {
          const current = sessions.get(sessionId);
          if (current?.isActivated) {
            current.isActivated = false;
          }
        }, 15_000);
        return;
      }

      // Lens switching (always available)
      const switchMatch = userText.match(
        /^(?:switch\s+to|use|activate|try)\s+(.+?)(?:\s+lens)?$/i,
      );
      if (switchMatch) {
        const requested = switchMatch[1].toLowerCase();
        const newLens = getLenses().find(
          l =>
            l.id === requested ||
            l.name.toLowerCase() === requested ||
            l.name.toLowerCase().startsWith(requested),
        );
        if (newLens) {
          this.switchLens(s, newLens, session);
          return;
        }
      }

      // List lenses
      if (/^(?:list|show|what)\s+lenses/i.test(userText)) {
        const lensNames = getLenses().map(l => `${l.name}`).join(', ');
        session.layouts.showTextWall(`Lenses: ${lensNames}`);
        return;
      }

      // Stack lens
      const stackMatch = userText.match(/^(?:add|stack)\s+(.+?)(?:\s+lens)?$/i);
      if (stackMatch) {
        const requested = stackMatch[1].toLowerCase();
        const newLens = getLenses().find(
          l =>
            l.id === requested ||
            l.name.toLowerCase() === requested ||
            l.name.toLowerCase().startsWith(requested),
        );
        if (newLens && !s.activeLenses.find(l => l.id === newLens.id)) {
          s.activeLenses.push(newLens);
          s.overlay = compileLensOverlay(s.activeLenses);
          s.metrics.lensSwitches++;
          session.layouts.showTextWall(
            `Stacked: ${s.activeLenses.map(l => l.name).join(' + ')}`,
          );
          return;
        }
      }

      // ── Only process if activated ──────────────────────────────────────

      if (!s.isActivated && s.activationMode !== 'always_on') {
        return;
      }

      // Buffer the text
      s.transcriptionBuffer.push(userText);

      // In always_on and wake_word modes, process immediately
      // In tap modes, we wait for deactivation (release)
      if (s.activationMode === 'always_on' || s.activationMode === 'wake_word') {
        await this.processBuffer(s, session, sessionId);
      }
    });
  }

  // ── Activation Controls ──────────────────────────────────────────────────

  private activate(s: LensSession, session: AppSession): void {
    s.isActivated = true;
    s.transcriptionBuffer = [];
    s.metrics.activations++;

    // Subtle indicator that we're listening
    session.layouts.showTextWall(`🎙 ${s.activeLenses[s.activeLenses.length - 1].name} listening...`);
  }

  private async deactivate(s: LensSession, session: AppSession, sessionId: string): Promise<void> {
    s.isActivated = false;

    if (s.transcriptionBuffer.length > 0) {
      await this.processBuffer(s, session, sessionId);
    }
  }

  // ── Lens Controls ────────────────────────────────────────────────────────

  private switchLens(s: LensSession, newLens: Lens, session: AppSession): void {
    s.activeLenses = [newLens];
    s.overlay = compileLensOverlay(s.activeLenses);
    s.metrics.lensSwitches++;
    session.layouts.showTextWall(
      `${newLens.name}. "${newLens.tagline}"`,
    );
  }

  private cycleLens(s: LensSession, session: AppSession): void {
    const allLenses = getLenses();
    const currentId = s.activeLenses[0]?.id;
    const currentIdx = allLenses.findIndex(l => l.id === currentId);
    const nextIdx = (currentIdx + 1) % allLenses.length;
    this.switchLens(s, allLenses[nextIdx], session);
  }

  // ── Core: Process buffered speech → AI → Display ────────────────────────

  private async processBuffer(
    s: LensSession,
    session: AppSession,
    sessionId: string,
  ): Promise<void> {
    if (!s.aiProvider || s.transcriptionBuffer.length === 0) return;

    const userText = s.transcriptionBuffer.join(' ').trim();
    s.transcriptionBuffer = [];

    if (userText.length === 0) return;

    // ── Governance check: can we send to AI? ────────────────────────────

    const permCheck = s.executor.evaluate('ai_send_transcription', s.appContext);
    if (!permCheck.allowed && !permCheck.requiresConfirmation) {
      console.log(`[Lenses] Blocked: ${permCheck.verdict.reason}`);
      return;
    }

    if (permCheck.requiresConfirmation) {
      session.layouts.showTextWall('Confirm: send to AI? (tap to confirm)');
      // In a full implementation, we'd wait for user confirmation
      // For now, we proceed (MentraOS SDK handles the confirmation dialog)
    }

    // ── Build the system prompt with lens overlay ───────────────────────
    // Architecture: system prompt = lens (stable, cacheable) + constraints
    // Ambient context is injected separately — it changes every call.

    const lensNames = s.activeLenses.map(l => l.name).join(' + ');
    const systemPrompt = `${s.overlay.systemPromptAddition}

## Constraints
You are responding through smart glasses via the "${lensNames}" lens${s.activeLenses.length > 1 ? 'es' : ''}.
Keep responses under ${s.maxWords} words. The user is wearing glasses and talking to you in real life.
Be conversational. No bullet points. No markdown. No emojis. Just talk.`;

    // ── Build conversation messages (ambient + history + current) ─────
    // Ambient context goes as a prefixed user message — NOT in system prompt
    // This keeps the system prompt cacheable and ambient clearly separated.

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    // Inject ambient context if governed and available
    if (s.ambientBuffer.enabled && s.ambientBuffer.bystanderAcknowledged) {
      const ambientText = getAmbientContext(s.ambientBuffer);
      if (ambientText) {
        messages.push({
          role: 'user',
          content: `[CONTEXT — what was just said around me in the last ${Math.round(s.ambientBuffer.maxBufferSeconds / 60)} minutes. Use this to understand my situation, but don't repeat it back to me verbatim.]\n${ambientText}`,
        });
        messages.push({
          role: 'assistant',
          content: 'Got it. I have context on your situation.',
        });
        s.ambientBuffer.sends++;
        s.metrics.ambientSends++;
      }
    }

    // Add conversation history (last 3 exchanges)
    if (s.conversationHistory.length > 0) {
      messages.push(...s.conversationHistory.slice(-6));
    }

    // ── Call the user's AI ──────────────────────────────────────────────

    s.metrics.aiCalls++;

    try {
      const response = await callUserAI(s.aiProvider, systemPrompt, messages, userText, s.maxWords);

      if (response.text) {
        // Governance check: can we display?
        const displayCheck = s.executor.evaluate('display_text_wall', s.appContext);
        if (displayCheck.allowed) {
          session.layouts.showTextWall(response.text);
        }

        // Update conversation history (keep last 3 exchanges)
        s.conversationHistory.push(
          { role: 'user', content: userText },
          { role: 'assistant', content: response.text },
        );
        if (s.conversationHistory.length > 6) {
          s.conversationHistory = s.conversationHistory.slice(-6);
        }
      }
    } catch (err) {
      s.metrics.aiFailures++;
      const msg = err instanceof Error ? err.message : 'Unknown error';

      if (msg.includes('401') || msg.includes('invalid_api_key') || msg.includes('Unauthorized')) {
        session.layouts.showTextWall('API key invalid. Check Settings.');
      } else if (msg.includes('429') || msg.includes('rate_limit')) {
        session.layouts.showTextWall('Rate limited. Wait a moment.');
      } else {
        console.error(`[Lenses] AI call failed (${sessionId}):`, msg);
        session.layouts.showTextWall('Something went wrong. Try again.');
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private activationLabel(mode: ActivationMode): string {
    switch (mode) {
      case 'tap_hold': return 'Hold temple';
      case 'double_tap': return 'Double tap';
      case 'wake_word': return 'Say "Hey Lens"';
      case 'always_on': return 'Just talk';
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  protected async onStop(
    sessionId: string,
    _userId: string,
    _reason: string,
  ): Promise<void> {
    const s = sessions.get(sessionId);
    if (s) {
      // Invariant: ambient-never-persisted — destroy buffer on session end
      s.ambientBuffer.entries = [];

      const duration = Math.round((Date.now() - s.metrics.sessionStart) / 1000);
      console.log(
        `[Lenses] Session ${sessionId} ended after ${duration}s — ` +
        `${s.metrics.activations} activations, ${s.metrics.aiCalls} AI calls, ` +
        `${s.metrics.lensSwitches} lens switches, ${s.metrics.ambientSends} ambient sends`,
      );
    }
    sessions.delete(sessionId);
  }
}

// ─── Health Check + Start ────────────────────────────────────────────────────

const app = new LensesApp({
  packageName: APP_ID,
  apiKey: process.env.MENTRA_APP_API_KEY ?? '',
  port: Number(process.env.PORT) || 3000,
});

app.start();
console.log(`[Lenses] App server running on port ${Number(process.env.PORT) || 3000}`);
console.log(`[Lenses] Available lenses: ${getLenses().map(l => l.name).join(', ')}`);
console.log(`[Lenses] Governance: platform world loaded, app world ${loadAppWorld() ? 'loaded' : 'skipped'}`);
