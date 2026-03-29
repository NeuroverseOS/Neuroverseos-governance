// Bevia — Align Strategy Ingestion Engine
// Parses uploaded strategy/culture docs into a governance world file
// This is the heavy AI step (15 credits) — runs once per strategy upload

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, errorResponse, jsonResponse } from '../shared/auth.ts';
import { checkCredits, deductCredits, refundCredits } from '../shared/credits.ts';
import { callGemini } from '../shared/gemini.ts';

const CREDIT_COST = 15;

interface IngestRequest {
  strategyName: string;
  documents: { name: string; content: string }[]; // pre-extracted text from PDFs/DOCX
}

serve(async (req: Request) => {
  const auth = await authenticate(req);
  if (!auth.ok) return errorResponse(auth.error!, 401);

  const body: IngestRequest = await req.json();
  const { strategyName, documents } = body;

  if (!strategyName?.trim()) return errorResponse('Strategy name required', 400);
  if (!documents?.length) return errorResponse('At least one document required', 400);

  // Check credits
  const creditCheck = await checkCredits(auth.supabase, auth.userId, CREDIT_COST);
  if (!creditCheck.ok) return errorResponse(creditCheck.error!, 402);

  // Deduct credits
  const deduction = await deductCredits(
    auth.supabase, auth.userId, CREDIT_COST,
    'align_ingest', 'align',
    { strategyName, docCount: documents.length },
  );
  if (!deduction.ok) return errorResponse(deduction.error!, 402);

  // Combine all doc text
  const combinedText = documents
    .map(d => `--- Document: ${d.name} ---\n${d.content}`)
    .join('\n\n');

  // Truncate if massive (Gemini context limit)
  const maxChars = 100_000;
  const truncated = combinedText.length > maxChars
    ? combinedText.slice(0, maxChars) + '\n\n[Document truncated — too long for single analysis]'
    : combinedText;

  // Call Gemini to extract governance rules from strategy docs
  const aiResult = await callGemini({
    systemPrompt: INGEST_SYSTEM_PROMPT,
    messages: [{ role: 'user', parts: [{ text: `Parse this strategy documentation and extract governance rules:\n\n${truncated}` }] }],
    model: 'gemini-2.0-flash',
    temperature: 0.3, // low temp for structured extraction
    maxTokens: 4096,
  });

  if (!aiResult.ok) {
    await refundCredits(auth.supabase, auth.userId, CREDIT_COST, 'align_ingest', 'align', aiResult.error!);
    return errorResponse('Strategy parsing failed. You were not charged.', 500);
  }

  // Parse the AI response into a structured world file
  const worldFile = parseWorldFileResponse(aiResult.text);

  if (!worldFile) {
    await refundCredits(auth.supabase, auth.userId, CREDIT_COST, 'align_ingest', 'align', 'Failed to parse world file from AI response');
    return errorResponse('Could not extract rules from your documents. You were not charged.', 500);
  }

  // Store in Supabase
  const { data: strategy, error: insertError } = await auth.supabase
    .from('align_strategies')
    .insert({
      user_id: auth.userId,
      name: strategyName,
      source_docs: documents.map(d => ({ name: d.name, charCount: d.content.length })),
      world_file: worldFile,
      rules_count: worldFile.guards.length + worldFile.values.length,
    })
    .select()
    .single();

  if (insertError) {
    return errorResponse('Failed to save strategy: ' + insertError.message, 500);
  }

  return jsonResponse({
    strategyId: strategy.id,
    name: strategyName,
    rulesExtracted: {
      guards: worldFile.guards.length,
      values: worldFile.values.length,
      redLines: worldFile.redLines.length,
      priorities: worldFile.priorities.length,
    },
    summary: worldFile.summary,
    creditsRemaining: deduction.newBalance,
  });
});

/** Parse Gemini's structured output into our world file format */
function parseWorldFileResponse(text: string): AlignWorldFile | null {
  try {
    // Try JSON parse first (AI is prompted to return JSON)
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const raw = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(raw);
      return validateWorldFile(parsed);
    }
    return null;
  } catch {
    return null;
  }
}

