# Stakeholder — Deal Intelligence Template for Bevia

> **Campaign:** abcdeals.co ("Always Be Closing — or get closed.")
> **Product:** Not a separate app. A Document Hub template that orchestrates existing Bevia engines around deals.
> **Entry:** User uploads a contract/deal → AI classifies as "deal" → Stakeholder analysis view activates.

---

## What This Is

Stakeholder is a **use-case wrapper** around existing Bevia engines. No new engines. No new edge functions. It orchestrates:

- **Audit** → parse company strategy, check deal alignment
- **Replay** → analyze conversations with stakeholders (recruiter, manager, lawyer)
- **ToneCheck** → check your emails/messages before sending
- **Intent** → "What do YOU want from this deal?" drives everything
- **Simulation** → "What if I push on comp?" / "What if I walk?"
- **Contact profiles** → stakeholder behavioral profiles build over time
- **Document Hub** → all deal documents cached, classified, cross-referenced

---

## User Flow

### Step 1: Upload the Deal

User goes to Document Hub (or abcdeals.co landing page → redirects to Bevia).

Drops one or more files:
- Contract PDF
- Offer letter
- Email thread with recruiter
- Job description
- Company "about us" / mission page

AI classifies each document and tags it as part of a "deal."

**New document type in document-hub.ts:** `deal` (added alongside strategy, culture, conversation, etc.)

### Step 2: Add Stakeholders

For each person involved in the deal, user adds:
- Name
- Role (recruiter, hiring manager, VP, legal, etc.)
- Any notes ("pushy on timeline", "seems genuine", etc.)
- Optional: paste their LinkedIn summary or email signature

Each stakeholder becomes a **contact profile** in Replay's `reflect_contacts` table with a tag: `deal_stakeholder`.

### Step 3: Define Your Position

User fills in (simple form, not a wizard):

```
What I want:
[free text — "160K base, remote, equity, 4 weeks PTO"]

What I'll accept:
[free text — "140K if equity is strong, hybrid okay if 3 days remote"]

What I'll walk from:
[free text — "Under 130K, full in-office, no equity"]

My leverage:
[free text — "competing offer from Company B, rare skill set"]

My timeline:
[free text — "need to decide by March 15"]
```

This gets stored as a **deal context** object attached to the deal's documents.

### Step 4: Get the Analysis

One button: **"Analyze this deal"** — credits shown before click.

System runs these engines in sequence:

```
1. Audit-ingest: parse company docs → extract their stated values, priorities, red lines
2. Audit-check: check the deal terms against their stated values
   → "Company claims work-life balance but contract has no PTO policy"
3. Intent analysis: user's stated position vs deal terms
   → "You want 160K. Offer is 140K. Gap: 20K. Their leverage: timeline pressure."
4. Stakeholder mapping: who wants what, who has power
   → Built from contact profiles + document analysis
5. Pressure detection: identify artificial urgency, anchoring, missing info
6. Simulation: project outcomes for different moves
```

### Step 5: The Output

**Stakeholder Analysis Card** (uses OutputCard component, Reality/Action split):

