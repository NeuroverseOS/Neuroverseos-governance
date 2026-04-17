# Radiant for Auki

**Radiant gives meaning to behavior — meaning relative to the behavioral models that have been declared and governed.** We can tell what behavior is because we have defined it. Without that definition, activity is just activity. With it, every commit, every PR, every decision is legible against the frame the organization chose to operate inside.

**Together, Radiant puts you in a cocoon of behavior.** Not a cage — a cocoon. Something you grow inside. Something that holds your shape while you're becoming what you said you'd become. The worldmodel defines the cocoon. Governance enforces its walls. Radiant tells you whether you're growing inside it or pushing through it. And when you push through — that's evolution, not violation. The cocoon adapts. The worldmodel updates. New shape, same principle: you declared what you'd be, the system held you to it while you became it.

---

## The three scores: how human and AI alignment is measured

Radiant measures three things every time it reads activity. These aren't abstract metrics — they're the answer to "are the humans and AIs on this team working well inside the declared behavioral model?"

### L — Human work alignment

*Is the human's behavior aligned with what the organization declared?*

Not "did they commit code" — "did their work match the stated strategy and respect the invariants?" A human committing fast is productive. A human committing fast AND staying inside the worldmodel's frame is aligned. L measures the difference.

When L drops, it means human decisions are drifting from what was declared. The sprint goal says multi-floor domains; the commits are somewhere else. The invariant says consent-first; the code skips the check.

### C — AI work alignment

*Is the AI's output aligned with the worldmodel?*

Right vocabulary? Invariants enforced? Voice honest? Or is the AI producing generic, ungoverned output that happens to compile? C measures whether the AI is operating inside the same behavioral frame as the humans.

When C drops, it means the AI is producing work that doesn't reflect the organization's model. Wrong vocabulary ("device" instead of "participant"). Missed invariants. Generic voice. Technically correct but behaviorally unaligned.

### N — Human–AI collaboration quality

*When human and AI work together, is shared meaning preserved?*

This is the score nobody else measures. Humans work in their native mode — cognition, creativity, judgment. AI works in its native mode — reasoning, pattern recognition, spatial intelligence. They're two different intelligences. N measures whether the handoffs between them produce shared meaning — or whether they're just working past each other.

When N drops, it means human and AI are both individually productive but the collaboration is hollow. AI-authored code gets rubber-stamped instead of genuinely reviewed. Human decisions don't reference the AI's analysis. The two gyroscopes are spinning but the universe between them — the worldmodel — isn't creating shared ground.

**N only exists because the worldmodel exists.** Without a shared behavioral frame, there's nothing to measure translation quality against. Two intelligences working in a void can't have "collaboration quality" — just coincidental output. N is the mechanical proof that the worldmodel is doing its job as the universe both intelligences operate inside.

### R — Composite alignment

The average across whichever of L, C, and N have enough signal. All-human team: R = L. All-AI pipeline: R = C. Hybrid team with worldmodel loaded: R = average of all three. If any score has insufficient evidence, it's excluded — not zeroed.

### What the scores look like in output

```
ALIGNMENT

  Human work:                72 · STABLE
  AI work:                   68 · STABLE
  Human–AI collaboration:    41 · needs attention
  Composite:                 60 · WATCHING
```

Human-readable. No jargon. "Needs attention" means the score is in a range where something is drifting. "STABLE" means the frame is holding. "Not enough signal to call yet" means Radiant doesn't have enough evidence — and it says so honestly rather than guessing.

---

## Why this exists

AI is writing more of our code every day. Soon it will write most of it. That's not a fear — it's a fact Auki has built its entire thesis around.

But here's the problem nobody is solving: **as AI writes more code, who governs how it thinks while writing it?** An AI that knows your codebase is useful. An AI that knows your codebase AND your mission AND your non-negotiables AND pushes back when you're about to violate one — that's governance.

