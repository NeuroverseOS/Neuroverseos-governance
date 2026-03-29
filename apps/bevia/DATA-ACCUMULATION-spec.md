# Bevia — Data Accumulation & Intelligence Layer

> Every action generates data. Over time, that data becomes more valuable
> than any single analysis. This spec defines what we store, how it compounds,
> and what reports it enables.

---

## Principle: Store the Verdict, Not Just the Result

Every tool currently returns a result and throws away the context. Wrong. We store:

1. **The input** — what the user gave us
2. **The governance verdict** — what our rules said about it
3. **The output** — what we gave back
4. **The user's response** — what they did with it (accepted, rejected, ignored, re-ran)
5. **The metadata** — timestamps, credit cost, which rules fired, confidence levels

The user's RESPONSE to our output is the most valuable signal. If they accept a rewrite suggestion, that tells us the rule was useful. If they reject it, maybe the rule is too strict. If they re-run with different inputs, they're exploring — we should remember what they explored.

---

## Per-Tool Data Accumulation

### Unsaid

**What we store now:**
- Original message, sender/receiver archetypes, translation output, share slug

**What we ADD:**

```sql
alter table unsaid_translations add column behavioral_signals jsonb;
alter table unsaid_translations add column user_feedback text; -- 'accurate', 'partially', 'wrong', null
alter table unsaid_translations add column shared boolean default false;
alter table unsaid_translations add column shared_at timestamptz;
```

**What this enables:**
- "Your most-used translation pair: Boomer → Gen Z (34 times)"
- "Translations you rated 'accurate': 78%. Signal: system is calibrated to you."
- "Messages with ellipsis (...) are mistranslated 40% of the time for you — your communication style may use ellipsis differently than the archetype model expects"
- "Your shared translations get 12x more views than average — your message choices resonate"

### Align

**What we store now:**
- Strategy world files, doc check verdicts, evidence

**What we ADD:**

```sql
-- Track every document check with full context
alter table align_checks add column document_text text;
alter table align_checks add column scope text; -- 'strategy', 'culture', 'both'
alter table align_checks add column rules_triggered jsonb default '[]';
alter table align_checks add column rules_aligned jsonb default '[]';
alter table align_checks add column user_action text; -- 'accepted', 'rewrote', 'ignored', 'challenged'

-- Track rewrite outcomes
create table align_rewrites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  check_id uuid references align_checks not null,
  strategy_id uuid references align_strategies not null,
  suggestions jsonb not null,
  accepted jsonb default '[]',    -- which suggestions the user accepted
  rejected jsonb default '[]',    -- which they rejected
  modified jsonb default '[]',    -- which they accepted with edits
  created_at timestamptz default now()
);

-- Track simulations (what-if, cascade, adjust-and-rerun)
create table align_simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  strategy_id uuid references align_strategies not null,
  mode text not null, -- 'what_if', 'cascade', 'adjust_rerun'
  input_text text,
  rules_adjusted jsonb default '[]', -- for adjust_rerun: which rules were changed
  result jsonb not null,
  steps integer,
  created_at timestamptz default now()
);

-- Track strategy world file evolution
create table align_strategy_versions (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid references align_strategies not null,
  user_id uuid references auth.users not null,
  version integer not null,
  world_file jsonb not null,
  change_description text, -- what changed from previous version
  source text, -- 'initial_upload', 'conflict_resolution', 're_upload', 'rule_adjustment'
  created_at timestamptz default now()
);

alter table align_rewrites enable row level security;
alter table align_simulations enable row level security;
alter table align_strategy_versions enable row level security;
create policy "Users own rewrites" on align_rewrites for all using (auth.uid() = user_id);
create policy "Users own simulations" on align_simulations for all using (auth.uid() = user_id);
create policy "Users own versions" on align_strategy_versions for all using (auth.uid() = user_id);
```

**What this enables:**

Proposal patterns:
- "47 proposals checked this quarter. 72% aligned. 19% drifted. 9% conflicted."
- "Most triggered rule: 'customer_impact_required' — 14 proposals didn't reference customer impact"
- "Engineering proposals: 89% aligned. Sales proposals: 54% aligned. Gap: sales ignores 'quality over speed'"
- "Alignment trending UP: 58% → 72% over 3 months. Your org is getting more consistent."

