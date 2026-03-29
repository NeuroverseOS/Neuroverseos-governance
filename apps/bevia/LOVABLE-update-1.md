# Bevia — Lovable Update #1

> Give this to Lovable to update the existing scaffold.
> Changes: Add Reflect as 6th tool, strip configuration wizards, add cost-before-action confirmation.

---

## 1. Add Reflect Tool (6th tool)

### Route
```
/app/reflect → Reflect tool page
```

### Nav update
Add "Reflect" to both mobile bottom tabs and desktop sidebar. It's the 6th tab.

**Accent color:** Slate blue `#6482AD`
**Icon:** Two-way mirror / reflection symbol (or use a simple mirror icon)
**Tagline:** "See what actually happened in that conversation."

### Tool page layout
Same pattern as other tools:
- **Tool header:** Mirror icon + "Reflect" + tagline, tinted slate blue
- **Input area:** Large textarea labeled "Paste a conversation or describe what happened"
  - Placeholder text: "Paste a text conversation, email thread, Slack chat, or just describe what happened..."
  - Below textarea: dropdown labeled "Who were you talking to?" with options:
    - "New person" (text input for name + relationship appears)
    - List of previously saved contacts (from `reflect_contacts` table)
- **"Analyze" button:** Slate blue, shows "Analyze (3 credits)"
- **Result area:** OutputCard with slate blue accent

### Supabase tables (add these)

```sql
create table reflect_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  relationship text,
  profile jsonb not null default '{"trust":50,"composure":50,"influence":50,"empathy":50,"volatility":20,"assertiveness":50,"openness":50,"conflictRisk":10}',
  conversations_analyzed integer default 0,
  what_works jsonb default '[]',
  what_doesnt_work jsonb default '[]',
  ego_state_dynamics jsonb default '{}',
  gottman_history jsonb default '[]',
  confidence text default 'low',
  last_interaction timestamptz,
  created_at timestamptz default now()
);

create table reflect_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  contact_id uuid references reflect_contacts,
  input_type text not null default 'transcript',
  input_text text not null,
  events jsonb not null default '[]',
  shadow_result jsonb,
  behavioral_deltas jsonb,
  archetype_score jsonb,
  energy numeric,
  created_at timestamptz default now()
);

create table reflect_simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  conversation_id uuid references reflect_conversations,
  contact_id uuid references reflect_contacts,
  fork_event_index integer not null,
  approach text not null,
  your_input text,
  simulated_response text,
  behavioral_comparison jsonb,
  created_at timestamptz default now()
);

create table reflect_self_profile (
  user_id uuid references auth.users primary key,
  total_conversations integer default 0,
  total_contacts integer default 0,
  default_ego_state text,
  strengths jsonb default '[]',
  growth_areas jsonb default '[]',
  archetype_alignment jsonb default '{}',
  patterns jsonb default '{}',
  updated_at timestamptz default now()
);

alter table reflect_contacts enable row level security;
alter table reflect_conversations enable row level security;
alter table reflect_simulations enable row level security;
alter table reflect_self_profile enable row level security;
create policy "Users own contacts" on reflect_contacts for all using (auth.uid() = user_id);
create policy "Users own conversations" on reflect_conversations for all using (auth.uid() = user_id);
create policy "Users own simulations" on reflect_simulations for all using (auth.uid() = user_id);
create policy "Users own self profile" on reflect_self_profile for all using (auth.uid() = user_id);
```

### Edge function stub
Add `reflect-analyze/index.ts` with same auth + credit pattern as other tools. Cost: 3 credits.

---

## 2. Add Audit Log Table

```sql
create table bevia_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  action text not null,
  tool text not null,
  verdict text not null,
  rule_id text,
  reason text,
  credit_cost integer default 0,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

alter table bevia_audit_log enable row level security;
create policy "Users read own audit" on bevia_audit_log for select using (auth.uid() = user_id);
create index idx_audit_user on bevia_audit_log(user_id, created_at desc);
```

