/**
 * @neuroverseos/governance/radiant
 *
 * Radiant — Behavioral Intelligence for Collaboration Systems.
 *
 * ExoCortex remembers what happened. Radiant understands what it means —
 * relative to your culture and strategy — and tells you what to do next.
 *
 * This module consumes the existing worldmodel pipeline (parse → compile),
 * guard engine, lens system, and signal schema exported from
 * `@neuroverseos/governance`, and layers on top:
 *
 *   - L/C/N math (LifeOS / CyberOS / NeuroVerse coherence)
 *   - actor_domain classification (life | cyber | joint)
 *   - 5 signals × 3 domains = 15 behavioral values
 *   - 5 named pattern compositions
 *   - Stateless commands: emergent, decision
 *   - Stateful (via MemoryProvider) commands: drift, evolve
 *   - Memory Palace 4-layer coding standard (compression / baselines /
 *     knowledge / synthesis) with a SQLite reference implementation
 *   - CLI entry (bin/radiant.ts) and MCP server entry (bin/radiant-mcp.ts)
 *
 * This is the **step 1 scaffolding** only. The surface listed above lands
 * across steps 2–16 documented in `radiant/PROJECT-PLAN.md` at the repo root.
 *
 * Usage (once the full surface lands):
 *   import { radiantEmergent, radiantDecision } from '@neuroverseos/governance/radiant';
 */

export const RADIANT_PACKAGE_VERSION = '0.0.0';
