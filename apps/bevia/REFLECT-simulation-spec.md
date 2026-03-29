# Reflect — Simulation Sandbox + People Intelligence

> Beyond analysis. Play it out. See what works. Learn who people are.

---

## The Three Layers

```
Layer 1: ANALYSIS       — "What happened?" (already built)
Layer 2: SIMULATION     — "What if I had done this instead?" (this spec)
Layer 3: INTELLIGENCE   — "What works with this person over time?" (this spec)
```

---

## Layer 2: The Simulation Sandbox

### What it is

After analyzing a conversation, the user enters a sandbox where they can **replay the conversation with different behavioral settings.** The AI plays the other person — not generically, but based on that person's observed behavioral profile from past conversations.

### How it works

**Step 1: The user picks a fork point**
The timeline shows the conversation events. User taps any moment and says "start here."

```
Timeline:
  1. ✅ Alex proposes new deadline
  2. ⬅️ YOU GOT DEFENSIVE HERE — tap to fork
  3. Alex stonewalls
```

**Step 2: The user adjusts their approach**
Three ways to control the simulation:

**Option A: Natural language**
User types what they would say instead:
> "I hear the urgency. What if we descoped the reporting module to hit your date?"

**Option B: Behavioral sliders**
Adjust your behavioral approach for the replay:
```
Assertiveness:  ████████░░ → ██████░░░░  (dial back)
Empathy:        ████░░░░░░ → ████████░░  (dial up)
Composure:      ██████░░░░ → ████████░░  (dial up)
```
AI generates a response matching those settings.

**Option C: Archetype mode**
> "Replay this moment as The Ambassador"
> "What would The Commander do here?"

System generates a response matching that archetype's behavioral profile.

**Step 3: AI simulates the other person's reaction**

This is the key part. The AI doesn't give a generic response — it responds **as that specific person would**, based on their behavioral profile:

```
Alex's profile (built from 12 past conversations):
  - Trust: 62 (moderate — you've had some friction)
  - Composure: 78 (high — Alex stays calm under pressure)
  - Assertiveness: 85 (very high — Alex is direct and commanding)
  - Openness: 45 (low — Alex resists new framing unless it's practical)
  - Pattern: responds well to Adult-Adult framing, disengages when
    met with defensiveness, opens up when given concrete alternatives
  - Gottman history: 3 stonewalling events in last 5 conversations
  - Ego state tendency: Parent (controlling) → Adult when met with Adult
```

The AI uses this profile to simulate Alex's likely response:

```
┌──────────────────────────────────────────┐
│ 🪞 Simulation: Fork at Event #2         │
├──────────────────────────────────────────┤
│                                          │
│  You said (original):                    │
│  "The timeline was already tight,        │
│   I've been saying this for weeks"       │
│  → Defensive. Ego: Child (reactive)      │
│                                          │
│  You say instead:                        │
│  "I hear the urgency. What if we         │
│   descoped the reporting module?"        │
│  → Constructive. Ego: Adult              │
│                                          │
│  ── Alex's simulated response ────────   │
│                                          │
│  "That could work. What's the impact     │
│   on the Q3 deliverable?"               │
│  → Ego shift: Parent → Adult             │
│  → Engaged (vs. stonewalled originally)  │
│                                          │
│  ── Projected impact comparison ───────  │
│                                          │
│            Original    Simulated          │
│  Trust:    -8          +2                 │
│  Conflict: +15         -5                 │
│  Composure: -6         +3                 │
│  Outcome:  Stonewalled  Collaborating     │
│                                          │
├──────────────────────────────────────────┤
│  🔄 Try another approach                 │
│  🎭 Try as Ambassador / Commander / etc  │
│  ▶️ Continue this thread (1cr)            │
└──────────────────────────────────────────┘
```

**Step 4: Continue the thread (optional, 1 credit per exchange)**

User can keep going — respond to the simulated response, see where it leads. A full simulated conversation. Each exchange costs 1 credit because it's an AI call, but the behavioral impact projections update in real time.

