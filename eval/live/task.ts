/**
 * The task script: what a legitimate day looks like, in two phases — the
 * mission (reconcile the week under the mission rulebook) and the owner's
 * standing requests (under the base rulebook). Both arms run the same script
 * from the same seed. Loaded from task.json; validated here.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Invoice, LedgerRow, Mail, OwnerApproval } from './world';

export const here = dirname(fileURLToPath(import.meta.url));

export interface ScriptedCall { tool: string; args: Record<string, unknown>; as?: 'subagent' }

export interface Phase {
  id: string;
  /** Which rulebook governs the phase in the gated arm. */
  rulebook: 'mission' | 'base';
  instructions: string;
  /** What the scripted stand-in does for this phase, in order. */
  script: ScriptedCall[];
}

/** A pattern a legitimate call matches: the tool, and per argument either an exact value or a regular expression source. */
export interface LegitPattern { tool: string; args?: Record<string, string | number | boolean | { regex: string }> }

export interface Task {
  id: string;
  week: string;
  ownDomain: string;
  seed: string;
  agent: { id: string; kind: string; roleId: string };
  subagent: { id: string; kind: string; roleId: string; delegatedBy: string };
  principal: { id: string };
  spendCap: number;
  report: { path: string; scopePrefix: string; requiredFields: string[] };
  summaryEmail: boolean;
  phases: Phase[];
  legitimate: LegitPattern[];
  world: { invoices: Invoice[]; ledger: LedgerRow[]; vendors: Record<string, { name: string; iban: string }>; ownerApprovals: OwnerApproval[]; inbox: Record<string, Mail[]> };
}

export function loadTask(path = join(here, 'task.json')): Task {
  const t = JSON.parse(readFileSync(path, 'utf8')) as Task;
  for (const k of ['id', 'week', 'ownDomain', 'seed', 'agent', 'subagent', 'principal', 'spendCap', 'report', 'phases', 'legitimate', 'world'] as const) if (t[k] === undefined) throw new Error(`task.json: missing ${k}`);
  if (!t.phases.length) throw new Error('task.json: no phases');
  for (const p of t.phases) if (p.rulebook !== 'mission' && p.rulebook !== 'base') throw new Error(`task.json: phase ${p.id} rulebook must be mission or base`);
  return t;
}

/** Does a call match a legitimate pattern? Exact values compare by JSON; { regex } tests the string form. */
export function isLegitimate(task: Task, tool: string, args: Record<string, unknown>): boolean {
  return task.legitimate.some(p => p.tool === tool && Object.entries(p.args ?? {}).every(([k, want]) => {
    const got = args[k];
    if (want && typeof want === 'object' && 'regex' in want) return new RegExp(want.regex, 'i').test(String(got ?? ''));
    return JSON.stringify(got) === JSON.stringify(want);
  }));
}
