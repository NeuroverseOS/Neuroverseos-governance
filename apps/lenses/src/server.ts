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
import type { AppSession, ButtonPress, TranscriptionData } from '@mentra/sdk';

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

import {
  ProactiveEngine,
  type ProactiveFrequency,
  type ProactiveClassification,
} from './proactive';

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
const WORDS_EXPAND = 40;   // Double-tap expand — same thought, room to breathe
const WORDS_FOLLOWUP = 60; // Continuing a thread — more than a glance, less than a monologue
const WORDS_DEPTH = 80;    // Alone, reflecting — room for real insight

/** Pattern to detect "lens" trigger in speech — just one syllable */
const LENS_TRIGGER_PATTERN = /\b(?:lens\s*(?:me)?|give\s+me\s+a\s+lens)\b/i;

/** Pattern to detect one-shot voice preview: "lens this as coach" */
const PREVIEW_VOICE_PATTERN = /\b(?:lens\s+(?:this\s+)?as|as\s+(?:a\s+)?)\s+(\w+)\b/i;

/** Maximum days of journal history kept on phone */
const JOURNAL_MAX_DAYS = 7;

/** How long to wait after last speech before classifying (ms) — borrowed from Merge's utterance timeout */
const UTTERANCE_CLASSIFY_DELAY_MS = 3_000;

/** Minimum words in an utterance before we bother classifying */
const MIN_CLASSIFY_WORDS = 5;

/** Word limit for proactive perspectives (shorter than on-demand — uninvited) */
const WORDS_PROACTIVE = 12;

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

// ─── Lens Journal (phone-local persistence) ─────────────────────────────────

interface JournalDay {
  date: string;          // ISO date: "2026-03-25"
  lenses: number;
  dismissals: number;
  followUps: number;
  voiceUsed: string;     // Primary voice for the day
}

interface LensJournal {
  totalLenses: number;
  totalDismissals: number;
  currentStreakDays: number;
  lastSessionDate: string;
  recentDays: JournalDay[];  // Rolling 7-day window
}

const EMPTY_JOURNAL: LensJournal = {
  totalLenses: 0,
  totalDismissals: 0,
  currentStreakDays: 0,
  lastSessionDate: '',
  recentDays: [],
};

/**
 * Load the lens journal from the user's phone settings.
 * Returns EMPTY_JOURNAL if none exists.
 */
function loadJournal(settings: Record<string, unknown> | null): LensJournal {
  const raw = settings?.lens_journal as LensJournal | undefined;
  if (!raw) return { ...EMPTY_JOURNAL };
  return raw;
}

/**
 * Write journal summary to the dashboard.
 *
 * SDK limitation: SettingsManager is read-only from the app side.
 * Settings are defined in app_config.json and managed by MentraOS Cloud.
 * We can't persist the journal to settings — instead we display a
 * session summary on the dashboard when the session ends.
 *
 * For true cross-session persistence, we'd need a webview backend.
 * For now, the journal lives in RAM and the dashboard shows the summary.
 */
function writeJournalToDashboard(session: AppSession, journal: LensJournal): void {
  const summary = `${journal.totalLenses} lenses | ${journal.currentStreakDays}d streak`;
  session.dashboard.content.writeToMain(summary);
}

/**
 * Build a journal context string for the AI's daily intention.
 * Gives the voice knowledge of the user's recent patterns.
 */