interface AlignWorldFile {
  summary: string;
  guards: AlignGuard[];
  values: AlignValue[];
  redLines: AlignRedLine[];
  priorities: AlignPriority[];
}

interface AlignGuard {
  id: string;
  label: string;
  description: string;
  enforcement: 'block' | 'warn' | 'flag';
  intent: string; // behavioral intent — what this rule protects
  source: string;
}

interface AlignValue {
  id: string;
  label: string;
  description: string;
  intent: string; // core behavioral principle, language-agnostic
  alignedBehaviors: string[]; // observable behaviors showing alignment
  misalignedBehaviors: string[]; // observable behaviors showing misalignment (including lip service)
  source: string;
}

interface AlignRedLine {
  id: string;
  label: string;
  description: string;
  keywords: string[]; // red lines ARE concrete enough for keyword matching
  behavioralDescription: string; // how to detect it beyond keywords
  source: string;
}

interface AlignPriority {
  id: string;
  label: string;
  description: string;
  messaging: string; // what the spirit/tone of aligned work should reflect
  weight: number; // 1-10
  source: string;
}

function validateWorldFile(raw: Record<string, unknown>): AlignWorldFile | null {
  if (!raw.guards || !raw.values) return null;

  return {
    summary: (raw.summary as string) || 'Strategy parsed successfully',
    guards: Array.isArray(raw.guards) ? raw.guards.map(normalizeGuard) : [],
    values: Array.isArray(raw.values) ? raw.values.map(normalizeValue) : [],
    redLines: Array.isArray(raw.redLines) ? raw.redLines.map(normalizeRedLine) : [],
    priorities: Array.isArray(raw.priorities) ? raw.priorities.map(normalizePriority) : [],
  };
}

function normalizeGuard(g: Record<string, unknown>): AlignGuard {
  return {
    id: String(g.id || crypto.randomUUID().slice(0, 8)),
    label: String(g.label || 'Unnamed rule'),
    description: String(g.description || ''),
    enforcement: (['block', 'warn', 'flag'].includes(g.enforcement as string) ? g.enforcement : 'warn') as 'block' | 'warn' | 'flag',
    intent: String(g.intent || g.description || ''),
    source: String(g.source || 'unknown'),
  };
}

function normalizeValue(v: Record<string, unknown>): AlignValue {
  return {
    id: String(v.id || crypto.randomUUID().slice(0, 8)),
    label: String(v.label || 'Unnamed value'),
    description: String(v.description || ''),
    intent: String(v.intent || v.description || ''),
    alignedBehaviors: Array.isArray(v.alignedBehaviors) ? v.alignedBehaviors.map(String) : [],
    misalignedBehaviors: Array.isArray(v.misalignedBehaviors) ? v.misalignedBehaviors.map(String) : [],
    source: String(v.source || 'unknown'),
  };
}

function normalizeRedLine(r: Record<string, unknown>): AlignRedLine {
  return {
    id: String(r.id || crypto.randomUUID().slice(0, 8)),
    label: String(r.label || 'Unnamed red line'),
    description: String(r.description || ''),
    keywords: Array.isArray(r.keywords) ? r.keywords.map(String) : [],
    behavioralDescription: String(r.behavioralDescription || r.description || ''),
    source: String(r.source || 'unknown'),
  };
}

function normalizePriority(p: Record<string, unknown>): AlignPriority {
  return {
    id: String(p.id || crypto.randomUUID().slice(0, 8)),
    label: String(p.label || 'Unnamed priority'),
    description: String(p.description || ''),
    messaging: String(p.messaging || p.description || ''),
    weight: typeof p.weight === 'number' ? Math.max(1, Math.min(10, p.weight)) : 5,
    source: String(p.source || 'unknown'),
  };
}

