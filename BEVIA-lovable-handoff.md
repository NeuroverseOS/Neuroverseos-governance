# Bevia.co — Lovable Handoff Spec

> Give this document to Lovable to scaffold the frontend app.
> Engines will be built separately and dropped into supabase/functions/shared/engines/

---

## Project Setup

- **Name:** Bevia
- **Domain:** bevia.co
- **Stack:** React + TypeScript + Tailwind CSS + Supabase (auth, database, edge functions)
- **Routing:** React Router (or whatever Lovable defaults to)
- **Mobile-first** responsive design

---

## Design System — "NeuroverseOS Light"

### Colors

**Base (light theme):**
```css
--bg-primary: #ffffff;        /* page background */
--bg-secondary: #f8fafc;      /* card backgrounds */
--bg-tertiary: #f1f5f9;       /* hover, subtle sections */
--border: #e2e8f0;            /* borders, dividers */
--text-primary: #0f172a;      /* headings */
--text-secondary: #475569;    /* body text */
--text-muted: #94a3b8;        /* captions, helpers */
```

**Brand & status colors:**
```css
--brand-purple: #8b5cf6;      /* Bevia brand, primary CTAs */
--success-green: #22c55e;     /* aligned, positive */
--error-red: #ef4444;         /* conflict, negative */
--warning-yellow: #eab308;    /* drift, partial */
--info-cyan: #06b6d4;         /* links, data */
```

**Per-tool accent colors:**
```css
--unsaid-coral: #f97066;
--arena-indigo: #6366f1;
--align-teal: #14b8a6;
--split-amber: #f59e0b;
--tribe-violet: #a855f7;
```

When the user is inside a tool, the tool's accent color is used for:
- Header/top bar tint
- Primary buttons
- Active/selected states
- Card header accents

When outside any tool (dashboard, credits, account), use `--brand-purple`.

### Typography

- **Logo:** `'Fira Code', monospace` — bold, 20px. The word "bevia" in lowercase.
- **Headings:** `'Inter', sans-serif` — semibold (600), 18–24px
- **Body:** `'Inter', sans-serif` — regular (400), 14–16px
- **Labels:** `'Inter', sans-serif` — medium (500), 11–12px, uppercase, 1px letter-spacing
- **Code/data:** `'Fira Code', monospace` — regular (400), 13px

### Component Style

- **Cards:** white bg, 1px border `#e2e8f0`, rounded-lg (8px), shadow-sm
- **Buttons:** primary = brand/tool color fill + white text, secondary = outlined, ghost = text only
- **Badges:** pill-shaped, outlined, color-coded (green/yellow/red for verdicts)
- **Inputs:** white bg, 1px border, rounded-md, focus ring in tool accent color
- **Overall feel:** Clean, minimal, lots of whitespace. Not dark. Not dense. Approachable.

---

## Pages & Routes

```
/                     → Landing page
/app                  → Dashboard (requires auth)
/app/unsaid           → Unsaid tool
/app/align            → Align tool
/app/arena            → Belief Arena tool
/app/split            → Split tool
/app/tribe            → Tribe Finder tool
/credits              → Buy credits (requires auth)
/account              → Profile & settings (requires auth)
```

---

## Landing Page (/)

Simple, clean, one-page scroll:

1. **Hero:** "bevia" logo + tagline "AI tools that think differently." + "Get started" button (→ signup)
2. **Tool cards:** 5 cards in a grid, each showing tool icon + name + one-line description + accent color. Tapping a card scrolls to its section or goes to signup.
3. **How it works:** 3 steps — Sign up → Buy credits ($2.99 for 50) → Use any tool
4. **Footer:** Links, legal, "powered by NeuroverseOS"

Tool card descriptions:
- **Unsaid:** "Translate any message between personality types. See what they meant vs what you heard."
- **Align:** "Check any document against your company strategy and culture. Instant alignment verdict."
- **Belief Arena:** "See your decisions through the lens of Stoicism, psychology, or any philosophy you choose."
- **Split:** "Your friend group's AI coordinator. Fair plans, fair splits, no arguments."
- **Tribe Finder:** "Find the 50 people on Earth you should actually know."

---

## Shell Layout

### Mobile (< 768px)