ExoCortex already gives every Auki engineer's AI persistent memory — who they are, what they're working on, what the organization cares about. That's the identity layer. It solves "you are strangers every time."

**Radiant adds the layer ExoCortex doesn't carry: governance and measurement.**

- **Governance** — invariants that Claude enforces, not just values it knows about. When an engineer proposes centralizing spatial data, Claude doesn't just proceed — it blocks the action, cites `sovereignty_over_convenience` and `decentralization_before_aggregation`, and proposes a decentralized alternative. That's enforcement, not information.

- **Measurement** — how humans and AI are actually behaving inside the system, measured against what the organization said it would do. Not "what code was committed" — "is the work aligned with the stated strategy, and is it drifting?" ExoCortex can't answer that. Radiant can.

- **Human–AI collaboration quality** — the metric nobody else measures. Humans work in their native mode (cognition, creativity, judgment). AI works in its native mode (reasoning, pattern recognition, spatial intelligence). Are they actually collaborating? Are handoffs between human and AI work producing shared meaning — or are they just working past each other? Radiant scores this specifically, and it's the signal that matters most as AI writes more of the code.

**ExoCortex makes Claude know you. Radiant makes Claude hold you accountable.**

Together: an AI that knows who you are, what you're building, what's non-negotiable — and that measures whether the actual work matches the stated mission. Memory plus conscientiousness. That's what Auki's own ExoCortex README calls *"conscientiousness augmentation"* — and Radiant is the mechanism for it.

Without Radiant, you have a well-informed AI that might still build something that violates the mission. With Radiant, you have an AI that's governed by the behavioral frame the organization declared, and that reports honestly on how humans and AI are operating inside that frame.

As AI writes more code, this matters more — not less.

---

## Why the worldmodel is the thing that matters

Any tool can count commits. Any tool can measure velocity. Any tool can build a GitHub dashboard. None of that tells you what the behavior **means**.

Meaning requires a frame. The worldmodel is the frame.

When Radiant sees someone centralizing spatial data, that's a problem — not because centralization is universally bad, but because **Auki said it's bad for Auki.** A different organization with a different worldmodel might celebrate centralization as efficiency.

When Radiant flags a missing consent check, that's an invariant violation — not because every app needs consent flows, but because **Auki declared sovereignty over convenience as non-negotiable.** Another organization might not have that rule at all.

When Radiant surfaces low cross-module coordination, that's concerning — not because silos are always wrong, but because **Auki's leadership model says collaboration and shared prosperity are core to how the team leads.** An organization that values deep specialization might call silos a feature.

The same commits, the same PRs, the same activity — completely different meaning depending on whose worldmodel is loaded. That's the point. Radiant doesn't impose a universal definition of "good." It reads behavior through the definition the organization itself declared.

Without the worldmodel, Radiant is a GitHub analytics tool. With the worldmodel, it's a meaning-maker. The technology is composable npm commands. The meaning comes from the behavioral model.

---

## How the analysis actually works

Radiant runs on your machine. No hosted service. No data leaves except one API call to Claude for the interpretation step.

**Step 1 — Read what happened.** Radiant calls the GitHub API and gets commits, PRs, reviews, and comments from the last 14 days. Raw data: who did what, when, with what message.

**Step 2 — Tag every event.** Each event gets classified: did a human do this, did an AI do this, or did they do it together? Pure code, runs locally, instant.

**Step 3 — Extract signals.** Five behavioral measurements across three domains (human work, AI work, joint work) = 15 numbers. How clear is the work? Who owns it? Is it being followed up? Is it coordinated? Is there momentum? Pure code, runs locally, instant.

**Step 4 — Ask Claude to interpret.** This is where the worldmodel enters. Radiant sends Claude the signal numbers + a sample of real events + the worldmodel (invariants, decision priorities, mission) + the lens (vocabulary, voice rules). Claude reads the activity **through the worldmodel's frame** and responds: here are the patterns I see, here's what they mean, here's what to do.

