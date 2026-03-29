// Bevia — Align Document Check Engine
// Evaluates a document against a stored strategy world file
// Core check is DETERMINISTIC (keyword/rule matching) — no AI needed for basic verdict
// AI only used for evidence explanation (optional, included in the 1 credit)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, errorResponse, jsonResponse } from '../shared/auth.ts';
import { checkCredits, deductCredits } from '../shared/credits.ts';

const CREDIT_COST = 1;

interface CheckRequest {
  strategyId: string;
  documentName: string;
  documentText: string;
  scope: 'strategy' | 'culture' | 'both';
}

export interface AlignVerdict {
  status: 'ALIGN' | 'DRIFT' | 'CONFLICT';
  alignmentScore: number; // 0-100
  strategyScore: number;
  cultureScore: number;
  conflicts: VerdictItem[];
  gaps: VerdictItem[];
  alignments: VerdictItem[];
  summary: string;
}

interface VerdictItem {
  ruleId: string;
  ruleLabel: string;
  type: 'guard' | 'value' | 'redline' | 'priority';
  status: 'aligned' | 'drifted' | 'conflict' | 'missing';
  evidence: string; // quote from the document or "not mentioned"
  ruleDescription: string;
}

serve(async (req: Request) => {
  const auth = await authenticate(req);
  if (!auth.ok) return errorResponse(auth.error!, 401);

  const body: CheckRequest = await req.json();
  const { strategyId, documentName, documentText, scope } = body;

  if (!strategyId) return errorResponse('Strategy ID required', 400);
  if (!documentText?.trim()) return errorResponse('Document text required', 400);

  // Check credits
  const creditCheck = await checkCredits(auth.supabase, auth.userId, CREDIT_COST);
  if (!creditCheck.ok) return errorResponse(creditCheck.error!, 402);

  // Load the strategy world file
  const { data: strategy, error: loadError } = await auth.supabase
    .from('align_strategies')
    .select('*')
    .eq('id', strategyId)
    .eq('user_id', auth.userId)
    .single();

  if (loadError || !strategy) return errorResponse('Strategy not found', 404);

  // DETERMINISTIC EVALUATION — no AI call needed
  const verdict = evaluateAlignment(strategy.world_file, documentText, scope);

  // Deduct credit
  const deduction = await deductCredits(
    auth.supabase, auth.userId, CREDIT_COST,
    'align_check', 'align',
    { strategyId, documentName, verdict: verdict.status, score: verdict.alignmentScore },
  );

  // Save check result
  await auth.supabase.from('align_checks').insert({
    user_id: auth.userId,
    strategy_id: strategyId,
    doc_name: documentName || 'Untitled',
    verdict: verdict.status,
    alignment_score: verdict.alignmentScore,
    evidence: verdict,
  });

  return jsonResponse({
    verdict,
    creditsRemaining: deduction.newBalance,
  });
});

/**
 * DETERMINISTIC alignment evaluation.
 * No AI call. Pure rule matching against document text.
 * This is why Align margins are 90%+ on checks.
 */
