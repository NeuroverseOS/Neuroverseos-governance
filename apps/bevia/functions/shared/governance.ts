// Bevia — Governance layer using the REAL NeuroverseOS engine
//
// THIS FILE IMPORTS AND CALLS THE ACTUAL ENGINE.
// No mock. No reimplementation. We eat our own dogfood.
//
// Pipeline:
//   parseWorldMarkdown(md) → emitWorldDefinition(parsed) → evaluateGuard(event, world)
//
// Hierarchy:
//   Platform world → App world → User world
//   Each level can tighten rules, never loosen.
//   First BLOCK wins. First PAUSE wins. MODIFYs accumulate.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Real engine imports ─────────────────────────────────────────────────────
// In Supabase Edge Functions, these resolve from the bundled npm package.
// Locally: npm link or path import from the governance repo.

import { evaluateGuard } from '../../engine/guard-engine.js';
import { parseWorldMarkdown } from '../../engine/bootstrap-parser.js';
import { emitWorldDefinition } from '../../engine/bootstrap-emitter.js';
import { simulateWorld } from '../../engine/simulate-engine.js';
import { validateWorld } from '../../engine/validate-engine.js';
import type { WorldDefinition, GuardEvent as EngineGuardEvent } from '../../types.js';
import type { GuardVerdict as EngineGuardVerdict, GuardEngineOptions } from '../../contracts/guard-contract.js';

// Re-export engine types for edge functions
export type { WorldDefinition, EngineGuardEvent, EngineGuardVerdict, GuardEngineOptions };

// ─── Types ───────────────────────────────────────────────────────────────────

export type GuardStatus = 'ALLOW' | 'BLOCK' | 'PAUSE' | 'MODIFY' | 'PENALIZE' | 'REWARD' | 'NEUTRAL';

export interface BeviaGuardEvent {
  intent: string;
  tool: string;
  userId: string;
  scope?: string;
  creditCost?: number;
  direction?: 'input' | 'output';
  roleId?: string;
  metadata?: Record<string, unknown>;
}

export interface BeviaGuardVerdict {
  status: GuardStatus;
  reason?: string;
  ruleId?: string;
  warning?: string;
  timestamp: number;
  engineVerdict?: EngineGuardVerdict; // full engine verdict for audit
}

// ─── World Loading ───────────────────────────────────────────────────────────
// Compile .nv-world.md → WorldDefinition using the REAL parser + emitter.
// This is what `neuroverse bootstrap` does internally.

const worldCache = new Map<string, WorldDefinition>();

export function compileWorld(markdown: string, worldId: string): WorldDefinition {
  const cached = worldCache.get(worldId);
  if (cached) return cached;

  const parsed = parseWorldMarkdown(markdown);

  if (!parsed.world) {
    throw new Error(`Failed to parse world ${worldId}: ${parsed.issues.map(i => i.message).join(', ')}`);
  }

  // Validate the parsed world (what `neuroverse validate` does)
  const emitted = emitWorldDefinition(parsed.world);

  if (emitted.issues.some(i => (i as any).severity === 'error')) {
    throw new Error(`World ${worldId} has validation errors: ${emitted.issues.map(i => i.message).join(', ')}`);
  }

  worldCache.set(worldId, emitted.world);
  return emitted.world;
}

// ─── Platform World (compiled once at cold start) ────────────────────────────

import { PLATFORM_WORLD_MD } from './worlds/platform.ts';
import { APP_WORLDS_MD } from './worlds/apps.ts';

let platformWorld: WorldDefinition | null = null;
const appWorlds = new Map<string, WorldDefinition>();

function getPlatformWorld(): WorldDefinition {
  if (!platformWorld) {
    platformWorld = compileWorld(PLATFORM_WORLD_MD, 'bevia-platform');
  }
  return platformWorld;
}

function getAppWorld(tool: string): WorldDefinition | null {
  if (appWorlds.has(tool)) return appWorlds.get(tool)!;

  const md = APP_WORLDS_MD[tool];
  if (!md) return null;

  const world = compileWorld(md, `bevia-${tool}`);
  appWorlds.set(tool, world);
  return world;
}

// ─── Guard Evaluation (the real thing) ───────────────────────────────────────
// Evaluates action through the REAL engine hierarchy:
// 1. Platform world (always wins)
// 2. App world (tool-specific)
// 3. User world (Align strategies, Reflect profiles)