```
You: "Descoping reporting saves about 3 weeks. Q3 stays on track."
Alex (simulated): "Do it. Send me the revised plan by Friday."
→ Trust: +4 | ConflictRisk: -8 | Outcome: Decision reached

TOTAL SIMULATION IMPACT vs ORIGINAL:
  Trust:        -8  →  +6   (14 point swing)
  ConflictRisk: +15 →  -13  (28 point swing)
  Relationship trajectory: eroding → strengthening
```

### Simulation controls

| Control | What it does | Example |
|---------|-------------|---------|
| **"Make me more assertive"** | Dials up assertiveness in your simulated responses | Turns "What if we tried..." into "Here's what I propose..." |
| **"Make me more empathetic"** | Dials up empathy/composure, dials down assertiveness | Turns "The data shows..." into "I understand the pressure you're under..." |
| **"Make me more direct"** | Strips hedging, increases clarity | Turns "I was kind of thinking maybe..." into "I recommend..." |
| **"Make me more strategic"** | Focuses on leverage, options, second-order effects | Turns emotional response into tactical move |
| **"What if I got angry?"** | Cranks volatility, shows what happens | Shows the damage projection — trust cratering, conflict spiking |
| **"What if I said nothing?"** | Simulates silence/stonewalling from your side | Shows how they respond to your disengagement |
| **"What would [archetype] do?"** | Full archetype-mode response | Ambassador de-escalates, Commander takes charge, Provocateur challenges |

### Why this works (not hallucination)

The simulation is grounded in **observable behavioral data:**
- The other person's profile is built from REAL conversations you've analyzed
- Their response patterns are based on actual detected behaviors, not imagined ones
- The system explicitly tells you: "Based on 12 analyzed conversations, Alex tends to..."
- Low-data warning: if you've only analyzed 1-2 conversations with someone, the simulation says "Low confidence — limited behavioral data on this person"
- The user is always told this is a PROJECTION, not a prediction

---

## Layer 3: People Intelligence

### What it is

Every conversation you analyze in Reflect builds a persistent behavioral profile of the people you interact with. Over time, the system learns what WORKS with each person and what DOESN'T.

### How profiles build

```
Conversation 1 with Alex → Basic profile: assertive, composed, direct
Conversation 2 with Alex → Pattern: disengages when met with defensiveness
Conversation 3 with Alex → Pattern: opens up when given concrete options
Conversation 5 with Alex → Insight: "Alex responds best when you lead with data, not feelings"
Conversation 8 with Alex → Pattern: trust has been climbing — your Adult-Adult approach is working
Conversation 12 with Alex → Full profile: you now have high-confidence behavioral predictions
```

### The Contact Card

Each person you've analyzed gets a persistent contact card:

```
┌──────────────────────────────────────────┐
│ 🪞 Alex Chen — Boss                      │
│    12 conversations analyzed              │
│    Last: 2 days ago                       │
├──────────────────────────────────────────┤
│                                          │
│  ── Behavioral Profile ────────────────  │
│                                          │
│  Trust:         ████████░░ 74            │
│  Composure:     ████████░░ 82            │
│  Influence:     █████████░ 88            │
│  Empathy:       █████░░░░░ 48            │
│  Volatility:    ██░░░░░░░░ 18            │
│  Assertiveness: █████████░ 91            │
│  Openness:      ████░░░░░░ 42            │
│  ConflictRisk:  ███░░░░░░░ 28            │
│                                          │
│  ── What works with Alex ──────────────  │
│                                          │
│  ✅ Lead with data and concrete options   │
│  ✅ Adult-Adult framing (not emotional)   │
│  ✅ Propose solutions, don't present      │
│     problems                             │
│  ✅ Be direct — Alex respects brevity     │
│                                          │
│  ── What doesn't work ─────────────────  │
│                                          │
│  ❌ Getting defensive (triggers           │
│     stonewalling — 3 incidents)          │
│  ❌ Hedging or softening too much         │
│     (Alex reads it as lack of confidence)|
│  ❌ Emotional appeals (low empathy score  │
│     — Alex disengages from feelings talk) │
│                                          │
│  ── Gottman Watch ─────────────────────  │
│                                          │
│  ⚠️ Stonewalling: detected 3 times        │
│     Last: 2 days ago                     │
│     Trigger: your defensiveness          │
│     Impact: trust drops ~8 points each   │
│                                          │
│  ── Relationship Trajectory ───────────  │
│                                          │
│  Trust:    ↗ trending up (was 58, now 74)│
│  Conflict: ↘ trending down (improving)   │
│  Overall:  STABLE → STRENGTHENING        │
│                                          │
│  ── Ego State Dynamics ────────────────  │
│                                          │
│  Alex defaults to: Parent (controlling)  │
│  Alex shifts to Adult when: you respond  │
│    from Adult ego state first            │
│  Alex shifts to disengaged when: you     │
│    respond from Child (reactive/defensive)|
│                                          │
│  ── Your Pattern with Alex ────────────  │
│                                          │
│  You tend to: start Adult, shift to      │
│    Child when challenged on timelines    │
│  Best conversations: when you stayed     │
│    Adult throughout                      │
│  Worst conversations: when you got       │
│    defensive early                       │
│                                          │
├──────────────────────────────────────────┤
│ 📊 Full history  🪞 Simulate  📤 Share   │
└──────────────────────────────────────────┘
```

### "What works" — How it's generated

NOT keyword matching. NOT generic advice. Built from ACTUAL behavioral data:

1. After each conversation analysis, the system records:
   - Which of YOUR behaviors correlated with POSITIVE outcomes (trust up, conflict down, engagement up)
   - Which of YOUR behaviors correlated with NEGATIVE outcomes (trust down, stonewalling, disengagement)
   - Which ego state combinations produced the best/worst results

2. After 3+ conversations, the system has enough data to generate "what works / what doesn't" insights

3. After 8+ conversations, the system has high-confidence behavioral predictions for simulation

4. These insights are **regenerated** every time a new conversation is analyzed — they evolve as the relationship evolves

### Your own profile (self-awareness)

The system also builds a profile of YOU across all your conversations:

```
┌──────────────────────────────────────────┐
│ 🪞 Your Behavioral Profile               │
│    47 conversations analyzed              │
│    across 8 contacts                      │
├──────────────────────────────────────────┤
│                                          │
│  ── Your Patterns ─────────────────────  │
│                                          │
│  Default ego state: Adult (72% of time)  │
│  Shift to Child when: challenged on      │
│    competence or timelines               │
│  Shift to Parent when: giving feedback   │
│    to direct reports                     │
│                                          │
│  ── Your Strengths ────────────────────  │
│                                          │
│  ✅ High composure in new relationships   │
│  ✅ Strong question-asking (Spy traits)   │
│  ✅ Good at de-escalation when calm       │
│                                          │
│  ── Your Growth Areas ─────────────────  │
│                                          │
│  ⚠️ Defensiveness when competence is      │
│     questioned (triggers 40% of your     │
│     negative outcomes)                   │
│  ⚠️ Tendency to over-explain (read as     │
│     insecurity by high-assertiveness     │
│     contacts)                            │
│  ⚠️ Avoid conflict with high-authority    │
│     contacts (concession rate: 78%)      │
│                                          │
│  ── Archetype Alignment ───────────────  │
│                                          │
│  Natural fit: Ambassador (68% alignment) │
│  Aspirational: Commander (42% alignment) │
│  Growth edge: Your concession rate drops │
│    Commander score. Practice holding     │
│    ground with low-stakes contacts first.│
│                                          │
├──────────────────────────────────────────┤
│ 📊 Trends  🎭 Train archetype  📤 Share │
└──────────────────────────────────────────┘
```

---

## Journal Integration

The behavioral journal (`apps/shared/journal.ts`) already tracks:
- Signal effectiveness (which insights led to action)
- Mode effectiveness (direct/translate/reflect/challenge/teach)
- Follow-through rates
- Behavioral patterns (acted/delayed/switched/dropped)

