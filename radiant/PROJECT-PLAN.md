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

- ExoCortex can consume only what it needs
- Publishing one package doesn't require publishing the whole stack
- The architecture stays modular instead of becoming one monolithic product

**In practice:** every new capability starts as a function in its own package with its own publish step. The CLI and MCP entry points are thin wrappers that compose the npm primitives.

---

## The Architecture

```
NeuroverseOS (shared library, open source)
    ↑
    │
  Radiant
 (open source)
 team/org behavioral
 intelligence
```

NeuroverseOS is the governance engine. Radiant is the behavioral intelligence layer built on top of it.

| Layer | Form | Users | Purpose |
|-------|------|-------|---------|
| **NeuroverseOS** | CLI + npm package | Developers building governed AI apps | World model engine, guards, lens system, signal schema |
| **Radiant** | CLI + npm + MCP | Teams/orgs (starting with Auki/ExoCortex) | Team coordination analysis, emergent patterns, lens-based interpretation, governance audit |

---

## Two Shipping Identities

Radiant ships twice from the same engine. Same code in `src/radiant/`, different surfaces around it.

**Radiant for Auki** (the first deployment, this branch's deliverable)
- Bundled with Auki's compiled worldmodels at `src/radiant/examples/auki/` (vanguard + strategy)
- Preconfigured CLI examples targeting `aukiverse/posemesh` and sibling repos
- Default rendering lens: `aukiBuilderLens`
- README and hand-off message written in Auki's strategic vocabulary (Posemesh, DePIN, cognitive liberty, territory capture)
- First public reference implementation. The PR to Nils is one config-snippet paste.

**Radiant for anyone** (the generic OSS surface, same engine)
- Users bring their own culture + strategy worldmodels
- Authoring entry point is **the existing NeuroverseOS CLI**, not new Radiant tooling:
  ```
  neuroverse worldmodel init --name "Our Culture"  --output ./culture.worldmodel.md
  neuroverse worldmodel init --name "Our Strategy" --output ./strategy.worldmodel.md
  # edit both, following the inline guidance in the scaffold
  neuroverse worldmodel build ./culture.worldmodel.md  --output ./worlds/
  neuroverse worldmodel build ./strategy.worldmodel.md --output ./worlds/
  npx radiant emergent your-org/your-repo --worlds ./worlds/
  ```
- The `init` scaffold carries the authoring guide inline — every section has comments explaining what to write and what distinctions matter. The template *is* the tutorial.
- Any org can DIY with the CLI.

The engine does not know the difference. The bundle, the docs, and the default lens are what make the deployment specific.

---

## The Universal Math (NeuroVerse Base)

### Conceptual framing: two intelligences, one universe

Human intelligence and artificial intelligence are two different kinds of intelligence working together. Each has its own native capabilities. Each operates in its own way. Neither is a lesser version of the other — they are genuinely different systems that produce different kinds of work.

**NeuroverseOS is the universe where these two intelligences meet to work together.** That universe is defined by the behaviors the organization has agreed upon — its vision, its strategy, its culture, its non-negotiables.

All organizations, all systems, gather people around declared shared intent. NeuroverseOS tools help define those intentions into behaviors — and those behaviors become a constitution carried out at runtime.

The worldmodel — expressed as a `.worldmodel.md` file compiled through the NeuroverseOS pipeline — encodes that constitution:

- **Invariants** — things that must always hold. The physical constants of this universe.
- **Signals** — what is observable. What can be measured.
- **Lenses** — how observations are interpreted. Different roles, different readings.
- **Contexts** — regions of the universe with different local conditions.
- **Gates** — the boundaries of viability (`THRIVING · STABLE · COMPRESSED · CRITICAL · MODEL_COLLAPSES`).

Without this universe, human and AI are productive strangers — building things, sometimes aligned, sometimes not, with no way to know the difference. With it, they're collaborators operating inside a shared frame, measurable against the intentions they declared.

- **Life gyroscope** — human intelligence. Self-contained, spins on its own axis. Three native circles: Cognition, Creativity, Sensory.
- **Cyber gyroscope** — AI/robot intelligence. Self-contained, spins on its own axis. Three native circles: AI-reasoning, AR/adaptivity, Spatial.
- **NeuroverseOS — the universe** (expressed as a worldmodel). Defines:
  - **Invariants** — physical constants; things that must always hold
  - **Signals** — what is observable in this universe
  - **Lenses** — how observations are interpreted
  - **Contexts** — regions of the universe with different local conditions
  - **Gates** — the boundaries of viability (`THRIVING · STABLE · COMPRESSED · CRITICAL · MODEL_COLLAPSES`)

Both gyroscopes exist **inside** the universe. Their behavior is shaped by its laws. Their survival depends on staying within viable regions. They do not need a mediator to sense each other's activity — shared existence in a common universe is what makes mutual observation possible at all.

The two triads are independent capability systems. They are not mirror images and do not need to be paired 1-to-1. A human exercising Cognition while an AI exercises AR are both fully engaged in their native modes — neither is "off," and the math must not penalize either.

**Communication corridors** are not channels between gyroscopes. They are moments when both gyroscopes' activity **registers at the same universe coordinates** — the same invariant, signal, lens, or context. Shared existence, not mediated translation.

- `invariant ↔ invariant`
- `signal ↔ signal`
- `lens ↔ lens`
- `context ↔ context`

That shared registration *is* the corridor. Translation quality through active corridors is what **N** scores — not whether the gyroscopes are in matching modes.

**Recommended docs visual:** a containing environment (the universe) labeled with the worldmodel's invariants, signals, lenses, contexts, and viability gates. Inside the environment, two gyroscopes spinning independently, each with its three native circles. Active corridors shown as points in the universe where both gyroscopes' activity registers simultaneously. No gimbal. No bridge. Two independent intelligences inside a shared universe whose laws make their outputs mutually observable.

Three things stay fixed across every deployment:
- **Three entities:** Life (human), Cyber (AI/robot), Joint (merge observable inside the universe).
- **The `actor_domain` classifier** that tags every event as life | cyber | joint.
- **Scores normalize 0–100** across every level.

What flexes per worldmodel (i.e. per universe):
- The **sub-dimensions** within Life and within Cyber. A worldmodel can declare two Life dimensions or seven; same for Cyber. They don't have to match each other.
- The **worldmodel elements** — invariants, signals, lenses, contexts — that define what can be observed and what survival looks like in this particular universe.

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

### NeuroVerse Coherence N (translation through corridors)

N measures **translation quality through active corridors** — the quality of successful mapping, handoff, co-decision, and co-execution between the two gyroscopes when they reference the same worldmodel elements. It is not a synchronization metric.

- **Components:** ALIGN, HANDOFF, CO_DECISION, CO_EXECUTION.
- A component is **present** only when there is evidence that Life-side and Cyber-side activity referenced **shared worldmodel semantics** — the same invariant, signal, lens, or context. That shared reference *is* the corridor.
- **Presence-averaged** across whichever of the four components have evidence.
- **High L + high C can still produce low N.** Two excellent intelligences working past each other — never opening a corridor — score a low N. That's the correct behavior.
- **Universe-dependency rule (explicit):** N is *unavailable* when no worldmodel is loaded. The output surfaces the reason — `"N unavailable: no worldmodel loaded"`. This is the mechanical definition of NeuroverseOS as the universe the gyroscopes exist in: with no worldmodel, there is no shared universe, no coordinates for both sides to register against, no notion of behavior or survival — so coherence is undefined, not zero.

Stateless Radiant (no memory provider) can still compute L and C from native signals. N activates only when a worldmodel is in the loop.

### Composite alignment R (presence-based over entities)

R averages over whichever entities have scores. No weights, no λ-coefficients.

- **All-human deployment:** `R = A_L`.
- **All-AI pipeline:** `R = A_C`.
- **Hybrid with worldmodel loaded:** `R = avg(A_L, A_C, A_N)`.
- **Any entity in `INSUFFICIENT_EVIDENCE` or `UNAVAILABLE` is excluded** from the average — not counted as zero.

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

### Formal math (for step 2 implementation)

This is the canonical specification that `src/radiant/core/math.ts` implements.

**1. Presence rule (applies to every dimension and every N component).**

A dimension or component `x` is **present** iff:

```
event_count(x) >= k  AND  confidence(x) >= c
```

Defaults `k = 3`, `c = 0.5`. Absent items are **excluded**, not zero-scored.

**2. Life score `L` (human gyroscope).**

Let `D_L` = life-native dimensions declared in the worldmodel (default: Cognition, Creativity, Sensory).
Let `P_L = { d ∈ D_L | d is present }`.

```
L = INSUFFICIENT_EVIDENCE                      if |P_L| = 0
L = (1 / |P_L|) · Σ_{d ∈ P_L} score(d)         if |P_L| > 0
```

where `score(d) ∈ [0, 100]`.

**3. Cyber score `C` (cyber gyroscope).**

Let `D_C` = cyber-native dimensions declared in the worldmodel (default: AI-reasoning, AR-adaptivity, Spatial).
Let `P_C = { d ∈ D_C | d is present }`.

```
C = INSUFFICIENT_EVIDENCE                      if |P_C| = 0
C = (1 / |P_C|) · Σ_{d ∈ P_C} score(d)         if |P_C| > 0
```

No symmetry requirement with `D_L`. `D_L` and `D_C` are independent sets.

**4. NeuroVerse coherence `N` (translation through corridors).**

Let `Q = { ALIGN, HANDOFF, CO_DECISION, CO_EXECUTION }`.
A component `q ∈ Q` is **present** only when there is evidence that Life-side and Cyber-side activity referenced shared worldmodel semantics (same invariant / signal / lens / context) — i.e. a corridor was open.
Let `P_N = { q ∈ Q | q is present }`.

```
N = UNAVAILABLE                                if no worldmodel loaded
N = INSUFFICIENT_EVIDENCE                      if worldmodel loaded and |P_N| = 0
N = (1 / |P_N|) · Σ_{q ∈ P_N} score(q)         if |P_N| > 0
```

This is why `N` is translation quality, not synchronization.

**5. Composite alignment `R`.**

Let `V` = available entity alignments among `{ A_L, A_C, A_N }`, excluding any in `UNAVAILABLE` or `INSUFFICIENT_EVIDENCE`, where each `A_* ∈ [0, 100]` is the lens-evaluated alignment for that entity.

```
R = INSUFFICIENT_EVIDENCE                      if |V| = 0
R = (1 / |V|) · Σ_{v ∈ V} v                    if |V| > 0
```

Consequences:
- all-human deployment ⇒ `R = A_L`
- all-AI deployment ⇒ `R = A_C`
- hybrid with worldmodel loaded ⇒ `R = avg(A_L, A_C, A_N)` over available entities

---

## Three-Layer Interpretation Architecture

Between raw signals and the prose the user sees, Radiant runs three distinct transformations. Most systems collapse these into one. Radiant keeps them separate — this is what lets output feel like a high-end technical operator thinking alongside the reader, rather than generic AI analysis.

```
signals
  → Worldmodel         (WHAT is true — interpretive lenses shape signals into patterns)
  → Rendering lens     (HOW to think about it — deterministic pattern transform)
  → Renderer           (HOW to express it — voice templates, tight structure)
```

### Layer 1 — Worldmodel: WHAT is true

Already covered in this document. The worldmodel declares signals, patterns, invariants, lenses, contexts, and viability gates. **Interpretive lenses** at this layer (existing `src/builder/lens.ts`) are declarative — they shape how signals compose into patterns and what those patterns mean inside this particular universe.

### Layer 2 — Rendering lens: HOW to think about it

New, Radiant-specific. A rendering lens is a **deterministic pattern-transform function** applied after patterns are computed and before they reach the renderer. Signature:

```ts
rewrite(pattern: Pattern): Pattern  // annotates with framing + emphasis metadata
```

It annotates each pattern with:
- `framing` — e.g. `"system-level"`, `"leverage point"`, `"coordination risk"`
- `emphasis` — what this lens wants weighted in the output
- `compress` — whether the renderer should cut hedging and ceremony

**Guardrails (non-negotiable).** A rendering lens:
- cannot invent new signals
- cannot override evidence
- cannot hallucinate intent
- cannot change what is true; only what is emphasized

Framing layer only. No LLM in the path.

**First rendering lens: `aukiBuilderLens`** — role-based, not personal. Encodes how elite technical builders think about systems:

- **Systems-first** — zoom out before zooming in; structure over symptoms
- **Coordination-aware** — breakdowns *between* components, not just within them
- **Leverage-oriented** — bottlenecks, compounding effects, integration points
- **Bias toward action** — output is *what to do*, not just *what is happening*
- **Comfortable with ambiguity** — no over-qualifying, no over-explaining
- **Direct, compressed language** — no fluff, no "AI tone"

Each characteristic maps to pattern rewrites and voice metadata. `aukiBuilderLens` lives at `src/radiant/lenses/auki-builder.ts`.

### Layer 3 — Renderer: HOW to express it

Reads patterns + rendering-lens metadata and produces output in the **EMERGENT / MEANING / MOVE** structure:

```
EMERGENT

<observed pattern, declarative>
<observed pattern, declarative>

MEANING

<what it implies, plain direct voice>
<what it implies, plain direct voice>

MOVE

<what to do about it, imperative>
<what to do about it, imperative>
```

Voice is a **testable rendering constraint, not a stylistic preference**. The renderer enforces it via templates:

**Forbidden phrasing (output fails if present):**
- "It may be beneficial to consider..."
- "There appears to be..."
- "One possible interpretation..."
- "It might be worth..."
- "Consider whether..."

**Preferred phrasing:**
- "Coordination is breaking here."
- "You're building in parallel, not converging."
- "Tighten this or it fragments."
- "Force cross-module ownership."

The renderer rejects output containing forbidden patterns and fails loudly — same discipline as the evidence gate. Voice is enforced by the build, not by hope.

### Why separation matters

A worldmodel without a lens produces accurate but flavorless output. A lens without voice templates produces clever but verbose output. Voice templates without a worldmodel produce confident hallucination. All three together produce the moment the product is built for: *"yeah, that's exactly the issue."*

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
Interpretive lens evaluation (signals + patterns vs. active worldmodels)
      ↓
Three alignment scores + composite R
      ↓
Rendering lens (e.g. aukiBuilderLens) — rewrite(pattern) adds framing + emphasis
      ↓
Memory provider?
   NO  → stateless output
   YES → + drift detection, baselines, reinforcement log, evolution proposals
      ↓
Renderer (voice templates → EMERGENT / MEANING / MOVE output)
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
3. **`auki-strategy.world.md`** (strategy — goals + required behaviors; authored and compiled via `neuroverse worldmodel build`)

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

The Memory Palace **pattern** is open in Radiant — the three-tier structure (raw → structured signals → synthesized narrative) is the canonical coding standard for behavioral memory.

---

## Cost Model

**Your costs:** labor to build + maintain. That's it.
**Hosting:** none. Users run Radiant on their own machines.
**Data:** none stored. Radiant never touches user databases.
**Compute:** zero. Users pay their own API quotas / CPU.

**Revenue sources:**
- Consulting (worldmodel authoring from org docs)
- Enterprise governance-as-a-service (hosted Radiant for orgs that want managed deployment)
- LQ token compensation from Auki if they merge the contribution

Radiant itself is the hook: free, open, viral. Proves the framework. Pulls people toward NeuroverseOS.

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

1. ✅ **Package scaffolding** under `src/radiant/` (module of `@neuroverseos/governance`, re-exported as `./radiant`) — `src/radiant/index.ts` + directory structure + `./radiant` export in `package.json`
2. ✅ **Core types + L/C/N math** — `src/radiant/types.ts` + `src/radiant/core/math.ts`. Asymmetric Life/Cyber capability spaces, presence-based averaging (no weights), N as cross-mode translation metric (UNAVAILABLE without worldmodel), `AlignmentStatus` with `INSUFFICIENT_EVIDENCE`, evidence gate (k=3, c=0.5). 30 tests.
3. ✅ **`actor_domain` classification** — `src/radiant/core/domain.ts`. Life/cyber/joint tagging. Mixed authorship → joint. Cross-boundary response → joint. Unknown → life (conservative default). 21 tests.
4. ✅ **Signal extraction** — `src/radiant/core/signals.ts`. 5 signals × 3 domains = 15-cell matrix. Default extractors: clarity, ownership, follow_through, alignment, decision_momentum. Pluggable. 21 tests.
5. ✅ **AI pattern interpretation** — `src/radiant/core/patterns.ts`. AI-governed, hybrid vocabulary (canonical + candidate). Structured prompt → AI identifies patterns → JSON parsed + validated. Evidence must cite real signals/events.
6. ✅ **Rendering lens layer** — `src/radiant/lenses/auki-builder.ts` + `src/radiant/lenses/index.ts`. Three-domain vanguard frame (Future Foresight / Narrative Dynamics / Shared Prosperity as internal reasoning; skills-level vocabulary for output). 30 Auki vocabulary terms, 36 forbidden phrases, voice directives, 4 exemplars, deterministic `rewrite(pattern)`. 35 tests.
7. ✅ **GitHub adapter** — `src/radiant/adapters/github.ts`. Fetches commits, PRs, comments via raw fetch. Maps to Event type. Actor classification (human/bot/AI from GitHub metadata + Co-authored-by trailers). `src/radiant/core/scopes.ts` for scope resolution. 15 tests.
8. **NeuroVerse base worldmodel** — not yet built. Universal builder signals. Deferred; Auki worldmodels sufficient for Phase 1.
9. ✅ **Renderer** — `src/radiant/core/renderer.ts`. EMERGENT / MEANING / MOVE / ALIGNMENT / DEPTH output structure. Human-language score formatting ("72 · STABLE", "41 · needs attention", "not enough signal to call yet"). Memory Palace YAML frontmatter (Tier 2 structured signals). DEPTH section adapts to read count (first read / baseline forming / baseline established).
10. ✅ **Scope resolution** — `src/radiant/core/scopes.ts`. Parses "owner/repo", GitHub URLs, strips .git / trailing slash.
11. **Memory provider interface** — not yet built. Deferred to ExoCortex integration (the exocortex IS the memory provider for Auki).
12. **SQLite reference memory provider** — not yet built. Optional fallback for orgs without an exocortex. Deferred.
13. ✅ **Commands** — `src/radiant/commands/think.ts` (Stage A voice: worldmodel + lens → AI-framed response with voice check) + `src/radiant/commands/emergent.ts` (Stage B behavioral: full pipeline — fetch → classify → signals → AI patterns → scores → lens rewrite → render). `decision`, `drift`, `evolve` stubbed in CLI.
14. ✅ **CLI entry** — `src/cli/radiant.ts`. `neuroverse radiant think|emergent|lenses list|lenses describe`. Wired into main `neuroverse` CLI router. Supports `--lens`, `--worlds`, `--query`, `--json`, `--model`. Reads `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `RADIANT_WORLDS`, `RADIANT_LENS`, `RADIANT_MODEL` from env.
15. **MCP server entry** — not yet built. Phase 2.
16. ✅ **Tests** — 514 tests across 7 test files: `radiant-math.test.ts` (30), `radiant-domain.test.ts` (21), `radiant-signals.test.ts` (21), `radiant-lens.test.ts` (35), `radiant-think.test.ts` (28), `radiant-github.test.ts` (15), `radiant-integration.test.ts` (11). Plus 353 existing governance tests = 514 total, all passing.
17. ✅ **Auki worldmodels ported** — `src/radiant/examples/auki/worlds/` carries both `auki-vanguard.worldmodel.md` and `auki-strategy.worldmodel.md`. Both validate and compile through the existing `neuroverse worldmodel build` pipeline. Vanguard: 9 invariants, 14 rules, 3 lenses. Strategy: 12 invariants, 24 rules, 3 lenses.

**Additional deliverables (not in original build order):**

- ✅ **CLAUDE.md** — `src/radiant/examples/auki/CLAUDE.md`. Auki-specific Claude Code governance frame. Voice rules, invariants, decision priorities, vocabulary table, Radiant tool pointers. Tested and confirmed working — Claude Code reads it at session start and every response is Auki-native.
- ✅ **Install script** — `src/radiant/examples/auki/install.sh`. Copies CLAUDE.md + worldmodels to target repo root. One command.
- ✅ **Exemplars** — `src/radiant/examples/auki/exemplars/`. Four worked examples of the vanguard model in action (Intercognitive Foundation, hybrid robotics essay, glossary, year-recap) + the vanguard diagram itself. Annotated with three-domain integration analysis.
- ✅ **System prompt composer** — `src/radiant/core/prompt.ts`. Pure function: worldmodel + lens → structured system prompt with worldmodel context, analytical frame, vocabulary, voice rules, guardrails.
- ✅ **Voice check** — `src/radiant/core/voice-check.ts`. Forbidden-phrase detection including bucket-name leak prevention. Returns violations with offsets.
- ✅ **AI adapter** — `src/radiant/core/ai.ts`. `RadiantAI` interface + Anthropic Claude implementation (raw fetch, no SDK) + mock adapter for tests.

### Phase 1 scope — COMPLETE

**Status: code-complete on branch `claude/radiant-composable-prs-6BeIY`.** 16 commits, 514 tests, 16 source files, all passing.

Steps 1–7, 9–10, 13–14, 16–17 are shipped. Step 8 (NeuroVerse base worldmodel) deferred; Auki worldmodels are sufficient. Steps 11–12 (memory) deferred to ExoCortex integration. Step 15 (MCP) is Phase 2.

Nils can run:
```bash
# Voice layer (CLAUDE.md — zero friction):
bash install.sh  # drops CLAUDE.md + worldmodels into any Auki repo
# Then open Claude Code — every response is Auki-framed

# Active voice (needs API key):
ANTHROPIC_API_KEY=xxx neuroverse radiant think \
  --lens auki-builder --worlds ./worlds/ --query "..."

# Behavioral dashboard (needs API key + GitHub token):
ANTHROPIC_API_KEY=xxx GITHUB_TOKEN=yyy neuroverse radiant emergent \
  aukiverse/posemesh --lens auki-builder --worlds ./worlds/
```

**Remaining for future phases:**
- Phase 2: MCP server (expose think/emergent as MCP tools)
- Phase 3: ExoCortex memory integration (write Memory Palace reads into the exocortex; drift/evolve commands)
- The handshake: ExoCortex ↔ Radiant for robotic participants on the real world web

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
1. `npx radiant emergent aukiverse/posemesh` — produces meaningful output from real GitHub data
2. `npx radiant decision aukiverse/posemesh#<pr>` — produces ship/delay/escalate + reasoning
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
- Worldmodel authoring inside Radiant. Authoring already exists in the NeuroverseOS CLI (`neuroverse worldmodel init/validate/build/explain`) with the guide baked into the scaffold comments. Radiant's job is consumption, not authoring.

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
8. When ExoCortex opens, the PR to them is a config-only addition (add Radiant to mcpServers), zero code changes in their repo
10. Cognitive liberty is preserved — nothing leaves the user's system unless they opt in
