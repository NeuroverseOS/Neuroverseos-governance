#!/usr/bin/env bun
/**
 * Mirror — A MentraOS App
 *
 * A real-time behavioral simulation layer that predicts consequences,
 * tracks patterns, enables replay, and trains identity.
 *
 * Three zoom levels of the same system:
 *   Shadow (live)  → "What is happening in this moment?"
 *   Graph (memory)  → "What patterns are you forming?"
 *   Archetype (game) → "Who are you trying to become?"
 *
 * Architecture:
 *   MentraOS transcript stream → Event Detection → Shadow Simulation
 *   → Whisper Delivery (if worthy) → Reputation Update → Archetype Scoring
 *   → End of Conversation → Debrief (optional) → Back to real life
 *
 * Deploy:
 *   Railway with oven/bun:1 Docker image
 *
 * Run locally:
 *   bun run src/server.ts
 */

import { AppServer } from '@mentra/sdk';
import type { AppSession } from '@mentra/sdk';

import {
  MentraGovernedExecutor,
  DEFAULT_USER_RULES,
} from 'neuroverseos-governance/adapters/mentraos';
import type { AppContext, UserRules } from 'neuroverseos-governance/adapters/mentraos';
import { parseWorldMarkdown } from 'neuroverseos-governance/engine/bootstrap-parser';
import { emitWorldDefinition } from 'neuroverseos-governance/engine/bootstrap-emitter';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Mirror Engines ───────────────────────────────────────────────────────────

import {
  detectEvent,
  detectSilence,
  calculateEmotionalIntensity,
  resetEventCounter,
} from './engines/event-detector.js';
import { runShadow } from './engines/shadow-engine.js';
import {
  createContact,
  getCurrentProfile,
  updateContactAfterConversation,
  generatePreBrief,
  explainDelta,
  assessRelationshipHealth,
  getAllTrends,
  analyzeContactEnergy,
} from './engines/reputation-engine.js';
import {
  scoreAlignment,
  updateStreak,
  generateSummary,
  getStreakMessage,
} from './engines/archetype-engine.js';
import {
  generateWhisper,
  generateArchetypeWhisper,
  evaluateQuietMode,
  generateQuietModeDebrief,
  generateEndOfConversationPrompt,
} from './engines/whisper-engine.js';
import {
  generateDebriefQuestions,
  processDebriefCorrections,
  generateTimeline,
  simulateAlternative,
  summarizeSimulation,
} from './engines/debrief-engine.js';

// ── Mirror Types ─────────────────────────────────────────────────────────────

import type {
  MirrorSessionState,
  Contact,
  ConversationEvent,
  ArchetypeId,
  Whisper,
  BehavioralProfile,
} from './types.js';
import { DEFAULT_SESSION_STATE, ARCHETYPES } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Constants ───────────────────────────────────────────────────────────────

const APP_ID = 'com.neuroverse.mirror';
const port = Number(process.env.PORT) || 3002;

// ─── Governance Setup ────────────────────────────────────────────────────────

function loadGovernance() {
  // Load Mirror's own governance world
  const mirrorWorldPath = resolve(__dirname, '../world.nv-world.md');
  const mirrorMd = readFileSync(mirrorWorldPath, 'utf-8');
  const mirrorParsed = parseWorldMarkdown(mirrorMd);

  if (!mirrorParsed.world || mirrorParsed.issues.some((i: any) => i.severity === 'error')) {
    throw new Error('Failed to load Mirror governance world');
  }

  // Also load the platform world for MentraOS governance
  let platformWorld: any;
  try {
    const platformWorldPath = resolve(__dirname, '../../node_modules/neuroverseos-governance/dist/worlds/mentraos-smartglasses.nv-world.md');
    const platformMd = readFileSync(platformWorldPath, 'utf-8');
    const platformParsed = parseWorldMarkdown(platformMd);
    if (platformParsed.world) {
      platformWorld = emitWorldDefinition(platformParsed.world).world;
    }
  } catch {
    // Platform world not available — use Mirror world as fallback
    console.log('[Mirror] Platform world not found, using Mirror world for governance');
  }

  const mirrorWorld = emitWorldDefinition(mirrorParsed.world).world;

  return {
    mirrorWorld,
    platformWorld: platformWorld ?? mirrorWorld,
  };
}

