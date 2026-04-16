/**
 * @neuroverseos/governance/radiant/lenses
 *
 * Rendering lenses — the third of the three interpretation layers
 * described in radiant/PROJECT-PLAN.md. Each lens is a deterministic
 * pattern-transform plus a set of voice / vocabulary / framing rules.
 *
 * Lenses are first-class npm exports. Registering a new lens means
 * exporting its definition from this file. The `neuroverse radiant`
 * commands accept a `--lens <id>` flag and resolve it against the
 * registered set.
 *
 * Current registry:
 *   - auki-builder — Auki's vanguard leadership lens. Reason internally
 *     through Future Foresight / Narrative Dynamics / Shared Prosperity;
 *     express externally with the skill-level vocabulary inside each
 *     domain. See ./auki-builder.ts for the content.
 *
 * To add a new lens:
 *   1. Create src/radiant/lenses/<name>.ts exporting a `RenderingLens`.
 *   2. Re-export it from this file.
 *   3. Add it to `LENSES` below.
 *   4. If it's an Auki-specific lens, live alongside auki-builder here.
 *     If it's a generic OSS lens, start a fresh family.
 */

import type { RenderingLens } from '../types';
import { aukiBuilderLens } from './auki-builder';

export { aukiBuilderLens } from './auki-builder';

/**
 * Registered lenses keyed by name. Consumers (CLI, MCP server, tests)
 * resolve a lens by id through this map.
 */
export const LENSES: Readonly<Record<string, RenderingLens>> = Object.freeze({
  'auki-builder': aukiBuilderLens,
});

/**
 * Resolve a lens by id. Returns undefined if not registered — callers
 * should surface a clear error rather than silently falling back to a
 * default lens (which would violate the voice/framing enforcement).
 */
export function getLens(id: string): RenderingLens | undefined {
  return LENSES[id];
}

/**
 * List all registered lens ids. Used by `neuroverse radiant lenses list`.
 */
export function listLenses(): readonly string[] {
  return Object.freeze(Object.keys(LENSES));
}
