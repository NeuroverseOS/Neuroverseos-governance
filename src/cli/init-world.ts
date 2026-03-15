/**
 * CLI Harness: neuroverse init-world
 *
 * One-command world generation for specific use cases.
 * Currently supports: autoresearch
 *
 * Usage:
 *   neuroverse init-world autoresearch
 *   neuroverse init-world autoresearch --context "attention-free LLM architectures"
 *   neuroverse init-world autoresearch --dataset "TinyStories" --goal "lowest val_bpb"
 *   neuroverse init-world autoresearch --output ./my-research.nv-world.md
 *
 * Flags:
 *   --context <text>    Research context / topic description
 *   --dataset <name>    Dataset name for training and evaluation
 *   --goal <text>       Optimization goal (e.g., "lowest val_bpb", "highest accuracy")
 *   --metric <name>     Primary evaluation metric name (default: val_bpb)
 *   --optimize <dir>    Optimization direction: minimize or maximize (default: minimize)
 *   --compute <mins>    Compute budget in minutes (default: 1440)
 *   --output <path>     Output file path
 *
 * Exit codes:
 *   0 = SUCCESS
 *   1 = INVALID_TEMPLATE
 *   2 = FILE_EXISTS
 *   3 = ERROR
 */

import { readFileSync, existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ResearchConfig {
  context: string;
  dataset: string;
  goal: string;
  metric: string;
  optimize: 'minimize' | 'maximize';
  computeBudgetMinutes: number;
  constraints: string[];
  roles: string[];
}

interface CliArgs {
  template: string;
  config: Partial<ResearchConfig>;
  outputPath: string;
}

// ─── Argument Parsing ────────────────────────────────────────────────────────

function parseArgs(argv: string[]): CliArgs {
  const template = argv[0] || '';
  let outputPath = '';
  const config: Partial<ResearchConfig> = {};

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--context' && i + 1 < argv.length) {
      config.context = argv[++i];
    } else if (arg === '--dataset' && i + 1 < argv.length) {
      config.dataset = argv[++i];
    } else if (arg === '--goal' && i + 1 < argv.length) {
      config.goal = argv[++i];
    } else if (arg === '--metric' && i + 1 < argv.length) {
      config.metric = argv[++i];
    } else if (arg === '--optimize' && i + 1 < argv.length) {
      const dir = argv[++i];
      if (dir === 'minimize' || dir === 'maximize') {
        config.optimize = dir;
      }
    } else if (arg === '--compute' && i + 1 < argv.length) {
      config.computeBudgetMinutes = parseInt(argv[++i], 10);
    } else if (arg === '--output' && i + 1 < argv.length) {
      outputPath = argv[++i];
    }
  }

  return { template, config, outputPath };
}

// ─── Template Loading ────────────────────────────────────────────────────────

const AVAILABLE_TEMPLATES = ['autoresearch'];

function loadBaseTemplate(template: string): string {
  // Resolve paths relative to this file (works in both ESM and CJS)
  let currentDir: string;
  try {
    currentDir = dirname(fileURLToPath(import.meta.url));
  } catch {
    currentDir = __dirname;
  }

  const candidates = [
    join(currentDir, '..', 'worlds', `${template}.nv-world.md`),
    join(currentDir, 'worlds', `${template}.nv-world.md`),
    // Fallback: resolve from process.cwd()
    join(process.cwd(), 'src', 'worlds', `${template}.nv-world.md`),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, 'utf-8');
    }
  }

  throw new Error(`Template "${template}" not found. Available: ${AVAILABLE_TEMPLATES.join(', ')}`);
}

// ─── World Customization ─────────────────────────────────────────────────────

function customizeAutoresearchWorld(baseTemplate: string, config: Partial<ResearchConfig>): string {
  let output = baseTemplate;

  // Generate a world_id from the context if provided
  if (config.context) {
    const worldId = config.context
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40);
    output = output.replace(/^world_id: autoresearch$/m, `world_id: ${worldId}_research`);
    output = output.replace(/^name: Autoresearch Governance$/m, `name: ${config.context} Research`);
  }

  // Customize the thesis with research context
  if (config.context) {
    const customThesis = `Autonomous AI research loops investigating ${config.context} must operate within structured governance: experiments are reproducible, metrics are tracked, compute budgets are enforced, and agents cannot drift beyond their declared research context. A research world without constraints produces noise, not knowledge.`;
    output = output.replace(
      /^Autonomous AI research loops must operate.*$/m,
      customThesis,
    );
  }

  // Add dataset constraint to invariants
  if (config.dataset) {
    output = output.replace(
      /- `dataset_must_be_declared`[^\n]+/,
      `- \`dataset_must_be_declared\` — The dataset "${config.dataset}" must be used for training and evaluation and never changed without governance approval (structural, immutable)`,
    );
  }

  // Add architecture constraints if context implies them
  if (config.context && config.constraints && config.constraints.length > 0) {
    const constraintInvariants = config.constraints.map(
      (c, i) => `- \`custom_constraint_${i + 1}\` — ${c} (prompt, immutable)`,
    ).join('\n');
    output = output.replace(
      /- `architecture_constraints_honored`[^\n]+/,
      `- \`architecture_constraints_honored\` — If the research context declares architectural constraints, experiments must satisfy them (prompt, immutable)\n${constraintInvariants}`,
    );
  }

  // Customize metric name in description
  if (config.metric) {
    output = output.replace(
      /Best value achieved for the primary evaluation metric/g,
      `Best value achieved for ${config.metric}`,
    );
  }

  // Set compute budget
  if (config.computeBudgetMinutes) {
    output = output.replace(
      /- default: 1440\n- label: Compute Budget/,
      `- default: ${config.computeBudgetMinutes}\n- label: Compute Budget`,
    );
  }

  // Set initial best_metric_value default based on optimization direction
  if (config.optimize === 'maximize') {
    output = output.replace(
      /- default: 100\n- label: Best Metric Value/,
      '- default: -1000\n- label: Best Metric Value',
    );
  }

  return output;
}