function evaluateAlignment(
  worldFile: Record<string, unknown>,
  docText: string,
  scope: string,
): AlignVerdict {
  const guards = (worldFile.guards || []) as Record<string, unknown>[];
  const values = (worldFile.values || []) as Record<string, unknown>[];
  const redLines = (worldFile.redLines || []) as Record<string, unknown>[];
  const priorities = (worldFile.priorities || []) as Record<string, unknown>[];

  const docLower = docText.toLowerCase();
  const conflicts: VerdictItem[] = [];
  const gaps: VerdictItem[] = [];
  const alignments: VerdictItem[] = [];

  // Check red lines (hardest enforcement — any match = CONFLICT)
  for (const rl of redLines) {
    const desc = String(rl.description || '').toLowerCase();
    const keywords = extractKeyPhrases(desc);
    const found = findEvidence(docLower, keywords);

    if (found) {
      conflicts.push({
        ruleId: String(rl.id),
        ruleLabel: String(rl.label),
        type: 'redline',
        status: 'conflict',
        evidence: extractQuote(docText, found),
        ruleDescription: String(rl.description),
      });
    }
  }

  // Check guards (keyword matching against doc text)
  for (const g of guards) {
    const keywords = (g.keywords || []) as string[];
    const antiKeywords = extractAntiKeywords(String(g.description || ''));

    const hasPositive = keywords.some(kw => docLower.includes(kw.toLowerCase()));
    const hasAnti = antiKeywords.some(kw => docLower.includes(kw.toLowerCase()));

    if (hasAnti && !hasPositive) {
      conflicts.push({
        ruleId: String(g.id),
        ruleLabel: String(g.label),
        type: 'guard',
        status: 'conflict',
        evidence: extractQuote(docText, antiKeywords.find(kw => docLower.includes(kw.toLowerCase()))!),
        ruleDescription: String(g.description),
      });
    } else if (hasPositive) {
      alignments.push({
        ruleId: String(g.id),
        ruleLabel: String(g.label),
        type: 'guard',
        status: 'aligned',
        evidence: extractQuote(docText, keywords.find(kw => docLower.includes(kw.toLowerCase()))!),
        ruleDescription: String(g.description),
      });
    }
  }

  // Check values (indicators vs anti-indicators)
  for (const v of values) {
    const indicators = (v.indicators || []) as string[];
    const antiIndicators = (v.antiIndicators || []) as string[];

    const positiveHits = indicators.filter(i => docLower.includes(i.toLowerCase()));
    const negativeHits = antiIndicators.filter(i => docLower.includes(i.toLowerCase()));

    if (negativeHits.length > 0 && positiveHits.length === 0) {
      conflicts.push({
        ruleId: String(v.id),
        ruleLabel: String(v.label),
        type: 'value',
        status: 'conflict',
        evidence: extractQuote(docText, negativeHits[0]),
        ruleDescription: String(v.description),
      });
    } else if (positiveHits.length > 0 && negativeHits.length === 0) {
      alignments.push({
        ruleId: String(v.id),
        ruleLabel: String(v.label),
        type: 'value',
        status: 'aligned',
        evidence: extractQuote(docText, positiveHits[0]),
        ruleDescription: String(v.description),
      });
    } else if (positiveHits.length > 0 && negativeHits.length > 0) {
      // Mixed signals = drift
      gaps.push({
        ruleId: String(v.id),
        ruleLabel: String(v.label),
        type: 'value',
        status: 'drifted',
        evidence: `Aligned: "${positiveHits[0]}" but also: "${negativeHits[0]}"`,
        ruleDescription: String(v.description),
      });
    } else {
      // Not mentioned at all = gap
      gaps.push({
        ruleId: String(v.id),
        ruleLabel: String(v.label),
        type: 'value',
        status: 'missing',
        evidence: 'Not mentioned in document',
        ruleDescription: String(v.description),
      });
    }
  }

  // Check priorities (are high-weight priorities addressed?)
  for (const p of priorities) {
    const keywords = extractKeyPhrases(String(p.label || '') + ' ' + String(p.description || ''));
    const found = keywords.some(kw => docLower.includes(kw.toLowerCase()));
    const weight = Number(p.weight) || 5;

    if (found) {
      alignments.push({
        ruleId: String(p.id),
        ruleLabel: String(p.label),
        type: 'priority',
        status: 'aligned',
        evidence: extractQuote(docText, keywords.find(kw => docLower.includes(kw.toLowerCase()))!),
        ruleDescription: String(p.description),
      });
    } else if (weight >= 7) {
      // High-weight priority missing = gap
      gaps.push({
        ruleId: String(p.id),
        ruleLabel: String(p.label),
        type: 'priority',
        status: 'missing',
        evidence: `High-priority item (weight ${weight}/10) not addressed`,
        ruleDescription: String(p.description),
      });
    }
  }

  // Calculate scores
  const totalRules = conflicts.length + gaps.length + alignments.length;
  const alignmentScore = totalRules > 0
    ? Math.round((alignments.length / totalRules) * 100)
    : 50;

  // Strategy vs culture split (approximate)
  const strategyItems = [...conflicts, ...gaps, ...alignments].filter(
    i => i.type === 'guard' || i.type === 'priority',
  );
  const cultureItems = [...conflicts, ...gaps, ...alignments].filter(
    i => i.type === 'value' || i.type === 'redline',
  );

  const strategyAligned = strategyItems.filter(i => i.status === 'aligned').length;
  const cultureAligned = cultureItems.filter(i => i.status === 'aligned').length;

  const strategyScore = strategyItems.length > 0
    ? Math.round((strategyAligned / strategyItems.length) * 100) : 50;
  const cultureScore = cultureItems.length > 0
    ? Math.round((cultureAligned / cultureItems.length) * 100) : 50;

  // Determine overall status
  let status: 'ALIGN' | 'DRIFT' | 'CONFLICT';
  if (conflicts.length > 0) {
    status = 'CONFLICT';
  } else if (gaps.length > alignments.length) {
    status = 'DRIFT';
  } else if (alignmentScore >= 70) {
    status = 'ALIGN';
  } else {
    status = 'DRIFT';
  }

  // Build summary
  const summary = buildSummary(status, alignmentScore, conflicts.length, gaps.length, alignments.length);

  return {
    status,
    alignmentScore,
    strategyScore,
    cultureScore,
    conflicts,
    gaps,
    alignments,
    summary,
  };
}

