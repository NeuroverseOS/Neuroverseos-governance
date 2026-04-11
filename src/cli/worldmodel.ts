/**
 * CLI Harness: neuroverse worldmodel
 *
 * Behavioral world model toolkit — three-layer model builder.
 *
 * Usage:
 *   neuroverse worldmodel init [--name "Name"] [--output path]
 *   neuroverse worldmodel validate <source.worldmodel.md>
 *   neuroverse worldmodel explain <source.worldmodel.md> [--json]
 *   neuroverse worldmodel build <source.worldmodel.md> [--output <dir>]
 *   neuroverse worldmodel emit-world <source.worldmodel.md>
 *   neuroverse worldmodel emit-signals <source.worldmodel.md> [--json]
 *   neuroverse worldmodel emit-lenses <source.worldmodel.md> [--json]
 *   neuroverse worldmodel emit-contexts <source.worldmodel.md> [--json]
 *   neuroverse worldmodel emit-overlaps <source.worldmodel.md> [--json]
 *
 * Exit codes:
 *   0 = SUCCESS
 *   1 = FAIL (validation errors)
 *   3 = ERROR (file not found, invalid input)
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, basename, dirname, join } from 'path';
import { parseWorldModel } from '../engine/worldmodel-parser';
import {
  compileWorldModel,
  emitWorldMarkdown,
  emitSignalSchema,
  emitOverlapMap,
  emitContextsConfig,
  emitLensSuggestions,
} from '../engine/worldmodel-compiler';
import type {
  WorldModelIssue,
  ParsedWorldModel,
} from '../contracts/worldmodel-contract';

// ─── ANSI Colors ────────────────────────────────────────────────────────────

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';
const RESET = '\x1b[0m';

// ─── Usage ──────────────────────────────────────────────────────────────────

const USAGE = `
neuroverse worldmodel — Behavioral world model toolkit

  ${BOLD}This file defines how a system behaves, how that behavior
  is interpreted, and how it evolves over time.${RESET}

Commands:
  init           Scaffold a new .worldmodel.md template
  validate       Check structure and completeness
  explain        Human-readable model summary
  build          Compile to .nv-world.md + signals + overlaps + contexts + lenses
  emit-world     Emit compiled .nv-world.md to stdout
  emit-signals   Emit signal schema JSON to stdout
  emit-lenses    Emit lens suggestions JSON to stdout
  emit-contexts  Emit contextual modifiers JSON to stdout
  emit-overlaps  Emit overlap map JSON to stdout

Usage:
  neuroverse worldmodel init [--name "Name"] [--output path]
  neuroverse worldmodel validate <source.worldmodel.md> [--json]
  neuroverse worldmodel explain <source.worldmodel.md> [--json]
  neuroverse worldmodel build <source.worldmodel.md> [--output <dir>]
  neuroverse worldmodel emit-world <source.worldmodel.md>
  neuroverse worldmodel emit-signals <source.worldmodel.md> [--json]
  neuroverse worldmodel emit-lenses <source.worldmodel.md> [--json]
  neuroverse worldmodel emit-contexts <source.worldmodel.md> [--json]
  neuroverse worldmodel emit-overlaps <source.worldmodel.md> [--json]

Examples:
  neuroverse worldmodel init --name "Auki Vanguard"
  neuroverse worldmodel build ./auki-vanguard.worldmodel.md --output ./world/
  neuroverse worldmodel explain ./auki-vanguard.worldmodel.md
`.trim();

// ─── Argument Parser ────────────────────────────────────────────────────────

interface CliArgs {
  inputPath: string;
  output: string;
  name: string;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    inputPath: '',
    output: '',
    name: '',
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') {
      args.json = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--output' && i + 1 < argv.length) {
      args.output = argv[++i];
    } else if (arg === '--name' && i + 1 < argv.length) {
      args.name = argv[++i];
    } else if (!arg.startsWith('--') && !args.inputPath) {
      args.inputPath = arg;
    }
  }

  return args;
}

// ─── Issue Formatter ────────────────────────────────────────────────────────

function formatIssue(issue: WorldModelIssue): string {
  const color =
    issue.severity === 'error'
      ? RED
      : issue.severity === 'warning'
        ? YELLOW
        : DIM;
  const icon =
    issue.severity === 'error' ? 'x' : issue.severity === 'warning' ? '!' : 'i';
  const lineRef = issue.line > 0 ? `:${issue.line}` : '';
  return `  ${color}${icon}${RESET} [${issue.section}${lineRef}] ${issue.message}`;
}

// ─── File Reader Helper ─────────────────────────────────────────────────────

async function readSourceFile(inputPath: string): Promise<string> {
  const fullPath = resolve(inputPath);
  if (!existsSync(fullPath)) {
    process.stderr.write(`File not found: ${fullPath}\n`);
    process.exit(3);
  }
  return readFile(fullPath, 'utf-8');
}

/**
 * Parse and validate a source file. Returns the model or exits on fatal errors.
 */