// ─── Session State Management ────────────────────────────────────────────────

const sessions = new Map<string, MirrorSessionState>();

function getSession(sessionId: string): MirrorSessionState {
  let state = sessions.get(sessionId);
  if (!state) {
    state = {
      ...DEFAULT_SESSION_STATE,
      contacts: new Map(),
    };
    sessions.set(sessionId, state);
  }
  return state;
}

// ─── The App ─────────────────────────────────────────────────────────────────

class MirrorApp extends AppServer {
  private worlds = loadGovernance();
  private lastSegmentTime = new Map<string, number>();
  private lastWhisperTime = new Map<string, number>();

  protected async onSession(
    session: AppSession,
    sessionId: string,
    userId: string,
  ): Promise<void> {
    const state = getSession(sessionId);
    resetEventCounter();

    // ── Build governance executor ──────────────────────────────────────────

    const appContext: AppContext = {
      appId: APP_ID,
      aiProviderDeclared: true,
      declaredAIProviders: ['anthropic'],
      dataRetentionOptedIn: true,
      aiDataTypesSent: 0,
      glassesModel: undefined,
    };

    const executor = new MentraGovernedExecutor(
      this.worlds.platformWorld,
      {},
      DEFAULT_USER_RULES,
    );

    // ── Load user contacts from settings ──────────────────────────────────

    const settings = session.settings.getAll();
    const contactsJson = settings?.contacts as string | undefined;

    if (contactsJson) {
      try {
        const contactsList = JSON.parse(contactsJson) as Array<{
          id: string;
          name: string;
          relationship: string;
        }>;
        for (const c of contactsList) {
          if (!state.contacts.has(c.id)) {
            state.contacts.set(c.id, createContact(c.id, c.name, c.relationship));
          }
        }
      } catch {
        // Invalid contacts JSON — ignore
      }
    }

    // ── Welcome ───────────────────────────────────────────────────────────

    session.layouts.showTextWall(
      'Mirror active. Shadow mode on. Talk naturally.',
    );

    // ── Voice Commands ────────────────────────────────────────────────────

    session.events.onTranscription(async (data: any) => {
      if (!data.text || data.text.trim().length === 0) return;
      const text = data.text.trim();
      const now = Date.now();

      // ── Command: set contact ────────────────────────────────────────────
      const contactMatch = text.match(
        /^(?:talking to|with|meeting)\s+(.+)$/i,
      );
      if (contactMatch) {
        const contactName = contactMatch[1].trim();
        const contact = findContactByName(state, contactName);
        if (contact) {
          state.conversation.contactId = contact.id;
          state.conversation.active = true;
          state.conversation.startTime = now;
          state.conversation.events = [];
          state.conversation.energy = 0;

          const brief = generatePreBrief(contact);
          session.layouts.showTextWall(
            `${contact.name} (${contact.relationship}). ${brief.trendSummary}`,
          );
        } else {
          session.layouts.showTextWall(
            `Don't know ${contactName}. Add them in settings.`,
          );
        }
        return;
      }

      // ── Command: add contact ────────────────────────────────────────────
      const addMatch = text.match(
        /^add contact\s+(.+?)\s+as\s+(.+)$/i,
      );
      if (addMatch) {
        const name = addMatch[1].trim();
        const relationship = addMatch[2].trim();
        const id = name.toLowerCase().replace(/\s+/g, '_');
        state.contacts.set(id, createContact(id, name, relationship));
        session.layouts.showTextWall(`Added ${name} (${relationship}).`);
        return;
      }

      // ── Command: quiet mode ─────────────────────────────────────────────
      if (/^(?:quiet|quiet mode|shh|silence)$/i.test(text)) {
        state.quietMode = true;
        session.layouts.showTextWall('Quiet mode on.');
        return;
      }

      // ── Command: resume ─────────────────────────────────────────────────
      if (/^(?:resume|mirror on|back on)$/i.test(text)) {
        state.quietMode = false;
        session.layouts.showTextWall('Mirror active.');
        return;
      }

      // ── Command: switch mode ────────────────────────────────────────────
      if (/^(?:show|open)\s+graph$/i.test(text)) {
        state.mode = 'graph';
        if (state.conversation.contactId) {
          const contact = state.contacts.get(state.conversation.contactId);
          if (contact) {
            const profile = getCurrentProfile(contact);
            const health = assessRelationshipHealth(contact);
            session.layouts.showTextWall(
              `${contact.name}: ${health}. Trust ${profile.trust > 60 ? 'strong' : profile.trust > 35 ? 'moderate' : 'low'}.`,
            );
          }
        }
        return;
      }

      // ── Command: archetype mode ─────────────────────────────────────────
      const archetypeMatch = text.match(
        /^(?:train|be|play)\s+(ambassador|spy|interrogator|commander|guardian|provocateur)$/i,
      );
      if (archetypeMatch) {
        const archetypeId = archetypeMatch[1].toLowerCase() as ArchetypeId;
        const archetype = ARCHETYPES[archetypeId];
        state.mode = 'archetype';
        state.activeArchetype = archetypeId;
        state.maxWhispers = 4;
        session.layouts.showTextWall(
          `${archetype.name}: "${archetype.tagline}" — Training active.`,
        );
        return;
      }

      // ── Command: end conversation ───────────────────────────────────────
      if (/^(?:end|done|conversation over|stop tracking)$/i.test(text)) {
        await this.endConversation(session, sessionId, state);
        return;
      }

      // ── Command: debrief ────────────────────────────────────────────────
      if (/^(?:debrief|review|replay)$/i.test(text)) {
        if (state.pendingDebrief) {
          const questions = generateDebriefQuestions(state.pendingDebrief);
          if (questions.length > 0) {
            const q = questions[0];
            session.layouts.showTextWall(q.question);
          } else {
            const timeline = generateTimeline(state.pendingDebrief);
            const highlights = timeline.filter(t => t.isHighlight);
            if (highlights.length > 0) {
              session.layouts.showTextWall(
                `${highlights.length} key moments. ${highlights[0].highlightReason}.`,
              );
            }
          }
        } else {
          session.layouts.showTextWall('No debrief pending.');
        }
        return;
      }

      // ── Command: energy report ──────────────────────────────────────────
      if (/^(?:energy|who drains me|energy report)$/i.test(text)) {
        const contacts = Array.from(state.contacts.values());
        const energyReport = analyzeContactEnergy(contacts);
        if (energyReport.length === 0) {
          session.layouts.showTextWall('Not enough data yet.');
        } else {
          const draining = energyReport.filter(r => r.avgEnergy < -10);
          const energizing = energyReport.filter(r => r.avgEnergy > 10);
          const parts: string[] = [];
          if (draining.length > 0) {
            parts.push(`Draining: ${draining.map(r => r.contactName).join(', ')}`);
          }
          if (energizing.length > 0) {
            parts.push(`Energizing: ${energizing.map(r => r.contactName).join(', ')}`);
          }
          session.layouts.showTextWall(parts.join('. ') || 'All neutral so far.');
        }
        return;
      }

      // ── Normal conversation flow ────────────────────────────────────────

      if (!state.conversation.active) {
        state.conversation.active = true;
        state.conversation.startTime = now;
      }

      // Governance check
      const permCheck = executor.evaluate('ai_send_transcription', appContext);
      if (!permCheck.allowed && !permCheck.requiresConfirmation) {
        return;
      }

      // ── Silence detection ───────────────────────────────────────────────

      const lastTime = this.lastSegmentTime.get(sessionId) ?? now;
      const gap = now - lastTime;
      this.lastSegmentTime.set(sessionId, now);

      const silenceEvent = detectSilence(
        gap,
        state.conversation.events[state.conversation.events.length - 1] ?? null,
      );
      if (silenceEvent) {
        state.conversation.events.push(silenceEvent);
      }

      // ── Event detection ─────────────────────────────────────────────────

      const speaker: 'user' | 'other' = 'user';
      const event = detectEvent(text, speaker, 2);

      if (!event) return;

      state.conversation.events.push(event);

      // ── Update ego states ───────────────────────────────────────────────

      if (event.egoState) {
        if (event.speaker === 'user') {
          state.egoStates.user = event.egoState.state;
        } else {
          state.egoStates.other = event.egoState.state;
        }
      }

      // ── Update horseman ─────────────────────────────────────────────────

      if (event.horseman) {
        state.activeHorseman = event.horseman.horseman;
      }

      // ── Calculate emotional intensity ───────────────────────────────────

      state.emotionalIntensity = calculateEmotionalIntensity(
        state.conversation.events,
      );

      // ── Evaluate quiet mode ─────────────────────────────────────────────

      const quietResult = evaluateQuietMode(
        state.emotionalIntensity,
        75,
        state.quietMode,
      );
      if (quietResult.shouldActivate && !state.quietMode) {
        state.quietMode = true;
        return;
      }

      // ── Run shadow simulation ───────────────────────────────────────────

      const shadowResult = runShadow({
        events: state.conversation.events,
        sessionDeltas: state.sessionDeltas,
        conflictRisk: state.emotionalIntensity * 0.8,
        emotionalIntensity: state.emotionalIntensity,
        userEgoState: state.egoStates.user,
        otherEgoState: state.egoStates.other,
        activeHorseman: state.activeHorseman,
        energy: state.conversation.energy,
      });

      // ── Update conversation energy ──────────────────────────────────────

      if (shadowResult.energyTrajectory === 'energizing') {
        state.conversation.energy += 3;
      } else if (shadowResult.energyTrajectory === 'draining') {
        state.conversation.energy -= 3;
      }
      state.conversation.energy = Math.max(-100, Math.min(100, state.conversation.energy));

      // ── Whisper delivery ────────────────────────────────────────────────

      const whisper = generateWhisper(shadowResult, state, event);
      const lastWhisper = this.lastWhisperTime.get(sessionId) ?? 0;
      if (whisper && (now - lastWhisper) >= 30_000) {
        session.layouts.showTextWall(whisper.text);
        state.whispersDelivered++;
        this.lastWhisperTime.set(sessionId, now);
      }

      // ── Archetype whisper ───────────────────────────────────────────────

      if (state.mode === 'archetype' && state.activeArchetype) {
        const alignment = scoreAlignment(
          state.activeArchetype,
          state.conversation.events,
        );
        state.archetypeAlignment = alignment.score;

        const archetypeWhisper = generateArchetypeWhisper(
          alignment.score,
          ARCHETYPES[state.activeArchetype].name,
          state,
          event,
        );

        if (archetypeWhisper && (now - lastWhisper) >= 30_000 && !whisper) {
          session.layouts.showTextWall(archetypeWhisper.text);
          state.whispersDelivered++;
          this.lastWhisperTime.set(sessionId, now);
        }
      }

      // ── Accumulate session deltas ───────────────────────────────────────

      for (const [dim, delta] of Object.entries(event.impact)) {
        const key = dim as keyof BehavioralProfile;
        state.sessionDeltas[key] = (state.sessionDeltas[key] ?? 0) + (delta as number);
      }
    });
  }

