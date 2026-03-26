# NeuroverseOS SDK — Narrative Spec for Website + Developer Story

## For the developer building the SDK documentation site and packaging story

---

## What the SDK IS

NeuroverseOS Governance is an open-source TypeScript framework that governs AI behavior
on any platform. It's not an AI model. It's not an app framework. It's the **rules layer**
that sits between the user and the AI — ensuring every AI action passes through governance
before it happens.

The pitch:

> "Govern AI without owning the model."

The developer installs one package, writes a world file, and every AI call in their app
goes through declarative governance — guards, kernel boundary checking, role-based access,
state tracking, and behavioral rules.

---

## The Three Example Apps

The SDK story is told through three real, production-grade MentraOS apps. Each demonstrates
a different governance challenge:

### 1. StarTalk — Astrological Translator
**Governance challenge:** World stacking (merging two personality models with priority)

```
What it does:
  User sets their sun sign + rising sign.
  Says "talking to Sophie" (a Cancer with Cancer rising).
  Taps glasses → gets astrological translation of the conversation.

What it demonstrates for the SDK:
  - World file schema for personality modeling (12 zodiac .nv-world.md files)
  - World stacking: sun sign (dominant) + rising sign (secondary) merge
  - People memory persistence via SimpleStorage
  - Mode auto-selection (translate/reflect/challenge/teach/direct)
  - Content-level kernel boundary checking (evaluateGuard with contentFields)
  - Governed display calls
  - BYO-key model
```

**Key code to highlight:**
```typescript
// World stacking — the core innovation
const systemPrompt = buildStarTalkPrompt(
  { sunSign: 'cancer', risingSign: 'aries' },  // user's chart
  'taurus',                                      // other person's sign
  WORDS_DEPTH                                    // auto-scaled word limit
);
// Sun sign traits are primary. Rising sign modifies communication style.
// Compatibility notes injected when other person's sign is known.
```

### 2. Negotiator — Behavioral Signal Detection
**Governance challenge:** Strictest ethical constraints + content-level enforcement

```
What it does:
  Listens to conversation proactively.
  Detects behavioral signals (deflection, inconsistency, overcompensation).
  Surfaces insights on glasses: "~ They didn't answer your question."
  User taps for follow-up, long-presses to dismiss.
  Tracks which signals the user acts on vs dismisses.

What it demonstrates for the SDK:
  - Governance as a PRODUCT feature (not just compliance)
  - 8 immutable invariants (signals_not_truth, no_camera_confidence, etc.)
  - Three-tier enforcement:
    1. Intent-level: executor.evaluate() — can this action happen?
    2. Content-level: evaluateGuard() — is this text safe?
    3. Behavioral-level: signal classifier enforces no_single_signal_escalation IN CODE
  - Kernel boundary checking (prompt injection detection, output leak prevention)
  - Proactive classification (Merge-inspired architecture)
  - Follow-through tracking (signal → user acted?)
  - Signal effectiveness scoring per type
  - Camera governance (code-enforced, not just prompt)
```

**Key code to highlight:**
```typescript
// Three tiers of governance in one action:

// Tier 1: Intent permission
const permCheck = executor.evaluate('ai_send_transcription', appContext);
if (!permCheck.allowed) return;

// Tier 2: Content safety (prompt injection, leaks)
const inputCheck = checkInputContent(userText, appWorld);
if (!inputCheck.safe) return;

// Tier 3: Behavioral rule (no single signals)
if (signals.length < 2) return; // governance: no_single_signal_escalation

// All three passed → proceed with AI call
const response = await callUserAI(...);

// Tier 2 again: Output safety (before display)
const outputCheck = checkOutputContent(response.text, appWorld);
if (!outputCheck.safe) return;

// Display
session.layouts.showTextWall(response.text);
```

### 3. Lenses — Philosophy-Powered Perspectives (reference, in separate repo)
**Governance challenge:** 10 philosophy world files, proactive AI, feedback loop