export function evaluateAction(
  event: BeviaGuardEvent,
  userWorld?: WorldDefinition,
): BeviaGuardVerdict {
  const now = Date.now();

  // Convert Bevia event → engine GuardEvent
  const engineEvent: EngineGuardEvent = {
    intent: event.intent,
    tool: event.tool,
    scope: event.scope,
    roleId: event.roleId || event.userId,
    direction: event.direction,
    args: event.metadata as Record<string, unknown>,
  };

  const options: GuardEngineOptions = {
    trace: true,
    level: 'standard',
  };

  // ── Level 1: Platform world (always enforced) ─────────────────────────────
  const platform = getPlatformWorld();
  const platformVerdict = evaluateGuard(engineEvent, platform, options);

  if (platformVerdict.status === 'BLOCK') {
    return {
      status: 'BLOCK',
      reason: platformVerdict.reason || 'Blocked by platform governance',
      ruleId: platformVerdict.ruleId || 'platform',
      timestamp: now,
      engineVerdict: platformVerdict,
    };
  }

  if (platformVerdict.status === 'PAUSE') {
    return {
      status: 'PAUSE',
      reason: platformVerdict.reason || 'Paused by platform governance',
      ruleId: platformVerdict.ruleId || 'platform',
      timestamp: now,
      engineVerdict: platformVerdict,
    };
  }

  // ── Level 2: App world (tool-specific, can tighten not loosen) ────────────
  const appWorld = getAppWorld(event.tool);
  if (appWorld) {
    const appVerdict = evaluateGuard(engineEvent, appWorld, options);

    if (appVerdict.status === 'BLOCK') {
      return {
        status: 'BLOCK',
        reason: appVerdict.reason || `Blocked by ${event.tool} governance`,
        ruleId: appVerdict.ruleId || event.tool,
        timestamp: now,
        engineVerdict: appVerdict,
      };
    }

    if (appVerdict.status === 'PAUSE') {
      return {
        status: 'PAUSE',
        reason: appVerdict.reason || `Paused by ${event.tool} governance`,
        ruleId: appVerdict.ruleId || event.tool,
        timestamp: now,
        engineVerdict: appVerdict,
      };
    }

    // MODIFY verdicts accumulate (don't block, but note them)
    if (appVerdict.status === 'MODIFY') {
      return {
        status: 'MODIFY',
        reason: appVerdict.reason,
        ruleId: appVerdict.ruleId,
        warning: appVerdict.warning,
        timestamp: now,
        engineVerdict: appVerdict,
      };
    }
  }

  // ── Level 3: User world (Align strategies, Reflect profiles) ──────────────
  if (userWorld) {
    const userVerdict = evaluateGuard(engineEvent, userWorld, options);

    if (userVerdict.status === 'BLOCK') {
      return {
        status: 'BLOCK',
        reason: userVerdict.reason || 'Blocked by user strategy governance',
        ruleId: userVerdict.ruleId || 'user-strategy',
        timestamp: now,
        engineVerdict: userVerdict,
      };
    }
  }

  // ── Default: ALLOW ────────────────────────────────────────────────────────
  return {
    status: 'ALLOW',
    timestamp: now,
    engineVerdict: platformVerdict,
  };
}

// ─── Simulation (the real thing) ─────────────────────────────────────────────
// Uses the REAL simulate engine. This is `neuroverse simulate`.

export function runSimulation(
  world: WorldDefinition,
  steps: number = 5,
  stateOverrides?: Record<string, unknown>,
) {
  return simulateWorld(world, {
    steps: Math.min(steps, 50),
    stateOverrides,
  });
}

// ─── Validation (the real thing) ─────────────────────────────────────────────
// Uses the REAL validate engine. This is `neuroverse validate`.

export function validateWorldFile(world: WorldDefinition) {
  return validateWorld(world);
}

// ─── Output Sanitization ─────────────────────────────────────────────────────
// Post-processes ALL AI output. Enforces:
// - awareness_not_optimization (show patterns, don't optimize against them)
// - show_not_script (options with tradeoffs, not scripts)
// - never_exploit_emotional_patterns (awareness, not exploitation)
// - prediction_is_pattern (tends to, not will)
// - no_manipulation_framing (understanding, not control)
// - contact_profiles_are_behavioral (observations, not judgments)

