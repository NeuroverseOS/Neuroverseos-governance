#!/usr/bin/env npx tsx
/**
 * Lenses — A MentraOS App
 *
 * Pick who you want in your corner. Same AI, different perspective.
 *
 * Architecture:
 *   - User brings their own AI API key (OpenAI or Anthropic)
 *   - We provide the Lens overlay (zero-cost string injection)
 *   - MentraOS SDK handles glasses I/O (mic, display)
 *   - Governance checks every AI call before it happens
 *
 * Flow:
 *   1. User launches app → picks a lens (or keeps their saved one)
 *   2. User talks → onTranscription fires
 *   3. Governance check → can we send to AI?
 *   4. Lens overlay injected into system prompt
 *   5. User's API key calls their AI provider
 *   6. Response displayed on glasses through the lens
 *
 * BYO-Key Model:
 *   Users paste their API key in app settings.
 *   We never store it on our servers — it lives in the user's
 *   MentraOS session config. Their key, their cost, their data.
 *
 * Run (demo mode):
 *   npx tsx examples/mentraos-lenses-app/app.ts
 */

import { AppServer } from '@mentra/sdk';
import type { AppSession } from '@mentra/sdk';

import {
  STOIC_LENS,
  COACH_LENS,
  CALM_LENS,
  CLOSER_LENS,
  SAMURAI_LENS,
  HYPE_MAN_LENS,
  MONK_LENS,
  SOCRATIC_LENS,
  MINIMALIST_LENS,
  compileLensOverlay,
  getLens,
  getLenses,
  type Lens,
  type LensOverlay,
} from '../../src/builder/lens';

import {
  MentraGovernedExecutor,
  DEFAULT_USER_RULES,
} from '../../src/adapters/mentraos';
import type { AppContext, UserRules } from '../../src/adapters/mentraos';

import { parseWorldMarkdown } from '../../src/engine/bootstrap-parser';
import { emitWorldDefinition } from '../../src/engine/bootstrap-emitter';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── AI Provider Abstraction ────────────────────────────────────────────────
// User brings their own key. We support OpenAI and Anthropic.

interface AIProvider {
  name: 'openai' | 'anthropic';
  apiKey: string;
}

interface AIResponse {
  text: string;
  tokensUsed?: number;
}

/**
 * Call the user's AI provider with the lens overlay baked into the system prompt.
 * This is the only place where an external API call happens.
 */
async function callUserAI(
  provider: AIProvider,
  systemPrompt: string,
  userMessage: string,
): Promise<AIResponse> {
  if (provider.name === 'anthropic') {
    // Dynamic import — only loaded if user chose Anthropic
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: provider.apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150, // Keep it short for glasses display
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    return {
      text: textBlock?.text ?? '',
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
    };
  }

  if (provider.name === 'openai') {
    // Dynamic import — only loaded if user chose OpenAI
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: provider.apiKey });

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 150,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    return {
      text: response.choices[0]?.message?.content ?? '',
      tokensUsed: response.usage?.total_tokens,
    };
  }

  throw new Error(`Unsupported AI provider: ${provider.name}`);
}

// ─── Governance Setup ───────────────────────────────────────────────────────

function loadGovernance() {
  const worldPath = resolve(__dirname, '../../src/worlds/mentraos-smartglasses.nv-world.md');
  const worldMd = readFileSync(worldPath, 'utf-8');
  const parseResult = parseWorldMarkdown(worldMd);

  if (!parseResult.world || parseResult.issues.some(i => i.severity === 'error')) {
    throw new Error('Failed to load governance world');
  }

  return emitWorldDefinition(parseResult.world).world;
}

// ─── Session State ──────────────────────────────────────────────────────────
// Per-user state during an active session.

interface LensSessionState {
  /** Currently active lens */
  activeLens: Lens;
  /** Compiled overlay (cached — recompiled only on lens change) */
  overlay: LensOverlay;
  /** User's AI provider config */
  aiProvider: AIProvider | null;
  /** Governance executor for this session */
  executor: MentraGovernedExecutor;
  /** App context for governance checks */
  appContext: AppContext;
}

const sessions = new Map<string, LensSessionState>();

// ─── The App ────────────────────────────────────────────────────────────────

class LensesApp extends AppServer {
  private world = loadGovernance();

