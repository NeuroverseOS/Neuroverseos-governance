/**
 * The verified-approval registry — the one thing request data can never forge.
 *
 * A request is JSON from somewhere else. Nothing in it can assert that a
 * signature was checked: a `verified: true` member is ignored wherever it
 * arrives. What the evaluator trusts instead is object identity: an approval
 * object that `verifyApproval` itself produced after the signature checked
 * out is registered here, in a WeakSet that no serialisation can enter and
 * no caller can add to except through `verifyApproval`. The evaluator asks
 * `isVerified(object)`; a copy, a spread, a JSON round trip or a hand-built
 * object with the same fields is not in the set and does not count.
 *
 * Pure in the sense that matters: the registry holds no decision state and
 * nothing is read from it but membership. (SPEC.md § 9.3.)
 */

const VERIFIED = new WeakSet<object>();

/** Register an approval object as verified. Called by `verifyApproval` only. */
export function markVerified<T extends object>(approval: T): T {
  VERIFIED.add(approval);
  return approval;
}

/** Is this the very object `verifyApproval` returned after a successful check? */
export function isVerified(approval: unknown): boolean {
  return typeof approval === 'object' && approval !== null && VERIFIED.has(approval);
}
