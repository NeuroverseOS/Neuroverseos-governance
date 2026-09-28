#!/usr/bin/env node
/**
 * Rulebook guard: the govern-my-chatbot skill's own governance, enforced by
 * code outside Claude.
 *
 * The skill's first rule is that nothing goes into a creator's rulebook
 * without their approval. Asking Claude to follow that rule would be a wish;
 * this hook makes Claude Code enforce it, in two layers:
 *
 *   Ask first. Before Claude's edit tools change a rulebook (*.nv-world.md,
 *     any letter case, including through a symlink), and before any shell
 *     command that names a rulebook or writes into a rulebook's folder,
 *     Claude Code must ask the creator, even if they've told it to accept
 *     edits automatically.
 *
 *   Tell after. A shell command can change a file in ways no check can
 *     predict (a script, a wildcard, a program). So the hook also keeps a
 *     fingerprint of every rulebook, and after every step (and every time the
 *     creator sends a message) it compares. If a rulebook changed in any way
 *     other than an approved edit, the creator is told which file changed and
 *     Claude is told to show them exactly what changed.
 *
 * Modes (argv[2]):  pre (Write/Edit/MultiEdit/NotebookEdit)  pre-bash (Bash)
 *                   post (after those tools)  prompt (UserPromptSubmit)
 *                   snapshot (SessionStart)
 *
 * It fails closed: if it can't read the request, the "pre" modes ask. If
 * Node.js itself can't run, hooks.json falls back to asking.
 *
 * What it touches: it reads the tool request Claude Code sends it and the
 * rulebook files in the project, and it stores only their fingerprints
 * (SHA-256 hashes, no content) in a temp folder. No network connections.
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join, relative, resolve } from 'path';

const mode = process.argv[2];
const RULEBOOK = /\.nv-world\.md$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.cache']);
// Shell operations that can write, move, delete, or restore files.
const WRITES = /(^|[^<])>|\btee\b|\bsed\b[^|;&]*\s-i|\bperl\b[^|;&]*\s-i|\b(mv|cp|rm|ln|install|rsync|truncate|dd|touch|unzip|tar)\b|\bgit\s+(checkout|restore|reset|stash|apply|am|merge|rebase|pull|mv|rm)\b/;

const ask = (event, reason) =>
  JSON.stringify({ hookSpecificOutput: { hookEventName: event, permissionDecision: 'ask', permissionDecisionReason: reason } });

function done(output) {
  if (output) process.stdout.write(output);
  process.exit(0);
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let request;
  try {
    request = JSON.parse(raw);
  } catch {
    // Can't tell what's being changed: ask rather than let it through.
    if (mode === 'pre') done(ask('PreToolUse', "The rulebook guard couldn't read this request, so Claude Code is asking before this change."));
    if (mode === 'pre-bash') done(ask('PreToolUse', "The rulebook guard couldn't read this command, so Claude Code is asking before running it."));
    done();
  }
  try {
    run(request);
  } catch (err) {
    if (mode === 'pre' || mode === 'pre-bash') {
      done(ask('PreToolUse', `The rulebook guard hit an error (${err?.message ?? err}), so Claude Code is asking first.`));
    }
    done();
  }
});

// ─── Which files are rulebooks ────────────────────────────────────────────

function isRulebookPath(path) {
  if (!path) return false;
  if (RULEBOOK.test(String(path))) return true;
  try {
    return RULEBOOK.test(realpathSync(String(path))); // a symlink pointing at a rulebook
  } catch {
    return false;
  }
}

/** Every rulebook under the project folder (bounded walk). */
function findRulebooks(root) {
  const found = [];
  let budget = 20000;
  const walk = (dir, depth) => {
    if (depth > 6 || budget <= 0) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (--budget <= 0) return;
      const p = join(dir, e.name);
      if (e.isDirectory() && !SKIP_DIRS.has(e.name)) walk(p, depth + 1);
      else if ((e.isFile() || e.isSymbolicLink()) && RULEBOOK.test(e.name)) found.push(p);
    }
  };
  walk(root, 0);
  return found;
}

// ─── Fingerprints ─────────────────────────────────────────────────────────

function fingerprints(root) {
  const out = {};
  for (const p of findRulebooks(root)) {
    try {
      out[relative(root, p)] = createHash('sha256').update(readFileSync(p)).digest('hex');
    } catch {
      out[relative(root, p)] = 'unreadable';
    }
  }
  return out;
}

