# Radiant for Auki

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

See [`radiant/PROJECT-PLAN.md`](../../../radiant/PROJECT-PLAN.md) at the repo root for the complete build plan, architecture, and next phases (MCP server, ExoCortex memory integration, the handshake for robotic participants on the real world web).

## Honest about what's coming next

Phase 1 (this bundle): voice layer + behavioral dashboard, CLI-only.

Phase 2: MCP server so Claude Code (and Codex, Cursor, other MCP clients) can call `radiant_think` and `radiant_emergent` as tools directly, without the terminal.

Phase 3: ExoCortex integration. Radiant writes Memory Palace reads into the exocortex as dated markdown files. Next session's AI reads last run's read automatically. Drift detection, baselines, and worldmodel evolution proposals all work through the file substrate — no separate database.

The handshake after that: Radiant for participants on the real world web. Robots with their own exocortex + their own worldmodel + Radiant monitoring their behavioral alignment with the deployment. Same architecture, new participant type.
