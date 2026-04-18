/**
 * CLI: neuroverse radiant <subcommand>
 *
 * Radiant — behavioral intelligence for collaboration systems.
 * Subcommand family for the Radiant module of @neuroverseos/governance.
 *
 * Stage A (voice layer):
 *   neuroverse radiant think --lens <id> --worlds <dir> --query <query>
 *
 * Stage B (behavioral analysis, future):
 *   neuroverse radiant emergent <scope> --lens <id> --worlds <dir>
 *   neuroverse radiant decision <scope> <ref> --lens <id> --worlds <dir>
 *   neuroverse radiant signals <scope> --worlds <dir>
 *   neuroverse radiant drift <scope>
 *   neuroverse radiant evolve <scope>
 *   neuroverse radiant lenses list|describe <id>
 *
 * Environment:
 *   ANTHROPIC_API_KEY — required for commands that call the AI
 *   RADIANT_WORLDS    — default worlds directory (overridden by --worlds)
 *   RADIANT_LENS      — default lens id (overridden by --lens)
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, join, extname } from 'path';
import { think } from '../radiant/commands/think';
import { emergent } from '../radiant/commands/emergent';
import { createAnthropicAI } from '../radiant/core/ai';
import { parseScope } from '../radiant/core/scopes';
import { readExocortex, summarizeExocortex } from '../radiant/adapters/exocortex';
import { listLenses } from '../radiant/lenses/index';
import { discoverWorlds, formatActiveWorlds } from '../radiant/core/discovery';

// ─── ANSI codes ────────────────────────────────────────────────────────────

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

// ─── Usage ─────────────────────────────────────────────────────────────────

const USAGE = `
${BOLD}neuroverse radiant${RESET} — behavioral intelligence for collaboration systems

${BOLD}Stage A (voice layer):${RESET}
  think          Send a query through the worldmodel + lens → AI-framed response

${BOLD}Stage B (behavioral analysis, coming soon):${RESET}
  emergent       Pattern read on recent activity
  decision       Evaluate a specific artifact against the worldmodel
  signals        Extract signal matrix (debug)
  lenses         List or describe available rendering lenses

${BOLD}Usage:${RESET}
  neuroverse radiant think --lens auki-builder --worlds ./worlds/ --query "What is our biggest risk?"
  neuroverse radiant think --lens auki-builder --worlds ./worlds/ < prompt.txt
  neuroverse radiant emergent aukiverse/posemesh --lens auki-builder --worlds ./worlds/
  neuroverse radiant emergent aukiverse/posemesh --lens auki-builder --worlds ./worlds/ --exocortex ~/exocortex/
  neuroverse radiant lenses list
  neuroverse radiant lenses describe auki-builder

${BOLD}Auto-discovery:${RESET}
  If you run from inside a repo whose GitHub org has a <org>/worlds repo, the
  worldmodel loads automatically — you can omit --worlds entirely. Discovery
  also picks up ~/.neuroverse/worlds/ (personal) and ./worlds/ (this repo).
  Set NEUROVERSE_NO_ORG=1 to disable the org tier for a single run.

${BOLD}Environment:${RESET}
  ANTHROPIC_API_KEY    Required for AI commands (think, emergent, decision)
  RADIANT_WORLDS       Default worlds directory (overridden by --worlds)
  RADIANT_LENS         Default lens id (overridden by --lens)
  RADIANT_MODEL        AI model override (default: claude-sonnet-4-20250514)
  RADIANT_EXOCORTEX    Default exocortex directory (overridden by --exocortex)
`.trim();

// ─── Args parsing ──────────────────────────────────────────────────────────

interface ParsedArgs {
  subcommand: string | undefined;
  lens: string | undefined;
  worlds: string | undefined;
  query: string | undefined;
  model: string | undefined;
  exocortex: string | undefined;
  teamExocortex: string | undefined;
  view: string | undefined;
  json: boolean;
  help: boolean;
  rest: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    subcommand: undefined,
    lens: undefined,
    worlds: undefined,
    query: undefined,
    model: undefined,
    exocortex: undefined,
    teamExocortex: undefined,
    view: undefined,
    json: false,
    help: false,
    rest: [],
  };

  let i = 0;
  // First non-flag arg is the subcommand
  if (argv.length > 0 && !argv[0].startsWith('-')) {
    result.subcommand = argv[0];
    i = 1;
  }

  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case '--lens':
        result.lens = argv[++i];
        break;
      case '--worlds':
        result.worlds = argv[++i];
        break;
      case '--query':
        result.query = argv[++i];
        break;
      case '--model':
        result.model = argv[++i];
        break;
      case '--exocortex':
        result.exocortex = argv[++i];
        break;
      case '--team-exocortex':
        result.teamExocortex = argv[++i];
        break;
      case '--view':
        result.view = argv[++i];
        break;
      case '--json':
        result.json = true;
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
      default:
        result.rest.push(arg);
        break;
    }
    i++;
  }

  return result;
}

// ─── World loading ─────────────────────────────────────────────────────────

function loadWorldmodelContent(worldsPath: string): string {
  const resolved = resolve(worldsPath);

  if (!existsSync(resolved)) {
    throw new Error(`Worlds path not found: ${resolved}`);
  }

  const stat = statSync(resolved);

  if (stat.isFile()) {
    return readFileSync(resolved, 'utf-8');
  }

  if (stat.isDirectory()) {
    const files = readdirSync(resolved)
      .filter(
        (f) =>
          extname(f) === '.md' &&
          (f.endsWith('.worldmodel.md') || f.endsWith('.nv-world.md')),
      )
      .sort();

    if (files.length === 0) {
      throw new Error(
        `No .worldmodel.md or .nv-world.md files found in ${resolved}`,
      );
    }

    return files
      .map((f) => {
        const content = readFileSync(join(resolved, f), 'utf-8');
        return `<!-- worldmodel: ${f} -->\n${content}`;
      })
      .join('\n\n---\n\n');
  }

  throw new Error(`Worlds path is neither a file nor a directory: ${resolved}`);
}

/**
 * Resolve the worldmodel content for a radiant command.
 *
 * Precedence:
 *   1. Explicit --worlds flag or RADIANT_WORLDS env → load that path directly.
 *   2. Otherwise → run full discovery (user / org-detect / extends / repo).
 *
 * When discovery finds no worlds, exits with a helpful message pointing at
 * both the explicit-flag path and the discovery tiers that were tried.
 * When discovery succeeds, prints the active-worlds summary to stderr so
 * the user can see what got auto-loaded (especially the org tier).
 */
