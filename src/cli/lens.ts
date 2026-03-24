/**
 * CLI Harness: neuroverse lens
 *
 * Manage and preview behavioral lenses.
 *
 * Usage:
 *   neuroverse lens list                              List all built-in lenses
 *   neuroverse lens list --world <dir>                List lenses in a world file
 *   neuroverse lens preview <id>                      Preview a lens (directives + examples)
 *   neuroverse lens preview <id> --world <dir>        Preview a world lens
 *   neuroverse lens compile <id> [--json]             Compile a lens to system prompt overlay
 *   neuroverse lens compare --input "text" --lenses stoic,coach,calm
 *   neuroverse lens add --world <dir> --name "Name" --tagline "..." [options]
 *
 * Exit codes:
 *   0 = SUCCESS
 *   1 = NOT_FOUND / ERROR
 */

import {
  getLenses,
  getLens,
  compileLensOverlay,
  previewLens,
  lensesFromWorld,
  lensForRole,
} from '../builder/lens';
import type { Lens } from '../builder/lens';
import { loadWorld } from '../loader/world-loader';
import { resolveWorldPath } from './cli-utils';

// ─── ANSI ────────────────────────────────────────────────────────────────────

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const RESET = '\x1b[0m';

// ─── Subcommand: list ────────────────────────────────────────────────────────

async function cmdList(argv: string[]): Promise<void> {
  let worldPath = '';
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--world' && i + 1 < argv.length) {
      worldPath = argv[++i];
    } else if (arg === '--json') {
      json = true;
    }
  }

  let lenses: Lens[];
  let source: string;

  if (worldPath) {
    const resolved = await resolveWorldPath(worldPath);
    const world = await loadWorld(resolved);
    const worldLenses = lensesFromWorld(world);
    const builtins = getLenses();
    lenses = [...worldLenses, ...builtins];
    source = `${worldLenses.length} from world, ${builtins.length} built-in`;
  } else {
    lenses = getLenses();
    source = 'built-in';
  }

  if (json) {
    process.stdout.write(JSON.stringify(lenses.map(l => ({
      id: l.id,
      name: l.name,
      tagline: l.tagline,
      tags: l.tags,
      tone: l.tone,
      directives: l.directives.length,
      stackable: l.stackable,
      priority: l.priority,
    })), null, 2) + '\n');
    return;
  }

  process.stderr.write('\n');
  process.stderr.write(`${BOLD}  Lenses${RESET} ${DIM}(${source})${RESET}\n\n`);

  for (const lens of lenses) {
    const tags = lens.tags.length > 0 ? ` ${DIM}[${lens.tags.join(', ')}]${RESET}` : '';
    const tone = [];
    if (lens.tone.formality !== 'neutral') tone.push(lens.tone.formality);
    if (lens.tone.verbosity !== 'balanced') tone.push(lens.tone.verbosity);
    if (lens.tone.emotion !== 'neutral') tone.push(lens.tone.emotion);
    const toneStr = tone.length > 0 ? ` ${MAGENTA}${tone.join(' · ')}${RESET}` : '';

    process.stderr.write(`  ${CYAN}${BOLD}${lens.id}${RESET}  ${lens.tagline}${tags}${toneStr}\n`);
  }

  process.stderr.write('\n');
  process.stderr.write(`${DIM}  ${lenses.length} lenses available. Use "neuroverse lens preview <id>" for details.${RESET}\n\n`);
}

// ─── Subcommand: preview ─────────────────────────────────────────────────────