```
┌─────────────────────────┐
│  bevia     ● 47 credits │  ← sticky top bar
├─────────────────────────┤
│                         │
│     [ Page Content ]    │  ← full width, scrollable
│                         │
├─────────────────────────┤
│ 💬  🔮  🎯  ⚖️  🔗   │  ← bottom tab bar (5 tool icons)
└─────────────────────────┘
```

- Top bar: "bevia" logo (left), credit balance with coin icon (right)
- Bottom tabs: 5 tool icons, each in its accent color when active, gray when inactive
- Tapping a tab navigates to that tool's page

### Desktop (≥ 768px)

```
┌────────────────────────────────────────────┐
│  bevia                        ● 47 credits │
├──────────┬─────────────────────────────────┤
│          │                                 │
│  Unsaid  │      [ Page Content ]           │
│  Align   │                                 │
│  Arena   │                                 │
│  Split   │                                 │
│  Tribe   │                                 │
│          │                                 │
│  ──────  │                                 │
│  Credits │                                 │
│  Account │                                 │
└──────────┴─────────────────────────────────┘
```

- Left sidebar: 200px, collapsible. Tool names with icons, active tool highlighted with accent color.
- Top bar spans full width.

---

## Dashboard (/app)

Shows after login:
- **Credit balance** (large, centered) with "Buy more" button
- **Tool grid:** 5 cards, same as landing page but with usage stats: "12 translations this week" etc.
- **Recent activity feed:** last 10 actions across all tools (from credit_transactions table)

---

## Auth (Supabase)

- Email + password signup
- Google OAuth
- After signup → redirect to /credits to purchase first credit pack
- Require credits to use any tool (no free tier). Show friendly "Buy credits to get started" if balance = 0.

---

## Credits (/credits)

Three purchase options:

| Pack | Price | Credits | Per-credit cost |
|------|-------|---------|-----------------|
| Starter | $2.99 | 50 | $0.060 |
| Regular | $4.99 | 100 | $0.050 |
| Bulk | $9.99 | 250 | $0.040 |

- Stripe Checkout integration (or Supabase-compatible payment)
- After purchase: update credit_balances table, redirect to /app
- Show transaction history on this page

---

## Supabase Schema

```sql
-- Credit balances
create table credit_balances (
  user_id uuid references auth.users primary key,
  balance integer not null default 0,
  lifetime_purchased integer not null default 0,
  lifetime_spent integer not null default 0,
  updated_at timestamptz default now()
);

-- Credit transactions (audit log)
create table credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  amount integer not null,
  action text not null,
  tool text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Align: stored strategy world files
create table align_strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  source_docs jsonb default '[]',
  world_file jsonb not null,
  rules_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Align: document check history
create table align_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  strategy_id uuid references align_strategies,
  doc_name text,
  verdict text not null,
  alignment_score numeric,
  evidence jsonb default '{}',
  created_at timestamptz default now()
);

-- Unsaid: saved translations (for share links)
create table unsaid_translations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  sender_lens text not null,
  receiver_lens text not null,
  original_message text not null,
  translation jsonb not null,
  share_slug text unique,
  created_at timestamptz default now()
);

-- Enable RLS on all tables
alter table credit_balances enable row level security;
alter table credit_transactions enable row level security;
alter table align_strategies enable row level security;
alter table align_checks enable row level security;
alter table unsaid_translations enable row level security;

-- RLS policies: users can only access their own data
create policy "Users see own balance" on credit_balances for select using (auth.uid() = user_id);
create policy "Users see own transactions" on credit_transactions for select using (auth.uid() = user_id);
create policy "Users see own strategies" on align_strategies for all using (auth.uid() = user_id);
create policy "Users see own checks" on align_checks for all using (auth.uid() = user_id);
create policy "Users see own translations" on unsaid_translations for all using (auth.uid() = user_id);
-- Public access for shared translations (by share_slug)
create policy "Public shared translations" on unsaid_translations for select using (share_slug is not null);
```

---

## Tool Pages — Placeholder Layout

For initial scaffold, each tool page should have:

1. **Tool header:** Icon + name + one-line description, tinted with accent color
2. **Input area:** centered text area or file upload zone (depends on tool)
3. **"Go" button:** uses tool accent color, shows credit cost: "Translate (1 credit)"
4. **Result area:** empty state says "Your result will appear here"
5. **Result card:** the universal output card (see Output Card Component below)

