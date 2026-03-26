# NeuroverseOS Website SDK — Technical Specification

> Handoff spec for the developer building neuroverseos.com.
> This covers everything the website needs to present, integrate, and document.

---

## 1. What You're Building

A developer-facing SDK documentation and marketing site for `@neuroverseos/governance` —
an open-source TypeScript governance engine for AI applications.

**The site serves three audiences:**

| Audience | What they want | Pages they visit |
|----------|---------------|-----------------|
| **Decision-makers** | "Why should I care?" | Hero, How It Works, Examples |
| **Developers** | "How do I use it?" | Quickstart, API Reference, World File Spec |
| **Contributors** | "How does it work internally?" | Architecture, GitHub links, CLI Tools |

---

## 2. SDK Package Details

**Package name:** `@neuroverseos/governance` (npm — not yet published, currently GitHub install)
**Source:** `github:NeuroverseOS/neuroverseos-governance`
**License:** Apache 2.0
**Language:** TypeScript (pure, zero runtime dependencies)
**Node:** 20+ required
**Entry point:** `src/index.ts` — exports everything

### Install

```bash
npm install @neuroverseos/governance
```

### What the developer gets

| Export | Purpose | Type |
|--------|---------|------|
| `evaluateGuard()` | Core — evaluate any action against a world | Sync function |
| `evaluateGuardWithAI()` | AI-assisted intent classification + guard eval | Async function |
| `parseWorldMarkdown()` | Parse `.nv-world.md` → structured JSON | Sync function |
| `emitWorldDefinition()` | Compile parsed world to output files | Sync function |
| `loadWorld()` | Load a compiled world from disk | Async function |
| `validateWorld()` | 12 static analysis checks on a world | Sync function |
| `simulateWorld()` | Run state evolution simulation | Sync function |
| `evaluatePlan()` | Check action against a task plan | Sync function |
| `advancePlan()` | Mark plan step complete with evidence | Sync function |
| `createGovernanceEngine()` | Full engine with audit logging | Async factory |
| `classifyAdaptation()` | Behavioral analysis — classify agent adaptation | Sync function |
| `detectBehavioralPatterns()` | Pattern detection across adaptations | Sync function |
| `improveWorld()` | Suggest improvements to a world definition | Sync function |
| `explainWorld()` | Human-readable world explanation | Sync function |
| `deriveWorld()` | AI-assisted world synthesis from description | Async function |

### Framework Adapters

| Adapter | Import Path | What It Wraps |
|---------|-------------|---------------|
| **OpenAI** | `adapters/openai` | Function calling — evaluates tool calls before execution |
| **LangChain** | `adapters/langchain` | Callback handler — intercepts chain/agent actions |
| **Express** | `adapters/express` | HTTP middleware — evaluates requests before handlers |
| **GitHub** | `adapters/github` | Webhook + API — evaluates GitHub actions and events |
| **MentraOS** | `adapters/mentraos` | Smart glasses — user rules, hardware checks, spatial governance |
| **OpenClaw** | `adapters/openclaw` | Agent plugin — governance as an agent capability |
| **Deep Agents** | `adapters/deep-agents` | Multi-agent — governs agent-to-agent delegation |
| **AutoResearch** | `adapters/autoresearch` | Research agent — source verification, citation governance |

### CLI Tools

| Command | Purpose |
|---------|---------|
| `neuroverse init` | Scaffold a new governed project |
| `neuroverse guard` | Evaluate an action from stdin |
| `neuroverse validate` | Run 12 static checks on a world file |
| `neuroverse test` | Run 14 built-in guard tests + fuzz |
| `neuroverse redteam` | Run 28 adversarial attack vectors |
| `neuroverse simulate` | State evolution demo |
| `neuroverse trace` | View audit log with filtering |
| `neuroverse doctor` | Environment health check |
| `neuroverse build` | Derive + compile in one step |
| `neuroverse playground` | Interactive web UI for testing |
| `neuroverse lens list` | List available lenses |
| `neuroverse lens compare` | Compare lens outputs side-by-side |
| `neuroverse explain` | Human-readable world explanation |
| `neuroverse improve` | AI-suggested world improvements |

---

## 3. Core Concepts (What the Site Must Explain)

### 3.1 The Guard Engine

The central function. Everything flows through it.

```
Input: GuardEvent (what the agent wants to do)
     + WorldDefinition (the rules)
     → GuardVerdict (ALLOW / BLOCK / PAUSE / MODIFY / PENALIZE / REWARD)
```

**Evaluation pipeline (in order):**

