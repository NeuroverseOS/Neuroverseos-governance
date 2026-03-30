# Bevia — UX Gaps Spec

> 20 gaps identified. Ordered by impact. Each one has: what's wrong, what to build, which files change, credit cost, and priority tier.

---

## Tier 1: CRITICAL (broken user flow — fix before launch)

---

### Gap 1: No PDF/DOCX text extraction

**Problem:** `upload-document` accepts text. Users have PDFs and Word docs. They can't use them.

**Fix:** Add client-side text extraction in the Lovable frontend. NOT an edge function — extraction happens in the browser before calling `upload-document`.

**Libraries:**
- PDF: `pdf.js` (Mozilla, works in browser)
- DOCX: `mammoth.js` (extracts text from .docx)
- Plain text: read directly

**Frontend change:** The file upload component detects file type → extracts text → calls `upload-document` with `{ fileName, content: extractedText }`.

**Edge function change:** None. `upload-document` already accepts text.

**Priority:** P0 — without this, Audit and Stakeholder are unusable for most users.

---

### Gap 2: No onboarding — user doesn't know what to do first

**Problem:** Sign up → buy credits → see 6 tools → freeze. No guidance.

**Fix:** After first credit purchase, show a one-time onboarding card (not a wizard — a single suggestion):

```
Welcome to Bevia. Try one of these:

[Paste a message → check your tone]     ← ToneCheck, 1 credit
[Upload your strategy doc → build your engine]  ← Audit, 15 credits
[Paste a conversation → see what happened]      ← Replay, 3 credits
```

Dismiss after first tool use. Never show again. Stored in `localStorage`, not a database field.

**Frontend change:** Conditional card on dashboard.
**Edge function change:** None.
**Priority:** P0 — first-time users will bounce without guidance.

---

### Gap 3: ToneCheck doesn't know your contacts

**Problem:** ToneCheck asks you to pick an archetype (Boomer, Gen Z, etc.). But if you've analyzed 8 conversations with Alex in Replay, ToneCheck should let you pick ALEX — and use Alex's real behavioral profile, not a generic archetype.

**Fix:** Add a "Pick a contact" option in ToneCheck alongside archetypes.

**Frontend change:** ToneCheck page gets a "Or pick a contact" dropdown that loads from `reflect_contacts`. When contact selected, their `personality_tags` and `profile` are sent to the edge function instead of a generic archetype.

**Edge function change:** `tonecheck/index.ts` — add optional `contactId` field. If provided, load contact from `reflect_contacts`, use `buildPersonalityContext()` from `personality-frameworks.ts` to build the receiver profile instead of using ARCHETYPES map.

```typescript
interface ToneCheckRequest {
  message: string;
  senderArchetype?: string;      // generic archetype OR
  receiverArchetype?: string;    // generic archetype OR
  contactId?: string;            // specific contact (overrides archetypes)
  intent?: string;
  freeIntent?: string;
}
```

If `contactId` provided:
- Load contact from `reflect_contacts`
- Use their behavioral profile (trust, composure, ego state tendencies) + personality tags
- Build a CUSTOM archetype description from real data instead of generic

**Priority:** P0 — this is the cross-tool intelligence that makes Bevia a system, not 6 separate tools.

---

### Gap 4: No "was this accurate?" feedback

**Problem:** `bevia_user_feedback` table exists. `recordFeedback()` function exists. Nothing calls it. The system never learns if its output was useful.

**Fix:** Every OutputCard gets a feedback strip at the bottom:

```
Was this accurate?  [Yes ✓]  [Partially ~]  [No ✗]
```

One tap. No modal. Sends to `recordFeedback()`. Disappears after tapping. Shows "Thanks" briefly.

**Frontend change:** Add feedback strip to OutputCard component.

**Edge function change:** New `record-feedback/index.ts`:

```typescript
interface FeedbackRequest {
  tool: string;
  resultId: string;
  feedbackType: 'accuracy' | 'usefulness';
  feedbackValue: 'yes' | 'partially' | 'no';
}
```