### Output Card Component (reusable)

```tsx
// Shared component used by all tools
interface OutputCardProps {
  toolName: string;
  toolIcon: string;
  accentColor: string;
  creditCost: number;
  children: React.ReactNode;  // tool-specific content
  onCopy: () => void;
  onShare: () => void;
  onSave?: () => void;
  extraActions?: { label: string; icon: string; onClick: () => void; creditCost?: number }[];
}
```

Structure:
```
┌─────────────────────────────────────────┐
│ [icon] Tool Name              1 credit  │  header
├─────────────────────────────────────────┤
│                                         │
│         { children }                    │  tool-specific content
│                                         │
├─────────────────────────────────────────┤
│  📋 Copy    📤 Share    📥 Save         │  action bar
│  [extra actions if any]                 │
└─────────────────────────────────────────┘
```

---

## Edge Functions (Supabase)

These will be built separately and added to `supabase/functions/`. For now, Lovable should scaffold empty function stubs:

```
supabase/functions/
├── unsaid-translate/index.ts     ← called when user hits "Translate"
├── align-ingest/index.ts         ← called when user uploads strategy docs
├── align-check/index.ts          ← called when user checks a document
├── align-rewrite/index.ts        ← called when user hits "Rewrite"
├── arena-perspective/index.ts    ← called when user asks for lens view
├── split-propose/index.ts        ← called when user submits proposal
├── tribe-match/index.ts          ← called when user generates matches
└── shared/
    ├── credits.ts                ← deduct/check credit balance
    └── engines/                  ← governance engine modules (added later)
```

Each edge function stub should:
1. Verify auth (Supabase JWT)
2. Check credit balance (call shared/credits.ts)
3. Return mock/placeholder response for now
4. Deduct credits on success

Example stub:
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Get user from JWT
  const authHeader = req.headers.get('Authorization')!
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user) return new Response('Unauthorized', { status: 401 })

  // Check credits
  const { data: balance } = await supabase
    .from('credit_balances')
    .select('balance')
    .eq('user_id', user.id)
    .single()

  const COST = 1 // credits for this action
  if (!balance || balance.balance < COST) {
    return new Response(JSON.stringify({ error: 'Insufficient credits' }), { status: 402 })
  }

  // TODO: actual engine logic goes here
  const result = { placeholder: true, message: 'Engine not yet connected' }

  // Deduct credits
  await supabase.rpc('deduct_credits', { p_user_id: user.id, p_amount: COST, p_action: 'unsaid_translate', p_tool: 'unsaid' })

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

---

## What Lovable Builds vs What Gets Added Later

| Lovable builds | Added later (from NeuroverseOS repo) |
|---------------|--------------------------------------|
| All UI pages and components | Engine logic inside edge functions |
| Auth flow | Governance engine module |
| Credit purchase + balance display | Lenses compiler module |
| Tool input forms | AI prompt templates per tool |
| Output card rendering | Actual Gemini/Claude API calls |
| Share link pages | PDF report generation (Align) |
| Supabase schema + RLS | Connection path algorithms (Tribe) |
| Edge function stubs | Real function implementations |

Lovable gets the app running with mock data. We fill in the real engines after.

---

## Branding — "Powered by NeuroverseOS"

Bevia is closed-source. The governance engine underneath (NeuroverseOS) is open-source. Add these:

1. **Footer (every page):** `"Powered by NeuroverseOS governance engine"` — link to `https://github.com/NeuroverseOS/Neuroverseos-governance`
2. **Output cards:** Small `"⚡ NeuroverseOS"` text in bottom-right corner of every result card, linked to the repo. Light gray, subtle, doesn't compete with the result content.
3. **Share images:** When generating shareable card images, include `"bevia.co · powered by NeuroverseOS"` as a footer watermark.
4. **Landing page:** Add a section titled "Built on NeuroverseOS" with text: "Bevia's engine is open-source, auditable, and deterministic. No black boxes." Link to GitHub repo.
5. **Align PDF reports:** Footer on every page: `"Generated by Bevia · NeuroverseOS governance engine"`