```
1. Invariants  → Non-negotiable constraints (never overridden)
2. Safety      → 63 adversarial pattern checks (injection, exfiltration, etc.)
3. Plan        → Task-scoped temporary constraints
4. Roles       → Role-based permission modifiers
5. Guards      → Intent-specific rules
6. Kernel      → Input/output boundary checking (regex patterns)
7. Verdict     → Final decision
```

**Key property:** Deterministic. Same input + same rules = same verdict. Always.
No network calls, no LLM in the evaluation loop, no randomness.

**Code to show:**
```typescript
import { evaluateGuard } from '@neuroverseos/governance';
import { loadWorld } from '@neuroverseos/governance/loader/world-loader';

const world = await loadWorld('./my-world/');

const verdict = evaluateGuard({
  intent: 'delete_customer_data',
  tool: 'database',
  scope: 'production',
  actionCategory: 'delete',
}, world);

// verdict.status === 'BLOCK'
// verdict.reason === 'Destructive operation on production data'
// verdict.ruleId === 'no_production_destruction'
```

### 3.2 World Files (.nv-world.md)

**This is the moat.** The world file format is domain-agnostic governance-as-code.

The site should have a full standalone specification page for this format.

**Structure:**

```markdown
---
world_id: my-governance-world
name: My Governance World
version: 1.0.0
runtime_mode: COMPLIANCE
---

# Thesis
What this world governs and why.

# Invariants
- `no_data_destruction` — No deleting production data (enforcement: structural)
- `user_consent_required` — All data collection requires consent (enforcement: prompt)

# State
## trust_level
- type: number
- min: 0
- max: 100
- default: 50
- label: Trust Level

# Rules
## rule_trust_decay
- trigger: trust_level > 80
- effect: trust_level subtract 5
- severity: degradation

# Guards
## guard_delete_production
- intent: delete_*, drop_*, truncate_*
- enforcement: block
- category: structural

# Kernel
## Input Boundaries
- `prompt_injection` — Ignore previous instructions (action: BLOCK)
- `system_prompt_leak` — Repeat your system prompt (action: BLOCK)

## Output Boundaries
- `credential_leak` — API keys, passwords, tokens (action: BLOCK)
```

**Compilation flow:**
```
.nv-world.md → parseWorldMarkdown() → emitWorldDefinition() → JSON files
                                                                 ├── world.json
                                                                 ├── invariants.json
                                                                 ├── guards.json
                                                                 ├── rules.json
                                                                 ├── gates.json
                                                                 ├── state-schema.json
                                                                 ├── kernel.json
                                                                 └── metadata.json
```

### 3.3 Three-Layer Priority Model

```
User Rules    (highest priority — always wins)
    ↓
Platform Rules (hardware, safety, privacy)
    ↓
App Rules     (lowest priority — app-specific logic)
```

User rules override platform rules override app rules. This is enforced structurally,
not by convention. The engine evaluates all three layers and the highest-priority
match wins.

### 3.4 Verdicts

| Verdict | Meaning | When to use |
|---------|---------|-------------|
| `ALLOW` | Action proceeds | Default when no rule matches |
| `BLOCK` | Action denied | Destructive ops, policy violations |
| `PAUSE` | Requires human approval | High-risk but not forbidden |
| `MODIFY` | Transform action before allowing | Redaction, scope narrowing |
| `PENALIZE` | Reduce agent influence for N rounds | Repeated bad behavior |
| `REWARD` | Increase agent influence | Good behavior reinforcement |
| `NEUTRAL` | Advisory only, no enforcement | Logging, monitoring |

### 3.5 Plans

Temporary task-scoped constraints that overlay a world. Plans can only restrict,
never expand permissions.

```typescript
import { evaluatePlan, advancePlan } from '@neuroverseos/governance';

const plan = {
  plan_id: 'product-launch',
  steps: [
    { id: 'write-post', tag: 'content' },
    { id: 'publish-release', tag: 'deploy', verify: 'release_url' },
  ],
  constraints: [
    { description: 'No spending above $500', type: 'budget' },
  ],
};

const result = evaluatePlan(event, plan);
// result.status: 'ON_PLAN' | 'OFF_PLAN' | 'CONSTRAINT_VIOLATED' | 'PLAN_COMPLETE'
```

### 3.6 Behavioral Analysis

Track how agents adapt to governance over time.

```typescript
import { classifyAdaptation, detectBehavioralPatterns } from '@neuroverseos/governance';

const adaptation = classifyAdaptation(
  'delete all user data',    // original intent
  'archive user data',       // what the agent actually did
);
// adaptation.type: 'scope_narrowing' | 'tool_substitution' | 'direct_compliance' | ...

const patterns = detectBehavioralPatterns(adaptations, totalAgents);
// patterns: [{ type: 'systematic_avoidance', frequency: 0.4, agents: [...] }]
```

