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
  source: string; // which doc/section this came from
  keywords: string[];
}

interface AlignValue {
  id: string;
  label: string;
  description: string;
  indicators: string[]; // phrases that signal alignment
  antiIndicators: string[]; // phrases that signal misalignment
  source: string;
}

interface AlignRedLine {
  id: string;
  label: string;
  description: string;
  source: string;
}

interface AlignPriority {
  id: string;
  label: string;
  description: string;
  weight: number; // 1-10, how important
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
    source: String(g.source || 'unknown'),
    keywords: Array.isArray(g.keywords) ? g.keywords.map(String) : [],
  };
}

function normalizeValue(v: Record<string, unknown>): AlignValue {
  return {
    id: String(v.id || crypto.randomUUID().slice(0, 8)),
    label: String(v.label || 'Unnamed value'),
    description: String(v.description || ''),
    indicators: Array.isArray(v.indicators) ? v.indicators.map(String) : [],
    antiIndicators: Array.isArray(v.antiIndicators) ? v.antiIndicators.map(String) : [],
    source: String(v.source || 'unknown'),
  };
}

function normalizeRedLine(r: Record<string, unknown>): AlignRedLine {
  return {
    id: String(r.id || crypto.randomUUID().slice(0, 8)),
    label: String(r.label || 'Unnamed red line'),
    description: String(r.description || ''),
    source: String(r.source || 'unknown'),
  };
}

function normalizePriority(p: Record<string, unknown>): AlignPriority {
  return {
    id: String(p.id || crypto.randomUUID().slice(0, 8)),
    label: String(p.label || 'Unnamed priority'),
    description: String(p.description || ''),
    weight: typeof p.weight === 'number' ? Math.max(1, Math.min(10, p.weight)) : 5,
    source: String(p.source || 'unknown'),
  };
}

const INGEST_SYSTEM_PROMPT = `You are Align by Bevia — a strategy alignment engine. Your job is to read corporate strategy documents, culture documents, and values statements, then extract structured governance rules.

EXTRACT THESE CATEGORIES:

1. GUARDS — Operational rules that should block or flag proposals that violate them.
   Example: "All customer-facing changes require QA sign-off" → guard that flags proposals skipping QA.

2. VALUES — Cultural values with positive indicators (phrases showing alignment) and negative indicators (phrases showing misalignment).
   Example: "Customer obsession" → indicators: ["customer impact", "user research", "feedback loop"] anti-indicators: ["internal convenience", "we know best", "ship and see"]

3. RED LINES — Absolute non-negotiables. Things that should always be blocked.
   Example: "We never compromise user data privacy for growth metrics."

4. PRIORITIES — Strategic priorities ranked by importance (weight 1-10).
   Example: "Sustainable growth over rapid scaling" → weight 8

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
      "source": "Which document/section this came from",
      "keywords": ["relevant", "trigger", "words"]
    }
  ],
  "values": [
    {
      "id": "short_snake_case_id",
      "label": "Value name",
      "description": "What this value means in practice",
      "indicators": ["phrases that show alignment"],
      "antiIndicators": ["phrases that show misalignment"],
      "source": "Which document/section"
    }
  ],
  "redLines": [
    {
      "id": "short_snake_case_id",
      "label": "Red line name",
      "description": "What is absolutely not allowed",
      "source": "Which document/section"
    }
  ],
  "priorities": [
    {
      "id": "short_snake_case_id",
      "label": "Priority name",
      "description": "What this priority means",
      "weight": 8,
      "source": "Which document/section"
    }
  ]
}
\`\`\`

RULES:
- Extract what's ACTUALLY in the documents. Don't invent rules.
- Use the document's own language in descriptions.
- "source" should reference the specific document name and section.
- Be thorough — miss nothing. 10-20 rules is typical for a real strategy.
- Red lines should only be things explicitly stated as non-negotiable.
- Guard enforcement: "block" = hard stop, "warn" = yellow flag, "flag" = note for review.`;
