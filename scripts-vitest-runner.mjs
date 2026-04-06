#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const passthroughArgs = process.argv.slice(2).filter(arg => arg !== '--runInBand');

if (process.argv.includes('--runInBand')) {
  process.stderr.write('[neuroverse] Ignoring unsupported Vitest flag: --runInBand\n');
}

const result = spawnSync('vitest', ['run', ...passthroughArgs], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
  process.exit(1);
}

process.exit(result.status ?? 1);
