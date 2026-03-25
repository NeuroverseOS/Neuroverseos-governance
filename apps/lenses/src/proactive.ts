/**
 * Proactive Perspective Engine
 *
 * Inspired by Merge's proactive classification architecture.
 * Instead of routing to FactChecker/WebSearch/Definer,
 * this routes to the Lenses philosophy engine.
 *
 * Merge's insight: not every utterance deserves a response.
 * Most of the time, SILENT is the right answer. But when
 * a moment calls for perspective — the philosophy engine delivers.
 *
 * Classification hierarchy (same structure as Merge's Initial Agent):
 *   1. Is this ignorable? → SILENT (most of the time)
 *   2. Does this moment need perspective? → PERSPECTIVE
 *   3. Should we use a tool instead? → ROUTE (to Merge's specialists)
 *   4. Fallback → SILENT
 *
 * Frequency modes (borrowed from Merge):
 *   - high: Proactive — surface perspectives frequently
 *   - medium: Selective — only when the moment clearly calls for it
 *   - low: Minimal — only for emotionally charged or high-stakes moments
 *
 * Duplicate prevention (borrowed from Merge):
 *   - String similarity matching against recent perspectives
 *   - Don't repeat the same insight twice
 */

import type { PhilosophyWorld, Voice } from './worlds/philosophy-loader';
import { buildSystemPrompt } from './worlds/philosophy-loader';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ProactiveFrequency = 'high' | 'medium' | 'low' | 'off';

export type ProactiveAction = 'SILENT' | 'PERSPECTIVE' | 'ROUTE';

export interface ProactiveClassification {
  action: ProactiveAction;
  reasoning: string;
  /** If PERSPECTIVE, which mode the AI should lean toward */
  suggestedMode?: 'translate' | 'reflect' | 'challenge' | 'teach' | 'direct';
  /** If ROUTE, where to route (back to Merge's specialists) */
  routeTarget?: string;
  routePayload?: string;
}

export interface PerspectiveInsight {
  text: string;
  mode: string;
  timestamp: number;
  voiceId: string;
}

// ─── Classification Prompts ─────────────────────────────────────────────────

const CLASSIFIER_SYSTEM_PROMPT_HIGH = `You are a perspective classifier for smart glasses. You listen to conversation fragments and decide: does this moment need a philosophical perspective?

You are NOT a general AI assistant. You do NOT answer questions. You ONLY classify.

## Decision Hierarchy (follow in order)

1. IGNORABLE? Small talk, greetings, logistics ("pass the salt", "see you at 3"), background noise, pleasantries → SILENT
2. PERSPECTIVE-WORTHY? Someone expressed frustration, made a decision, faced conflict, showed vulnerability, stated a belief, made an excuse, avoided something, or is at a crossroads → PERSPECTIVE
3. FACTUAL NEED? Someone needs a definition, fact-check, search, or calculation → ROUTE
4. FALLBACK → SILENT

## When to say PERSPECTIVE

You should lean toward PERSPECTIVE when you hear:
- Emotional tension ("I'm so frustrated", "I don't know what to do")
- Decision moments ("Should I take the job?", "I'm thinking about...")
- Conflict ("They always do this", "I can't believe she said that")
- Self-limiting beliefs ("I'm not good enough", "I can't do that")
- Avoidance ("I'll deal with it later", "It's not that important")
- Vulnerability ("I'm scared", "What if I fail?")
- Wins that aren't being celebrated ("It went okay I guess")

## Suggest a Mode

If PERSPECTIVE, suggest which mode fits best:
- translate: They need to see the situation differently
- reflect: They need to look inward
- challenge: They're stuck, making excuses, or holding a weak belief
- teach: They'd benefit from understanding a principle
- direct: They need a clear recommendation

## Output Format (JSON only)

{"action":"SILENT","reasoning":"small talk"}
{"action":"PERSPECTIVE","reasoning":"user expressed frustration about boss","suggestedMode":"translate"}
{"action":"ROUTE","reasoning":"asked about weather","routeTarget":"weather","routePayload":"current weather"}`;

const CLASSIFIER_SYSTEM_PROMPT_MEDIUM = `You are a perspective classifier for smart glasses. You listen to conversation fragments and decide: does this moment CLEARLY need a philosophical perspective?

Be selective. Only respond to moments with real emotional weight or decision significance.

## Decision Hierarchy

1. IGNORABLE? Small talk, logistics, background noise, casual chat, opinions about food/weather/sports → SILENT
2. CLEARLY PERSPECTIVE-WORTHY? Strong emotion, major decision, active conflict, explicit self-doubt, clear avoidance of something important → PERSPECTIVE
3. FACTUAL NEED? → ROUTE
4. UNCERTAIN? → SILENT (when in doubt, stay quiet)

## Output Format (JSON only)

{"action":"SILENT","reasoning":"casual conversation"}
{"action":"PERSPECTIVE","reasoning":"user facing a major career decision","suggestedMode":"reflect"}
{"action":"ROUTE","reasoning":"needs a definition","routeTarget":"definer","routePayload":"term to define"}`;

const CLASSIFIER_SYSTEM_PROMPT_LOW = `You are a perspective classifier for smart glasses. You ONLY speak up for mission-critical moments — high emotional stakes, dangerous self-deception, or moments the user will regret not getting perspective on.

## Decision Hierarchy

1. Is someone in emotional distress, making a life-altering decision, or about to say something they'll regret? → PERSPECTIVE
2. Everything else → SILENT

Be extremely conservative. The user chose low frequency because they don't want interruptions. Only break silence when it truly matters.

## Output Format (JSON only)

{"action":"SILENT","reasoning":"not mission-critical"}
{"action":"PERSPECTIVE","reasoning":"user about to make an irreversible decision in anger","suggestedMode":"direct"}`;

