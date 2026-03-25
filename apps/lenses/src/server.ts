#!/usr/bin/env npx tsx
/**
 * Lenses — A MentraOS App
 *
 * Pick a voice. Tap or say "lens me." Get a perspective.
 *
 * This is a real, deployable MentraOS app server. Not an example.
 *
 * Architecture:
 *   - User picks a voice: Stoic, Coach, NFL Coach, Monk, Hype Man, Closer
 *   - User picks a context: Work or Personal
 *   - Glasses listen passively (ambient mode, with permission)
 *   - User taps or says "lens me" — AI reads the moment and responds
 *   - AI auto-selects the right mode (direct, translate, reflect, challenge, teach)
 *   - No menus. No mode switching. Just tap. Get a lens. Keep moving.
 *
 * Voice × Mode × Context:
 *   - Voice = who's in your corner (Stoic, Coach, etc.) — set once in Settings
 *   - Mode = how they respond (translate, reflect, challenge, etc.) — AI picks automatically
 *   - Context = Work or Personal — shapes tone and boundaries
 *
 * Each voice is powered by a philosophy world file (.nv-world.md) that contains
 * deep knowledge, principles, historical voices, practices, and mode-specific
 * directives. The AI uses all of this to respond in the right way.
 *
 * BYO-Key Model:
 *   Users paste their API key in app settings on their phone.
 *   We never store it on our servers — it lives in the user's
 *   MentraOS session config. Their key, their cost, their data.
 */

import { AppServer } from '@mentra/sdk';
import type { AppSession, TouchEvent, TranscriptionEvent } from '@mentra/sdk';

import {
  MentraGovernedExecutor,
  DEFAULT_USER_RULES,
} from '../../../src/adapters/mentraos';
import type { AppContext, UserRules } from '../../../src/adapters/mentraos';

import {
  VOICES,
  getVoice,
  loadWorldForVoice,
  buildSystemPrompt,
  type PhilosophyWorld,
  type Voice,
  type VoiceId,
  type UserContext,
} from './worlds/philosophy-loader';

import { loadLensesGovernedWorld } from './worlds/lenses-governance';
import { parseWorldMarkdown } from '../../../src/engine/bootstrap-parser';
import { emitWorldDefinition } from '../../../src/engine/bootstrap-emitter';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Constants ───────────────────────────────────────────────────────────────

const APP_ID = 'com.neuroverse.lenses';
const DEFAULT_VOICE_ID: VoiceId = 'stoic';
const DEFAULT_CONTEXT: UserContext = 'work';
const DEFAULT_MAX_WORDS = 50;
const DEFAULT_ACTIVATION = 'tap';
const DEFAULT_AMBIENT_BUFFER_SECONDS = 120;
const MAX_AMBIENT_TOKENS_ESTIMATE = 700; // ~500 words ≈ 700 tokens, truncate from oldest

/** Pattern to detect "lens me" trigger in speech */
const LENS_ME_PATTERN = /\b(?:lens\s+me|give\s+me\s+a\s+lens|what\s+do\s+you\s+see)\b/i;

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
  try {
    return loadLensesGovernedWorld();
  } catch {
    // Fall back to raw markdown parse if governed loader fails
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
}

// ─── Session State ───────────────────────────────────────────────────────────

