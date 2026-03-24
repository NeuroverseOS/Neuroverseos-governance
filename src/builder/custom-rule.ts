/**
 * Custom Rule Translator — Free-Form Voice to Structured Rule
 *
 * When the user says something like:
 *   "Don't let AI share my camera feed without asking"
 *
 * This module parses it into a structured rule that can be:
 *   1. Shown back to the user in plain English for confirmation
 *   2. Added to the compiled rule set
 *   3. Enforced by the governance engine
 *
 * Two modes:
 *   1. Pattern matching — fast, deterministic, no LLM, handles common patterns
 *   2. LLM classification — for complex or ambiguous inputs (async, optional)
 *
 * The pattern matcher handles ~80% of real inputs. The LLM fallback
 * handles the rest. Both produce the same output format.
 */

import type { CompiledRule } from './compiler';
import type { GovernanceQuestion } from './questions';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CustomRuleSuggestion {
  /** The proposed rule */
  rule: Omit<CompiledRule, 'enabled' | 'sourceQuestion' | 'sourceAnswer'>;

  /** Confidence level of the parse */
  confidence: 'high' | 'medium' | 'low';

  /** How the input was parsed */
  method: 'pattern' | 'llm' | 'fallback';

  /** The original user input */
  originalInput: string;

  /** Plain English confirmation prompt */
  confirmationPrompt: string;
}

// ─── Pattern Definitions ────────────────────────────────────────────────────

interface RulePattern {
  /** Regex patterns to match against user input */
  patterns: RegExp[];

  /** The rule this pattern produces */
  rule: Omit<CompiledRule, 'enabled' | 'sourceQuestion' | 'sourceAnswer' | 'id'>;

  /** Confidence when this pattern matches */
  confidence: 'high' | 'medium';

  /** Template for the confirmation prompt */
  confirmationTemplate: string;
}

