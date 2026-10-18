/**
 * Approvals as data, signed — and rulebooks signed.
 *
 * Ed25519 through the platform's WebCrypto (`globalThis.crypto.subtle`:
 * Node 20+, modern browsers). No dependencies. Signatures are deterministic,
 * so another implementation can reproduce every test vector exactly.
 *
 * Evaluation stays pure and synchronous: the caller's trusted layer verifies
 * a signed approval here (async) BEFORE evaluating, and passes the verified
 * approval in as `facts.approvedBy` (`verifyAndEvaluate` does both). When
 * the rulebook declares `trustedKeys`, the evaluator clears an approval wait
 * only for the very object `verifyApproval` returned (registered in
 * verified.ts; nothing arriving as request data can claim verification — a
 * `verified` member is ignored wherever it appears) that is bound to that
 * rule, this rulebook's fingerprint, this participant, action and area, is
 * within [issuedAt, expiresAt) at `request.now`, and whose nonce is not in
 * `request.consumedApprovals`. `evaluateDomainAction` alone, given a
 * trusted-keys rulebook and an approval from request data, always answers
 * PAUSE and says to use `verifyAndEvaluate`.
 *
 * Encodings (SPEC.md § Approvals):
 *   public key   raw Ed25519, 32 bytes, lowercase hex
 *   private key  the 32-byte seed, lowercase hex (PKCS#8 wrapping is internal)
 *   signature    64 bytes, lowercase hex
 *   signed text  UTF-8 of the canonical JSON of the object without `signature` (and without `verified`)
 */

import type {
  Approval, DomainDecision, DomainRequest, GovernanceDecision, GovernancePlan, GovernancePlanEvaluation, GovernanceRequest, GovernanceRulebook, GovernanceSignedApproval,
  Plan, PlanEvaluation, Rulebook, SignedApproval, TrustedKey,
} from './types';
import { APPROVAL_SPEC, GOVERNANCE_APPROVAL_SPEC } from './types';
import { canonicalJson, fingerprintVersion } from './canonical';
import { evaluate } from './evaluate';
import { evaluatePlan } from './plan';
import { markVerified } from './verified';
import { parseTimestamp } from './vocabulary';

export interface SigningKeys {
  keyId: string;
  /** Raw public key, 32 bytes as hex. Put this in the rulebook's `trustedKeys`. */
  publicKey: string;
  /** The 32-byte seed as hex. Keep it secret; for tests and examples only, see `conformance/approvals.json`. */
  privateKey: string;
}

export interface VerifyResult {
  ok: boolean;
  /** Plain words when not ok. */
  reason?: string;
  /** On success: the verified approval object — the one object the evaluator accepts under `trustedKeys`. Pass it, not a copy, as `facts.approvedBy`. */
  approval?: Approval;
}

const PKCS8_PREFIX = '302e020100300506032b657004220420';
const HEX = /^[0-9a-f]+$/;

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('WebCrypto (globalThis.crypto.subtle) is not available; Node 20+ or a modern browser is needed for signatures.');
  return s;
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Is this a lowercase hex string of exactly `bytes` bytes? */
export function isHexBytes(value: unknown, bytes: number): value is string {
  return typeof value === 'string' && value.length === bytes * 2 && HEX.test(value);
}

async function importPrivate(seedHex: string): Promise<CryptoKey> {
  if (!isHexBytes(seedHex, 32)) throw new Error('A private key is the 32-byte Ed25519 seed as lowercase hex.');
  return subtle().importKey('pkcs8', fromHex(PKCS8_PREFIX + seedHex), { name: 'Ed25519' }, false, ['sign']);
}

async function importPublic(hex: string): Promise<CryptoKey> {
  if (!isHexBytes(hex, 32)) throw new Error('A public key is the raw 32-byte Ed25519 key as lowercase hex.');
  return subtle().importKey('raw', fromHex(hex), { name: 'Ed25519' }, false, ['verify']);
}

/** The bytes that get signed: canonical JSON of everything but `signature` and `verified`. */
export function signedText(value: Record<string, unknown>): string {
  const { signature: _s, verified: _v, ...rest } = value;
  return canonicalJson(rest);
}

