#!/usr/bin/env npx tsx
/**
 * StarTalk — A MentraOS App
 *
 * Astrological translator for smart glasses.
 * Set your sun + rising sign. Tap. Get cosmic perspective.
 *
 * Architecture mirrors Lenses:
 *   - User sets their sun sign + rising sign (Settings)
 *   - Optionally sets the other person's sign ("talking to a Taurus")
 *   - Glasses listen passively (ambient mode, with permission)
 *   - User taps or says "star" — AI reads the moment through their chart
 *   - AI auto-selects mode (translate, reflect, challenge, teach, direct)
 *   - Tap again within 30s = follow up
 *   - Long press = dismiss
 *
 * World Stacking:
 *   Sun sign = dominant (WHO you are)
 *   Rising sign = secondary (HOW you come across)
 *   Other person's sign = compatibility context
 *
 * This is the first real test of NeuroverseOS world stacking.
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
  ALL_SIGNS,
  loadSign,
  getSignInfo,
  buildStarTalkPrompt,
  type SignId,
  type UserProfile,
} from './sign-loader';

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Constants ───────────────────────────────────────────────────────────────

const APP_ID = 'com.neuroverse.startalk';
const DEFAULT_SUN_SIGN: SignId = 'aries';
const DEFAULT_AMBIENT_BUFFER_SECONDS = 120;
const MAX_AMBIENT_TOKENS_ESTIMATE = 700;

const FOLLOW_UP_WINDOW_MS = 30_000;
const RECENCY_BOOST_SECONDS = 15;

const WORDS_GLANCE = 15;
const WORDS_EXPAND = 40;
const WORDS_FOLLOWUP = 60;
const WORDS_DEPTH = 80;

/** Pattern to detect "star" trigger in speech */
const STAR_TRIGGER_PATTERN = /\b(?:star\s*(?:talk)?|what\s+do\s+the\s+stars\s+say)\b/i;

/** Pattern to detect "talking to a [sign]" */
const OTHER_SIGN_PATTERN = /\b(?:talking\s+to\s+(?:a\s+)?|they(?:'re|\s+are)\s+(?:a\s+)?)(\w+)\b/i;

// ─── AI Provider ─────────────────────────────────────────────────────────────

const AI_MODELS: Record<string, { provider: 'openai' | 'anthropic'; model: string }> = {
  'auto': { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  'claude-haiku-4-5-20251001': { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  'gpt-4o-mini': { provider: 'openai', model: 'gpt-4o-mini' },
};

interface AIProvider {
  name: 'openai' | 'anthropic';
  apiKey: string;
  model: string;
}

async function callUserAI(
  provider: AIProvider,
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  userMessage: string,
  maxWords: number,
): Promise<{ text: string; tokensUsed?: number }> {
  const maxTokens = Math.max(50, maxWords * 3);
  const allMessages = [...messages, { role: 'user' as const, content: userMessage }];

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
    return { text: textBlock?.text ?? '', tokensUsed: response.usage.input_tokens + response.usage.output_tokens };
  }

  if (provider.name === 'openai') {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: provider.apiKey });
    const response = await client.chat.completions.create({
      model: provider.model,
      max_tokens: maxTokens,
      messages: [{ role: 'system' as const, content: systemPrompt }, ...allMessages],
    });
    return { text: response.choices[0]?.message?.content ?? '', tokensUsed: response.usage?.total_tokens };
  }

  throw new Error(`Unsupported AI provider: ${provider.name}`);
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

// ─── Ambient Buffer (same as Lenses) ─────────────────────────────────────────

interface AmbientEntry { text: string; timestamp: number; }

interface AmbientBuffer {
  enabled: boolean;
  bystanderAcknowledged: boolean;
  entries: AmbientEntry[];
  maxBufferSeconds: number;
  maxTokensPerCall: number;
  sends: number;
}

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
  const recentBudget = Math.floor(maxWords * 0.75);
  const olderBudget = maxWords - recentBudget;

  const buildFromNewest = (entries: AmbientEntry[], budget: number): string => {
    const parts: string[] = [];
    let wordCount = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
      const words = entries[i].text.split(/\s+/);
      if (wordCount + words.length > budget) break;
      parts.unshift(entries[i].text);
      wordCount += words.length;
    }
    return parts.join(' ');
  };

  return [buildFromNewest(older, olderBudget), buildFromNewest(recent, recentBudget)].filter(Boolean).join(' ');
}