**Step 5 — Check Claude's work.** Did Claude leak jargon? Did it cite evidence that actually exists? Did it violate the voice rules? Governance on the AI's own output.

**Step 6 — Print the result.** EMERGENT / MEANING / MOVE / ALIGNMENT / DEPTH.

Four of six steps are pure code on your machine. One is an API call to Claude with your worldmodel as context. The worldmodel is what turns "here's what happened" into "here's what it means for you specifically."

Anyone who runs `radiant emergent` against a public repo sees the full read — every contributor's activity, classified and interpreted through the worldmodel. That's not a vulnerability; it's a proof of alignment. Not "trust us, we're decentralized." Instead: "run it yourself, point it at our repo, see whether our work matches our mission."

---

## The handshake: ExoCortex + Radiant

Without the ExoCortex, Radiant knows one thing: **what happened** (GitHub activity — commits, PRs, reviews).

With the ExoCortex, Radiant knows two things: **what happened** AND **what was supposed to happen** (attention.md, goals.md, sprint.md — the stated intent).

The gap between those two is the most valuable signal in the system.

Without the ExoCortex:

> *"High velocity architecture delivery. Six patterns observed across 70 events."*

Radiant sees activity but has no idea if it matches what the team said they'd do.

With the ExoCortex:

> *"attention.md says this sprint is multi-floor domain handoff. 78% of commits match. But 22% went to an unrelated module with no sprint mention. Either the sprint shifted and nobody updated attention.md, or work is leaking outside the declared focus."*

Same GitHub data. But now Radiant has something to compare it against. The gap between "what I said I'd do" and "what I actually did" is drift — and naming it early, before it hardens, is the whole point.

**No other tool measures this.** GitHub alone doesn't know what you said you'd do. The ExoCortex alone doesn't know what you actually did. Radiant reads both and tells you where they match and where they don't.

To use it, add `--exocortex` pointing at your exocortex directory:

```bash
neuroverse radiant emergent aukiverse/posemesh \
  --lens auki-builder \
  --worlds ./worlds/ \
  --exocortex ~/exocortex/
```

Radiant reads attention.md, goals.md, sprint.md, identity.md, and the org context (if symlinked). All files are optional — partial context is better than no context. The AI interpretation compares stated intent against observed behavior and names every gap directly.

---

## Real output — what a behavioral read looks like

This is an actual Radiant read on `aukilabs/exocortex` with the Auki builder lens and the team's exocortex loaded:

```
Scope:  aukilabs/exocortex
Window: last 14 days · 52 events
Lens:   auki-builder

EMERGENT

  template_system_emergence
    The exocortex template is becoming infrastructure that others use
    to bootstrap their own thinking systems. Multiple people are
    onboarding through the same structural pattern, suggesting this
    could scale beyond the core team.

  execution_ahead_of_strategy
    High shipping velocity on infrastructure and templates, but strategic
    direction setting lags behind. You're building the means without
    declaring the ends clearly.

  cross_module_coordination_gap
    Work happening across life, cyber, and joint domains but no clear
    owner coordinating how they integrate. Each module ships independently.

MEANING

  The team is shipping infrastructure at high velocity — templates,
  onboarding systems, project structure — but the strategic story
  connecting these pieces hasn't crystallized yet. The exocortex pattern
  is becoming something others can adopt, which suggests real utility,
  but execution is running ahead of declared intent. Cross-module work
  is happening without clear ownership of how cyber, joint, and life
  domains compose into the larger architecture.

MOVE

  Declare what the integrated system is for before building more pieces.
  Force someone to own cross-module coordination. The infrastructure is
  working — now connect it to a strategic thesis people can act on.

ALIGNMENT

  Human work:                36 · concerning
  AI work:                   not enough signal to call yet
  Human–AI collaboration:    39 · concerning
  Composite:                 37 · concerning

DEPTH

  This is your first read. Radiant sees 14 days of activity
  but has no prior baseline to compare against.

  Run again next week. The read gets sharper every time.
```

