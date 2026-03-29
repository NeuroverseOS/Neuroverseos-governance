# NeuroverseOS — Viral AI App Brainstorm

> Status: Active brainstorm — concepts, UX flows, technical feasibility
> All apps are **web apps** (no native apps), built on the NeuroverseOS governance engine + Lenses behavioral system

---

## Shared Architecture

All apps share the same foundation:

```
┌─────────────────────────────────────────────────┐
│                   Web App (UI)                   │
│         Unsaid / Tribe / Split / Arena           │
├─────────────────────────────────────────────────┤
│              @neuroverseos/lenses                │
│    Behavioral compiler — philosophy → prompt     │
│    compileLensOverlay() → system prompt string   │
├─────────────────────────────────────────────────┤
│           @neuroverseos/governance               │
│    Permission rules, world files, audit trace    │
├─────────────────────────────────────────────────┤
│               Any LLM Provider                   │
│         Claude / GPT / Llama / etc.              │
└─────────────────────────────────────────────────┘
```

**Lenses as a dependency:** Lenses is not an app — it's a behavioral compiler. It takes a philosophy (Stoic, Gen Z, INTJ, etc.) and compiles it into structured system prompt instructions. Every app imports it. The app decides *what* to ask the AI; Lenses decides *how* the AI should think and respond. Zero runtime cost — pure string assembly. Works with any LLM.

**Shared behavioral journal** (`apps/shared/journal.ts`): All apps track user interactions using the same schema — modes (direct/translate/reflect/challenge/teach), follow-through rates, and adaptation preferences. Each app has isolated storage but shared vocabulary. Users own their behavioral data and can see/delete it.

**All API connections are read-only.** No app posts, sends messages, or modifies anything on connected platforms.

---

## App 1: Unsaid — The Communication Translator

### Concept
Paste a message. See how different personality types read it. Understand the gap between what was said, what was meant, and what you heard.

### MVP (v1) — Generational Translator
Single-screen webapp. No API connections. No accounts. Pure viral screenshot factory.

**UX Flow:**
1. Landing screen: two cards — **"Sender"** and **"You"**
2. Each card has archetype buttons:
   - **Generational:** Boomer | Gen X | Millennial | Gen Z | Gen Alpha
   - **Phase 2 additions:** MBTI types, Enneagram, Mars/Venus, Zodiac
3. Paste or type a message in the center
4. Tap **"Translate"**
5. Result shows three layers:
   - **What they said** — the literal text
   - **What they meant** — decoded through the sender's communication lens
   - **What you heard** — decoded through YOUR personality lens
   - **What to say back** — optimized for both profiles

### Lens Architecture
Each archetype is a Lens with directives:

```typescript
const GEN_Z_LENS: Lens = {
  id: 'gen_z',
  name: 'Gen Z',
  tagline: 'Reading between the lines, lowercase.',
  tone: {
    formality: 'casual',
    verbosity: 'terse',
    emotion: 'warm',
    confidence: 'balanced',
  },
  directives: [
    {
      id: 'communication_style',
      scope: 'language_style',
      instruction: 'Short, fragmented sentences. Lowercase energy. Deadpan humor as default. Memes and cultural references as emotional shorthand. "lol" is punctuation, not laughter.',
    },
    {
      id: 'value_system',
      scope: 'value_emphasis',
      instruction: 'Authenticity over polish. Boundaries are non-negotiable and openly stated. Mental health vocabulary is normal. "No" is a complete sentence. Performative professionalism is sus.',
    },
    {
      id: 'subtext_reading',
      scope: 'response_framing',
      instruction: 'Read tone aggressively. Punctuation is emotional data — a period at the end of "ok." signals displeasure. Emoji choice matters. Response time matters. What they DIDN\'T say matters more than what they did.',
    },
  ],
};

const BOOMER_LENS: Lens = {
  id: 'boomer',
  name: 'Boomer',
  tagline: 'Let me give you some context first...',
  tone: {
    formality: 'formal',
    verbosity: 'detailed',
    emotion: 'neutral',
    confidence: 'authoritative',
  },
  directives: [
    {
      id: 'communication_style',
      scope: 'language_style',
      instruction: 'Complete sentences with proper grammar. Formal greetings and sign-offs expected. Ellipsis as thinking pauses... Phone calls preferred over text. ALL CAPS is emphasis, not yelling.',
    },
    {
      id: 'value_system',
      scope: 'value_emphasis',
      instruction: 'Loyalty and follow-through are core values. Respect for hierarchy and experience. Work ethic = identity. Process matters. You earn the right to skip steps.',
    },
    {
      id: 'subtext_reading',
      scope: 'response_framing',
      instruction: 'Take words at face value. "Fine" means fine. Subtext exists but is considered passive-aggressive, not normal. Directness is respect. If someone has a problem, they should say so.',
    },
  ],
};
```