// ─── Research Context File ───────────────────────────────────────────────────

function generateResearchContext(config: Partial<ResearchConfig>): string {
  const context: Record<string, unknown> = {
    research: {
      context: config.context || 'Define your research context',
      dataset: config.dataset || 'Define your dataset',
      goal: config.goal || 'Define your optimization goal',
      metric: {
        name: config.metric || 'val_bpb',
        optimization: config.optimize || 'minimize',
      },
    },
    roles: config.roles || [
      'hypothesis_generator',
      'experiment_runner',
      'result_evaluator',
      'critic',
    ],
    experiment_loop: {
      generate_architecture: true,
      train_model: true,
      evaluate_results: true,
      iterate: true,
    },
    state: {
      experiments_run: 0,
      best_result: null,
      architectures_tested: [],
    },
  };

  return JSON.stringify(context, null, 2);
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  try {
    const args = parseArgs(argv);

    // Validate template name
    if (!args.template) {
      process.stderr.write('Usage: neuroverse init-world <template> [options]\n\n');
      process.stderr.write('Available templates:\n');
      for (const t of AVAILABLE_TEMPLATES) {
        process.stderr.write(`  ${t}    Generate a governed research world for autonomous AI experiments\n`);
      }
      process.stderr.write('\nExample:\n');
      process.stderr.write('  neuroverse init-world autoresearch --context "attention-free LLM architectures" --dataset "TinyStories"\n');
      process.exit(1);
      return;
    }

    if (!AVAILABLE_TEMPLATES.includes(args.template)) {
      process.stderr.write(`Unknown template: "${args.template}"\n`);
      process.stderr.write(`Available: ${AVAILABLE_TEMPLATES.join(', ')}\n`);
      process.exit(1);
      return;
    }

    // Determine output path
    const worldFileName = args.config.context
      ? args.config.context
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 40) + '.nv-world.md'
      : 'research.nv-world.md';
    const outputPath = args.outputPath || `./${worldFileName}`;

    // Check for existing file
    if (existsSync(outputPath)) {
      process.stderr.write(`File already exists: ${outputPath}\n`);
      process.stderr.write('Use --output to specify a different path.\n');
      process.exit(2);
      return;
    }

    // Load and customize template
    const baseTemplate = loadBaseTemplate(args.template);
    const customized = customizeAutoresearchWorld(baseTemplate, args.config);

    // Write world file
    await writeFile(outputPath, customized, 'utf-8');

    // Write research context sidecar
    const contextPath = outputPath.replace(/\.nv-world\.md$/, '.research.json');
    await writeFile(contextPath, generateResearchContext(args.config), 'utf-8');

    // Output result
    const result = {
      created: {
        world: outputPath,
        context: contextPath,
      },
      template: args.template,
      config: {
        context: args.config.context || null,
        dataset: args.config.dataset || null,
        goal: args.config.goal || null,
        metric: args.config.metric || 'val_bpb',
        optimize: args.config.optimize || 'minimize',
        computeBudgetMinutes: args.config.computeBudgetMinutes || 1440,
      },
      nextSteps: [
        `Edit ${outputPath} to refine governance rules for your research`,
        `neuroverse bootstrap --input ${outputPath} --output ./world/ --validate`,
        `neuroverse simulate ${outputPath} --steps 5`,
        `neuroverse guard --world ./world/ < experiment.json`,
        `npx autoresearch run --world ${contextPath}`,
      ],
    };

    process.stdout.write(JSON.stringify(result, null, 2) + '\n');

    // Human-friendly summary to stderr
    process.stderr.write('\n');
    process.stderr.write(`✓ World created: ${outputPath}\n`);
    process.stderr.write(`✓ Research context: ${contextPath}\n`);
    process.stderr.write('\n');
    process.stderr.write('Next steps:\n');
    process.stderr.write(`  Compile world      neuroverse bootstrap --input ${outputPath} --output ./world/ --validate\n`);
    process.stderr.write(`  Simulate           neuroverse simulate ${outputPath} --steps 5\n`);
    process.stderr.write(`  Run autoresearch   npx autoresearch run --world ${contextPath}\n`);
    process.stderr.write(`  Launch dashboard   make dashboard\n`);
    process.stderr.write('\n');

    process.exit(0);
  } catch (e) {
    process.stderr.write(`init-world failed: ${e instanceof Error ? e.message : e}\n`);
    process.exit(3);
  }
}