async function cmdPreview(argv: string[]): Promise<void> {
  let lensId = '';
  let worldPath = '';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--world' && i + 1 < argv.length) {
      worldPath = argv[++i];
    } else if (!arg.startsWith('--') && !lensId) {
      lensId = arg;
    }
  }

  if (!lensId) {
    throw new Error('Usage: neuroverse lens preview <lens-id> [--world <dir>]');
  }

  let lens: Lens | undefined;

  // Check world lenses first
  if (worldPath) {
    const resolved = await resolveWorldPath(worldPath);
    const world = await loadWorld(resolved);
    const worldLenses = lensesFromWorld(world);
    lens = worldLenses.find(l => l.id === lensId);
  }

  // Fall back to built-in
  if (!lens) {
    lens = getLens(lensId);
  }

  if (!lens) {
    throw new Error(`Lens "${lensId}" not found. Run "neuroverse lens list" to see available lenses.`);
  }

  process.stderr.write(previewLens(lens));

  // Also show directives
  process.stderr.write(`\n  ${BOLD}Directives${RESET} (${lens.directives.length}):\n\n`);
  for (const d of lens.directives) {
    process.stderr.write(`  ${GREEN}${d.scope}${RESET}\n`);
    process.stderr.write(`  ${DIM}${d.instruction}${RESET}\n\n`);
  }

  // Show tone
  const tone = lens.tone;
  process.stderr.write(`  ${BOLD}Tone${RESET}: formality=${tone.formality}, verbosity=${tone.verbosity}, emotion=${tone.emotion}, confidence=${tone.confidence}\n`);
  process.stderr.write(`  ${BOLD}Priority${RESET}: ${lens.priority}  ${BOLD}Stackable${RESET}: ${lens.stackable}\n\n`);
}

// ─── Subcommand: compile ─────────────────────────────────────────────────────

async function cmdCompile(argv: string[]): Promise<void> {
  let lensIds: string[] = [];
  let worldPath = '';
  let json = false;
  let role = '';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--world' && i + 1 < argv.length) {
      worldPath = argv[++i];
    } else if (arg === '--role' && i + 1 < argv.length) {
      role = argv[++i];
    } else if (arg === '--json') {
      json = true;
    } else if (!arg.startsWith('--')) {
      // Could be comma-separated: stoic,coach
      lensIds.push(...arg.split(',').map(s => s.trim()).filter(Boolean));
    }
  }

  if (lensIds.length === 0 && !role) {
    throw new Error('Usage: neuroverse lens compile <id,...> [--world <dir>] [--role <role>] [--json]');
  }

  const lenses: Lens[] = [];

  // If role is specified with a world, use lensForRole
  if (role && worldPath) {
    const resolved = await resolveWorldPath(worldPath);
    const world = await loadWorld(resolved);
    const lens = lensForRole(world, role);
    if (lens) lenses.push(lens);
    else throw new Error(`No lens found for role "${role}" in world.`);
  } else {
    // Resolve each lens ID
    for (const id of lensIds) {
      let lens: Lens | undefined;

      if (worldPath) {
        const resolved = await resolveWorldPath(worldPath);
        const world = await loadWorld(resolved);
        const worldLenses = lensesFromWorld(world);
        lens = worldLenses.find(l => l.id === id);
      }

      if (!lens) {
        lens = getLens(id);
      }

      if (!lens) {
        throw new Error(`Lens "${id}" not found. Run "neuroverse lens list" to see available lenses.`);
      }

      lenses.push(lens);
    }
  }

  const overlay = compileLensOverlay(lenses);

  if (json) {
    process.stdout.write(JSON.stringify({
      lenses: lenses.map(l => l.id),
      overlay: overlay.systemPromptAddition,
      directiveCount: overlay.activeDirectives.length,
      activeDirectives: overlay.activeDirectives,
    }, null, 2) + '\n');
  } else {
    process.stderr.write('\n');
    process.stderr.write(`${BOLD}  Compiled Overlay${RESET} ${DIM}(${lenses.map(l => l.id).join(' + ')})${RESET}\n\n`);
    process.stderr.write(`${DIM}  ${overlay.activeDirectives.length} directives active${RESET}\n\n`);
    // Output the actual system prompt to stdout (pipeable)
    process.stdout.write(overlay.systemPromptAddition + '\n');
  }
}

// ─── Subcommand: compare ─────────────────────────────────────────────────────

