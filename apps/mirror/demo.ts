#!/usr/bin/env npx tsx
/**
 * Mirror Demo — Simulates a full conversation flow without MentraOS SDK
 *
 * Demonstrates:
 * 1. Event detection from transcript
 * 2. Shadow simulation with whisper generation
 * 3. Reputation tracking with decay curves
 * 4. Archetype alignment scoring
 * 5. Post-conversation debrief with timeline
 * 6. Pre-brief generation for next conversation
 *
 * Run:
 *   npx tsx apps/mirror/demo.ts
 */

import {
  detectEvent,
  detectSilence,
  calculateEmotionalIntensity,
  resetEventCounter,
} from './src/engines/event-detector.js';
import { runShadow } from './src/engines/shadow-engine.js';
import {
  createContact,
  getCurrentProfile,
  updateContactAfterConversation,
  generatePreBrief,
  explainDelta,
  getAllTrends,
  assessRelationshipHealth,
  aggregateEventDeltas,
} from './src/engines/reputation-engine.js';
import {
  scoreAlignment,
  generateSummary,
  updateStreak,
  getStreakMessage,
} from './src/engines/archetype-engine.js';
import {
  generateWhisper,
  evaluateQuietMode,
  generateEndOfConversationPrompt,
} from './src/engines/whisper-engine.js';
import {
  generateDebriefQuestions,
  generateTimeline,
  simulateAlternative,
  summarizeSimulation,
} from './src/engines/debrief-engine.js';

import type { ConversationEvent, MirrorSessionState } from './src/types.js';
import { DEFAULT_SESSION_STATE, ARCHETYPES } from './src/types.js';

// ─── Simulated Conversation Transcript ───────────────────────────────────────
// A meeting between the user and their boss (Alex) about a missed deadline.

const TRANSCRIPT: Array<{ speaker: 'user' | 'other'; text: string; delayMs: number }> = [
  { speaker: 'other', text: "So let's talk about the Q2 timeline. Why didn't you hit the deadline?", delayMs: 0 },
  { speaker: 'user', text: "I think the scope changed three times in two weeks. That's why.", delayMs: 500 },
  { speaker: 'other', text: "The scope changed because the market changed. You should have adapted.", delayMs: 800 },
  { speaker: 'user', text: "I don't think that's fair. We didn't have the resources.", delayMs: 600 },
  { speaker: 'other', text: "Everyone had the same resources. Other teams delivered.", delayMs: 700 },
  { speaker: 'user', text: "That's not the same thing and you know it.", delayMs: 500 },
  // [3 second pause — tension]
  { speaker: 'user', text: "Look, let's take a step back. What do you actually need from me right now?", delayMs: 3500 },
  { speaker: 'other', text: "I need you to own it and give me a revised plan by Friday.", delayMs: 800 },
  { speaker: 'user', text: "Fair enough. I can do that. I'll have something by Thursday.", delayMs: 600 },
  { speaker: 'other', text: "Good. And I appreciate you being direct about the scope issues. Let's fix it.", delayMs: 700 },
  { speaker: 'user', text: "Absolutely. I think we should also discuss the resource allocation for Q3.", delayMs: 500 },
];

// ─── Run Demo ────────────────────────────────────────────────────────────────

