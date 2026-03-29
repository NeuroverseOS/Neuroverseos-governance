// Bevia — Document Hub + Cache Layer
//
// ONE place to upload documents. AI classifies, routes, caches.
// Parsed results stored in Supabase so AI work is done ONCE per document.
//
// Upload flow:
//   1. User drops document(s) in the Document Hub
//   2. AI classifies: strategy, culture, org_model, team_charter,
//      conversation, proposal, contract, process, competency
//   3. Text extracted + cached
//   4. Routed to appropriate engine for processing
//   5. Processed results cached (WorldDefinition, behavioral signals, etc.)
//   6. Subsequent uses pull from cache — zero AI cost
//
// Cache hierarchy:
//   L1: In-memory Map (per edge function instance, lost on cold start)
//   L2: Supabase table (persistent, shared across instances)
//   AI only fires on cache MISS.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callGemini } from './gemini.ts';

// ─── Document Types ──────────────────────────────────────────────────────────

export type DocumentType =
  | 'strategy'        // corporate strategy, business plan, OKRs
  | 'culture'         // culture doc, values statement, employee handbook
  | 'org_model'       // org chart, role definitions, reporting structure
  | 'team_charter'    // team-specific rules, processes, responsibilities
  | 'conversation'    // chat transcript, email thread, meeting notes
  | 'proposal'        // business proposal, project plan, budget request
  | 'contract'        // vendor contract, partnership agreement, SLA
  | 'process'         // workflow doc, SOP, runbook
  | 'competency'      // job descriptions, competency frameworks, review criteria
  | 'unknown';        // couldn't classify — ask user

export interface ParsedDocument {
  id: string;
  userId: string;
  originalName: string;
  documentType: DocumentType;
  extractedText: string;
  textHash: string;            // SHA-256 of extracted text — cache key
  charCount: number;
  classification: {
    type: DocumentType;
    confidence: number;        // 0-1
    reasoning: string;         // why AI classified it this way
  };
  availableTo: string[];       // which tools can access this doc
  cachedResults: Record<string, unknown>; // tool-specific cached outputs
  createdAt: string;
  updatedAt: string;
}

// ─── L1 Cache (in-memory, per instance) ──────────────────────────────────────

const memoryCache = new Map<string, { data: unknown; expiresAt: number }>();

function getCached<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown, ttlMs: number = 3600_000): void {
  memoryCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ─── L2 Cache (Supabase, persistent) ─────────────────────────────────────────

export async function getCachedDocument(
  supabase: SupabaseClient,
  userId: string,
  textHash: string,
): Promise<ParsedDocument | null> {
  // Check L1 first
  const l1 = getCached<ParsedDocument>(`doc:${textHash}`);
  if (l1) return l1;

  // Check L2
  const { data } = await supabase
    .from('bevia_documents')
    .select('*')
    .eq('user_id', userId)
    .eq('text_hash', textHash)
    .single();

  if (data) {
    setCache(`doc:${textHash}`, data); // Promote to L1
    return data as ParsedDocument;
  }

  return null;
}

export async function getCachedResult(
  supabase: SupabaseClient,
  userId: string,
  documentId: string,
  resultKey: string,
): Promise<unknown | null> {
  // Check L1
  const l1 = getCached(`result:${documentId}:${resultKey}`);
  if (l1) return l1;

  // Check L2
  const { data } = await supabase
    .from('bevia_documents')
    .select('cached_results')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single();

  if (data?.cached_results?.[resultKey]) {
    setCache(`result:${documentId}:${resultKey}`, data.cached_results[resultKey]);
    return data.cached_results[resultKey];
  }

  return null;
}

export async function setCachedResult(
  supabase: SupabaseClient,
  documentId: string,
  resultKey: string,
  resultData: unknown,
): Promise<void> {
  // Update L1
  setCache(`result:${documentId}:${resultKey}`, resultData);

  // Update L2 (merge into existing cached_results)
  const { data: existing } = await supabase
    .from('bevia_documents')
    .select('cached_results')
    .eq('id', documentId)
    .single();

  const merged = { ...(existing?.cached_results || {}), [resultKey]: resultData };

  await supabase
    .from('bevia_documents')
    .update({ cached_results: merged, updated_at: new Date().toISOString() })
    .eq('id', documentId);
}

// ─── Document Classification ─────────────────────────────────────────────────
// AI classifies the document type. Result cached permanently (type doesn't change).

export async function classifyDocument(
  text: string,
  fileName: string,
): Promise<{ type: DocumentType; confidence: number; reasoning: string }> {
  const aiResult = await callGemini({
    systemPrompt: `You classify documents into one of these types:
- strategy: corporate strategy, business plan, OKRs, strategic priorities
- culture: culture doc, values statement, employee handbook, behavioral norms
- org_model: org chart, role definitions, reporting structure, hierarchy
- team_charter: team-specific rules, processes, team responsibilities
- conversation: chat transcript, email thread, meeting notes, Slack export
- proposal: business proposal, project plan, budget request, initiative brief
- contract: vendor contract, partnership agreement, SLA, terms
- process: workflow doc, SOP, runbook, procedure documentation
- competency: job descriptions, competency frameworks, review criteria, skills matrix

Respond with JSON: { "type": "...", "confidence": 0.0-1.0, "reasoning": "why" }
If genuinely uncertain, use "unknown" with low confidence.`,
    messages: [{
      role: 'user',
      parts: [{ text: `File: "${fileName}"\n\nFirst 2000 chars:\n${text.slice(0, 2000)}` }],
    }],
    model: 'gemini-2.0-flash',
    temperature: 0.1,
    maxTokens: 256,
  });

  if (!aiResult.ok) {
    return { type: 'unknown', confidence: 0, reasoning: 'Classification failed' };
  }

  try {
    const jsonMatch = aiResult.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        type: parsed.type || 'unknown',
        confidence: parsed.confidence || 0,
        reasoning: parsed.reasoning || '',
      };
    }
  } catch { /* parse failed */ }

  return { type: 'unknown', confidence: 0, reasoning: 'Could not parse classification' };
}