Cost: FREE. No credits. This data is more valuable to us than the credit revenue — it tells us if the AI is right.

**Priority:** P0 — without feedback, we can't compute accuracy rates in reports, can't improve, can't tell users "your translation accuracy is 87%."

---

### Gap 5: No follow-up after output

**Problem:** Every tool returns output and then... nothing. Dead end. No continuity.

**Fix:** Every OutputCard gets a "Next steps" section below the action bar:

| After this tool | Suggest next |
|---|---|
| ToneCheck | "Send it → then paste the reply to analyze in Replay" |
| Audit ingest | "Now drop a document to check against your strategy" |
| Audit check (DRIFT/CONFLICT) | "Want to fix it? [Rewrite suggestions — 2 credits]" |
| Audit check (ALIGN) | "Check another document" |
| Replay | "Simulate a different approach [1 credit]" or "Check your next message to them in ToneCheck" |
| Perspectives | "Which perspective resonated? [pick one]" → saves to `arena_perspectives.user_resonated` |
| Consensus | "Share this with your group [copy link]" |
| Signal | "Start reaching out — check your intro message in ToneCheck" |
| Stakeholder | "Log a follow-up conversation → track leverage shift" |

**Frontend change:** Conditional next-step buttons in OutputCard based on tool + result.
**Edge function change:** None — these are frontend routing actions.
**Priority:** P1 — improves retention significantly.

---

## Tier 2: IMPORTANT (missing features that users will expect)

---

### Gap 6: Contact "what works / what doesn't" not auto-generated

**Problem:** `reflect_contacts` has `what_works` and `what_doesnt_work` jsonb fields. Nothing populates them.

**Fix:** New edge function `compute-contact-insights/index.ts`. Called automatically after the 3rd conversation with a contact. Analyzes all conversation data for that contact and generates behavioral insights.

```typescript
// Input: contactId
// Processing: load all conversations with this contact from reflect_conversations
// AI analysis: "across N conversations, what approaches correlated with positive outcomes (trust up, conflict down) vs negative?"
// Output: { whatWorks: string[], whatDoesntWork: string[], egoStateDynamics: object, confidence: 'low'|'medium'|'high' }
// Stored: updates reflect_contacts.what_works, what_doesnt_work, ego_state_dynamics, confidence
```

**Trigger:** Called by `replay-analyze` after saving a new conversation:
```typescript
if (contactProfile.conversations_analyzed >= 3) {
  // Fire and forget — don't block the response
  supabase.functions.invoke('compute-contact-insights', { body: { contactId } });
}
```

