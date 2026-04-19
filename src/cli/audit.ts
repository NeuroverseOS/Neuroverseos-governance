/**
 * CLI Harness: neuroverse audit
 *
 * Observe-mode counterpart to `neuroverse guard`. Reads a GuardEvent from
 * stdin (or --file), evaluates it against a world in OBSERVE MODE, and
 * emits a verdict that captures what WOULD have happened without
 * enforcing anything. Always exits 0 (observe mode never blocks).
 *
 * Use cases:
 *   - Preview how a new world would behave before flipping it to enforce
 *   - Run a replay of past activity through a newly-authored world to see
 *     what would have crossed
 *   - Build Radiant-style "crossings" reports for a team without imposing
 *     any live-run enforcement
 *
 * Usage:
 *   echo '{"intent":"deploy to prod"}' | neuroverse audit --world ./my-world/
 *   cat events.json | neuroverse audit --world ./my-world/ --multi
 *
 * Flags:
 *   --world <path>   Path to world directory or .nv-world.zip (required)
 *   --trace          Include full evaluation trace in output
 *   --level <level>  Override enforcement level (basic|standard|strict)
 *   --multi          Read a JSON array of GuardEvents and return an
 *                    array of verdicts (one per event). Default: single.
 *   --crossings-only When combined with --multi, emit only the events
 *                    whose shadowStatus != ALLOW. Good for piping to
 *                    reports / dashboards.
 */

import { evaluateGuard } from '../engine/guard-engine';
import { loadWorld } from '../loader/world-loader';
import { resolveWorldPath } from '../loader/world-resolver';
import type { GuardEvent, GuardVerdict } from '../contracts/guard-contract';
import { readStdin } from './cli-utils';

interface CliArgs {
  worldPath: string;
  trace: boolean;
  level?: 'basic' | 'standard' | 'strict';
  multi: boolean;
  crossingsOnly: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let worldPath = '';
  let trace = false;
  let level: 'basic' | 'standard' | 'strict' | undefined;
  let multi = false;
  let crossingsOnly = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--world') worldPath = argv[++i] ?? '';
    else if (a === '--trace') trace = true;
    else if (a === '--level') {
      const v = argv[++i];
      if (v === 'basic' || v === 'standard' || v === 'strict') level = v;
    } else if (a === '--multi') multi = true;
    else if (a === '--crossings-only') crossingsOnly = true;
  }

  return { worldPath, trace, level, multi, crossingsOnly };
}

function usage(): void {
  process.stderr.write(
    'Usage: neuroverse audit --world <path> [--trace] [--level basic|standard|strict] [--multi] [--crossings-only]\n' +
    '\n' +
    'Reads GuardEvent JSON from stdin. With --multi, reads a JSON array.\n' +
    'Evaluates in observe mode — no enforcement. Verdicts carry\n' +
    'shadowStatus/shadowReason for any event that would have crossed.\n',
  );
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (!args.worldPath) {
    usage();
    process.exit(1);
  }

  let world;
  try {
    const resolved = resolveWorldPath(args.worldPath);
    if (!resolved) {
      process.stderr.write(`Failed to resolve world path: ${args.worldPath}\n`);
      process.exit(1);
    }
    world = await loadWorld(resolved);
  } catch (err) {
    process.stderr.write(`Failed to load world: ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  }

  let raw = '';
  try {
    raw = await readStdin();
  } catch (err) {
    process.stderr.write(`Failed to read stdin: ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  }

  if (!raw.trim()) {
    process.stderr.write('No input on stdin. Pipe a GuardEvent or a JSON array with --multi.\n');
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`Invalid JSON on stdin: ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  }

  const options = { trace: args.trace, level: args.level, mode: 'observe' as const };

  if (args.multi) {
    if (!Array.isArray(parsed)) {
      process.stderr.write('--multi expects a JSON array on stdin.\n');
      process.exit(1);
    }
    const verdicts: GuardVerdict[] = (parsed as GuardEvent[]).map((e) =>
      evaluateGuard(e, world, options),
    );
    const out = args.crossingsOnly
      ? verdicts.filter((v) => v.shadowStatus && v.shadowStatus !== 'ALLOW')
      : verdicts;
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }

  const verdict = evaluateGuard(parsed as GuardEvent, world, options);
  process.stdout.write(JSON.stringify(verdict, null, 2) + '\n');
  // Observe mode exits 0 whether or not there was a crossing. Callers
  // who want a non-zero exit on a crossing should inspect shadowStatus
  // from the JSON output themselves.
}