function resolveWorldmodelContent(explicitPath: string | undefined): string {
  if (explicitPath) {
    return loadWorldmodelContent(explicitPath);
  }

  const stack = discoverWorlds({ repoDir: process.cwd() });

  if (stack.worlds.length === 0) {
    process.stderr.write(
      `${RED}Error:${RESET} No worldmodel found.\n` +
        `${DIM}Tried (in order):\n` +
        `  1. ~/.neuroverse/worlds/              (user tier)\n` +
        `  2. github:<owner>/worlds              (org auto-detect from git remote)\n` +
        `  3. .neuroverse/config.json extends    (explicit shared worlds)\n` +
        `  4. ./worlds/ or ./.neuroverse/worlds/ (repo tier)\n\n` +
        `Pass --worlds <dir> or set RADIANT_WORLDS to specify explicitly.\n` +
        `Or cd into a repo in a GitHub org that has an <org>/worlds repo,\n` +
        `and discovery will find it automatically.${RESET}\n`,
    );
    process.exit(1);
  }

  // Show what got loaded so org-detect isn't invisible magic.
  process.stderr.write(`${DIM}${formatActiveWorlds(stack)}${RESET}\n\n`);
  for (const warning of stack.warnings) {
    process.stderr.write(`${YELLOW}⚠${RESET}  ${warning}\n`);
  }

  return stack.combinedContent;
}

// ─── Subcommand: think ─────────────────────────────────────────────────────

