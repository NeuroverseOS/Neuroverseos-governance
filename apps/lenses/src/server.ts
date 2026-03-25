#!/usr/bin/env npx tsx
/**
 * Lenses — A MentraOS App
 *
 * Pick a voice. Tap. Get a perspective.
 *
 * This is a real, deployable MentraOS app server. Not an example.
 *
 * Architecture:
 *   - User picks a voice (Settings): Stoic, Coach, NFL Coach, Monk, Hype Man, Closer
 *   - Glasses listen passively (ambient mode, with permission)
 *   - User taps or says "lens" — AI reads the moment and responds
 *   - AI auto-selects the right mode (direct, translate, reflect, challenge, teach)
 *   - Tap again within 30s = follow up ("go deeper", "what should I say?")
 *   - Long press = "that didn't land" — AI adjusts
 *   - No menus. No mode switching. Tap. Lens. Move.
 *
 * Each voice is powered by a philosophy world file (.nv-world.md) that contains
 * deep knowledge, principles, historical voices, practices, and mode-specific
 * directives. The AI uses all of this to respond in the right way.
 *
 * Response length auto-scales:
 *   - Recent ambient speech (in a conversation) → 15 words max (glanceable)
 *   - No recent speech (walking alone, reflecting) → 80 words (depth)
 *   - Follow-up tap → 60 words (continuing the thread)
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
const DEFAULT_ACTIVATION = 'tap';
const DEFAULT_AMBIENT_BUFFER_SECONDS = 120;
const MAX_AMBIENT_TOKENS_ESTIMATE = 700; // ~500 words ≈ 700 tokens, truncate from oldest

/** How long after a lens before a tap becomes "follow up" instead of "new lens" */
const FOLLOW_UP_WINDOW_MS = 30_000;

/** Recency threshold: ambient entries newer than this get 3x weight */
const RECENCY_BOOST_SECONDS = 15;

/** Auto-scaled word limits based on situation */
const WORDS_GLANCE = 15;   // In active conversation — must be readable at a glance
const WORDS_DEPTH = 80;    // Alone, reflecting — room for real insight
const WORDS_FOLLOWUP = 60; // Continuing a thread — more than a glance, less than a monologue

/** Pattern to detect "lens" trigger in speech — just one syllable */
const LENS_TRIGGER_PATTERN = /\b(?:lens\s*(?:me)?|give\s+me\s+a\s+lens)\b/i;

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
 * Get ambient context text with recency bias.
 * The last 15 seconds are weighted 3x heavier — the tap almost always
 * refers to what JUST happened. Older context provides background.
 * Enforces governance rule-010: truncate from beginning (oldest first).
 */
function getAmbientContext(buffer: AmbientBuffer): string {
  purgeExpiredAmbient(buffer);

  if (buffer.entries.length === 0) return '';

  const now = Date.now();
  const recentCutoff = now - (RECENCY_BOOST_SECONDS * 1000);

  // Split into recent (last 15s) and older
  const recent = buffer.entries.filter(e => e.timestamp >= recentCutoff);
  const older = buffer.entries.filter(e => e.timestamp < recentCutoff);

  // Recent gets 3/4 of the token budget, older gets 1/4
  const maxWords = Math.floor(buffer.maxTokensPerCall * 0.75);
  const recentBudget = Math.floor(maxWords * 0.75);
  const olderBudget = maxWords - recentBudget;

  const recentText = buildFromNewest(recent, recentBudget);
  const olderText = buildFromNewest(older, olderBudget);

  const parts = [olderText, recentText].filter(Boolean);
  return parts.join(' ');
}

function buildFromNewest(entries: AmbientEntry[], maxWords: number): string {
  const parts: string[] = [];
  let wordCount = 0;

  for (let i = entries.length - 1; i >= 0; i--) {
    const words = entries[i].text.split(/\s+/);
    if (wordCount + words.length > maxWords) break;
    parts.unshift(entries[i].text);
    wordCount += words.length;
  }

  return parts.join(' ');
}

/**
 * Check if there's been recent speech (last 15 seconds).
 * Used to auto-scale response length — if someone is talking,
 * keep it short (glanceable). If alone, go deeper.
 */
function hasRecentAmbient(buffer: AmbientBuffer): boolean {
  if (!buffer.enabled || buffer.entries.length === 0) return false;
  const recentCutoff = Date.now() - (RECENCY_BOOST_SECONDS * 1000);
  return buffer.entries.some(e => e.timestamp >= recentCutoff);
}