### Behavioral Framework Basis
**Honest framing:** These are cultural archetypes, not peer-reviewed science. Framed as "how different generations tend to communicate" — stylized, fun, self-aware. Like horoscopes — nobody claims it's physics, but everyone reads theirs.

Grounded in real patterns from:
- **Pew Research Center** — decades of generational survey data on values, communication preferences, media habits
- **Deborah Tannen's sociolinguistics** — gender and generational communication pattern research
- **Digital communication studies** — research on how text/emoji/punctuation carry emotional weight differently across age groups
- **Cultural observation** — how each generation actually uses Slack, email, text (observable, not claimed as universal truth)

**What we do NOT claim:** "Science says Gen Z talks like this." We DO frame it as: "Here's how a Gen Z communication lens interprets this message."

### Phase 2 — Connected Mode
- Connect Slack/email (read-only OAuth)
- Passive notifications: "You may have misread this message from Sarah. Tap to decode."
- Group mode: paste a group chat, see who's frustrated, who's checked out, who agrees but is arguing anyway

### Phase 2.5 — Mars/Venus & Personality Layers
- Men (Mars) / Women (Venus) communication lenses — based on Tannen's work
- MBTI as sender/receiver modifiers
- Stack generational + gender + personality for rich translations
- "What a Boomer INTJ man meant vs. what a Millennial ENFP woman heard"

### Viral Mechanics
- Screenshot-native: the three-layer translation card is designed to be screenshotted
- No account needed for v1 — zero friction
- Share URL with pre-filled message: `unsaid.app/t?msg=...&from=boomer&to=genz`
- Naturally triggers conversations: "I showed this to my mom and she said the Boomer translation was spot-on"

---

## App 2: Tribe Finder — 6 Degrees to Your 50

### Concept
Find the 50 people on Earth you should actually know — then show you how you're connected to them.

### How Matching Works (Technical)
1. User connects LinkedIn (read-only OAuth: `r_liteprofile` scope) — gives us job history, skills, education, industry
2. User takes a 2-minute **worldview quiz** — not personality fluff, but values:
   - How do you make decisions under pressure?
   - What would you sacrifice for mastery?
   - What's your relationship with ambiguity?
   - Are you building, rebuilding, or maintaining?
3. Quiz responses map to a **value vector** stored as a governance-compatible profile:
   ```json
   {
     "risk_tolerance": 0.8,
     "craftsman_vs_entrepreneur": 0.3,
     "structure_vs_ambiguity": 0.7,
     "intrinsic_vs_extrinsic": 0.9,
     "life_phase": "rebuilding",
     "depth_vs_breadth": 0.6
   }
   ```
4. **Matching** = cosine similarity on value vectors + career/interest overlap as a secondary signal
5. Top 50 matches ranked by combined score

### The 6 Degrees Connection Map
**What LinkedIn API actually gives us:** Shared connections (1st/2nd degree), shared companies, shared schools, shared groups. This covers 1-2 degree paths between users who both connect LinkedIn.

**What LinkedIn API does NOT give us:** Full network graph traversal. You cannot crawl "friend of friend of friend." This was killed post-Cambridge Analytica across all social platforms.

**What we build instead:**
- **Direct paths** (both users on platform): shared connections, companies, schools, communities → "You → your college roommate → their coworker → this person" (real graph)
- **Signal paths** (public data): same conferences, same podcast audiences, same GitHub repos, same online communities → "You're both connected through the indie hacker ecosystem" (inferred, not graph)
- **Zero-degree matches**: no connection found. "This is a cold match — you share a worldview with a stranger in Seoul." These are the MOST interesting and shareable ones.

### UX Flow
1. Connect + quiz (3 minutes total)
2. **The Reveal:** visual web — you in the center, 50 nodes around you, connection paths drawn between
3. Tap any person → see why you matched (values, not demographics) + connection path
4. **"Reach Out"** button → opens LinkedIn/email/Twitter with a pre-drafted intro based on WHY you matched
5. No in-app chat. The app is the matchmaker, not the messenger.

