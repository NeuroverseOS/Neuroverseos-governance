/** Types for compare.mjs (kept in plain JavaScript so any Node can load it). */
export interface ConformanceCase {
  id: string;
  principle: number[];
  description: string;
  /** A case a client (evaluate, fingerprint verify, approval verify, plans) must pass; absent on authoring-tool cases (findings, backtest). */
  client?: boolean;
  rulebook?: unknown;
  rulebookRef?: string;
  request?: unknown;
  plan?: unknown;
  value?: unknown;
  text?: string;
  events?: unknown;
  options?: unknown;
  proposed?: unknown;
  approval?: unknown;
  trustedKeys?: unknown;
  signature?: unknown;
  publicKey?: string;
  expect: Record<string, unknown>;
}
export interface LoadedCase { file: string; case: ConformanceCase; rulebook: unknown }
export interface Impl {
  evaluate: (rulebook: never, request: never) => unknown;
  evaluatePlan: (rulebook: never, plan: never) => unknown;
  /** The trusted layer's entries: verify every signed approval the request or plan carries, then decide. */
  verifyAndEvaluate: (rulebook: never, request: never) => Promise<unknown>;
  verifyAndEvaluatePlan: (rulebook: never, plan: never) => Promise<unknown>;
  check: (rulebook: never) => unknown;
  /** Optional: when given, a finding's witness is judged by whether it matches both rules, and `matches` itself must agree with the reference on every reference witness; when absent, the witness must equal the reference's. */
  matches?: (rulebook: never, request: never) => string[];
  validate: (rulebook: unknown) => string[];
  canonical: (value: unknown) => string;
  fingerprint: (value: unknown) => string;
  /** SHA-256 of the UTF-8 bytes of the text, 64 lowercase hex. */
  sha256: (text: string) => string;
  verifyApproval: (approval: unknown, keys: never) => Promise<{ ok: boolean; reason?: string }>;
  verifyRulebookSignature: (rulebook: never, signature: never, publicKey: string) => Promise<boolean>;
  backtest: (rulebook: never, events: never, options?: never) => unknown;
  compareBacktests: (baseline: never, proposed: never) => unknown;
}
export function projectDecision(d: unknown): unknown;
export function projectFindings(findings: unknown): Array<Record<string, unknown>>;
export function projectPlan(p: unknown): unknown;
/** Deep semantic equality: key order never matters. */
export function deepEqual(a: unknown, b: unknown): boolean;
/** The value with every object's keys sorted, recursively. */
export function canon(v: unknown): unknown;
export function runCase(c: ConformanceCase, impl: Impl, rulebook: unknown): Promise<string | null>;
export function loadCases(fs: unknown, path: unknown, dir: string, options?: { client?: boolean }): Promise<LoadedCase[]>;
