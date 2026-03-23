/**
 * Interactive CLI prompt utilities using Node.js readline.
 * Zero external dependencies.
 */

import * as readline from 'readline';

let rl: readline.Interface | null = null;

function getRL(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr, // prompts go to stderr, data to stdout
      terminal: true,
    });
  }
  return rl;
}

export function closePrompts(): void {
  if (rl) {
    rl.close();
    rl = null;
  }
}

/** Ask a free-text question. Returns trimmed answer. */
export function ask(question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  return new Promise((resolve) => {
    getRL().question(`\n  ${question}${suffix}: `, (answer) => {
      const val = answer.trim();
      resolve(val || defaultValue || '');
    });
  });
}

/** Ask a yes/no question. */
export function confirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  return new Promise((resolve) => {
    getRL().question(`\n  ${question} ${hint}: `, (answer) => {
      const val = answer.trim().toLowerCase();
      if (val === '') resolve(defaultYes);
      else resolve(val === 'y' || val === 'yes');
    });
  });
}

/** Show numbered options. Returns the selected option string. */
export function choose(question: string, options: string[]): Promise<string> {
  return new Promise((resolve) => {
    const r = getRL();
    r.write(`\n  ${question}\n`);
    options.forEach((opt, i) => r.write(`    ${i + 1}. ${opt}\n`));
    r.question(`  Choice [1-${options.length}]: `, (answer) => {
      const idx = parseInt(answer.trim(), 10) - 1;
      if (idx >= 0 && idx < options.length) {
        resolve(options[idx]);
      } else {
        // Default to first option
        resolve(options[0]);
      }
    });
  });
}

/** Collect multiple items in a loop. Returns array of strings. */
export async function askMany(question: string, hint?: string): Promise<string[]> {
  const items: string[] = [];
  const hintText = hint ? ` (${hint})` : '';

  process.stderr.write(`\n  ${question}${hintText}\n`);
  process.stderr.write('  Enter items one at a time. Empty line to finish.\n');

  while (true) {
    const item = await ask(`  ${items.length + 1}.`);
    if (!item) break;
    items.push(item);
  }
  return items;
}

/** Print a section header to stderr. */
export function heading(text: string): void {
  process.stderr.write(`\n${'─'.repeat(60)}\n`);
  process.stderr.write(`  ${text}\n`);
  process.stderr.write(`${'─'.repeat(60)}\n`);
}

/** Print a summary block. */
export function summary(label: string, items: string[]): void {
  process.stderr.write(`\n  ${label}:\n`);
  items.forEach((item) => process.stderr.write(`    • ${item}\n`));
}

/** Print an informational message. */
export function info(text: string): void {
  process.stderr.write(`  ${text}\n`);
}
