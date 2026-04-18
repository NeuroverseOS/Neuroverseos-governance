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

import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'fs';
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

${BOLD}Setup:${RESET}
  init           Scaffold a Mind Palace in the current directory

${BOLD}Stage A (voice layer):${RESET}
  think          Send a query through the worldmodel + lens → AI-framed response

${BOLD}Stage B (behavioral analysis, coming soon):${RESET}
  emergent       Pattern read on recent activity
  decision       Evaluate a specific artifact against the worldmodel
  signals        Extract signal matrix (debug)
  lenses         List or describe available rendering lenses

${BOLD}Usage:${RESET}
  neuroverse radiant init                      (scaffolds ./mind-palace/)
  neuroverse radiant init ./my-palace          (custom path)
  neuroverse radiant think --lens auki-builder --worlds ./worlds/ --query "What is our biggest risk?"
  neuroverse radiant think --lens auki-builder --worlds ./worlds/ < prompt.txt
  neuroverse radiant emergent aukiverse/posemesh --lens auki-builder --worlds ./worlds/
  neuroverse radiant emergent aukiverse/posemesh --lens auki-builder --worlds ./worlds/ --exocortex ~/exocortex/
  neuroverse radiant lenses list
  neuroverse radiant lenses describe auki-builder

${BOLD}Auto-discovery:${RESET}
  You do not need to clone the target repo.

    radiant emergent NeuroverseOS/       → probes github.com/NeuroverseOS/worlds
    radiant emergent aukiverse/posemesh  → probes github.com/aukiverse/worlds

  The scope argument itself is enough. Discovery also picks up
  ~/.neuroverse/worlds/ (personal), the org from your current clone's
  .git/config (if any), and ./worlds/ (this repo).

  Set NEUROVERSE_NO_ORG=1 to disable org probing for a single run.

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
  force: boolean;
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
    force: false,
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
      case '--force':
      case '-f':
        result.force = true;
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
 *   2. Otherwise → run full discovery (user / org-detect / scope-owner /
 *      extends / repo).
 *
 * `scopeOwner` is passed through from the CLI scope argument (e.g. the
 * "NeuroverseOS" in `radiant emergent NeuroverseOS/`). When provided,
 * discovery probes `github:<scopeOwner>/worlds` even if the current
 * directory isn't a git checkout — so the command works from anywhere,
 * no clone required.
 */