### Viral Mechanics
- "The AI says my 50th person is a ceramicist in Portugal" — inherently shareable
- Compare with friends: "We share 12 of our 50!"
- The map visualization is beautiful and screenshot-worthy
- Zero-degree cold matches are conversation starters on social media

### Learning Loop
- Track which matches lead to actual reach-outs → refine which value dimensions predict real connections
- Track which connection paths users find most interesting → weight those in future reveals

---

## App 3: Split — Friend Group Governance

### Concept
A friend-group coordination app where everyone's preferences, budgets, and styles are known — and the AI finds fair compromises using rules everyone agreed to. The Venmo of group decision-making.

### Why Not Build On Venmo?
Venmo's public API was shut down in 2016. PayPal (parent) only offers merchant transaction APIs, not peer-to-peer friend payment integration. Splitwise has a limited API but it only handles expense splitting.

**The reframe:** We don't need payment APIs. We generate Venmo/Zelle/CashApp payment request links when money is involved. The actual product is the coordination layer that none of these tools provide.

### How It Works

**Each user has a profile (their personal world file):**
```markdown
# My Rules
- budget: $50-80/dinner, $200-400/weekend trip
- dietary: vegetarian
- availability: not before 7pm weekdays, flexible weekends
- planning_style: spontaneous (don't overplan)
- social_energy: medium (need downtime between group activities)
- decision_weight: go with the flow (don't make me decide)
- transportation: no car, prefer transit/rideshare
```

**When a group forms, the governance engine does what it already does:**

1. Someone proposes: "Beach weekend in June?"
2. Engine collects everyone's rules, finds conflicts:
   - "Jake's budget caps at $200/weekend, Airbnb options start at $80/person for 6 people = $480 total — under everyone's limits"
   - "Sarah can't do Friday departure, earliest Saturday 6am"
   - "3 of 6 prefer structured itinerary, 3 prefer spontaneous — compromise: plan Saturday, free Sunday"
   - "2 vegetarians — restaurant needs veggie options"
3. Surfaces a **compromise proposal** with one-tap approve/adjust

**The Venmo-style social feed:**
- "Sarah proposed Thai. Group chose Mexican (3-1). Budget: $25/person."
- "Weekend trip locked: Santa Cruz, June 12-14, $180/person. 5/6 confirmed."
- **Contribution equity** — not money, but fairness: who's been planning everything? Who always vetoes? Who always compromises? Transparent and governed by rules everyone agreed to.

**The "Request" mechanic (like Venmo requests):**
- "Requesting: someone take the morning airport run" → AI assigns to whoever it's most fair for based on group history
- "Requesting: group decision on Jake's birthday dinner" → proposal flow starts

### Why This Spreads
Every group that uses it recruits every other group they're in. "Why aren't we using Split for the bachelor party?" Venmo's social loop but for everything except money. (Phase 2: also money via payment links.)

### Technical Foundation
The governance engine already evaluates rules and finds conflicts. World files already encode personal constraints. The guard engine already produces audit-traced decisions. This app is a **frontend for capabilities that already exist in the governance SDK**.

---

## App 4: Belief Arena — Lenses as a Daily Practice

### Concept
Your life, seen through the lens of a chosen philosophy. Connect your real context (calendar, tasks, messages) and get daily perspective through Stoic, Samurai, Coach, or any lens you choose.

### Relationship to Existing Lenses App
This IS the Lenses app, evolved. The NeuroverseOS/lenses repo already has the core engine. Belief Arena is a **webapp frontend** that:
1. Makes lens selection visual and social
2. Adds real-world context via read-only API connections
3. Makes lens perspectives shareable as cards
4. Adds multiplayer: "How would 5 philosophies handle my day?"