Every pattern is grounded in real events from the repo. The MEANING section weaves them into one strategic thesis. The MOVE section is direct and actionable — or honestly says "nothing to act on" when the read is healthy. The DEPTH section tells you what Radiant can and can't see at this stage.

---

## What Radiant does (three layers)

Radiant is a governed AI layer that reads activity in your repos and tells you how it aligns with Auki's strategy, culture, and non-negotiables. It speaks in Auki's voice. It respects the invariants. It names what's working and what's drifting — before drift hardens.

You can use it three ways:

| Layer | What it does | What it needs |
|---|---|---|
| **CLAUDE.md** | Every Claude Code session in this repo starts with Auki's worldmodels + voice rules loaded. Passive governance, zero friction. | Nothing. Just install. |
| **`radiant think`** | Send any query through the full compiled worldmodels + builder lens → Auki-framed AI response with voice check. | `ANTHROPIC_API_KEY` |
| **`radiant emergent`** | Full behavioral dashboard on a repo. EMERGENT patterns, MEANING, MOVE, ALIGNMENT scores. | `ANTHROPIC_API_KEY` + `GITHUB_TOKEN` |

Start with CLAUDE.md. It's the 80% value, zero setup.

## Quick start — test it right now

This section gets you from zero to a working test in under 5 minutes.

### Prerequisites