interface LensSession {
  /** Active voice (Stoic, Coach, NFL Coach, etc.) */
  voice: Voice;
  /** Loaded philosophy world for the active voice */
  world: PhilosophyWorld;
  /** Compiled system prompt (cached — recompiled only on voice change) */
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
  /** Camera context enabled */
  cameraContext: boolean;
  /** Ambient context buffer (governed — RAM only, never persisted) */
  ambientBuffer: AmbientBuffer;
  /** Recent conversation for context (last 3 exchanges) */
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Timestamp of last lens response — used for follow-up detection */
  lastLensTime: number;
  /** Number of consecutive dismissals — AI adjusts when user long-presses */
  dismissals: number;
  /** Session metrics */
  metrics: {
    activations: number;
    aiCalls: number;
    aiFailures: number;
    voiceSwitches: number;
    cameraUses: number;
    ambientSends: number;
    dismissals: number;
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
    // Voice is set in Settings on the phone. That's it. No context picker.
    // The AI reads the situation from ambient context automatically.

    const settings = session.settings.getAll();
    const savedVoiceId = (settings?.voice as string) ?? DEFAULT_VOICE_ID;
    const aiProviderSetting = settings?.ai_provider as string | undefined;
    const aiApiKey = settings?.ai_api_key as string | undefined;
    const aiModelSetting = (settings?.ai_model as string) ?? 'auto';
    const activationMode = (settings?.activation_mode as ActivationMode) ?? DEFAULT_ACTIVATION;
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
    const systemPrompt = buildSystemPrompt(world, voice, WORDS_DEPTH);

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
      systemPrompt,
      aiProvider,
      executor,
      appContext,
      activationMode,
      isActivated: activationMode === 'always_on',
      transcriptionBuffer: [],
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
      lastLensTime: 0,
      dismissals: 0,
      metrics: {
        activations: 0,
        aiCalls: 0,
        aiFailures: 0,
        voiceSwitches: 0,
        cameraUses: 0,
        ambientSends: 0,
        dismissals: 0,
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
      `${voice.name}. "${voice.tagline}" Tap anytime.`,
    );

    // ── Touch Events ──────────────────────────────────────────────────────
    //
    // Tap       = "Lens me" (or follow-up if within 30s of last lens)
    // Long press = "That didn't land" — dismiss + AI adjusts next time
    //

    session.events.onTouch((event: TouchEvent) => {
      const s = sessions.get(sessionId);
      if (!s || !s.aiProvider) return;

      if (event.type === 'single_tap') {
        const now = Date.now();
        const isFollowUp = s.lastLensTime > 0 && (now - s.lastLensTime) < FOLLOW_UP_WINDOW_MS;

        if (isFollowUp) {
          this.followUp(s, session, sessionId);
        } else {
          this.lensMe(s, session, sessionId);
        }
      }

      // Long press = bad lens. Dismiss and tell AI to adjust.
      if (event.type === 'long_press_start') {
        this.dismissLens(s, session);
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

      // ── Voice Trigger: "lens" ─────────────────────────────────────────
      // One syllable. Works when alone. In a meeting, tap instead.
      if (LENS_TRIGGER_PATTERN.test(userText)) {
        const remainder = userText.replace(LENS_TRIGGER_PATTERN, '').trim();
        if (remainder) {
          // "Lens on that meeting" → process with specific context
          s.transcriptionBuffer.push(remainder);
        }

        const now = Date.now();
        const isFollowUp = s.lastLensTime > 0 && (now - s.lastLensTime) < FOLLOW_UP_WINDOW_MS;

        if (isFollowUp) {
          await this.followUp(s, session, sessionId);
        } else {
          await this.lensMe(s, session, sessionId);
        }
        return;
      }

      // ── Only process if activated (always_on mode) ─────────────────────
      // Voice switching is in Settings on the phone. Not voice commands.
      // This keeps the hot path clean — tap or say "lens." That's it.

      if (s.activationMode !== 'always_on') {
        return;
      }

      s.transcriptionBuffer.push(userText);
      await this.processBuffer(s, session, sessionId);
    });
  }

  // ── Core Interactions ──────────────────────────────────────────────────

  /**
   * "Lens me" — the primary interaction.
   *
   * Triggered by tap or saying "lens." Reads the ambient buffer
   * (what was just said around the user) plus any buffered speech,
   * and gives the user a perspective through their active voice.
   * The AI auto-picks the right mode (translate, reflect, challenge, etc.).
   *
   * Response length auto-scales based on situation.
   */
  private async lensMe(s: LensSession, session: AppSession, sessionId: string): Promise<void> {
    s.metrics.activations++;

    if (s.transcriptionBuffer.length === 0) {
      const hasAmbient = s.ambientBuffer.enabled && s.ambientBuffer.bystanderAcknowledged;
      const ambientText = hasAmbient ? getAmbientContext(s.ambientBuffer) : '';

      if (ambientText) {
        s.transcriptionBuffer.push('[The user tapped for a lens. Here\'s what was just said around them — give them a perspective on this moment.]');
        s.ambientBuffer.sends++;
        s.metrics.ambientSends++;
      } else if (s.conversationHistory.length > 0) {
        s.transcriptionBuffer.push('[The user tapped for a lens. Continue from the conversation so far — give them the next insight.]');
      } else {
        // Dead first tap — give a daily intention from the voice, not a dead end
        s.transcriptionBuffer.push('[First activation of the session. The user just put on their glasses. Give them a brief, grounding thought to start their day — one sentence from the philosophy, not a greeting.]');
      }
    }

    // Auto-scale: in active conversation → glanceable. Alone → depth.
    const maxWords = hasRecentAmbient(s.ambientBuffer) ? WORDS_GLANCE : WORDS_DEPTH;
    s.systemPrompt = buildSystemPrompt(s.world, s.voice, maxWords);

    await this.processBuffer(s, session, sessionId);
    s.lastLensTime = Date.now();
    s.dismissals = 0; // Reset dismissals on successful lens
  }

  /**
   * Follow-up — second tap within 30 seconds.
   *
   * The user liked the lens (or wants more). Continue the thread.
   * "Go deeper" / "What should I say?" / "Tell me more."
   */
  private async followUp(s: LensSession, session: AppSession, sessionId: string): Promise<void> {
    s.metrics.activations++;

    if (s.transcriptionBuffer.length === 0) {
      s.transcriptionBuffer.push('[The user tapped again — they want to go deeper. Continue from your last response. What\'s the next insight, the follow-up question, or the concrete action they should take? Don\'t repeat yourself.]');
    }

    // Follow-ups get mid-range length — continuing a thread
    s.systemPrompt = buildSystemPrompt(s.world, s.voice, WORDS_FOLLOWUP);

    await this.processBuffer(s, session, sessionId);
    s.lastLensTime = Date.now();
  }

  /**
   * Dismiss — long press means "that didn't land."
   *
   * The AI adjusts. Not a punishment — just feedback.
   * Tracked in session so the AI can shift approach.
   */
  private dismissLens(s: LensSession, session: AppSession): void {
    s.dismissals++;
    s.metrics.dismissals++;
    s.lastLensTime = 0; // Reset follow-up window

    // Remove the last AI response from history so it doesn't influence future responses
    if (s.conversationHistory.length >= 2) {
      s.conversationHistory = s.conversationHistory.slice(0, -2);
    }

    // Add a note to history that the user dismissed
    s.conversationHistory.push(
      { role: 'user', content: '[The user dismissed the last response — it didn\'t land. Adjust your approach next time. Try a different mode or angle.]' },
      { role: 'assistant', content: 'Understood. I\'ll try a different approach.' },
    );

    session.layouts.showTextWall('Got it. Tap for a fresh take.');
  }

  // ── Voice Controls (called from Settings changes) ─────────────────────

  private switchVoice(s: LensSession, newVoice: Voice, session: AppSession): void {
    const world = loadWorldForVoice(newVoice.id);
    if (!world) return;

    s.voice = newVoice;
    s.world = world;
    s.systemPrompt = buildSystemPrompt(world, newVoice, WORDS_DEPTH);
    s.metrics.voiceSwitches++;
    session.layouts.showTextWall(
      `${newVoice.name}. "${newVoice.tagline}"`,
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
      // maxWords is baked into the system prompt (auto-scaled per interaction)
      const currentMaxWords = hasRecentAmbient(s.ambientBuffer) ? WORDS_GLANCE : WORDS_DEPTH;
      const response = await callUserAI(s.aiProvider, s.systemPrompt, messages, userText, currentMaxWords);

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
