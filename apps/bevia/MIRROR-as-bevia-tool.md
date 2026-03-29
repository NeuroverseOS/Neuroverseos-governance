# Mirror → Bevia Tool: "Reflect"

> Mirror's engines repackaged as a web tool. Paste a conversation, get behavioral analysis.
> Not real-time (that's the glasses version). Post-hoc analysis — deeper, richer, more useful.

---

## What it becomes

**Name:** Reflect (or keep "Mirror" — both work)
**Accent color:** Slate blue `#6482AD`
**Icon:** Two-way mirror / reflection symbol
**Tagline:** "See what actually happened in that conversation."

**The pitch:** You just had a difficult conversation — with your boss, your partner, a client. You know something went sideways but you're not sure what. Paste the transcript (or describe what happened). Reflect shows you:

1. **What happened** — Event timeline with classified moments (escalation, concession, defensiveness, etc.)
2. **The patterns** — Ego state dynamics (who was in Parent mode? Who was reacting as Child?), Gottman horseman detection
3. **The trajectory** — Where was this heading? Conflict rising or falling? Trust building or eroding?
4. **The profile** — Behavioral dimensions of both people (trust, composure, influence, empathy, volatility)
5. **The replay** — "What if you had said this instead?" — simulated alternative with projected impact
6. **The archetype** — Pick who you WANT to be (Ambassador, Commander, etc.) — how well did you play it?

---

## What already exists (from Mirror engines)

| Engine | Status | Reuse plan |
|--------|--------|------------|
| Event Detector | Built — deterministic pattern matching | Use as Pass 1. Add AI Pass 2 for behavioral nuance (hybrid rule) |
| Shadow Engine | Built — trajectory projection | Use directly. Pure math, works on any event set |
| Reputation Engine | Built — 8-dimension profiles with decay | Use directly. Per-contact tracking maps to Supabase |
| Archetype Engine | Built — 6 archetypes with scoring | Use directly. Gamification layer |
| Whisper Engine | Built — delivery control logic | Adapt for web: instead of real-time whispers, surface as "key moments" cards |
| Debrief Engine | Built — correction + simulation | Use directly. This IS the main UX for the web version |

**90% of this tool is already built.** The engines are pure functions. We just need:
1. A Bevia edge function wrapper
2. Hybrid AI pass for the event detector (same pattern as Unsaid/Align)
3. Supabase tables for contacts and conversation history

---

## How it works in Bevia

### Input modes (what the user gives us)

**Mode 1: Paste transcript** (most common)
- Paste a text conversation (iMessage, Slack, email thread, WhatsApp export)
- Auto-detect speakers, label as "you" and "them"
- Run full analysis pipeline

**Mode 2: Describe what happened** (no transcript available)
- User describes the conversation in natural language
- "My boss pulled me aside and said my project is behind schedule. I got defensive and said the timeline was unrealistic. He got quiet and just said 'figure it out.'"
- AI reconstructs event timeline from description, runs analysis

**Mode 3: Upload voice memo / meeting recording** (Phase 2)
- Transcribe via Whisper API → feed to pipeline
- Higher cost (transcription + analysis)

### Output: The Reflect Report

```
┌──────────────────────────────────────────┐
│ 🪞 Reflect                       3 cr ↗  │
├──────────────────────────────────────────┤
│                                          │
│  Conversation with: Alex (boss)          │
│  Duration: ~8 minutes                    │
│  Energy: draining ↓                      │
│                                          │
│  ── Timeline ──────────────────────────  │
│                                          │
│  1. 🟢 Alex: decision_proposal           │
│     "Your project timeline needs to      │
│      move up by two weeks"               │
│     Ego state: Parent (controlling)      │
│                                          │
│  2. 🔴 You: defensiveness                │
│     "The timeline was already tight,     │
│      I've been saying this for weeks"    │
│     ⚠️ Gottman: Defensiveness detected    │
│     Ego state: Child (reactive)          │
│                                          │
│  3. 🟡 Alex: stonewalling               │
│     "Just figure it out."               │
│     ⚠️ Gottman: Stonewalling detected     │
│     Ego state: Parent → disengaged       │
│                                          │
│  ── Behavioral Impact ────────────────   │
│                                          │
│  Trust:       ████████░░ → ██████░░░░    │
│  Composure:   ██████░░░░ → ████░░░░░░   │
│  ConflictRisk: ██░░░░░░░░ → ██████░░░░  │
│                                          │
│  ── Shadow Prediction ─────────────────  │
│  "If this pattern continues, trust       │
│   erodes within 2-3 more conversations.  │
│   Alex is disengaging — stonewalling     │
│   predicts emotional withdrawal."        │
│                                          │
│  ── What If? ──────────────────────────  │
│  Instead of defending the timeline,      │
│  what if you had said:                   │
│  "I hear you. What if we scope down      │
│   feature X to hit the new date?"        │
│                                          │
│  Projected impact:                       │
│  Trust: stable | Composure: +5           │
│  ConflictRisk: -10                       │
│  Ego state shift: Child → Adult          │
│                                          │
├──────────────────────────────────────────┤
│ 📋 Copy  📤 Share  📥 PDF  🔄 Try again │
│ 🎭 Try as Ambassador (1cr)              │
└──────────────────────────────────────────┘
```

### Archetype mode (optional add-on, +1 credit)

After seeing the analysis, user can ask: "How would I have played this as The Ambassador?" or "Score my Commander performance."

Returns archetype alignment score + specific moments where they nailed it or broke character.

---

## Credit pricing

| Action | Credits | AI cost | Our cost | Margin |
|--------|---------|---------|----------|--------|
| Paste transcript analysis (full report) | 3 | ~$0.02 (Gemini Flash for hybrid event detection + shadow insight) | $0.02 | 87% |
| Describe conversation analysis | 3 | ~$0.03 (AI reconstructs events + analysis) | $0.03 | 80% |
| "What if?" simulation | 1 | ~$0.01 | $0.01 | 80% |
| Archetype scoring | 1 | $0.00 (deterministic) | $0.00 | 100% |
| Voice memo transcription + analysis | 5 | ~$0.05 (Whisper + Gemini) | $0.05 | 80% |

All above 40% margin. The archetype scoring is pure math — zero AI cost.

---

## Supabase tables needed

```sql
-- Contacts (per user)
create table reflect_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  relationship text,
  profile jsonb not null default '{}',  -- BehavioralProfile (8 dimensions)
  last_interaction timestamptz,
  archetype text,
  notes text,
  created_at timestamptz default now()
);

-- Conversation analyses (history)
create table reflect_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  contact_id uuid references reflect_contacts,
  input_type text not null,  -- 'transcript', 'description', 'audio'
  events jsonb not null default '[]',
  shadow_result jsonb,
  behavioral_deltas jsonb,
  archetype_score jsonb,
  energy numeric,
  duration_estimate integer,
  created_at timestamptz default now()
);

alter table reflect_contacts enable row level security;
alter table reflect_conversations enable row level security;
create policy "Users see own contacts" on reflect_contacts for all using (auth.uid() = user_id);
create policy "Users see own conversations" on reflect_conversations for all using (auth.uid() = user_id);
```

---

## Why this is the 6th tool, not a replacement

Reflect is NOT Unsaid. Different use case:

| | Unsaid | Reflect |
|--|--------|---------|
| Input | Single message | Full conversation |
| Output | Translation card (4 layers) | Behavioral analysis report |
| Use case | "What did they mean by this text?" | "What actually happened in that meeting?" |
| Depth | Surface (fun, viral, screenshot) | Deep (personal growth, relationship tracking) |
| Retention | Low (use occasionally) | High (track contacts over time) |
| Price | 1 credit | 3 credits |

They complement each other. Unsaid is the gateway drug. Reflect is the depth product.

---

## What needs to be built

1. **Edge function wrapper** — `reflect-analyze/index.ts` — takes transcript or description, runs pipeline
2. **Hybrid event detector** — Current detector is regex-based (deterministic). Add Gemini pass for behavioral nuance (same hybrid pattern as Align/Unsaid)
3. **Contact management API** — CRUD for contacts + profile decay on access
4. **Frontend page** — `/app/reflect` — input area + report card output
5. **Lovable handoff addition** — Add Reflect to the tool grid, slate blue accent, mirror icon

Engines to copy from Mirror → Bevia (pure functions, no modification needed):
- `shadow-engine.ts` → `apps/bevia/engines/shadow.ts`
- `reputation-engine.ts` → `apps/bevia/engines/reputation.ts`
- `archetype-engine.ts` → `apps/bevia/engines/archetype.ts`
- `debrief-engine.ts` → `apps/bevia/engines/debrief.ts`
- `whisper-engine.ts` → adapt delivery logic for web cards
- `event-detector.ts` → enhance with AI hybrid pass
- `types.ts` → `apps/bevia/engines/behavioral-types.ts`