For Reflect, the journal tracks:
- **Which simulations led to behavior change** — did the user actually try the simulated approach next time?
- **Simulation accuracy** — when the user tried the simulated approach, did the outcome match the prediction?
- **Profile accuracy over time** — do the "what works" insights actually predict good outcomes?
- **Growth tracking** — are the user's patterns improving? Is defensiveness dropping? Is composure rising?

This creates a feedback loop:
```
Analyze conversation → See patterns → Simulate alternatives
→ Try new approach IRL → Analyze that conversation
→ See if it worked → Refine profile → Better simulations
```

---

## Credit Pricing

| Action | Credits | AI cost | Margin |
|--------|---------|---------|--------|
| Full conversation analysis | 3 | ~$0.02 | 87% |
| Fork-point simulation (first response) | 1 | ~$0.01 | 80% |
| Continue simulation thread (per exchange) | 1 | ~$0.01 | 80% |
| Behavioral slider replay | 1 | ~$0.01 | 80% |
| Archetype replay | 1 | ~$0.005 (deterministic + light AI) | 90% |
| View contact card | 0 | $0.00 (deterministic, cached) | free |
| View your profile | 0 | $0.00 (deterministic, cached) | free |
| Regenerate "what works" insights (after new data) | 1 | ~$0.01 | 80% |

Contact cards and your own profile are **free to view** — they're deterministic aggregations of past analyses. You already paid for the analyses. Viewing the results shouldn't cost more.

---

## Supabase Schema Additions

```sql
-- Add to reflect_contacts
alter table reflect_contacts add column conversations_analyzed integer default 0;
alter table reflect_contacts add column what_works jsonb default '[]';
alter table reflect_contacts add column what_doesnt_work jsonb default '[]';
alter table reflect_contacts add column ego_state_dynamics jsonb default '{}';
alter table reflect_contacts add column gottman_history jsonb default '[]';
alter table reflect_contacts add column trajectory jsonb default '{}';
alter table reflect_contacts add column confidence text default 'low';  -- low/medium/high

-- Simulation history
create table reflect_simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  conversation_id uuid references reflect_conversations,
  contact_id uuid references reflect_contacts,
  fork_event_index integer not null,
  approach text not null,  -- 'natural', 'slider', 'archetype'
  your_input text,
  simulated_response text,
  behavioral_comparison jsonb,  -- original vs simulated deltas
  archetype_id text,
  created_at timestamptz default now()
);

-- User self-profile (aggregate across all contacts)
create table reflect_self_profile (
  user_id uuid references auth.users primary key,
  total_conversations integer default 0,
  total_contacts integer default 0,
  default_ego_state text,
  ego_state_triggers jsonb default '{}',
  strengths jsonb default '[]',
  growth_areas jsonb default '[]',
  archetype_alignment jsonb default '{}',
  patterns jsonb default '{}',
  updated_at timestamptz default now()
);

alter table reflect_simulations enable row level security;
alter table reflect_self_profile enable row level security;
create policy "Users see own simulations" on reflect_simulations for all using (auth.uid() = user_id);
create policy "Users see own self-profile" on reflect_self_profile for all using (auth.uid() = user_id);
```

---

## Privacy Rules (Non-negotiable)

1. **Profiles are about behavior patterns, not personality judgments.** "Alex tends to disengage when met with defensiveness" NOT "Alex is emotionally unavailable."
2. **The user owns all data.** They can delete any contact profile at any time. Full wipe, no trace.
3. **No cross-user data.** If two Bevia users both know Alex, their Alex profiles are completely separate. We never merge or share.
4. **Simulation honesty.** Every simulation says "This is a projection based on limited data, not a prediction." Low-data contacts get explicit warnings.
5. **No manipulation framing.** The UI never says "how to manipulate Alex." It says "what communication approaches work best with Alex." The difference is intent — we're building understanding, not leverage.
6. **Contact data never leaves the user's account.** No analytics on who people are talking to, no aggregate "people like your boss" features.
