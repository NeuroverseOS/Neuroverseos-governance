// Bevia — Document Upload Edge Function
//
// THE ENTRY POINT for all documents in Bevia.
// Accepts raw text (pasted) or file content (extracted by frontend).
// Classifies the document type via AI, caches it, routes to the right tool.
//
// This is what the Document Hub (shared/document-hub.ts) was built for —
// but nothing was calling it. Now something does.
//
// Flow:
//   1. User drops a file or pastes text
//   2. This function classifies it (strategy? culture? contract? conversation?)
//   3. Stores it in bevia_documents with classification + cache
//   4. Returns: document ID + type + which tools can use it + suggested next action
//   5. Frontend routes user to the right tool with the document pre-loaded
//
// Cost: 1 credit (covers AI classification)
// If document was already uploaded (same text hash): FREE, returns cached version

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, errorResponse, jsonResponse } from '../shared/auth.ts';
import { checkCredits, deductCredits } from '../shared/credits.ts';
import { evaluateAction, logAudit, sanitizeOutput } from '../shared/governance.ts';
import { uploadAndParseDocument, getCachedDocument } from '../shared/document-hub.ts';
import { recordUserAction } from '../shared/data-accumulation.ts';

const CREDIT_COST = 1;

interface UploadRequest {
  fileName: string;         // original file name (e.g., "Q3-Strategy.pdf")
  content: string;          // extracted text content
  dealId?: string;          // if uploading to an existing deal (Stakeholder)
  strategyId?: string;      // if uploading to an existing strategy (Audit)
}

serve(async (req: Request) => {
  const auth = await authenticate(req);
  if (!auth.ok) return errorResponse(auth.error!, 401);

  const body: UploadRequest = await req.json();
  const { fileName, content, dealId, strategyId } = body;

  if (!content?.trim()) return errorResponse('Document content is required', 400);
  if (!fileName?.trim()) return errorResponse('File name is required', 400);

  // ── Check if already cached (FREE if so) ──────────────────────────────────
  const textHash = await hashText(content);
  const cached = await getCachedDocument(auth.supabase, auth.userId, textHash);

  if (cached) {
    return jsonResponse({
      documentId: cached.id,
      fileName: cached.originalName,
      documentType: cached.documentType,
      classification: cached.classification,
      availableTo: cached.availableTo,
      suggestedAction: getSuggestedAction(cached.documentType),
      cached: true,
      creditsCharged: 0,
      creditsRemaining: null, // didn't check, didn't charge
    });
  }

  // ── Governance ─────────────────────────────────────────────────────────────
  const verdict = evaluateAction({
    intent: 'upload_document',
    tool: 'platform',
    userId: auth.userId,
    creditCost: CREDIT_COST,
    metadata: { fileName, contentLength: content.length },
  });
  await logAudit(auth.supabase, { intent: 'upload_document', tool: 'platform', userId: auth.userId, creditCost: CREDIT_COST }, verdict);
  if (verdict.status === 'BLOCK') return errorResponse(verdict.reason || 'Blocked', 403);

  // ── Credits ────────────────────────────────────────────────────────────────
  const creditCheck = await checkCredits(auth.supabase, auth.userId, CREDIT_COST);
  if (!creditCheck.ok) return errorResponse(creditCheck.error!, 402);

  const deduction = await deductCredits(
    auth.supabase, auth.userId, CREDIT_COST,
    'upload_document', 'platform',
    { fileName, contentLength: content.length },
  );
  if (!deduction.ok) return errorResponse(deduction.error!, 402);

  // ── Upload, classify, cache via Document Hub ───────────────────────────────
  try {
    const { document, isNew } = await uploadAndParseDocument(
      auth.supabase, auth.userId, fileName, content,
    );

    // If part of a deal, link it
    if (dealId) {
      await auth.supabase
        .from('bevia_deals')
        .update({
          documents: auth.supabase.rpc('array_append_unique', {
            arr_column: 'documents',
            new_val: document.id,
          }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', dealId)
        .eq('user_id', auth.userId);
    }

    await recordUserAction(auth.supabase, {
      userId: auth.userId,
      tool: 'platform',
      action: 'accepted',
      resultId: document.id,
      metadata: { fileName, documentType: document.documentType, isNew },
    });

    return jsonResponse({
      documentId: document.id,
      fileName: document.originalName,
      documentType: document.documentType,
      classification: document.classification,
      availableTo: document.availableTo,
      suggestedAction: getSuggestedAction(document.documentType),
      cached: false,
      creditsCharged: CREDIT_COST,
      creditsRemaining: deduction.newBalance,
    });
  } catch (err) {
    return errorResponse('Document upload failed: ' + (err as Error).message, 500);
  }
});

// ─── Suggested next action based on document type ────────────────────────────

function getSuggestedAction(type: string): {
  action: string;
  tool: string;
  description: string;
} {
  switch (type) {
    case 'strategy':
    case 'culture':
    case 'org_model':
    case 'team_charter':
    case 'competency':
    case 'process':
      return {
        action: 'build_strategy',
        tool: 'audit',
        description: 'Build your alignment engine from this document',
      };
    case 'proposal':
    case 'contract':
      return {
        action: 'check_alignment',
        tool: 'audit',
        description: 'Check this document against your strategy',
      };
    case 'deal':
      return {
        action: 'analyze_deal',
        tool: 'stakeholder',
        description: 'Run stakeholder intelligence on this deal',
      };
    case 'conversation':
      return {
        action: 'analyze_conversation',
        tool: 'replay',
        description: 'Analyze what happened in this conversation',
      };
    default:
      return {
        action: 'classify_manually',
        tool: 'platform',
        description: 'We couldn\'t classify this document. What is it?',
      };
  }
}

// ─── Hash helper ─────────────────────────────────────────────────────────────

async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