async function loadAndParse(inputPath: string): Promise<{
  model: ParsedWorldModel;
  issues: WorldModelIssue[];
}> {
  const content = await readSourceFile(inputPath);
  const result = parseWorldModel(content);

  if (!result.model) {
    process.stderr.write(`${RED}Failed to parse ${inputPath}${RESET}\n`);
    for (const issue of result.issues) {
      process.stderr.write(formatIssue(issue) + '\n');
    }
    process.exit(1);
  }

  return { model: result.model, issues: result.issues };
}

// ─── Subcommand: init ───────────────────────────────────────────────────────

async function cmdInit(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (args.help) {
    process.stdout.write(
      'neuroverse worldmodel init — Scaffold a new .worldmodel.md template\n\n' +
        'Options:\n' +
        '  --name <name>    Model name (default: "My Behavioral Model")\n' +
        '  --output <path>  Output path (default: ./model.worldmodel.md)\n',
    );
    return;
  }

  const modelName = args.name || 'My Behavioral Model';
  const outputPath = resolve(
    args.output || `./${toFileName(modelName)}.worldmodel.md`,
  );

  if (existsSync(outputPath)) {
    process.stderr.write(`File already exists: ${outputPath}\n`);
    process.stderr.write('Use --output to specify a different path.\n');
    process.exit(1);
  }

  const template = generateScaffold(modelName);

  const dir = dirname(outputPath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  await writeFile(outputPath, template, 'utf-8');
  process.stderr.write(`${GREEN}Created${RESET} ${outputPath}\n`);
  process.stderr.write(
    `${DIM}Edit the template, then run: neuroverse worldmodel validate ${basename(outputPath)}${RESET}\n`,
  );
}

function toFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function generateScaffold(modelName: string): string {
  return `---
name: ${modelName}
version: 1.0.0
---

# Core Model Geometry
<!--
This section defines the STRUCTURE of your behavioral system.

You are defining:
- what the system is trying to achieve (mission)
- the major domains it operates within (2-4 recommended)
- the skills inside each domain
- the values that govern those skills
- what emerges when domains interact
- what identity forms when everything is aligned

Think of this as the "physics" of your system.
-->

## Mission
<!-- What is this system trying to achieve? This is not a slogan — it is the core aim. -->

Replace with your mission statement.

## Domains
<!--
Define 2-4 domains. Each domain is a mode of operating.
Each domain MUST include:
- Skills (what it can do)
- Values (how it must behave while doing it)

Domains are NOT personality traits — they are capability environments.
-->

### Domain One

#### Skills
- Replace with a capability
- Replace with another capability

#### Values
- Replace with a constraint
- Replace with another constraint

### Domain Two

#### Skills
- Replace with a capability
- Replace with another capability

#### Values
- Replace with a constraint
- Replace with another constraint

## Overlap Effects
<!--
Define what emerges when TWO domains interact well.

Format:
- Domain A + Domain B = Emergent State

These are NOT enforced rules.
These are INTERPRETIVE STATES used downstream.

They answer:
"What does it feel like / look like when these are working together?"
-->

- Domain One + Domain Two = Replace With Emergent State

## Center Identity
<!--
What does the system become when all domains are aligned?
This is the CORE IDENTITY of the system.
-->

Replace with center identity name

# Contextual Modifiers
<!--
This section defines how BEHAVIOR IS INTERPRETED differently depending on context.

These do NOT define truth.
They define how meaning changes depending on:
- who is acting
- where behavior occurs
- what phase the system is in

This is what makes the model multidimensional.
-->

## Authority Layers
<!-- Who is acting? -->
- founder
- maintainer
- contributor
- agent

## Spatial Contexts
<!-- Where is behavior happening? -->
- planning
- execution
- deployment
- governance

## Interpretation Rules
<!--
How does context change meaning?

Examples:
- ambiguity from a founder carries more risk than ambiguity from a contributor
- weak ownership in deployment is more serious than in planning
-->

- Replace with an interpretation rule

# Evolution Layer
<!--
This section defines:
- what GOOD behavior looks like
- what DRIFT looks like
- what can be OBSERVED
- how decisions should be made
- how the model EVOLVES

This is the EXECUTABLE layer.
-->

## Aligned Behaviors
<!-- What does success look like in action? -->
- Replace with an aligned behavior

## Drift Behaviors
<!-- What does misalignment look like? -->
- Replace with a drift behavior

## Signals
<!--
What can be measured or observed?

Use simple snake_case identifiers:
- clarity
- ownership
- follow_through
-->

- clarity
- ownership

## Decision Priorities
<!--
What wins when tradeoffs appear?

Format:
- preferred > secondary
-->

- quality > speed

## Evolution Conditions
<!--
When should the model adapt?

Examples:
- repeated successful behavior outside assumptions should trigger review
- persistent drift across scopes should trigger evolution proposal
-->

- Replace with an evolution condition
`;
}

// ─── Subcommand: validate ───────────────────────────────────────────────────

async function cmdValidate(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (args.help || !args.inputPath) {
    process.stdout.write(
      'neuroverse worldmodel validate <source.worldmodel.md> [--json]\n',
    );
    return;
  }

  const content = await readSourceFile(args.inputPath);
  const result = parseWorldModel(content);

  const errors = result.issues.filter(i => i.severity === 'error');
  const warnings = result.issues.filter(i => i.severity === 'warning');
  const infos = result.issues.filter(i => i.severity === 'info');

  if (args.json) {
    const summary = result.model
      ? {
          valid: errors.length === 0,
          domains: result.model.geometry.domains.length,
          overlaps: result.model.geometry.overlapEffects.length,
          signals: result.model.evolution.signals.length,
          aligned_behaviors: result.model.evolution.alignedBehaviors.length,
          drift_behaviors: result.model.evolution.driftBehaviors.length,
          priorities: result.model.evolution.decisionPriorities.length,
          errors: errors.length,
          warnings: warnings.length,
        }
      : { valid: false, errors: errors.length, warnings: warnings.length };

    process.stdout.write(
      JSON.stringify({ summary, issues: result.issues }, null, 2) + '\n',
    );
    process.exit(errors.length > 0 ? 1 : 0);
    return;
  }

  // Human-readable output
  if (errors.length === 0) {
    process.stderr.write(
      `${GREEN}Valid${RESET} ${args.inputPath}\n`,
    );
  } else {
    process.stderr.write(
      `${RED}Invalid${RESET} ${args.inputPath}\n`,
    );
  }

  if (result.model) {
    const m = result.model;
    process.stderr.write(
      `${DIM}  Domains: ${m.geometry.domains.length}  Overlaps: ${m.geometry.overlapEffects.length}  Signals: ${m.evolution.signals.length}${RESET}\n`,
    );
  }

  if (result.issues.length > 0) {
    process.stderr.write('\n');
    for (const issue of result.issues) {
      process.stderr.write(formatIssue(issue) + '\n');
    }
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

// ─── Subcommand: explain ────────────────────────────────────────────────────

async function cmdExplain(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (args.help || !args.inputPath) {
    process.stdout.write(
      'neuroverse worldmodel explain <source.worldmodel.md> [--json]\n',
    );
    return;
  }

  const { model } = await loadAndParse(args.inputPath);

  if (args.json) {
    const output = buildExplainData(model);
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    return;
  }

  // Human-readable explanation
  const out = process.stdout;

  out.write(`\n${BOLD}MODEL:${RESET} ${model.frontmatter.name} (v${model.frontmatter.version})\n\n`);

  // Core Model Geometry
  out.write(`${CYAN}${BOLD}CORE MODEL GEOMETRY${RESET}\n`);
  out.write(`  ${BOLD}Mission:${RESET} ${model.geometry.mission}\n`);

  const domainNames = model.geometry.domains.map(d => d.name).join(', ');
  out.write(
    `  ${BOLD}Domains (${model.geometry.domains.length}):${RESET} ${domainNames}\n`,
  );

  for (const domain of model.geometry.domains) {
    out.write(`\n  ${MAGENTA}${domain.name}${RESET}\n`);
    if (domain.skills.length > 0) {
      out.write(`    ${DIM}Skills:${RESET} ${domain.skills.join(', ')}\n`);
    }
    if (domain.values.length > 0) {
      out.write(`    ${DIM}Values:${RESET} ${domain.values.join(', ')}\n`);
    }
  }

  if (model.geometry.overlapEffects.length > 0) {
    out.write(`\n  ${BOLD}Overlaps (${model.geometry.overlapEffects.length}):${RESET}\n`);
    for (const o of model.geometry.overlapEffects) {
      out.write(`    ${o.domainA} + ${o.domainB} = ${GREEN}${o.effect}${RESET}\n`);
    }
  }

  if (model.geometry.centerIdentity) {
    out.write(
      `\n  ${BOLD}Center Identity:${RESET} ${GREEN}${model.geometry.centerIdentity}${RESET}\n`,
    );
  }

  // Contextual Modifiers
  out.write(`\n${CYAN}${BOLD}CONTEXTUAL MODIFIERS${RESET}\n`);
  if (model.modifiers.authorityLayers.length > 0) {
    out.write(
      `  ${BOLD}Authority:${RESET} ${model.modifiers.authorityLayers.join(', ')}\n`,
    );
  }
  if (model.modifiers.spatialContexts.length > 0) {
    out.write(
      `  ${BOLD}Spatial:${RESET} ${model.modifiers.spatialContexts.join(', ')}\n`,
    );
  }
  if (model.modifiers.interpretationRules.length > 0) {
    out.write(
      `  ${BOLD}Interpretation Rules:${RESET} ${model.modifiers.interpretationRules.length} defined\n`,
    );
    for (const rule of model.modifiers.interpretationRules) {
      out.write(`    ${DIM}- ${rule}${RESET}\n`);
    }
  }

  // Evolution Layer
  out.write(`\n${CYAN}${BOLD}EVOLUTION LAYER${RESET}\n`);
  out.write(
    `  Aligned behaviors: ${model.evolution.alignedBehaviors.length} defined\n`,
  );
  out.write(
    `  Drift behaviors:   ${model.evolution.driftBehaviors.length} defined\n`,
  );
  out.write(
    `  Signals:           ${model.evolution.signals.length} tracked\n`,
  );
  out.write(
    `  Decision priorities: ${model.evolution.decisionPriorities.length} defined\n`,
  );
  out.write(
    `  Evolution conditions: ${model.evolution.evolutionConditions.length} defined\n`,
  );

  // Narrative summary
  out.write(`\n${DIM}---${RESET}\n`);
  const overlapEffects = model.geometry.overlapEffects.map(o => o.effect).join(', ');
  out.write(
    `\nThis model operates across ${model.geometry.domains.length} domains governed by embedded values.\n`,
  );
  if (overlapEffects) {
    out.write(
      `It produces ${GREEN}${overlapEffects}${RESET} when domains interact well.\n`,
    );
  }
  if (model.evolution.driftBehaviors.length > 0) {
    const driftSample = model.evolution.driftBehaviors.slice(0, 3).join('; ');
    out.write(`Drift shows as: ${YELLOW}${driftSample}${RESET}.\n`);
  }
  if (model.geometry.centerIdentity) {
    out.write(
      `When aligned, the system becomes: ${GREEN}${BOLD}${model.geometry.centerIdentity}${RESET}.\n`,
    );
  }
  out.write('\n');
}

function buildExplainData(model: ParsedWorldModel) {
  return {
    name: model.frontmatter.name,
    version: model.frontmatter.version,
    model_id: model.frontmatter.model_id,
    geometry: {
      mission: model.geometry.mission,
      domains: model.geometry.domains.map(d => ({
        name: d.name,
        skills: d.skills,
        values: d.values,
      })),
      overlaps: model.geometry.overlapEffects.map(o => ({
        domainA: o.domainA,
        domainB: o.domainB,
        effect: o.effect,
      })),
      centerIdentity: model.geometry.centerIdentity,
    },
    modifiers: {
      authority: model.modifiers.authorityLayers,
      spatial: model.modifiers.spatialContexts,
      interpretationRules: model.modifiers.interpretationRules.length,
    },
    evolution: {
      alignedBehaviors: model.evolution.alignedBehaviors.length,
      driftBehaviors: model.evolution.driftBehaviors.length,
      signals: model.evolution.signals,
      priorities: model.evolution.decisionPriorities.length,
      evolutionConditions: model.evolution.evolutionConditions.length,
    },
  };
}

// ─── Subcommand: build ──────────────────────────────────────────────────────

async function cmdBuild(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (args.help || !args.inputPath) {
    process.stdout.write(
      'neuroverse worldmodel build <source.worldmodel.md> [--output <dir>] [--json]\n',
    );
    return;
  }

  const { model, issues } = await loadAndParse(args.inputPath);

  // Check for errors
  const errors = issues.filter(i => i.severity === 'error');
  if (errors.length > 0) {
    process.stderr.write(`${RED}Cannot build — validation errors:${RESET}\n`);
    for (const issue of errors) {
      process.stderr.write(formatIssue(issue) + '\n');
    }
    process.exit(1);
  }

  // Print warnings
  const warnings = issues.filter(i => i.severity === 'warning');
  if (warnings.length > 0) {
    process.stderr.write(`${YELLOW}Warnings:${RESET}\n`);
    for (const issue of warnings) {
      process.stderr.write(formatIssue(issue) + '\n');
    }
    process.stderr.write('\n');
  }

  // Compile
  const output = compileWorldModel(model);

  // Determine output directory
  const outputDir = resolve(
    args.output || `.neuroverse/worldmodels/${model.frontmatter.model_id}/`,
  );

  // Ensure directory exists
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  // Write all artifacts
  const worldPath = join(outputDir, `${model.frontmatter.model_id}.nv-world.md`);
  const signalsPath = join(outputDir, 'signals.json');
  const overlapsPath = join(outputDir, 'overlaps.json');
  const contextsPath = join(outputDir, 'contexts.json');
  const lensesPath = join(outputDir, 'lenses.json');

  await Promise.all([
    writeFile(worldPath, output.worldMarkdown, 'utf-8'),
    writeFile(signalsPath, JSON.stringify(output.signalSchema, null, 2) + '\n', 'utf-8'),
    writeFile(overlapsPath, JSON.stringify(output.overlapMap, null, 2) + '\n', 'utf-8'),
    writeFile(contextsPath, JSON.stringify(output.contextsConfig, null, 2) + '\n', 'utf-8'),
    writeFile(lensesPath, JSON.stringify(output.lensSuggestions, null, 2) + '\n', 'utf-8'),
  ]);

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          success: true,
          outputDir,
          files: {
            world: worldPath,
            signals: signalsPath,
            overlaps: overlapsPath,
            contexts: contextsPath,
            lenses: lensesPath,
          },
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    process.stderr.write(`${GREEN}Built${RESET} ${model.frontmatter.name}\n\n`);
    process.stderr.write(`  ${BOLD}Output:${RESET} ${outputDir}/\n`);
    process.stderr.write(`    ${basename(worldPath)}${DIM}  — executable world${RESET}\n`);
    process.stderr.write(`    signals.json${DIM}     — signal schema${RESET}\n`);
    process.stderr.write(`    overlaps.json${DIM}    — overlap map${RESET}\n`);
    process.stderr.write(`    contexts.json${DIM}    — contextual modifiers${RESET}\n`);
    process.stderr.write(`    lenses.json${DIM}      — lens suggestions${RESET}\n\n`);

    const ruleCount =
      model.evolution.driftBehaviors.length +
      model.evolution.alignedBehaviors.length +
      model.evolution.decisionPriorities.length;
    const invariantCount = model.geometry.domains.reduce(
      (sum, d) => sum + d.values.length,
      0,
    );

    process.stderr.write(
      `  ${DIM}${invariantCount} invariants, ${model.evolution.signals.length + 1} state vars, ${ruleCount} rules, 5 gates, ${model.geometry.overlapEffects.length} lenses${RESET}\n`,
    );
    process.stderr.write(
      `\n  ${DIM}Next: neuroverse bootstrap --input ${worldPath} --output ${outputDir}${RESET}\n`,
    );
  }
}

// ─── Subcommand: emit-world ─────────────────────────────────────────────────

async function cmdEmitWorld(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (args.help || !args.inputPath) {
    process.stdout.write('neuroverse worldmodel emit-world <source.worldmodel.md>\n');
    return;
  }

  const { model } = await loadAndParse(args.inputPath);
  const markdown = emitWorldMarkdown(model);

  if (args.output) {
    const dir = dirname(resolve(args.output));
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(resolve(args.output), markdown, 'utf-8');
    process.stderr.write(`${GREEN}Written${RESET} ${args.output}\n`);
  } else {
    process.stdout.write(markdown);
  }
}

// ─── Subcommand: emit-signals ───────────────────────────────────────────────

async function cmdEmitSignals(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (args.help || !args.inputPath) {
    process.stdout.write(
      'neuroverse worldmodel emit-signals <source.worldmodel.md> [--json]\n',
    );
    return;
  }

  const { model } = await loadAndParse(args.inputPath);
  const schema = emitSignalSchema(model);
  process.stdout.write(JSON.stringify(schema, null, 2) + '\n');
}

// ─── Subcommand: emit-lenses ────────────────────────────────────────────────

async function cmdEmitLenses(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (args.help || !args.inputPath) {
    process.stdout.write(
      'neuroverse worldmodel emit-lenses <source.worldmodel.md> [--json]\n',
    );
    return;
  }

  const { model } = await loadAndParse(args.inputPath);
  const lenses = emitLensSuggestions(model);
  process.stdout.write(JSON.stringify(lenses, null, 2) + '\n');
}

// ─── Subcommand: emit-contexts ──────────────────────────────────────────────

async function cmdEmitContexts(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (args.help || !args.inputPath) {
    process.stdout.write(
      'neuroverse worldmodel emit-contexts <source.worldmodel.md> [--json]\n',
    );
    return;
  }

  const { model } = await loadAndParse(args.inputPath);
  const contexts = emitContextsConfig(model);
  process.stdout.write(JSON.stringify(contexts, null, 2) + '\n');
}

// ─── Subcommand: emit-overlaps ──────────────────────────────────────────────

async function cmdEmitOverlaps(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (args.help || !args.inputPath) {
    process.stdout.write(
      'neuroverse worldmodel emit-overlaps <source.worldmodel.md> [--json]\n',
    );
    return;
  }

  const { model } = await loadAndParse(args.inputPath);
  const overlaps = emitOverlapMap(model);
  process.stdout.write(JSON.stringify(overlaps, null, 2) + '\n');
}

// ─── Main Router ────────────────────────────────────────────────────────────

export async function main(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  const subcommand = argv[0] ?? '';
  const subArgs = argv.slice(1);

  switch (subcommand) {
    case 'init':
      return cmdInit(subArgs);
    case 'validate':
      return cmdValidate(subArgs);
    case 'explain':
      return cmdExplain(subArgs);
    case 'build':
      return cmdBuild(subArgs);
    case 'emit-world':
      return cmdEmitWorld(subArgs);
    case 'emit-signals':
      return cmdEmitSignals(subArgs);
    case 'emit-lenses':
      return cmdEmitLenses(subArgs);
    case 'emit-contexts':
      return cmdEmitContexts(subArgs);
    case 'emit-overlaps':
      return cmdEmitOverlaps(subArgs);
    case '--help':
    case '-h':
    case 'help':
    case '':
      process.stdout.write(USAGE + '\n');
      break;
    default:
      process.stderr.write(`Unknown worldmodel command: "${subcommand}"\n\n`);
      process.stdout.write(USAGE + '\n');
      process.exit(1);
  }
}