  // ─── End Conversation ───────────────────────────────────────────────────

  private async endConversation(
    session: AppSession,
    sessionId: string,
    state: MirrorSessionState,
  ): Promise<void> {
    if (!state.conversation.active) return;

    const events = state.conversation.events;
    const contactId = state.conversation.contactId;
    const startTime = state.conversation.startTime ?? Date.now();
    const duration = Date.now() - startTime;

    if (contactId) {
      const contact = state.contacts.get(contactId);
      if (contact) {
        const archetypeAlignment = state.activeArchetype
          ? scoreAlignment(state.activeArchetype, events).score
          : null;

        const updated = updateContactAfterConversation(
          contact,
          events,
          state.conversation.energy,
          duration,
          archetypeAlignment,
          false,
        );
        state.contacts.set(contactId, updated);
      }
    }

    if (state.activeArchetype) {
      const summary = generateSummary(
        state.activeArchetype,
        events,
        state.streakCount,
      );
      state.streakCount = summary.streak;

      session.layouts.showTextWall(
        `${summary.name}: ${summary.score}%. ${summary.streakMessage ?? ''}`,
      );
    }

    state.pendingDebrief = [...events];

    const prompt = generateEndOfConversationPrompt(
      state.conversation.energy,
      events.length,
      state.activeArchetype !== null,
      state.archetypeAlignment,
    );

    setTimeout(() => {
      session.layouts.showTextWall(prompt);
    }, 3000);

    state.conversation.active = false;
    state.conversation.startTime = null;
    state.conversation.events = [];
    state.conversation.energy = 0;
    state.conversation.contactId = null;
    state.whispersDelivered = 0;
    state.emotionalIntensity = 0;
    state.quietMode = false;
    state.activeHorseman = null;
    state.egoStates = { user: 'unknown', other: 'unknown' };
    state.sessionDeltas = {};
    state.mode = 'shadow';
    state.maxWhispers = 2;
  }

