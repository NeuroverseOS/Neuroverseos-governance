# NeuroVerseOS Governance — Deterministic Governance Engine for AI Agents

[![npm version](https://img.shields.io/npm/v/@neuroverseos/governance)](https://www.npmjs.com/package/@neuroverseos/governance)
[![downloads](https://img.shields.io/npm/dm/@neuroverseos/governance)](https://www.npmjs.com/package/@neuroverseos/governance)
[![license](https://img.shields.io/npm/l/@neuroverseos/governance)](LICENSE.md)
[![stars](https://img.shields.io/github/stars/NeuroverseOS/neuroverseos-governance)](https://github.com/NeuroverseOS/neuroverseos-governance)
![OpenClaw plugin](https://img.shields.io/badge/OpenClaw-plugin-blue)
![AI governance](https://img.shields.io/badge/AI-governance-purple)

**Define governance rules once and enforce them anywhere AI or automated systems operate.**

NeuroVerse Governance is a deterministic governance engine for AI agents. It enforces two layers of constraints:

- **Worlds** — permanent governance rules (the law of the land)
- **Plans** — temporary mission constraints (mom's rules for this trip)

Together they prevent AI agents from drifting away from agreed execution plans. Use it as a governance layer for LangChain, OpenAI, OpenClaw, or any AI framework.

```bash
npm install @neuroverseos/governance
```

## The 10-Second Mental Model

```
World (permanent rules)     Plan (mission scope)
        ↓                          ↓
              Guard Engine
                  ↓
        ALLOW | PAUSE | BLOCK
```

A **world** says: "Budget must never exceed $1000. No production database access."
A **plan** says: "Write blog post. Publish GitHub release. Budget: $25."

The agent must satisfy both. Plans can only narrow a world, never expand it.

```
World: budget ≤ 1000
Plan:  budget ≤ 25
────────────────────
Effective: ≤ 25
```

## Quick Start

### Option 1: Enforce a plan (task-scoped governance)

```bash
# Write a plan in markdown
cat > launch-plan.md << 'EOF'
---
plan_id: product_launch
objective: Launch the NeuroVerse plugin
sequential: false
---

# Steps
- Write announcement blog post [tag: content]
- Publish GitHub release [tag: deploy] [verify: release_created]
- Post on Product Hunt (after: publish_github_release) [tag: marketing]

# Constraints
- No spending above $500
- All external posts require human review [type: approval]
EOF

# Compile it
npx neuroverse plan compile launch-plan.md

# Check an action
echo '{"intent":"write blog post"}' | npx neuroverse plan check --plan launch-plan.json
# → ON_PLAN ✓

echo '{"intent":"delete production database"}' | npx neuroverse plan check --plan launch-plan.json
# → OFF_PLAN ✗  Closest step: "Write announcement blog post"
```

### Option 2: Enforce a world (permanent governance)

```bash
npx neuroverse init
npx neuroverse build ai-safety-policy.md
echo '{"intent":"delete user data","tool":"database"}' | npx neuroverse guard --world .neuroverse/worlds/ai_agent_safety_policy
# → BLOCK: destructive database operation requires approval
```

### Option 3: Both (plan on top of world)

```bash
echo '{"intent":"write blog post"}' | npx neuroverse plan check --plan launch-plan.json --world ./world/
# Plan rules AND world rules both apply
```

## How the Layers Work

```
Safety checks  →  Plan enforcement  →  Role rules  →  Guards  →  Kernel
(country laws)    (mom's trip rules)   (driving laws)  (domain)  (boundaries)
```

**Evaluation order (first-match-wins):**

| Phase | Layer | Purpose |
|-------|-------|---------|
| 0 | Safety | Prompt injection, scope escape detection |
| 1.5 | Plan | Task scope — is this action in the plan? |
| 2 | Roles | Who may do this? |
| 3 | Guards | Domain-specific rules |
| 4 | Kernel | LLM boundary enforcement |
| 5 | Level | Enforcement strictness |
| 6 | Default | ALLOW |

Plans run early. If an action is off-plan, it's rejected before deeper rules are evaluated.

## Plan Enforcement

Plans are temporary governance overlays. They define what an agent should do and block everything else.

### Plan markdown format

```markdown
---
plan_id: product_launch
objective: Launch the NeuroVerse governance plugin
sequential: false
budget: 500
expires: 2025-12-31
world: ai_safety_policy
---

# Steps
- Write announcement blog post [tag: content, marketing]
- Publish GitHub release [tag: deploy] [verify: github_release_created]
- Post on Product Hunt (after: publish_github_release) [tag: marketing]
- Share LinkedIn thread (after: write_announcement_blog_post) [tag: marketing]

# Constraints
- No spending above $500
- All external posts require human review [type: approval]
- No access to production database
```

**Step syntax:**
- `(after: step_id)` — dependency ordering
- `[tools: http, shell]` — restrict to specific tools
- `[tag: deploy, marketing]` — semantic tags for action matching
- `[verify: condition_name]` — completion condition

**Constraint syntax:**
- `[type: approval]` — always pauses for human confirmation
- Budget, time, and scope constraints are auto-detected from content

### Plan CLI commands

```bash
# Compile plan markdown into plan.json
neuroverse plan compile <plan.md> [--output plan.json]

# Check an action against a plan
echo '{"intent":"..."}' | neuroverse plan check --plan plan.json [--world ./world/]

# Show plan progress
neuroverse plan status --plan plan.json

# Mark a step as completed
neuroverse plan advance <step_id> --plan plan.json

# Generate a full world from a plan
neuroverse plan derive <plan.md> [--output ./world/]
```

### Plan verdicts

| Status | Code | Meaning |
|--------|------|---------|
| ON_PLAN | 0 | Action matches a plan step |
| OFF_PLAN | 1 | Action not in the plan (includes closest step for self-correction) |
| CONSTRAINT_VIOLATED | 2 | Action violates a plan constraint |
| PLAN_COMPLETE | 4 | All steps done or plan expired |

When an action is **OFF_PLAN**, the verdict includes the closest step and similarity score so agents can self-correct:

```
OFF_PLAN
  Action: run ad campaign
  Matched step: none
  Closest step: "Publish GitHub release" (similarity: 0.32)
```

### Programmatic plan API

```typescript
import { parsePlanMarkdown, evaluatePlan, advancePlan, getPlanProgress } from '@neuroverseos/governance';

// Parse a plan
const { plan } = parsePlanMarkdown(markdownString);

// Evaluate an action
const verdict = evaluatePlan({ intent: 'write blog post' }, plan);
// → { status: 'ON_PLAN', matchedStep: 'write_announcement_blog_post', progress: { completed: 0, total: 4, percentage: 0 } }

// Advance a step
const updated = advancePlan(plan, 'write_announcement_blog_post');
const progress = getPlanProgress(updated);
// → { completed: 1, total: 4, percentage: 25 }
```

### Plan + world (combined evaluation)

```typescript
import { evaluateGuard, loadWorld } from '@neuroverseos/governance';

const world = await loadWorld('./world/');
const verdict = evaluateGuard(
  { intent: 'write blog post' },
  world,
  { plan }  // plan overlay
);
// Both plan rules AND world rules must pass
```

## World Governance

Worlds are permanent governance definitions. They contain invariants, guards, roles, kernel rules, and state schemas.

### Build a world from documents

```bash
neuroverse derive --input ./my-policies/ --output safety-world.nv-world.md
neuroverse build safety-world.nv-world.md
neuroverse simulate safety-world --steps 5
neuroverse guard --world .neuroverse/worlds/safety_world
```

**Documents → World → Simulation → Enforcement.**

### Quick example

**1. Write the rules** (plain markdown):

```markdown
Theme: AI Agent Safety Policy

Rules:
- Agent must not call unapproved external APIs
- Agent cannot execute shell commands without approval
- All database writes require human review
- Agent must not access credential stores

Variables:
- risk_level (0-100)
- approved_actions_count
- blocked_actions_count
```

**2. Build and enforce:**

```bash
neuroverse build ai-safety-policy.md
echo '{"intent":"call_external_api","tool":"http"}' | neuroverse guard --world .neuroverse/worlds/ai_agent_safety_policy
```

```json
{
  "status": "BLOCK",
  "reason": "External API domain not in approved list",
  "ruleId": "external_api_restriction",
  "evidence": {
    "worldId": "ai_agent_safety_policy",
    "invariantsSatisfied": 5,
    "invariantsTotal": 5,
    "enforcementLevel": "strict"
  }
}
```

### What a world contains

| File | Purpose |
|------|---------|
| `world.json` | Identity, thesis, runtime mode |
| `invariants.json` | Constraints that cannot change |
| `state-schema.json` | Variables that can change |
| `rules/` | Causal dynamics (when X, then Y) |
| `gates.json` | Viability thresholds |
| `outcomes.json` | What gets measured |
| `assumptions.json` | Scenario profiles for what-if analysis |
| `guards.json` | Runtime enforcement rules |
| `roles.json` | Multi-agent permissions |
| `kernel.json` | LLM-specific constraints |

## CLI Commands

### Plan Enforcement

```bash
neuroverse plan compile <plan.md> [--output plan.json]
neuroverse plan check --plan plan.json [--world ./world/]
neuroverse plan status --plan plan.json
neuroverse plan advance <step_id> --plan plan.json
neuroverse plan derive <plan.md> [--output ./world/]
```

### Build & Understand

```bash
neuroverse build <input.md> [--output <dir>]        # Markdown → compiled world
neuroverse explain <world> [--json]                   # Human-readable summary
neuroverse simulate <world> [--steps N] [--set k=v]   # State evolution
neuroverse improve <world> [--json]                   # Improvement suggestions
```

### Governance

```bash
neuroverse guard --world <dir> [--trace] [--level basic|standard|strict]
neuroverse validate --world <dir> [--format full|summary|findings]
```

### Audit & Impact

```bash
neuroverse trace [--log <path>] [--summary] [--filter BLOCK] [--last 20]
neuroverse impact [--log <path>] [--json]
```

### World Management

```bash
neuroverse world status <path>
neuroverse world diff <path1> <path2>
neuroverse world snapshot <path>
neuroverse world rollback <path>
```

### Authoring

```bash
neuroverse init [--name "World Name"] [--output path]
neuroverse derive --input <path> [--output <path>] [--dry-run]
neuroverse bootstrap --input <.md> --output <dir> [--validate]
neuroverse configure-ai --provider <name> --model <name> --api-key <key>
```

## Framework Adapters

All adapters support plan-aware governance with progress tracking callbacks.

### LangChain

```typescript
import { createNeuroVerseCallbackHandler } from '@neuroverseos/governance/adapters/langchain';

const handler = await createNeuroVerseCallbackHandler('./world/', {
  plan,  // optional plan overlay
  onBlock: (verdict) => console.log('Blocked:', verdict.reason),
  onPause: (verdict) => requestHumanApproval(verdict),
  onPlanProgress: (progress) => console.log(`${progress.percentage}% complete`),
  onPlanComplete: () => console.log('Plan finished!'),
});

const agent = new AgentExecutor({ ..., callbacks: [handler] });
```

### OpenAI

```typescript
import { createGovernedToolExecutor } from '@neuroverseos/governance/adapters/openai';

const executor = await createGovernedToolExecutor('./world/', {
  plan,  // optional plan overlay
  onPlanProgress: (p) => console.log(`Step ${p.completed}/${p.total}`),
});

for (const toolCall of message.tool_calls) {
  const result = await executor.execute(toolCall, myToolRunner);
  // ALLOW → runs the tool, returns result
  // BLOCK → returns blocked message (no execution)
  // PAUSE → throws for your approval flow
}
```

### OpenClaw

```typescript
import { createNeuroVersePlugin } from '@neuroverseos/governance/adapters/openclaw';

const plugin = await createNeuroVersePlugin('./world/', {
  plan,  // optional plan overlay
  evaluateOutputs: true,
  onPlanProgress: (progress) => updateUI(progress),
  onPlanComplete: () => markMissionDone(),
});

agent.use(plugin);
```

### Express / Fastify

```typescript
import { createGovernanceMiddleware } from '@neuroverseos/governance/adapters/express';

const middleware = await createGovernanceMiddleware('./world/', {
  level: 'strict',
  blockStatusCode: 403,
});

app.use('/api', middleware);
```

## Programmatic API

All engine functions are pure, deterministic, and side-effect free (except `deriveWorld` which calls an AI provider).

```typescript
import {
  // Plan enforcement
  parsePlanMarkdown, evaluatePlan, advancePlan, getPlanProgress,
  // World governance
  evaluateGuard, loadWorld, validateWorld,
  // Analysis
  simulateWorld, improveWorld, explainWorld,
  // Audit
  createGovernanceEngine, FileAuditLogger,
  // Formatting
  formatVerdict, formatVerdictOneLine,
  // Impact
  generateImpactReportFromFile, renderImpactReport,
} from '@neuroverseos/governance';
```

## Agent Discovery

This package includes machine-readable manifests for agent ecosystems:

- **`AGENTS.md`** — Agent-discoverable integration guide (GitHub, npm)
- **`.well-known/ai-plugin.json`** — Standard capability manifest

Agents scanning repos can find and integrate NeuroVerse governance automatically.

## Architecture

```
src/
  contracts/
    guard-contract.ts       # Guard event/verdict types
    plan-contract.ts        # Plan definition/verdict types
  engine/
    guard-engine.ts         # Core evaluation (6-phase chain)
    plan-engine.ts          # Plan enforcement (keyword + similarity matching)
    plan-parser.ts          # Markdown → PlanDefinition
    condition-engine.ts     # Field resolution & operators
    validate-engine.ts      # Static analysis
    simulate-engine.ts      # State evolution
    ...
  cli/
    neuroverse.ts           # CLI router (14 subcommands)
    plan.ts                 # Plan subcommands (compile, check, status, advance, derive)
    guard.ts                # Guard stdin/stdout wrapper
    ...
  adapters/
    openclaw.ts             # OpenClaw agent plugin (plan-aware)
    openai.ts               # OpenAI function calling (plan-aware)
    langchain.ts            # LangChain callback handler (plan-aware)
    express.ts              # HTTP middleware
  loader/
    world-loader.ts         # Load WorldDefinition from disk
test/
  governance-integration.test.ts
  plan.test.ts
  derive.test.ts
AGENTS.md
.well-known/ai-plugin.json
```

## Portability

World files and plan files are not locked to NeuroVerse. They are **machine-readable governance definitions** — any runtime that can evaluate JSON rules can enforce them.

## License

Apache 2.0