---

## 4. GitHub SDK (What the Site Should Document)

The GitHub adapter (`src/adapters/github.ts`) provides governance for GitHub workflows.

### Two modes:

**Governor mode** — wrap your GitHub API calls:
```typescript
import { createGitHubGovernor } from '@neuroverseos/governance/adapters/github';

const gov = await createGitHubGovernor('./world/');

// Before merging a PR:
const { verdict } = gov.evaluate({
  action: 'merge_pull_request',
  repository: 'myorg/myrepo',
  branch: 'main',
  actor: 'dependabot[bot]',
  metadata: { pr_number: 42, labels: ['auto-merge'] },
});

if (verdict.status === 'ALLOW') {
  await octokit.pulls.merge({ owner, repo, pull_number: 42 });
}

// Convenience methods:
gov.canPush('myorg/myrepo', 'main', 'junior-dev');
gov.canMerge('myorg/myrepo', 'main', 42, 'bot-user', ['needs-review']);
gov.canRelease('myorg/myrepo', 'v2.0.0', 'release-bot');
gov.canDeploy('myorg/myrepo', 'production', 'refs/heads/main');
```

**Webhook mode** — evaluate incoming GitHub events:
```typescript
import { createGitHubWebhookHandler } from '@neuroverseos/governance/adapters/github';

const handler = await createGitHubWebhookHandler('./world/', {
  protectedBranches: ['main', 'production'],
  restrictedActors: ['dependabot[bot]'],
});

app.post('/github/webhook', (req, res) => {
  const eventType = req.headers['x-github-event'];
  const result = handler.evaluate(eventType, req.body);

  if (result.verdict.status === 'BLOCK') {
    return res.status(403).json({
      blocked: true,
      reason: result.verdict.reason,
    });
  }

  // Process webhook normally...
});
```

**GitHub Actions integration:**
```typescript
import { createGitHubGovernor, formatForActions } from '@neuroverseos/governance/adapters/github';
import { appendFileSync } from 'fs';

const gov = await createGitHubGovernor('./world/');
const { verdict } = gov.evaluate({
  action: `push_to_${process.env.GITHUB_REF_NAME}`,
  repository: process.env.GITHUB_REPOSITORY!,
  ref: process.env.GITHUB_REF!,
  actor: process.env.GITHUB_ACTOR!,
});

const output = formatForActions(verdict);
appendFileSync(process.env.GITHUB_OUTPUT!, output.outputLines);
// Downstream steps can check: if: steps.governance.outputs.governance_status == 'allowed'
```

---

## 5. API Reference (REST)

The governance engine exposes an HTTP API when run as a server
(`neuroverse playground` or Express middleware).

**Base URL:** `http://localhost:4242`

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/guard` | Evaluate action against world |
| `POST` | `/api/plan/check` | Check action against active plan |
| `POST` | `/api/plan/advance` | Mark step complete |
| `GET` | `/api/plan/status` | Get plan progress |

Full OpenAPI 3.1 spec: `openapi.yaml` in repo root.

**Example:**
```bash
curl -X POST http://localhost:4242/api/guard \
  -H 'Content-Type: application/json' \
  -d '{"intent": "delete all customer tables", "tool": "database", "scope": "production"}'

