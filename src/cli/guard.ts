/**
 * CLI Harness: neuroverse guard
 *
 * Reads a GuardEvent from stdin (JSON).
 * Evaluates it against a loaded WorldDefinition.
 * Writes a GuardVerdict to stdout (JSON).
 * Exits with status code: 0=ALLOW, 1=BLOCK, 2=PAUSE, 3=ERROR.
 *
 * Usage:
 *   echo '{"intent":"delete all user data"}' | neuroverse guard --world ./my-world/
 *   echo '{"intent":"read config"}' | neuroverse guard --world ./my-world/ --trace
 *   echo '{"intent":"deploy to prod"}' | neuroverse guard --world ./my-world/ --level strict
 *   echo '{"intent":"send reply","contentFields":{"customer_input":"Where is my order?","draft_reply":"I am escalating your request"}}' | neuroverse guard --world ./my-world/ --ai-classify
 *
 * Flags:
 *   --world <path>   Path to world directory or .nv-world.zip (required)
 *   --trace          Include full evaluation trace in output
 *   --level <level>  Override enforcement level (basic|standard|strict)
 *   --ai-classify    Use AI to classify intent before guard evaluation
 *                    Requires NEUROVERSE_AI_API_KEY env var (or configured AI provider)
 */

import { evaluateGuard } from '../engine/guard-engine';
import { evaluateGuardWithAI } from '../engine/ai-guard';
import { loadWorld } from '../loader/world-loader';
import { resolveWorldPath, describeActiveWorld } from '../loader/world-resolver';
import { GUARD_EXIT_CODES } from '../contracts/guard-contract';
import type { GuardEvent, GuardEngineOptions, GuardExitCode } from '../contracts/guard-contract';
import type { AIProviderConfig } from '../contracts/derive-contract';
import { readStdin } from './cli-utils';

// ─── Argument Parsing ────────────────────────────────────────────────────────

interface CliArgs {
  worldPath: string;
  trace: boolean;
  level?: 'basic' | 'standard' | 'strict';
  aiClassify: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let worldPath = '';
  let trace = false;
  let level: 'basic' | 'standard' | 'strict' | undefined;
  let aiClassify = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--world' && i + 1 < argv.length) {
      worldPath = argv[++i];
    } else if (arg === '--trace') {
      trace = true;
    } else if (arg === '--ai-classify') {
      aiClassify = true;
    } else if (arg === '--level' && i + 1 < argv.length) {
      const val = argv[++i];
      if (val === 'basic' || val === 'standard' || val === 'strict') {
        level = val;
      } else {
        throw new Error(`Invalid level: "${val}". Must be basic, standard, or strict.`);
      }
    }
  }

  return { worldPath, trace, level, aiClassify };
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  try {
    const args = parseArgs(argv);

    // Resolve world path (--world flag, env var, active world, or auto-detect)
    const worldPath = resolveWorldPath(args.worldPath);
    if (!worldPath) {
      throw new Error(
        'No world specified. Use --world <path>, set NEUROVERSE_WORLD, or run `neuroverse world use <name>`',
      );
    }

    // Show which world is being used (stderr so it doesn't pollute JSON output)
    const worldInfo = describeActiveWorld(args.worldPath);
    if (worldInfo) {
      process.stderr.write(`Using world: ${worldInfo.name}\n`);
    }

    // Read event from stdin
    const input = await readStdin();
    if (!input.trim()) {
      const errorResult = {
        error: 'No input on stdin. Pipe a JSON GuardEvent.',
        usage: 'echo \'{"intent":"..."}\'  | neuroverse guard --world <path>',
      };
      process.stdout.write(JSON.stringify(errorResult, null, 2) + '\n');
      process.exit(GUARD_EXIT_CODES.ERROR);
    }

    let event: GuardEvent;
    try {
      event = JSON.parse(input);
    } catch (e) {
      const errorResult = { error: 'Invalid JSON on stdin', detail: String(e) };
      process.stdout.write(JSON.stringify(errorResult, null, 2) + '\n');
      process.exit(GUARD_EXIT_CODES.ERROR);
    }

    // Validate event has intent
    if (!event.intent) {
      const errorResult = { error: 'GuardEvent must have an "intent" field' };
      process.stdout.write(JSON.stringify(errorResult, null, 2) + '\n');
      process.exit(GUARD_EXIT_CODES.ERROR);
    }

    // Load world
    const world = await loadWorld(worldPath);

    // Evaluate — with or without AI classification
    let verdict;
    if (args.aiClassify) {
      const aiConfig = resolveAIConfig();
      if (!aiConfig) {
        const errorResult = {
          error: 'AI classification requires an API key. Set NEUROVERSE_AI_API_KEY and optionally NEUROVERSE_AI_MODEL, NEUROVERSE_AI_ENDPOINT.',
        };
        process.stdout.write(JSON.stringify(errorResult, null, 2) + '\n');
        process.exit(GUARD_EXIT_CODES.ERROR);
      }
      process.stderr.write('AI intent classification enabled\n');
      verdict = await evaluateGuardWithAI(event, world, {
        trace: args.trace,
        level: args.level,
        ai: aiConfig,
        contentFields: event.contentFields,
      });
    } else {
      const options: GuardEngineOptions = { trace: args.trace, level: args.level };
      verdict = evaluateGuard(event, world, options);
    }

    // Output
    process.stdout.write(JSON.stringify(verdict, null, 2) + '\n');
    const exitCode: GuardExitCode = GUARD_EXIT_CODES[verdict.status];
    process.exit(exitCode);
  } catch (e) {
    const errorResult = { error: 'Guard evaluation failed', detail: String(e) };
    process.stderr.write(JSON.stringify(errorResult, null, 2) + '\n');
    process.exit(GUARD_EXIT_CODES.ERROR);
  }
}

// ─── AI Config Resolution ────────────────────────────────────────────────────

function resolveAIConfig(): AIProviderConfig | null {
  const apiKey = process.env.NEUROVERSE_AI_API_KEY;
  if (!apiKey) return null;

  return {
    provider: 'openai',
    model: process.env.NEUROVERSE_AI_MODEL ?? 'gpt-4o-mini',
    apiKey,
    endpoint: process.env.NEUROVERSE_AI_ENDPOINT ?? null,
  };
}