```
┌──────────────────────────────────────────────────────────┐
│ 🎯 Stakeholder Analysis                        X credits │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ ══ REALITY (unsoftened) ═══════════════════════════════  │
│                                                          │
│ STAKEHOLDER MAP                                          │
│ ┌─────────────────────────────────────────────────────┐  │
│ │ Company  → wants: growth + speed                    │  │
│ │           has: high leverage (you need them more)   │  │
│ │                                                     │  │
│ │ VP Eng   → wants: senior IC, fast ramp              │  │
│ │           pressure: headcount approval expires Q2   │  │
│ │                                                     │  │
│ │ Recruiter → wants: fast close, hit quota            │  │
│ │            pressure: using timeline as leverage     │  │
│ │                                                     │  │
│ │ You      → wants: 160K, remote, equity              │  │
│ │           has: competing offer, rare skill set       │  │
│ └─────────────────────────────────────────────────────┘  │
│                                                          │
│ LEVERAGE ANALYSIS                                        │
│ Your leverage:  ██████░░░░ Medium                        │
│ Their leverage: ████████░░ High                          │
│ Hidden factor:  VP's headcount expires Q2 — they need    │
│                 you more than the recruiter is showing    │
│                                                          │
│ PRESSURE TACTICS DETECTED                                │
│ ⚠️ Artificial timeline: "We need an answer by Friday"    │
│    → No structural reason for this deadline              │
│ ⚠️ Anchoring: Offer came in at 140K without asking your  │
│    expectations first                                    │
│ ⚠️ Missing info: No equity details in writing, only      │
│    verbal "we'll figure it out"                          │
│                                                          │
│ ALIGNMENT GAP                                            │
│ Company says: "We value long-term partnerships"          │
│ Deal shows:   1-year cliff, no severance, at-will        │
│ → Their terms optimize for THEIR flexibility, not        │
│   partnership. The language doesn't match the contract.  │
│                                                          │
│ WHAT'S MISSING FROM THIS DEAL                            │
│ ❌ No equity specifics (vesting, strike price, dilution)  │
│ ❌ No remote work policy in writing                       │
│ ❌ No performance review criteria or promotion path       │
│ ❌ Non-compete clause is unusually broad (2 years, any    │
│    competitor)                                           │
│                                                          │
│ DEAL SCORE                                               │
│ ████████░░░░░░░░░░░░ 4/10                                │
│ "You're taking on more downside than upside."            │
│                                                          │
│ ══ YOUR MOVES (based on your stated goals) ════════════  │
│                                                          │
│ Option A: PUSH (firm)                                    │
│ Counter at 155K + equity in writing + remote confirmed.  │
│ Go through VP, not recruiter — VP has more to lose.      │
│ Tradeoff: may slow process, but anchors your value.      │
│                                                          │
│ Option B: REFRAME (strategic)                            │
│ "I'm excited about the role. For me to move forward,     │
│ I need [equity details, remote policy, comp adjustment]. │
│ I have until [your actual timeline], not Friday."        │
│ Tradeoff: shows interest while resetting leverage.       │
│                                                          │
│ Option C: WALK (exit)                                    │
│ You have a competing offer. This deal scores 4/10.       │
│ Walking is not emotional — it's mathematical.            │
│ Tradeoff: lose this opportunity, keep leverage for next.  │
│                                                          │
│ Option D: ACCEPT WITH CONDITIONS (compromise)            │
│ Accept 140K but get equity, remote, and severance clause │
│ in writing before signing. Non-negotiables in contract.  │
│ Tradeoff: lower comp, but protected on the terms that    │
│ matter for your stated walk-away conditions.             │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ Based on observed patterns · Not a prediction · You decide│
│ ⚡ NeuroverseOS                                           │
│                                                          │
│ 📋 Copy  📤 Share  📥 PDF  🔄 Simulate a move           │
└──────────────────────────────────────────────────────────┘
```

### Step 6: Simulate Moves

User taps "Simulate a move" → picks one of the options (or types their own) → system projects:

```
You chose: "Counter at 155K + equity in writing"

Projected stakeholder responses:
- Recruiter: likely pushes back, reanchors at 145K (pattern: recruiter-driven timeline)
- VP Eng: likely supports if framed as "closing fast" (pattern: headcount pressure)
- You: if they counter at 145K + equity, that hits your "acceptable" threshold

Projected deal score after this move: 6/10 → 7/10
Projected leverage shift: You ↑ (showed competing offer strength without saying it)
```

### Step 7: Ongoing Tracking

As the deal progresses, user logs:
- New emails → analyzed via Replay
- Conversations → behavioral analysis, stakeholder profile updates
- Updated terms → re-run Audit check
- Their own messages → ToneCheck before sending

Dashboard shows:
- Leverage trajectory (rising/falling over time)
- Trust trajectory per stakeholder
- Pressure pattern changes
- Deal score evolution

---

## Data Schema

### Deal Context (stored in `bevia_documents` with type = 'deal')

```typescript
interface DealContext {
  dealId: string;
  userId: string;
  dealName: string;             // "Acme Corp Senior Engineer Offer"
  status: 'analyzing' | 'negotiating' | 'decided' | 'closed';
  documents: string[];          // IDs of associated bevia_documents
  stakeholders: string[];       // IDs of reflect_contacts tagged deal_stakeholder
  userPosition: {
    wants: string;
    accepts: string;
    walksFrom: string;
    leverage: string;
    timeline: string;
  };
  dealScore: number | null;     // 0-10, computed by analysis
  leverageAnalysis: {
    yours: 'low' | 'medium' | 'high';
    theirs: 'low' | 'medium' | 'high';
    hidden: string | null;
  } | null;
  pressureTactics: string[];
  alignmentGaps: string[];
  missingItems: string[];
  moves: DealMove[];
  createdAt: string;
  updatedAt: string;
}

interface DealMove {
  id: string;
  timestamp: string;
  moveType: 'push' | 'reframe' | 'walk' | 'accept' | 'counter' | 'custom';
  description: string;
  projectedOutcome: string | null;
  actualOutcome: string | null;  // filled in when user reports back
  dealScoreAfter: number | null;
}
```