Rewrite patterns:
- "You accepted 82% of rewrite suggestions. Rejected suggestions cluster around rule 'sustainable_pace' — you may want to revisit this rule's strictness."
- "Rewrites that get accepted save an average of 2 revision cycles per proposal."

Simulation patterns:
- "You've tested loosening 'no_facility_closures' in sandbox 4 times. Consider updating your strategy to reflect this."
- "Most explored what-if: 'What if we hire externally?' — suggests the promote-from-within rule creates recurring tension."

Rule health:
- "Rule 'qa_signoff_required' has blocked 12 proposals but all 12 were eventually approved after QA was added. Rule is working as intended."
- "Rule 'sustainability_target' has never triggered. Either all proposals comply, or the rule is too vague to catch drift."
- "Rule 'min_3year_contracts' triggered 3 times, all 3 were overridden by executives. Rule may need adjustment."

### Reflect

**What we store now:**
- Conversations, contacts with behavioral profiles, simulations, self-profile

**What we ADD:**

```sql
-- Track which simulation approaches the user actually tried IRL
alter table reflect_simulations add column tried_irl boolean default false;
alter table reflect_simulations add column tried_at timestamptz;
alter table reflect_simulations add column irl_outcome text; -- 'worked', 'partially', 'didnt_work', null

-- Track "what works" accuracy over time
create table reflect_insight_accuracy (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  contact_id uuid references reflect_contacts not null,
  insight_text text not null,
  insight_type text not null, -- 'what_works', 'what_doesnt', 'ego_state', 'gottman'
  confirmed boolean, -- did subsequent conversations confirm this insight?
  confirmed_at timestamptz,
  created_at timestamptz default now()
);

-- Track ego state transitions across conversations
create table reflect_ego_transitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  contact_id uuid references reflect_contacts,
  conversation_id uuid references reflect_conversations not null,
  from_state text not null, -- 'parent', 'adult', 'child'
  to_state text not null,
  trigger_event text, -- what caused the shift
  timestamp_in_conversation integer, -- seconds into conversation
  created_at timestamptz default now()
);

alter table reflect_insight_accuracy enable row level security;
alter table reflect_ego_transitions enable row level security;
create policy "Users own insight accuracy" on reflect_insight_accuracy for all using (auth.uid() = user_id);
create policy "Users own ego transitions" on reflect_ego_transitions for all using (auth.uid() = user_id);
```

**What this enables:**

Relationship intelligence:
- "Trust with Alex: 50 → 74 over 12 conversations. Biggest jumps correlated with conversations where you stayed in Adult ego state throughout."
- "You've had 3 Gottman stonewalling events with Jordan in the last month. Last time this pattern continued with a contact, trust dropped to critical within 6 conversations."
- "Your 'what works with Alex' insights have been confirmed in 8 of 10 subsequent conversations. High confidence."

Self-awareness:
- "Your #1 trigger for shifting to Child ego state: when someone questions your timeline estimates. This has happened with 3 different contacts — it's YOUR pattern, not theirs."
- "You shift to Parent ego state when giving feedback to direct reports. In 4 of 6 cases, this triggered defensiveness from them. Adult-Adult framing works better — you proved this in your last conversation with Sam."
- "Ambassador alignment this month: 72%, up from 58%. Your biggest improvement: you interrupted 60% less."

Simulation accuracy:
- "You tried the simulated approach with Alex last week. The simulation predicted Alex would shift to Adult — and they did. Simulation accuracy with Alex: 78%."
- "You tried the simulated approach with Jordan. It didn't work. The system didn't have enough data (only 2 conversations). Accuracy improves with more data."

Growth tracking:
- "3-month trend: Defensiveness events down 40%. Composure under challenge up. Adult ego state usage up from 62% to 78%."
- "Your relationships are healthier than 3 months ago. Average trust across all contacts: up 12 points. Average conflict risk: down 8 points."

### Arena

**What we store now:**
- Nothing beyond the edge function response