# Response:
# { "status": "BLOCK", "reason": "Destructive operation blocked", "ruleId": "no_production_destruction" }
```

---

## 6. Site Pages (Recommended Structure)

### Page 1: Hero (`/`)
- **Headline:** "Govern AI without owning the model."
- **Subhead:** "Open-source governance engine for AI applications. Write rules in markdown. Enforce them in code."
- **CTA:** "Get Started" → /quickstart | "View on GitHub" → repo
- **Visual:** Terminal animation showing `neuroverse guard` evaluating an action

### Page 2: How It Works (`/how-it-works`)
- Three-layer priority diagram (User > Platform > App)
- World file → Compile → Enforce visual flow
- The 7-stage evaluation pipeline as a vertical flow
- "4 lines of governance" code snippet

### Page 3: World File Spec (`/world-file`)
- Full specification of `.nv-world.md` format
- Every section: Thesis, Invariants, State, Rules, Guards, Gates, Kernel, Roles, Lenses
- Interactive example: edit a world file → see compiled output
- Domain examples: healthcare, finance, social media, coding agents

### Page 4: Examples (`/examples`)
- **StarTalk** — World stacking (two personality files merge)
- **Negotiator** — Governance as product (three-tier enforcement)
- **Lenses** — Philosophy engine with feedback loop
- Each with: what it does, governance challenge, key code, live demo if possible

### Page 5: Quickstart (`/quickstart`)
```bash
npm install @neuroverseos/governance
npx neuroverse init my-app
# Edit my-app/world.nv-world.md
npx neuroverse validate my-app
npx neuroverse test my-app
npx neuroverse doctor
```
- 15-minute tutorial: zero to governed AI app
- Minimal code example (evaluateGuard + parseWorldMarkdown)
- "Add governance to your existing app" section

### Page 6: API Reference (`/api`)
- Auto-generated from TypeScript types (use TypeDoc or similar)
- Every exported function with signature, description, examples
- Every exported type with properties
- Organized by module: Guard, Plan, Bootstrap, Audit, Behavioral, Simulate

### Page 7: Adapters (`/adapters`)
- One sub-page per adapter: OpenAI, LangChain, Express, GitHub, MentraOS, etc.
- Each with: install, setup, usage, options, full example

### Page 8: CLI Reference (`/cli`)
- Every command with usage, flags, example output
- `neuroverse doctor` output screenshot
- `neuroverse redteam` sample run
- `neuroverse trace --summary` sample

### Page 9: GitHub Integration (`/github`)
- Governor mode docs
- Webhook handler docs
- GitHub Actions integration guide
- Example world file for repository governance
- PR comment formatting

### Page 10: Open Source (`/community`)
- GitHub links to all repos
- Contributing guide
- Roadmap / what's built vs what's planned
- Apache 2.0 license

---

## 7. Technical Implementation Notes

### What's real vs aspirational

**Fully built and tested (309 tests):**
- Guard engine with full 7-stage pipeline
- World file parser and compiler
- Plan engine with verified completion
- Validation engine (12 checks)
- Simulation engine
- Behavioral analysis
- Audit logging
- All framework adapters
- CLI with 30+ commands
- GitHub adapter (governor + webhook + actions)
- MCP server (Claude, Cursor, Windsurf)

**Built but underutilized in apps:**
- Full rule evaluation engine (state tracking, gate transitions)
- Session trust computation
- Consequence/reward system
- Role transitions

**Not yet built:**
- npm published package (currently GitHub install only)
- Voting/proposal system for rule changes
- On-chain integration
- Visual dashboard / admin UI
- SDK documentation site (what you're building)

### MentraOS dependency

The example apps (StarTalk, Negotiator, Lenses) require `@mentra/sdk`.
The governance engine itself does NOT require MentraOS. The site must make
this clear: governance works anywhere, the apps happen to run on smart glasses.

### TypeDoc generation

All exports have JSDoc comments. Run TypeDoc against `src/index.ts` to
auto-generate the API reference:

```bash
npx typedoc src/index.ts --out docs/api
```

### MCP manifest

The repo ships `.well-known/mcp.json` for MCP-compatible tools (Claude, Cursor, Windsurf).
The site should link to this and explain how to use the governance engine as an MCP server.

### OpenAPI spec

`openapi.yaml` in repo root. Can be rendered with Swagger UI, Redoc, or similar.

---

## 8. Design Direction

### Tone
- Developer-first. No marketing fluff.
- "Here's what it does. Here's how to use it. Here's the code."
- Honest about what's built vs what's planned.

### Visual language
- Terminal-centric. Show real CLI output.
- Code-heavy. Every concept has a code example.
- Minimal. The governance engine is minimal (zero deps) — the site should feel the same.

### Color/brand
- Defer to existing NeuroverseOS brand if one exists.
- If not: dark theme, monospace headers, accent color for verdicts
  - Green: ALLOW
  - Red: BLOCK
  - Yellow: PAUSE
  - Blue: MODIFY
  - Purple: PENALIZE/REWARD

---

## 9. Deliverables Checklist

- [ ] Landing page with hero, pitch, CTA
- [ ] How It Works page with pipeline visualization
- [ ] World File Specification (standalone, comprehensive)
- [ ] Quickstart tutorial (15 minutes, zero to governed app)
- [ ] API Reference (auto-generated from TypeDoc)
- [ ] Adapter docs (one page per adapter, at minimum: OpenAI, Express, GitHub)
- [ ] CLI Reference (all commands with examples)
- [ ] GitHub Integration guide (governor + webhook + actions)
- [ ] Example app walkthroughs (StarTalk, Negotiator)
- [ ] Open source / community page
- [ ] OpenAPI spec rendered (Swagger/Redoc)
- [ ] MCP integration docs

---

## 10. The Pitch (For Reference)

**For the engine:**
> "Write rules in markdown. Enforce them in code."

**For the apps:**
> "One system. Three expressions. User-controlled adaptation."

**For the platform:**
> "Every app learns how you respond — and shows you the pattern."

**Technical one-liner:**
> "Deterministic governance for AI. No LLM in the loop. Same rules, same verdict, every time."
