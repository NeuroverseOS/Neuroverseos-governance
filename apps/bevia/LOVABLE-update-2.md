# Bevia — Lovable Update #2: Rename, Layers, Intent, Reflect

> Major update. New names, new navigation model, intent system, 6th tool.
> Engines don't change. UX changes significantly.

---

## 1. Tool Renames (update everywhere)

| Old name | New name | Accent color | Route |
|----------|----------|-------------|-------|
| Unsaid | **ToneCheck** | Coral `#f97066` | `/app/tonecheck` |
| Align | **Audit** | Teal `#14b8a6` | `/app/audit` |
| Arena | **Perspectives** | Indigo `#6366f1` | `/app/perspectives` |
| Split | **Consensus** | Amber `#f59e0b` | `/app/consensus` |
| Tribe Finder | **Signal** | Violet `#a855f7` | `/app/signal` |
| *(NEW)* | **Replay** | Slate blue `#6482AD` | `/app/replay` |

Update: sidebar labels, bottom tab labels, dashboard tool cards, landing page tool cards, all route paths, all button text, all edge function calls.

Old routes should redirect: `/app/unsaid` → `/app/tonecheck`, etc.

---

## 2. Navigation: Layer Model

Replace the flat tool list with grouped layers. The sidebar (desktop) and bottom sheet (mobile) should show:

### Desktop Sidebar

```
bevia

OBSERVE
  ToneCheck
  Replay

GUIDE
  Audit
  Perspectives
  Consensus

DISCOVER
  Signal

────────
Credits
Account
```

Layer labels (OBSERVE, GUIDE, DISCOVER) are small caps, muted color, not clickable — just section headers.

### Mobile Bottom Tabs

Keep it flat for mobile (5 tabs max). Show the 5 most-used tools:

```
ToneCheck · Replay · Audit · Perspectives · More ▾
```

"More ▾" opens a sheet with Consensus + Signal.

---

## 3. Landing Page Update

### Hero
```
bevia
Understand what's actually happening.

[Get started →]
```

### Tool Cards (update names + descriptions)

**ToneCheck** (coral)
"Check how your message will land before you send it."

**Replay** (slate blue)
"See what actually happened in that conversation."

**Audit** (teal)
"Check any document against your strategy and culture."

**Perspectives** (indigo)
"See your situation through Stoic, Buddhist, or any philosophical lens."

**Consensus** (amber)
"Your group's AI coordinator. Fair plans, no arguments."

**Signal** (violet)
"Find the people who think like you."

### How It Works (update)
```
1. Pick a tool
2. Set your intent — what outcome do you want?
3. Get goal-aware analysis — not just what happened, but what it means for what you want
```

### Footer
Keep: `Powered by NeuroverseOS governance engine` with link to GitHub repo.

---

## 4. Intent Selector (add to EVERY tool page)

Every tool page gets an intent selector between the input area and the action button.

### Design: Pill selector (horizontal scrollable row)

```
┌──────────────────────────────────────────────────────────┐
│  Intent: [Be clear] [Show respect] [Keep peace] [Lead]  │
│          [Build trust] [Hard feedback]                   │
└──────────────────────────────────────────────────────────┘
```

- Pills are outlined in tool accent color
- Selected pill is filled with tool accent color + white text
- One pill selected at a time
- Pre-selected with smart default (first pill)
- Optional — if user doesn't touch it, default applies

### Intent options per tool

**ToneCheck:**
- Be clear (default)
- Show respect
- Keep the peace
- Lead the conversation
- Build the relationship
- Deliver hard feedback

**Audit:**
- Check alignment (default)
- Find risks
- Build my case
- Improve this

**Perspectives:**
- Help me decide (default)
- Help me understand
- Find peace with this
- Challenge my thinking

**Replay:**
- What happened? (default)
- Do better next time
- Fix this relationship
- Am I reading this right?

**Consensus:**
- Be fair to everyone (default)
- Just decide
- Avoid drama

**Signal:**
- Find collaborators (default)
- Find mentors
- Find my people

---

## 5. Intent Gap Display (in OutputCard)

When the intent system detects a gap between stated and behavioral intent, show it in the output card:

```
┌──────────────────────────────────────────────────────────┐
│ 💬 ToneCheck                                   1 credit  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 💡 Intent check                                    │  │
│  │                                                    │  │
│  │ You selected "Be clear" but your message           │  │
│  │ hedges in 3 places — "maybe," "just," "if that     │  │
│  │ works for you." That pattern tends to prioritize    │  │
│  │ approval over clarity.                             │  │
│  │                                                    │  │
│  │ Both are valid:                                    │  │
│  │ • If clarity is the goal → here's where to tighten │  │
│  │ • If the relationship matters more → your message  │  │
│  │   is already doing that well                       │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  [rest of translation output...]                         │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ 📋 Copy   📤 Share   🔄 Try again                       │
└──────────────────────────────────────────────────────────┘
```

