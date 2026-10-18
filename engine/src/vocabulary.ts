/**
 * Vocabulary — how rules refer to the things a site declared.
 *
 * Selectors (`who`, `does`, `where`) resolve to finite sets of IDs. Conditions
 * (`when`) are checked against validated facts. Constraints turn conditions
 * into sets the conflict check can intersect and compare exactly.
 *
 * Pure functions, no I/O.
 */

import type {
  ActionDef, AreaDef, AuthorityDef, Condition, Day, DomainDecisionStatus, FactDef, FactValue, HistoryCondition, HistoryEntry, LimitDef, RoleDef, Rulebook, Selector,
} from './types';
import { DAYS } from './types';

/** Strictness of a status: the decision is the strictest check (SPEC.md § 5). */
export const SEVERITY: Readonly<Record<DomainDecisionStatus, number>> = { ALLOW: 0, LIMIT: 1, PAUSE: 2, BLOCK: 3 };

/** Thrown when the input can't produce a valid rulebook. The message says what to fix. */
export class DomainRulesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainRulesError';
  }
}

// ─── Time ────────────────────────────────────────────────────────────────────

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Is the value a "HH:MM" 24-hour time string? */
export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME.test(value);
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Minutes since midnight as "HH:MM". */
export function hhmm(t: number): string {
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** Is "HH:MM" within opening hours? Handles overnight hours; open === close means always open. */
export function isOpen(localTime: string, hours: { open: string; close: string }): boolean {
  const t = minutesOf(localTime), open = minutesOf(hours.open), close = minutesOf(hours.close);
  if (open === close) return true;
  return open < close ? t >= open && t < close : t >= open || t < close;
}

/** from <= t < to, overnight when from > to. */
export function inWindow(t: number, from: number, to: number): boolean {
  return from < to ? t >= from && t < to : t >= from || t < to;
}

const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})?$/;

/**
 * An ISO 8601 timestamp with a date (`Timestamp`), as whole milliseconds
 * since the Unix epoch; null when it is not one. No offset means UTC, so
 * every implementation reads the same instant. Calendar validity is checked
 * (2026-02-30 is not a timestamp). A fraction longer than three digits is
 * TRUNCATED to milliseconds (SPEC.md § 1): two timestamps that differ only
 * past the millisecond are the same instant to this layer, and a port with
 * finer ticks must truncate the same way. Years 0000–0099 are those years,
 * not 19xx.
 */
export function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = TIMESTAMP.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, frac, zone] = m;
  const Y = Number(y), M = Number(mo), D = Number(d), H = Number(h), MI = Number(mi), S = Number(s ?? 0);
  if (M < 1 || M > 12 || D < 1 || H > 23 || MI > 59 || S > 59) return null;
  const date = new Date(0);
  date.setUTCFullYear(Y, M - 1, D);
  date.setUTCHours(H, MI, S, frac ? Number(frac.padEnd(3, '0').slice(0, 3)) : 0);
  const ms = date.getTime();
  if (date.getUTCDate() !== D || date.getUTCMonth() !== M - 1) return null;
  let offset = 0;
  if (zone && zone !== 'Z') {
    const sign = zone[0] === '-' ? -1 : 1;
    const oh = Number(zone.slice(1, 3)), om = Number(zone.slice(4, 6));
    if (oh > 23 || om > 59) return null;
    offset = sign * (oh * 60 + om) * 60_000;
  }
  return ms - offset;
}

export function isTimestamp(value: unknown): value is string {
  return parseTimestamp(value) !== null;
}