**Cost:** 1 credit (included in the Replay 3-credit cost — don't charge extra).
**Priority:** P1 — this is the "over time, Bevia learns" promise.

---

### Gap 7: No self-profile computation

**Problem:** `reflect_self_profile` table exists. Nothing populates it.

**Fix:** New edge function `compute-self-profile/index.ts`. Called periodically (after every 5th conversation across any contact).

```typescript
// Input: userId
// Processing: load all contacts + all conversations
// AI analysis: "across all contacts, what are this user's patterns?"
// Output: { defaultEgoState, triggers, strengths, growthAreas, archetypeAlignment }
// Stored: upsert into reflect_self_profile
```

**Trigger:** `replay-analyze` checks total conversation count. After every 5th:
```typescript
if (totalConversations % 5 === 0 && totalConversations >= 10) {
  supabase.functions.invoke('compute-self-profile', { body: { userId } });
}
```

**Cost:** 2 credits (charged from Replay cost, not extra).
**Priority:** P1 — this is the Patterns tab in the dashboard.

---

### Gap 8: No replay simulation edge function

**Problem:** The simulation sandbox spec exists. Contact profiles build. But there's no `replay-simulate` edge function to fork a conversation and try different approaches.

**Fix:** New edge function `replay-simulate/index.ts`:

```typescript
interface SimulateRequest {
  conversationId: string;    // which conversation to fork
  contactId: string;         // who you're talking to
  forkEventIndex: number;    // which moment to fork at
  approach: 'natural' | 'slider' | 'archetype';
  yourInput?: string;        // what you'd say instead (natural mode)
  sliderSettings?: {         // behavioral sliders (slider mode)
    assertiveness: number;
    empathy: number;
    composure: number;
  };
  archetypeId?: string;      // which archetype to channel (archetype mode)
}
```

Processing:
1. Load original conversation from `reflect_conversations`
2. Load contact profile from `reflect_contacts`
3. AI simulates the other person's response based on their behavioral profile
4. Returns: your alternative + their simulated response + behavioral comparison (original vs simulated)

**Cost:** 1 credit per exchange.
**Stored:** `reflect_simulations` table.
**Priority:** P1 — the simulation sandbox is a major differentiator.

---

### Gap 9: No strategy version history

**Problem:** Re-uploading strategy docs overwrites the old world file. No diff, no history.

**Fix:** Don't overwrite — create a new version. Add `version` field to `align_strategies`:

```sql
alter table align_strategies add column version integer default 1;
alter table align_strategies add column previous_version_id uuid references align_strategies;
```

When user re-uploads, create a NEW row linked to the previous one. Dashboard shows version history with diffs.

**Edge function change:** `audit-ingest` — on re-upload for same strategy name, link to previous version instead of updating.

**Priority:** P1 — enterprise users will need this.

---

### Gap 10: No document comparison

**Problem:** Can check one doc at a time against strategy. Can't compare two proposals side by side.

**Fix:** New edge function `audit-compare/index.ts`:

```typescript
interface CompareRequest {
  strategyId: string;
  documentA: { name: string; text: string };
  documentB: { name: string; text: string };
  scope: 'strategy' | 'culture' | 'both';
}
```

Runs `audit-check` on both docs (in parallel), then AI compares the two verdicts:
"Document A scores 72% (3 gaps). Document B scores 85% (1 conflict but fewer gaps). Document B aligns better overall but has a red line violation on X."

**Cost:** 3 credits (2 checks + comparison).
**Priority:** P2.

---

### Gap 11: No persistent groups for Consensus

**Problem:** Define group members every time. Can't save "my team" as a reusable group.

**Fix:** New Supabase table:

```sql
create table bevia_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  members jsonb not null default '[]',
  created_at timestamptz default now()
);
```

Consensus page: "Pick a saved group" dropdown OR "Create new group."

**Edge function change:** `consensus/index.ts` — add optional `groupId`. If provided, load members from `bevia_groups` instead of requiring them in the request.

**Cost:** No extra credits.
**Priority:** P2.

---

### Gap 12: No share card rendering

**Problem:** ToneCheck generates `share_slug`. No page renders it.

**Fix:** Frontend route: `/s/:slug`
- Loads from `unsaid_translations` where `share_slug = :slug`
- Displays read-only OutputCard with translation
- Footer: "Made with bevia.co · ⚡ NeuroverseOS"
- CTA: "Try it yourself →" → links to `/app/tonecheck`
- No auth required (public read via RLS policy already exists)

**Edge function change:** None — direct Supabase query from frontend.
**Priority:** P2 — viral sharing.

---

### Gap 13: Stakeholder deal tracking over time

**Problem:** `stakeholder-analyze` creates a deal. No function for logging follow-up events.

**Fix:** New edge function `stakeholder-update/index.ts`:

```typescript
interface UpdateRequest {
  dealId: string;
  updateType: 'conversation' | 'new_terms' | 'move_outcome' | 'status_change';
  content: string;          // new email, updated terms, what happened
  moveId?: string;          // if reporting outcome of a previous move
  newStatus?: string;       // 'negotiating' | 'decided' | 'closed'
}
```

Processing:
1. Load existing deal from `bevia_deals`
2. If conversation: run through Replay engine, update stakeholder contact profiles
3. If new terms: re-run alignment analysis, update deal score
4. If move outcome: record what actually happened vs what was projected (simulation accuracy tracking)
5. If status change: update deal status

Dashboard shows: deal score trajectory, leverage shifts, move outcomes.

**Cost:** 2 credits per update.
**Priority:** P2 — makes Stakeholder sticky.

---

### Gap 14: No personality framework endpoint

**Problem:** `personality-frameworks.ts` has 53 options. Frontend can't access them.

**Fix:** Either:
- **Option A:** New edge function `get-frameworks/index.ts` — returns all frameworks + options. No auth needed. No credits. Static data.
- **Option B:** Inline the options in the frontend code (simpler, no API call).

**Recommendation:** Option B. The frameworks are static data. Hardcode them in the frontend. Update when we add new ones.

**Priority:** P2.

---

## Tier 3: NICE TO HAVE (post-launch improvements)

---

### Gap 15: No bulk audit check

**Problem:** Can't check 10 proposals at once.

**Fix:** New edge function `audit-bulk-check/index.ts` — accepts array of documents, runs `audit-check` in parallel, returns comparison table.

**Cost:** 1 credit per document.
**Priority:** P3.

---

### Gap 16: No cross-tool intelligence

**Problem:** Data exists across tools but nobody connects it.

**Fix:** Add to `generate-report` — when computing patterns, look for correlations:
- "Your Audit alignment scores drop after high-conflict Replay conversations"
- "You use ToneCheck more on days you have Replay conversations with Alex"
- "Your Consensus proposals score higher when you use Perspectives first"

**Edge function change:** Update `computePatterns()` in `data-accumulation.ts` to query across tool tables.

**Priority:** P3 — becomes valuable after users have 30+ interactions.

---

### Gap 17: No Perspectives resonance tracking

**Problem:** After seeing 3-5 philosophical perspectives, which one resonated? Nobody asks.

**Fix:** After Perspectives output, show: "Which perspective resonated most? [Stoic] [Buddhist] [Strategist] ..."

One tap → stores in `arena_perspectives.user_resonated`. Over time: "You consistently resonate with Stoic perspectives (67% of the time)."

**Edge function change:** New `record-resonance/index.ts` — simple upsert. No credits.
**Priority:** P3.

---

### Gap 18: No voting in Consensus

**Problem:** Consensus is single-user. Group members can't vote.

**Fix:** Future feature. Requires: shareable proposal links, auth-optional voting, real-time tallying. This is a significant feature build — post-launch.

**Priority:** P3.

---

### Gap 19: No conversation import from platforms

**Problem:** Users manually paste transcripts. Can't import from Slack, iMessage, WhatsApp, email.

**Fix:** Future feature. WhatsApp export is a text file (easiest). Slack has an export API. iMessage requires macOS access. Email requires OAuth.

**Start with:** WhatsApp export file upload. It's a `.txt` file with timestamps and speaker labels. Parse client-side, send to `replay-analyze`.

**Priority:** P3.

---

### Gap 20: No real-time ToneCheck (check as you type)

**Problem:** User writes a message, copies it, pastes it into ToneCheck, gets analysis, goes back to write. Friction.

**Fix:** Future feature. Browser extension or API integration that checks tone inline as you type in Gmail, Slack, LinkedIn.

**Priority:** P4 — this is a separate product expansion, not a fix.

---

## Implementation Order

### Before launch (P0):
1. PDF/DOCX text extraction (frontend)
2. Onboarding card (frontend)
3. ToneCheck contact integration (frontend + edge function)
4. Feedback strip on every output (frontend + new edge function)
5. Follow-up suggestions after output (frontend)

### Week 1 post-launch (P1):
6. Auto-generate "what works / what doesn't" for contacts
7. Self-profile computation
8. Replay simulation edge function
9. Strategy version history

### Month 1 post-launch (P2):
10. Document comparison
11. Persistent groups for Consensus
12. Share card rendering
13. Stakeholder deal tracking
14. Personality framework in frontend

### Later (P3-P4):
15-20. Bulk check, cross-tool intelligence, resonance tracking, voting, platform imports, real-time extension
