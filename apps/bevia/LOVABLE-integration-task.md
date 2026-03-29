# Bevia — Lovable Integration Task

> The governed engine is now in `supabase/functions/`. This task wires the frontend to the new functions.

---

## What Changed

All edge functions in `supabase/functions/` have been replaced with fully governed versions. Old function names were removed. New structure:

```
supabase/functions/
├── shared/            ← Engine (governance, intent, credits, AI, caching, personality frameworks)
├── tonecheck/         ← was unsaid-translate
├── audit-check/       ← was align-check
├── audit-ingest/      ← was align-ingest
├── audit-rewrite/     ← was align-rewrite
├── perspectives/      ← was arena-perspective
├── replay-analyze/    ← NEW
├── consensus/         ← NEW (was split-propose)
├── signal-match/      ← NEW (was tribe-match)
├── generate-report/   ← NEW
├── create-checkout/   ← Stripe (unchanged)
└── stripe-webhook/    ← Stripe (unchanged)
```

---

## Task 1: Update Frontend API Calls

Every page that calls an edge function needs to update the function name in the URL.

| Page | Old function call | New function call |
|------|------------------|-------------------|
| `/app/tonecheck` (was `/app/unsaid`) | `unsaid-translate` | `tonecheck` |
| `/app/audit` (was `/app/align`) — upload | `align-ingest` | `audit-ingest` |
| `/app/audit` — check doc | `align-check` | `audit-check` |
| `/app/audit` — rewrite | `align-rewrite` | `audit-rewrite` |
| `/app/perspectives` (was `/app/arena`) | `arena-perspective` | `perspectives` |
| `/app/replay` (NEW) | n/a | `replay-analyze` |
| `/app/consensus` (was `/app/split`) | `split-propose` | `consensus` |
| `/app/signal` (was `/app/tribe`) | `tribe-match` | `signal-match` |

The Supabase client call pattern stays the same:
```typescript
const { data, error } = await supabase.functions.invoke('tonecheck', {
  body: { message, senderArchetype, receiverArchetype, intent }
})
```

Just change the function name string.

---

## Task 2: Add Intent Selector to Every Tool Page

Every tool page needs a pill selector for intent. Add it between the input area and the action button.

### Component: IntentPills

```tsx
interface IntentPillsProps {
  tool: 'tonecheck' | 'audit' | 'perspectives' | 'replay' | 'consensus' | 'signal';
  selected: string;
  onSelect: (intentId: string) => void;
}
```

The intent options per tool are defined in the edge functions. For the frontend, use these:

**ToneCheck:**
- be_clear (default), be_respectful, avoid_conflict, show_authority, build_trust, deliver_hard_news
- set_boundary, win_this, end_this, express_frustration, protect_myself, say_no, confront

**Audit:**
- check_alignment (default), find_risks, build_case, improve_proposal
- kill_proposal, expose_risk, defend_position

**Perspectives:**
- make_decision (default), understand_situation, find_peace, challenge_myself

**Replay:**
- understand_what_happened (default), improve_next_time, repair_relationship, validate_my_read
- confirm_this_is_toxic, build_evidence, validate_leaving, detect_manipulation

**Consensus:**
- find_fair_solution (default), move_fast, minimize_conflict
- protect_my_team, block_bad_idea

**Signal:**
- find_collaborators (default), find_mentors, find_community

Design: horizontal scrollable row of pills. Selected pill = filled with tool accent color. Unselected = outlined. First pill pre-selected as default.

Also add a free-text input below the pills:
```
Or type your own intent: [________________________________]
```
This gets sent as `freeIntent` in the request body.

---

## Task 3: Add `intent` Field to Every Function Call

Every edge function now accepts an optional `intent` field (and optional `freeIntent` for free text). Update all function invocations:

```typescript
// Before
await supabase.functions.invoke('tonecheck', {
  body: { message, senderArchetype, receiverArchetype }
})

// After
await supabase.functions.invoke('tonecheck', {
  body: { message, senderArchetype, receiverArchetype, intent: selectedIntent, freeIntent: freeIntentText || undefined }
})
```

---

## Task 4: Handle Intent Gap in Response