function runDemo() {
  console.log('\n' + '═'.repeat(70));
  console.log('  MIRROR — Behavioral Simulation Engine Demo');
  console.log('═'.repeat(70) + '\n');

  resetEventCounter();

  // ── Create contact ──────────────────────────────────────────────────────

  const alex = createContact('alex', 'Alex', 'boss');
  console.log(`📋 Contact loaded: ${alex.name} (${alex.relationship})`);
  console.log(`   Initial profile: trust=${alex.profile.trust}, composure=${alex.profile.composure}`);

  // ── Set up session state ────────────────────────────────────────────────

  const state: MirrorSessionState = {
    ...DEFAULT_SESSION_STATE,
    contacts: new Map([['alex', alex]]),
    conversation: {
      active: true,
      startTime: Date.now(),
      events: [],
      energy: 0,
      contactId: 'alex',
    },
    activeArchetype: 'ambassador',
    mode: 'archetype',
    maxWhispers: 4,
  };

  console.log(`\n🎭 Archetype: ${ARCHETYPES.ambassador.name} — "${ARCHETYPES.ambassador.tagline}"`);

  // ── Pre-brief ───────────────────────────────────────────────────────────

  const brief = generatePreBrief(alex);
  console.log(`\n📝 Pre-Brief:`);
  console.log(`   ${brief.trendSummary}`);
  console.log(`   ${brief.yourPattern}`);
  if (brief.archetypeTip) console.log(`   💡 ${brief.archetypeTip}`);

  // ── Process transcript ──────────────────────────────────────────────────

  console.log('\n' + '─'.repeat(70));
  console.log('  LIVE CONVERSATION (Shadow Mode Active)');
  console.log('─'.repeat(70) + '\n');

  let lastTimestamp = Date.now();

  for (const segment of TRANSCRIPT) {
    const now = lastTimestamp + segment.delayMs;
    const speakerLabel = segment.speaker === 'user' ? '  You' : 'Alex';

    console.log(`  ${speakerLabel}: "${segment.text}"`);

    // Silence detection
    if (segment.delayMs >= 3000) {
      const silenceEvent = detectSilence(
        segment.delayMs,
        state.conversation.events[state.conversation.events.length - 1] ?? null,
      );
      if (silenceEvent) {
        state.conversation.events.push(silenceEvent);
        console.log(`  ⏸️  [silence: ${(segment.delayMs / 1000).toFixed(1)}s]`);
      }
    }

    // Event detection
    const event = detectEvent(segment.text, segment.speaker, 2);
    if (event) {
      state.conversation.events.push(event);

      // Update ego states
      if (event.egoState) {
        if (event.speaker === 'user') state.egoStates.user = event.egoState.state;
        else state.egoStates.other = event.egoState.state;
      }

      // Update horseman
      if (event.horseman) state.activeHorseman = event.horseman.horseman;

      // Calculate emotional intensity
      state.emotionalIntensity = calculateEmotionalIntensity(state.conversation.events);

      // Run shadow simulation
      const shadow = runShadow({
        events: state.conversation.events,
        sessionDeltas: state.sessionDeltas,
        conflictRisk: state.emotionalIntensity * 0.8,
        emotionalIntensity: state.emotionalIntensity,
        userEgoState: state.egoStates.user,
        otherEgoState: state.egoStates.other,
        activeHorseman: state.activeHorseman,
        energy: state.conversation.energy,
      });

      // Update energy
      if (shadow.energyTrajectory === 'energizing') state.conversation.energy += 3;
      else if (shadow.energyTrajectory === 'draining') state.conversation.energy -= 3;

      // Try to generate whisper
      const whisper = generateWhisper(shadow, state, event);
      if (whisper) {
        console.log(`  👁️  WHISPER: "${whisper.text}"`);
        state.whispersDelivered++;
      }

      // Show event detection info
      const eventInfo = `[${event.type}] conf:${event.confidence.toFixed(2)} intensity:${event.intensity.toFixed(2)}`;
      if (event.horseman) {
        console.log(`  ⚠️  ${eventInfo} — HORSEMAN: ${event.horseman.horseman}`);
      } else if (event.egoState) {
        console.log(`  📊 ${eventInfo} — ego:${event.egoState.state}`);
      } else {
        console.log(`  📊 ${eventInfo}`);
      }

      // Accumulate session deltas
      for (const [dim, delta] of Object.entries(event.impact)) {
        const key = dim as keyof typeof state.sessionDeltas;
        (state.sessionDeltas as Record<string, number>)[key] =
          ((state.sessionDeltas as Record<string, number>)[key] ?? 0) + (delta as number);
      }
    }

    console.log('');
    lastTimestamp = now;
  }

  // ── End of Conversation ─────────────────────────────────────────────────

  console.log('─'.repeat(70));
  console.log('  END OF CONVERSATION');
  console.log('─'.repeat(70) + '\n');

  const events = state.conversation.events;

  // ── Archetype Summary ───────────────────────────────────────────────────

  const summary = generateSummary('ambassador', events, 0);
  console.log(`🎭 Archetype Summary: ${summary.name}`);
  console.log(`   Score: ${summary.score}%`);
  if (summary.strengths.length > 0) {
    console.log(`   Strengths:`);
    summary.strengths.forEach(s => console.log(`     + ${s}`));
  }
  if (summary.breakpoints.length > 0) {
    console.log(`   Breakpoints:`);
    summary.breakpoints.forEach(b => console.log(`     - ${b}`));
  }
  if (summary.streakMessage) {
    console.log(`   🔥 ${summary.streakMessage}`);
  }

  // ── Reputation Update ───────────────────────────────────────────────────

  console.log(`\n📈 Reputation Update (Alex):`);
  const deltas = aggregateEventDeltas(events);
  for (const [dim, delta] of Object.entries(deltas)) {
    if (Math.abs(delta as number) > 0.5) {
      const direction = (delta as number) > 0 ? '+' : '';
      console.log(`   ${dim}: ${direction}${(delta as number).toFixed(1)}`);
    }
  }

  const updatedAlex = updateContactAfterConversation(
    alex,
    events,
    state.conversation.energy,
    Date.now() - (state.conversation.startTime ?? Date.now()),
    summary.score,
    false,
  );

  console.log(`\n   Updated profile:`);
  const profile = getCurrentProfile(updatedAlex);
  console.log(`   trust: ${profile.trust.toFixed(1)} | composure: ${profile.composure.toFixed(1)} | influence: ${profile.influence.toFixed(1)}`);
  console.log(`   empathy: ${profile.empathy.toFixed(1)} | volatility: ${profile.volatility.toFixed(1)} | assertiveness: ${profile.assertiveness.toFixed(1)}`);
  console.log(`   Relationship health: ${assessRelationshipHealth(updatedAlex)}`);
  console.log(`   Energy: ${state.conversation.energy}`);

  // ── Causal Explanations ─────────────────────────────────────────────────

  console.log(`\n📝 Why (causal explanations):`);
  for (const event of events.slice(0, 5)) {
    for (const [dim, delta] of Object.entries(event.impact)) {
      if (Math.abs(delta as number) >= 3) {
        console.log(`   ${explainDelta(dim as keyof typeof profile, delta as number, event)}`);
      }
    }
  }

  // ── Debrief ─────────────────────────────────────────────────────────────

  console.log(`\n` + '─'.repeat(70));
  console.log('  DEBRIEF');
  console.log('─'.repeat(70) + '\n');

  const questions = generateDebriefQuestions(events);
  if (questions.length > 0) {
    console.log(`❓ Classification questions (${questions.length}):`);
    questions.forEach((q, i) => {
      console.log(`\n   ${i + 1}. ${q.question}`);
      q.options.forEach((opt, j) => {
        console.log(`      ${String.fromCharCode(97 + j)}) ${opt.label}`);
      });
    });
  } else {
    console.log('   All events classified with high confidence. No questions needed.');
  }

  // ── Timeline ────────────────────────────────────────────────────────────

  console.log(`\n📅 Timeline (key moments):`);
  const timeline = generateTimeline(events);
  const highlights = timeline.filter(t => t.isHighlight);
  highlights.forEach(h => {
    const icon = h.highlightReason?.includes('Trust') ? '💔' :
                 h.highlightReason?.includes('Conflict') ? '🔥' : '⭐';
    console.log(`   ${icon} ${h.formattedTime} — ${h.highlightReason}: "${h.transcript.substring(0, 40)}..."`);
  });

  // ── Simulation (What if?) ───────────────────────────────────────────────

  const firstEscalation = events.find(e => e.type === 'escalation' || e.type === 'disagreement');
  if (firstEscalation) {
    console.log(`\n🔄 Simulation: What if you had de-escalated instead?`);
    const sim = simulateAlternative(
      firstEscalation,
      'de_escalation',
      "I hear you. Let me think about how to address that.",
    );
    console.log(`   Original: "${firstEscalation.transcript.substring(0, 50)}..."`);
    console.log(`   Alternative: "${sim.alternativeResponse}"`);
    console.log(`   ${summarizeSimulation(sim)}`);
    sim.comparison.forEach(c => {
      const icon = c.direction === 'better' ? '✅' : c.direction === 'worse' ? '❌' : '➖';
      console.log(`   ${icon} ${c.dimension}: ${c.difference > 0 ? '+' : ''}${c.difference}`);
    });
  }

  // ── End of Conversation Prompt ──────────────────────────────────────────

  const endPrompt = generateEndOfConversationPrompt(
    state.conversation.energy,
    events.length,
    true,
    summary.score,
  );

  console.log(`\n💬 "${endPrompt}"`);

  // ── Pre-Brief for Next Conversation ─────────────────────────────────────

  console.log(`\n` + '─'.repeat(70));
  console.log('  NEXT TIME YOU MEET ALEX');
  console.log('─'.repeat(70) + '\n');

  const nextBrief = generatePreBrief(updatedAlex);
  console.log(`📝 Pre-Brief:`);
  console.log(`   ${nextBrief.trendSummary}`);
  console.log(`   ${nextBrief.yourPattern}`);
  if (nextBrief.archetypeTip) console.log(`   💡 ${nextBrief.archetypeTip}`);

  console.log('\n' + '═'.repeat(70));
  console.log('  Demo complete.');
  console.log('═'.repeat(70) + '\n');
}

runDemo();