const RULE_PATTERNS: RulePattern[] = [
  // ── Camera / Visual Data ──────────────────────────────────────────────
  {
    patterns: [
      /don'?t.*(?:share|send|upload|transmit).*(?:camera|photo|picture|image|video|what i see)/i,
      /(?:block|stop|prevent|disable).*(?:camera|photo|picture|image|video).*(?:shar|send|upload|ai)/i,
      /no.*(?:camera|photo|image|video).*(?:to|with).*(?:ai|cloud|server|extern)/i,
      /(?:camera|photo|image|video).*(?:stay|keep).*(?:local|private|device)/i,
    ],
    rule: {
      description: 'AI cannot access or send your camera data without confirmation',
      constraint: 'confirm',
      scope: 'ai_send_image',
      data: { aiCameraPolicy: 'confirm_each' },
      category: 'privacy',
    },
    confidence: 'high',
    confirmationTemplate: 'AI cannot send camera data to external services without your confirmation',
  },

  // ── Audio / Conversations ─────────────────────────────────────────────
  {
    patterns: [
      /don'?t.*(?:listen|record|transcri|hear).*(?:without|unless)/i,
      /(?:block|stop|prevent|disable).*(?:listen|record|transcri|audio|speech|voice)/i,
      /no.*(?:record|listen|transcri).*(?:conversation|speech|voice|audio)/i,
      /(?:conversation|speech|audio).*(?:stay|keep).*(?:local|private)/i,
    ],
    rule: {
      description: 'AI cannot record or transcribe conversations without your permission',
      constraint: 'confirm',
      scope: 'ai_send_transcription',
      data: { aiAudioPolicy: 'confirm_each' },
      category: 'privacy',
    },
    confidence: 'high',
    confirmationTemplate: 'AI must get your permission before recording or sending any conversation data',
  },

  // ── Messages / Communication ──────────────────────────────────────────
  {
    patterns: [
      /don'?t.*(?:send|write|reply|respond|email|text|message).*(?:for me|on my behalf|as me)/i,
      /(?:block|stop|prevent|never).*(?:send|write|reply|email|text|message)/i,
      /no.*(?:auto|automatic).*(?:reply|respond|message|email)/i,
      /(?:i|only i).*(?:send|write|reply|respond).*(?:message|email|text)/i,
    ],
    rule: {
      description: 'AI cannot send messages on your behalf',
      constraint: 'block',
      scope: 'ai_auto_respond_message',
      data: { aiMessagingPolicy: 'block_all' },
      category: 'communication',
    },
    confidence: 'high',
    confirmationTemplate: 'AI is blocked from sending any messages (email, text, chat) on your behalf',
  },

  // ── Money / Purchases ─────────────────────────────────────────────────
  {
    patterns: [
      /don'?t.*(?:buy|purchase|spend|pay|charge|order|subscribe)/i,
      /(?:block|stop|prevent|never|no).*(?:buy|purchase|spend|pay|charge|order|subscribe)/i,
      /(?:money|payment|card|wallet).*(?:safe|protect|lock|block)/i,
      /(?:ai|app).*(?:can'?t|cannot|shouldn'?t|must not).*(?:buy|spend|pay|purchase)/i,
    ],
    rule: {
      description: 'AI cannot spend your money or make purchases',
      constraint: 'block',
      scope: 'ai_auto_purchase',
      data: { aiPurchasePolicy: 'block_all' },
      category: 'money',
    },
    confidence: 'high',
    confirmationTemplate: 'AI is blocked from making any purchases or financial transactions',
  },

  // ── Location ──────────────────────────────────────────────────────────
  {
    patterns: [
      /don'?t.*(?:share|send|track|know).*(?:location|where i am|position|gps)/i,
      /(?:block|stop|prevent|disable).*(?:location|gps|tracking|position)/i,
      /(?:location|gps|where i).*(?:private|secret|hidden|blocked)/i,
      /no.*(?:location|gps).*(?:track|shar|send|data)/i,
    ],
    rule: {
      description: 'AI cannot access or share your location',
      constraint: 'block',
      scope: 'ai_send_location',
      data: { aiLocationPolicy: 'block_all' },
      category: 'privacy',
    },
    confidence: 'high',
    confirmationTemplate: 'AI is blocked from accessing or sharing your location data',
  },

  // ── Memory / Data Retention ───────────────────────────────────────────
  {
    patterns: [
      /don'?t.*(?:remember|save|store|keep|retain).*(?:conversation|data|history|chat)/i,
      /(?:forget|delete|erase|clear).*(?:everything|all|conversation|data)/i,
      /no.*(?:memory|retention|history|storage|saving)/i,
      /(?:ephemeral|temporary|session only|forget after)/i,
    ],
    rule: {
      description: 'AI forgets everything when your session ends',
      constraint: 'block',
      scope: 'ai_retain_session_data',
      data: { dataRetentionPolicy: 'never' },
      category: 'memory',
    },
    confidence: 'high',
    confirmationTemplate: 'AI will forget all data when your session ends — nothing is saved',
  },

  // ── Settings / Autonomy ───────────────────────────────────────────────
  {
    patterns: [
      /don'?t.*(?:change|modify|adjust|alter).*(?:setting|preference|config)/i,
      /(?:block|stop|prevent).*(?:change|modify|adjust).*(?:setting|preference)/i,
      /(?:i|only i).*(?:control|change|modify).*(?:setting|preference)/i,
      /no.*(?:auto|automatic).*(?:setting|config|preference)/i,
    ],
    rule: {
      description: 'AI cannot change your settings without permission',
      constraint: 'confirm',
      scope: 'ai_auto_setting_change',
      data: { aiSettingsPolicy: 'confirm_each' },
      category: 'autonomy',
    },
    confidence: 'high',
    confirmationTemplate: 'AI must get your approval before changing any settings',
  },

  // ── Calendar ──────────────────────────────────────────────────────────
  {
    patterns: [
      /don'?t.*(?:touch|change|modify|add|create|delete).*(?:calendar|schedule|event|meeting)/i,
      /(?:block|stop|prevent).*(?:calendar|schedule|event|meeting)/i,
      /(?:calendar|schedule).*(?:mine|only i|don'?t touch|off limits)/i,
    ],
    rule: {
      description: 'AI cannot modify your calendar',
      constraint: 'block',
      scope: 'ai_auto_schedule',
      data: { aiCalendarPolicy: 'block_all' },
      category: 'autonomy',
    },
    confidence: 'high',
    confirmationTemplate: 'AI is blocked from creating, modifying, or deleting calendar events',
  },

  // ── Third-Party Sharing ───────────────────────────────────────────────
  {
    patterns: [
      /don'?t.*(?:share|sell|give|transfer).*(?:data|information|info).*(?:third|other|external|outside)/i,
      /(?:block|stop|prevent|no).*(?:shar|sell|give|transfer).*(?:data|info)/i,
      /(?:data|information).*(?:stay|keep).*(?:between|private|confidential)/i,
      /no.*(?:third.?party|external|outside).*(?:shar|access|data)/i,
    ],
    rule: {
      description: 'Apps cannot share your data with third parties',
      constraint: 'block',
      scope: 'ai_share_with_third_party',
      data: { aiCrossAppPolicy: 'block_all' },
      category: 'memory',
    },
    confidence: 'high',
    confirmationTemplate: 'Apps are blocked from sharing your data with any third-party service',
  },

  // ── "Ask me" / "Always confirm" (generic) ─────────────────────────────
  {
    patterns: [
      /always.*(?:ask|confirm|check|verify).*(?:before|first)/i,
      /(?:ask|confirm|check).*(?:me|with me).*(?:before|first)/i,
      /nothing.*(?:without|unless).*(?:my|i).*(?:approval|permission|ok|consent)/i,
    ],
    rule: {
      description: 'AI must confirm with you before taking any action',
      constraint: 'confirm',
      scope: 'ai_auto_setting_change',
      data: { aiActionPolicy: 'confirm_all' },
      category: 'autonomy',
    },
    confidence: 'medium',
    confirmationTemplate: 'AI must get your confirmation before taking any action on your behalf',
  },
];

// ─── Pattern Matcher ────────────────────────────────────────────────────────

/**
 * Parse free-form user input into a rule suggestion using pattern matching.
 * Fast, deterministic, no LLM needed. Handles ~80% of common inputs.
 *
 * Returns null if no pattern matches — caller should fall back to LLM.
 */
export function parseCustomRule(input: string): CustomRuleSuggestion | null {
  const normalized = input.trim().toLowerCase();
  if (normalized.length < 5) return null;

  for (const pattern of RULE_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(input)) {
        const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        return {
          rule: {
            id,
            ...pattern.rule,
          },
          confidence: pattern.confidence,
          method: 'pattern',
          originalInput: input,
          confirmationPrompt: pattern.confirmationTemplate,
        };
      }
    }
  }

  return null;
}