  protected async onSession(
    session: AppSession,
    sessionId: string,
    userId: string,
  ): Promise<void> {
    // ── Initialize session state ──────────────────────────────────────────

    // Read user settings (API key + provider + saved lens)
    const settings = session.settings.getAll();
    const savedLensId = settings?.active_lens as string | undefined;
    const aiProviderName = settings?.ai_provider as 'openai' | 'anthropic' | undefined;
    const aiApiKey = settings?.ai_api_key as string | undefined;

    // Default to Stoic lens if none saved
    const activeLens = (savedLensId ? getLens(savedLensId) : undefined) ?? STOIC_LENS;
    const overlay = compileLensOverlay([activeLens]);

    // Build AI provider from user settings
    const aiProvider: AIProvider | null =
      aiProviderName && aiApiKey
        ? { name: aiProviderName, apiKey: aiApiKey }
        : null;

    // App context for governance
    const appContext: AppContext = {
      appId: 'com.neuroverse.lenses',
      aiProviderDeclared: true,
      declaredAIProviders: ['openai', 'anthropic'], // We support both
      dataRetentionOptedIn: false, // Lenses never retains data
      aiDataTypesSent: 0,
      glassesModel: undefined, // Filled by SDK at runtime
    };

    // Create governance executor with default user rules
    // (In production, MentraOS loads the user's actual rules from their profile)
    const executor = new MentraGovernedExecutor(this.world, {}, DEFAULT_USER_RULES);

    const state: LensSessionState = {
      activeLens,
      overlay,
      aiProvider,
      executor,
      appContext,
    };
    sessions.set(sessionId, state);

    // ── Welcome the user ──────────────────────────────────────────────────

    if (!aiProvider) {
      session.layouts.showTextWall(
        'Welcome to Lenses! Go to Settings to add your AI API key (OpenAI or Anthropic) to get started.',
      );
      return;
    }

    session.layouts.showTextWall(
      `${activeLens.name} active. "${activeLens.tagline}" — Talk to me.`,
    );

    // ── Handle transcription events ───────────────────────────────────────

    session.events.onTranscription(async (data) => {
      const s = sessions.get(sessionId);
      if (!s || !s.aiProvider) return;
      if (!data.text || data.text.trim().length === 0) return;

      const userText = data.text.trim();

      // ── Voice commands: lens switching ────────────────────────────────
      const switchMatch = userText.match(
        /^(?:switch to|use|activate|try)\s+(.+?)(?:\s+lens)?$/i,
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
          s.activeLens = newLens;
          s.overlay = compileLensOverlay([newLens]);
          session.layouts.showTextWall(
            `Switched to ${newLens.name}. "${newLens.tagline}"`,
          );
          return;
        }
      }

      // ── Voice command: list lenses ────────────────────────────────────
      if (/^(?:list|show|what)\s+lenses/i.test(userText)) {
        const lensNames = getLenses()
          .map(l => l.name)
          .join(', ');
        session.layouts.showTextWall(`Available: ${lensNames}`);
        return;
      }

      // ── Governance check: can we send transcription to AI? ────────────
      const permCheck = s.executor.evaluate('ai_send_transcription', s.appContext);
      if (!permCheck.allowed && !permCheck.requiresConfirmation) {
        // Governance blocked — don't call AI
        console.log(`[Lenses] Blocked: ${permCheck.verdict.reason}`);
        return;
      }

      // ── Build the AI prompt with lens overlay ─────────────────────────
      const systemPrompt = `${s.overlay.systemPromptAddition}

## Context
You are responding through smart glasses. Keep responses under 30 words.
The user is wearing glasses and talking to you in real life.
Be conversational. No bullet points. No markdown. Just talk.`;

      // ── Call the user's AI ────────────────────────────────────────────
      try {
        const response = await callUserAI(s.aiProvider, systemPrompt, userText);

        if (response.text) {
          // Governance check: can we display?
          const displayCheck = s.executor.evaluate('display_text_wall', s.appContext);
          if (displayCheck.allowed) {
            session.layouts.showTextWall(response.text);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        if (msg.includes('401') || msg.includes('invalid_api_key') || msg.includes('Unauthorized')) {
          session.layouts.showTextWall('API key invalid. Check Settings.');
        } else if (msg.includes('429') || msg.includes('rate_limit')) {
          session.layouts.showTextWall('Rate limited. Try again in a moment.');
        } else {
          console.error(`[Lenses] AI call failed for session ${sessionId}:`, msg);
          session.layouts.showTextWall('Something went wrong. Try again.');
        }
      }
    });
  }

  protected async onStop(
    sessionId: string,
    _userId: string,
    _reason: string,
  ): Promise<void> {
    sessions.delete(sessionId);
  }
}

// ─── Start the app ──────────────────────────────────────────────────────────

const app = new LensesApp({
  packageName: 'com.neuroverse.lenses',
  apiKey: process.env.MENTRA_APP_API_KEY ?? '',
  port: Number(process.env.PORT) || 3000,
});

app.start();
console.log('[Lenses] App server running on port', Number(process.env.PORT) || 3000);