- Git + Node.js 20+ installed
- A GitHub account
- An Anthropic API key (from [console.anthropic.com](https://console.anthropic.com)) — needed for `radiant think` and `radiant emergent`
- A GitHub personal access token (from [github.com/settings/tokens](https://github.com/settings/tokens)) — needed for `radiant emergent` only. Classic token with `public_repo` scope is enough.

### Step 1: Clone and build

```bash
git clone https://github.com/NeuroverseOS/Neuroverseos-governance.git
cd Neuroverseos-governance
npm install
```

This also builds automatically via the `prepare` script.

### Step 2: Set your API keys (one time)

Add these to your shell profile so you don't have to set them every session:

```bash
echo 'export ANTHROPIC_API_KEY=your-anthropic-key' >> ~/.zshrc
echo 'export GITHUB_TOKEN=your-github-token' >> ~/.zshrc
source ~/.zshrc
```

### Step 3: Test the voice layer (CLAUDE.md)

Copy the Auki CLAUDE.md to the root of any Auki project repo:

```bash
cp src/radiant/examples/auki/CLAUDE.md ~/path/to/your-auki-repo/CLAUDE.md
```

Open that repo in Claude Code (desktop app, VS Code, or JetBrains). Claude reads CLAUDE.md at session start. Ask it anything — it should respond in Auki's voice with the vocabulary, invariants, and builder framing active. No API key needed for this test.

Try:
- *"What should Auki prioritize right now?"*
- *"I'm thinking about centralizing the geo data for easier queries."*
- *"Help me think through the consent flow for the FairPrice deployment."*

### Step 4: Test `radiant think`

From the Neuroverseos-governance directory:

```bash
node dist/cli/neuroverse.js radiant think \
  --lens auki-builder \
  --worlds ./src/worlds/ \
  --query "What is Auki's biggest strategic risk right now?"
```

### Step 5: Test `radiant emergent` (behavioral dashboard)

Point it at any public GitHub repo you want to analyze:

```bash
node dist/cli/neuroverse.js radiant emergent \
  aukiverse/posemesh \
  --lens auki-builder \
  --worlds ./src/worlds/
```

Replace `aukiverse/posemesh` with any `owner/repo` you have read access to. It fetches 14 days of activity, classifies events, identifies patterns, and produces the EMERGENT / MEANING / MOVE / ALIGNMENT / DEPTH output.

### Step 6: Inspect the lens

No API keys needed:

```bash
node dist/cli/neuroverse.js radiant lenses list
node dist/cli/neuroverse.js radiant lenses describe auki-builder
```

---

## How Auki integrates this with ExoCortex (production path)

Testing and production are two different paths:

**Testing (what you just did):** Clone the governance repo, build it, copy CLAUDE.md into an Auki project, run CLI commands. Works for any individual testing Radiant.

**Production (after testing validates):** A PR to `aukilabs/org` adds `governance/CLAUDE.md` + worldmodels to the shared org repo. Once merged, every Auki employee's exocortex picks it up automatically on their next `git pull` — because the org repo is already symlinked into every personal exocortex. No one installs anything. The governance frame just shows up.

The Radiant CLI (`radiant think`, `radiant emergent`) can be added to the team's tooling independently — either by publishing `@neuroverseos/governance` to npm or by having each developer clone and build locally.

---

## Voice layer — test it

After installing, open Claude Code in the repo. Ask anything:

> *"What should Auki prioritize right now?"*
>
> *"Review this PR through our strategic lens."*
>
> *"Help me think through the consent flow for the FairPrice deployment."*

Claude responds using Auki vocabulary (participant, domain, portal, posemesh, spatial orchestration), respecting the invariants, and in builder voice — direct, compressed, no hedging.

This is Claude Code with Auki's frame pre-loaded. No commands to remember.

## Active voice — `radiant think`

When you want a deeper system-prompt-composed response with the full compiled worldmodels:

```bash
export ANTHROPIC_API_KEY=your-anthropic-key

npx @neuroverseos/governance radiant think \
  --lens auki-builder \
  --worlds ./worlds/ \
  --query "What's our biggest strategic risk right now?"
```

The system prompt includes Auki's vanguard model, strategy, the builder lens (vocabulary, voice directives, forbidden phrasings, strategic decision patterns). Voice violations surface as warnings on stderr.

## Behavioral dashboard — `radiant emergent`

When you want a read on what's actually happening in a repo:

```bash
export ANTHROPIC_API_KEY=your-anthropic-key
export GITHUB_TOKEN=your-github-token

npx @neuroverseos/governance radiant emergent \
  aukiverse/posemesh \
  --lens auki-builder \
  --worlds ./worlds/
```

Fetches 14 days of activity, classifies every event as life / cyber / joint, extracts signals across the 5×3 matrix, asks Claude to identify patterns (canonical + candidates), computes L/C/N/R alignment scores, and produces:

```
Scope:  aukiverse/posemesh
Window: last 14 days · 127 events
Lens:   auki-builder

EMERGENT
  [observed patterns with specific evidence — PRs, commits, modules]

MEANING
  [what the patterns mean, in Auki voice]

MOVE
  [concrete actions — "force cross-module ownership" not "consider optimizing"]

ALIGNMENT
  Human work:                72 · STABLE
  AI work:                   68 · STABLE
  Human–AI collaboration:    41 · needs attention
  Composite:                 60 · WATCHING

DEPTH
  [what Radiant can see now vs what comes with more runs]
```

The DEPTH section tells you exactly what's available on the first run (signals, patterns, alignment) and what unlocks with accumulated reads (drift detection, baselines, evolution proposals). Honest about what the system knows.

## What makes it Auki-native

This is not a template. It's built for Auki specifically.

**Worldmodels loaded:** Auki Vanguard (leadership model: Future Foresight, Narrative Dynamics, Shared Prosperity) + Auki Strategy (Posemesh, Sixth Protocol, cognitive liberty, DePIN, Intercognitive coalition). Written by Kirsten Bischoff, compiled through the NeuroverseOS worldmodel pipeline.

**Invariants enforced:** cognitive_liberty_preserved, decentralization_before_aggregation, perception_before_locomotion, protocol_not_product, sovereignty_over_convenience. If a response would violate an invariant, the system states the conflict and proposes an alternative.

**Vocabulary native to Auki:** 18 proper nouns (Posemesh, Intercognitive Foundation, Sixth Protocol, peaq, Mawari, GEODNET, etc.), 15 generic-to-Auki substitutions (device → participant, coordinate system → domain, QR code → portal, work request → task), full architecture and economic term lists drawn from the official glossary.

**Voice enforced at build time:** 36 forbidden phrases (including "It may be beneficial to...", "stakeholders", "going forward", "unparalleled", and the bucket names that shouldn't leak to output). The renderer fails output that contains them.

**Strategic decision patterns:** skip-the-bottleneck, coalition-before-standard, foundations-before-execution, hybrid-over-pure, decentralized-over-proprietary. Drawn from Auki's own moves (hybrid robotics, Intercognitive formation, the 2-minute deployment demo).

## The pattern this comes from

For years Kirsten Bischoff built behavioral models for leaders. Given an organization's purpose, culture, and strategy, she would author the behavioral lens leaders had to operate inside to execute that strategy — not a rulebook, but a frame of seeing and deciding that, once internalized, made the strategy live in practice.

Radiant runs on that pattern.

A **worldmodel** is a behavioral model captured in executable form. It names the mission. It declares the domains of work. It encodes the invariants that cannot be violated. It lists the signals that indicate alignment or drift. It defines the viability gates that separate thriving from collapse. That is the same structure she always authored for clients — only written in a format a compiler can read.

The novelty is not the model. The novelty is that an **AI can now operate inside the same model** as the humans it works with.

A leader reading `auki-strategy.worldmodel.md` is reading what they would hold as a behavioral frame. An AI reading the same file through Radiant is measuring its own output against that same frame. Neither translates for the other. Both operate inside a shared universe of meaning.

This is not "AI governance." It is **behavioral modeling, now legible to AI as well as people.**

## Build your own model

This bundle carries Auki's worldmodels. But the process for building them is open and available to any organization.

The craft is: take the skills needed to execute a strategy, and integrate them with the culture, purpose, and values of the organization. That integration — skills woven with values inside each domain of work — is what makes the model behavioral, not just structural.

The NeuroverseOS CLI has the full pipeline built in:

```bash
# Scaffold a new worldmodel with guided inline instructions
neuroverse worldmodel init --name "Your Organization"

# The scaffold walks you through:
#   - Mission (what the system is trying to achieve)
#   - Domains (2-4 major areas of work, each carrying:
#       Skills — the capabilities needed to execute
#       Values — the culture/purpose that governs those capabilities)
#   - Overlap Effects (what emerges when domains work together)
#   - Center Identity (what the organization becomes when aligned)
#   - Aligned + Drift Behaviors (what good and bad look like in action)
#   - Signals (what can be observed)
#   - Decision Priorities (what wins when tradeoffs appear)
#   - Evolution Conditions (when to adapt the model)

# Validate the structure
neuroverse worldmodel validate ./your-org.worldmodel.md

# Compile to governance artifacts (invariants, rules, gates, lenses, signals)
neuroverse worldmodel build ./your-org.worldmodel.md --output ./worlds/

# See a human-readable summary
neuroverse worldmodel explain ./your-org.worldmodel.md
```

The scaffold carries the instructions inside it — every section has comments explaining what to write and what distinctions matter. The template IS the tutorial. You fill it in, validate, build, and Radiant can run against any repo using your organization's frame.

What goes in as a markdown file authored by a human comes out as compiled governance artifacts an AI can operate inside. That's the bridge between behavioral modeling as a craft and behavioral governance as a runtime capability.

For organizations that want craft-grade models rather than DIY from the template, worldmodel authoring is available as a consulting engagement.

## What's in this bundle

```
auki/
├── README.md              (you are here)
├── install.sh             one-command installer
├── CLAUDE.md              Claude Code governance frame (installed at repo root)
├── worlds/                Auki-specific worldmodels
│   ├── auki-vanguard.worldmodel.md      (culture / leadership)
│   └── auki-strategy.worldmodel.md      (strategy / goals + required behaviors)
└── exemplars/             Worked examples of the vanguard model in action
    ├── vanguard-diagram.md              the scaffold itself
    ├── intercognitive-foundation.md     all three domains integrated
    ├── hybrid-robotics-essay.md         future-foresight dominant + shared-prosperity
    ├── glossary.md                      vocabulary reference
    └── year-recap-2025.md               narrative + shared-prosperity (Trust emergent)
```

## Full roadmap

See [`radiant/PROJECT-PLAN.md`](../../../radiant/PROJECT-PLAN.md) at the repo root for the complete build plan, architecture, and next phases.

## MCP server — Radiant inside Claude Code conversations

Instead of running CLI commands in the terminal, you can configure Claude Code to call Radiant as tools in normal conversation. Ask Claude *"what's emerging in aukiverse/posemesh?"* and it calls `radiant_emergent` behind the scenes.

The MCP server runs on your machine as a subprocess. Nothing hosted. Nothing to maintain. Claude Code starts it when you open a session, stops it when you close.

### Setup (one-time)

Add to `.claude/settings.json` in any Auki project, or to your global Claude Code settings:

```json
{
  "mcpServers": {
    "radiant": {
      "command": "npx",
      "args": [
        "@neuroverseos/governance", "radiant", "mcp",
        "--worlds", "./worlds/",
        "--lens", "auki-builder"
      ],
      "env": {
        "ANTHROPIC_API_KEY": "your-anthropic-key",
        "GITHUB_TOKEN": "your-github-token"
      }
    }
  }
}
```

### Tools exposed

| Tool | What it does | Example question |
|---|---|---|
| `radiant_think` | Query through the worldmodel + lens → governed response | *"Should we prioritize multi-floor domains or the retail dashboard?"* |
| `radiant_emergent` | Full behavioral read on a GitHub repo | *"What's emerging in aukilabs/exocortex this week?"* |

### How it works

1. You open Claude Code in an Auki project
2. Claude Code starts the Radiant MCP server in the background (the `npx` command)
3. You ask a question in natural conversation
4. Claude decides whether to call `radiant_think` or `radiant_emergent` based on your question
5. The tool runs (fetches GitHub data, loads worldmodels, calls the AI, checks voice)
6. Claude receives the result and responds conversationally with it
7. You never see a terminal command

### With ExoCortex

Add `--exocortex` to compare stated intent against observed behavior:

```json
{
  "mcpServers": {
    "radiant": {
      "command": "npx",
      "args": [
        "@neuroverseos/governance", "radiant", "mcp",
        "--worlds", "./worlds/",
        "--lens", "auki-builder"
      ],
      "env": {
        "ANTHROPIC_API_KEY": "your-anthropic-key",
        "GITHUB_TOKEN": "your-github-token",
        "RADIANT_EXOCORTEX": "~/exocortex/"
      }
    }
  }
}
```

Now when Claude calls `radiant_emergent`, it reads your exocortex (attention, goals, sprint) alongside GitHub activity. The gap between what you said you'd do and what you actually did is the signal.

### Costs

The MCP server runs locally. You pay for:
- Your Anthropic API usage (~$0.05 per `radiant_emergent` call, ~$0.02 per `radiant_think` call)
- Your GitHub API usage (free tier is plenty — 5000 requests/hour)
- Nothing to us. Nothing hosted.

---

## What's next

Phase 1 (this bundle): voice layer + behavioral dashboard + MCP server.

Phase 2: ExoCortex memory write-back. Radiant writes Memory Palace reads into the exocortex as dated markdown files. Next session's AI reads last run's read automatically. Pattern persistence detection, baselines, and worldmodel evolution proposals all work through the file substrate — no separate database.

The handshake after that: Radiant for participants on the real world web. Robots with their own exocortex + their own worldmodel + Radiant monitoring their behavioral alignment with the deployment. Same architecture, new participant type.