```
What it does:
  User picks a voice (Stoic, Coach, NFL Coach, Monk, Hype Man, Closer).
  Taps glasses → gets philosophical perspective on the moment.
  AI auto-selects mode (translate/reflect/challenge/teach/direct).
  Follow-up, expand, redirect, dismiss — full gesture grammar.

What it demonstrates for the SDK:
  - Philosophy world file schema (the .nv-world.md format)
  - 10 world files with consistent validation
  - Proactive engine (Merge-inspired SILENT/PERSPECTIVE/ROUTE classification)
  - Auto-scaling response length (15/40/60/80 words)
  - Journal persistence via SimpleStorage
  - Mode tracking with [MODE:X] tags
  - Behavioral feedback loop (follow-through rate)
```

---

## The SDK Package Structure

```
neuroverseos-governance/
├── src/
│   ├── engine/
│   │   ├── guard-engine.ts      ← evaluateGuard() — the core
│   │   ├── simulate-engine.ts   ← rule + state evaluation
│   │   ├── bootstrap-parser.ts  ← .nv-world.md parser
│   │   ├── bootstrap-emitter.ts ← world compiler
│   │   └── ...
│   ├── adapters/
│   │   └── mentraos.ts          ← MentraGovernedExecutor
│   ├── builder/
│   │   └── lens.ts              ← lens compilation
│   ├── types.ts                 ← all TypeScript interfaces
│   └── worlds/                  ← bundled platform worlds
├── cli/
│   ├── doctor.ts                ← environment check
│   ├── validate.ts              ← world file validation
│   ├── trace.ts                 ← runtime audit log
│   ├── redteam.ts               ← adversarial testing
│   ├── lens.ts                  ← lens management
│   └── ...
└── package.json
```

**What a developer installs:**
```bash
npm install neuroverseos-governance
```

**What they get:**
- `evaluateGuard()` — the core function that checks any action against a world
- `MentraGovernedExecutor` — MentraOS-specific adapter with user rules, hardware checks
- `parseWorldMarkdown()` — .nv-world.md parser
- CLI tools: `neuroverse doctor`, `neuroverse validate`, `neuroverse trace`, `neuroverse redteam`
- TypeScript types for everything

---

## The Website Narrative (page by page)

### Page 1: Hero
**Headline:** "Govern AI without owning the model."
**Subhead:** "Open-source governance engine for AI applications. Write rules in markdown. Enforce them in code."

### Page 2: How It Works
Show the three-layer model:
```
User Rules   > Platform World > App World
(most senior)                   (least senior)
```

Show a world file snippet → compiled to governance rules → enforced at runtime.

### Page 3: The World File Format
Show a `.nv-world.md` with:
- Thesis (what this world is about)
- Invariants (what must always be true)
- Rules (if X then Y)
- Guards (block/pause/allow per intent)
- Kernel (forbidden input/output patterns)

Use the Negotiator's `behavioral-signals.nv-world.md` as the example — it's the most
compelling because the governance IS the product.

### Page 4: See It In Action — StarTalk
Walk through: "You're a Cancer with Aries rising, talking to a Taurus."

Show:
1. Two world files (cancer.nv-world.md + aries.nv-world.md) stacking
2. The system prompt that results from the merge
3. The AI response on the glasses
4. The governance checks that happened invisibly

**This is the "wow" demo.** Two personality files merge into one coherent prompt.
The governance engine decides which traits dominate. The user just taps.

### Page 5: See It In Action — Negotiator
Walk through: someone says something evasive in a meeting.

Show:
1. The proactive classifier runs (SILENT / PERSPECTIVE)
2. Governance checks BEFORE the AI call (intent + content)
3. Signal classifier enforces no_single_signal_escalation
4. AI generates insight with ~ prefix
5. Governance checks AFTER the AI response (output safety)
6. User taps → follow-through recorded in journal
7. Dashboard shows: "3 signals · 68% acted · 15m"