function resolveWorldmodelContent(
  explicitPath: string | undefined,
  scopeOwner?: string,
): string {
  if (explicitPath) {
    return loadWorldmodelContent(explicitPath);
  }

  const stack = discoverWorlds({
    repoDir: process.cwd(),
    scopeOwner,
  });

  if (stack.worlds.length === 0) {
    const scopeLine = scopeOwner
      ? `  3. github:${scopeOwner}/worlds (from scope arg)\n`
      : '';
    const ext = scopeOwner ? 4 : 3;
    const repo = scopeOwner ? 5 : 4;
    process.stderr.write(
      `${RED}Error:${RESET} No worldmodel found.\n` +
        `${DIM}Tried (in order):\n` +
        `  1. ~/.neuroverse/worlds/              (user tier)\n` +
        `  2. github:<owner>/worlds              (org auto-detect from git remote)\n` +
        scopeLine +
        `  ${ext}. .neuroverse/config.json extends    (explicit shared worlds)\n` +
        `  ${repo}. ./worlds/ or ./.neuroverse/worlds/ (repo tier)\n\n` +
        `Pass --worlds <dir> or set RADIANT_WORLDS to specify explicitly.\n` +
        `Or run against a <scope>/ where github.com/<scope>/worlds exists.${RESET}\n`,
    );
    process.exit(1);
  }

  // Show what got loaded so discovery isn't invisible magic.
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

  // Resolve worldmodels — explicit flag, or discovery using the scope owner
  // as a hint (so `radiant emergent NeuroverseOS/` probes NeuroverseOS/worlds
  // directly via the GitHub API, no local clone required).
  const explicitWorldsPath = args.worlds ?? process.env.RADIANT_WORLDS;
  const worldmodelContent = resolveWorldmodelContent(
    explicitWorldsPath,
    scope.owner,
  );

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

// ─── Subcommand: init ──────────────────────────────────────────────────────

const MIND_PALACE_FILES: Record<string, string> = {
  'README.md': `# Mind Palace

This is your Mind Palace — structured external memory that gives Radiant
(and any agent you wire into it) persistent context about who you are,
what you're working on, and what "on track" means for you.

Radiant reads these files before every run and writes each read back into
\`reads/\`. Over time, \`knowledge.md\` accumulates what's persisted and what
hasn't — the feedback loop that turns raw activity into named behavior.

## Files

- \`attention.md\` — what you're focused on **right now**
- \`goals.md\` — what you're working toward
- \`sprint.md\` — this week's focus
- \`identity.md\` — who you are, what you value
- \`worldmodels/\` — your thinking constitutions (drift + aligned behaviors)
- \`reads/\` — dated Radiant reads (written by \`radiant emergent\`)
- \`knowledge.md\` — accumulated pattern persistence across reads

## How to use

1. Fill in \`attention.md\`, \`goals.md\`, \`sprint.md\`, \`identity.md\` with
   your own words. A sentence each is enough to start — the files grow
   with you.
2. Edit \`worldmodels/starter.worldmodel.md\`: add a few aligned behaviors
   (what on-track looks like) and drift behaviors (what off-track looks
   like). The sharper these are, the sharper Radiant's reads.
3. Run \`neuroverse radiant emergent <owner/repo> --mind-palace .\` against
   the repo you want read. Radiant compares your stated intent (these
   files) to your observed activity (GitHub) and names the gap.

Edit freely. These files are yours.
`,

  'attention.md': `# Attention

<!--
What are you focused on RIGHT NOW? One paragraph. Updated as you shift.
This is the file an AI agent reads at the start of a session to know
what to help with today.
-->

`,

  'goals.md': `# Goals

<!--
What are you working toward? Bullet points welcome.
Longer horizon than attention — months, not days.
-->

-
`,

  'sprint.md': `# Sprint

<!--
This week's focus. What do you want to ship or finish?
Keep it short — five bullets max.
-->

-
`,

  'identity.md': `# Identity

<!--
Who are you, what do you value, how do you work?
This is the context an agent needs to not treat you like a stranger
every time. Write it in your own voice.
-->

`,

  'knowledge.md': `# Knowledge

<!--
Radiant writes accumulated pattern persistence here across reads.
Leave this file empty on day one — it fills up as \`radiant emergent\`
runs accumulate.
-->

`,

  'reads/.gitkeep': '',

  'worldmodels/starter.worldmodel.md': `# Starter Worldmodel

<!--
Your thinking constitution. Radiant reads this to understand what
"aligned" and "drift" mean for your work.

The sharper the Aligned/Drift Behaviors, the sharper Radiant's reads.
When Radiant detects something matching a drift behavior below, it
labels it with THAT name — it doesn't invent new ones.
-->

## Mission

<!-- One sentence. What are you doing in the world? -->


## Invariants

<!--
Non-negotiable rules. If a decision violates one, it's blocked.
Keep this list short — 3 to 6 items. Each should be a hard no.
-->

-

## Aligned Behaviors

<!--
What "on track" looks like. One per line, phrased as a behavior.
Radiant will use these as canonical pattern names when it sees
matching evidence in your activity.

Example:
  - ships partial-but-working features rather than waiting for the full stack
  - writes decisions down before acting on them
-->

-

## Drift Behaviors

<!--
What "off track" looks like. Same format as Aligned.
When Radiant detects drift, it will label it with these names — not
make up new ones.

Example:
  - shipping pace outruns strategic decision-making
  - architecture decisions surface without context about why
-->

-

## Signals

<!--
Observable quantities you care about. Radiant scores activity
against these — 5 to 7 is the sweet spot.

Example:
  - shipping_velocity
  - decision_ownership
  - storytelling_cadence
-->

-

## Decision Priorities

<!--
When tradeoffs appear, these resolve them. Format: "A > B".

Example:
  - correctness > speed
  - clarity > cleverness
-->

-
`,
};

async function cmdInit(args: ParsedArgs): Promise<void> {
  const targetDir = resolve(args.rest[0] ?? './mind-palace');
  const existed = existsSync(targetDir);

  if (existed && !args.force) {
    const entries = readdirSync(targetDir);
    if (entries.length > 0) {
      process.stderr.write(
        `${RED}Error:${RESET} ${targetDir} already exists and is not empty.\n` +
          `${DIM}Use --force to write into it anyway (existing files will be overwritten).${RESET}\n`,
      );
      process.exit(1);
    }
  }

  mkdirSync(targetDir, { recursive: true });
  mkdirSync(join(targetDir, 'reads'), { recursive: true });
  mkdirSync(join(targetDir, 'worldmodels'), { recursive: true });

  for (const [relPath, content] of Object.entries(MIND_PALACE_FILES)) {
    const fullPath = join(targetDir, relPath);
    mkdirSync(resolve(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');
  }

  process.stdout.write(
    `${GREEN}✓${RESET} Mind Palace scaffolded at ${BOLD}${targetDir}${RESET}\n\n` +
      `${DIM}Next steps:${RESET}\n` +
      `  1. Edit ${targetDir}/attention.md — what you're focused on right now\n` +
      `  2. Edit ${targetDir}/worldmodels/starter.worldmodel.md — add a few\n` +
      `     aligned and drift behaviors\n` +
      `  3. Run: neuroverse radiant emergent <owner/repo> \\\n` +
      `           --worlds ${targetDir}/worldmodels \\\n` +
      `           --exocortex ${targetDir}\n\n` +
      `${DIM}Files are yours. Edit freely.${RESET}\n`,
  );
}

// ─── Main router ───────────────────────────────────────────────────────────

export async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (args.help || !args.subcommand) {
    process.stdout.write(USAGE + '\n');
    return;
  }

  switch (args.subcommand) {
    case 'init':
      return cmdInit(args);
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