async function cmdCompare(argv: string[]): Promise<void> {
  let input = '';
  let lensIds: string[] = [];
  let worldPath = '';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input' && i + 1 < argv.length) {
      input = argv[++i];
    } else if (arg === '--lenses' && i + 1 < argv.length) {
      lensIds = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    } else if (arg === '--world' && i + 1 < argv.length) {
      worldPath = argv[++i];
    }
  }

  if (!input || lensIds.length === 0) {
    throw new Error('Usage: neuroverse lens compare --input "text" --lenses stoic,coach,calm [--world <dir>]');
  }

  process.stderr.write('\n');
  process.stderr.write(`${BOLD}  Lens Comparison${RESET}\n`);
  process.stderr.write(`${DIM}  Input: "${input}"${RESET}\n\n`);

  for (const id of lensIds) {
    let lens: Lens | undefined;

    if (worldPath) {
      const resolved = await resolveWorldPath(worldPath);
      const world = await loadWorld(resolved);
      const worldLenses = lensesFromWorld(world);
      lens = worldLenses.find(l => l.id === id);
    }

    if (!lens) {
      lens = getLens(id);
    }

    if (!lens) {
      process.stderr.write(`  ${YELLOW}${id}${RESET} — not found\n\n`);
      continue;
    }

    const overlay = compileLensOverlay([lens]);

    process.stderr.write(`  ${CYAN}${BOLD}${lens.name}${RESET} ${DIM}(${lens.tagline})${RESET}\n`);
    process.stderr.write(`  ${DIM}Tone: ${lens.tone.formality} · ${lens.tone.verbosity} · ${lens.tone.emotion} · ${lens.tone.confidence}${RESET}\n`);
    process.stderr.write(`  ${DIM}Directives: ${overlay.activeDirectives.length}${RESET}\n`);

    // Show the key behavioral directives
    for (const d of lens.directives.slice(0, 2)) {
      process.stderr.write(`  ${GREEN}>${RESET} ${DIM}${d.instruction.slice(0, 120)}${d.instruction.length > 120 ? '...' : ''}${RESET}\n`);
    }

    process.stderr.write('\n');
  }

  process.stderr.write(`${DIM}  Each lens produces a different system prompt overlay.${RESET}\n`);
  process.stderr.write(`${DIM}  Use "neuroverse lens compile <id> --json" to see the full overlay.${RESET}\n\n`);
}

// ─── Subcommand: add ─────────────────────────────────────────────────────────

async function cmdAdd(argv: string[]): Promise<void> {
  let worldPath = '';
  let name = '';
  let tagline = '';
  let id = '';
  let formality = 'neutral';
  let verbosity = 'balanced';
  let emotion = 'neutral';
  let confidence = 'balanced';
  let tags = '';
  let roles = '';
  let priority = '50';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--world' && i + 1 < argv.length) worldPath = argv[++i];
    else if (arg === '--name' && i + 1 < argv.length) name = argv[++i];
    else if (arg === '--tagline' && i + 1 < argv.length) tagline = argv[++i];
    else if (arg === '--id' && i + 1 < argv.length) id = argv[++i];
    else if (arg === '--formality' && i + 1 < argv.length) formality = argv[++i];
    else if (arg === '--verbosity' && i + 1 < argv.length) verbosity = argv[++i];
    else if (arg === '--emotion' && i + 1 < argv.length) emotion = argv[++i];
    else if (arg === '--confidence' && i + 1 < argv.length) confidence = argv[++i];
    else if (arg === '--tags' && i + 1 < argv.length) tags = argv[++i];
    else if (arg === '--roles' && i + 1 < argv.length) roles = argv[++i];
    else if (arg === '--priority' && i + 1 < argv.length) priority = argv[++i];
  }

  if (!worldPath || !name) {
    throw new Error('Usage: neuroverse lens add --world <dir> --name "Lens Name" --tagline "..." [--id custom_id] [--formality casual|neutral|formal|professional] [--verbosity terse|concise|balanced|detailed] [--emotion warm|neutral|reserved|clinical] [--confidence humble|balanced|authoritative|assertive] [--tags "tag1,tag2"] [--roles "role1,role2"] [--priority 50]');
  }

  // Generate ID from name if not provided
  if (!id) {
    id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }

  // Find the world markdown file
  const { readFile, writeFile } = await import('fs/promises');
  const { join } = await import('path');

  // Try to find the .nv-world.md file
  const possiblePaths = [
    join(worldPath, 'world.nv-world.md'),
    worldPath,
  ];

  let mdPath = '';
  let mdContent = '';
  for (const p of possiblePaths) {
    try {
      if (p.endsWith('.md')) {
        mdContent = await readFile(p, 'utf-8');
        mdPath = p;
        break;
      }
    } catch {
      // continue
    }
  }

  // Also try glob for .nv-world.md files
  if (!mdPath) {
    const { readdir } = await import('fs/promises');
    try {
      const files = await readdir(worldPath);
      const mdFile = files.find(f => f.endsWith('.nv-world.md'));
      if (mdFile) {
        mdPath = join(worldPath, mdFile);
        mdContent = await readFile(mdPath, 'utf-8');
      }
    } catch {
      // continue
    }
  }

  if (!mdPath) {
    throw new Error(`Could not find .nv-world.md file in "${worldPath}". Create a world first with "neuroverse init".`);
  }

  // Build the lens markdown
  const lensBlock = [
    '',
    `## ${id}`,
    `- name: ${name}`,
    tagline ? `- tagline: ${tagline}` : '',
    `- formality: ${formality}`,
    `- verbosity: ${verbosity}`,
    `- emotion: ${emotion}`,
    `- confidence: ${confidence}`,
    tags ? `- tags: ${tags}` : '',
    roles ? `- default_for_roles: ${roles}` : '',
    `- priority: ${priority}`,
    '',
  ].filter(Boolean).join('\n');

  // Check if # Lenses section exists
  if (mdContent.includes('# Lenses')) {
    // Append to existing section (before the next # section or end of file)
    const lensIdx = mdContent.indexOf('# Lenses');
    const nextSectionMatch = mdContent.slice(lensIdx + 1).match(/\n# [A-Z]/);
    if (nextSectionMatch && nextSectionMatch.index !== undefined) {
      const insertAt = lensIdx + 1 + nextSectionMatch.index;
      mdContent = mdContent.slice(0, insertAt) + lensBlock + '\n' + mdContent.slice(insertAt);
    } else {
      // Append to end
      mdContent = mdContent.trimEnd() + '\n' + lensBlock + '\n';
    }
  } else {
    // Add new # Lenses section at end
    mdContent = mdContent.trimEnd() + '\n\n# Lenses\n' + lensBlock + '\n';
  }

  await writeFile(mdPath, mdContent, 'utf-8');

  process.stderr.write('\n');
  process.stderr.write(`${GREEN}  Added lens "${name}" (${id}) to ${mdPath}${RESET}\n`);
  process.stderr.write(`${DIM}  Tone: ${formality} · ${verbosity} · ${emotion} · ${confidence}${RESET}\n`);
  if (roles) process.stderr.write(`${DIM}  Default for roles: ${roles}${RESET}\n`);
  process.stderr.write('\n');
  process.stderr.write(`${DIM}  Add behavioral directives by editing the file:${RESET}\n`);
  process.stderr.write(`${DIM}  > behavior_shaping: Your instruction here.${RESET}\n\n`);
}

