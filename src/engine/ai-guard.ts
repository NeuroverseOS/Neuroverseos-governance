/**
 * AI-Enhanced Guard — Structured Intent for Deterministic Governance
 *
 * "AI doesn't enforce policy. It makes policy enforceable."
 *
 * Deterministic governance requires clean intent. AI agents generate
 * messy text. This module bridges the gap:
 *
 *   AI classifies intent → Guard enforces policy
 *
 * Architecture:
 *   evaluateGuard()       — pure, sync, deterministic (unchanged)
 *   evaluateGuardWithAI() — async wrapper that structures intent first
 *
 * The deterministic engine is never modified. AI classification
 * is a preprocessing step that produces structured, clean intent.
 *
 * This means:
 *   - Rules stay simple (semantic labels, not regex gymnastics)
 *   - Worlds stay readable
 *   - Engine stays fast and auditable
 *   - Behavior becomes reliable
 *
 * Every verdict includes `intent_source` so rules and logs can
 * differentiate AI-classified intent from raw text fallback.
 */

import type { GuardEvent, GuardVerdict, GuardEngineOptions } from '../contracts/guard-contract';
import type { WorldDefinition } from '../types';
import type { AIProviderConfig } from '../contracts/derive-contract';
import { evaluateGuard } from './guard-engine';
import {
  classifyIntentWithAI,
  extractContentFields,
} from './intent-classifier';
import type { ClassifiedIntent, ContentFields } from './intent-classifier';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AIGuardOptions extends GuardEngineOptions {
  /** AI provider config. When set, enables intent classification. */
  ai?: AIProviderConfig;

  /**
   * Known intent labels from the world's intent_vocabulary.
   * Passed to the classifier so it can produce labels the guards expect.
   */
  knownIntents?: string[];

  /**
   * Pre-extracted content fields. If provided, skips auto-extraction
   * from event.args. Use this when you've already separated customer
   * input from AI output upstream.
   */
  contentFields?: ContentFields;

  /**
   * If true, fall back to raw intent when AI classification fails.
   * Default: true.
   */
  fallbackOnError?: boolean;
}

/**
 * How the intent was produced — critical for audit and debugging.
 *
 * - 'ai': Intent was classified by an LLM (structured, semantic)
 * - 'raw': Intent is the original unprocessed text (regex-matched)
 * - 'fallback': AI classification was attempted but failed, fell back to raw
 */
export type IntentSource = 'ai' | 'raw' | 'fallback';

/**
 * Extended verdict with AI classification metadata.
 */
export interface AIGuardVerdict extends GuardVerdict {
  /** How the intent was produced: 'ai' | 'raw' | 'fallback' */
  intent_source: IntentSource;

  /** AI classification result (present when intent_source is 'ai') */
  classification?: ClassifiedIntent;

  /** The original intent before AI classification */
  originalIntent?: string;
}

// ─── Main Function ──────────────────────────────────────────────────────────

/**
 * Evaluate a guard event with optional AI intent classification.
 *
 * When `options.ai` is provided:
 *   1. Extracts content fields from the event
 *   2. Classifies intent via LLM
 *   3. Runs evaluateGuard with the classified intent
 *
 * When `options.ai` is not provided:
 *   Falls through to evaluateGuard() directly.
 */
export async function evaluateGuardWithAI(
  event: GuardEvent,
  world: WorldDefinition,
  options: AIGuardOptions = {},
): Promise<AIGuardVerdict> {
  // No AI config → fall through to deterministic engine
  if (!options.ai) {
    const verdict = evaluateGuard(event, world, options) as AIGuardVerdict;
    verdict.intent_source = 'raw';
    return verdict;
  }

  const fallbackOnError = options.fallbackOnError ?? true;
  const originalIntent = event.intent;

  // Extract known intents from the world's intent vocabulary
  const knownIntents = options.knownIntents ?? extractKnownIntents(world);

  // Get content fields (from options, auto-extract, or raw)
  const contentFields = options.contentFields
    ?? extractContentFields(event.intent, event.args);

  try {
    // Classify intent via LLM
    const classification = await classifyIntentWithAI(contentFields, {
      ai: options.ai,
      knownIntents,
    });

    // Build a new event with the classified intent
    const classifiedEvent: GuardEvent = {
      ...event,
      intent: classification.intent,
    };

    // Run the deterministic engine with the clean intent
    const verdict = evaluateGuard(classifiedEvent, world, options) as AIGuardVerdict;

    // Attach classification metadata
    verdict.intent_source = 'ai';
    verdict.classification = classification;
    verdict.originalIntent = originalIntent;

    return verdict;
  } catch (err) {
    if (fallbackOnError) {
      // AI classification failed — fall back to raw intent
      const verdict = evaluateGuard(event, world, options) as AIGuardVerdict;
      verdict.intent_source = 'fallback';
      verdict.originalIntent = originalIntent;
      return verdict;
    }
    throw err;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract known intent labels from a world's intent vocabulary.
 * These are passed to the classifier so it can produce labels
 * that the world's guards are designed to match.
 */
function extractKnownIntents(world: WorldDefinition): string[] {
  const vocab = world.guards?.intent_vocabulary;
  if (!vocab) return [];
  return Object.keys(vocab);
}