function snapshotFile(root) {
  const dir = join(tmpdir(), 'govern-my-chatbot');
  mkdirSync(dir, { recursive: true });
  return join(dir, createHash('sha256').update(resolve(root)).digest('hex').slice(0, 16) + '.json');
}

function loadSnapshot(root) {
  try {
    return JSON.parse(readFileSync(snapshotFile(root), 'utf8'));
  } catch {
    return null;
  }
}

function saveSnapshot(root, prints) {
  writeFileSync(snapshotFile(root), JSON.stringify(prints));
}

function changedSince(before, after) {
  if (!before) return [];
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...names].filter((n) => before[n] !== after[n]).map((n) => ({
    file: n,
    how: !(n in after) ? 'was deleted or moved' : !(n in before) ? 'was created' : 'was changed',
  }));
}

// ─── Modes ────────────────────────────────────────────────────────────────

function run(request) {
  const root = request?.cwd || process.cwd();
  const input = request?.tool_input ?? {};

  if (mode === 'snapshot') {
    saveSnapshot(root, fingerprints(root));
    done();
  }

  if (mode === 'pre') {
    const filePath = input.file_path ?? input.notebook_path ?? '';
    if (!isRulebookPath(filePath)) done();
    done(
      ask(
        'PreToolUse',
        `This changes your chatbot's rulebook (${basename(String(filePath))}). Nothing goes into your ` +
          "rulebook without your approval. Read the change, then say yes only if it's what you want.",
      ),
    );
  }

  if (mode === 'pre-bash') {
    const command = String(input.command ?? '');
    const books = findRulebooks(root);
    const folders = [...new Set(books.map((p) => relative(root, dirname(p))).filter((d) => d && d !== '.'))];
    const namesRulebook = /nv-world/i.test(command);
    const writesNearRulebook = WRITES.test(command) && folders.some((f) => command.includes(f));
    if (!namesRulebook && !writesNearRulebook) done();
    done(
      ask(
        'PreToolUse',
        `This command could change your chatbot's rulebook${books.length === 1 ? ` (${basename(books[0])})` : ''}. ` +
          "Nothing goes into your rulebook without your approval. Read the command, then say yes only if it's what you want.",
      ),
    );
  }

  if (mode === 'post' || mode === 'prompt') {
    const after = fingerprints(root);
    const before = loadSnapshot(root);
    saveSnapshot(root, after);
    const changes = changedSince(before, after);
    if (changes.length === 0) done();

    const list = changes.map((c) => `${c.file} ${c.how}`).join('; ');
    const tool = request?.tool_name;
    const viaApprovedEdit =
      mode === 'post' &&
      ['Write', 'Edit', 'MultiEdit'].includes(tool) &&
      changes.length === 1 &&
      isRulebookPath(input.file_path) &&
      resolve(root, changes[0].file) === resolve(root, String(input.file_path));

    if (viaApprovedEdit) {
      done(
        JSON.stringify({
          systemMessage: `Your rulebook changed (${changes[0].file}). Run the fire drill to make sure your rules still hold: npm run check-rules`,
          hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext:
              `The creator's rulebook ${changes[0].file} was just changed. Tell them in plain words what changed and why, ` +
              'then run `npm run check-rules` if the project has it and walk them through the result.',
          },
        }),
      );
    }

    const where = mode === 'prompt' ? 'since Claude last worked on it (for example, in your editor)' : `by a ${tool ?? 'tool'} step, without the approval prompt`;
    done(
      JSON.stringify({
        systemMessage:
          `Heads up: your rulebook changed ${where}: ${list}. ` +
          (existsSync(join(root, '.git')) ? `See exactly what changed with: git diff -- ${changes.map((c) => c.file).join(' ')}` : 'Open it and check the change.'),
        hookSpecificOutput: {
          hookEventName: mode === 'prompt' ? 'UserPromptSubmit' : 'PostToolUse',
          additionalContext:
            `The creator's rulebook changed ${where}: ${list}. ` +
            (mode === 'prompt'
              ? 'If the creator made this change, confirm it with them and offer to run the fire drill (npm run check-rules).'
              : 'Nothing may go into the rulebook without their approval. Stop, show them exactly what changed ' +
                '(for example with git diff), and ask whether to keep it. If they say no, restore the previous version.'),
        },
      }),
    );
  }

  done();
}

