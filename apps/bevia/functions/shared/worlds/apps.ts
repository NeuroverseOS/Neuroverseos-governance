// App-level world files as a map of tool → markdown.
// Each tool has its own governance world compiled at cold start.
// Loaded by governance.ts via getAppWorld(toolName).

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadAppWorld(filename: string): string {
  try {
    return readFileSync(resolve(__dirname, `../../../worlds/${filename}`), 'utf-8');
  } catch {
    return ''; // World file not found — tool runs under platform governance only
  }
}

// Map of tool name → world file markdown
// These get compiled via parseWorldMarkdown() → emitWorldDefinition()
// on first access (lazy, cached by governance.ts)
export const APP_WORLDS_MD: Record<string, string> = {
  tonecheck: loadAppWorld('unsaid.nv-world.md'),
  audit: loadAppWorld('align.nv-world.md'),
  perspectives: loadAppWorld('arena.nv-world.md'),
  replay: loadAppWorld('reflect.nv-world.md'),
  // consensus and signal don't have app worlds yet — platform governance applies
};