function hasRecentAmbient(buffer: AmbientBuffer): boolean {
  if (!buffer.enabled || buffer.entries.length === 0) return false;
  return buffer.entries.some(e => e.timestamp >= Date.now() - (RECENCY_BOOST_SECONDS * 1000));
}

// ─── Session State ───────────────────────────────────────────────────────────

interface StarTalkSession {
  profile: UserProfile;
  otherSign: SignId | null;
  systemPrompt: string;
  aiProvider: AIProvider | null;
  executor: MentraGovernedExecutor;
  appContext: AppContext;
  isActivated: boolean;
  transcriptionBuffer: string[];
  ambientBuffer: AmbientBuffer;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  lastLensTime: number;
  lastWasGlance: boolean;
  lastLensInput: string;
  appSession: AppSession;
  metrics: {
    activations: number;
    aiCalls: number;
    aiFailures: number;
    dismissals: number;
    ambientSends: number;
    sessionStart: number;
  };
}

const sessions = new Map<string, StarTalkSession>();

// ─── The App ─────────────────────────────────────────────────────────────────

class StarTalkApp extends AppServer {
  private platformWorld = loadPlatformWorld();

  protected async onSession(
    session: AppSession,
    sessionId: string,
    userId: string,
  ): Promise<void> {
    // ── Read settings ────────────────────────────────────────────────────
    const sunSign = session.settings.get<string>('sun_sign', DEFAULT_SUN_SIGN) as SignId;
    const risingSign = session.settings.get<string>('rising_sign', '') as SignId | '';
    const aiApiKey = session.settings.get<string>('ai_api_key', '');
    const aiProviderSetting = session.settings.get<string>('ai_provider', '');
    const aiModelSetting = session.settings.get<string>('ai_model', 'auto');
    const ambientEnabled = session.settings.get<boolean>('ambient_context', false);
    const ambientBystanderAck = session.settings.get<boolean>('ambient_bystander_ack', false);
    const ambientBufferSeconds = session.settings.get<number>('ambient_buffer_duration', DEFAULT_AMBIENT_BUFFER_SECONDS);

    // ── AI provider ──────────────────────────────────────────────────────
    let aiProvider: AIProvider | null = null;
    if (aiApiKey) {
      const modelConfig = AI_MODELS[aiModelSetting] ?? AI_MODELS['auto'];
      aiProvider = {
        name: (aiProviderSetting === 'openai' ? 'openai' : modelConfig.provider),
        apiKey: aiApiKey,
        model: modelConfig.model,
      };
    }

    // ── Build profile + system prompt ────────────────────────────────────
    const profile: UserProfile = { sunSign, risingSign: risingSign || undefined };
    const systemPrompt = buildStarTalkPrompt(profile, undefined, WORDS_DEPTH);

    // ── Governance ───────────────────────────────────────────────────────
    const appContext: AppContext = {
      appId: APP_ID,
      aiProviderDeclared: true,
      declaredAIProviders: ['openai', 'anthropic'],
      dataRetentionOptedIn: false,
      aiDataTypesSent: 0,
      glassesModel: undefined,
    };

    const executor = new MentraGovernedExecutor(
      this.platformWorld,
      {
        onBlock: (r) => console.log(`[StarTalk] BLOCKED: ${r.verdict.reason}`),
        onPause: (r) => console.log(`[StarTalk] CONFIRM: ${r.verdict.reason}`),
      },
      DEFAULT_USER_RULES,
    );

    // ── Initialize session ───────────────────────────────────────────────
    const state: StarTalkSession = {
      profile,
      otherSign: null,
      systemPrompt,
      aiProvider,
      executor,
      appContext,
      isActivated: false,
      transcriptionBuffer: [],
      ambientBuffer: {
        enabled: ambientEnabled,
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
      appSession: session,
      metrics: { activations: 0, aiCalls: 0, aiFailures: 0, dismissals: 0, ambientSends: 0, sessionStart: Date.now() },
    };
    sessions.set(sessionId, state);

    // ── Onboarding ───────────────────────────────────────────────────────
    if (!aiProvider) {
      session.layouts.showDoubleTextWall('Welcome to StarTalk', 'Add your AI API key in Settings.');
      return;
    }

    const sunInfo = getSignInfo(sunSign)!;
    const risingInfo = risingSign ? getSignInfo(risingSign) : null;
    const label = risingInfo ? `${sunInfo.name} sun, ${risingInfo.name} rising` : sunInfo.name;

    const displayCheck = state.executor.evaluate('display_response', state.appContext);
    if (displayCheck.allowed) {
      session.layouts.showTextWall(`${label}. Tap anytime.`);
    }

    // ── Button Events ────────────────────────────────────────────────────
    session.events.onButtonPress((data: ButtonPress) => {
      const s = sessions.get(sessionId);
      if (!s || !s.aiProvider) return;

      if (data.pressType === 'short') {
        const now = Date.now();
        const inWindow = s.lastLensTime > 0 && (now - s.lastLensTime) < FOLLOW_UP_WINDOW_MS;

        if (inWindow && s.lastWasGlance && s.lastLensInput) {
          this.expandGlance(s, session, sessionId);
        } else if (inWindow) {
          this.followUp(s, session, sessionId);
        } else {
          this.starMe(s, session, sessionId);
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

      // Detect "talking to a [sign]" — set the other person's sign
      const otherMatch = userText.match(OTHER_SIGN_PATTERN);
      if (otherMatch) {
        const signName = otherMatch[1].toLowerCase();
        const matchedSign = ALL_SIGNS.find(
          s => s.id === signName || s.name.toLowerCase() === signName,
        );
        if (matchedSign) {
          // Governance: check display permission BEFORE mutating state
          const displayCheck = s.executor.evaluate('display_response', s.appContext);
          if (!displayCheck.allowed) return;

          s.otherSign = matchedSign.id;
          s.systemPrompt = buildStarTalkPrompt(s.profile, s.otherSign, WORDS_DEPTH);
          session.layouts.showTextWall(`Translating for ${matchedSign.name}.`);
          return;
        }
      }

      // "Star" trigger
      if (STAR_TRIGGER_PATTERN.test(userText)) {
        const remainder = userText.replace(STAR_TRIGGER_PATTERN, '').trim();
        if (remainder) s.transcriptionBuffer.push(remainder);

        const now = Date.now();
        const inWindow = s.lastLensTime > 0 && (now - s.lastLensTime) < FOLLOW_UP_WINDOW_MS;
        if (inWindow) {
          await this.followUp(s, session, sessionId);
        } else {
          await this.starMe(s, session, sessionId);
        }
        return;
      }
    });
  }

  // ── Core Interactions (mirror Lenses) ──────────────────────────────────

  private async starMe(s: StarTalkSession, session: AppSession, sessionId: string): Promise<void> {
    s.metrics.activations++;
    const isGlance = hasRecentAmbient(s.ambientBuffer);

    if (s.transcriptionBuffer.length === 0) {
      const hasAmbient = s.ambientBuffer.enabled && s.ambientBuffer.bystanderAcknowledged;
      const ambientText = hasAmbient ? getAmbientContext(s.ambientBuffer) : '';

      if (ambientText) {
        s.transcriptionBuffer.push('[The user tapped for a star read. Here\'s what was just said around them — translate this moment through their astrological chart.]');
        s.ambientBuffer.sends++;
        s.metrics.ambientSends++;
      } else if (s.conversationHistory.length > 0) {
        s.transcriptionBuffer.push('[The user tapped again. Continue the astrological read — go deeper.]');
      } else {
        const sunInfo = getSignInfo(s.profile.sunSign)!;
        s.transcriptionBuffer.push(`[First activation. Give the ${sunInfo.name} a brief, playful cosmic thought to start their day. One sentence. Not a horoscope — an insight about their nature.]`);
      }
    }

    const maxWords = isGlance ? WORDS_GLANCE : WORDS_DEPTH;
    s.systemPrompt = buildStarTalkPrompt(s.profile, s.otherSign ?? undefined, maxWords);
    s.lastLensInput = s.transcriptionBuffer.join(' ');
    s.lastWasGlance = isGlance;

    await this.processBuffer(s, session, sessionId);
    s.lastLensTime = Date.now();
  }

  private async expandGlance(s: StarTalkSession, session: AppSession, sessionId: string): Promise<void> {
    s.metrics.activations++;
    s.transcriptionBuffer.push(`[Expand the last response — same cosmic angle, more room to breathe.]\n${s.lastLensInput}`);
    s.systemPrompt = buildStarTalkPrompt(s.profile, s.otherSign ?? undefined, WORDS_EXPAND);
    s.lastWasGlance = false;
    await this.processBuffer(s, session, sessionId);
    s.lastLensTime = Date.now();
  }

  private async followUp(s: StarTalkSession, session: AppSession, sessionId: string): Promise<void> {
    s.metrics.activations++;
    if (s.transcriptionBuffer.length === 0) {
      s.transcriptionBuffer.push('[The user tapped again — go deeper into the astrological dynamic. What\'s the next insight?]');
    }
    s.systemPrompt = buildStarTalkPrompt(s.profile, s.otherSign ?? undefined, WORDS_FOLLOWUP);
    s.lastWasGlance = false;
    await this.processBuffer(s, session, sessionId);
    s.lastLensTime = Date.now();
  }

  private dismiss(s: StarTalkSession, session: AppSession): void {
    s.metrics.dismissals++;
    s.lastLensTime = 0;
    s.lastWasGlance = false;
    if (s.conversationHistory.length >= 2) {
      s.conversationHistory = s.conversationHistory.slice(0, -2);
    }
    s.conversationHistory.push(
      { role: 'user', content: '[Dismissed — try a different astrological angle next time.]' },
      { role: 'assistant', content: 'Got it. Different angle next time.' },
    );
    const displayCheck = s.executor.evaluate('display_response', s.appContext);
    if (displayCheck.allowed) {
      session.layouts.showTextWall('Got it. Tap for a different read.');
    }
  }

  // ── Process Buffer (governed, same as Lenses) ──────────────────────────

  private async processBuffer(s: StarTalkSession, session: AppSession, sessionId: string): Promise<void> {
    if (!s.aiProvider || s.transcriptionBuffer.length === 0) return;

    const userText = s.transcriptionBuffer.join(' ').trim();
    s.transcriptionBuffer = [];
    if (userText.length === 0) return;

    // Governance
    const permCheck = s.executor.evaluate('ai_send_transcription', s.appContext);
    if (!permCheck.allowed && !permCheck.requiresConfirmation) return;

    // Build messages
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    if (s.ambientBuffer.enabled && s.ambientBuffer.bystanderAcknowledged) {
      const ambientText = getAmbientContext(s.ambientBuffer);
      if (ambientText) {
        messages.push({
          role: 'user',
          content: `[CONTEXT — what was just said around me.]\n${ambientText}`,
        });
        messages.push({ role: 'assistant', content: 'Got it. I have context.' });
        s.ambientBuffer.sends++;
        s.metrics.ambientSends++;
      }
    }

    if (s.conversationHistory.length > 0) {
      messages.push(...s.conversationHistory.slice(-6));
    }

    // AI call
    s.metrics.aiCalls++;
    try {
      const maxWords = hasRecentAmbient(s.ambientBuffer) ? WORDS_GLANCE : WORDS_DEPTH;
      const response = await callUserAI(s.aiProvider, s.systemPrompt, messages, userText, maxWords);

      if (response.text) {
        const displayCheck = s.executor.evaluate('display_response', s.appContext);
        if (displayCheck.allowed) {
          session.layouts.showTextWall(response.text);
        }

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
      if (msg.includes('401')) session.layouts.showTextWall('API key invalid. Check Settings.');
      else if (msg.includes('429')) session.layouts.showTextWall('Rate limited. Wait a moment.');
      else session.layouts.showTextWall('Something went wrong. Try again.');
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────

  protected async onStop(sessionId: string, _userId: string, _reason: string): Promise<void> {
    const s = sessions.get(sessionId);
    if (s) {
      s.ambientBuffer.entries = [];
      const duration = Math.round((Date.now() - s.metrics.sessionStart) / 1000);
      console.log(`[StarTalk] Session ended after ${duration}s — ${s.metrics.activations} activations, ${s.metrics.aiCalls} AI calls`);
    }
    sessions.delete(sessionId);
  }
}

// ─── Start ───────────────────────────────────────────────────────────────────

const app = new StarTalkApp({
  packageName: APP_ID,
  apiKey: process.env.MENTRA_APP_API_KEY ?? '',
  port: Number(process.env.PORT) || 3001,
});

app.start();
console.log(`[StarTalk] Running on port ${Number(process.env.PORT) || 3001}`);
console.log(`[StarTalk] Signs: ${ALL_SIGNS.map(s => s.name).join(', ')}`);
