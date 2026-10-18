# Known gaps

What this layer does not do yet, or does not do at all, said plainly. Each item says what happens today and whose job the rest is.

## Overlapping or nested areas

A request names one `areaId`. If your spatial system reports that a participant is inside several volumes at once (a nested "cold aisle" inside "aisle 5"), the rulebook has no notion of containment and will not combine them for you.

**Interim rule:** evaluate once per area the participant is in and combine: the status is the strictest (`ALLOW < LIMIT < PAUSE < BLOCK`); every area's limits apply (the minimum per name, kept even when another area pauses — a PAUSE does not lift a ceiling); every area's approval requests are collected, so the planner can gather them all; every area's `approvalsUsed` is recorded; every trace is kept.

```ts
import { evaluateDomainAction, SEVERITY, type ApprovalRequest, type DomainDecision, type DomainRequest, type Rulebook } from '@neuroverseos/robot-domain-rules';

/** One decision over several areas: strictest status, min of every limit, every approval request, every trace. */
function acrossAreas(rulebook: Rulebook, base: Omit<DomainRequest, 'areaId'>, areaIds: string[]): DomainDecision & { perArea: Record<string, DomainDecision> } {
  const perArea = Object.fromEntries(areaIds.map(areaId => [areaId, evaluateDomainAction(rulebook, { ...base, areaId })]));
  const decisions = Object.values(perArea);
  const status = decisions.reduce((s, d) => (SEVERITY[d.status] > SEVERITY[s] ? d.status : s), 'ALLOW' as DomainDecision['status']);
  const limits: Record<string, number> = {};
  for (const d of decisions) for (const [k, v] of Object.entries(d.limits ?? {})) limits[k] = k in limits ? Math.min(limits[k], v) : v;
  const approvalRequests: ApprovalRequest[] = decisions.flatMap(d => d.approvalRequests ?? []);
  const approvalsUsed = decisions.flatMap(d => d.approvalsUsed ?? []);
  return {
    status,
    reasons: decisions.flatMap(d => d.reasons.filter(r => r.status === status)),
    ...(Object.keys(limits).length && (status === 'ALLOW' || status === 'LIMIT') ? { limits } : {}),
    ...(status === 'PAUSE' && approvalRequests.length ? { approvalRequests } : {}),
    ...((status === 'ALLOW' || status === 'LIMIT') && approvalsUsed.length ? { approvalsUsed } : {}),
    ...(status === 'BLOCK' ? { then: decisions.find(d => d.then)?.then } : {}),
    trace: decisions.flatMap(d => d.trace),
    fingerprint: rulebook.fingerprint,
    perArea,
  };
}
```

A limit is reported only when the combined status is ALLOW or LIMIT, as for one decision; when the status is PAUSE the limits are still in `perArea` for the controller to honour once the wait clears. A first-class answer (area containment in the rulebook, one decision over a set of areas) is a spec change and not scheduled.

## Fact provenance and freshness

The engine trusts every fact as given and has no idea how old it is or where it came from. `request.now` is the caller's clock; a people count from two minutes ago is accepted as current. Provenance (which sensor, when, how confident) and freshness windows belong in the harness that assembles the request. The rule stands: facts come from the harness, never from the requester.

## Robot-to-robot coordination

Two robots asking at the same moment each get a decision on the facts each request carries; nothing here serialises them, reserves space, or orders traffic. That is a traffic layer's job (Open-RMF or your own). A count fact such as `robotsInZone` lets a rule say "no more than two", but keeping that count right under concurrency is the spatial system's.

## Authority is not yet bound to domain ownership or identity

`setBy` and `trustedKeys` are declared in the rulebook, and the rulebook is validated by a fingerprint and optionally a pinned signing key. Nothing ties an authority to an owner of the spatial domain, to a login, or to an organisation's identity provider. Without `trustedKeys`, an approval's authority is whatever the request says it is. Those are deployment and product questions this layer leaves open.

## No exceptions: a higher authority cannot loosen a lower rule either

Strictest-wins is absolute. A higher authority writing an `allow` does not lift a lower authority's `deny` — the deny still matches and still wins (and the check reports the pair as `tightening`). The only ways to make a one-off exception are to change the rule (narrow its scope, add a condition on a fact the harness reports) or to design the rule as a `wait` for approval by that authority. A rule-level exception mechanism (an override with its own authority and audit trail) is a spec change and not scheduled.

## Rulebook pinning and revocation per domain

A deployment must decide which rulebook is in force for which domain, how a new one replaces it, and how an old one (or a compromised approver key) is revoked. The layer gives the pieces — fingerprint, signature with a pinned key, `trustedKeys` — not the policy or the distribution.

## No persistence, versioning or distribution

Rulebooks, decision logs, consumed-nonce sets and approvals are plain data; nothing here stores, versions, syncs or serves them. A product does that.

## Replay protection depends on the caller's set

An approval is single-use only if the caller keeps the `consumedApprovals` set it is told about (`decision.approvalsUsed`). Without it, an approval can be re-used until it expires. The engine is pure and cannot keep the set for you.

## The conflict analysis does not model history conditions

A rule with `history` conditions is reported as `possible` against anything it overlaps on facts, with no witness. Exact analysis of history windows would need a model of the caller's history; not scheduled.

## The plain-text drafter is a convenience, not an editor

It handles the simple forms and refuses to guess beyond them: counts are not speeds and bind entering only; an exception word (unless, except, but), a comparison it cannot turn into a limit, a condition it cannot read, or a "no ..." whose verb is not a declared action produces no draft at all rather than a rule on everything. A draft it is confident in is `confidentDraft`; that is the drafter's confidence in its own reading, not a safety claim — a person reads every draft before it goes in, and the switchboard asks them to say so. A real editor should use the model path (`buildRuleDraftPrompt` + `parseRuleDraft`), where the model proposes structured JSON and the validator refuses what the site did not declare, with the same human read before confirming.

## The semantic-volumes adapter reads the Home collection only

`examples/harness/volumes-to-areas.ts` reads the `{ schema, frame, items: [{ id, title, description, semantic_type, center, size, yaw }] }` collection the domain harness stores, in every UUID form the Rust `uuid` crate parses. The SDK/mobile variant (`name`, `position`, `dimensions`) is not read; its exact shape was not available to copy from, and the adapter will not guess at it.

## Validation re-derives what it can; a signature protects the rest

`validateRulebook` recomputes the area role-limit never rules and the findings and refuses a rulebook where either was removed or altered, whatever its fingerprint says. It cannot recompute the rules themselves: a rule changed by hand with the fingerprint recomputed validates. Only a rulebook signature verified against a key pinned outside the rulebook catches that (BOUNDARY.md).