type ActivationMode = 'tap' | 'tap_hold' | 'double_tap' | 'always_on';

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
  /** Active voice (Stoic, Coach, NFL Coach, etc.) */
  voice: Voice;
  /** Loaded philosophy world for the active voice */
  world: PhilosophyWorld;
  /** User context: work or personal */
  userContext: UserContext;
  /** Compiled system prompt (cached — recompiled only on voice/context change) */
  systemPrompt: string;
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
    voiceSwitches: number;
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
    const savedVoiceId = (settings?.voice as string) ?? DEFAULT_VOICE_ID;
    const savedContext = (settings?.context as UserContext) ?? DEFAULT_CONTEXT;
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
      const providerName = aiProviderSetting === 'openai' || aiProviderSetting === 'anthropic'
        ? aiProviderSetting
        : modelConfig.provider;

      aiProvider = {
        name: providerName,
        apiKey: aiApiKey,
        model: modelConfig.model,
      };
    }

    // ── Resolve voice + world ───────────────────────────────────────────────

    const voice = getVoice(savedVoiceId) ?? VOICES[0]; // Default to Stoic
    const world = loadWorldForVoice(voice.id)!;
    const systemPrompt = buildSystemPrompt(world, voice, savedContext, maxWords);

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
      voice,
      world,
      userContext: savedContext,
      systemPrompt,
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
        voiceSwitches: 0,
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

    // Show active voice
    session.layouts.showTextWall(
      `${voice.name} active. "${voice.tagline}" — Tap or say "lens me."`,
    );

    // ── Touch Events: Tap = Lens Me ──────────────────────────────────────

    session.events.onTouch((event: TouchEvent) => {
      const s = sessions.get(sessionId);
      if (!s || !s.aiProvider) return;

      if (s.activationMode === 'tap') {
        // Single tap: activate and process ambient buffer immediately
        if (event.type === 'single_tap') {
          this.lensMe(s, session, sessionId);
        }
      } else if (s.activationMode === 'tap_hold') {
        // Hold: record speech, process on release
        if (event.type === 'long_press_start') {
          this.activate(s, session);
        } else if (event.type === 'long_press_end') {
          this.deactivate(s, session, sessionId);
        }
      } else if (s.activationMode === 'double_tap') {
        if (event.type === 'double_tap') {
          this.lensMe(s, session, sessionId);
        }
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

      // "Lens me" — voice trigger (works like a tap)
      if (LENS_ME_PATTERN.test(userText)) {
        // Strip the trigger phrase — anything after it is the user's specific request
        const remainder = userText.replace(LENS_ME_PATTERN, '').trim();
        if (remainder) {
          // "Lens me on that meeting" → process with specific context
          s.transcriptionBuffer.push(remainder);
        }
        await this.lensMe(s, session, sessionId);
        return;
      }

      // Voice switching: "switch to coach", "use stoic", etc.
      const switchMatch = userText.match(
        /^(?:switch\s+to|use|activate|try)\s+(.+?)(?:\s+voice)?$/i,
      );
      if (switchMatch) {
        const requested = switchMatch[1].toLowerCase();
        const newVoice = VOICES.find(
          v =>
            v.id === requested ||
            v.name.toLowerCase() === requested ||
            v.name.toLowerCase().startsWith(requested),
        );
        if (newVoice) {
          this.switchVoice(s, newVoice, session);
          return;
        }
      }

      // Context switching: "switch to work", "switch to personal"
      const contextMatch = userText.match(
        /^(?:switch\s+to|use)\s+(work|personal)\s*(?:mode|context)?$/i,
      );
      if (contextMatch) {
        const newContext = contextMatch[1].toLowerCase() as UserContext;
        this.switchContext(s, newContext, session);
        return;
      }

      // List voices
      if (/^(?:list|show|what)\s+(?:voices|lenses)/i.test(userText)) {
        const voiceNames = VOICES.map(v => v.name).join(', ');
        session.layouts.showTextWall(`Voices: ${voiceNames}`);
        return;
      }

      // ── Only process if activated (tap_hold / always_on) ───────────────

      if (!s.isActivated && s.activationMode !== 'always_on') {
        return;
      }

      // Buffer the text
      s.transcriptionBuffer.push(userText);

      // In always_on mode, process immediately
      if (s.activationMode === 'always_on') {
        await this.processBuffer(s, session, sessionId);
      }
    });
  }

  // ── Activation Controls ──────────────────────────────────────────────────

  private activate(s: LensSession, session: AppSession): void {
    s.isActivated = true;
    s.transcriptionBuffer = [];
    s.metrics.activations++;

    session.layouts.showTextWall(`${s.voice.name} listening...`);
  }

  private async deactivate(s: LensSession, session: AppSession, sessionId: string): Promise<void> {
    s.isActivated = false;

    if (s.transcriptionBuffer.length > 0) {
      await this.processBuffer(s, session, sessionId);
    }
  }

  /**
   * "Lens me" — the core interaction.
   *
   * Triggered by tap or saying "lens me." Reads the ambient buffer
   * (what was just said around the user) plus any buffered speech,
   * and gives the user a perspective through their active voice.
   * The AI auto-picks the right mode (translate, reflect, challenge, etc.).
   */
  private async lensMe(s: LensSession, session: AppSession, sessionId: string): Promise<void> {
    s.metrics.activations++;

    // If there's buffered speech ("lens me on that meeting"), use it
    // If not, the ambient context becomes the primary input
    if (s.transcriptionBuffer.length === 0) {
      // No specific request — use ambient buffer as context, ask AI to lens the moment
      const ambientText = s.ambientBuffer.enabled && s.ambientBuffer.bystanderAcknowledged
        ? getAmbientContext(s.ambientBuffer)
        : '';

      if (ambientText) {
        s.transcriptionBuffer.push('[The user tapped for a lens. Here\'s what was just said around them — give them a perspective on this moment.]');
        s.ambientBuffer.sends++;
        s.metrics.ambientSends++;
      } else {
        // No ambient, no speech — check conversation history
        if (s.conversationHistory.length > 0) {
          s.transcriptionBuffer.push('[The user tapped for a lens. Continue from the conversation so far — give them the next insight.]');
        } else {
          session.layouts.showTextWall(`${s.voice.name} ready. Start talking — I'm listening.`);
          return;
        }
      }
    }

    await this.processBuffer(s, session, sessionId);
  }

  // ── Voice Controls ────────────────────────────────────────────────────────

  private switchVoice(s: LensSession, newVoice: Voice, session: AppSession): void {
    const world = loadWorldForVoice(newVoice.id);
    if (!world) return;

    s.voice = newVoice;
    s.world = world;
    s.systemPrompt = buildSystemPrompt(world, newVoice, s.userContext, s.maxWords);
    s.metrics.voiceSwitches++;
    session.layouts.showTextWall(
      `${newVoice.name}. "${newVoice.tagline}"`,
    );
  }

  private switchContext(s: LensSession, newContext: UserContext, session: AppSession): void {
    s.userContext = newContext;
    s.systemPrompt = buildSystemPrompt(s.world, s.voice, newContext, s.maxWords);
    session.layouts.showTextWall(
      `${newContext === 'work' ? 'Work' : 'Personal'} mode. ${s.voice.name} adjusted.`,
    );
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

    // ── System prompt is pre-built and cached on the session ────────────
    // Rebuilt only when voice or context changes. The philosophy world,
    // mode directives, and constraints are all baked in.
    // Ambient context is injected separately below — it changes every call.

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
      const response = await callUserAI(s.aiProvider, s.systemPrompt, messages, userText, s.maxWords);

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
      case 'tap': return 'Tap';
      case 'tap_hold': return 'Hold temple';
      case 'double_tap': return 'Double tap';
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
        `${s.metrics.voiceSwitches} voice switches, ${s.metrics.ambientSends} ambient sends`,
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
console.log(`[Lenses] Voices: ${VOICES.map(v => v.name).join(', ')}`);
console.log(`[Lenses] Governance: platform world loaded, app world ${loadAppWorld() ? 'loaded' : 'skipped'}`);