// ─── Document Upload + Parse + Cache ─────────────────────────────────────────

export async function uploadAndParseDocument(
  supabase: SupabaseClient,
  userId: string,
  fileName: string,
  text: string,
): Promise<{ document: ParsedDocument; isNew: boolean }> {
  // Hash the text for cache lookup
  const textHash = await hashText(text);

  // Check if we've already parsed this exact document
  const cached = await getCachedDocument(supabase, userId, textHash);
  if (cached) {
    return { document: cached, isNew: false };
  }

  // New document — classify it
  const classification = await classifyDocument(text, fileName);

  // Determine which tools can access this document
  const availableTo = getToolAccess(classification.type);

  // Store in Supabase
  const { data: doc, error } = await supabase
    .from('bevia_documents')
    .insert({
      user_id: userId,
      original_name: fileName,
      document_type: classification.type,
      extracted_text: text,
      text_hash: textHash,
      char_count: text.length,
      classification,
      available_to: availableTo,
      cached_results: {},
    })
    .select()
    .single();

  if (error || !doc) {
    throw new Error('Failed to store document: ' + (error?.message || 'unknown'));
  }

  // Cache in L1
  setCache(`doc:${textHash}`, doc);

  return { document: doc as ParsedDocument, isNew: true };
}

// ─── Tool Access Rules ───────────────────────────────────────────────────────
// Which tools can see which document types.
// User can always see this mapping. Transparent.

function getToolAccess(type: DocumentType): string[] {
  switch (type) {
    case 'strategy':
    case 'culture':
      return ['audit'];
    case 'org_model':
    case 'team_charter':
      return ['audit'];
    case 'conversation':
      return ['replay'];
    case 'proposal':
    case 'contract':
      return ['audit'];
    case 'process':
    case 'competency':
      return ['audit'];
    case 'unknown':
      return []; // User must manually assign
    default:
      return [];
  }
}

// ─── Hash Helper ─────────────────────────────────────────────────────────────

async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/*
-- Supabase migration: document hub

create table bevia_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  original_name text not null,
  document_type text not null,
  extracted_text text not null,
  text_hash text not null,
  char_count integer not null,
  classification jsonb not null,
  available_to text[] not null default '{}',
  cached_results jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table bevia_documents enable row level security;
create policy "Users own documents" on bevia_documents for all using (auth.uid() = user_id);

-- Index for fast hash lookups (cache hits)
create unique index idx_docs_user_hash on bevia_documents(user_id, text_hash);
-- Index for tool access queries
create index idx_docs_user_type on bevia_documents(user_id, document_type);
*/