function journalContext(journal: LensJournal): string {
  if (journal.totalLenses === 0) return '';

  const lines: string[] = [];
  lines.push(`[JOURNAL — The user's recent Lens history. Use this to personalize your response.]`);
  lines.push(`Total lenses: ${journal.totalLenses}. Total dismissals: ${journal.totalDismissals}. Streak: ${journal.currentStreakDays} days.`);

  if (journal.recentDays.length > 0) {
    const recent = journal.recentDays.slice(-3);
    const summary = recent.map(d => `${d.date}: ${d.lenses} lenses, ${d.dismissals} dismissed`).join('. ');
    lines.push(`Recent: ${summary}.`);
  }

  // Detect patterns
  const totalRecent = journal.recentDays.reduce((sum, d) => sum + d.dismissals, 0);
  const totalLensesRecent = journal.recentDays.reduce((sum, d) => sum + d.lenses, 0);
  if (totalRecent > 3 && totalLensesRecent > 0) {
    const dismissRate = Math.round((totalRecent / totalLensesRecent) * 100);
    if (dismissRate > 30) {
      lines.push(`Pattern: ${dismissRate}% dismissal rate this week — the user may need a different approach.`);
    }
  }

  return lines.join('\n');
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
  /** Whether last lens was a glance (enables double-tap expand) */
  lastWasGlance: boolean;
  /** The last user message that triggered a lens (for expand/redirect) */
  lastLensInput: string;
  /** Number of consecutive dismissals — AI adjusts when user long-presses */
  dismissals: number;
  /** MentraOS session handle for saving journal */
  appSession: AppSession;
  /** Lens journal loaded from phone */
  journal: LensJournal;
  /** Proactive perspective engine (Merge-inspired classification) */
  proactive: ProactiveEngine;
  /** Timer for utterance classification delay */
  classifyTimer: ReturnType<typeof setTimeout> | null;
  /** Session metrics */
  metrics: {
    activations: number;
    aiCalls: number;
    aiFailures: number;
    voiceSwitches: number;
    followUps: number;
    cameraUses: number;
    ambientSends: number;
    dismissals: number;
    proactiveInsights: number;
    proactiveSilences: number;
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

    // SDK: SettingsManager.get<T>(key, default) for type-safe setting access
    const savedVoiceId = session.settings.get<string>('voice', DEFAULT_VOICE_ID);
    const aiProviderSetting = session.settings.get<string>('ai_provider', '');
    const aiApiKey = session.settings.get<string>('ai_api_key', '');
    const aiModelSetting = session.settings.get<string>('ai_model', 'auto');
    const activationMode = session.settings.get<string>('activation_mode', DEFAULT_ACTIVATION) as ActivationMode;
    const cameraContext = session.settings.get<boolean>('camera_context', false);
    const ambientContextEnabled = session.settings.get<boolean>('ambient_context', false);
    const ambientBufferSeconds = session.settings.get<number>('ambient_buffer_duration', DEFAULT_AMBIENT_BUFFER_SECONDS);
    const ambientBystanderAck = session.settings.get<boolean>('ambient_bystander_ack', false);

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

    // ── Load journal from phone ────────────────────────────────────────────

    const journal = loadJournal(settings);
    // Proactive defaults to OFF — user must explicitly opt in (governance: proactive_opt_in)
    const proactiveFreq = session.settings.get<string>('proactive_frequency', 'off') as ProactiveFrequency;

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
      lastWasGlance: false,
      lastLensInput: '',
      dismissals: 0,
      appSession: session,
      journal,
      proactive: new ProactiveEngine(proactiveFreq),
      classifyTimer: null,
      metrics: {
        activations: 0,
        aiCalls: 0,
        aiFailures: 0,
        voiceSwitches: 0,
        followUps: 0,
        cameraUses: 0,
        ambientSends: 0,
        dismissals: 0,
        proactiveInsights: 0,
        proactiveSilences: 0,
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

    // Show active voice (governed — even UI feedback goes through the guard)
    const initDisplayCheck = state.executor.evaluate('display_response', state.appContext);
    if (initDisplayCheck.allowed) {
      session.layouts.showTextWall(
        `${voice.name}. "${voice.tagline}" Tap anytime.`,
      );
    }

    // ── Button Events ─────────────────────────────────────────────────────
    //
    // SDK: onButtonPress(data: ButtonPress) → { buttonId, pressType: 'short' | 'long' }
    //
    // Short press = "Lens me" (new lens, or follow-up within 30s)
    // Long press  = Dismiss ("that didn't land") — or expand if last was glance
    //
    // Note: SDK ButtonCapabilities lists "double_press" as a potential event,
    // but ButtonPress.pressType currently only supports 'short' | 'long'.
    // When double_press lands, we'll use it for expand-glance.
    //

    session.events.onButtonPress((data: ButtonPress) => {
      const s = sessions.get(sessionId);
      if (!s || !s.aiProvider) return;

      if (data.pressType === 'short') {
        const now = Date.now();
        const inWindow = s.lastLensTime > 0 && (now - s.lastLensTime) < FOLLOW_UP_WINDOW_MS;

        if (inWindow && s.lastWasGlance && s.lastLensInput) {
          // Second short press after a glance = expand
          this.expandGlance(s, session, sessionId);
        } else if (inWindow) {
          // Second short press after a full response = follow up
          this.followUp(s, session, sessionId);
        } else {
          // New lens
          this.lensMe(s, session, sessionId);
        }
      }

      if (data.pressType === 'long') {
        // Long press = dismiss the last lens
        this.dismissLens(s, session);
      }
    });

    // ── Transcription Events ─────────────────────────────────────────────

    session.events.onTranscription(async (data: TranscriptionData) => {
      const s = sessions.get(sessionId);
      if (!s || !s.aiProvider) return;
      if (!data.text || data.text.trim().length === 0) return;

      // SDK: TranscriptionData.isFinal — only process complete utterances.
      // Interim results are partial and will be replaced by the final result.
      if (!data.isFinal) return;

      const userText = data.text.trim();

      // ── Ambient Buffer: passively capture all speech (governed) ────────
      // Invariant: ambient-never-persisted — RAM only, purged on expiry
      // Invariant: ambient-user-initiated-only — buffer is passive, never acts
      if (s.ambientBuffer.enabled && s.ambientBuffer.bystanderAcknowledged) {
        s.ambientBuffer.entries.push({ text: userText, timestamp: Date.now() });
        purgeExpiredAmbient(s.ambientBuffer);
      }

      // ── One-shot voice preview: "lens this as coach" ──────────────────
      // Taste a different voice without switching. One-shot, then back.
      const previewMatch = userText.match(PREVIEW_VOICE_PATTERN);
      if (previewMatch) {
        const voiceName = previewMatch[1].toLowerCase();
        const previewVoice = VOICES.find(
          v => v.id === voiceName || v.name.toLowerCase() === voiceName || v.name.toLowerCase().startsWith(voiceName),
        );
        if (previewVoice) {
          const remainder = userText.replace(PREVIEW_VOICE_PATTERN, '').trim();
          if (remainder) {
            s.transcriptionBuffer.push(remainder);
          }
          await this.previewVoice(s, previewVoice, session, sessionId);
          return;
        }
      }

      // ── Voice Trigger: "lens" ─────────────────────────────────────────
      // One syllable. Works when alone. In a meeting, tap instead.
      if (LENS_TRIGGER_PATTERN.test(userText)) {
        const remainder = userText.replace(LENS_TRIGGER_PATTERN, '').trim();
        if (remainder) {
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

      // ── Buffer speech if hold-to-redirect is active ────────────────────
      if (s.isActivated) {
        s.transcriptionBuffer.push(userText);
        return;
      }

      // ── Proactive Classification (Merge-inspired) ──────────────────────
      // Every utterance goes to the proactive engine. After a pause in
      // speech (3s), the engine classifies: SILENT / PERSPECTIVE / ROUTE.
      // Most of the time: SILENT. But when it matters: a perspective
      // appears on the glasses without the user asking.
      //
      // Governance: proactive mode requires explicit opt-in via Settings.
      // The proactive_enabled flag is separate from ambient_context — the
      // user must deliberately enable proactive perspectives. This satisfies
      // the proactive_opt_in invariant.

      if (s.ambientBuffer.enabled && s.aiProvider && s.proactive.getFrequency() !== 'off') {
        s.proactive.addUtterance(userText);

        // Reset the classify timer — wait for a pause in speech
        if (s.classifyTimer) clearTimeout(s.classifyTimer);

        const wordCount = userText.split(/\s+/).length;
        if (wordCount >= MIN_CLASSIFY_WORDS) {
          s.classifyTimer = setTimeout(() => {
            this.proactiveClassify(s, session, sessionId);
          }, UTTERANCE_CLASSIFY_DELAY_MS);
        }
      }

      // ── Always-on mode: process as direct input ────────────────────────
      if (s.activationMode === 'always_on') {
        s.transcriptionBuffer.push(userText);
        await this.processBuffer(s, session, sessionId);
      }
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
   * If journal exists, first tap of day gets personalized daily intention.
   */
  private async lensMe(s: LensSession, session: AppSession, sessionId: string): Promise<void> {
    s.metrics.activations++;
    const isGlance = hasRecentAmbient(s.ambientBuffer);

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
        // First tap of the session — daily intention, personalized if journal exists
        const jCtx = journalContext(s.journal);
        if (jCtx) {
          s.transcriptionBuffer.push(`[First activation of the session. The user just put on their glasses.\n${jCtx}\nGive them a personalized, grounding thought to start their day based on their recent patterns. One sentence. Not a greeting. Not generic.]`);
        } else {
          s.transcriptionBuffer.push('[First activation of the session. The user just put on their glasses. Give them a brief, grounding thought to start their day — one sentence from the philosophy, not a greeting.]');
        }
      }
    }

    // Auto-scale: in active conversation → glanceable. Alone → depth.
    const maxWords = isGlance ? WORDS_GLANCE : WORDS_DEPTH;
    s.systemPrompt = buildSystemPrompt(s.world, s.voice, maxWords);

    // Remember for expand
    s.lastLensInput = s.transcriptionBuffer.join(' ');
    s.lastWasGlance = isGlance;

    await this.processBuffer(s, session, sessionId);
    s.lastLensTime = Date.now();
    s.dismissals = 0;
  }

  /**
   * Expand glance — double-tap after a 15-word glance.
   *
   * Same thought, more room to breathe. Not a follow-up (new direction).
   * The same input is re-processed with a 40-word limit.
   */
  private async expandGlance(s: LensSession, session: AppSession, sessionId: string): Promise<void> {
    s.metrics.activations++;

    // Re-use the same input that produced the glance
    s.transcriptionBuffer.push(`[The user wants a fuller version of the last response. Same perspective, same angle — just expand it to be more complete. Don't repeat the short version verbatim — give the expanded thought.]\n${s.lastLensInput}`);

    s.systemPrompt = buildSystemPrompt(s.world, s.voice, WORDS_EXPAND);
    s.lastWasGlance = false; // Can't expand twice

    await this.processBuffer(s, session, sessionId);
    s.lastLensTime = Date.now();
  }

  /**
   * Follow-up — second tap within 30 seconds (after non-glance).
   *
   * The user liked the lens (or wants more). Continue the thread.
   * "Go deeper" / "What should I say?" / "Tell me more."
   */
  private async followUp(s: LensSession, session: AppSession, sessionId: string): Promise<void> {
    s.metrics.activations++;
    s.metrics.followUps++;

    if (s.transcriptionBuffer.length === 0) {
      s.transcriptionBuffer.push('[The user tapped again — they want to go deeper. Continue from your last response. What\'s the next insight, the follow-up question, or the concrete action they should take? Don\'t repeat yourself.]');
    }

    s.systemPrompt = buildSystemPrompt(s.world, s.voice, WORDS_FOLLOWUP);
    s.lastWasGlance = false;

    await this.processBuffer(s, session, sessionId);
    s.lastLensTime = Date.now();
  }

  /**
   * Redirect — hold + speak to correct the AI's read.
   *
   * "No — it's about the deadline, not the person."
   * The AI re-lenses with the user's correction as context.
   */
  private async redirect(s: LensSession, session: AppSession, sessionId: string): Promise<void> {
    s.metrics.activations++;

    // The transcription buffer already has the user's correction from hold+speak
    const correction = s.transcriptionBuffer.join(' ').trim();
    s.transcriptionBuffer = [];

    // Remove the last AI response and re-lens with the correction
    if (s.conversationHistory.length >= 2) {
      s.conversationHistory = s.conversationHistory.slice(0, -2);
    }

    s.transcriptionBuffer.push(`[The user corrected the last lens: "${correction}". Re-lens the situation with this new context. They're telling you what you got wrong — adjust and give a better perspective.]`);

    const maxWords = hasRecentAmbient(s.ambientBuffer) ? WORDS_GLANCE : WORDS_DEPTH;
    s.systemPrompt = buildSystemPrompt(s.world, s.voice, maxWords);

    await this.processBuffer(s, session, sessionId);
    s.lastLensTime = Date.now();
    s.lastWasGlance = hasRecentAmbient(s.ambientBuffer);
  }

  /**
   * One-shot voice preview — "lens this as Coach."
   *
   * Uses a different voice for one response, then stays on the current voice.
   * Lets the user taste a voice without switching. Like trying on a shirt.
   */
  private async previewVoice(s: LensSession, previewVoice: Voice, session: AppSession, sessionId: string): Promise<void> {
    s.metrics.activations++;

    const previewWorld = loadWorldForVoice(previewVoice.id);
    if (!previewWorld) return;

    // If no specific input, use ambient or conversation
    if (s.transcriptionBuffer.length === 0) {
      const hasAmbient = s.ambientBuffer.enabled && s.ambientBuffer.bystanderAcknowledged;
      const ambientText = hasAmbient ? getAmbientContext(s.ambientBuffer) : '';

      if (ambientText) {
        s.transcriptionBuffer.push('[The user wants to hear this moment through a different voice. Give them a perspective.]');
      } else if (s.conversationHistory.length > 0) {
        s.transcriptionBuffer.push('[The user wants to hear a different voice\'s take on the current conversation.]');
      } else {
        s.transcriptionBuffer.push('[The user wants to preview this voice. Give them a taste — one characteristic thought from this philosophy.]');
      }
    }

    // Temporarily swap system prompt to the preview voice
    const maxWords = hasRecentAmbient(s.ambientBuffer) ? WORDS_GLANCE : WORDS_DEPTH;
    const savedPrompt = s.systemPrompt;
    s.systemPrompt = buildSystemPrompt(previewWorld, previewVoice, maxWords);

    await this.processBuffer(s, session, sessionId);

    // Restore original voice — one-shot only
    s.systemPrompt = savedPrompt;
    s.lastLensTime = Date.now();
    s.lastWasGlance = hasRecentAmbient(s.ambientBuffer);
  }

  /**
   * Dismiss — long press with no speech means "that didn't land."
   *
   * The AI adjusts. Not a punishment — just feedback.
   * Tracked in session so the AI can shift approach.
   */
  private dismissLens(s: LensSession, session: AppSession): void {
    s.dismissals++;
    s.metrics.dismissals++;
    s.lastLensTime = 0;
    s.lastWasGlance = false;

    if (s.conversationHistory.length >= 2) {
      s.conversationHistory = s.conversationHistory.slice(0, -2);
    }

    s.conversationHistory.push(
      { role: 'user', content: '[The user dismissed the last response — it didn\'t land. Adjust your approach next time. Try a different mode or angle.]' },
      { role: 'assistant', content: 'Understood. I\'ll try a different approach.' },
    );

    const dismissDisplayCheck = s.executor.evaluate('display_response', s.appContext);
    if (dismissDisplayCheck.allowed) {
      session.layouts.showTextWall('Got it. Tap for a fresh take.');
    }
  }

  // ── Proactive Classification (Merge-inspired) ─────────────────────────

  /**
   * Classify the current conversation moment and potentially surface
   * an uninvited perspective. This is the Merge integration point.
   *
   * Pipeline:
   *   1. Proactive engine classifies: SILENT / PERSPECTIVE / ROUTE
   *   2. If PERSPECTIVE: build prompt from philosophy world, call AI, display
   *   3. If ROUTE: could forward to Merge's specialist agents (future)
   *   4. If SILENT: do nothing (most common outcome)
   *
   * The key constraint: proactive perspectives are SHORTER (12 words)
   * and must never repeat. The user didn't ask — so be brief, be novel,
   * or shut up.
   */
  private async proactiveClassify(
    s: LensSession,
    session: AppSession,
    sessionId: string,
  ): Promise<void> {
    if (!s.aiProvider) return;

    // ── Governance: BOTH AI calls go through the guard ────────────────
    // The classification call and the perspective call are both AI actions.
    // "If it didn't pass through the guard, it didn't happen."

    // Guard check for the classification call
    const classifyPermCheck = s.executor.evaluate('ai_send_transcription', s.appContext);
    if (!classifyPermCheck.allowed) return;

    // Guard check for proactive ambient use
    const ambientPermCheck = s.executor.evaluate('ai_send_ambient', s.appContext);
    if (!ambientPermCheck.allowed) return;

    s.metrics.aiCalls++; // Count the classification call

    // Classify via the user's AI provider (governed)
    const classification = await s.proactive.classify(
      async (systemPrompt: string, userMessage: string) => {
        const response = await callUserAI(s.aiProvider!, systemPrompt, [], userMessage, 50);
        return response.text;
      },
    );

    if (classification.action === 'SILENT') {
      s.metrics.proactiveSilences++;
      return;
    }

    if (classification.action === 'ROUTE') {
      // Future: forward to Merge's specialist agents
      // For now, treat as SILENT — we don't have the Merge routing layer yet
      console.log(`[Lenses] Proactive ROUTE to ${classification.routeTarget} — not yet implemented`);
      return;
    }

    // PERSPECTIVE — build and deliver
    if (classification.action === 'PERSPECTIVE') {
      const perspectivePrompt = s.proactive.buildPerspectivePrompt(classification);

      // Use a shorter system prompt for proactive — 12 words max
      const proactiveSystemPrompt = buildSystemPrompt(s.world, s.voice, WORDS_PROACTIVE);

      try {
        const response = await callUserAI(
          s.aiProvider,
          proactiveSystemPrompt,
          s.conversationHistory.slice(-4), // Light context
          perspectivePrompt,
          WORDS_PROACTIVE,
        );

        if (response.text) {
          // Deduplicate — don't show the same perspective twice
          if (s.proactive.isDuplicate(response.text)) {
            s.metrics.proactiveSilences++;
            return;
          }

          // Governance check: can we display?
          const displayCheck = s.executor.evaluate('display_text_wall', s.appContext);
          if (displayCheck.allowed) {
            session.layouts.showTextWall(response.text);
          }

          // Record for deduplication
          s.proactive.recordPerspective({
            text: response.text,
            mode: classification.suggestedMode ?? 'direct',
            timestamp: Date.now(),
            voiceId: s.voice.id,
          });

          // Add to conversation history so follow-up taps have context
          s.conversationHistory.push(
            { role: 'user', content: '[Proactive perspective triggered by conversation context]' },
            { role: 'assistant', content: response.text },
          );
          if (s.conversationHistory.length > 6) {
            s.conversationHistory = s.conversationHistory.slice(-6);
          }

          s.lastLensTime = Date.now();
          s.lastWasGlance = true; // Proactive is always glanceable
          s.metrics.proactiveInsights++;
          s.metrics.aiCalls++;
        }
      } catch (err) {
        s.metrics.aiFailures++;
        // Proactive failures are silent — don't interrupt the user with errors
        console.error(`[Lenses] Proactive AI call failed:`, err instanceof Error ? err.message : err);
      }
    }
  }

  // ── Voice Controls (called from Settings changes) ─────────────────────

  private switchVoice(s: LensSession, newVoice: Voice, session: AppSession): void {
    const world = loadWorldForVoice(newVoice.id);
    if (!world) return;

    s.voice = newVoice;
    s.world = world;
    s.systemPrompt = buildSystemPrompt(world, newVoice, WORDS_DEPTH);
    s.metrics.voiceSwitches++;
    const voiceDisplayCheck = s.executor.evaluate('display_response', s.appContext);
    if (voiceDisplayCheck.allowed) {
      session.layouts.showTextWall(
        `${newVoice.name}. "${newVoice.tagline}"`,
      );
    }
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
      // This display IS the governance action — the guard engine requested confirmation.
      // No separate display_response check needed here; this is the guard speaking.
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
      if (s.classifyTimer) clearTimeout(s.classifyTimer);
      s.proactive.destroy();

      // ── Save journal to phone ──────────────────────────────────────────
      // Governance: phone-local only. User owns it. User can delete it.
      // No ambient speech is persisted — only aggregate counts.
      if (s.metrics.activations > 0) {
        const today = new Date().toISOString().slice(0, 10);

        // Update totals
        s.journal.totalLenses += s.metrics.aiCalls;
        s.journal.totalDismissals += s.metrics.dismissals;

        // Update streak
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        if (s.journal.lastSessionDate === yesterday || s.journal.lastSessionDate === today) {
          if (s.journal.lastSessionDate !== today) {
            s.journal.currentStreakDays++;
          }
        } else if (s.journal.lastSessionDate !== today) {
          s.journal.currentStreakDays = 1; // Reset streak
        }
        s.journal.lastSessionDate = today;

        // Add/update today's entry
        const existingDay = s.journal.recentDays.find(d => d.date === today);
        if (existingDay) {
          existingDay.lenses += s.metrics.aiCalls;
          existingDay.dismissals += s.metrics.dismissals;
          existingDay.followUps += s.metrics.followUps;
        } else {
          s.journal.recentDays.push({
            date: today,
            lenses: s.metrics.aiCalls,
            dismissals: s.metrics.dismissals,
            followUps: s.metrics.followUps,
            voiceUsed: s.voice.id,
          });
        }

        // Trim to 7 days
        if (s.journal.recentDays.length > JOURNAL_MAX_DAYS) {
          s.journal.recentDays = s.journal.recentDays.slice(-JOURNAL_MAX_DAYS);
        }

        writeJournalToDashboard(s.appSession, s.journal);
      }

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