The response from every function now includes an `intent` object:

```json
{
  "translation": { ... },
  "intent": {
    "stated": "be_clear",
    "behavioral": "avoid_conflict",
    "gap": "You selected 'Be clear' but your message hedges in 3 places...",
    "confidence": 0.7,
    "signals": ["Contains \"maybe\" — suggests avoid_conflict intent"],
    "pattern": "Across 12 interactions, you select 'be clear' but trend toward 'keep the peace'"
  },
  "creditsRemaining": 47
}
```

When `intent.gap` is not null, show the Intent Gap box in the OutputCard:

```
┌────────────────────────────────────────────────────┐
│ 💡 Intent check                                    │
│                                                    │
│ [intent.gap text here]                             │
│                                                    │
│ Both are valid:                                    │
│ • If [stated intent] is the goal → [suggestion]    │
│ • If [behavioral intent] matters more → [suggestion]│
└────────────────────────────────────────────────────┘
```

Style: light amber background `#fefce8`, border `#fde68a`. Collapsible. Only shows when gap is detected.

When `intent.pattern` is not null (user has 10+ interactions), show below the gap box:

```
📊 Pattern: [intent.pattern text]
```

Style: light blue background `#eff6ff`, small text, collapsible.

---

## Task 5: Update OutputCard for Reality/Action Split

ToneCheck, Replay, and Consensus now return output in two layers:

**Reality layer** (never softened — show as-is):
- `whatTheySaid`, `whatTheyMeant`, `whatYouHeard` (ToneCheck)
- `reality.summary`, `reality.timeline` (Replay)
- `reality.conflicts`, `reality.alignments` (Consensus)

**Action layer** (options with tradeoffs):
- `options` array (ToneCheck)
- `action.options` array (Replay, Consensus)

Display Reality section first, then Action section with a visual divider:

```
── What's actually happening ──────────────
[Reality content]

── Your options ────────────────────────────
[Action options as cards, each with tradeoff noted]
```

Each option card should show:
- The approach text
- The tradeoff (what you gain / what it costs)
- Intensity tag: `gentle` / `firm` / `aggressive` / `exit`

---

## Task 6: Update Routes

| Old route | New route | Redirect? |
|-----------|-----------|-----------|
| `/app/unsaid` | `/app/tonecheck` | Yes — redirect old to new |
| `/app/align` | `/app/audit` | Yes |
| `/app/arena` | `/app/perspectives` | Yes |
| `/app/split` | `/app/consensus` | Yes |
| `/app/tribe` | `/app/signal` | Yes |
| `/app/reflect` | `/app/replay` | Yes |

---

## Task 7: Run SQL Migration

Run the contents of `supabase-migration.sql` in the Supabase SQL editor. This creates all tables that don't exist yet:

- `bevia_audit_log` (governance transparency)
- `bevia_user_actions` (data accumulation)
- `bevia_user_feedback` (accuracy tracking)
- `bevia_documents` (document hub + cache)
- `bevia_reports` (generated reports)
- `arena_perspectives` (perspectives history)
- `align_rewrites` (rewrite acceptance tracking)
- `align_simulations` (simulation history)
- `reflect_contacts` (behavioral profiles)
- `reflect_conversations` (conversation analyses)
- `reflect_simulations` (conversation simulations)
- `reflect_self_profile` (user self-profile)

Plus: `deduct_credits` and `refund_credits` RPC functions, auto-create credit balance on signup trigger, and performance indexes.

Tables that already exist (from initial scaffold) will be skipped by `CREATE TABLE IF NOT EXISTS`.

---

## Task 8: Footer on Every Output

Every OutputCard must include this footer below the action bar:

```
Based on observed patterns · Not a prediction · You decide
⚡ NeuroverseOS
```

Small, muted (`text-muted`), non-negotiable. This is a governance requirement.

---

## Summary

1. Update function call names in frontend (8 renames)
2. Add IntentPills component to every tool page
3. Add `intent` + `freeIntent` fields to every function call
4. Handle intent gap display in OutputCard
5. Update OutputCard for Reality/Action two-layer display
6. Update routes (6 renames + redirects)
7. Run SQL migration
8. Add governance footer to all outputs