  protected async onStop(
    sessionId: string,
    _userId: string,
    _reason: string,
  ): Promise<void> {
    sessions.delete(sessionId);
    this.lastSegmentTime.delete(sessionId);
    this.lastWhisperTime.delete(sessionId);
  }
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function findContactByName(
  state: MirrorSessionState,
  name: string,
): Contact | undefined {
  const lower = name.toLowerCase();
  for (const contact of state.contacts.values()) {
    if (contact.name.toLowerCase() === lower ||
        contact.name.toLowerCase().startsWith(lower) ||
        contact.id === lower) {
      return contact;
    }
  }
  return undefined;
}

// ─── Start the app ───────────────────────────────────────────────────────────

const app = new MirrorApp({
  packageName: APP_ID,
  apiKey: process.env.MENTRA_APP_API_KEY ?? '',
  port,
});

await app.start();

// ─── Webview (phone UI) ──────────────────────────────────────────────────────

app.get('/webview', (c: any) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mirror</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 20px; min-height: 100vh; }
    .header { text-align: center; padding: 30px 0 20px; }
    .header h1 { font-size: 24px; font-weight: 600; color: #fff; }
    .header p { font-size: 14px; color: #888; margin-top: 8px; font-style: italic; }
    .card { background: #1a1a1a; border-radius: 12px; padding: 20px; margin: 16px 0; border: 1px solid #2a2a2a; }
    .card h2 { font-size: 16px; color: #aaa; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: 500; }
    .mode { display: flex; align-items: center; gap: 10px; margin: 10px 0; }
    .dot { width: 10px; height: 10px; border-radius: 50%; }
    .dot-green { background: #4ade80; }
    .dot-blue { background: #60a5fa; }
    .dot-purple { background: #c084fc; }
    .mode-name { color: #ccc; font-size: 14px; font-weight: 600; }
    .mode-desc { color: #888; font-size: 12px; }
    .controls p { color: #888; font-size: 13px; margin: 6px 0; }
    .controls strong { color: #ccc; }
    .archetype { display: flex; align-items: baseline; gap: 8px; margin: 8px 0; }
    .arch-name { color: #c084fc; font-size: 14px; font-weight: 600; }
    .arch-desc { color: #888; font-size: 12px; }
    .setup { background: #1a1a0a; border: 1px solid #4a4a00; border-radius: 12px; padding: 16px 20px; margin: 16px 0; }
    .setup h2 { font-size: 14px; color: #fbbf24; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
    .setup p { color: #aaa; font-size: 13px; line-height: 1.5; }
    .setup .steps strong { color: #fbbf24; }
    .footer { text-align: center; padding: 30px 0; color: #555; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Mirror</h1>
    <p>Predict consequences. Track patterns. Train identity.</p>
  </div>

  <div class="setup">
    <h2>Getting Started</h2>
    <p>Mirror works automatically once activated. Add contacts and configure your archetype in Settings.</p>
    <div class="steps">
      <p><strong>1.</strong> Tap <strong style="background:#333;padding:4px 10px;border-radius:6px;border:1px solid #555;font-size:16px;">...</strong> at the top right</p>
      <p><strong>2.</strong> Go to <strong>Settings</strong></p>
      <p><strong>3.</strong> Add your <strong>contacts</strong> as JSON</p>
      <p><strong>4.</strong> Choose an <strong>archetype</strong> to train</p>
      <p><strong>5.</strong> Optionally add an <strong>AI API key</strong> for replay simulation</p>
    </div>
  </div>

  <div class="card">
    <h2>Three Modes, One System</h2>
    <div class="mode"><span class="dot dot-green"></span><span class="mode-name">Shadow</span><span class="mode-desc">— always on, minimal whispers</span></div>
    <div class="mode"><span class="dot dot-blue"></span><span class="mode-name">Graph</span><span class="mode-desc">— review patterns over time</span></div>
    <div class="mode"><span class="dot dot-purple"></span><span class="mode-name">Archetype</span><span class="mode-desc">— train who you want to become</span></div>
  </div>

  <div class="card">
    <h2>Voice Commands</h2>
    <div class="controls">
      <p><strong>"Talking to Alex"</strong> — set active contact</p>
      <p><strong>"Add contact Sarah as partner"</strong> — create contact</p>
      <p><strong>"Train Ambassador"</strong> — activate archetype mode</p>
      <p><strong>"Show graph"</strong> — view reputation trends</p>
      <p><strong>"Quiet"</strong> — suppress all insights</p>
      <p><strong>"Resume"</strong> — re-enable Mirror</p>
      <p><strong>"Done"</strong> — end conversation tracking</p>
      <p><strong>"Debrief"</strong> — review last conversation</p>
      <p><strong>"Energy report"</strong> — who drains vs energizes you</p>
    </div>
  </div>

  <div class="card">
    <h2>Archetypes</h2>
    <div class="archetype"><span class="arch-name">Ambassador</span><span class="arch-desc">— build bridges, not walls</span></div>
    <div class="archetype"><span class="arch-name">Spy</span><span class="arch-desc">— learn everything, reveal nothing</span></div>
    <div class="archetype"><span class="arch-name">Interrogator</span><span class="arch-desc">— hold the line, get the truth</span></div>
    <div class="archetype"><span class="arch-name">Commander</span><span class="arch-desc">— decide, act, lead</span></div>
    <div class="archetype"><span class="arch-name">Guardian</span><span class="arch-desc">— protect, anchor, steady</span></div>
    <div class="archetype"><span class="arch-name">Provocateur</span><span class="arch-desc">— disrupt, challenge, evolve</span></div>
  </div>

  <div class="card">
    <h2>What It Tracks</h2>
    <div class="controls">
      <p><strong>Trust</strong> — relationship foundation (slow decay)</p>
      <p><strong>Composure</strong> — steadiness under pressure</p>
      <p><strong>Influence</strong> — ability to shape outcomes</p>
      <p><strong>Empathy</strong> — emotional attunement</p>
      <p><strong>Volatility</strong> — unpredictability (fast decay)</p>
      <p><strong>Conflict Risk</strong> — Gottman horseman detection</p>
      <p><strong>Energy</strong> — does this person drain or energize you?</p>
    </div>
  </div>

  <div class="footer">
    Mirror by NeuroverseOS<br>
    Insights are patterns, not judgments.
  </div>
</body>
</html>`);
});

// SDK start() only validates API key — Bun.serve() starts the HTTP server.
Bun.serve({
  port,
  hostname: '0.0.0.0',
  fetch: app.fetch,
});

console.log(`[Mirror] Running on port ${port}`);