### Supabase Table

```sql
create table if not exists bevia_deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  deal_name text not null,
  status text not null default 'analyzing',
  documents uuid[] default '{}',
  stakeholders uuid[] default '{}',
  user_position jsonb not null,
  deal_score numeric,
  leverage_analysis jsonb,
  pressure_tactics jsonb default '[]',
  alignment_gaps jsonb default '[]',
  missing_items jsonb default '[]',
  moves jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table bevia_deals enable row level security;
create policy "Users own deals" on bevia_deals for all using (auth.uid() = user_id);
create index idx_deals_user on bevia_deals(user_id, updated_at desc);
```

---

## Edge Function: `stakeholder-analyze`

This is the ONE new edge function. It orchestrates existing engines:

```typescript
// Stakeholder analysis is NOT a new engine.
// It calls existing engines in sequence:
//
// 1. Document Hub: classify uploaded docs
// 2. Audit-ingest: parse company docs into world file (if not cached)
// 3. Audit-check: check deal terms against company's stated values
// 4. Intent analysis: user's position vs deal terms
// 5. AI analysis: stakeholder mapping, leverage, pressure, alignment gaps
// 6. Governance: Reality/Action split, full-spectrum options, no softening
//
// Credits: 5 (covers the orchestration + AI analysis)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { authenticate, errorResponse, jsonResponse } from '../shared/auth.ts';
import { checkCredits, deductCredits, refundCredits } from '../shared/credits.ts';
import { callGemini } from '../shared/gemini.ts';
import { evaluateAction, logAudit, sanitizeOutput } from '../shared/governance.ts';
import { analyzeIntent, parseFreeTextIntent, buildIntentPromptAddition, DEFAULT_INTENTS } from '../shared/intent.ts';
import { recordUserAction } from '../shared/data-accumulation.ts';
import { uploadAndParseDocument, getCachedResult, setCachedResult } from '../shared/document-hub.ts';
import { buildPersonalityContext } from '../shared/personality-frameworks.ts';

const CREDIT_COST = 5;

interface StakeholderRequest {
  dealName: string;
  documents: { name: string; content: string }[];
  stakeholders: { name: string; role: string; notes?: string; personalityTags?: Record<string, string> }[];
  userPosition: {
    wants: string;
    accepts: string;
    walksFrom: string;
    leverage: string;
    timeline: string;
  };
  intent?: string;
  freeIntent?: string;
}
```

The system prompt for the AI analysis:

```
You are Stakeholder by Bevia — a deal intelligence engine.

You receive:
1. Deal documents (contracts, offers, email threads)
2. Stakeholder profiles (who's involved, their role, behavioral notes)
3. Company context (mission, values, public statements)
4. The user's position (what they want, what they'll accept, what they'll walk from)

Your job: map the REALITY of this deal. Not what anyone claims. What the documents and behavior actually show.

=== REALITY LAYER (never softened) ===

STAKEHOLDER MAP:
For each person involved, identify:
- What they WANT (from the deal, not what they say)
- What PRESSURE they're under (timeline, quota, budget, politics)
- What LEVERAGE they have over the user
- What LEVERAGE the user has over them

PRESSURE TACTICS:
Identify any artificial urgency, anchoring, missing information, or manipulation in the deal process. Name them directly. "The recruiter is using timeline pressure" — not "there may be some urgency."

ALIGNMENT GAP:
Compare what the company SAYS (mission, values, public statements) with what the deal SHOWS (contract terms, comp structure, policies). Surface every contradiction.

WHAT'S MISSING:
List everything that SHOULD be in this deal but isn't. Missing equity details, unclear policies, absent protections. These are negotiation leverage points.

DEAL SCORE:
Rate 1-10 based on: does this deal serve the user's stated wants, protect against their stated walk-aways, and align with the company's stated values? Be honest. A 4/10 is a 4/10.

=== ACTION LAYER (based on user's intent) ===

Provide 3-4 options covering the full spectrum:
- PUSH: assertive counter, use leverage
- REFRAME: strategic repositioning without aggression
- WALK: exit analysis with tradeoffs
- ACCEPT WITH CONDITIONS: compromise with protections

Each option must include:
- What to do (specific, not vague)
- Who to approach (route around pressure if needed)
- Tradeoff (what you gain, what it costs)
- Projected stakeholder response

RULES:
- Reality is never softened. If the deal is bad, say it's bad.
- Name pressure tactics directly. "Anchoring" not "they may have started high."
- Alignment gaps are the most powerful finding — companies hate being caught saying one thing and doing another.
- All options include exit/walk. Sometimes the best move is no deal.
- Never script exact words. Show the approach and let the user craft their own message.
- If user's intent is aggressive ("win this"), lead with PUSH options.
- If user's intent is protective ("protect myself"), lead with what's missing and walk analysis.

RESPOND WITH JSON.
```

