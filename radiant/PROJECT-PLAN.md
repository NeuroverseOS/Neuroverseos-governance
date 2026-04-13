# Radiant — Behavioral Intelligence for Collaboration Systems

## Context

Auki (led by Nils) is about to open-source ExoCortex — a shared memory/coordination system for teams, shipped as an **MCP** so it plugs into Claude Code and other AI harnesses. They need tools that plug into it. We're building one: **Radiant**.

Kirsten has a long career building behavioral models for leaders — given an org's purpose, culture, and strategy, she'd build the behavioral lens that leaders had to operate inside to implement that strategy. That practice now becomes the generic worldmodel pattern for Radiant.

**Every org that uses Radiant provides two worldmodels on top of the built-in NeuroVerse base:**
1. **Culture & Values model** — who you are, how you behave (Auki's = Vanguard: Future Foresight, Narrative Dynamics, Shared Prosperity)
2. **Strategy model** — what goals you're pursuing + what skills/behaviors are required to reach them (Auki's = founding strategy document: Posemesh, sixth protocol, DePIN, cognitive liberty)

The strategy model is not just goals — it's **goals plus required behaviors/skills**. This is critical for agents: they need to know not just *what* to achieve but *how* to behave to achieve it. The worldmodel's invariants, rules, and guards express exactly these required behaviors.

Nobody in the coordination/memory space is doing **behavioral governance** — interpreting how a team actually behaves, comparing it to their stated constitution, surfacing emergence, and recommending action. This is the gap Radiant fills.

**Radiant's one-line thesis:**
> ExoCortex remembers what happened. Radiant understands what it means — relative to your culture and strategy — and tells you what to do next.

---

## Build Principle: Everything as npm Commands

**Every primitive ships as a composable npm package.** No private code for things that could be reusable tools.

- The governance engine → npm (already: `@neuroverseos/governance`)
- The `neuroverse worldmodel` pipeline → npm (already: in `NeuroverseOS/Neuroverseos-governance`)
- Radiant core → npm (`@neuroverseos/radiant`)
- Radiant MCP server → npm (`@neuroverseos/radiant-mcp`)
- Memory Palace reference implementation → npm (`@neuroverseos/memory-palace` or as part of radiant)
- Signal schema + extraction → npm (part of governance primitives)
- Pattern composition → npm (part of governance primitives)