The intent check box:
- Light yellow/amber background `#fefce8`
- Border `#fde68a`
- Only shows when a gap is detected (not every time)
- Collapsible — user can dismiss it

---

## 6. Replay Tool Page (NEW — 6th tool)

### Route: `/app/replay`

### Layout:
```
┌──────────────────────────────────────────────────────────┐
│ 🪞 Replay                                    Slate blue  │
│ See what actually happened in that conversation.          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Paste a conversation or describe what happened...  │  │
│  │                                                    │  │
│  │                                                    │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Who were you talking to?                                │
│  [New person ▾]  Name: [________]  Role: [________]     │
│                                                          │
│  Intent: [What happened?] [Do better] [Fix this] [Check]│
│                                                          │
│  [Analyze conversation — 3 credits]                      │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  Your result will appear here                            │
└──────────────────────────────────────────────────────────┘
```

### Tabs within Replay (after first analysis):

Show tabs below the tool header:

```
[Analysis] [Contacts] [Patterns] [Simulate]
```

- **Analysis** — the conversation breakdown (default, shows after analyze)
- **Contacts** — list of saved contacts with behavioral profiles and "what works / what doesn't"
- **Patterns** — your self-profile (ego states, strengths, growth areas)
- **Simulate** — fork a conversation moment and replay with different approaches

These tabs surface the Interpret/Learn layers without being separate tools.

---

## 7. Supabase Updates

### New tables (from Update #1, plus additions):

Add all tables from LOVABLE-update-1.md PLUS:

```sql
-- User actions (intent + behavior tracking)
create table bevia_user_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  tool text not null,
  action text not null,
  result_id text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- User feedback
create table bevia_user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  tool text not null,
  result_id text not null,
  feedback_type text not null,
  feedback_value text not null,
  created_at timestamptz default now()
);

alter table bevia_user_actions enable row level security;
alter table bevia_user_feedback enable row level security;
create policy "Users own actions" on bevia_user_actions for all using (auth.uid() = user_id);
create policy "Users own feedback" on bevia_user_feedback for all using (auth.uid() = user_id);
```

### Edge function renames:

| Old function | New function | Notes |
|---|---|---|
| unsaid-translate | **tonecheck** | Same engine, new name |
| align-ingest | **audit-ingest** | Same engine |
| align-check | **audit-check** | Same engine |
| align-rewrite | **audit-rewrite** | Same engine |
| arena-perspective | **perspectives** | Same engine |
| split-propose | **consensus** | Same engine |
| tribe-match | **signal-match** | Same engine |
| *(new)* | **replay-analyze** | New edge function for conversation analysis |
| *(new)* | **generate-report** | Monthly/quarterly/on-demand reports |

---

## 8. Dashboard Update

### Credit balance (keep as is)

### Tool grid: 6 cards in 2×3 grid

| ToneCheck (coral) | Replay (slate blue) |
| Audit (teal) | Perspectives (indigo) |
| Consensus (amber) | Signal (violet) |

Each card shows:
- Tool icon + name
- One-line description
- Usage count: "12 checks this week" (from credit_transactions)

### Activity feed: recent actions across all tools

Show last 10 items from `credit_transactions`:
```
ToneCheck · 2 min ago · 1 credit
Audit · 1 hr ago · 1 credit
Replay · yesterday · 3 credits
```

---

## 9. Ethical Framing in UI

### Every output card footer includes:

Small muted text below the action bar:
```
Based on observed patterns · Not a prediction · You decide
```

This is non-negotiable. Every tool, every output.

### ToneCheck specifically:

The old "What to say back" section is now **"How to bridge"** — shows 2-3 response OPTIONS with tradeoffs, not a single script.

### Replay specifically:

Contact profiles show "What works" and "What doesn't work" — NEVER "How to manipulate" or "How to control."

---

## 10. Cost Display Rules (reinforced)

Every action button shows credits. Always.

If balance is insufficient:
- Button is disabled
- Text changes to: "Need X more credits"
- Small link: "Buy credits →"

For simulations, show pre-confirmation:
```
Run simulation?
5 agents · 10 steps · 2 credits ($0.10)
[Cancel]  [Run →]
```