const CLASSIFIER_PROMPTS: Record<ProactiveFrequency, string> = {
  high: CLASSIFIER_SYSTEM_PROMPT_HIGH,
  medium: CLASSIFIER_SYSTEM_PROMPT_MEDIUM,
  low: CLASSIFIER_SYSTEM_PROMPT_LOW,
};

// ─── Proactive Engine ───────────────────────────────────────────────────────

/** How many recent perspectives to cache for deduplication */
const PERSPECTIVE_CACHE_SIZE = 10;

/** Similarity threshold (0-1) above which we consider a perspective duplicate */
const SIMILARITY_THRESHOLD = 0.6;

export class ProactiveEngine {
  private frequency: ProactiveFrequency;
  private recentPerspectives: PerspectiveInsight[] = [];
  private conversationBuffer: Array<{ text: string; timestamp: number }> = [];
  private maxConversationEntries = 20;

  constructor(frequency: ProactiveFrequency = 'medium') {
    this.frequency = frequency;
  }

  setFrequency(freq: ProactiveFrequency): void {
    this.frequency = freq;
  }

  getFrequency(): ProactiveFrequency {
    return this.frequency;
  }

  /**
   * Add a transcription to the conversation buffer.
   * Called on every utterance — most will result in SILENT.
   */
  addUtterance(text: string): void {
    this.conversationBuffer.push({ text, timestamp: Date.now() });
    if (this.conversationBuffer.length > this.maxConversationEntries) {
      this.conversationBuffer = this.conversationBuffer.slice(-this.maxConversationEntries);
    }
  }

  /**
   * Get the recent conversation as a single string for the classifier.
   */
  getRecentConversation(maxEntries: number = 10): string {
    return this.conversationBuffer
      .slice(-maxEntries)
      .map(e => e.text)
      .join('\n');
  }

  /**
   * Classify the current moment: SILENT, PERSPECTIVE, or ROUTE.
   *
   * This is the equivalent of Merge's processConversation() →
   * Initial Agent classification. But instead of routing to
   * FactChecker/WebSearch, we route to the philosophy engine.
   *
   * @param callAI - Function to call the user's AI provider
   */
  async classify(
    callAI: (systemPrompt: string, userMessage: string) => Promise<string>,
  ): Promise<ProactiveClassification> {
    const conversation = this.getRecentConversation();
    if (!conversation.trim()) {
      return { action: 'SILENT', reasoning: 'no conversation' };
    }

    const classifierPrompt = CLASSIFIER_PROMPTS[this.frequency];

    try {
      const raw = await callAI(
        classifierPrompt,
        `Recent conversation:\n${conversation}`,
      );

      // Parse JSON response
      const cleaned = raw.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(cleaned) as ProactiveClassification;

      if (!parsed.action || !['SILENT', 'PERSPECTIVE', 'ROUTE'].includes(parsed.action)) {
        return { action: 'SILENT', reasoning: 'invalid classification' };
      }

      return parsed;
    } catch {
      // If classification fails, stay silent — never crash the experience
      return { action: 'SILENT', reasoning: 'classification error' };
    }
  }

  /**
   * Build a proactive perspective prompt.
   *
   * Takes the classification result and builds a user message
   * that tells the philosophy engine what kind of perspective to give.
   * The system prompt is already loaded from the world file.
   */
  buildPerspectivePrompt(classification: ProactiveClassification): string {
    const conversation = this.getRecentConversation(5);
    const modeHint = classification.suggestedMode
      ? `Lean toward ${classification.suggestedMode.toUpperCase()} mode.`
      : '';

    return `[PROACTIVE — The user didn't ask for this. You noticed something in their conversation that deserves a perspective. Be brief, be relevant, don't explain why you're speaking up — just give the insight.]\n\n${modeHint}\n\nRecent conversation:\n${conversation}`;
  }

  /**
   * Check if a perspective is too similar to a recent one.
   * Borrowed from Merge's string-similarity deduplication.
   */
  isDuplicate(text: string): boolean {
    const normalized = text.toLowerCase().trim();

    for (const recent of this.recentPerspectives) {
      const similarity = computeSimilarity(normalized, recent.text.toLowerCase().trim());
      if (similarity > SIMILARITY_THRESHOLD) {
        return true;
      }
    }

    return false;
  }

  /**
   * Record a perspective that was shown to the user.
   * Used for deduplication.
   */
  recordPerspective(insight: PerspectiveInsight): void {
    this.recentPerspectives.push(insight);
    if (this.recentPerspectives.length > PERSPECTIVE_CACHE_SIZE) {
      this.recentPerspectives = this.recentPerspectives.slice(-PERSPECTIVE_CACHE_SIZE);
    }
  }

  /**
   * Clean up — clear buffers.
   */
  destroy(): void {
    this.conversationBuffer = [];
    this.recentPerspectives = [];
  }
}

// ─── String Similarity (lightweight, no dependency) ─────────────────────────

/**
 * Compute similarity between two strings using bigram overlap.
 * Returns 0-1 where 1 is identical. Lightweight alternative to
 * the string-similarity npm package that Merge uses.
 */
function computeSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bigram = a.substring(i, i + 2);
    bigramsA.set(bigram, (bigramsA.get(bigram) ?? 0) + 1);
  }

  let intersections = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bigram = b.substring(i, i + 2);
    const count = bigramsA.get(bigram) ?? 0;
    if (count > 0) {
      bigramsA.set(bigram, count - 1);
      intersections++;
    }
  }

  return (2 * intersections) / (a.length + b.length - 2);
}