**What we ADD:**

```sql
create table arena_perspectives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  situation text not null,
  lenses_used text[] not null,
  perspectives jsonb not null,
  user_resonated text, -- which lens ID the user found most useful (optional tap)
  user_action text, -- 'acted_on', 'saved', 'shared', 'dismissed', null
  created_at timestamptz default now()
);

alter table arena_perspectives enable row level security;
create policy "Users own perspectives" on arena_perspectives for all using (auth.uid() = user_id);
```

**What this enables:**
- "Your go-to lens: Stoic (used 23 times). Your least-used: Buddhist (2 times)."
- "When facing career decisions, you resonate with Pragmatist perspectives 80% of the time."
- "When facing relationship decisions, Therapist lens resonates most."
- "You've acted on 45% of Strategist perspectives but only 12% of Buddhist perspectives — your decision-making style favors tactical over philosophical."

### Cross-Tool Intelligence

**What we ADD:**

```sql
-- Cross-tool activity summary (materialized periodically)
create table bevia_user_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users primary key,
  total_actions integer default 0,
  tools_used text[] default '{}',
  -- Align
  align_checks_total integer default 0,
  align_avg_score numeric,
  align_most_triggered_rule text,
  align_trend text, -- 'improving', 'stable', 'declining'
  -- Reflect
  reflect_conversations_total integer default 0,
  reflect_contacts_total integer default 0,
  reflect_avg_trust numeric,
  reflect_ego_state_primary text,
  reflect_growth_areas jsonb default '[]',
  -- Unsaid
  unsaid_translations_total integer default 0,
  unsaid_accuracy_rate numeric,
  unsaid_most_used_pair text,
  -- Arena
  arena_perspectives_total integer default 0,
  arena_preferred_lens text,
  arena_action_rate numeric,
  -- Meta
  last_generated timestamptz default now(),
  report_data jsonb default '{}' -- full report payload for AI generation
);

alter table bevia_user_insights enable row level security;
create policy "Users own insights" on bevia_user_insights for all using (auth.uid() = user_id);
```

---

## The Intelligence Loop

Data doesn't just accumulate — it compounds. Each layer feeds the next:

```
Layer 1: RAW DATA (stored automatically)
  Every action, verdict, input, output, timestamp
  ↓
Layer 2: PATTERNS (computed periodically)
  Which rules fire most? Which contacts have declining trust?
  Which lens resonates? Which proposals drift?
  ↓
Layer 3: INSIGHTS (AI-generated on demand)
  "Your org drifts on customer impact. You personally drift
   on defensiveness. Both are connected — you get defensive
   when proposals you championed get flagged for missing
   customer impact."
  ↓
Layer 4: RECOMMENDATIONS (AI-generated, grounded in data)
  "Try staying in Adult ego state when your proposals get
   flagged. Your data shows this reduces defensiveness 70%
   of the time. And consider adding a customer impact section
   to your proposal template — 14 proposals missed it."
  ↓
Layer 5: FEEDBACK (user acts or doesn't)
  Did they follow the recommendation?
  Did it work?
  → feeds back into Layer 1
```

---

## Report Generation

### Monthly Report (2 credits)

Available from the dashboard. Covers all tools the user has used.

**What the AI receives for report generation:**
- Pattern data from Layer 2 (aggregated, not raw)
- Trend data (this month vs last month vs 3 months ago)
- Goal tracking (if user set any)
- Cross-tool correlations

**What the AI does NOT receive:**
- Raw conversation transcripts (privacy)
- Other users' data (isolation)
- Data from tools the user hasn't used

**Report structure:**

