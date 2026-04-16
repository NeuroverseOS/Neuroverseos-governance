# Radiant for Auki

**Behavioral intelligence for Auki builders.**

> ExoCortex remembers what happened. Radiant understands what it means —
> relative to your culture and strategy — and tells you what to do next.

## What this is

Radiant is a governed AI layer that reads activity in your repos and tells you how it aligns with Auki's strategy, culture, and non-negotiables. It speaks in Auki's voice. It respects the invariants (cognitive liberty, decentralization, perception-first, protocol-not-product). It names what's working and what's drifting — before drift hardens.

You can use it three ways:

| Layer | What it does | What it needs |
|---|---|---|
| **CLAUDE.md** | Every Claude Code session in this repo starts with Auki's worldmodels + voice rules loaded. Passive governance, zero friction. | Nothing. Just install. |
| **`radiant think`** | Send any query through the full compiled worldmodels + builder lens → Auki-framed AI response with voice check. | `ANTHROPIC_API_KEY` |
| **`radiant emergent`** | Full behavioral dashboard on a repo. EMERGENT patterns, MEANING, MOVE, ALIGNMENT scores. | `ANTHROPIC_API_KEY` + `GITHUB_TOKEN` |

Start with CLAUDE.md. It's the 80% value, zero setup.

## Install

One command in an Auki project repo:

```bash
bash install.sh
```

Drops `CLAUDE.md` at the repo root and copies Auki's worldmodels into `./worlds/`. Any Claude Code session (CLI, desktop, VS Code, JetBrains) now reads them automatically.

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
