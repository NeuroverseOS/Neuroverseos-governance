# Radiant

**Behavioral intelligence for collaboration systems.**

> ExoCortex remembers what happened. Radiant understands what it means —
> relative to your culture and strategy — and tells you what to do next.

Radiant is a module of [`@neuroverseos/governance`](../../README.md) that
applies this repo's worldmodel pipeline to real team activity (GitHub events,
ExoCortex records, chat, tasks) and produces interpretation: emergent
patterns, decision readiness, drift, and evolution proposals.

## Status

**Step 1 of 16 — scaffolding only.** The runtime surface (math, signals,
patterns, commands, memory, MCP server) lands across subsequent PRs. See
[`radiant/PROJECT-PLAN.md`](../../radiant/PROJECT-PLAN.md) at the repo root
for the full roadmap.

## The three-world stack

Every Radiant run stacks three worldmodels:

1. **NeuroVerse base** (built-in) — universal L/C/N math and domain defs
2. **Culture & values** (per-org) — e.g. `auki-vanguard.worldmodel.md`
3. **Strategy** (per-org) — goals plus required behaviors, e.g.
   `auki-strategy.worldmodel.md`

All three are compiled through the existing `neuroverse worldmodel build`
pipeline — Radiant does not invent a new worldmodel format.

## Planned layout

```
src/radiant/
├── index.ts           # npm package entry (this file's sibling)
├── types.ts           # shared types (lands step 2)
├── core/              # signals, patterns, math, domain, scopes, renderer
├── adapters/          # github (thin-wraps src/adapters/github.ts)
├── worlds/            # neuroverse-base.world.md (built-in)
├── commands/          # emergent, decision, drift, evolve
├── memory/            # MemoryProvider interface + SQLite reference
└── mcp/               # MCP server tool definitions
```

Plus `bin/radiant.ts` (CLI) and `bin/radiant-mcp.ts` (MCP server) when those
land.

## Usage

Once the full surface is published:

```ts
import {
  radiantEmergent,
  radiantDecision,
} from '@neuroverseos/governance/radiant';

const result = await radiantEmergent({
  scope: 'aukiverse/posemesh',
  worlds: ['./auki-vanguard.world.md', './auki-strategy.world.md'],
  githubToken: process.env.GITHUB_TOKEN,
});
```

Or from the CLI (future):

```bash
GITHUB_TOKEN=xxx npx radiant emergent aukiverse/posemesh --worlds ./worlds/
```

## What Radiant reuses from the parent package

- `parseWorldModel` + `compileWorldModel` (`src/engine/worldmodel-*.ts`)
- `evaluateGuard` (`src/engine/guard-engine.ts`)
- `compileLensOverlay` + built-in lenses (`src/builder/lens.ts`)
- `SignalSchema`, `OverlapMap`, `ContextsConfig` (types from
  `src/contracts/worldmodel-contract.ts`)
- `Invariant`, `Rule`, `ViabilityStatus` (`src/types.ts`)
- GitHub adapter (`src/adapters/github.ts`)
