/**
 * Intent Classifier — AI-Powered Intent Separation
 *
 * Solves the false-positive problem where AI-generated text (like
 * "I am escalating your request") triggers guard rules meant for
 * customer-initiated actions.
 *
 * The classifier takes structured content fields (customer input,
 * AI draft reply, etc.) and uses an LLM to produce a clean intent
 * label that the deterministic guard engine can match against.
 *
 * Flow:
 *   Raw content fields → LLM classification → clean intent label
 *   → evaluateGuard() (deterministic, sub-ms)
 *
 * The guard engine stays pure and deterministic. The AI call happens
 * upstream, where it belongs.
 */

import type { AIProviderConfig } from '../contracts/derive-contract';
import { createProvider } from '../providers/ai-provider';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Structured content fields that separate who said what.
 *
 * Instead of dumping everything into one `intent` string,
 * callers provide labeled fields so the classifier can
 * distinguish customer input from AI output.
 */
export interface ContentFields {
  /** What the customer/user actually said or wrote */
  customer_input?: string;

  /** The AI agent's draft reply or response */
  draft_reply?: string;

  /** The tool or action being invoked */
  tool?: string;

  /** Any additional context (metadata, subject line, etc.) */
  context?: string;

  /** Raw combined text (fallback if no structured fields) */
  raw?: string;
}

/**
 * Result of AI intent classification.
 */
export interface ClassifiedIntent {
  /** Clean intent label (e.g. "shipping_inquiry", "complaint_escalation") */
  intent: string;

  /** Confidence score 0-1 */
  confidence: number;

  /** Which actor initiated the action (customer, ai_agent, system) */
  actor: 'customer' | 'ai_agent' | 'system' | 'unknown';

  /** Brief explanation of the classification */
  reasoning: string;
}

export interface IntentClassifierOptions {
  /** AI provider configuration */
  ai: AIProviderConfig;

  /** Optional list of valid intent labels the world expects */
  knownIntents?: string[];

  /** Maximum tokens for the classification call. Default: 256 */
  maxTokens?: number;
}

// ─── System Prompt ──────────────────────────────────────────────────────────

function buildSystemPrompt(knownIntents?: string[]): string {
  let prompt = `You are an intent classifier for an AI governance system. Your job is to analyze structured content fields and produce a clean, semantic intent label.

CRITICAL RULES:
1. Distinguish WHO is performing the action. If the AI agent says "I am escalating your request", that is the AI being polite — NOT the customer demanding escalation.
2. Focus on the CUSTOMER'S actual intent, not the AI's response language.
3. Return a short, snake_case intent label (e.g. "shipping_inquiry", "complaint_escalation", "password_reset").
4. Assess the actor: who initiated this action? The customer, the AI agent, or the system?

You must respond with ONLY valid JSON in this exact format:
{"intent": "<label>", "confidence": <0-1>, "actor": "<customer|ai_agent|system|unknown>", "reasoning": "<one sentence>"}`;

  if (knownIntents && knownIntents.length > 0) {
    prompt += `\n\nPreferred intent labels (use these when applicable, but you may create new ones if none fit):\n${knownIntents.map(i => `- ${i}`).join('\n')}`;
  }

  return prompt;
}

function buildUserPrompt(fields: ContentFields): string {
  const parts: string[] = [];

  if (fields.customer_input) {
    parts.push(`CUSTOMER INPUT:\n${fields.customer_input}`);
  }
  if (fields.draft_reply) {
    parts.push(`AI DRAFT REPLY:\n${fields.draft_reply}`);
  }
  if (fields.tool) {
    parts.push(`TOOL: ${fields.tool}`);
  }
  if (fields.context) {
    parts.push(`CONTEXT: ${fields.context}`);
  }
  if (fields.raw && parts.length === 0) {
    parts.push(`RAW TEXT:\n${fields.raw}`);
  }

  return parts.join('\n\n');
}

// ─── Classifier ─────────────────────────────────────────────────────────────

/**
 * Classify intent using an LLM.
 *
 * Takes structured content fields and returns a clean intent label
 * suitable for deterministic guard evaluation.
 */
export async function classifyIntentWithAI(
  fields: ContentFields,
  options: IntentClassifierOptions,
): Promise<ClassifiedIntent> {
  const provider = createProvider(options.ai);
  const systemPrompt = buildSystemPrompt(options.knownIntents);
  const userPrompt = buildUserPrompt(fields);

  const response = await provider.complete(systemPrompt, userPrompt);

  // Parse JSON response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Intent classifier returned non-JSON response');
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    intent?: string;
    confidence?: number;
    actor?: string;
    reasoning?: string;
  };

  if (!parsed.intent || typeof parsed.intent !== 'string') {
    throw new Error('Intent classifier returned invalid intent label');
  }

  return {
    intent: parsed.intent,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    actor: (['customer', 'ai_agent', 'system', 'unknown'] as const).includes(
      parsed.actor as 'customer' | 'ai_agent' | 'system' | 'unknown',
    )
      ? (parsed.actor as ClassifiedIntent['actor'])
      : 'unknown',
    reasoning: parsed.reasoning ?? '',
  };
}

// ─── Content Field Extraction ───────────────────────────────────────────────

/**
 * Known field names that contain content which should NOT be
 * regex-matched as "intent" — they're output text, not intent.
 */
const OUTPUT_CONTENT_FIELDS = new Set([
  'draft_reply',
  'content',
  'body',
  'message',
  'text',
  'reply',
  'response',
  'output',
  'html',
  'template',
]);

/**
 * Extract structured content fields from a GuardEvent's args.
 *
 * Separates content fields (AI output, email body, etc.) from
 * the intent, so they can be classified properly instead of
 * being regex-matched as intent text.
 */
export function extractContentFields(
  intent: string,
  args?: Record<string, unknown>,
): ContentFields {
  if (!args) {
    return { raw: intent };
  }

  const fields: ContentFields = {};
  let hasStructuredContent = false;

  for (const [key, value] of Object.entries(args)) {
    if (typeof value !== 'string') continue;

    const lowerKey = key.toLowerCase();
    if (OUTPUT_CONTENT_FIELDS.has(lowerKey)) {
      // This is AI-generated content — separate it
      fields.draft_reply = fields.draft_reply
        ? `${fields.draft_reply}\n\n${value}`
        : value;
      hasStructuredContent = true;
    }
  }

  if (hasStructuredContent) {
    // Intent without the content fields is the actual action
    fields.customer_input = intent;
  } else {
    fields.raw = intent;
  }

  return fields;
}
