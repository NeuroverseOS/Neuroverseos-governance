/**
 * AI-Enhanced Guard — Async Wrapper for evaluateGuard
 *
 * Adds optional AI intent classification before the deterministic
 * guard engine runs. This solves the false-positive problem where
 * AI-generated text triggers rules meant for customer actions.
 *
 * Architecture:
 *   evaluateGuard()       — pure, sync, deterministic (unchanged)
 *   evaluateGuardWithAI() — async wrapper that classifies first
 *
 * The deterministic engine is never modified. AI classification
 * is a preprocessing step that produces a clean intent label.
 *
 * When AI classification is enabled:
 *   1. Extract content fields from event args
 *   2. Call LLM to classify the actual intent
 *   3. Replace event.intent with the classified label
 *   4. Run evaluateGuard() with the clean intent
 *   5. Attach classification metadata to the verdict
 *
 * When AI classification is disabled or fails:
 *   Falls back to evaluateGuard() with the original intent.
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
 * Extended verdict with AI classification metadata.
 */
export interface AIGuardVerdict extends GuardVerdict {
  /** AI classification result (present when AI was used) */
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
    return evaluateGuard(event, world, options);
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
    verdict.classification = classification;
    verdict.originalIntent = originalIntent;

    return verdict;
  } catch (err) {
    if (fallbackOnError) {
      // AI failed — fall back to raw intent
      const verdict = evaluateGuard(event, world, options) as AIGuardVerdict;
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