### UX Flow
1. Pick your philosophy (or build a custom blend — Stoicism + your therapist's approach)
2. Connect calendar, LinkedIn, Slack — **read-only only**
3. Each morning: a card showing your day through your chosen lens
   - "That meeting at 2pm? A Stoic wouldn't prepare a defense. They'd prepare to listen."
   - "That LinkedIn recruiter? A Stoic asks: is this fear of missing out or genuine alignment?"
4. Tap any item → full philosophical reasoning, grounded in your actual context
5. **Multiplayer view:** see the same day through 3-5 philosophies side by side

### Shareable Lens Cards
"My Stoic AI told me to ignore a $200K job offer. Here's why." → shareable card with:
- The situation (anonymized)
- The lens perspective
- The reasoning
- A CTA: "What would YOUR lens say? Try it."

### What Already Exists
- 9 built-in lenses with full directive sets
- `compileLensOverlay()` for system prompt generation
- `lens compare` CLI for multi-lens output
- Stackable lens architecture
- World-file lens configuration
- Behavioral journal for tracking which lenses drive follow-through

---

## App 5: Align — Leadership Strategy Alignment Engine

### Concept
Upload your corporate strategy, culture docs, values statements — the app **automatically generates a governance world file** from them (you never see the machinery). Then drag-and-drop ANY document onto it — a proposal, a hiring plan, a marketing brief, a vendor contract — and get an instant alignment verdict: does this align with your strategy, your culture, or both?

### Why This Is Different From "Ask ChatGPT to review my doc"
ChatGPT has no memory of your strategy. Every time you paste your culture doc + a proposal, you're doing manual prompt engineering and hoping the AI remembers the right parts. **Align compiles your strategy into a structured rule engine** — deterministic, auditable, consistent. The 50th document gets evaluated against the same rules as the 1st, with zero drift.

### How It Works (Technical Pipeline)

The governance engine already has every piece of this:

**Step 1: World File Generation (automated, invisible to user)**
- User uploads strategy docs (PDF, DOCX, notion export, whatever)
- `infer-world` scans the documents and extracts:
  - Core values → become guard rules
  - Strategic priorities → become state variables with health metrics
  - Cultural principles → become behavioral lenses
  - Red lines / non-negotiables → become kernel rules (hard blocks)
- `configure-world` refines via optional conversational wizard:
  - "You mentioned 'customer obsession' — does that mean you'd block a proposal that doesn't reference customer impact?"
  - "Your strategy says 'sustainable growth' — what growth rate triggers a warning?"
- Output: a compiled `world.json` + `.nv-world.md` the user never sees

**Step 2: Document Analysis (the product)**
- User drags a document onto the webapp (or pastes text, or connects Google Docs read-only)
- Guard engine evaluates the document as a `GuardEvent`:
  ```
  event: {
    action: "propose",
    content: <the document text>,
    scope: "strategy" | "culture" | "both"
  }
  ```
- Engine returns a `GuardVerdict`:
  - **ALIGN** (green) — this document is consistent with your strategy/culture
  - **DRIFT** (yellow) — partially aligned, with specific gaps identified
  - **CONFLICT** (red) — this contradicts stated values or strategic direction

**Step 3: The Evidence Report**
Not just "aligned / not aligned" — a full breakdown:
- Which strategic priorities does this support? Which does it ignore?
- Which cultural values does this reinforce? Which does it violate?
- Specific quotes from the document mapped to specific rules from the world file
- Suggested edits to bring it into alignment
- Audit trail: "This verdict was produced by rules derived from [Strategy Doc v2, uploaded March 2026]"

### UX Flow
1. **Onboarding (one-time, 5 minutes):**
   - Upload your strategy doc(s) — drag and drop
   - Upload your culture doc(s) — drag and drop
   - Optional: 2-minute wizard to refine priorities ("Which matters more: speed or quality?")
   - World file generates automatically. User sees: "Your alignment engine is ready. 14 strategic rules, 8 cultural principles detected."

2. **Daily use (seconds per document):**
   - Drag a document onto the screen (or paste URL, or connect Google Docs)
   - Choose scope: Strategy | Culture | Both
   - Instant verdict card with color-coded alignment score
   - Tap to expand: see rule-by-rule breakdown with evidence
   - "Fix it" button: AI suggests specific edits to improve alignment

3. **Team mode:**
   - Share your alignment engine with your leadership team (read-only link)
   - Anyone on the team can check documents against the shared strategy
   - Dashboard shows: how many documents checked, alignment trends over time, most common drift areas
   - "Your team's proposals drift most on 'customer impact' — 6 of 12 proposals this month didn't reference it"

### LinkedIn Integration
- **Read-only OAuth** — connect your company LinkedIn page
- Analyze job postings against culture alignment: "This job description emphasizes 'fast-paced environment' but your culture doc prioritizes 'sustainable pace' — drift detected"
- Analyze company posts against strategy: "Your last 10 LinkedIn posts focus on product features, but your strategy prioritizes thought leadership — content strategy misalignment"
- Analyze candidate profiles (when they apply/are shared): not "is this person good" but "does this person's stated experience and values align with your cultural priorities?"
- **Never posts, never messages, never modifies** — read-only analysis only

### What Already Exists in the Governance SDK
| Capability | Status | Used for |
|-----------|--------|----------|
| `infer-world` | Built | Auto-generate world file from documents |
| `configure-world` | Built | Conversational refinement of rules |
| Guard engine | Built | Evaluate events against world rules → verdict |
| Audit logger | Built | Evidence trail for every verdict |
| Impact reports | Built | Detailed breakdown of what triggered what |
| Verdict formatter | Built | Human-readable verdict output |
| Condition engine | Built | Complex rule evaluation |
| State variables | Built | Track strategic health metrics |
| Invariant checks | Built | Measure world health continuously |

**This app is a thin UI over capabilities that are already shipping in the SDK.** The engine is deterministic (no LLM needed for evaluation), produces audit traces, and handles complex rule hierarchies. The only AI needed is at the ingestion step (understanding uploaded docs) and the suggestion step (proposing edits).

### Why This Prints Money
- **Enterprise SaaS pricing** — this solves a real problem every VP/C-suite has
- **Sticky** — once your strategy is encoded, switching costs are high
- **Grows with the org** — more teams, more documents, more value
- **Compliance angle** — audit trail proves every decision was checked against stated values
- **Board-ready** — "Here's our alignment report for Q1: 87% of proposals aligned with strategy, up from 71%"

### Viral Mechanics (slower but deeper)
- Less Twitter-viral, more "every leader who sees it wants it for their team"
- The alignment score becomes a currency: "Did you run it through Align?" becomes a cultural norm
- Free tier: 1 strategy doc, 5 document checks/month — enough to hook, not enough to stay free

---

## App Priority & Build Order

| App | Scope | Time to MVP | Viral speed | Retention | Revenue | Dependencies |
|-----|-------|------------|-------------|-----------|---------|-------------|
| **Unsaid (Gen translator)** | Small | Days | Explosive | Medium | Ad/freemium | Lenses only, no APIs |
| **Belief Arena (Lenses webapp)** | Medium | 1-2 weeks | Fast | High | Subscription | Lenses + optional APIs |
| **Align (Leadership)** | Medium | 1-2 weeks | Slow (enterprise) | Very high | Enterprise SaaS | Governance engine (already built) |
| **Split** | Large | Weeks | Slow (group adoption) | Very high | Freemium | Governance engine |
| **Tribe Finder** | Large | Weeks | Medium | High | Subscription | LinkedIn OAuth + matching |

**Recommended order:**
1. **Unsaid** — smallest scope, most viral, no API complexity, proves the Lenses-as-dependency model
2. **Belief Arena** — engine already exists, just needs a web UI, validates daily-use pattern
3. **Align** — almost entirely built already in the SDK, highest revenue potential, enterprise wedge
4. **Split** — highest retention potential, needs friend groups to test
5. **Tribe Finder** — coolest concept but LinkedIn API limitations require creative workarounds

---

## Cross-App Learning

All apps feed into the shared behavioral journal:
- **Unsaid:** Which translations get screenshotted/shared? Which personality combos are most used?
- **Tribe Finder:** Which matches lead to reach-outs? Which value dimensions predict real connections?
- **Split:** Which rule conflicts recur? How do groups resolve them? Do governed groups stay together longer?
- **Belief Arena:** Which lenses get reused? Which drive follow-through on the advice?
- **Align:** Which rules trigger most? Where do orgs consistently drift? Which strategic priorities get ignored across industries?

The governance files get smarter over time. World models aren't static — they're refined by real behavioral data. Users own this data, can see it, can delete it. That's the governance-safe approach to learning.

**Governance rules for learning:**
- "You respond best to challenge mode" = allowed (about the user, from their own data)
- "This person is lying" = blocked (claims about other people)
- No silent adaptation — user sees what the system learns
- No cross-app data access — each app's journal is isolated
- User controls adaptation mode: lean (optimize), balanced, or challenge (push harder)