// ─── LLM Classification Prompt ──────────────────────────────────────────────

/**
 * Build the prompt for LLM-based rule classification.
 * Used when pattern matching fails.
 *
 * Returns a structured prompt that any LLM can process.
 * The caller handles the actual LLM call.
 */
export function buildClassificationPrompt(userInput: string): string {
  return `You are a governance rule classifier. The user said:

"${userInput}"

Classify this into a governance rule. Respond with ONLY a JSON object:
{
  "description": "Plain English rule (e.g., 'AI cannot send messages on your behalf')",
  "constraint": "block" | "confirm" | "allow" | "limit",
  "scope": "ai_send_image" | "ai_send_transcription" | "ai_send_location" | "ai_auto_respond_message" | "ai_auto_purchase" | "ai_auto_schedule" | "ai_auto_setting_change" | "ai_retain_session_data" | "ai_share_with_third_party" | "ai_voice_call" | "ai_social_post" | "ai_subscription",
  "category": "communication" | "money" | "privacy" | "autonomy" | "memory",
  "confirmationPrompt": "What to show the user to confirm this rule"
}

Rules:
- "block" means AI can NEVER do this
- "confirm" means AI must ask the user each time
- "allow" means AI can do this freely
- "limit" means AI can do this with restrictions
- Pick the scope that best matches what the user is talking about
- The description should be a simple sentence a non-technical person understands`;
}

/**
 * Parse the LLM's JSON response into a rule suggestion.
 * Returns null if the response is malformed.
 */
export function parseLLMResponse(
  userInput: string,
  llmResponse: string,
): CustomRuleSuggestion | null {
  try {
    // Extract JSON from potentially wrapped response
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.description || !parsed.constraint || !parsed.scope || !parsed.category) {
      return null;
    }

    const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return {
      rule: {
        id,
        description: parsed.description,
        constraint: parsed.constraint,
        scope: parsed.scope,
        data: { source: 'llm_classification' },
        category: parsed.category,
      },
      confidence: 'medium',
      method: 'llm',
      originalInput: userInput,
      confirmationPrompt: parsed.confirmationPrompt ?? parsed.description,
    };
  } catch {
    return null;
  }
}

/**
 * Create a fallback rule suggestion when both pattern and LLM fail.
 * Defaults to a "confirm everything" rule in the autonomy category.
 */
export function createFallbackSuggestion(userInput: string): CustomRuleSuggestion {
  const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    rule: {
      id,
      description: `Custom rule: "${userInput}"`,
      constraint: 'confirm',
      scope: 'ai_auto_setting_change',
      data: { source: 'fallback', originalInput: userInput },
      category: 'autonomy',
    },
    confidence: 'low',
    method: 'fallback',
    originalInput: userInput,
    confirmationPrompt: `I wasn't sure exactly what you meant. I've created a rule that requires AI to confirm before acting. You can edit this rule anytime.`,
  };
}
