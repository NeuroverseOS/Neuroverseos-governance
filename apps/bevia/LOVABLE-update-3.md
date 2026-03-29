# Bevia — Lovable Update #3: Dashboard, Data Views, Reports

> User needs to see everything Bevia stores about them.
> Transparency is a governance requirement (audit_everything invariant).

---

## 1. Dashboard Tabs (/app)

Replace the simple dashboard with a tabbed view:

```
[Overview] [Contacts] [Strategies] [Patterns] [Reports] [Audit Log]
```

### Overview tab (default)
- Credit balance (large) + "Buy more" button
- 6-tool grid with usage counts
- Recent activity feed (last 10 from `credit_transactions`)
- Quick stats: "47 analyses this month · 8 contacts tracked · 3 strategies loaded"

### Contacts tab (Replay data)
List all contacts from `reflect_contacts`:

```
┌──────────────────────────────────────────┐
│ Alex Chen — Boss · 12 conversations      │
│ Trust: ████████░░ 74  Trend: ↗           │
│ Last: 2 days ago                         │
│                                          │
│ What works: Lead with data, Adult ego    │
│ What doesn't: Defensiveness, hedging     │
│                                          │
│ [View full profile]  [Simulate]  [Delete]│
└──────────────────────────────────────────┘
```

Each contact card shows:
- Name + relationship + conversation count
- Behavioral dimension bars (trust, composure, influence, empathy)
- Trend arrows (from last 5 conversations)
- What works / what doesn't (from `what_works` / `what_doesnt_work` jsonb)
- Actions: view full profile, run simulation, DELETE (instant, no friction — governance requires this)

### Strategies tab (Audit data)
List all strategies from `align_strategies`:

```
┌──────────────────────────────────────────┐
│ Meridian Industrial — Q1 Strategy        │
│ 14 guards · 8 values · 3 red lines      │
│ 47 documents checked · Avg score: 72%    │
│ Trend: improving ↗                       │
│                                          │
│ Most triggered rule: "QA before release" │
│                                          │
│ [Check a document]  [View rules]  [Delete]│
└──────────────────────────────────────────┘
```

### Patterns tab (self-profile)
Your behavioral profile across all contacts and tools:

```
┌──────────────────────────────────────────┐
│ Your Behavioral Profile                  │
│ 47 conversations · 8 contacts · 6 months │
├──────────────────────────────────────────┤
│                                          │
│ Default ego state: Adult (72% of time)   │
│ Shift to Child when: challenged on       │
│   competence or timelines                │
│                                          │
│ Strengths:                               │
│ ✅ High composure in new relationships    │
│ ✅ Strong question-asking                 │
│                                          │
│ Growth edges:                            │
│ ⚠️ Defensiveness when competence is       │
│    questioned (40% of negative outcomes) │
│                                          │
│ Intent patterns:                         │
│ You select "be clear" but your behavior  │
│ trends toward "keep the peace" (8x)      │
│                                          │
│ [Generate report — 2 credits]            │
└──────────────────────────────────────────┘
```

Data sources: `reflect_self_profile` + `bevia_user_actions` (intent patterns)

### Reports tab
List of past reports + ability to generate new ones:

```
┌──────────────────────────────────────────┐
│ Reports                                  │
├──────────────────────────────────────────┤
│                                          │
│ [Generate monthly report — 2 credits]    │
│ [Generate quarterly report — 5 credits]  │
│                                          │
│ Or ask anything:                         │
│ [________________________________] [2cr] │
│ "What's my biggest communication pattern │
│  across all contacts?"                   │
│                                          │
│ ── Past Reports ──────────────────────── │
│                                          │
│ March 2026 · Monthly · Generated 3/28    │
│ [View report]                            │
│                                          │
│ Q1 2026 · Quarterly · Generated 3/15    │
│ [View report]                            │
└──────────────────────────────────────────┘
```

### Audit Log tab (governance transparency)
Shows all governance verdicts on the user's actions:

```
┌──────────────────────────────────────────┐
│ Governance Audit Log                     │
│ Every action Bevia evaluated on your     │
│ behalf. Transparent by design.           │
├──────────────────────────────────────────┤
│                                          │
│ 2 min ago · ToneCheck · ALLOW            │
│ translate_message · 1 credit             │
│                                          │
│ 5 min ago · Audit · MODIFY              │
│ check_alignment · guard-015             │
│ "Reframed certainty to pattern"          │
│                                          │
│ 1 hr ago · Replay · ALLOW              │
│ analyze_conversation · 3 credits         │
│                                          │
│ Yesterday · Audit · BLOCK               │
│ generate_world · guard-001               │
│ "Hard conflicts detected — user          │
│  resolution required"                    │
│                                          │
│ [Load more]                              │
└──────────────────────────────────────────┘
```

Data source: `bevia_audit_log` table. Read-only. User can see every verdict, every rule that fired, every modification made to their output.

**This is the governance promise made visible.** Users can see: "Oh, Bevia changed 'this will cause trust to drop' to 'this tends to correlate with trust declining' because of guard-015." Full transparency.

---

## 2. New Edge Functions

Add these stubs (real engines ready to drop in from this repo):

| Function | Route | Credits |
|---|---|---|
| `replay-analyze` | POST /functions/v1/replay-analyze | 3 |
| `consensus` | POST /functions/v1/consensus | 1 |
| `signal-match` | POST /functions/v1/signal-match | 5 |
| `generate-report` | POST /functions/v1/generate-report | 2-5 |

---

## 3. New Supabase Tables

All tables from Update #1 and #2, PLUS if not already created:

```sql
-- Reports (stored for history)
create table bevia_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  period text not null,
  question text,
  report_text text not null,
  patterns jsonb not null,
  created_at timestamptz default now()
);

alter table bevia_reports enable row level security;
create policy "Users own reports" on bevia_reports for all using (auth.uid() = user_id);
```

---

## 4. Delete Buttons Everywhere

Every piece of stored data has a delete button:
- Delete a contact (wipes profile + all conversations with that contact)
- Delete a strategy (wipes world file + all checks against it)
- Delete a conversation analysis
- Delete a report
- Delete entire account

**No confirmation modals.** Single tap, instant delete. This is a governance requirement (`user_can_delete_everything`). If the user clicks delete, it's gone. We show a brief toast: "Deleted. [Undo — 5s]" with a 5-second undo window, then permanent.

---

## 5. Footer on Every Output (reinforced)

Every output card, every dashboard card, every report:

```
Based on observed patterns · Not a prediction · You decide
⚡ NeuroverseOS
```

Small, muted, non-negotiable.