const INGEST_SYSTEM_PROMPT = `You are Align by Bevia — a strategy alignment engine. Your job is to read corporate strategy documents, culture documents, and values statements, then extract structured governance rules.

CRITICAL PRINCIPLE: Extract BEHAVIORS and INTENT, not keywords. Someone can use all the right buzzwords ("customer-centric", "data-driven", "innovative") while proposing something that directly contradicts the culture. And someone can express deep alignment using completely different vocabulary. Your rules must catch both cases.

EXTRACT THESE CATEGORIES:

1. GUARDS — Operational rules described as behavioral expectations.
   Example: "All customer-facing changes require QA sign-off" →
     intent: "Protect end-user experience by requiring quality verification before changes go live"
     This catches proposals that skip QA whether they say "no QA needed" OR just quietly omit any testing plan.

2. VALUES — Cultural values described as OBSERVABLE BEHAVIORS, not word lists. Describe what aligned behavior looks like and what misaligned behavior looks like in practice.
   Example: "Customer obsession" →
     intent: "Every decision should measurably improve the experience of the people using our product"
     alignedBehaviors: ["Prioritizing end-user outcomes over internal efficiency", "Referencing real user/client/customer data or feedback in decision-making", "Measuring success by user impact, not internal metrics"]
     misalignedBehaviors: ["Optimizing for internal convenience at the expense of user experience", "Making decisions without considering who is affected", "Using customer-centric language while proposing cost cuts that hurt service quality"]
   NOTE: That last misaligned behavior is KEY — someone can SAY all the right words while doing the opposite. Your rules must detect intent, not vocabulary.

3. RED LINES — Absolute non-negotiables. These are the ONE category where specific trigger phrases/keywords are appropriate, because red lines are concrete prohibitions. But also include a behavioral description for intent-based detection.
   Example: "We never compromise user data privacy for growth metrics" →
     keywords: ["sell user data", "share personal information", "growth hack privacy"]
     behavioralDescription: "Any proposal that trades user privacy or data protection for growth, engagement, or revenue metrics"

4. PRIORITIES — Strategic priorities as messaging intent — what should the SPIRIT of aligned work reflect?
   Example: "Sustainable growth over rapid scaling" →
     weight: 8
     messaging: "Proposals should reflect patience, quality, and long-term thinking rather than urgency, speed, and short-term gains"

RESPOND WITH VALID JSON in this exact structure:
\`\`\`json
{
  "summary": "Brief 1-sentence summary of the strategy",
  "guards": [
    {
      "id": "short_snake_case_id",
      "label": "Human readable name",
      "description": "What this rule enforces",
      "enforcement": "block" | "warn" | "flag",
      "intent": "The behavioral intent — what this rule protects, in language-agnostic terms",
      "source": "Which document/section this came from"
    }
  ],
  "values": [
    {
      "id": "short_snake_case_id",
      "label": "Value name",
      "description": "What this value means in practice",
      "intent": "The core behavioral principle — should work in any language, any vocabulary",
      "alignedBehaviors": ["Observable behaviors/messaging patterns that embody this value"],
      "misalignedBehaviors": ["Observable behaviors/messaging patterns that contradict this value — INCLUDING using the right words with wrong intent"],
      "source": "Which document/section"
    }
  ],
  "redLines": [
    {
      "id": "short_snake_case_id",
      "label": "Red line name",
      "description": "What is absolutely not allowed",
      "keywords": ["specific", "trigger", "phrases"],
      "behavioralDescription": "What this violation looks like in practice — how to detect it even when the words are polished",
      "source": "Which document/section"
    }
  ],
  "priorities": [
    {
      "id": "short_snake_case_id",
      "label": "Priority name",
      "description": "What this priority means",
      "messaging": "What the tone and spirit of aligned proposals should reflect",
      "weight": 8,
      "source": "Which document/section"
    }
  ]
}
\`\`\`

RULES:
- Extract what's ACTUALLY in the documents. Don't invent rules.
- Behaviors should be OBSERVABLE PATTERNS, not keyword lists. "References user data in decision-making" not "contains the word 'data'."
- CRITICAL: Include misaligned behaviors that use the RIGHT vocabulary with WRONG intent. Corporate lip service is the #1 thing this tool needs to catch.
- "source" should reference the specific document name and section.
- Be thorough — miss nothing. 10-20 rules is typical for a real strategy.
- Red lines are the ONLY category where keywords are appropriate.
- Guard enforcement: "block" = hard stop, "warn" = yellow flag, "flag" = note for review.
- These rules must work if the document being checked is in ANY language. Describe behaviors universally.`;