async function cmdThink(args: ParsedArgs): Promise<void> {
  // Resolve lens
  const lensId = args.lens ?? process.env.RADIANT_LENS;
  if (!lensId) {
    process.stderr.write(
      `${RED}Error:${RESET} --lens <id> or RADIANT_LENS required.\n` +
        `${DIM}Available lenses: ${listLenses().join(', ')}${RESET}\n`,
    );
    process.exit(1);
  }

  // Resolve API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    process.stderr.write(
      `${RED}Error:${RESET} ANTHROPIC_API_KEY environment variable not set.\n` +
        `${DIM}Set it to your Anthropic API key to use Radiant's AI features.${RESET}\n`,
    );
    process.exit(1);
  }

  // Resolve query — from --query flag, stdin, or rest args
  let query = args.query;
  if (!query && args.rest.length > 0) {
    query = args.rest.join(' ');
  }
  if (!query && !process.stdin.isTTY) {
    query = readFileSync(0, 'utf-8').trim();
  }
  if (!query) {
    process.stderr.write(
      `${RED}Error:${RESET} No query provided.\n` +
        `${DIM}Use --query "...", pass as trailing args, or pipe via stdin.${RESET}\n`,
    );
    process.exit(1);
  }

  // Resolve worldmodels — explicit flag or discovery (user / org / extends / repo)
  const explicitWorldsPath = args.worlds ?? process.env.RADIANT_WORLDS;
  const worldmodelContent = resolveWorldmodelContent(explicitWorldsPath);

  // Create AI adapter
  const model = args.model ?? process.env.RADIANT_MODEL;
  const ai = createAnthropicAI(apiKey, model || undefined);

  // Status to stderr (stdout reserved for the response)
  process.stderr.write(
    `${DIM}Lens:   ${lensId}${RESET}\n` +
      `${DIM}Model:  ${model ?? 'claude-sonnet-4-20250514 (default)'}${RESET}\n\n`,
  );

  // Run
  const result = await think({
    worldmodelContent,
    lensId,
    query,
    ai,
  });

  // Voice check
  if (!result.voiceClean) {
    process.stderr.write(
      `${YELLOW}Voice violations detected (${result.voiceViolations.length}):${RESET}\n`,
    );
    for (const v of result.voiceViolations) {
      process.stderr.write(
        `  ${YELLOW}⚠${RESET}  "${v.phrase}" at offset ${v.offset}\n`,
      );
    }
    process.stderr.write('\n');
  }

  // Output
  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          response: result.response,
          lens: result.lens,
          voiceClean: result.voiceClean,
          voiceViolations: result.voiceViolations,
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    process.stdout.write(result.response + '\n');
  }

  if (!result.voiceClean) {
    process.exit(2); // Non-zero but not 1 (which means arg error)
  }
}

// ─── Subcommand: emergent ──────────────────────────────────────────────────

async function cmdEmergent(args: ParsedArgs): Promise<void> {
  // Resolve scope — first positional arg after "emergent"
  const scopeStr = args.rest[0];
  if (!scopeStr) {
    process.stderr.write(
      `${RED}Error:${RESET} Scope required. Usage: neuroverse radiant emergent <owner/repo>\n`,
    );
    process.exit(1);
  }

  const scope = parseScope(scopeStr);

  // Resolve lens
  const lensId = args.lens ?? process.env.RADIANT_LENS;
  if (!lensId) {
    process.stderr.write(
      `${RED}Error:${RESET} --lens <id> or RADIANT_LENS required.\n` +
        `${DIM}Available lenses: ${listLenses().join(', ')}${RESET}\n`,
    );
    process.exit(1);
  }

  // Resolve tokens
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    process.stderr.write(
      `${RED}Error:${RESET} ANTHROPIC_API_KEY environment variable not set.\n`,
    );
    process.exit(1);
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    process.stderr.write(
      `${RED}Error:${RESET} GITHUB_TOKEN environment variable not set.\n` +
        `${DIM}Set it to a GitHub PAT with repo read access.${RESET}\n`,
    );
    process.exit(1);
  }

  // Resolve worldmodels — explicit flag or discovery (user / org / extends / repo)
  const explicitWorldsPath = args.worlds ?? process.env.RADIANT_WORLDS;
  const worldmodelContent = resolveWorldmodelContent(explicitWorldsPath);

  // Create AI adapter
  const model = args.model ?? process.env.RADIANT_MODEL;
  const ai = createAnthropicAI(anthropicKey, model || undefined);

  // Resolve view level
  const view = (args.view ?? process.env.RADIANT_VIEW ?? 'community') as 'community' | 'team' | 'full';
  const validViews = ['community', 'team', 'full'];
  if (!validViews.includes(view)) {
    process.stderr.write(
      `${RED}Error:${RESET} --view must be community, team, or full. Got "${view}".\n`,
    );
    process.exit(1);
  }

  // Resolve exocortex
  const exocortexPath = args.exocortex ?? process.env.RADIANT_EXOCORTEX;
  let exocortexStatus = 'not loaded';
  if (exocortexPath) {
    const ctx = readExocortex(exocortexPath);
    exocortexStatus = summarizeExocortex(ctx);
  }

  // Status
  process.stderr.write(
    `${DIM}Scope:      ${scope.type === 'org' ? scope.owner + ' (entire org)' : scope.owner + '/' + scope.repo}${RESET}\n` +
      `${DIM}View:       ${view}${RESET}\n` +
      `${DIM}Lens:       ${lensId}${RESET}\n` +
      `${DIM}Model:      ${model ?? 'claude-sonnet-4-20250514 (default)'}${RESET}\n` +
      `${DIM}ExoCortex:  ${exocortexStatus}${RESET}\n` +
      `${DIM}Fetching activity...${RESET}\n\n`,
  );

  // Run the full pipeline
  const result = await emergent({
    scope,
    githubToken,
    worldmodelContent,
    lensId,
    ai,
    windowDays: 14,
    exocortexPath: exocortexPath || undefined,
  });

  // Voice check warnings
  if (!result.voiceClean) {
    process.stderr.write(
      `${YELLOW}Voice violations (${result.voiceViolations.length}):${RESET}\n`,
    );
    for (const v of result.voiceViolations) {
      process.stderr.write(
        `  ${YELLOW}⚠${RESET}  "${v.phrase}" at offset ${v.offset}\n`,
      );
    }
    process.stderr.write('\n');
  }

  // Output
  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          text: result.text,
          frontmatter: result.frontmatter,
          scores: result.scores,
          eventCount: result.eventCount,
          voiceClean: result.voiceClean,
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    process.stdout.write(result.text + '\n');
  }
}