```
┌──────────────────────────────────────────────────┐
│ 📊 March 2026 Report                    2 cr ↗   │
├──────────────────────────────────────────────────┤
│                                                  │
│  ── Align ─────────────────────────────────────  │
│  23 proposals checked (up from 18 in Feb)        │
│  Average alignment: 74% (up from 68%)            │
│  Most triggered rule: customer_impact (8 times)  │
│  Trend: ↗ Improving                              │
│                                                  │
│  Key insight: Sales proposals are your weak      │
│  spot (54% avg alignment). Engineering is strong │
│  (89%). The gap is on "quality over speed."      │
│                                                  │
│  ── Reflect ───────────────────────────────────  │
│  8 conversations analyzed across 4 contacts      │
│  Trust trending up with Alex (+8)                │
│  Trust trending down with Jordan (-4)            │
│  Your ego state: Adult 72% of the time (up 10%) │
│                                                  │
│  Key insight: Your defensiveness dropped 40%     │
│  this month. Biggest remaining trigger: timeline │
│  challenges from senior stakeholders.            │
│                                                  │
│  ── Arena ─────────────────────────────────────  │
│  12 perspectives generated                       │
│  Preferred lens: Strategist (acted on 5 of 7)   │
│  You never use Buddhist lens — might be worth    │
│  trying for the Jordan situation.                │
│                                                  │
│  ── Cross-Tool ────────────────────────────────  │
│  Your Align data and Reflect data tell the same  │
│  story: you're strong on strategic alignment     │
│  but reactive when challenged. The proposals     │
│  you personally author score 82% aligned, but    │
│  you get defensive in Reflect conversations      │
│  when others question those same proposals.      │
│  The pattern: strong work, thin skin about it.   │
│                                                  │
│  Recommendation: Next time a proposal gets       │
│  flagged in Align, practice the Ambassador       │
│  approach from Reflect before the review meeting.│
│  Your data shows Adult ego state in those        │
│  meetings correlates with better outcomes.        │
│                                                  │
├──────────────────────────────────────────────────┤
│  📥 PDF   📤 Share   📋 Copy                    │
└──────────────────────────────────────────────────┘
```

### Quarterly Report (5 credits)

Same structure but deeper:
- 3-month trend analysis
- Rule health assessment (Align)
- Relationship trajectory (Reflect)
- Simulation accuracy scoring (Reflect)
- Goal progress tracking
- Year-over-year comparison (if available)

### On-Demand Report (2 credits)

User asks a specific question:
- "How is my relationship with Alex trending?"
- "Which of our strategy rules cause the most friction?"
- "Am I getting better at handling criticism?"

AI generates a focused report from stored data. Grounded in their actual numbers, not generic advice.

---

## Data Retention & Privacy

1. **User owns all data.** Delete button on every page. Full account wipe available.
2. **Data never crosses users.** No "people like you" features. No aggregate analysis across accounts.
3. **Raw transcripts stored encrypted.** Behavioral profiles are derived — deleting a conversation deletes the transcript but profile changes persist (they're already aggregated).
4. **Report data is ephemeral.** Generated on demand, displayed, then the report payload is stored for PDF download. Raw pattern data stays in tables.
5. **No training on user data.** We don't fine-tune models on Bevia user data. Ever. The AI gets pattern data at generation time and forgets it after.
6. **Audit trail is permanent.** The one exception to "delete everything." Governance verdicts are retained for compliance even after account deletion — but anonymized (user_id removed, action/verdict/rule_id retained for system health metrics).

---

## Implementation Priority

### Phase 1 (ship with MVP)
- Store inputs + outputs + verdicts (already happening via edge functions)
- Add `user_action` tracking (what did the user do with our output?)
- Add `user_feedback` on Unsaid (optional accuracy rating)
- Monthly report generation (2 credits)

### Phase 2 (month 2)
- Align: rewrite tracking (accepted/rejected/modified)
- Align: simulation history
- Align: strategy version tracking
- Reflect: simulation IRL tracking (did you try it? did it work?)
- Arena: perspective storage + resonance tracking

### Phase 3 (month 3)
- Cross-tool intelligence (bevia_user_insights table)
- Cross-tool reports (Align patterns + Reflect patterns connected)
- Quarterly reports
- On-demand question reports
- Reflect: ego state transition tracking
- Reflect: insight accuracy scoring

### Phase 4 (quarter 2)
- Grow feature (Align): role-based learning recommendations
- Recommendation engine: suggest next actions based on accumulated patterns
- Goal setting + tracking ("I want to improve my Ambassador alignment to 80%")
- Notification system: "Your trust with Jordan dropped 5 points after today's conversation. Review?"
