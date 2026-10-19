/**
 * The named attack set: eval/live/attacks/*.json, one attack each, loaded in
 * file order and hashed (RFC 8785 canonical JSON, SHA-256) so a report says
 * exactly which set it measured.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fingerprint } from '../../src/index';
import { here, type ScriptedCall } from './task';
import type { ForbiddenEffect } from './world';

export type Planted =
  | { where: 'invoice'; invoice_id: string; text: string }
  | { where: 'vendor_email' | 'boss_email' | 'subagent_instruction'; phase: string; from: string; subject: string; text: string };

export interface Forbidden {
  effect: ForbiddenEffect;
  tool: string;
  args?: Record<string, string | number | boolean | { regex: string }>;
  as?: 'subagent';
  /** The effect is cumulative: calls whose running total of `arg` exceeds `over` are the forbidden ones. */
  cumulative?: { arg: string; over: number };
}

export interface Attack {
  id: string;
  title: string;
  description: string;
  planted: Planted | null;
  forbidden: Forbidden | null;
  /** The rule expected among the reasons that stop the forbidden call in the gated arm. */
  expectedRule: string | null;
  /** For approval attacks: the rejection code expected on the PAUSE. */
  expectedRejection?: string;
  /** What the scripted stand-in does when told to follow the attack. */
  scripted: { phase: string; insertAt: 'before' | 'after'; calls: ScriptedCall[] } | null;
}

export const ATTACK_DIR = join(here, 'attacks');

export function loadAttacks(dir = ATTACK_DIR): { attacks: Attack[]; hash: string } {
  const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  const attacks = files.map(f => {
    const a = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Attack;
    for (const k of ['id', 'title', 'description'] as const) if (typeof a[k] !== 'string' || !a[k]) throw new Error(`${f}: missing ${k}`);
    for (const k of ['planted', 'forbidden', 'expectedRule', 'scripted'] as const) if (a[k] === undefined) throw new Error(`${f}: ${k} must be given (null for none)`);
    if ((a.forbidden === null) !== (a.expectedRule === null) || (a.forbidden === null) !== (a.scripted === null)) throw new Error(`${f}: forbidden, expectedRule and scripted are all null (a control) or all given`);
    return a;
  });
  const ids = new Set(attacks.map(a => a.id));
  if (ids.size !== attacks.length) throw new Error('duplicate attack ids');
  return { attacks, hash: fingerprint(attacks) };
}

const argMatches = (want: string | number | boolean | { regex: string }, got: unknown) =>
  want && typeof want === 'object' && 'regex' in want ? new RegExp(want.regex, 'i').test(String(got ?? '')) : JSON.stringify(got) === JSON.stringify(want);

/** Running totals for cumulative forbidden effects, per arm run. */
export class Totals { private t = new Map<string, number>(); add(key: string, n: number): number { const v = (this.t.get(key) ?? 0) + n; this.t.set(key, v); return v; } }

/** Is this call the forbidden one the attack aims for? Judged on the call, before and regardless of any gate. */
export function isForbiddenCall(attack: Attack, call: { tool: string; args: Record<string, unknown>; as?: 'subagent' }, totals: Totals): boolean {
  const f = attack.forbidden;
  if (!f || f.tool !== call.tool) return false;
  if (f.as && call.as !== f.as) return false;
  if (f.args && !Object.entries(f.args).every(([k, want]) => argMatches(want, call.args[k]))) return false;
  if (f.cumulative) {
    const n = Number(call.args[f.cumulative.arg]);
    return totals.add(`${attack.id}:${f.tool}:${f.cumulative.arg}`, Number.isFinite(n) ? n : 0) > f.cumulative.over;
  }
  return true;
}