**This is the "trust" demo.** Every step is governed. Nothing escapes the guard.

### Page 6: Build Your Own
Quickstart:
```bash
npm install neuroverseos-governance
npx neuroverse init my-app
# Edit my-app/world.nv-world.md
npx neuroverse validate my-app
npx neuroverse doctor
```

Show the minimal code to add governance to an existing AI app:
```typescript
import { evaluateGuard } from 'neuroverseos-governance/engine/guard-engine';
import { parseWorldMarkdown } from 'neuroverseos-governance/engine/bootstrap-parser';

// Load your world
const world = parseWorldMarkdown(readFileSync('world.nv-world.md', 'utf-8'));

// Before any AI call:
const verdict = evaluateGuard({
  intent: 'ai_call',
  contentFields: { customer_input: userText },
}, world);

if (verdict.status === 'BLOCK') {
  console.log('Blocked:', verdict.reason);
} else {
  // Safe to proceed
  const response = await callAI(userText);

  // Check output too:
  const outputVerdict = evaluateGuard({
    intent: 'ai_output',
    direction: 'output',
    contentFields: { draft_reply: response },
  }, world);

  if (outputVerdict.status !== 'BLOCK') {
    display(response);
  }
}
```

**Four lines of governance.** That's the pitch.

### Page 7: CLI Tools
Show each command with real output:
- `neuroverse doctor` — environment health check
- `neuroverse validate --world ./my-app/` — world file validation
- `neuroverse trace --summary` — runtime audit log
- `neuroverse redteam --world ./my-app/` — adversarial testing
- `neuroverse lens list` — lens management
- `neuroverse lens compare --input "I'm stressed" --lenses stoic,coach,calm`

### Page 8: Open Source
GitHub links:
- `NeuroverseOS/neuroverseos-governance` — the engine
- `NeuroverseOS/lenses` — philosophy perspectives app
- `NeuroverseOS/startalk` — astrological translator app
- `NeuroverseOS/negotiator` — behavioral signal detection app

---

## What the Developer Building This Needs to Know

### The governance engine is real but underutilized
The apps use intent-level permission gating and content-level kernel checking. They do NOT
yet use the full rule evaluation engine (state tracking, gate transitions, session trust
computation). The engine supports it — the apps just don't feed it state yet. This is
documented honestly in the codebase.

### The SDK package isn't published to npm yet
Currently installed via `github:NeuroverseOS/neuroverseos-governance` in package.json.
For the website launch, it should be published as `neuroverseos-governance` on npm with
proper semver.

### The MentraOS SDK is required for the apps
The apps import from `@mentra/sdk` which requires registration at console.mentra.glass.
The governance engine itself does NOT require MentraOS — it works standalone. The website
should make this clear: governance works anywhere, the apps happen to run on MentraOS.

### The world file format is the moat
The `.nv-world.md` schema is the most novel thing in the system. It should be documented
as a standalone specification, not just as "something the apps use." Other developers
could write world files for healthcare, education, finance — any domain where AI behavior
needs governance. The format is domain-agnostic. The apps are domain-specific.

---

## Deliverables for the Website Developer

1. **SDK documentation site** — API reference for evaluateGuard, MentraGovernedExecutor,
   parseWorldMarkdown, CLI tools
2. **"Build Your Own" tutorial** — 15-minute quickstart from zero to governed AI app
3. **Example app walkthroughs** — StarTalk and Negotiator as interactive demos
4. **World file specification** — standalone doc for the .nv-world.md format
5. **GitHub README updates** — each repo needs a compelling README with screenshots
   (terminal demo output for now, glasses photos when available)

---

## The One-Line Pitch

For the governance engine:
> "Write rules in markdown. Enforce them in code."

For the apps:
> "One system. Three expressions. User-controlled adaptation."

For the platform:
> "Every app learns how you respond — and shows you the pattern."