---

## abcdeals.co Landing Page

Separate domain that funnels to Bevia.

```
ALWAYS. BE. CLOSING.
Or get closed.

Drop your deal. See what's really happening.

[Paste contract or offer letter here]

[Analyze →]

↓ redirects to bevia.co/app/stakeholder with pre-filled document
```

After analysis, share card:

```
"I ran my job offer through Stakeholder. Deal score: 4/10.
Found 3 pressure tactics and 4 missing items.
Always be closing — but don't close blind."

→ abcdeals.co
```

---

## How It Uses the Layer Model

```
OBSERVE    → upload deal docs, add stakeholders, define your position
INTERPRET  → stakeholder map, leverage analysis, pressure detection, alignment gaps
GUIDE      → your moves (push, reframe, walk, accept with conditions)
LEARN      → how your negotiation patterns evolve across deals
EVOLVE     → deal score and leverage tracking as negotiation progresses
```

---

## Integration Points (what already exists)

| Need | Existing engine | How Stakeholder uses it |
|------|----------------|----------------------|
| Parse company docs | audit-ingest | Extract company values/priorities → world file |
| Check deal alignment | audit-check | Check contract terms against company's stated values |
| Analyze conversations | replay-analyze | Analyze email threads, calls with stakeholders |
| Check your messages | tonecheck | "Does my counter-offer email sound desperate or strong?" |
| Stakeholder profiles | reflect_contacts | Each stakeholder gets a behavioral profile that builds over time |
| Personality frameworks | personality-frameworks.ts | Tag stakeholders with MBTI, etc. for behavioral context |
| Intent | intent.ts | "What do YOU want?" drives the entire analysis |
| Document caching | document-hub.ts | Contract parsed once, cached, reused for every check |
| Simulation | cli-integration.ts simulate() | "What if I push on comp?" projected outcomes |
| Governance | governance.ts | Reality/Action split, no softening, full-spectrum options |
| Data accumulation | data-accumulation.ts | Track deal patterns across multiple negotiations |

---

## What Needs to Be Built

1. **`stakeholder-analyze/index.ts`** — one new edge function that orchestrates existing engines
2. **`bevia_deals` Supabase table** — store deal context, scores, moves
3. **Deal analysis UI page** in Lovable — `/app/stakeholder`
4. **Document Hub update** — add `deal` as a document type, auto-route to stakeholder analysis
5. **abcdeals.co landing page** — simple, redirects to Bevia with pre-filled doc
6. **Share card template** — "Deal score: 4/10. Found 3 pressure tactics."

---

## Governance

All existing governance applies. Specifically:

- **Reality layer never softened** — if the deal is bad, say it's bad
- **Full-spectrum options** — always include WALK as an option
- **Intent-aware** — "win this negotiation" is legitimate, "protect myself" is legitimate
- **Evidence-based framing** — "This is an anchoring tactic" backed by evidence, not opinion
- **Conditional sanitization** — if user intent is protective, preserve clinical language
- **Simulation honesty** — "Based on stakeholder patterns, this is a projection, not a prediction"
- **No scripting** — show approaches and tradeoffs, never exact words to say

Platform invariant: `awareness_not_optimization` — we show the deal reality and options. We don't optimize the user's negotiation. They decide.

---

## Accent Color & Nav Placement

**Accent color:** Gold `#D4A017`
**Icon:** Handshake or chess piece
**Nav placement:** Under GUIDE layer (alongside Audit and Perspectives)

```
OBSERVE     ToneCheck · Replay
GUIDE       Audit · Perspectives · Consensus · Stakeholder
DISCOVER    Signal
```