/** A fresh Ed25519 key pair. A helper for examples and tests; production keys live in your own key management. */
export async function generateSigningKeys(keyId: string): Promise<SigningKeys> {
  const pair = await subtle().generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as unknown as { publicKey: CryptoKey; privateKey: CryptoKey };
  const pkcs8 = toHex(await subtle().exportKey('pkcs8', pair.privateKey));
  return { keyId, publicKey: toHex(await subtle().exportKey('raw', pair.publicKey)), privateKey: pkcs8.slice(PKCS8_PREFIX.length) };
}

/** The public key for a seed, so a test key can be stated as a seed alone. */
export async function publicKeyOf(privateKey: string): Promise<string> {
  const key = await subtle().importKey('pkcs8', fromHex(PKCS8_PREFIX + privateKey), { name: 'Ed25519' }, true, ['sign']);
  const jwk = await subtle().exportKey('jwk', key);
  return toHex(Uint8Array.from(atob((jwk.x as string).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
}

async function sign(text: string, privateKey: string): Promise<string> {
  return toHex(await subtle().sign('Ed25519', await importPrivate(privateKey), new TextEncoder().encode(text)));
}

async function verify(text: string, signature: string, publicKey: string): Promise<boolean> {
  if (!isHexBytes(signature, 64)) return false;
  return subtle().verify('Ed25519', await importPublic(publicKey), fromHex(signature), new TextEncoder().encode(text));
}

/**
 * Sign an approval under the /3 contract: it names the rule, the rulebook,
 * the participant, the action, the area, a unique nonce and its validity
 * window. `issuedAt`/`expiresAt` are whatever clock the approver's tool has;
 * the core never reads one. The nonce is the signer's: a UUID, or a counter
 * under the key; it must never repeat under that key.
 */
export async function signApproval(approval: Omit<SignedApproval, 'signature' | 'keyId' | 'spec'>, keys: Pick<SigningKeys, 'keyId' | 'privateKey'>): Promise<SignedApproval> {
  for (const field of ['id', 'ruleId', 'rulebookFingerprint', 'participantId', 'action', 'areaId', 'nonce', 'issuedAt', 'expiresAt'] as const) {
    if (typeof approval[field] !== 'string' || !approval[field]) throw new Error(`signApproval: ${field} is required (a non-empty string).`);
  }
  const issued = parseTimestamp(approval.issuedAt), expires = parseTimestamp(approval.expiresAt);
  if (issued === null || expires === null) throw new Error('signApproval: issuedAt and expiresAt must be timestamps with a date ("YYYY-MM-DDTHH:MM", optional seconds and offset).');
  if (expires <= issued) throw new Error(`signApproval: expiresAt (${approval.expiresAt}) must be later than issuedAt (${approval.issuedAt}).`);
  const body: Omit<SignedApproval, 'signature'> = { spec: APPROVAL_SPEC, ...approval, keyId: keys.keyId };
  return { ...body, signature: await sign(signedText(body as unknown as Record<string, unknown>), keys.privateKey) };
}

/**
 * Sign an approval under the /1 contract (`neuroverse-governance-approval/1`,
 * SPEC.md § 16.6): it names the rule, the rulebook, the principal, the
 * participant, the tool, the scope, the digest of the exact arguments
 * (`fingerprint(args ?? {})`), a unique nonce and its validity window.
 */
export async function signGovernanceApproval(approval: Omit<GovernanceSignedApproval, 'signature' | 'keyId' | 'spec'>, keys: Pick<SigningKeys, 'keyId' | 'privateKey'>): Promise<GovernanceSignedApproval> {
  for (const field of ['id', 'ruleId', 'rulebookFingerprint', 'principalId', 'participantId', 'tool', 'scope', 'argsDigest', 'nonce', 'issuedAt', 'expiresAt'] as const) {
    if (typeof approval[field] !== 'string' || !approval[field]) throw new Error(`signGovernanceApproval: ${field} is required (a non-empty string).`);
  }
  if (!isHexBytes(approval.argsDigest, 32)) throw new Error('signGovernanceApproval: argsDigest must be a fingerprint (SHA-256, 64 hex) of the call\'s arguments.');
  const issued = parseTimestamp(approval.issuedAt), expires = parseTimestamp(approval.expiresAt);
  if (issued === null || expires === null) throw new Error('signGovernanceApproval: issuedAt and expiresAt must be timestamps with a date ("YYYY-MM-DDTHH:MM", optional seconds and offset).');
  if (expires <= issued) throw new Error(`signGovernanceApproval: expiresAt (${approval.expiresAt}) must be later than issuedAt (${approval.issuedAt}).`);
  const body: Omit<GovernanceSignedApproval, 'signature'> = { spec: GOVERNANCE_APPROVAL_SPEC, ...approval, keyId: keys.keyId };
  return { ...body, signature: await sign(signedText(body as unknown as Record<string, unknown>), keys.privateKey) };
}

const FIELDS_3 = ['id', 'ruleId', 'rulebookFingerprint', 'participantId', 'action', 'areaId', 'nonce', 'issuedAt', 'expiresAt', 'keyId', 'signature'] as const;
const FIELDS_1 = ['id', 'ruleId', 'rulebookFingerprint', 'principalId', 'participantId', 'tool', 'scope', 'argsDigest', 'nonce', 'issuedAt', 'expiresAt', 'keyId', 'signature'] as const;

/**
 * Verify a signed approval of either contract against the rulebook's trusted
 * keys (or a list of them). Checks: the declared spec and its field set, a
 * trusted key with that keyId, the signature, and that the approval claims
 * no authority or role the key is not trusted for. It does NOT check the
 * binding fields, the window or the nonce — the evaluator does that against
 * the actual request and its `now` — and it does not check `issuedAt`: the
 * core has no clock, so age is the caller's decision.
 */
export async function verifyApproval(approval: unknown, trusted: Rulebook | GovernanceRulebook | TrustedKey[]): Promise<VerifyResult> {
  const keys = Array.isArray(trusted) ? trusted : trusted.trustedKeys ?? [];
  const a = approval as Omit<SignedApproval, 'spec'> & Omit<GovernanceSignedApproval, 'spec'> & { spec?: string; requestDigest?: unknown };
  if (!a || typeof a !== 'object') return { ok: false, reason: 'the approval is not an object' };
  if (a.spec !== APPROVAL_SPEC && a.spec !== GOVERNANCE_APPROVAL_SPEC) {
    if (a.requestDigest !== undefined || fingerprintVersion(a.rulebookFingerprint) === 2) return { ok: false, reason: `this is a robot-domain-rules/2 approval (bound by requestDigest, no nonce or expiry); this implementation is /3 and does not reinterpret it. Have it re-issued as ${APPROVAL_SPEC} (SPEC.md § 11).` };
    return { ok: false, reason: `the approval does not declare spec ${APPROVAL_SPEC} or ${GOVERNANCE_APPROVAL_SPEC}` };
  }
  for (const field of a.spec === APPROVAL_SPEC ? FIELDS_3 : FIELDS_1) {
    if (typeof a[field] !== 'string' || a[field].length === 0) return { ok: false, reason: `the approval has no ${field}` };
  }
  if (fingerprintVersion(a.rulebookFingerprint) !== 3) return { ok: false, reason: 'rulebookFingerprint is not a SHA-256 (64 hex) fingerprint' };
  if (a.spec === GOVERNANCE_APPROVAL_SPEC && !isHexBytes(a.argsDigest, 32)) return { ok: false, reason: 'argsDigest is not a SHA-256 (64 hex) fingerprint of the arguments' };
  const key = keys.find(k => k.keyId === a.keyId);
  if (!key) return { ok: false, reason: `key "${a.keyId}" is not a trusted key` };
  if (a.authority !== undefined && key.authority !== a.authority) return { ok: false, reason: `key "${a.keyId}" is not trusted to approve as authority "${a.authority}"` };
  if (a.roleId !== undefined && key.roleId !== a.roleId) return { ok: false, reason: `key "${a.keyId}" is not trusted to approve as role "${a.roleId}"` };
  if (!(await verify(signedText(a as unknown as Record<string, unknown>), a.signature, key.publicKey))) return { ok: false, reason: 'the signature does not verify' };
  const { signature: _s, verified: _v, requestDigest: _r, ...rest } = a as SignedApproval & { verified?: boolean; requestDigest?: unknown };
  return { ok: true, approval: markVerified({ ...rest, signature: a.signature }) as Approval };
}

/**
 * The recommended entry for a caller's trusted layer: verify whatever signed
 * approval(s) the request carries (`facts.approvedBy`, one approval or a
 * list) against the rulebook's trusted keys, then evaluate. The evaluator
 * itself stays pure and never verifies a signature; an approval that does
 * not verify is passed through unverified, so the decision says why it did
 * not count. The caller still supplies `now` and `consumedApprovals`, and
 * records `decision.approvalsUsed`.
 */
export async function verifyAndEvaluate(rulebook: Rulebook, request: DomainRequest): Promise<DomainDecision>;
export async function verifyAndEvaluate(rulebook: GovernanceRulebook, request: GovernanceRequest): Promise<GovernanceDecision>;
export async function verifyAndEvaluate(rulebook: Rulebook | GovernanceRulebook, request: DomainRequest | GovernanceRequest): Promise<DomainDecision | GovernanceDecision>;
export async function verifyAndEvaluate(rulebook: Rulebook | GovernanceRulebook, request: DomainRequest | GovernanceRequest): Promise<DomainDecision | GovernanceDecision> {
  const facts = request && typeof request === 'object' ? await withVerified(rulebook, request.facts) : undefined;
  return evaluate(rulebook, (request && typeof request === 'object' ? { ...request, facts } : request) as DomainRequest) as DomainDecision | GovernanceDecision;
}

/** The same for a plan: every step's `facts.approvedBy` (and `initialFacts.approvedBy`) is verified first. */
export async function verifyAndEvaluatePlan(rulebook: Rulebook, plan: Plan): Promise<PlanEvaluation>;
export async function verifyAndEvaluatePlan(rulebook: GovernanceRulebook, plan: GovernancePlan): Promise<GovernancePlanEvaluation>;
export async function verifyAndEvaluatePlan(rulebook: Rulebook | GovernanceRulebook, plan: Plan | GovernancePlan): Promise<PlanEvaluation | GovernancePlanEvaluation>;
export async function verifyAndEvaluatePlan(rulebook: Rulebook | GovernanceRulebook, plan: Plan | GovernancePlan): Promise<PlanEvaluation | GovernancePlanEvaluation> {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.steps)) return evaluatePlan(rulebook, plan);
  const steps = await Promise.all((plan.steps as Array<{ facts?: Record<string, unknown> }>).map(async s => (s && typeof s === 'object' && s.facts ? { ...s, facts: await withVerified(rulebook, s.facts) } : s)));
  return evaluatePlan(rulebook, { ...plan, steps, ...(plan.initialFacts && typeof plan.initialFacts === 'object' ? { initialFacts: await withVerified(rulebook, plan.initialFacts) } : {}) } as Plan);
}

/**
 * Replace every approval object in `facts.approvedBy` (one or a list) with
 * the verified object when its signature checks out against the rulebook's
 * trusted keys, else with the same data unverified. Strings (plain
 * approvals) pass through. With no trusted keys nothing is verified: the
 * evaluator then accepts plain approvals (development only).
 */
async function withVerified(rulebook: Rulebook | GovernanceRulebook, facts: Record<string, unknown> | undefined): Promise<Record<string, unknown>> {
  if (!facts || typeof facts !== 'object' || facts.approvedBy === undefined || !rulebook.trustedKeys?.length) return facts as unknown as Record<string, unknown>;
  const one = async (a: unknown): Promise<unknown> => {
    if (!a || typeof a !== 'object' || Array.isArray(a)) return a;
    const r = await verifyApproval(a, rulebook);
    return r.ok ? r.approval : a;
  };
  const a = facts.approvedBy;
  return { ...facts, approvedBy: Array.isArray(a) ? await Promise.all(a.map(one)) : await one(a) };
}

export interface RulebookSignature {
  keyId: string;
  /** The fingerprint that was signed, for the record. The signature covers the whole rulebook, not just this. */
  fingerprint: string;
  signature: string;
}

/** Sign a compiled rulebook: Ed25519 over the canonical JSON of the whole rulebook (fingerprint included). */
export async function signRulebook(rulebook: Rulebook | GovernanceRulebook, keys: Pick<SigningKeys, 'keyId' | 'privateKey'>): Promise<RulebookSignature> {
  return { keyId: keys.keyId, fingerprint: rulebook.fingerprint, signature: await sign(canonicalJson(rulebook), keys.privateKey) };
}

/**
 * Verify a rulebook's signature with a public key you trust from outside the
 * rulebook (pinned in your deployment). The rulebook's own `trustedKeys` are
 * for approvals; a rulebook cannot vouch for itself.
 */
export async function verifyRulebookSignature(rulebook: Rulebook | GovernanceRulebook, signature: RulebookSignature | string, publicKey: string): Promise<boolean> {
  const sig = typeof signature === 'string' ? signature : signature.signature;
  if (!rulebook || typeof rulebook !== 'object') return false;
  return verify(canonicalJson(rulebook), sig, publicKey);
}