/** A timestamp `seconds` later, in the same form (`YYYY-MM-DDTHH:MM:SSZ`). */
export function addSeconds(timestamp: string, seconds: number): string {
  const ms = parseTimestamp(timestamp)! + seconds * 1000;
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * The wall-clock "HH:MM" a timestamp names, in its OWN offset: the hour and
 * minute written in it. `2026-10-12T21:00:00-05:00` is 21:00 — the local
 * evening the site's time facts describe — not 02:00 UTC. A timestamp with
 * no offset is UTC, and its wall clock is the one written.
 */
export function timeOfDay(timestamp: string): string {
  return timestamp.slice(11, 16);
}

// ─── Vocabulary ──────────────────────────────────────────────────────────────

export interface Vocabulary {
  kinds: Set<string>;
  authorities: AuthorityDef[];
  actions: Map<string, ActionDef>;
  areas: Map<string, AreaDef>;
  roles: Map<string, RoleDef>;
  facts: Map<string, FactDef>;
  limits: Map<string, LimitDef>;
  tags: { actions: Set<string>; areas: Set<string>; roles: Set<string> };
}

type VocabSource = Pick<Rulebook, 'kinds' | 'authorities' | 'actions' | 'areas' | 'roles' | 'facts' | 'limits' | 'tags'>;

export function vocabularyOf(rb: VocabSource): Vocabulary {
  const byId = <T extends { id: string }>(list: T[]) => new Map(list.map(x => [x.id, x]));
  const tagsOf = (list: { tags?: string[] }[], declared: string[]) =>
    new Set([...declared, ...list.flatMap(x => x.tags ?? [])]);
  return {
    kinds: new Set(rb.kinds),
    authorities: rb.authorities,
    actions: byId(rb.actions),
    areas: byId(rb.areas),
    roles: byId(rb.roles),
    facts: byId(rb.facts),
    limits: byId(rb.limits),
    tags: {
      actions: tagsOf(rb.actions, rb.tags.actions),
      areas: tagsOf(rb.areas, rb.tags.areas),
      roles: tagsOf(rb.roles, rb.tags.roles),
    },
  };
}

/** Position in the authority order; 0 is highest. -1 if unknown. */
export function authorityRank(vocab: Vocabulary, id: string): number {
  return vocab.authorities.findIndex(a => a.id === id);
}

export function authorityName(vocab: Vocabulary, id: string): string {
  return vocab.authorities.find(a => a.id === id)?.name ?? id;
}

// ─── Selectors ───────────────────────────────────────────────────────────────

export type SelectorKind = 'who' | 'does' | 'where';

export function selectorEntries(sel: Selector): string[] {
  return (Array.isArray(sel) ? sel : [sel]).map(e => e.trim()).filter(Boolean);
}

/** Resolve a selector to the set of IDs it matches among declared things. */
export function resolveSelector(sel: Selector, kind: SelectorKind, vocab: Vocabulary): Set<string> {
  const universe = universeOf(kind, vocab);
  const entries = selectorEntries(sel);
  const positives = entries.filter(e => !e.startsWith('!'));
  const negatives = entries.filter(e => e.startsWith('!')).map(e => e.slice(1));
  let ids: Set<string>;
  if (positives.length === 0 || positives.includes('*')) ids = new Set(universe);
  else {
    ids = new Set();
    for (const p of positives) for (const id of expand(p, kind, vocab)) ids.add(id);
  }
  for (const n of negatives) for (const id of expand(n, kind, vocab)) ids.delete(id);
  return ids;
}

/** Does the selector include '*' (so it also matches actions the rulebook does not know)? */
export function selectorIsOpen(sel: Selector): boolean {
  const entries = selectorEntries(sel);
  const positives = entries.filter(e => !e.startsWith('!'));
  return positives.length === 0 || positives.includes('*');
}

/** Is this (possibly undeclared) ID excluded by name? */
export function selectorExcludesId(sel: Selector, id: string): boolean {
  return selectorEntries(sel).includes(`!${id}`);
}

function universeOf(kind: SelectorKind, vocab: Vocabulary): Iterable<string> {
  return kind === 'who' ? vocab.roles.keys() : kind === 'does' ? vocab.actions.keys() : vocab.areas.keys();
}

function expand(entry: string, kind: SelectorKind, vocab: Vocabulary): string[] {
  if (entry === '*') return [...universeOf(kind, vocab)];
  if (entry.startsWith('tag:')) {
    const tag = entry.slice(4);
    const list: { id: string; tags?: string[] }[] = kind === 'who' ? [...vocab.roles.values()] : kind === 'does' ? [...vocab.actions.values()] : [...vocab.areas.values()];
    return list.filter(x => x.tags?.includes(tag)).map(x => x.id);
  }
  if (entry.startsWith('kind:')) {
    const k = entry.slice(5);
    if (kind === 'who') return [...vocab.roles.values()].filter(r => r.kind === k).map(r => r.id);
    if (kind === 'does') return [...vocab.actions.values()].filter(a => a.kinds.includes(k)).map(a => a.id);
    return [];
  }
  return [entry];
}

/** Throws a DomainRulesError naming any ID, tag or kind the selector uses that the site did not declare. */
export function validateSelector(sel: Selector, kind: SelectorKind, vocab: Vocabulary, where: string): void {
  const entries = selectorEntries(sel);
  if (entries.length === 0) throw new DomainRulesError(`${where}: ${kind} is empty. Use "*" for everything.`);
  const noun = kind === 'who' ? 'role' : kind === 'does' ? 'action' : 'area';
  const known = kind === 'who' ? vocab.roles : kind === 'does' ? vocab.actions : vocab.areas;
  const tags = kind === 'who' ? vocab.tags.roles : kind === 'does' ? vocab.tags.actions : vocab.tags.areas;
  for (const raw of entries) {
    const e = raw.startsWith('!') ? raw.slice(1) : raw;
    if (e === '*') continue;
    if (e.startsWith('tag:')) {
      const tag = e.slice(4);
      if (!tags.has(tag)) throw new DomainRulesError(`${where}: ${kind} names ${noun} tag "${tag}", which no ${noun} carries and no template declares. Known ${noun} tags: ${[...tags].join(', ') || 'none'}.`);
      continue;
    }
    if (e.startsWith('kind:')) {
      if (kind === 'where') throw new DomainRulesError(`${where}: areas have no kind; "${e}" cannot be used in where.`);
      const k = e.slice(5);
      if (!vocab.kinds.has(k)) throw new DomainRulesError(`${where}: ${kind} names kind "${k}", which is not declared. Known kinds: ${[...vocab.kinds].join(', ')}.`);
      continue;
    }
    if (!known.has(e)) throw new DomainRulesError(`${where}: ${kind} names unknown ${noun} "${e}". Known: ${[...known.keys()].join(', ') || 'none'}.`);
  }
}

// ─── Facts ───────────────────────────────────────────────────────────────────

/** Is this value a valid value of the fact's type? Returns a problem in plain words, or null. */
export function factProblem(def: FactDef, value: unknown): string | null {
  const got = show(value);
  switch (def.type) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${def.id} must be a number, got ${got}`;
      if (def.integer && !Number.isInteger(value)) return `${def.id} must be a whole number, got ${got}`;
      if (def.min !== undefined && value < def.min) return `${def.id} must be ${def.min} or more, got ${got}`;
      if (def.max !== undefined && value > def.max) return `${def.id} must be ${def.max} or less, got ${got}`;
      return null;
    }
    case 'boolean': return typeof value === 'boolean' ? null : `${def.id} must be true or false, got ${got}`;
    case 'time': return isValidTime(value) ? null : `${def.id} must be "HH:MM" (24h), got ${got}`;
    case 'day': return typeof value === 'string' && (DAYS as readonly string[]).includes(value) ? null : `${def.id} must be one of ${DAYS.join(', ')}, got ${got}`;
    case 'enum': return typeof value === 'string' && (def.values ?? []).includes(value) ? null : `${def.id} must be one of ${(def.values ?? []).join(', ')}, got ${got}`;
    case 'string': return typeof value === 'string' && value.length > 0 ? null : `${def.id} must be a non-empty string, got ${got}`;
  }
}

export function show(v: unknown): string {
  if (v === undefined) return 'nothing';
  if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

/** Does a fact definition make sense on its own? */
export function validateFactDef(def: FactDef): void {
  const types: string[] = ['number', 'boolean', 'time', 'day', 'enum', 'string'];
  if (!types.includes(def.type)) throw new DomainRulesError(`Fact "${def.id}" has unknown type "${def.type}". Types: ${types.join(', ')}.`);
  if (def.type === 'enum' && (!def.values || def.values.length === 0)) throw new DomainRulesError(`Fact "${def.id}" is an enum but lists no values.`);
  if (def.type !== 'number' && (def.min !== undefined || def.max !== undefined || def.integer !== undefined)) throw new DomainRulesError(`Fact "${def.id}" is a ${def.type}; min, max and integer apply to numbers only.`);
  if (def.min !== undefined && def.max !== undefined && def.min > def.max) throw new DomainRulesError(`Fact "${def.id}" has min ${def.min} above max ${def.max}.`);
  if (def.default !== undefined) {
    const p = factProblem(def, def.default);
    if (p) throw new DomainRulesError(`Fact "${def.id}" has an invalid default: ${p}.`);
    if (def.required) throw new DomainRulesError(`Fact "${def.id}" cannot be both required and have a default.`);
  }
}

/** Facts a rule may condition on: those that are always present. */
export function factAlwaysPresent(def: FactDef): boolean {
  return def.required === true || def.default !== undefined;
}

// ─── Conditions ──────────────────────────────────────────────────────────────

const COMPARE_OPS = ['==', '!=', '>', '>=', '<', '<='] as const;

export function validateCondition(c: Condition, vocab: Vocabulary, where: string): void {
  if (!c || typeof c !== 'object' || typeof c.fact !== 'string') throw new DomainRulesError(`${where}: each condition needs a fact and an op.`);
  const def = vocab.facts.get(c.fact);
  if (!def) throw new DomainRulesError(`${where}: condition names unknown fact "${c.fact}". Known: ${[...vocab.facts.keys()].join(', ') || 'none'}.`);
  if (!factAlwaysPresent(def)) throw new DomainRulesError(`${where}: fact "${c.fact}" is optional with no default, so a rule cannot depend on it. Make it required or give it a default.`);
  const bad = (msg: string) => new DomainRulesError(`${where}: ${msg}`);
  switch (c.op) {
    case 'between': {
      if (def.type !== 'time') throw bad(`"between" works on time facts; "${c.fact}" is a ${def.type}.`);
      if (!isValidTime(c.from) || !isValidTime(c.to)) throw bad(`"between" needs "HH:MM" times, got ${show(c.from)} and ${show(c.to)}.`);
      if (c.from === c.to) throw bad(`"between ${c.from} and ${c.to}" is an empty window. To mean "always", leave the condition out.`);
      return;
    }
    case 'days': {
      if (def.type !== 'day') throw bad(`"days" works on day facts; "${c.fact}" is a ${def.type}.`);
      if (!Array.isArray(c.days) || c.days.length === 0) throw bad(`"days" needs at least one day.`);
      for (const d of c.days) if (!(DAYS as readonly string[]).includes(d)) throw bad(`"${d}" is not a day. Days: ${DAYS.join(', ')}.`);
      return;
    }
    case 'in': {
      if (!Array.isArray(c.values) || c.values.length === 0) throw bad(`"in" needs at least one value.`);
      for (const v of c.values) { const p = factProblem(def, v); if (p) throw bad(`"in" value invalid: ${p}.`); }
      return;
    }
    default: {
      if (!(COMPARE_OPS as readonly string[]).includes(c.op)) throw bad(`unknown op "${(c as { op: string }).op}". Ops: ${[...COMPARE_OPS, 'in', 'between', 'days'].join(', ')}.`);
      const p = factProblem(def, c.value);
      if (p) throw bad(`condition value invalid: ${p}.`);
      if ((def.type === 'boolean' || def.type === 'enum' || def.type === 'string' || def.type === 'day') && c.op !== '==' && c.op !== '!=') {
        throw bad(`"${c.op}" does not apply to a ${def.type} fact; use == or !=.`);
      }
    }
  }
}

/** Numeric order for comparing fact values of one type. */
function ordinal(def: FactDef, v: FactValue): number {
  if (def.type === 'time') return minutesOf(v as string);
  if (def.type === 'day') return DAYS.indexOf(v as Day);
  return v as number;
}

/** Is the condition true for these validated facts? Facts are complete here. */
export function conditionHolds(c: Condition, facts: Record<string, FactValue>, vocab: Vocabulary): boolean {
  const def = vocab.facts.get(c.fact)!;
  const v = facts[c.fact];
  switch (c.op) {
    case 'between': return inWindow(minutesOf(v as string), minutesOf(c.from), minutesOf(c.to));
    case 'days': return c.days.includes(v as Day);
    case 'in': return c.values.includes(v);
    case '==': return v === c.value;
    case '!=': return v !== c.value;
    default: {
      const a = ordinal(def, v), b = ordinal(def, c.value);
      return c.op === '>' ? a > b : c.op === '>=' ? a >= b : c.op === '<' ? a < b : a <= b;
    }
  }
}

export function describeCondition(c: Condition): string {
  switch (c.op) {
    case 'between': return `${c.fact} between ${c.from} and ${c.to}`;
    case 'days': return `${c.fact} is ${c.days.join('/')}`;
    case 'in': return `${c.fact} in ${c.values.map(String).join(', ')}`;
    case '==': return `${c.fact} is ${String(c.value)}`;
    case '!=': return `${c.fact} is not ${String(c.value)}`;
    default: return `${c.fact} ${c.op} ${String(c.value)}`;
  }
}

// ─── History conditions ──────────────────────────────────────────────────────

export function validateHistoryCondition(h: HistoryCondition, vocab: Vocabulary, where: string): void {
  if (!h || typeof h !== 'object') throw new DomainRulesError(`${where}: each history condition needs { actions, op, value }.`);
  validateSelector(h.actions, 'does', vocab, `${where} history`);
  if (h.areas !== undefined) validateSelector(h.areas, 'where', vocab, `${where} history`);
  if (h.sameArea !== undefined && typeof h.sameArea !== 'boolean') throw new DomainRulesError(`${where}: history.sameArea must be true or false.`);
  if (!(COMPARE_OPS as readonly string[]).includes(h.op)) throw new DomainRulesError(`${where}: history op must be one of ${COMPARE_OPS.join(', ')}.`);
  if (typeof h.value !== 'number' || !Number.isInteger(h.value) || h.value < 0) throw new DomainRulesError(`${where}: history value must be a whole number, 0 or more.`);
  if (h.withinMinutes !== undefined) {
    if (typeof h.withinMinutes !== 'number' || !Number.isFinite(h.withinMinutes) || h.withinMinutes <= 0 || h.withinMinutes > 1440) throw new DomainRulesError(`${where}: history.withinMinutes must be between 1 and 1440.`);
  }
  if ((h as { clock?: unknown }).clock !== undefined) throw new DomainRulesError(`${where}: history.clock was removed in robot-domain-rules/3; a window is measured back from request.now (a timestamp with a date). Remove clock and recompile.`);
}

/** Problems with a supplied history, in plain words (empty when it is usable). `needTimes`: some matching rule uses a window. */
export function historyProblems(history: unknown, needTimes: boolean): string[] {
  if (!Array.isArray(history)) return ['history must be a list of { action, areaId, at? }'];
  const problems: string[] = [];
  history.forEach((e: HistoryEntry, i) => {
    if (!e || typeof e !== 'object' || typeof e.action !== 'string' || !e.action || typeof e.areaId !== 'string' || !e.areaId) problems.push(`history[${i}] must be { action, areaId, at? }`);
    else if (e.at !== undefined && !isTimestamp(e.at)) problems.push(`history[${i}].at must be a timestamp with a date ("YYYY-MM-DDTHH:MM", optional seconds and offset), got ${show(e.at)}`);
    else if (needTimes && e.at === undefined) problems.push(`history[${i}] needs "at" because a rule counts within a time window`);
  });
  return problems;
}

/** Does the history condition hold for this request? History is validated here; `nowMs` is `request.now` parsed (present when any window is in scope). */
export function historyConditionHolds(h: HistoryCondition, history: HistoryEntry[], areaId: string, nowMs: number | null, vocab: Vocabulary): boolean {
  const actions = resolveSelector(h.actions, 'does', vocab);
  const areas = h.areas !== undefined ? resolveSelector(h.areas, 'where', vocab) : null;
  let count = 0;
  for (const e of history) {
    if (!actions.has(e.action)) continue;
    if (h.sameArea && e.areaId !== areaId) continue;
    if (areas && !areas.has(e.areaId)) continue;
    if (h.withinMinutes !== undefined) {
      const ago = (nowMs! - parseTimestamp(e.at)!) / 60_000;
      if (ago < 0 || ago > h.withinMinutes) continue;
    }
    count++;
  }
  return compare(h.op, count, h.value);
}

export function describeHistoryCondition(h: HistoryCondition): string {
  const window = h.withinMinutes !== undefined ? ` in the last ${h.withinMinutes} min` : '';
  const where = h.sameArea ? ' in the same area' : h.areas !== undefined ? ` in ${Array.isArray(h.areas) ? h.areas.join('/') : h.areas}` : '';
  return `history: ${Array.isArray(h.actions) ? h.actions.join('/') : h.actions}${where}${window} ${h.op} ${h.value}`;
}

// ─── Constraints: conditions as sets, for exact comparison ───────────────────
//
// Every condition language form maps to one of three set shapes over one fact:
//   range   — an interval with excluded points (number facts)
//   values  — a finite set, or "everything except" (boolean, enum, day, string)
//   minutes — a bitmap of the 1440 minutes in a day (time facts)
// Intersection and subset are exact for every shape, so disjointness is sound
// and implication is sound.

export type Constraint =
  | { shape: 'range'; lo: number; hi: number; loOpen: boolean; hiOpen: boolean; excluded: number[]; integer?: boolean }
  | { shape: 'finite'; values: number[] }
  | { shape: 'values'; values?: FactValue[]; excluded: FactValue[] }
  | { shape: 'minutes'; bits: boolean[] };

export function universeConstraint(def: FactDef): Constraint {
  switch (def.type) {
    case 'number': return normaliseRange({ shape: 'range', lo: def.min ?? -Infinity, hi: def.max ?? Infinity, loOpen: false, hiOpen: false, excluded: [] }, def.integer === true);
    case 'time': return { shape: 'minutes', bits: new Array(1440).fill(true) };
    case 'boolean': return { shape: 'values', values: [true, false], excluded: [] };
    case 'day': return { shape: 'values', values: [...DAYS], excluded: [] };
    case 'enum': return { shape: 'values', values: [...(def.values ?? [])], excluded: [] };
    case 'string': return { shape: 'values', excluded: [] };
  }
}

/** Integer ranges are kept closed on whole numbers, so emptiness and witnesses are exact. */
function normaliseRange(r: Extract<Constraint, { shape: 'range' }>, int: boolean): Extract<Constraint, { shape: 'range' }> {
  if (!int) return r;
  let lo = r.lo, hi = r.hi;
  if (lo !== -Infinity) lo = r.loOpen ? Math.floor(lo) + 1 : Math.ceil(lo);
  if (hi !== Infinity) hi = r.hiOpen ? Math.ceil(hi) - 1 : Math.floor(hi);
  return { shape: 'range', lo, hi, loOpen: false, hiOpen: false, excluded: r.excluded.filter(Number.isInteger), integer: true };
}

function conditionConstraint(c: Condition, def: FactDef): Constraint {
  if (def.type === 'time') {
    const bits = new Array<boolean>(1440).fill(false);
    const set = (pred: (t: number) => boolean) => { for (let t = 0; t < 1440; t++) bits[t] = pred(t); };
    if (c.op === 'between') { const f = minutesOf(c.from), to = minutesOf(c.to); set(t => inWindow(t, f, to)); }
    else if (c.op === 'in') { const vs = c.values.map(v => minutesOf(v as string)); set(t => vs.includes(t)); }
    else if (c.op === 'days') set(() => false);
    else { const b = minutesOf(c.value as string); set(t => compare(c.op, t, b)); }
    return { shape: 'minutes', bits };
  }
  if (def.type === 'number') {
    const int = def.integer === true;
    const base = universeConstraint(def) as Extract<Constraint, { shape: 'range' }>;
    if (c.op === 'in') return { shape: 'finite', values: c.values as number[] };
    if (c.op === 'between' || c.op === 'days') return { shape: 'finite', values: [] };
    const v = c.value as number;
    const r = { ...base, excluded: [] as number[] };
    switch (c.op) {
      case '==': return { shape: 'finite', values: [v] };
      case '!=': r.excluded = [v]; return r;
      case '>': r.lo = Math.max(r.lo, v); r.loOpen = r.lo === v; return normaliseRange(r, int);
      case '>=': r.lo = Math.max(r.lo, v); return normaliseRange(r, int);
      case '<': r.hi = Math.min(r.hi, v); r.hiOpen = r.hi === v; return normaliseRange(r, int);
      case '<=': r.hi = Math.min(r.hi, v); return normaliseRange(r, int);
    }
  }
  // boolean, enum, day, string
  const u = universeConstraint(def) as Extract<Constraint, { shape: 'values' }>;
  if (c.op === 'days') return { shape: 'values', values: [...c.days], excluded: [] };
  if (c.op === 'in') return { shape: 'values', values: [...c.values], excluded: [] };
  if (c.op === '==') return { shape: 'values', values: [c.value], excluded: [] };
  if (c.op === '!=') return u.values ? { shape: 'values', values: u.values.filter(v => v !== c.value), excluded: [] } : { shape: 'values', excluded: [c.value] };
  return { shape: 'values', values: [], excluded: [] };
}

function compare(op: string, a: number, b: number): boolean {
  return op === '==' ? a === b : op === '!=' ? a !== b : op === '>' ? a > b : op === '>=' ? a >= b : op === '<' ? a < b : a <= b;
}

function rangeHas(r: Extract<Constraint, { shape: 'range' }>, v: number): boolean {
  if (v < r.lo || v > r.hi) return false;
  if (v === r.lo && r.loOpen) return false;
  if (v === r.hi && r.hiOpen) return false;
  return !r.excluded.includes(v);
}

export function intersect(a: Constraint, b: Constraint): Constraint {
  if (a.shape === 'minutes' && b.shape === 'minutes') return { shape: 'minutes', bits: a.bits.map((x, i) => x && b.bits[i]) };
  if (a.shape === 'finite' && (b.shape === 'finite' || b.shape === 'range')) return { shape: 'finite', values: a.values.filter(v => b.shape === 'finite' ? b.values.includes(v) : rangeHas(b, v)) };
  if (b.shape === 'finite' && a.shape === 'range') return intersect(b, a);
  if (a.shape === 'range' && b.shape === 'range') {
    const lo = Math.max(a.lo, b.lo), hi = Math.min(a.hi, b.hi);
    const loOpen = (a.lo === lo && a.loOpen) || (b.lo === lo && b.loOpen);
    const hiOpen = (a.hi === hi && a.hiOpen) || (b.hi === hi && b.hiOpen);
    const int = a.integer === true || b.integer === true;
    return normaliseRange({ shape: 'range', lo, hi, loOpen, hiOpen, excluded: [...new Set([...a.excluded, ...b.excluded])] }, int);
  }
  if (a.shape === 'values' && b.shape === 'values') {
    const excluded = [...new Set([...a.excluded, ...b.excluded])];
    if (a.values && b.values) return { shape: 'values', values: a.values.filter(v => b.values!.includes(v) && !excluded.includes(v)), excluded: [] };
    const values = (a.values ?? b.values)?.filter(v => !excluded.includes(v));
    return values ? { shape: 'values', values, excluded: [] } : { shape: 'values', excluded };
  }
  // Shapes that cannot meet (a type mismatch the validator would have refused): treat as empty.
  return { shape: 'finite', values: [] };
}

export function isEmpty(c: Constraint): boolean {
  switch (c.shape) {
    case 'minutes': return !c.bits.some(Boolean);
    case 'finite': return c.values.length === 0;
    case 'values': return c.values !== undefined && c.values.length === 0;
    case 'range': {
      if (c.lo > c.hi) return true;
      if (c.lo === c.hi) return c.loOpen || c.hiOpen || c.excluded.includes(c.lo);
      // A real interval with lo < hi is never emptied by finitely many excluded points.
      if (!c.integer) return false;
      // An integer interval is empty only when every whole number in it is excluded.
      if (c.hi - c.lo + 1 > c.excluded.length) return false;
      for (let v = c.lo; v <= c.hi; v++) if (!c.excluded.includes(v)) return false;
      return true;
    }
  }
}

/**
 * One concrete value inside the constraint, or undefined when it is empty.
 * Deterministic: the smallest or earliest value that fits, so a witness is
 * the same every time.
 */
export function witnessValue(c: Constraint, def: FactDef): FactValue | undefined {
  if (isEmpty(c)) return undefined;
  switch (c.shape) {
    case 'minutes': { const t = c.bits.findIndex(Boolean); return t < 0 ? undefined : hhmm(t); }
    case 'finite': return [...c.values].sort((a, b) => a - b)[0];
    case 'values': {
      if (c.values) return [...c.values].sort()[0];
      // "everything except": the first short string not excluded (string facts only).
      for (let i = 0; ; i++) { const v = i === 0 ? 'x' : `x${i}`; if (!c.excluded.includes(v)) return v; }
    }
    case 'range': {
      const ex = new Set(c.excluded);
      if (c.integer) {
        const start = c.lo === -Infinity ? (c.hi === Infinity ? 0 : Math.min(0, c.hi)) : c.lo;
        for (let v = start; v <= c.hi; v++) if (!ex.has(v)) return v;
        return undefined;
      }
      // Real interval: the lower end when it is closed and not excluded, else move inwards by halves.
      if (c.lo !== -Infinity && !c.loOpen && !ex.has(c.lo)) return c.lo;
      if (c.lo === -Infinity && c.hi === Infinity) { for (let v = 0; ; v++) if (!ex.has(v)) return v; }
      if (c.lo === -Infinity) { for (let v = c.hiOpen || ex.has(c.hi) ? c.hi - 1 : c.hi; ; v -= 1) if (!ex.has(v)) return v; }
      if (c.hi === Infinity) { for (let v = c.lo + 1; ; v += 1) if (!ex.has(v)) return v; }
      for (let k = 2; ; k *= 2) { const v = c.lo + (c.hi - c.lo) / k; if (!ex.has(v)) return v; }
    }
  }
}

/** A valid value of the fact's type that no rule needs to be special: the declared default, else the smallest or first value. */
export function sampleValue(def: FactDef): FactValue {
  if (def.default !== undefined) return def.default;
  switch (def.type) {
    case 'number': return def.min ?? 0;
    case 'boolean': return false;
    case 'time': return '00:00';
    case 'day': return 'mon';
    case 'enum': return (def.values ?? [])[0];
    case 'string': return 'x';
  }
}

/** Is every value of `a` also in `b`? Exact; returns false only when it is not a subset (or cannot be shown to be). */
export function isSubset(a: Constraint, b: Constraint): boolean {
  if (isEmpty(a)) return true;
  if (a.shape === 'minutes' && b.shape === 'minutes') return a.bits.every((x, i) => !x || b.bits[i]);
  if (a.shape === 'finite') return a.values.every(v => b.shape === 'finite' ? b.values.includes(v) : b.shape === 'range' ? rangeHas(b, v) : false);
  if (a.shape === 'range' && b.shape === 'range') {
    if (a.lo < b.lo || a.hi > b.hi) return false;
    if (a.lo === b.lo && b.loOpen && !a.loOpen) return false;
    if (a.hi === b.hi && b.hiOpen && !a.hiOpen) return false;
    return b.excluded.every(v => !rangeHas(a, v));
  }
  if (a.shape === 'range' && b.shape === 'finite') {
    // A range fits in a finite set only when it holds finitely many values: an integer range, or a single closed point.
    if (a.integer) {
      if (a.lo === -Infinity || a.hi === Infinity) return false;
      if (a.hi - a.lo + 1 - a.excluded.length > b.values.length) return false;   // more whole numbers than b has: bounded loop below
      for (let v = a.lo; v <= a.hi; v++) if (!a.excluded.includes(v) && !b.values.includes(v)) return false;
      return true;
    }
    return a.lo === a.hi && !a.loOpen && !a.hiOpen && b.values.includes(a.lo);
  }
  if (a.shape === 'values' && b.shape === 'values') {
    if (a.values) return a.values.every(v => b.values ? b.values.includes(v) : !b.excluded.includes(v));
    if (b.values) return false;
    return b.excluded.every(v => a.excluded.includes(v));
  }
  return false;
}

/** The constraint a rule's conditions put on one fact (AND of all its conditions on that fact). */
export function constraintOn(conditions: Condition[], factId: string, vocab: Vocabulary): Constraint {
  const def = vocab.facts.get(factId)!;
  let c = universeConstraint(def);
  for (const cond of conditions) if (cond.fact === factId) c = intersect(c, conditionConstraint(cond, def));
  return c;
}

export function describeConstraint(c: Constraint, def: FactDef): string {
  switch (c.shape) {
    case 'finite': return `${def.id} in ${c.values.join(', ')}`;
    case 'range': {
      const parts: string[] = [];
      if (c.lo !== -Infinity) parts.push(`${c.loOpen ? '>' : '>='} ${c.lo}`);
      if (c.hi !== Infinity) parts.push(`${c.hiOpen ? '<' : '<='} ${c.hi}`);
      if (c.excluded.length) parts.push(`not ${c.excluded.join(', ')}`);
      return parts.length ? `${def.id} ${parts.join(' and ')}` : `any ${def.id}`;
    }
    case 'values': return c.values ? `${def.id} in ${c.values.map(String).join(', ')}` : c.excluded.length ? `${def.id} not ${c.excluded.map(String).join(', ')}` : `any ${def.id}`;
    case 'minutes': {
      const windows: string[] = [];
      let start = -1;
      for (let t = 0; t <= 1440; t++) {
        const on = t < 1440 && c.bits[t];
        if (on && start < 0) start = t;
        if (!on && start >= 0) { windows.push(`${hhmm(start)}–${hhmm(t)}`); start = -1; }
      }
      return windows.length === 1 && windows[0] === '00:00–24:00' ? `any ${def.id}` : `${def.id} in ${windows.join(', ')}`;
    }
  }
}