**Reference repo:** [`NeuroverseOS/Neuroverseos-governance`](https://github.com/NeuroverseOS/Neuroverseos-governance)

**Why this principle:**
- Every piece can be independently installed, composed, and versioned
- A developer can use the worldmodel compiler without all of Radiant
- A developer can use Radiant without all of Bevia
- ExoCortex can consume only what it needs
- Publishing one package doesn't require publishing the whole stack
- The architecture stays modular instead of becoming one monolithic product

**In practice:** every new capability starts as a function in its own package with its own publish step. The CLI and MCP entry points are thin wrappers that compose the npm primitives.

---

## The Three-Layer Architecture

```
NeuroverseOS (shared library, open source)
    ↑                      ↑
    │                      │
  Bevia                Radiant
 (closed SaaS)       (open source)
 individual          team/org
 behavioral          coordination
 analysis            analysis
```

**They are siblings, not parent/child.** Both consume NeuroverseOS primitives. Neither consumes the other.

| Layer | Form | Open/Closed | Users | Purpose |
|-------|------|-------------|-------|---------|
| **NeuroverseOS** | CLI + npm package | Open | Developers building governed AI apps | World model engine, guards, lens system, signal schema |
| **Radiant** | CLI + npm + MCP | Open | Teams/orgs (starting with Auki/ExoCortex) | Team coordination analysis, emergent patterns, lens-based interpretation |
| **Bevia** | SaaS product | Closed | Individuals (executives, negotiators) | Personal behavioral analysis of conversations, contacts, relationships |

**Bevia already imports from NeuroverseOS** via `supabase/functions/deno.json` — that's the intended design. The current `shared/engine.ts` inline version is documented as a temporary fallback until Deno resolves `npm:` specifiers reliably.

---

## The Universal Math (NeuroVerse Base)

### Conceptual framing: two gyroscopes and a gimbal

Life and Cyber are two different intelligences with two different native capability spaces. They can precess independently — a human can be deep in cognition while their AI counterpart is in AR; both are fully engaged. They're not mirror images. What lets them integrate isn't that they happen to be in the same mode — it's that they share a common semantic frame. **NeuroverseOS is that frame.** The worldmodel is the gimbal that holds both gyroscopes in proper relation, not a third gyroscope.

Three things stay fixed across every deployment:
- **Three entities:** Life (human), Cyber (AI/robot), Joint (merge).
- **The `actor_domain` classifier** that tags every event as life | cyber | joint.
- **Scores normalize 0–100** across every level.

What flexes per worldmodel:
- The **sub-dimensions** within Life and within Cyber. A worldmodel can declare two Life dimensions or seven; same for Cyber. They don't have to match each other.

### LifeOS score L (presence-based)

L averages over whichever life-native dimensions are **present** in the observation window. No weights.

- **Default life-native dimensions** (declared in the NeuroVerse base worldmodel; overridable per org): Cognition, Creativity, Sensory.
- **Pure cognition team:** `L = COG` (full 0–100 range; not capped).
- **All three active:** `L = avg(COG, CRE, SEN)`.
- **No dimension present:** `L = INSUFFICIENT_EVIDENCE` (never silently 0).

The math adapts to focus. A research team doing pure cognition is not penalized for having zero creativity-signals — those dimensions simply aren't part of their score right now.

### CyberOS score C (presence-based, asymmetric to L)

C averages over whichever cyber-native dimensions are present. Same shape as L, but **the dimensions are not the same set**.

- **Default cyber-native dimensions** (declared in the NeuroVerse base worldmodel; overridable per org): AI-reasoning, AR/adaptivity, Spatial.
- Same presence rule, same `INSUFFICIENT_EVIDENCE` fallback.
- **Explicit:** Cyber-native dimensions are distinct from Life-native dimensions. The type system reflects this — `LifeCapability` and `CyberCapability` are separate types, not parameterizations of one type.

### NeuroVerse Coherence N (translation metric, not synchronization)

N is what nobody else measures, and its definition is the whole point. N measures whether life-side and cyber-side activity can **merge into shared meaning via the common worldmodel** — it is a translation metric, not a "are they doing the same thing?" metric.

- **Components:** ALIGN, HANDOFF, CO_DECISION, CO_EXECUTION.
- Each component scores when life-side and cyber-side activity reference the **same worldmodel element** — same invariant, same signal, same lens, same overlap effect.
- **Presence-averaged** across whichever of the four components have evidence.
- **High L + high C can still produce low N.** Two excellent intelligences working past each other score a low N. That's the correct behavior.
- **Kernel-dependency rule (explicit):** N is *unavailable* when no worldmodel is loaded. The output surfaces the reason — `"N unavailable: no worldmodel loaded"`. This is the mechanical definition of NeuroverseOS as "meaning-maker kernel": without the shared semantic layer, there is nothing for either gyroscope to reference to bridge across modes, so coherence is undefined, not zero.

Stateless Radiant (no memory provider) can still compute L and C from native signals. N activates only when a worldmodel is in the loop.

### Composite alignment R (presence-based over entities)

R averages over whichever entities have scores. No weights, no λ-coefficients.

- **All-human deployment:** `R = A_L`.
- **All-AI pipeline:** `R = A_C`.
- **Hybrid with worldmodel loaded:** `R = avg(A_L, A_C, A_N)`.
- **Any entity in `INSUFFICIENT_EVIDENCE` is excluded** from the average — not counted as zero.

Where `A_L`, `A_C`, `A_N` are lens-evaluated alignment scores per entity (0–100), not raw L/C/N.

### Two status vocabularies — kept separate

Radiant surfaces two orthogonal status reads side-by-side. They describe different layers and are never collapsed.

| Status | Lives in | Measures | Values |
|---|---|---|---|
| `ViabilityStatus` | `src/types.ts` (engine-level, structural) | Whether the worldmodel itself still holds together as a coherent system | `THRIVING · STABLE · COMPRESSED · CRITICAL · MODEL_COLLAPSES` |
| `AlignmentStatus` | `src/radiant/types.ts` (Radiant, behavioral) | Whether observed team behavior aligns with the stated worldmodel | `STRONG · STABLE · WATCHING · FRAGILE · MISALIGNED · INSUFFICIENT_EVIDENCE` |

A team can legitimately be `STABLE` viability + `WATCHING` alignment — *the model holds, but behavior is drifting toward its edges*. That's a real, useful state, and collapsing the vocabularies would erase it.

### Evidence gate — `INSUFFICIENT_EVIDENCE` is first-class

Silence is never scored as neutral. A dimension, entity, or composite that lacks sufficient observation returns `INSUFFICIENT_EVIDENCE` with a reason, not a number.

**Deterministic "present" rule:** a dimension is **present** when
- `event_count >= k` in the measurement window, AND
- signal extraction `confidence >= c`.

**Defaults:** `k = 3`, `c = 0.5`. Tunable per worldmodel via frontmatter (`evidence_gate: { k: N, c: 0.N }`), **not** per-call. Tuning belongs to the constitution, not to the invocation.

This keeps Radiant honest about what it does and doesn't know. "Looks fine" and "I don't have enough to read" are different answers, and both are better than a number that implies confidence that isn't there.

---

## The Pipeline (stateless-by-default, stateful via memory provider)

```
Activity source (GitHub, ExoCortex, chat, tasks)
      ↓
Event classification (actor_domain: life | cyber | joint)
      ↓
Signal extraction (5 signals × 3 domains = 15 values)
      ↓
Pattern composition (named patterns from signal combinations)
      ↓
Lens evaluation (signals + patterns vs. active worldmodels)
      ↓
Three alignment scores + composite R
      ↓
Memory provider?
   NO  → stateless output
   YES → + drift detection, baselines, reinforcement log, evolution proposals
      ↓
Renderer (structured output → text / JSON / MCP response)
```

> The signal and pattern counts below are **illustrative defaults** declared by the NeuroVerse base worldmodel, not universal constants. A worldmodel can declare more or fewer signals and patterns; the presence-based math absorbs whatever is declared.

### 5 Signals (per domain, default)
clarity, ownership, follow_through, alignment, decision_momentum

### 5 Patterns (signal compositions, default)
coordination_drift, execution_resilience, decision_avoidance, ownership_diffusion, hidden_stabilizer

### actor_domain Classification
- `life` — human actions (commits authored by people, PR reviews, decisions)
- `cyber` — AI actions (AI-generated code, automated comments, bot commits)
- `joint` — human accepting/rejecting AI output, iterative co-edit, escalation loops

---

## World Files (the behavioral constitution)

Worldmodels are built using the existing `neuroverse worldmodel` pipeline in the `neuroverse-governance` repo. That pipeline is already shipped and provides:

- `neuroverse worldmodel init | validate | build | explain`
- Emitters: `emit-signals`, `emit-lenses`, `emit-contexts`, `emit-overlaps`, `emit-world`
- Parser for overlap equations: `DomainA + DomainB = Effect`
- Compiler that generates `alignment_score` + per-signal state variables + executable rule math (`*=`, `+=`, `-=`, `=`)
- Gate thresholds: STRONG / STABLE / WATCHING / FRAGILE / MISALIGNED
- 3-layer contract: **core geometry + contextual modifiers + evolution layer** (signals/drift/priorities/evolution conditions)

So Radiant doesn't invent a worldmodel format — it consumes compiled worldmodels from this existing pipeline.

### Built-in (ships with Radiant)
**NeuroVerse base** — universal L/C/N math, domain definitions, shared invariants. Automatic, non-optional. Compiled once and embedded.

### Per-org (pluggable, user provides)
**Culture & Values world** — who we are, how we behave. Auki's = Vanguard.
**Strategy world** — goals + required behaviors/skills. Auki's = founding strategy document. Agents need both the destination (goals) and the required behaviors (skills/invariants) to interpret action correctly.

### Three ways to load per-org worlds
1. **File paths** — `{ worlds: ['./culture.world.md', './strategy.world.md'] }`
2. **Env var / config** — `RADIANT_WORLDS_DIR=./my-worlds` auto-loads everything in folder
3. **Raw text** — pass content as strings (useful for agents loading dynamically)

### The three-world stack for Auki
1. **NeuroVerse base** (built-in, universal — L/C/N math)
2. **`auki-vanguard.world.md`** (culture & values — Future Foresight, Narrative Dynamics, Shared Prosperity; to be finalized via `neuroverse worldmodel` command)
3. **`auki-strategy.world.md`** (strategy — goals + required behaviors; draft already written at `radiant/src/worlds/auki-strategy.worldmodel.md` in Bevia repo, to be ported to NeuroverseOS and re-compiled via `neuroverse worldmodel build`)

Any other org: NeuroVerse base (built-in) + their-culture + their-strategy = same three-world stack. The pattern is universal.

---

## Interfaces (Radiant ships three entry points)

### 1. CLI (`npx radiant ...`)
For humans at the terminal. Commands: `emergent`, `decision`, `drift`, `evolve`. Takes scope + worldmodel paths + GitHub token.

### 2. npm package (`import { radiantEmergent } from 'radiant'`)
For developers building their own apps (including ExoCortex itself). Expose core functions.

### 3. MCP server (`npx @radiant/mcp` or equivalent)
For AI agents (Claude Code, ExoCortex, Cursor). Tools exposed:
- `radiant_emergent(scope, events, worlds?, memory?)`
- `radiant_decision(scope, events, worlds?, memory?)`
- `radiant_drift(scope, memory)` — requires memory
- `radiant_evolve(scope, memory)` — requires memory

All three entry points share one core library. Zero extra cost per entry point.

---

## Why MCP (and why not for everything)

**MCP fits when:** the tool provides context or insight to an AI you don't control. ExoCortex (memory), Radiant (interpretation), file system MCPs, GitHub MCPs — all fit.

**MCP does NOT fit when:** the tool needs to enforce behavior on an AI you don't control. You can expose `evaluate_guard` as a tool, but the calling AI can ignore BLOCK verdicts. Governance-as-enforcement needs API-level integration where the developer owns the loop.

**Conclusion:**
- NeuroverseOS stays CLI + npm (governance needs API integration, not MCP)
- Radiant gets all three (it's insight, not enforcement)
- ExoCortex is MCP (it's memory/context, not enforcement)

**Concrete user flow enabled:**
Developer adds both MCPs to Claude Code config → Claude now has team memory (ExoCortex) + behavioral interpretation (Radiant) + worldmodel constitution (culture/strategy files). Claude becomes behaviorally aware of the org's mission without anyone having to build/control the AI.

---

## Memory & Learning (the closed-loop model)

### Two kinds of learning
1. **Per-deployment** — Radiant getting smarter about ONE org's team inside their closed loop
2. **Cross-deployment** — Radiant-the-project getting smarter for everyone

### Per-deployment (works automatically for Auki via ExoCortex)
ExoCortex IS the memory provider. Every Radiant call can:
- Read historical events from ExoCortex
- Write outputs back to ExoCortex as first-class records
- Track outcomes (did the recommendation prove right?)
- Accumulate pattern confidence, lens fitness, worldmodel drift
- Propose worldmodel evolution when behavior consistently diverges from stated model

**All inside Auki's system. No data leaves. You never see it.** This aligns with Auki's cognitive-liberty thesis — it's a feature, not a bug.

### Cross-deployment (standard OSS model)
- Community contributions to signals, patterns, worldmodel templates
- Your consulting work informs better defaults
- Reference implementations get published (Auki = first)
- Optional anonymized pattern telemetry (opt-in, most won't)

No centralized surveillance of user behavior. This matches Auki's mission.

### Memory provider — full reference implementation ships with Radiant
Radiant ships with a **working default memory provider** (SQLite-backed). It implements the **Memory Palace 4-layer coding standard** (compression / baselines / knowledge / synthesis), which is the canonical way behavioral context is structured across the NeuroverseOS ecosystem.

**Memory Palace is the standard. Not optional.** Anyone implementing a custom memory provider must implement the same 4-layer pattern:
- **Layer 1: Compression** — raw activity compressed into behavioral shorthand
- **Layer 2: Baselines** — rolling averages per scope (person/project/repo/system)
- **Layer 3: Knowledge** — accumulated behavioral facts with confidence
- **Layer 4: Synthesis** — current narrative summary per scope

Options for consumers:
- Use Radiant's reference implementation as-is (SQLite, local)
- Implement the `MemoryProvider` interface against their own storage (ExoCortex, Postgres, etc.) — but must follow Memory Palace coding
- Run stateless (no memory at all)

**This does not cannibalize Bevia.** Bevia's moat is:
- Individual behavioral analysis as a product (different use case entirely)
- Implementation quality of Memory Palace (the learned weights, drift tuning, archetypes, DualLensCard UX)
- Proprietary opted-in data tuning defaults
- The polished product executives pay for

The Memory Palace **pattern** being open in Radiant strengthens your position, not weakens it.

---

## Cost Model

**Your costs:** labor to build + maintain. That's it.
**Hosting:** none. Users run Radiant on their own machines.
**Data:** none stored. Radiant never touches user databases.
**Compute:** zero. Users pay their own API quotas / CPU.

**Revenue sources:**
- Bevia (paid SaaS, individual behavioral analysis)
- Consulting (worldmodel authoring from org docs — your old craft)
- Enterprise hosted Bevia (memory-layer-as-a-service for orgs that want it)
- LQ token compensation from Auki if they merge the contribution

Radiant itself is the hook: free, open, viral. Proves the framework. Pulls people toward NeuroverseOS + Bevia.

---

## Where Radiant Lives

**Primary home:** inside the NeuroverseOS repo at `src/radiant/`, re-exported
via the `./radiant` subpath of `@neuroverseos/governance`.
- Shares tooling (world compiler, lens system, signal primitives)
- One install experience for NeuroverseOS + Radiant
- Fast iteration with the engine
- Consumable as a composable npm primitive: `import { ... } from '@neuroverseos/governance/radiant'`

**Extractable.** Clean module boundary. Its own README, CLI entry, MCP entry. If it outgrows the parent package, it lifts out to `@neuroverseos/radiant` cleanly.

**Design artifacts in this repo.** `radiant/PROJECT-PLAN.md` (this file) and `radiant/src/worlds/auki-strategy.worldmodel.md` live at the repo root as the durable roadmap + draft worldmodel. The culture/values counterpart, `auki-vanguard.worldmodel.md`, already ships at `src/worlds/auki-vanguard.worldmodel.md`.

---

## Package Structure (inside NeuroverseOS)

Radiant is a module of `@neuroverseos/governance`, not a separate workspace
package. It shares the parent's `package.json`, `tsconfig.json`, and vitest
config. Radiant's tests live under the top-level `test/` directory alongside
the existing test suites.

```
src/radiant/
├── README.md
├── index.ts                 # module entry, re-exported as ./radiant
├── types.ts
├── core/
│   ├── signals.ts           # 5 signals × 3 domains
│   ├── patterns.ts          # 5 pattern compositions
│   ├── math.ts              # L/C/N formulas, A_L/A_C/A_N, composite R
│   ├── domain.ts            # actor_domain classification (life/cyber/joint)
│   ├── scopes.ts
│   └── renderer.ts
├── adapters/
│   └── github.ts            # thin wrap of src/adapters/github.ts
├── worlds/
│   └── neuroverse-base.world.md   # built-in universal base
├── commands/
│   ├── emergent.ts
│   ├── decision.ts
│   ├── drift.ts
│   └── evolve.ts
├── memory/
│   ├── provider.ts          # MemoryProvider interface
│   └── sqlite.ts            # reference implementation
└── mcp/
    └── server.ts            # MCP tool definitions + handlers

bin/
├── radiant.ts               # CLI entry (added to package.json bin)
└── radiant-mcp.ts           # MCP server entry (added to package.json bin)

test/
├── radiant-signals.test.ts
├── radiant-patterns.test.ts
├── radiant-math.test.ts
├── radiant-domain.test.ts
└── radiant-integration.test.ts
```

---

## Build Order (for when NeuroverseOS work resumes)

1. **Package scaffolding** under `src/radiant/` (module of `@neuroverseos/governance`, re-exported as `./radiant`)
2. **Core types + L/C/N math** — asymmetric Life/Cyber capability spaces (two distinct native dimension sets, not mirrored), presence-based averaging (no weights), N as cross-mode translation metric (requires loaded worldmodel; unavailable otherwise), `AlignmentStatus` with `INSUFFICIENT_EVIDENCE` as first-class state, deterministic presence rule (defaults `k=3`, `c=0.5`; tunable per worldmodel)
3. **`actor_domain` classification** — life/cyber/joint tagging
4. **Signal extraction** — 5 signals × 3 domains = 15 values (uses existing signal schema from `neuroverse worldmodel`)
5. **Pattern composition** — 5 patterns from signal combinations (uses existing composition primitives)
6. **GitHub adapter** — first activity source
7. **NeuroVerse base worldmodel** — authored via `neuroverse worldmodel init/build`, compiled, embedded as default
8. **Renderer** — text + JSON + MCP response formats
9. **Scope resolution** — string → typed scope
10. **Memory provider interface** — spec the contract, implement Memory Palace coding standard
11. **SQLite reference memory provider** — 4-layer Memory Palace implementation
12. **Commands** — emergent, decision, drift, evolve
13. **CLI entry** (`bin/radiant.ts`)
14. **MCP server entry** (`bin/radiant-mcp.ts`)
15. **Tests** (signals, patterns, math, domain, memory, integration) + **README**
16. **Port `auki-strategy`** — `auki-vanguard.worldmodel.md` already lives at `src/worlds/auki-vanguard.worldmodel.md`. Move `radiant/src/worlds/auki-strategy.worldmodel.md` alongside it at `src/worlds/auki-strategy.worldmodel.md`. Run each through `neuroverse worldmodel validate` and `neuroverse worldmodel build` to compile. Ship compiled artifacts as reference examples in `src/radiant/examples/auki/`.

---

## The PR to Auki (when ExoCortex opens)

### What it contains
A pointer: "Radiant is published at [npm/github]. Add these lines to your `mcp.config.json` or `mcpServers` config to plug it into ExoCortex or any Claude Code session."

That's it. Zero code changes in their repo. Maximum merge-ability.

### What they see when they plug it in
1. `radiant_emergent` and `radiant_decision` tools appear in any AI agent using ExoCortex
2. Auki's own strategy + vanguard documents ship as example worldmodels inside Radiant (with their permission)
3. Claude Code + ExoCortex + Radiant = the "Jarvis" they want: memory + behavioral interpretation against stated mission

### What they can do later
- Deep integration: ExoCortex natively invokes Radiant on PR events, issue updates, contributor questions
- ExoCortex becomes Radiant's memory provider (already has all the data)
- Runtime governance shapes how ExoCortex responds to contributors

---

## How Nils & Auki Test Radiant Within ExoCortex

Four phases, each progressively deeper. Pass/fail at each phase determines whether to continue.

### Phase 1 — CLI smoke test (zero integration, ~5 minutes)

```bash
npm install -g @neuroverseos/radiant
# Drop auki-vanguard.world.md and auki-strategy.world.md in ./worlds/
GITHUB_TOKEN=xxx npx radiant emergent aukiverse/posemesh --worlds ./worlds/
```

They read the output against their own knowledge: *"Does this match what I actually see in this team this week?"*

The fastest credibility test. No code changes. Just: does the insight ring true?

### Phase 2 — MCP in Claude Code (one config edit, ~10 minutes)

Add Radiant to their Claude Code `mcpServers`:
```json
{
  "mcpServers": {
    "radiant": {
      "command": "npx",
      "args": ["@neuroverseos/radiant-mcp"],
      "env": {
        "GITHUB_TOKEN": "xxx",
        "RADIANT_WORLDS_DIR": "./auki-worlds"
      }
    }
  }
}
```

Ask Claude Code in natural conversation: *"What's emerging in aukiverse/posemesh this week? Should we ship PR #247?"*

Claude Code calls `radiant_emergent` and `radiant_decision`, returns interpretation against Vanguard + Strategy worldmodels. They validate: does the answer match Nils's own read?

### Phase 3 — ExoCortex as memory provider (stateful, 1–2 days integration)

ExoCortex implements Radiant's `MemoryProvider` interface (following Memory Palace coding standard). Now:
- Radiant reads historical events from ExoCortex
- Radiant writes outputs back to ExoCortex as first-class records
- Drift detection activates (alignment_score falls as clarity drops in real data)
- Reinforcement: recommendations get tracked against outcomes
- Worldmodel evolution proposals emerge after enough data

Validate: does the stateful intelligence actually learn? Does it propose sensible evolution to the Vanguard or Strategy worldmodels?

### Phase 4 — Production run (one team, 2 weeks)

Pick one Auki team. Run Radiant daily. Nils reviews outputs:
- Week 1: Were "what needs work" items actually what needed work?
- Week 2: Did the "system insight" resonate? Were suggested actions useful?

Decision:
- **If yes** → expand to other teams, consider deep ExoCortex integration
- **If partially** → tune the Vanguard/Strategy worldmodels, rerun
- **If no** → signals/patterns need revision

### The validation that actually matters

Run Radiant on a team situation Nils already knows well. Three outcomes:

1. **Output tells him something he already knew, articulated clearly** → Good. Useful as external articulation.
2. **Output surfaces something he didn't notice but recognizes as true** → GREAT. The proof of concept.
3. **Output is generic or wrong** → They know where to tune (usually the strategy worldmodel needs sharpening, or signal thresholds).

---

## Verification (end-to-end test)

Once built:
1. `npx radiant emergent regardskiki2/bevia-your-ai-co-pilot` — produces meaningful output from real GitHub data
2. `npx radiant decision regardskiki2/bevia-your-ai-co-pilot#<pr>` — produces ship/delay/escalate + reasoning
3. Add Radiant to Claude Code's `mcpServers` config — tools discoverable, work in chat
4. Load `auki-vanguard` + `auki-strategy` worldmodels — output references lens + invariants
5. Simulate stateful mode: feed same events repeatedly, drift detection activates, reinforcement log populates
6. Run against a repo where you know the coordination state — output feels true

---

## What to NOT Build (yet)

- NeuroverseOS as MCP (deferred — governance needs API, not MCP)
- Real-time webhook integration (batch analysis only for v1)
- UI/dashboard (structured output is enough)
- Federated cross-deployment learning (opt-in telemetry only, if at all)
- Deep ExoCortex integration (shipping as standalone MCP first; deep integration is a later conversation with Auki)

---

## The Sentence

**NeuroverseOS defines behavioral constitutions. Radiant applies them to real collaboration data and reveals emergence, drift, and decision readiness — so any AI harness (Claude Code, ExoCortex) can understand what a team is actually doing, relative to what they said they'd do.**

---

## Acceptance Summary

When this plan is executed, the following will be true:

1. A self-contained `packages/radiant/` exists inside NeuroverseOS, published as npm
2. Radiant runs three ways: CLI, npm import, MCP server — all from one package
3. NeuroVerse base worldmodel ships built-in; Auki Vanguard + Strategy ship as example worldmodels
4. Worldmodels are compiled via existing `neuroverse worldmodel build` pipeline
5. Memory provider interface defined; SQLite reference implementation follows Memory Palace 4-layer coding
6. Stateless mode works (no memory required for emergent + decision); stateful mode activates drift + evolve when memory provider is wired up
7. Auki can test in four phases: CLI → Claude Code MCP → ExoCortex memory provider → production run
8. Bevia remains a separate closed product (individual behavioral analysis); does not consume Radiant
9. When ExoCortex opens, the PR to them is a config-only addition (add Radiant to mcpServers), zero code changes in their repo
10. Cognitive liberty is preserved — nothing leaves the user's system unless they opt in