// ─── Subcommand: lenses ────────────────────────────────────────────────────

async function cmdLenses(args: ParsedArgs): Promise<void> {
  const subSub = args.rest[0];

  if (!subSub || subSub === 'list') {
    const ids = listLenses();
    if (ids.length === 0) {
      process.stdout.write('No lenses registered.\n');
    } else {
      for (const id of ids) {
        process.stdout.write(`${id}\n`);
      }
    }
    return;
  }

  if (subSub === 'describe') {
    const { getLens } = await import('../radiant/lenses/index');
    const id = args.rest[1];
    if (!id) {
      process.stderr.write(`${RED}Error:${RESET} Lens id required.\n`);
      process.exit(1);
    }
    const lens = getLens(id);
    if (!lens) {
      process.stderr.write(
        `${RED}Error:${RESET} Lens "${id}" not found.\n` +
          `${DIM}Available: ${listLenses().join(', ')}${RESET}\n`,
      );
      process.exit(1);
    }
    process.stdout.write(`${BOLD}${lens.name}${RESET}\n`);
    process.stdout.write(`${lens.description}\n\n`);
    process.stdout.write(
      `${BOLD}Domains:${RESET} ${lens.primary_frame.domains.join(', ')}\n`,
    );
    process.stdout.write(
      `${BOLD}Overlaps:${RESET} ${lens.primary_frame.overlaps.map((o) => o.emergent_state).join(', ')}\n`,
    );
    process.stdout.write(
      `${BOLD}Center:${RESET} ${lens.primary_frame.center_identity}\n`,
    );
    process.stdout.write(
      `${BOLD}Forbidden phrases:${RESET} ${lens.forbidden_phrases.length}\n`,
    );
    process.stdout.write(
      `${BOLD}Vocabulary terms:${RESET} ${lens.vocabulary.proper_nouns.length} proper nouns, ${Object.keys(lens.vocabulary.preferred).length} substitutions\n`,
    );
    process.stdout.write(
      `${BOLD}Exemplars:${RESET} ${lens.exemplar_refs.length}\n`,
    );
    return;
  }

  process.stderr.write(
    `${RED}Error:${RESET} Unknown lenses subcommand "${subSub}".\n` +
      `${DIM}Use: lenses list | lenses describe <id>${RESET}\n`,
  );
  process.exit(1);
}

// ─── Main router ───────────────────────────────────────────────────────────

export async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (args.help || !args.subcommand) {
    process.stdout.write(USAGE + '\n');
    return;
  }

  switch (args.subcommand) {
    case 'think':
      return cmdThink(args);
    case 'lenses':
      return cmdLenses(args);
    case 'emergent':
      return cmdEmergent(args);
    case 'mcp': {
      const { startRadiantMcp } = await import('../radiant/mcp/server');
      return startRadiantMcp(argv);
    }
    case 'decision':
    case 'signals':
    case 'drift':
    case 'evolve':
      process.stderr.write(
        `${DIM}neuroverse radiant ${args.subcommand} is not yet implemented.${RESET}\n`,
      );
      process.exit(1);
      break;
    default:
      process.stderr.write(
        `${RED}Unknown radiant subcommand: "${args.subcommand}"${RESET}\n\n`,
      );
      process.stdout.write(USAGE + '\n');
      process.exit(1);
  }
}