---

## 3. Cost Confirmation Before Every Action

**Every tool action must show the credit cost and get user confirmation before executing.**

Update every "Go" / "Translate" / "Analyze" / "Check" button to show the cost:

| Tool | Button text | Cost shown |
|------|-----------|------------|
| Unsaid | "Translate (1 credit)" | 1 |
| Align (upload) | "Build alignment engine (15 credits)" | 15 |
| Align (check) | "Check alignment (1 credit)" | 1 |
| Align (rewrite) | "Rewrite suggestions (2 credits)" | 2 |
| Align (simulate) | "Run simulation (2 credits)" | 2 |
| Arena (1 lens) | "Get perspective (1 credit)" | 1 |
| Arena (3+ lenses) | "Compare lenses (3 credits)" | 3 |
| Reflect | "Analyze conversation (3 credits)" | 3 |
| Reflect (simulate) | "Simulate (1 credit per exchange)" | 1 |
| Split | "Find compromise (1 credit)" | 1 |
| Tribe | "Find your 50 (5 credits)" | 5 |

If user has insufficient credits, button shows "Not enough credits" (disabled) with link to /credits page.

**For simulations specifically:** Show a pre-confirmation modal:

```
┌──────────────────────────────────────────┐
│ Run simulation?                          │
│                                          │
│ Agents: 5 (from your org model)          │
│ Steps: 10                                │
│ Estimated cost: 2 credits ($0.10)        │
│                                          │
│      [Cancel]    [Run simulation →]      │
└──────────────────────────────────────────┘
```

---

## 4. Strip All Wizards and Configuration

**Remove or don't build any of these:**
- No "onboarding wizard" for Align — user just uploads docs
- No settings pages for tools (tool behavior is governed by world files, not user toggles)
- No "customize your archetype" flows — predefined archetypes only
- No "configure sensitivity" sliders
- No multi-step onboarding flows

**The UX is: input → output. Nothing else.**

Each tool's input area should be dead simple:
- **Unsaid:** Textarea + two dropdowns (sender/receiver archetype) + Translate button
- **Align:** File upload zone (drag & drop) + action buttons appear after upload
- **Arena:** Textarea + lens pill selector (tap to toggle) + Go button
- **Reflect:** Textarea + contact selector + Analyze button
- **Split:** Group members input + proposal textarea + Find Compromise button
- **Tribe:** Profile textarea + Find My 50 button

---

## 5. Auto-Create Credit Balance on Signup

When a new user signs up, automatically create their `credit_balances` row with 0 balance. Use a Supabase trigger:

```sql
create or replace function create_credit_balance_on_signup()
returns trigger as $$
begin
  insert into credit_balances (user_id, balance, lifetime_purchased, lifetime_spent)
  values (new.id, 0, 0, 0);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function create_credit_balance_on_signup();
```

---

## 6. Update Dashboard for 6 Tools

Dashboard tool grid should now show 6 cards:
1. Unsaid (coral `#f97066`)
2. Align (teal `#14b8a6`)
3. Arena (indigo `#6366f1`)
4. Split (amber `#f59e0b`)
5. Tribe (violet `#a855f7`)
6. **Reflect (slate blue `#6482AD`)** ← NEW

---

## 7. Share Link Pages (Phase 2 — add now)

Add route: `/s/:slug`

This is a public page (no auth required) that displays a shared result card.

For now, only Unsaid translations are shareable. The page:
1. Loads from `unsaid_translations` table where `share_slug = :slug`
2. Displays the translation card (read-only)
3. Shows "Made with bevia.co · ⚡ NeuroverseOS" at the bottom
4. Shows "Try it yourself →" CTA button linking to /app/unsaid

```sql
-- Already have the public policy from initial schema:
-- create policy "Public shared translations" on unsaid_translations for select using (share_slug is not null);
```