// ─── Main Router ─────────────────────────────────────────────────────────────

const LENS_USAGE = `
neuroverse lens — Manage behavioral lenses.

Subcommands:
  list                              List available lenses
  preview <id>                      Preview a lens (directives + tone)
  compile <id,...>                  Compile lens(es) to system prompt overlay
  compare --input "text" --lenses   Compare how different lenses shape behavior
  add --world <dir> --name "Name"   Add a new lens to a world file

Flags:
  --world <dir>    World directory (for world-specific lenses)
  --json           Output as JSON
  --role <role>    Compile lens for a specific role

Examples:
  neuroverse lens list
  neuroverse lens list --json
  neuroverse lens preview stoic
  neuroverse lens compile stoic --json
  neuroverse lens compile stoic,coach
  neuroverse lens compile --world ./my-world/ --role manager
  neuroverse lens compare --input "I'm stressed" --lenses stoic,coach,calm
  neuroverse lens add --world ./world/ --name "Customer Support" --tagline "Helpful and patient" --formality casual --emotion warm
`.trim();

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const subcommand = argv[0];
  const subArgs = argv.slice(1);

  try {
    switch (subcommand) {
      case 'list':
        return await cmdList(subArgs);
      case 'preview':
        return await cmdPreview(subArgs);
      case 'compile':
        return await cmdCompile(subArgs);
      case 'compare':
        return await cmdCompare(subArgs);
      case 'add':
        return await cmdAdd(subArgs);
      case '--help':
      case '-h':
      case 'help':
      case undefined:
        process.stdout.write(LENS_USAGE + '\n');
        process.exit(0);
        break;
      default:
        process.stderr.write(`Unknown lens subcommand: "${subcommand}"\n\n`);
        process.stdout.write(LENS_USAGE + '\n');
        process.exit(1);
    }
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  }
}
