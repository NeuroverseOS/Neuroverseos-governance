import { describe, it, expect, beforeEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const GUARD = join(__dirname, '..', 'skills', 'govern-my-chatbot', 'hooks', 'rulebook-guard.mjs');
const HOOKS = JSON.parse(readFileSync(join(__dirname, '..', 'hooks', 'hooks.json'), 'utf8'));

function guard(mode: string, input: unknown, raw?: string) {
  const r = spawnSync(process.execPath, [GUARD, mode], { input: raw ?? JSON.stringify(input), encoding: 'utf8' });
  return { code: r.status, out: r.stdout ? JSON.parse(r.stdout) : null };
}
const decision = (r: ReturnType<typeof guard>) => r.out?.hookSpecificOutput?.permissionDecision ?? 'none';

let project: string;
beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'nv-guard-'));
  mkdirSync(join(project, 'governance'));
  writeFileSync(join(project, 'governance', 'bot.nv-world.md'), '# Invariants\n- `a` — Never promise refunds.\n');
  writeFileSync(join(project, 'server.js'), '');
  return () => rmSync(project, { recursive: true, force: true });
});

describe('rulebook guard: asks before a change', () => {
  it.each([
    ['Edit on the rulebook', 'Edit', 'governance/bot.nv-world.md'],
    ['Write with different letter case', 'Write', 'governance/BOT.NV-WORLD.MD'],
    ['MultiEdit', 'MultiEdit', 'governance/bot.nv-world.md'],
  ])('%s', (_l, tool, file) => {
    expect(decision(guard('pre', { cwd: project, tool_name: tool, tool_input: { file_path: join(project, file) } }))).toBe('ask');
  });

  it('Edit through a symlink that points at the rulebook', () => {
    symlinkSync('bot.nv-world.md', join(project, 'governance', 'alias.md'));
    expect(decision(guard('pre', { cwd: project, tool_name: 'Edit', tool_input: { file_path: join(project, 'governance', 'alias.md') } }))).toBe('ask');
  });

  it('ignores other files', () => {
    expect(decision(guard('pre', { cwd: project, tool_name: 'Edit', tool_input: { file_path: join(project, 'server.js') } }))).toBe('none');
  });

  it.each([
    'printf "x" > governance/bot.nv-world.md',
    'cp governance/evil.txt governance/bot.nv-world.md',
    'mv governance/draft.txt governance/bot.nv-world.md',
    'mv governance/bot.nv-world.md governance/bot.md',
    "sed -i 's/Never/Always/' governance/*.md",
    'git checkout evil -- governance/',
    'rm -rf governance',
  ])('Bash: %s', (command) => {
    expect(decision(guard('pre-bash', { cwd: project, tool_name: 'Bash', tool_input: { command } }))).toBe('ask');
  });

  it.each(['npm run check-rules', 'ls governance', 'cat governance/tests.md', 'npm install', 'git status'])('Bash that only reads or runs: %s', (command) => {
    expect(decision(guard('pre-bash', { cwd: project, tool_name: 'Bash', tool_input: { command } }))).toBe('none');
  });

  it('asks when it cannot read the request (fails closed)', () => {
    expect(decision(guard('pre', null, '{not json'))).toBe('ask');
    expect(decision(guard('pre-bash', null, ''))).toBe('ask');
  });

  it('hooks.json asks if Node.js cannot run the guard', () => {
    for (const entry of HOOKS.hooks.PreToolUse) {
      const command: string = entry.hooks[0].command.replace(/^node /, 'definitely-not-node-xyz ');
      const r = spawnSync('sh', ['-c', command], { input: '{}', encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_ROOT: '/nowhere' } });
      expect(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision).toBe('ask');
    }
  });
});

describe('rulebook guard: tells the creator about a change made any other way', () => {
  const rulebook = () => join(project, 'governance', 'bot.nv-world.md');

  it('warns after a Bash step changes the rulebook without the prompt', () => {
    guard('snapshot', { cwd: project });
    writeFileSync(rulebook(), '# Invariants\n- `a` — Always promise refunds.\n');
    const r = guard('post', { cwd: project, tool_name: 'Bash', tool_input: { command: 'python3 tool.py' } });
    expect(r.out.systemMessage).toMatch(/rulebook changed by a Bash step, without the approval prompt/);
    expect(r.out.systemMessage).toContain('bot.nv-world.md');
    expect(r.out.hookSpecificOutput.additionalContext).toMatch(/ask whether to keep it/);
  });

  it('warns when the rulebook is deleted or moved away', () => {
    guard('snapshot', { cwd: project });
    rmSync(rulebook());
    expect(guard('post', { cwd: project, tool_name: 'Bash', tool_input: {} }).out.systemMessage).toMatch(/was deleted or moved/);
  });

  it('gives the usual fire-drill reminder after an approved edit', () => {
    guard('snapshot', { cwd: project });
    writeFileSync(rulebook(), '# Invariants\n- `a` — Never promise refunds or credits.\n');
    const r = guard('post', { cwd: project, tool_name: 'Edit', tool_input: { file_path: rulebook() } });
    expect(r.out.systemMessage).toMatch(/Run the fire drill/);
  });

  it('stays quiet when nothing changed', () => {
    guard('snapshot', { cwd: project });
    expect(guard('post', { cwd: project, tool_name: 'Bash', tool_input: {} }).out).toBeNull();
  });

  it('notices a change made between messages', () => {
    guard('snapshot', { cwd: project });
    writeFileSync(rulebook(), 'edited in my editor');
    expect(guard('prompt', { cwd: project }).out.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
  });
});
