# Plan: Interactive Rule Wizard for NeuroVerse Configurator

## Problem
The if/then rules engine is fully built (state variables, triggers, effects, gates, collapse detection, simulation) but users have no guided way to discover or build these capabilities. The configurator doesn't ask about rules, state, or gates — you either know the markdown syntax or you don't.

## Solution
Add `neuroverse configure-world` — an interactive CLI wizard that walks users through building a complete governance world with state variables, if/then rules, viability gates, and collapse conditions. Uses Node.js built-in `readline` module (no new dependencies).

---

## Steps

### Step 1: Create the interactive prompt utility
**File:** `src/cli/prompt-utils.ts`

Build a small readline-based prompt library with these helpers:
- `ask(question)` → string (free text input)
- `askNumber(question, min, max)` → number
- `choose(question, options[])` → selected option
- `confirm(question)` → boolean
- `askMany(question, hint)` → string[] (keep adding until user says done)

Uses Node.js `readline` — zero new dependencies.

### Step 2: Build the state variable wizard
**File:** `src/cli/configure-world.ts` (new command file)

**Flow:**
1. "What's your world called?" → world name
2. "Describe what this world governs in one sentence" → thesis
3. "What variables describe your system's health?" → loop:
   - "Variable name?" (e.g., `customer_satisfaction`)
   - "What type?" → choose: number / boolean / enum
   - If number: "Min value?", "Max value?", "Default value?"
   - If enum: "What are the options?" (comma-separated), "Default?"
   - If boolean: "Default?" (true/false)
   - "Short description of what this measures?"
   - "Add another variable?" → loop or continue

Outputs: `state-schema.json` content in memory.

### Step 3: Build the if/then rule wizard
**Same file, next phase of the flow.**

**Flow:**
1. "Now let's define rules that change state. Rules fire when conditions are met."
2. Loop:
   - "Rule name?" (e.g., "Trust erosion from misinformation")
   - "Rule type?" → choose: structural / degradation / advantage
   - "What triggers this rule?" → sub-loop:
     - "Which variable?" → choose from declared state variables
     - "What condition?" → choose: >, <, >=, <=, ==, !=
     - "What value?" → input
     - "Add another trigger condition (AND)?" → loop or continue
   - "What happens when triggered?" → sub-loop:
     - "Which variable changes?" → choose from declared state variables
     - "How does it change?" → choose: set to (=) / multiply by (*=) / add (+=) / subtract (-=)
     - "By what value?" → input
     - "Add another effect?" → loop or continue
   - "Should this rule cause system collapse if a variable drops too low?" → if yes:
     - "Which variable?" → choose
     - "Collapse when below what value?" → input
   - "Add another rule?" → loop or continue

Outputs: rule objects matching the `rules/rule-NNN.json` schema.

### Step 4: Build the gates wizard
**Same file, next phase.**

**Flow:**
1. "Now let's define health thresholds (gates). These classify your system as THRIVING → COLLAPSED."
2. "Which variable represents overall system health?" → choose from declared state variables
3. For each status level (THRIVING, STABLE, COMPRESSED, CRITICAL, MODEL_COLLAPSES):
   - "At what threshold is the system [STATUS]?" → input number
   - Auto-suggests operator (>= for good states, <= for collapse)

Outputs: `gates.json` content.

### Step 5: Wire output to world compilation
**End of the wizard flow.**

After collecting all inputs:
1. Generate all JSON files (world.json, state-schema.json, gates.json, rules/*.json, invariants.json)
2. Write them to the output directory
3. Run existing validation (`neuroverse validate`) on the output
4. Print summary: "Created world with X state variables, Y rules, Z gates"
5. Suggest next steps: "Run `neuroverse simulate ./world/ --steps 5` to test your rules"

### Step 6: Register the command in neuroverse.ts
**File:** `src/cli/neuroverse.ts`

Add `configure-world` to the switch statement, importing and calling the new command.

### Step 7: Update `neuroverse init` to offer the wizard
**File:** `src/cli/init.ts`

After scaffolding the template, print:
```
Tip: Run `neuroverse configure-world` for an interactive wizard
that builds state variables, rules, and gates step by step.
```

### Step 8: Build, test, commit, and push
- Run `npm run build` to verify compilation
- Manually test the wizard flow
- Commit with descriptive message
- Push to `claude/neuroverge-guard-node-nsifo`

---

## Architecture Decisions

- **No new dependencies.** Node.js `readline` is sufficient for a CLI wizard. No inquirer/prompts needed.
- **Single command file.** The wizard is one linear flow — state → rules → gates → output. No need to split into multiple files beyond the prompt utility.
- **Outputs compiled JSON directly.** Skips the markdown intermediate step — the wizard knows exactly what JSON the engine expects, so it writes it directly. This avoids parse errors from generated markdown.
- **Reuses existing validation.** After generating files, runs the same validation the bootstrap pipeline uses.
- **Non-destructive.** If the output directory exists, warns before overwriting.

## Files Changed
| File | Action |
|------|--------|
| `src/cli/prompt-utils.ts` | **New** — readline prompt helpers |
| `src/cli/configure-world.ts` | **New** — interactive wizard command |
| `src/cli/neuroverse.ts` | **Edit** — register `configure-world` command |
| `src/cli/init.ts` | **Edit** — add wizard tip after scaffolding |