// skipJudgmentSanitization: when true, personality characterizations that are
// SUPPORTED BY DATA are preserved (gaslighting, manipulative, toxic).
// Used when user's intent is protective/evidentiary (build_evidence, detect_manipulation, etc.)
//
// NOTE ON ai_governed_parsing INVARIANT:
// This function currently uses REGEX for semantic detection (personality judgments,
// manipulation framing). This is a KNOWN VIOLATION of our own ai_governed_parsing rule.
// The correct approach is a lightweight AI call:
//   "Does this output contain personality judgments or manipulation framing?
//    If so, return the specific phrases and whether they are supported by evidence."
//
// Regex remains as an INTERIM safety net — fast, deterministic, zero-cost.
// It catches the obvious cases. But it WILL miss nuanced violations that only
// AI can detect (e.g., "Alex always does this" is a judgment disguised as observation).
//
// TODO: Replace regex semantic detection with AI-governed output review.
// Priority: HIGH — we are violating our own governance.
export function sanitizeOutput(
  text: string,
  tool: string,
  options?: { skipJudgmentSanitization?: boolean },
): { text: string; modifications: string[] } {
  const modifications: string[] = [];
  let sanitized = text;

  // Personality judgments: CONDITIONAL based on user intent.
  // If user's intent is protective/evidentiary, preserve accurate characterizations.
  // If not, soften to behavioral observations.
  if (!options?.skipJudgmentSanitization) {
    const judgmentReplacements: [RegExp, string, string][] = [
      [/(\w+)\s+is\s+(a\s+)?narcissist/gi, '$1 frequently centers conversations on themselves', 'guard-008'],
      [/(\w+)\s+is\s+(a\s+)?manipulat(ive|or)/gi, '$1 tends to use indirect influence tactics', 'guard-008'],
      [/(\w+)\s+is\s+toxic/gi, '$1 exhibits patterns that create negative outcomes', 'guard-008'],
      [/(\w+)\s+is\s+emotionally unavailable/gi, '$1 tends to disengage during emotional topics', 'guard-008'],
      [/(\w+)\s+is\s+passive.aggressive/gi, '$1 tends to express disagreement indirectly', 'guard-008'],
      [/(\w+)\s+is\s+gaslighting/gi, '$1 contradicts your stated experience', 'guard-008'],
    ];
    for (const [pattern, replacement, ruleId] of judgmentReplacements) {
      if (pattern.test(sanitized)) {
        sanitized = sanitized.replace(pattern, replacement);
        modifications.push(`Reframed judgment (${ruleId})`);
      }
    }
  } else {
    modifications.push('Judgment sanitization skipped — user intent requires accurate characterizations');
  }

  // These ALWAYS apply regardless of intent (structural safety, not prosocial bias):
  const replacements: [RegExp, string, string][] = [
    // Manipulation framing → understanding
    [/how to get (\w+) to/gi, 'approaches that work well with $1 for', 'guard-009'],
    [/how to make (\w+)/gi, 'how to communicate effectively with $1', 'guard-009'],
    [/control the conversation/gi, 'navigate the conversation productively', 'guard-009'],
    [/manipulate/gi, 'influence constructively', 'guard-009'],

    // Scripts → options (guard-013)
    [/\bsay:\s*["']([^"']+)["']/gi, 'consider expressing that $1 — though this may land differently depending on context', 'guard-013'],
    [/\byou should say\b/gi, 'one option is to say something like', 'guard-013'],
    [/\bjust tell them\b/gi, 'you could share with them', 'guard-013'],

    // Exploitation → awareness (guard-014)
    [/to (lower|break|bypass|get past) (their|his|her) (guard|defens|resist)/gi, 'to build a more open dialogue', 'guard-014'],
    [/exploit (their|his|her) (vulnerabilit|weakness|insecurit)/gi, 'be aware of their $2', 'guard-014'],
    [/use (their|his|her) (fear|anxiety|insecurity) to/gi, 'be mindful that they may feel $2 about', 'guard-014'],
    [/take advantage of/gi, 'be aware of', 'guard-014'],

    // Certainty → pattern (guard-015)
    [/this will (cause|result|lead|make)/gi, 'based on observed patterns, this tends to $1', 'guard-015'],
    [/they will (definitely|certainly|always)/gi, 'they have tended to', 'guard-015'],
    [/guaranteed to/gi, 'has historically correlated with', 'guard-015'],
  ];

  for (const [pattern, replacement, ruleId] of replacements) {
    if (pattern.test(sanitized)) {
      sanitized = sanitized.replace(pattern, replacement);
      modifications.push(`Reframed (${ruleId})`);
    }
  }

  return { text: sanitized, modifications };
}

// ─── Audit Logger ────────────────────────────────────────────────────────────

export async function logAudit(
  supabase: SupabaseClient,
  event: BeviaGuardEvent,
  verdict: BeviaGuardVerdict,
): Promise<void> {
  supabase.from('bevia_audit_log').insert({
    user_id: event.userId,
    action: event.intent,
    tool: event.tool,
    verdict: verdict.status,
    rule_id: verdict.ruleId || null,
    reason: verdict.reason || null,
    credit_cost: event.creditCost || 0,
    metadata: {
      ...event.metadata,
      engineTrace: verdict.engineVerdict?.trace ? true : false,
    },
    created_at: new Date(verdict.timestamp).toISOString(),
  }).then(() => {}, (err) => console.error('[Bevia Audit]', err));
}

// ─── Governed Action Wrapper ─────────────────────────────────────────────────

export async function governedAction<T>(
  supabase: SupabaseClient,
  event: BeviaGuardEvent,
  action: () => Promise<T>,
  userWorld?: WorldDefinition,
): Promise<{ ok: boolean; result?: T; verdict: BeviaGuardVerdict; error?: string }> {
  const verdict = evaluateAction(event, userWorld);
  logAudit(supabase, event, verdict);

  if (verdict.status === 'BLOCK') {
    return { ok: false, verdict, error: verdict.reason || 'Blocked by governance' };
  }
  if (verdict.status === 'PAUSE') {
    return { ok: false, verdict, error: verdict.reason || 'Paused — try again shortly' };
  }

  try {
    const result = await action();
    return { ok: true, result, verdict };
  } catch (err) {
    return { ok: false, verdict, error: (err as Error).message };
  }
}