/** Extract key phrases from a description for matching */
function extractKeyPhrases(text: string): string[] {
  // Remove common stop words and split into meaningful phrases
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
    'from', 'as', 'into', 'through', 'during', 'before', 'after', 'and', 'but', 'or',
    'not', 'no', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
    'such', 'than', 'too', 'very', 'just', 'that', 'this', 'these', 'those', 'it', 'its']);

  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  // Return unique words as individual keywords + 2-word phrases
  const phrases: string[] = [...new Set(words)];
  for (let i = 0; i < words.length - 1; i++) {
    phrases.push(`${words[i]} ${words[i + 1]}`);
  }

  return phrases.slice(0, 20); // cap to prevent over-matching
}

/** Extract anti-keywords from a guard description (words after "not", "never", "without") */
function extractAntiKeywords(description: string): string[] {
  const patterns = [
    /not\s+(\w+(?:\s+\w+)?)/gi,
    /never\s+(\w+(?:\s+\w+)?)/gi,
    /without\s+(\w+(?:\s+\w+)?)/gi,
    /avoid\s+(\w+(?:\s+\w+)?)/gi,
    /prohibit\s+(\w+(?:\s+\w+)?)/gi,
  ];

  const results: string[] = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(description)) !== null) {
      results.push(match[1].toLowerCase());
    }
  }
  return results;
}

/** Find evidence of a keyword in text, return the keyword if found */
function findEvidence(docLower: string, keywords: string[]): string | null {
  for (const kw of keywords) {
    if (docLower.includes(kw.toLowerCase())) return kw;
  }
  return null;
}

/** Extract a quote from the document around where a keyword appears */
function extractQuote(docText: string, keyword: string): string {
  const idx = docText.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx === -1) return `Contains: "${keyword}"`;

  const start = Math.max(0, idx - 40);
  const end = Math.min(docText.length, idx + keyword.length + 40);
  let quote = docText.slice(start, end).trim();

  if (start > 0) quote = '...' + quote;
  if (end < docText.length) quote = quote + '...';

  return `"${quote}"`;
}

function buildSummary(
  status: string,
  score: number,
  conflictCount: number,
  gapCount: number,
  alignCount: number,
): string {
  if (status === 'ALIGN') {
    return `Strong alignment (${score}%). ${alignCount} rules matched positively.`;
  }
  if (status === 'CONFLICT') {
    return `${conflictCount} conflict${conflictCount > 1 ? 's' : ''} found. ${gapCount} gap${gapCount > 1 ? 's' : ''} identified. Score: ${score}%.`;
  }
  return `Partial alignment (${score}%). ${gapCount} gap${gapCount > 1 ? 's' : ''} — topics your strategy covers that this document doesn't address.`;
}
