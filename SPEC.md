# robot-domain-rules — specification

```
spec: robot-domain-rules/3
rulebook format string: neuroverse-domain-rules/3
approval contract: robot-domain-rules-approval/3
```

This document is normative. It defines the rulebook, request, decision, plan, finding and approval formats, the decision algorithm, the plan algorithm, the conflict analysis, authority, and the canonical encoding another implementation must reproduce byte for byte. The words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119. Everything stated here is checked by the cases in [`conformance/`](conformance/); an implementation conforms when it passes them all. The TypeScript package in this repository is the reference implementation.

Out of scope, and deliberately so: how a rulebook is *built* (templates, questions, plain-text drafting, the builder) is tooling of the reference implementation. The rulebook is the portable artifact; an implementation needs only to validate it, decide with it (one action or a whole plan), check it for conflicts, fingerprint it, and handle approvals. JSON Schemas for every format are in [`spec/`](spec/). § 14 says which parts a client needs and what a port must get right.

**What changed in `/3` (from `/2`), and the migration.** The fingerprint is SHA-256 over the UTF-8 bytes of RFC 8785 canonical JSON, 64 hex digits (was 64-bit FNV-1a over UTF-16 code units, 16 hex), and it no longer covers `findings` (§ 8). The approval contract is new: an approval names the rule it clears, the rulebook, the participant, the action and the area, carries a unique `nonce`, an `issuedAt` and a required `expiresAt`, and never binds to the facts (§ 9). History windows run on absolute time: `history[].at` is a timestamp with a date, measured back from the new `request.now`; the `clock` member of a history condition is gone (§ 3.4, § 4). A plan step may not change area without an action that moves there (§ 12). The conflict analysis compares limit rules on every shared limit name and reports only clashes a lawful request can reach (§ 7). `plan_area_continuity` joins the built-in checks. **Versions are explicit and never reinterpreted** (§ 11): a `/2` rulebook, fingerprint or approval is refused with a message that names its version and the migration — recompile the rulebook from its input with a `/3` compiler, drop `clock` from history conditions, give history entries dated timestamps, and re-issue approvals under the `/3` contract.

## 1. Vocabulary

Identifiers (`id` fields of actions, areas, roles, facts, limits, authorities, trusted keys) are non-empty strings with no whitespace and none of `*`, `!`, `:`. Rule IDs are non-empty strings (they may contain `:`, as `area_role_limits:<area>` does).

A **fact value** is a JSON number, string or boolean.

A **time** is `"HH:MM"`, 24-hour, zero-padded (`^([01]\d|2[0-3]):[0-5]\d$`). A **day** is one of `mon tue wed thu fri sat sun`.

A **timestamp** is ISO 8601 with a date: `YYYY-MM-DDTHH:MM`, optional `:SS` and `.fraction`, optional `Z` or `±HH:MM` offset (`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?$`), calendar-valid. **Without an offset it is read as UTC**, so every implementation reads the same instant. Timestamps are compared as instants **at millisecond resolution: a fraction longer than three digits is truncated** (`09:30:00.0009` is the instant `09:30:00.000`), so a platform with finer ticks must truncate before comparing (cases `approvals-sub-millisecond-*`). Years `0000`–`0099` are those years. A timestamp's **wall-clock time** is the `HH:MM` written in it, in its own offset (§ 12).

## 2. Rulebook

A rulebook is one JSON object ([`spec/rulebook.schema.json`](spec/rulebook.schema.json)):

| Field | Type | Req | Meaning |
|---|---|---|---|
| `format` | `"neuroverse-domain-rules/3"` | yes | The declared version. Any other value is refused (§ 11). |
| `site` | `{ id, name, spatialDomainId?, hours?: { open, close } }` | yes | `hours` are times; `close` earlier than `open` means overnight. |
| `template` | string | no | The template it was built from. Informational. |
| `kinds` | string[] | yes | Participant kinds (`robot`, `person`, `agent`, …). MUST include every kind any role or action names. |
| `authorities` | `{ id, name? }[]` | yes, ≥1 | **Highest first.** Unique IDs. |
| `actions` | `{ id, name?, kinds (≥1), tags?, requires?, effects?, synonyms? }[]` | yes | `requires`: fact IDs that MUST be present when this action is requested. `effects`: what the action does to the facts when a plan is projected (§ 2.1); unused by the single-action decision. |
| `areas` | `{ id, name, tags?, allowRoles?, denyRoles?, synonyms? }[]` | yes, ≥1 | `allowRoles`/`denyRoles` compile to the never rules `area_role_limits:<area>` and `area_role_limits:<area>:deny` (§ 2.2). Validation re-derives them from the areas and requires them present and unchanged; the id prefix `area_role_limits:` is reserved for them. |
| `roles` | `{ id, name, kind, actions, inherits?, tags?, synonyms? }[]` | yes, ≥1 | `actions` is the **full** list (inheritance already resolved). Every listed action MUST declare the role's kind in its `kinds`. |
| `facts` | `{ id, type, required?, default?, min?, max?, integer?, values?, description?, synonyms? }[]` | yes | `type` ∈ `number boolean time day enum string`. A fact MUST NOT be both `required` and have a `default`. `min/max/integer` only on numbers; `values` (≥1) required for enums. `default` MUST be valid for the type. The ID `approvedBy` is reserved and MUST NOT be declared. |
| `limits` | `{ id, name?, unit?, requestedFact?, appliesTo?, synonyms? }[]` | yes | `requestedFact` MUST name a declared `number` fact. |
| `tags` | `{ actions: string[], areas: string[], roles: string[] }` | yes | Tags rules may name even when nothing carries them yet. |
| `answers` | `{ [questionId]: string }` | yes | Informational. |
| `otherwise` | `"deny"` \| `"wait-for-approval"` | yes | What an undeclared action gets. |
| `trustedKeys` | `{ keyId, publicKey, authority?, roleId? }[]` | no | See § 9. `publicKey` is 32 bytes lowercase hex; `authority`/`roleId` MUST be declared. Declaring any key (non-empty list) switches approvals to signed-only. |
| `rules` | Rule[] | yes | § 3. IDs unique across `rules` and `planRules`. |
| `planRules` | PlanRule[] | no | § 3.5. Present only when non-empty. |
| `builtin` | `{ id, text }[]` | yes | MUST include `required_facts`, `area_declared`, `role_declared`, `role_permits_action`, `unknown_action`, `plan_area_continuity`. |
| `findings` | Finding[] | yes | § 7. What the conflict check found; MAY be empty; MUST NOT be hidden — and validation checks that: it re-runs the check and compares (kind, severity, rule IDs, certainty, a valid witness; messages are free). **Not covered by the fingerprint** (their messages are free text). |
| `fingerprint` | 64 lowercase hex | yes | § 8.2, over everything above except `findings`. |

### 2.1 Effects

An effect is one of:

| Effect | Meaning when a plan is projected (§ 12) |
|---|---|
| `{ op: "set", fact, value }` | the fact becomes `value`; `value` MUST be valid for the fact's type |
| `{ op: "add", fact, value }` | a `number` fact goes up by `value` (finite; a whole number if the fact is `integer`) |
| `{ op: "subtract", fact, value }` | a `number` fact goes down by `value` (same constraints) |
| `{ op: "move" }` | after this step the participant is in the step's area |

`fact` MUST be a declared fact. Effects are not clamped to the fact's range: a projected value outside it makes the next step BLOCK `required_facts`.

### 2.2 Derived content

Two parts of a rulebook are derived from the rest and are not covered by the fingerprint's protection against meaning change in the way the rules are: the **area role-limit never rules** (derivable from `areas[].allowRoles/denyRoles`, `roles` and `authorities`) and the **findings** (derivable from the rules by § 7). An attacker who recomputes the fingerprint could drop either. So validation RE-DERIVES both and compares. For each area with `denyRoles`, the rule `{ id: "area_role_limits:<area>:deny", never: true, setBy: <declaration authority>, text: "<role names> may never act in <area name>.", who: denyRoles, does: "*", where: <area id>, then: { answer: "deny" }, reason: <same as text>, source: { kind: "declaration", ref: "area:<area>.denyRoles" } }`; for each area with `allowRoles` and at least one other role, `{ id: "area_role_limits:<area>", never: true, setBy, text: "<area name> is limited to: <allowRoles joined by ', '>.", who: <every role id not in allowRoles, in declaration order>, does: "*", where: <area id>, then: { answer: "deny" }, reason: <same as text>, source: { kind: "declaration", ref: "area:<area>.allowRoles" } }`, where the declaration authority is `site-manager` if declared, else the last (lowest) authority, and role names are the roles' `name`s joined by `", "`. Each such rule MUST be present in `rules` and equal (as canonical JSON) to the derived one; no other rule may use the `area_role_limits:` prefix. The findings MUST equal, as a multiset of `(kind, severity, ruleIds, certainty)`, what § 7 produces for the rulebook, every `certain` finding between two rules MUST carry a witness that matches both (§ 6 step 4), and no other finding may carry one; messages are free. (Reference: `validateRulebook`; cases: `conformance/integrity.json`.) A rulebook signature (§ 9.6) protects everything, derived or not, in transit; validation protects the meaning of what is derived.

**Validation.** An implementation MUST reject (refuse to decide with) a rulebook that violates any MUST in this document, including: a format other than `neuroverse-domain-rules/3` (a `/1` or `/2` format MUST be refused with a message naming that version and the migration, § 11 — and the evaluator, the plan evaluator, the conflict check and the backtest MUST refuse it the same way, § 11); a derived never rule missing or altered, or findings that do not match the check (§ 2.2); empty or duplicate authorities; a rule referencing an undeclared role, action, area, tag, kind, fact, limit or authority; a rule whose conditions on one fact can never all hold; a never rule that does not deny; a rule conditioning on a fact that is neither required nor defaulted; a `limit` outcome naming an unknown limit or a value below 0; a `wait.by` that is not an authority, a role, or `tag:<declared role tag>`; `wait.by` on a condition wait; a trusted key with a malformed public key or an undeclared authority/role; an `otherwise` outside the two values; an effect on an undeclared fact or of the wrong type; a history condition that is malformed or carries the `/2` member `clock` (§ 3.4); a plan rule that is malformed or shares an ID with a rule (§ 3.5); an empty `planRules` list; a fingerprint that does not match (a 16-hex fingerprint never matches). (Reference: `validateRulebook`; cases: every `expect.error` case, `conformance/versions.json`.)

## 3. Rule

```json
{ "id": "no_restock_saturday_pm",
  "text": "no restock robots in aisle 3 on Saturdays between 14:00 and 16:00",
  "who": "restock_robot", "does": "*", "where": "aisle-3",
  "when": [ { "fact": "localTime", "op": "between", "from": "14:00", "to": "16:00" },
            { "fact": "day", "op": "days", "days": ["sat"] } ],
  "then": { "answer": "deny" },
  "reason": "No restocking in aisle 3 on Saturday afternoons.",
  "setBy": "site-manager",
  "source": { "kind": "text", "ref": "no restock robots in aisle 3 on Saturdays between 14:00 and 16:00" },
  "never": false }
```

| Field | Req | Meaning |
|---|---|---|
| `id`, `text` | yes | Stable ID cited in decisions; the rule in plain words. |
| `who`, `does`, `where` | yes | Selectors (§ 3.1) over roles, actions, areas. |
| `when` | no | Conditions (§ 3.2), AND-ed. Absent or empty = always. Each fact named MUST be required or have a default. |
| `history` | no | History conditions (§ 3.4), AND-ed with `when`. |
| `then` | yes | Outcome (§ 3.3). |
| `reason` | no | Shown in decisions; defaults to `text`. |
| `setBy` | yes | A declared authority ID. The level the space granted the author, whoever or whatever that is. |
| `source` | yes | `{ kind, ref }`, kind ∈ `template question declaration manual text agent system builtin`. Provenance only; it carries no weight. |
| `never` | no | `true` marks an invariant: checked before anything else, nothing overrides it. MUST have `then.answer == "deny"`. |

### 3.1 Selectors

A selector is a string or a non-empty list of strings. Each entry is one of:

| Entry | Means |
|---|---|
| `*` | everything in the universe (all roles / all actions / all areas) |
| `<id>` | that declared ID |
| `tag:<t>` | every role / action / area carrying tag `t` |
| `kind:<k>` | (`who`) every role of kind `k`; (`does`) every action listing `k` in `kinds`; (`where`) not allowed |
| `!<entry>` | remove that entry's expansion |

Resolution to a set of IDs: trim entries and drop empty ones. Positives are entries not starting with `!`; negatives the rest, without the `!`. If there are no positives, or any positive is `*`, start from the whole universe; otherwise start from the union of the positives' expansions. Then remove the expansion of every negative. Entries referring to undeclared things make the rulebook invalid. A selector is **open** when it has no positives or a positive `*`.

### 3.2 Conditions

| Form | Facts it applies to | True when |
|---|---|---|
| `{ fact, op: "==" \| "!=", value }` | any | strict equality / inequality of the fact value and `value` |
| `{ fact, op: ">" \| ">=" \| "<" \| "<=", value }` | number, time, day | ordinal comparison: numbers by value; times by minutes since midnight; days by position mon=0 … sun=6. MUST NOT be used on boolean, enum or string. |
| `{ fact, op: "in", values[] }` | any | the fact value is strictly equal to a member of `values` (≥1) |
| `{ fact, op: "between", from, to }` | time only | with `t`, `f`, `o` in minutes: if `f < o`: `f <= t < o`; if `f > o` (overnight): `t >= f or t < o`. `f == o` is invalid. |
| `{ fact, op: "days", days[] }` | day only | the fact is a member of `days` (≥1) |

`value`/`values` MUST be valid values of the fact's type.

### 3.3 Outcomes

| `then` | Meaning |
|---|---|
| `{ answer: "allow" }` | go ahead |
| `{ answer: "limit", limits: { <limitId>: number ≥ 0, … } }` | go ahead within these ceilings (≥1 entry) |
| `{ answer: "wait", for: "approval", by? }` | a person (or key) holding `by` must approve this request. `by` is an authority ID (that authority **or any higher one**), a role ID, or `tag:<role tag>`. Absent: anyone. |
| `{ answer: "wait", for: "condition" }` | the facts must change; no approval clears it |
| `{ answer: "deny", instead? }` | no; `instead` is a hint ("dock") surfaced as `decision.then` |

### 3.4 History conditions

```json
{ "actions": "scan", "areas": "tag:aisle", "sameArea": true, "withinMinutes": 60, "op": ">=", "value": 5 }
```

| Field | Req | Meaning |
|---|---|---|
| `actions` | yes | Selector over actions (§ 3.1). Entries of the history whose action is in it count. |
| `areas` | no | Selector over areas. Only entries in these areas count. |
| `sameArea` | no | Only entries in the request's own area count. |
| `withinMinutes` | no | 1–1440. Only entries whose `at` satisfies `0 <= (now − at) <= withinMinutes` minutes count, where `now` is `request.now` and both are instants (§ 1). An entry later than `now` does not count. |
| `op`, `value` | yes | `op` ∈ `== != > >= < <=`; `value` a whole number ≥ 0. The condition holds when `count op value`. |

The `/2` member `clock` MUST NOT be present (the rulebook is invalid). History is what the caller supplies (§ 4); the engine keeps none and has no clock: a window needs `request.now`. The conflict analysis does not model history conditions (§ 7.2).

### 3.5 Plan rules

A plan rule judges the shape of a whole plan (§ 12) and can only reject:

```json
{ "id": "end_at_dock", "text": "Every robot plan ends at a charging dock.", "who": "kind:robot",
  "check": { "kind": "ends_in", "areas": "tag:dock" }, "setBy": "site-manager", "source": { "kind": "manual", "ref": "end_at_dock" } }
```

| `check.kind` | Fields | The plan breaks it when… |
|---|---|---|
| `ends_in` | `areas` (selector) | the area the last step leaves the participant in is not in `areas` |
| `ends_with` | `actions` (selector) | the last step's action is not in `actions` |
| `before` | `first`, `then` (selectors), `sameArea?` | some step whose action is in `then` has no earlier step (in the plan, or in `plan.history`) whose action is in `first` — in the same area, when `sameArea` |
| `at_most` | `actions` (selector), `count` (whole number ≥ 0) | more than `count` steps have an action in `actions` |

`id`, `text`, `who`, `setBy`, `source` and `reason` are as for a rule. `who` selects roles; a plan rule applies to a plan whose participant's role it selects. IDs are unique across rules and plan rules.

## 4. Request

[`spec/request.schema.json`](spec/request.schema.json)

```json
{ "participant": { "id": "robot-7", "kind": "robot", "roleId": "inventory_robot" },
  "action": "move",
  "areaId": "aisle-3",
  "facts": { "peopleInZone": 2, "localTime": "14:05", "requestedSpeedMps": 1.0, "approvedBy": … },
  "history": [ { "action": "scan", "areaId": "aisle-3", "at": "2026-10-12T13:40:00Z" } ],
  "now": "2026-10-12T14:05:10Z",
  "consumedApprovals": [ "dana-glasses-17" ] }
```

`zoneId` is accepted as a deprecated alias of `areaId`; a top-level `targetRobotId` is copied into `facts.targetRobotId` when that is absent. `facts` carries the declared facts by ID plus the built-in `approvedBy` (§ 9): a non-empty string (an unqualified approval), an approval object, or a non-empty list of those — each approval clears at most one wait. Undeclared facts are ignored. A request is never a reason to throw: every malformed request yields a BLOCK decision. `participant.id` MUST be non-empty when an approval is needed (an approval binds to the participant); the evaluator decides a request without one when no approval is involved, and the schema describes a well-formed request as always naming it.

`history` (optional) is a list of `{ action, areaId, at? }` — what this participant did recently, as the caller reports it; `at` is a timestamp (§ 1). It is needed only when a rule in scope has history conditions (§ 6 step 3).

`now` (optional) is a timestamp: the instant of the request, from the caller's trusted layer — the engine has no clock. It is needed when a rule in scope has a window, and whenever a signed approval is to be judged. `consumedApprovals` (optional) lists the nonces of approvals the caller has already acted on (§ 9.5).

**Every fact, `history`, `now` and `consumedApprovals` MUST come from the caller's trusted layer (the harness, the spatial system, the fleet manager), never from the participant or agent that asks.** The engine trusts them as given.

## 5. Decision

[`spec/decision.schema.json`](spec/decision.schema.json)

```json
{ "status": "LIMIT",
  "reasons": [ { "ruleId": "robots_near_people", "status": "LIMIT", "reason": "…", "setBy": "law-and-safety" } ],
  "limits": { "maxSpeedMps": 0.3 },
  "then": "dock",
  "approvalRequests": [ { "ruleId", "by"?, "rulebookFingerprint", "participantId", "action", "areaId", "reason", "setBy" } ],
  "approvalsUsed": [ { "ruleId": "robots_restricted_zones", "nonce": "dana-glasses-17" } ],
  "trace": [ …every check that ran, in order… ],
  "fingerprint": "fb1e4760…dfc8" }
```

Statuses, strictest last: `ALLOW < LIMIT < PAUSE < BLOCK`. A **check** is `{ ruleId, status, reason, setBy }`; `setBy` is `"builtin"` for the evaluator's own checks. One built-in check is not in the rulebook's `builtin` list: `rulebook_version`, the refusal of a rulebook of another format (§ 11) — a refused rulebook's own list cannot be trusted, and adding it to `builtin` would change every fingerprint. A decision with that reason carries the refused rulebook's claimed `fingerprint` string (or `""`). `reasons` are the checks at the strictest status, in trace order. `limits` is present iff some limit rule matched and the status is ALLOW or LIMIT. `then` is present iff the status is BLOCK and a matching deny rule had `instead` (the first one, never rules first). `approvalRequests` is present iff the status is PAUSE and at least one approval wait is unmet (§ 6 step 8). `approvalsUsed` is present iff the status is ALLOW or LIMIT and a signed approval cleared a wait: the caller records each nonce as consumed once it acts (§ 9.5). `fingerprint` is the rulebook's. The `reason` texts are free-form.

## 6. The decision algorithm

Pure and synchronous: no clock, no I/O, no model. `check(id, status, reason, setBy = "builtin")` appends to the trace. "Stop" means go to step 10.

```
 0. The rulebook MUST have passed validation (§ 2). Let V be its vocabulary.

 1. Shape. Collect problems: request not an object; participant missing;
    participant.kind not a non-empty string in rulebook.kinds; participant.roleId
    not a non-empty string; areaId (or zoneId) not a non-empty string; action not a
    non-empty string; facts not an object. If any: check("required_facts", BLOCK); stop.

 2. Area. If areaId is not a declared area: check("area_declared", BLOCK); stop.
    Role. If roleId is not a declared role, or its kind != participant.kind:
    check("role_declared", BLOCK); stop.

 3. Facts. Let A = the action's definition if declared (may be absent). For each
    declared fact F:
      if request.facts[F.id] is absent (undefined):
        if F.required or F.id ∈ A.requires: problem "F.id is required"
        else if F has a default: facts[F.id] = default
        else: skip
      else if the value is not valid for F (type; number finite, integer, min, max;
        time format; day set; enum values; string non-empty): problem
      else facts[F.id] = value.
    now: absent → none; present but not a timestamp → problem.
    consumedApprovals: absent → empty; present but not a list of strings → problem.
    approvedBy: absent → none. A non-empty string s → one approval { id: s }. An
    object with a non-empty string id → one approval: copy id, authority (MUST be a
    declared authority), roleId (MUST be a declared role), and the string members
    spec, ruleId, rulebookFingerprint, participantId, action, areaId, nonce, keyId,
    issuedAt, expiresAt, signature, requestDigest (each MUST be a string when given);
    a `verified` member is IGNORED (it is request data; § 9.3); note whether the
    object is a verified handle (§ 9.3). A non-empty list → each entry as above, in
    order. Any other shape (an empty list, a member of another shape) → problem. If
    the rulebook has trusted keys and any approval is an object and now is absent:
    problem "now is required".
    History. Let N = the rules with a non-empty `history` whose three selectors
    cover this request (the selector part of step 4). If N is non-empty:
      if request.history is absent: problem "history is required"
      else if it is not a list, or an entry is not { action, areaId, at? } with
        non-empty strings and a timestamp when `at` is given, or some rule in N
        has withinMinutes and an entry lacks `at`: problem.
      if some rule in N has withinMinutes and now is absent: problem "now is required".
    If any problem: check("required_facts", BLOCK); stop.

 4. Matching. Rule R matches when:
      resolve(R.who, roles) contains role.id, and
      if A exists: resolve(R.does, actions) contains action
      else: R.does is open and R.does does not contain the entry "!<action>", and
      resolve(R.where, areas) contains area.id, and
      every condition in R.when holds for `facts` (§ 3.2), and
      every condition in R.history holds for request.history at now (§ 3.4).

 5. Never rules. For each rule with never == true, in rulebook order, that matches:
    check(R.id, BLOCK, R.reason ?? R.text, R.setBy); if R.then.instead and `then`
    unset: then = R.then.instead. If any matched: stop.

 6. The action. Let M = non-never rules that match, in rulebook order. If A is
    absent and otherwise == "wait-for-approval", or some R in M has
    then = wait/approval, and participant.id is not a non-empty string:
    check("required_facts", BLOCK, "participant.id is required when an approval
    is needed"); stop.
    If A is absent:
      if rulebook.otherwise == "deny": check("unknown_action", BLOCK); stop
      else: APPROVAL("unknown_action", by = none, setBy = "builtin")   (step 8)
    else if action ∉ role.actions: check("role_permits_action", BLOCK); stop
    else: check("role_permits_action", ALLOW).

 7. Matching rules. effective = {}; for each R in M with answer "limit", for each
    (name, v) in R.then.limits: effective[name] = min(effective[name], v).
    For each R in M:
      allow:            check(R.id, ALLOW, reason, R.setBy)
      deny:             check(R.id, BLOCK, reason, R.setBy); set `then` as in step 5
      wait/condition:   check(R.id, PAUSE, reason, R.setBy)
      wait/approval:    APPROVAL(R.id, R.then.by, R.setBy)
      limit:            status = ALLOW; for each (name, v) in R.then.limits:
                          if v > effective[name]: this name is not the tightest; ignore it
                          else let asked = facts[limitDef(name).requestedFact] (absent if no requestedFact):
                            if asked is absent or asked > v: status = LIMIT
                        check(R.id, status, reason, R.setBy)

 8. APPROVAL(ruleId, by, setBy):
      ask() = append { ruleId, by (omitted when none), rulebookFingerprint:
                       rulebook.fingerprint, participantId: participant.id, action,
                       areaId: area.id, reason, setBy } to approvalRequests.
      if there are no approvals: check(ruleId, PAUSE, …, setBy); ask(); return.
      For each approval in order that has not already cleared a wait in THIS
      decision (each approval clears at most one wait), the approval is BOUND only
      when every one of these holds (the first failure is that approval's reason):
        it is not a /2 approval — one with requestDigest, or a 16-hex
             rulebookFingerprint — and its spec, if given, is
             "robot-domain-rules-approval/3"   (refused by name with or without
             trusted keys, § 11)
        and, when rulebook.trustedKeys is a non-empty list:
        approval.spec == "robot-domain-rules-approval/3"
        the approval is a VERIFIED HANDLE: the very object verifyApproval returned
             (§ 9.3). Nothing in request data can satisfy this; `evaluate` alone on a
             trusted-keys rulebook therefore never clears a wait, and says to use
             verifyAndEvaluate.
        approval.ruleId == ruleId
        approval.rulebookFingerprint == rulebook.fingerprint
        approval.participantId == participant.id, approval.action == action,
             approval.areaId == area.id
        approval.nonce is a string not in consumedApprovals
        issuedAt and expiresAt are timestamps and issuedAt <= now < expiresAt
      sufficient =
        by is none → true
        by is a declared authority → approval.authority is set and
             rank(approval.authority) <= rank(by)   (rank 0 = highest)
        by == "tag:" + t → approval.roleId names a role whose tags include t
        otherwise (by is a role ID) → approval.roleId == by
      The first approval that is bound and sufficient is spent on this wait:
             check(ruleId, ALLOW, …, setBy); if its nonce is set: append
             { ruleId, nonce } to approvalsUsed; return.
      None: check(ruleId, PAUSE, …, setBy) with every approval's reason; ask().

 9. (nothing)

10. Finish. status = the strictest status in the trace (ALLOW if the trace is
    empty — it never is). reasons = trace entries with that status, in order.
    Include limits = effective iff effective is non-empty and status ∈ {ALLOW, LIMIT}.
    Include then iff set and status == BLOCK. Include approvalRequests iff non-empty
    and status == PAUSE. Include approvalsUsed iff non-empty and status ∈ {ALLOW, LIMIT}.
    fingerprint = rulebook.fingerprint.
```

Consequences worth stating: a missing or invalid fact is never permission (step 3); an approved unknown action still faces every never rule and every matching rule (steps 5–7); **an approval clears only the approval wait of the rule it names, and clears at most one wait** — approvals never clear a condition wait, never a deny, never a never rule, and every other check runs on the facts the request carries now (step 7); two waits need two approvals (`approvedBy` as a list); the strictest answer always wins, so a looser rule from a lower authority has no effect even before the conflict check names it.

## 7. Conflict analysis

`check(rulebook) → Finding[]` ([`spec/findings.schema.json`](spec/findings.schema.json)). A finding is `{ kind, severity, ruleIds: [first, second], certainty, witness?, message }` with kind ∈ `contradiction authority-override tightening shadowed duplicate limit_disagreement never_vs_rule unmatched_selector`, severity ∈ `conflict warning info`, certainty ∈ `certain possible`. `message` is free-form and SHOULD name which rule wins and which never takes effect. A rulebook of another format is refused by name (§ 11), never checked.

**Unmatched selectors (one rule, § 7.6).** Before the pairs, every rule is checked on its own: a positive or negative selector entry `tag:<t>` that no declared thing carries, `kind:<k>` that no role (for `who`) or action (for `does`) has, or a whole selector that resolves to the empty set (an exclusion removed everything) is a `unmatched_selector` finding, severity `warning`, certainty `certain`, `ruleIds: [the rule]`, no witness. The rule still validates (a template may declare the tag; exclusions are legal) and still binds what it does resolve. **Tags match exactly, case included**; when a tag matches a declared tag only with case ignored, the message names it as the likely intent. Order: these findings come first, in rule order.

**Why this is tractable, and what "complete" means.** A rule's conditions are AND-ed and each names ONE fact; facts are independent. So the set of requests matching a rule is a product of per-fact sets, each of a shape with exact intersection, emptiness and subset (§ 7.1), and "can two rules both match one request" reduces to per-fact intersections — no search, no enumeration over facts, no size bound. The analysis is **complete for that question**: two rules are reported if and only if some lawful request (§ 7.2) matches both. It does not reason about which rule a decision finally reaches when others intervene — a reported pair may, on a given request, both be outranked by a third rule; strictest-wins at decision time settles that, and the finding's `message` says only who wins between the two. History conditions are not modelled (§ 7.2).

### 7.1 Scope and constraints

The **scope** of a rule is `(roles, actions, areas, when)` with the three selectors resolved to ID sets. A rule whose scope has an empty set is skipped entirely. For a fact `f`, `constraint(R, f)` is the set of values of `f` for which every condition of `R` on `f` holds, intersected with the fact's universe:

| Fact type | Universe | Representation (exact) |
|---|---|---|
| number | `[min, max]` (±∞ when absent); integers only if `integer` | an interval with open/closed ends and excluded points, or a finite set (`==`, `in`). For integer facts `> v` means `>= v+1` and `< v` means `<= v-1`. |
| time | the 1440 minutes of a day | a set of minutes |
| boolean, day, enum | the finite value set | a finite subset |
| string | all non-empty strings | "everything except" a finite set, or a finite set |

For an integer fact every range is kept closed on whole numbers (`> v` becomes `≥ ⌊v⌋+1`, `< v` becomes `≤ ⌈v⌉−1`), and an integer range is empty when it is inverted or every whole number in it is excluded; a real range with `lo < hi` is never emptied by finitely many excluded points. Intersection, emptiness and subset over these representations are exact for every pair of shapes — including an integer range (or a single closed point) inside a finite set — so **overlap and coverage are decided exactly**.

### 7.2 Overlap, reachability and certainty

A triple `(role, action, area)` is **reachable** when the role lists the action (else `role_permits_action` refuses every such request before any rule is weighed) and no **unconditional never rule** other than the two being compared covers it (else it refuses every such request first). A never rule is unconditional when it has no `history` and its `when` can never fail: no conditions, or for every fact it names `constraint(R, f)` equals the fact's universe (`people >= 0` on a fact with `min: 0`; `in` every enum value; `in [true, false]`). Conditional never rules are compared like any rule.

For rules `a`, `b` (every pair `i < j` in rulebook order):

- **overlap** iff some reachable triple lies in `roles_a ∩ roles_b`, `actions_a ∩ actions_b`, `areas_a ∩ areas_b` and, for every fact named by either rule, `constraint(a,f) ∩ constraint(b,f)` is non-empty. No overlap → no finding. (History conditions are ignored here.)
- `implies(a, b)` iff for every fact `f` named by `b`, `constraint(a,f) ⊆ constraint(b,f)`.
- `covered(a, b)` ("every request matching a matches b") iff `roles_a ⊆ roles_b`, `actions_a ⊆ actions_b`, `areas_a ⊆ areas_b` and `implies(a, b)`.
- **certainty** = `possible` if either rule has a non-empty `history`, else `certain` (with a witness, § 7.4).

### 7.3 Classification

Strictness rank of an outcome: deny 4, wait/condition 3, wait/approval 2, limit 1, allow 0.

`sameAnswer(a, b)`: same `answer`; for waits also same `for` and same `by`; for limits the same keys with the same values.

`looser(a, b)` → `(L, S, names, mixed)` or none: different ranks → the lower rank is L, `names` empty; both limits → `names` = every key in both `limits` whose values differ (none → no result); if `a` is larger on all of them, L = a; if smaller on all, L = b; if larger on some and smaller on others, L = a with `mixed`; both approval waits with different `by` → the one without `by` is L; otherwise none.

```
if sameAnswer(a, b):
  if exactly one of a, b is a never rule: no finding
  if covered(a,b) and covered(b,a): duplicate/info, ruleIds [a, b]
  elif covered(a,b):                 duplicate/info, ruleIds [a, b]
  elif covered(b,a):                 duplicate/info, ruleIds [b, a]
  else: no finding
(L, S, names, mixed) = looser(a, b); if none: no finding.   ruleIds = [L, S] from here on.
if mixed:                                    limit_disagreement/info   (each tighter on a different limit; the lower value of each applies)
coveredL = covered(L, S); refines = covered(S, L)
loosens = (L.then.answer == "allow") or (names non-empty)
if not loosens:
  if coveredL: shadowed/warning  else: no finding
elif S.never and L.then.answer == "allow":  never_vs_rule/conflict
elif rank(L.setBy) > rank(S.setBy):          authority-override/conflict   (L is the lower authority; rank 0 = highest)
elif rank(L.setBy) < rank(S.setBy):          tightening/info
else (same authority):
  if L.then.answer == "allow":  contradiction, severity conflict if S denies, else warning
  elif coveredL:                shadowed/warning
  elif refines:                 no finding          (a stricter special case: normal layering)
  else:                         limit_disagreement/info
```

An implementation MAY offer a strict mode that refuses a rulebook with any `conflict`-severity finding; the reference does (`compileDomain(input, { strict: true })`).

### 7.4 Witness

`witness` is `{ participant: { id, kind, roleId }, action, areaId, facts }`: a request that matches both rules (§ 6 step 4, selectors and conditions, ignoring never-rule stopping) on a reachable triple. An implementation MUST produce a witness on every `certain` finding between two rules and MAY choose any such request; the conformance cases judge a witness by validity and the implementation's matching relation by agreement with the reference on the reference's witnesses (`conformance/README.md`). The reference chooses, deterministically: the first reachable triple in declaration order (roles, then actions, then areas); for every fact either rule names, the smallest value of the intersection (the first minute of the day for a time, the first in sorted order for a finite set, the lower end of a range or the first whole number above it, `"x"`/`"x1"`/… for a string that is "everything except"); every other fact the request needs (required, or required by the action) at a sample value (the default, else the minimum / `false` / `"00:00"` / `"mon"` / the first enum value / `"x"`); `participant.id` is `<roleId>-1`.

### 7.5 Plan rules

Plan rules can only reject, so two of them never disagree. The check reports a `duplicate` (info, certain, no witness) for two plan rules with the same `check` (same kind, same resolved selectors, same `sameArea` / `count`) whose `who` selectors share a role. No other finding kind applies to plan rules, and a plan rule is never compared with a rule.

### 7.6 Findings on one rule

`unmatched_selector` (§ 7) is the one finding kind with a single rule ID and never a witness. Cases: `p7-unmatched-selector-is-a-finding`, `p7-unmatched-entry-in-a-wider-selector`, `p7-exclusion-that-empties-a-selector`.

## 8. Canonical JSON, SHA-256, fingerprint, request digest

### 8.1 Canonical JSON (RFC 8785)

`canonical(v)` is the JSON Canonicalization Scheme, [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785), applied after dropping object members whose value is `undefined` (JSON has none):

- array → `[` + elements joined by `,` + `]`, order kept;
- object → `{` + members joined by `,` + `}`, members sorted by key comparing keys as sequences of UTF-16 code units (RFC 8785 § 3.2.3); each member is `JSON.stringify(key) + ":" + canonical(value)`;
- string → as ECMAScript `JSON.stringify` writes it (RFC 8785 § 3.2.2.2): only `"`, `\` and U+0000–U+001F escaped (`\b \t \n \f \r`, else `\u00XX`), everything else literal, non-ASCII kept. A string (or key) holding a **lone surrogate** is not Unicode text and MUST be refused with an error (JCS serialises Unicode strings; a port whose strings are UTF-8 or UTF-32 cannot even represent one — refusing keeps every port agreeing);
- number → ECMAScript `Number::toString` shortest round-trip form (RFC 8785 § 3.2.2.3; `1`, `0.5`, `1e+21`, `1e-7`, `-0` as `0`). `NaN` and infinities are not JSON and MUST be refused;
- `true`, `false`, `null` literally;
- anything that is not a JSON value (a function, a symbol, a bigint, `undefined` at the top level or inside an array) MUST be refused with an error — never written as `null` or as a token.

No whitespace anywhere. **Hash the object as received**: every member present, including members this specification does not define — a typed deserialiser that drops unknown members changes the fingerprint. (Cases: `conformance/fingerprint.json`; number edges in `fp-number-edges`.)

### 8.2 SHA-256 and the fingerprint

`sha256(bytes)` is FIPS 180-4 SHA-256, as 64 lowercase hex digits (cases `sha256-*` in `conformance/fingerprint.json` are the standard's vectors plus a UTF-8 one).

`fingerprint(v)` = `sha256(UTF-8 bytes of canonical(v))`.

A rulebook's `fingerprint` is `fingerprint(rulebook without its fingerprint and findings members)`. Findings are left out so that two conforming compilers, whose finding messages may differ, assign the same fingerprint to the same rulebook; validation re-derives them instead (§ 2.2). It identifies a rulebook; it is not a security measure (§ 9.6 is). A fingerprint's version is recognisable by its length: 64 hex is `/3`; 16 hex is a `/2` FNV-1a value and is refused wherever a `/3` fingerprint is expected.

### 8.3 Request digest (removed)

`/3` up to 0.5.2 defined `requestDigest(request) = fingerprint({ participantId, action, areaId })` as a log key. It bound nothing (approvals name the three fields themselves) and is gone from the reference and the conformance cases; a port need not implement it.

## 9. Approvals

[`spec/approval.schema.json`](spec/approval.schema.json)

An approval is **authorisation, separate from the operational facts.** It says: holder `id` (with authority/role) authorises *this rule's* approval wait, for *this participant*, *this action*, in *this area*, under *this rulebook*, once, within a window. It says nothing about the facts: the live decision always checks the facts current at evaluation time, and an approval can never override a current BLOCK or a current condition wait (§ 6).

### 9.1 Approval request

Returned on a PAUSE for approval, one per unmet approval wait:

```json
{ "ruleId": "robots_restricted_zones", "by": "site-manager",
  "rulebookFingerprint": "fb1e4760…dfc8",
  "participantId": "robot-9", "action": "enter_zone", "areaId": "7f2d9a10-…-000000000005",
  "reason": "This area is restricted.", "setBy": "company" }
```

### 9.2 Signed approval (`robot-domain-rules-approval/3`)

```json
{ "spec": "robot-domain-rules-approval/3",
  "id": "manager-dana", "authority": "site-manager",
  "ruleId": "robots_restricted_zones", "rulebookFingerprint": "fb1e4760…dfc8",
  "participantId": "robot-9", "action": "enter_zone", "areaId": "7f2d9a10-…-000000000005",
  "nonce": "dana-glasses-17",
  "issuedAt": "2026-10-12T09:21:00Z", "expiresAt": "2026-10-12T09:31:00Z",
  "keyId": "dana-2026", "signature": "8ab8…3006" }
```

`spec`, `id`, `ruleId`, `rulebookFingerprint`, `participantId`, `action`, `areaId`, `nonce`, `issuedAt`, `expiresAt`, `keyId`, `signature` are required; `authority` and `roleId` optional. `nonce` MUST be unique per approval instance under the signing key (a UUID, or a counter). `expiresAt` MUST be later than `issuedAt`; a signer SHOULD keep the window short. The signature is Ed25519 (RFC 8032, pure, no pre-hash) over the UTF-8 bytes of `canonical(approval without "signature" and without "verified")`, encoded as 64 bytes lowercase hex. Public keys are the raw 32-byte Ed25519 key, lowercase hex. Ed25519 signatures are deterministic, so the vectors in `conformance/approvals.json` (with their TEST ONLY seeds) are reproducible exactly.

### 9.3 Verification (before evaluation)

`verifyApproval(approval, trustedKeys)` MUST: refuse an approval whose `spec` is not `robot-domain-rules-approval/3` (one carrying `requestDigest` or a 16-hex `rulebookFingerprint` is a `/2` approval and MUST be refused with a message naming that and the migration); check the required fields are non-empty strings and `rulebookFingerprint` is 64 hex; find the trusted key with `keyId`; if the approval claims an `authority`, require the key's `authority` to equal it; if it claims a `roleId`, require the key's `roleId` to equal it; verify the signature with the key. On success it returns a **verified handle**: an approval value of a kind that cannot be constructed from request data — in the reference, the very object it returns, registered by identity in a private `WeakSet`; in a typed port, a type (`VerifiedApproval`) with no public constructor that only `verifyApproval` produces. The caller passes that handle, not a copy, as `facts.approvedBy`. It does NOT check the binding fields, the window or the nonce: the evaluator does, against the real request and its `now`.

**Nothing in a request can assert verification.** A `verified` member in the data is ignored wherever it appears (0.5.2 trusted it, and an unsigned object carrying it cleared a wait; that is closed). Under `trustedKeys` the evaluator clears a wait only for a verified handle, so `evaluate` on its own — given a request from JSON — never clears one and says so. The reference offers `verifyAndEvaluate(rulebook, request)` (and `verifyAndEvaluatePlan`) as the entry for the caller's trusted layer: it verifies every signed approval the request carries (one, or a list) and then evaluates with the handles; the evaluator itself stays pure and synchronous and never verifies a signature. Conformance judges both doors: `decision` cases run `evaluate`, `verifiedDecision` / `verifiedPlan` cases run the trusted entry.

### 9.4 What the evaluator checks

§ 6 step 8: a `/2` approval, or one declaring another `spec`, is refused with or without `trustedKeys`. When `trustedKeys` is non-empty: `/3` spec, the verified handle, rule, rulebook fingerprint, participant, action, area, an unconsumed nonce, and `issuedAt <= now < expiresAt`; then sufficiency for `by`. A request carrying an approval object under such a rulebook without `now` is BLOCK `required_facts`. When `trustedKeys` is absent or empty, plain approvals (`"name"` or `{ id, authority?, roleId? }`) are accepted — the development path, in which the approver's authority is **self-declared** and nothing checks it. `signApproval` refuses an `expiresAt` that is not later than `issuedAt`.

### 9.5 Replay, without hidden state

The engine keeps nothing between calls, so replay is detected from two things the caller supplies and receives: it passes `request.consumedApprovals` (the nonces it has already acted on) and, when a decision is ALLOW or LIMIT, reads `decision.approvalsUsed` and adds those nonces to its set **once it acts**. An approval whose nonce is in `consumedApprovals` does not apply. The window (`expiresAt`) bounds how long the caller must remember a nonce. A caller that does not keep the set gets one-use-per-window-per-request only from `expiresAt`; the set is what makes an approval single-use.

### 9.6 Rulebook signature

`signRulebook(rulebook, key)` → `{ keyId, fingerprint, signature }`: Ed25519 over the UTF-8 bytes of `canonical(rulebook)` — the whole rulebook, fingerprint and findings included. `verifyRulebookSignature(rulebook, signature, publicKey)` verifies with a public key the deployment pins **outside** the rulebook; a rulebook's own `trustedKeys` are for approvals and cannot vouch for the rulebook.

## 10. Authority

The `authorities` list is a total order, highest first; `rank(id)` is the index. Every rule's `setBy` is a declared authority. The order governs three things and nothing else: which of two overlapping rules is reported as overriding versus tightening (§ 7.3); whether an approval claiming an authority satisfies a `wait.by` that names one (§ 6 step 8: equal or higher rank); and which key may sign an approval claiming an authority (§ 9.3). It does not reorder evaluation: strictest-wins makes a looser lower-authority rule ineffective without consulting rank. An authority may be held by a person, a system or an AI agent; the rulebook does not know or care which.

## 11. Versioning and explicit version handling

This specification is `robot-domain-rules/3`; the rulebook `format` string is `neuroverse-domain-rules/3`; the approval contract is `robot-domain-rules-approval/3`. Changes to this document that alter any decision, finding, fingerprint or signature for an existing valid rulebook bump the spec major version and come with new conformance cases; clarifications do not. An implementation claims conformance to a spec version by passing every case in `conformance/` at that version; how to run them is in [`conformance/README.md`](conformance/README.md).

**Every artifact declares its version, and an implementation MUST NOT reinterpret an older one under newer rules.** What a `/3` implementation does with each:

| Artifact | How its version is known | A `/3` implementation… |
|---|---|---|
| Rulebook | `format` | accepts `neuroverse-domain-rules/3`; refuses `/1`, `/2` and any other value **at every door** with one message naming that version and the migration (recompile from the input): validation returns it; `evaluate` returns BLOCK `rulebook_version` with it (fingerprint: the refused rulebook's claimed string); `evaluatePlan` returns BLOCK with `firstViolation { ruleId: "rulebook_version", from: "plan" }`; the conflict check and the backtest treat it as bad input (an error). Cases: `conformance/versions.json`. |
| Fingerprint / digest | length: 64 hex is `/3`, 16 hex is `/2` | a 16-hex fingerprint never verifies and never binds an approval. |
| Signed approval | `spec` | accepts `robot-domain-rules-approval/3`; refuses an approval without it — in particular a `/2` one, recognisable by `requestDigest` or a 16-hex `rulebookFingerprint` — in `verifyApproval` and, if it is passed through anyway, in the evaluator, each time naming the migration (re-issue under `/3`). Cases: `approvals-verify-v2-approval-refused`, `approvals-v2-approval-does-not-clear`. |
| History entry | `at` shape | a `/2` `"HH:MM"` `at` is not a timestamp: BLOCK `required_facts`, never a guess at the day. |
| Backtest event | `at` shape | a non-timestamp `at` is an input error. |

**Migration from `/2`**: recompile every rulebook from its input with a `/3` compiler (fingerprints change; a rulebook's findings are unchanged); remove `clock` from history conditions; give history entries and backtest events dated timestamps and supply `request.now`; re-issue approvals under the `/3` contract (new fields, nonce, expiry) and start keeping a consumed-nonce set; add `plan_area_continuity` to `builtin` (the compiler does). Decisions for existing valid requests without history windows or approvals are unchanged except where a plan step changed area without a move (now refused) and where a finding's classification changed (§ 7).

**Errata within `/3` (0.5.3).** The second audit found behaviours that contradicted this document's own text or its security requirements; they are corrected without a version bump because no format changed, no fingerprint changed, and each correction makes the implementation do what the specification already said. A port that passed the 0.5.2 cases must re-run the suite. What changed for an existing valid input: (1) an approval object carrying `verified: true` from request data no longer clears a wait under `trustedKeys` (§ 9.3 already required the flag to come only from the trusted layer); (2) a `/2` approval is refused with or without `trustedKeys` (§ 11 already said never reinterpreted); (3) in a plan, a single-use approval clears one step, not every step (§ 9.5, § 12 already said one use); (4) a `/1`, `/2` or unknown-format rulebook is refused by the evaluator, the plan evaluator, the check and the backtest, not only by validation (this section already said refused, never reinterpreted); (5) validation re-derives the area never rules and the findings (§ 2 already said findings MUST NOT be hidden and the areas' effect is the never rules); (6) a plan's default `startTime` is the wall-clock time `now` names in its own offset, not UTC (§ 12 said "time of day of `now`"; the UTC reading was wrong for every site not on UTC); (7) `finalArea` after a `plan_area_continuity` refusal is where the earlier steps left the participant; (8) a never rule whose conditions can never fail counts as unconditional for reachability (§ 7.2's intent); (9) one new finding kind, `unmatched_selector`, warning, on one rule (additive; findings are not in the fingerprint). Additions that change no existing output: `approvedBy` as a list; `approvalsUsed` on a plan evaluation; millisecond truncation and years 0000–0099 stated in § 1; `requestDigest` removed.

**Errata within `/3` (0.6, with the `/1` format of § 16).** Two additions widen what a `/3` input may say; neither changes any decision, finding, fingerprint or signature of a rulebook that was valid before, so there is no version bump. (1) The plan check `at_least { actions, count }` joins § 3.5 (a plan with fewer than `count` steps whose action is in `actions` breaks it; cited at the last step). A `/3` rulebook using it was refused before ("check.kind must be …") and compiles now. Cases: `plan-rule-at-least`, `plan-rule-at-least-satisfied`. (2) Condition scope (§ 3): a rule may condition on a fact that is neither required nor defaulted when its `does` selector is closed and every action it resolves to lists the fact in `requires`; such a rule was refused before ("optional with no default") and compiles now, and a request for that action without the fact is still BLOCK `required_facts`. Cases: `p4-rule-on-action-required-fact-decides`, `p4-rule-on-action-required-fact-missing-refuses`, `p4-rule-on-action-required-fact-open-does-rejected` (an open `does` is still refused).

## 12. Plans

`evaluatePlan(rulebook, plan) → PlanEvaluation` ([`spec/plan.schema.json`](spec/plan.schema.json), [`spec/plan-evaluation.schema.json`](spec/plan-evaluation.schema.json)). A plan is what a planner — an AI agent, a fleet manager, a person — proposes; the rulebook checks it and does not write it. Pure and synchronous, like § 6.

The result is `{ status, steps, planChecks, firstViolation?, approvalRequests, approvalsUsed, finalFacts, finalArea, planDigest, fingerprint }` ([`spec/plan-evaluation.schema.json`](spec/plan-evaluation.schema.json)).

```json
{ "participant": { "id": "robot-9", "kind": "robot", "roleId": "restock_robot" },
  "initialFacts": { "localTime": "09:30", "peopleInZone": 0 },
  "steps": [ { "action": "enter_zone", "area": "aisle-3" }, { "action": "scan" }, { "action": "manipulate", "facts": { "peopleInZone": 2 }, "note": "…" } ],
  "history": [ { "action": "dock", "areaId": "dock-a", "at": "2026-10-12T09:00:00Z" } ],
  "clock": "localTime", "startTime": "09:30", "stepDurationSeconds": 120,
  "now": "2026-10-12T09:30:00Z", "consumedApprovals": [] }
```

| Field | Req | Meaning |
|---|---|---|
| `participant` | yes | As in a request. |
| `initialFacts` | yes | The facts before the first step; undeclared facts are ignored, as in a request. |
| `steps` | yes, ≥1 | `{ action, area?, facts?, note? }`. The first step MUST have `area`. A later step MAY name an area only if it is the area the participant is projected to be in, or its action has a `move` effect (§ 12 step 1). `facts` are laid over the projected facts for that step only, and persist into the projection after it. `note` is carried into the result. |
| `history` | no | What the participant did before the plan; seeds each step's history and counts for `before` plan rules. |
| `clock` | no | A declared `time` fact that advances. |
| `startTime`, `stepDurationSeconds` | no | With `clock`: step *i* sees `clock = startTime + ⌊i · stepDurationSeconds / 60⌋` minutes, mod 1440. `startTime` defaults to the **wall-clock time `now` names in its own offset** (the `HH:MM` written in it: `2026-10-12T21:00:00-05:00` → `21:00`, the site's evening) when `now` is given. Time facts describe the site's local clock; a planner on another clock states `startTime`. Cases `plan-clock-starts-at-the-wall-clock-of-now-*`. |
| `now` | no | A timestamp: step *i*'s `request.now` is `now + i · stepDurationSeconds`; it also stamps the history entries the plan appends. Without it those entries carry no `at`, and a window rule in scope is `required_facts`. |
| `consumedApprovals` | no | The nonces already acted on. Every step's request receives them **plus every nonce an earlier step of this plan spent**, so one single-use approval clears one step (§ 12 step 3). |

```
 0. Shape. If the plan is not an object, has no participant, no steps, no initialFacts,
    a step without an action, a first step without an area, a clock that is not a
    declared time fact, a startTime that is not a time, a now that is not a timestamp,
    a stepDurationSeconds that is not a number >= 0, or a history that is not a list:
    status BLOCK, firstViolation { stepIndex 0, ruleId "required_facts", setBy
    "builtin", from "plan" }, no steps, no planChecks; stop. (A plan that is not an
    object is never a throw; its planDigest is fingerprint(null).)

 1. Areas, as described. here = steps[0].area. For each step i:
      moves = the step's action is declared and has a `move` effect
      broken[i] = step.area is given and step.area != here and not moves
      areas[i] = step.area ?? here
      if moves: here = areas[i]
      after[i] = here

 2. Plan rules. For each plan rule whose `who` selects the participant's role
    (a role that is undeclared, or of another kind, is left to step 3), in order,
    a PlanRuleCheck { ruleId, status, reason, setBy, stepIndex? }:
      ends_in:   ALLOW iff after[n-1] ∈ resolve(areas); else BLOCK at n-1
      ends_with: ALLOW iff steps[n-1].action ∈ resolve(actions); else BLOCK at n-1
      before:    for each step i with action ∈ resolve(then): some entry of
                 plan.history, or some step j < i, has action ∈ resolve(first)
                 (and area == areas[i] when sameArea); the first i that fails
                 → BLOCK at i; none → ALLOW
      at_most:   BLOCK at the (count+1)-th step with action ∈ resolve(actions); else ALLOW

 3. Steps. facts = initialFacts; history = plan.history ?? []. For each step i:
      if clock and startTime: facts[clock] = startTime + ⌊i · stepDurationSeconds / 60⌋ min (mod 1440)
      stepFacts = facts ⊕ step.facts
      now_i = plan.now + i · stepDurationSeconds, if plan.now is given
      if broken[i]: decision = { BLOCK, reasons = trace = [ { "plan_area_continuity",
          BLOCK, …, "builtin" } ], fingerprint }   — the step names an area the
          participant is not in and its action does not move it
      else decision = evaluate(rulebook, { participant, action: step.action,
          areaId: areas[i], facts: stepFacts, history, now: now_i,
          consumedApprovals: plan.consumedApprovals ∪ nonces spent by steps < i })  (§ 6)
      record { index: i, action, areaId: areas[i], facts: stepFacts, decision, note? }
      add each of decision.approvalRequests not already present (same ruleId,
        action and areaId) to approvalRequests
      append each of decision.approvalsUsed to approvalsUsed, and its nonce to the
        consumed set every later step receives
      if decision.status == BLOCK: facts = stepFacts; stop projecting
      facts = stepFacts with the action's effects applied, in order: set → the
        value; add/subtract → from the current value, or the fact's default when
        the current value is not a number, or left untouched when neither exists
      history += { action, areaId: areas[i], at: now_i if given }

 4. Finish. status = the strictest of every plan check and every recorded step
    decision. firstViolation = among the first recorded step with status BLOCK
    (from "step", its first reason) and every plan check with status BLOCK (from
    "plan", at its stepIndex), the one with the smallest stepIndex; at equal
    index the step's. finalFacts = facts. finalArea = after[last recorded index]
    when its decision is not BLOCK; when it is BLOCK, the step's areaId — unless the
    refusal is plan_area_continuity (the participant is not there), then
    after[index − 1] (areas[0] for the first step). approvalsUsed as collected.
    planDigest = fingerprint(plan taken as JSON — JSON.stringify semantics, so a
    non-finite number becomes null and undefined members drop — with
    `consumedApprovals` removed, `approvedBy` removed from initialFacts and from
    every step's facts, and a step's facts removed when empty after that) — so
    collecting approvals does not change it, and a plan that is not JSON still
    has a digest (and is refused, never thrown on).
    fingerprint = rulebook.fingerprint.
    A rulebook of another format: status BLOCK, firstViolation { stepIndex 0,
    ruleId "rulebook_version", setBy "builtin", from "plan" }, no steps (§ 11).
```

Consequences: nothing is projected past a refusal (the steps list is cut at the first BLOCK); a PAUSE does not stop projection, so a planner sees every approval the plan needs; the plan is judged on the effects the site declared and the facts the planner supplied, nothing else. **A plan verdict is a verdict on the plan as described.** Approvals collected for a plan step authorise that step's rule, participant, action and area (§ 9); at execution time each step MUST be asked again with `evaluate` on the facts then current — projected planning facts are never assumed to equal execution-time facts, and the same approval (one use, until it expires) is what clears that step's wait then.

## 13. Backtest

`backtest(rulebook, events, options?) → BacktestReport` and `compareBacktests(baseline, proposed) → BacktestComparison` ([`spec/backtest.schema.json`](spec/backtest.schema.json), [`spec/backtest-report.schema.json`](spec/backtest-report.schema.json)). A site replays a log of what its participants asked to do through a rulebook before the rulebook goes live, and reads what the rulebook *would have decided*. Pure and synchronous, like § 6: every time comes from the log, nothing is kept between runs, and the report contains no free text. The report never says *why* anything happened; it applies rules to recorded requests and nothing else.

### 13.1 Input

```json
{ "events": [ { "at": "2026-10-05T09:00:00Z", "request": { …a request, § 4… }, "outcome": "happened" }, … ],
  "options": { "examples": 3 } }
```

| Field | Req | Meaning |
|---|---|---|
| `events[].at` | yes | When it was asked: a timestamp (§ 1). Reported as given; the implementation MUST process events in the order given and MUST NOT sort them. It becomes the request's `now` (when the request has none) and each built history entry's `at`. |
| `events[].request` | yes | Exactly what the participant asked (§ 4). A malformed request is a row refused as missing facts (`request`), never an error. |
| `events[].outcome` | no | `happened`, `did_not_happen` or `unknown`: what the record says happened next. Used only for `differences` (13.3); it MUST NOT influence any decision. |
| `options.examples` | no | How many `at` values each list keeps (the earliest). Default 3. |

An `events` value that is not a list, an event without a timestamp `at` or without `request`, an `outcome` outside the three values, or the `/2` option `clock` is an error (bad input, like a bad rulebook), not a decision.

### 13.2 The report

```
 0. history = {} (participant ID → entries). For each event i, in order:
      request = event.request; if it is an object: request = request ⊕
        { history: history[id] ?? [] when it has no `history` member and names a
          participant with a string id } ⊕ { now: event.at when it has no `now` }
      decision = evaluate(rulebook, request)                                      (§ 6)
      missing  = decision.status == BLOCK and some reason has ruleId "required_facts"
      row = { index: i, at, participantId, kind, roleId, action, areaId, status,
              missingFacts: missing, ruleIds: [reasons' ruleIds, in order], outcome? }
        (participant fields, action and areaId are "" when the request lacks them;
         areaId is areaId ?? zoneId)
      matched = matches(rulebook, request)                                         (§ 6 step 4; [] for an incomplete request)
      after deciding, if the request named a participant id and an action:
        history[id] += { action, areaId, at: event.at }
    Every earlier event of the same participant counts, whatever was decided or
    recorded; windows are absolute time (§ 3.4), so no day boundary is needed.

 1. Counts. A counts object is { events, ALLOW, LIMIT, PAUSE, BLOCK, missingFacts }; an
    event adds to `events` and to `missingFacts` when `missing`, else to its status. So
    BLOCK counts refusals by rules and by built-in checks other than required_facts, and
    the five sum to events. totals over every event; byArea keyed by areaId ("(none)" when
    empty), byRole by roleId ("(none)"), keys in code-unit order.

 2. byRule. For every rule of rulebook.rules, in rulebook order: matched += 1 when the
    rule ∈ matched; decided += 1 when the rule ∈ row.ruleIds. neverFired = the rules with
    matched == 0, in rulebook order.

 3. wouldStall. For each event that is PAUSE or BLOCK and not `missing`, for each reason
    r: the entry (r.ruleId, status) gains count 1 and, while it has fewer than
    options.examples, the event's `at`; `setBy` is r.setBy. Order: count descending,
    then first occurrence.

 4. conflictsOccurred. For each finding of rulebook.findings, in order, whose ruleIds are
    all ∈ matched for some event: { kind, severity, ruleIds, count, firstAt, examples }
    where count is the number of such events and examples their earliest `at` values.
    (A finding between plan rules never occurs: its IDs are not rules.)

 5. gaps. For each event whose ruleIds include "unknown_action": the entry for
    row.action gains count 1 and an example. Order: count descending, then action.

 6. missingFacts. For each `missing` event, for each name in missingFacts(rulebook,
    request): the entry for that name gains count 1 and an example. The names are, in
    this order: "request" alone when the request's shape is incomplete (§ 6 step 1);
    else each declared fact that is absent while required (by the fact or by the action)
    or present and invalid, in declaration order; "now" when it is present and invalid;
    "consumedApprovals" when invalid; "approvedBy" when the approval is malformed or
    needs a `now` that is absent; "history" when a rule in scope (§ 6 step 3) has history
    conditions and the request's history is absent or invalid; "now" when a window rule
    is in scope and now is absent. Order: count descending, then name.

 7. differences. In event order: { index, at, status, outcome, ruleIds } for each event
    with outcome "happened" and status PAUSE or BLOCK, and for each with outcome
    "did_not_happen" and status ALLOW or LIMIT. Events without an outcome, or with
    "unknown", are left out. The report does not say which is right.

 8. fingerprint = rulebook.fingerprint; events = the number of events; rows in order.
```

### 13.3 Comparison

`compareBacktests(baseline, proposed)`: both reports MUST come from the same log (same `events` and the same `at` at every index); otherwise an error.

```
 for each index i: a = baseline.rows[i], b = proposed.rows[i]
   every id in a.ruleIds counts once for that rule's `baseline`; every id in b.ruleIds for its `proposed`
   if a.status != b.status: change = { index, at, from: a.status, to: b.status, before: a.ruleIds, after: b.ruleIds }
     b.status == BLOCK                                   → newlyBlocked
     a.status ∈ {PAUSE, BLOCK} and b.status ∈ {ALLOW, LIMIT} → newlyAllowed
     otherwise                                           → otherChanges
 changed = |newlyBlocked| + |newlyAllowed| + |otherChanges|
 byRule = every rule seen, { ruleId, baseline, proposed, change: proposed − baseline },
          ordered by |change| descending, then ruleId
 totals = { baseline: baseline.totals, proposed: proposed.totals }; the two fingerprints; events
```

Consequences: a row's status under a `missing` refusal is BLOCK, so a log that lacks a fact the proposed rulebook newly needs shows up as newly blocked, with `required_facts` in `after` — the honest answer, since the rulebook could not have decided those events. Conformance: [`conformance/backtest.json`](conformance/backtest.json).

## 14. Porting notes

**What a client needs** (a robot controller, a glasses runtime, an agent harness in Unity/C#, Rust, Python): `validate` (§ 2, which re-derives the area never rules and the findings, § 2.2) with `verifyFingerprint` (§ 8), `evaluate` (§ 6), `verifyApproval` with a verified-handle type (§ 9.3) and the consumed-nonce set (§ 9.5), and `evaluatePlan` (§ 12) if it runs plans. Every conformance case a client must pass is marked `client: true`: the `decision`, `verifiedDecision`, `plan`, `verifiedPlan`, `error`, `canonical`/`fingerprint`/`sha256`, `verify` and `rulebookSignature` cases, including `versions.json` and `integrity.json`; `node conformance/run-node.mjs --client` runs that subset. **Authoring tools** — the conflict check (§ 7: `findings` cases), the backtest (§ 13: `backtest`/`comparison` cases), text drafting — live wherever rulebooks are written. A client that validates a rulebook has, through § 2.2, checked its findings too; a client that only verifies a pinned signature (§ 9.6) may trust everything in it.

**Numbers.** Canonical JSON requires a real ECMAScript `Number::toString` serialiser (RFC 8785 § 3.2.2.3): shortest round-trip digits, plain notation for 10⁻⁷ < |x| < 10²¹, exponent form `1e+21` / `1e-7` outside it, `-0` as `0`. The platform defaults are all wrong for JCS and MUST NOT be used as they are: .NET's `double.ToString("R")` / default writes `1E+15` (exponent form from 10¹⁵, capital `E`, no `+` on some runtimes); Rust's `{}` for `f64` never uses an exponent (`1e21` prints as `1000000000000000000000`, `5e-324` as 0.000…49); Python's `repr(float)` switches to exponent form at 10¹⁶ and below 10⁻⁴ (`1e16`, `1e-05`). Use a JCS library that implements the ES serialiser, or port the algorithm (Ryu/Grisu shortest digits, then ES formatting): .NET — the `Org.Webpki.JsonCanonicalizer` port of cyberphone's JCS reference; Rust — the `serde_jcs` crate; Python — the `rfc8785` package (Trail of Bits) or `jcs`. Whatever you use, prove it on the vectors rather than trusting its name. Then run `fp-numbers` and `fp-number-edges`: `-0` → `0`, `5e-324` (the smallest subnormal), `1e+21` versus `100000000000000000000`, `1e-7` versus `0.000001`, `2^53+1` → `9007199254740992`, `0.1+0.2` → `0.30000000000000004`, `1.7976931348623157e+308`. Rulebook numbers are plain JSON numbers; an implementation MUST parse them as IEEE 754 doubles.

**Strings, keys and hashing.** Sort object members by key as sequences of **UTF-16 code units** (an ordinal comparison: `string.CompareOrdinal` in .NET, not a culture-aware sort; not by Unicode scalar, not by UTF-8 bytes — they differ above U+FFFF). Hash the **UTF-8 bytes** of the canonical text (`fp-strings`, `sha256-utf8`). Escape only what § 8.1 says. **Hash the object as received**: serialise every member, including ones your types do not know; a typed deserialiser that drops unknown members changes every fingerprint it checks — keep the raw JSON tree for hashing (`JsonNode`/`JsonDocument` in .NET, `serde_json::Value` in Rust). Refuse lone surrogates and non-JSON values (§ 8.1).

**Ed25519.** Pure Ed25519 (RFC 8032), no pre-hash, no context; raw 32-byte public keys; 64-byte signatures; the message is the UTF-8 canonical JSON of the object without `signature`/`verified`. Any mainstream library works (libsodium, `ed25519-dalek`, `cryptography`). In Unity, prefer **BouncyCastle** (`Org.BouncyCastle.Crypto.Signers.Ed25519Signer`; managed code, no native dependency, works under IL2CPP); NSec needs native libsodium per platform. The vectors in `conformance/approvals.json` carry their TEST ONLY seeds so you can reproduce every signature byte for byte.

**Verified handles.** Give `verifyApproval` a return type nothing else can make (a `VerifiedApproval` class with an internal constructor) and have `evaluate` accept only that type under `trustedKeys`; never read a `verified` member from JSON (§ 9.3). Cases `approvals-unsigned-verified-flag-clears-nothing*`, `approvals-evaluate-alone-never-clears`.

**Unity and JSON.** `JsonUtility` cannot model a selector that is a string or an array (§ 3.1), optional members, or `Record<string, number>` limits; use Newtonsoft.Json (`com.unity.nuget.newtonsoft-json`) or `System.Text.Json`, and keep the raw tree for fingerprints as above.

**Timestamps.** Parse § 1's grammar yourself; read no offset as UTC; truncate fractions to the millisecond before comparing (`DateTime.Ticks / 10000`); compare instants. Years 0000–0099 are literal. Do not use a platform parser that assumes local time. A plan's default clock start is the `HH:MM` written in `now` (§ 12).

**Witnesses and `matches`.** A port that provides `matches(rulebook, request)` is judged on it: every witness it reports must match both rules, and on every reference witness its `matches` must return exactly the rule set the reference recorded (`witnessMatches`) — a `matches` that returns every rule, or the finding's own pair, fails (`conformance/README.md`).

**Comparison.** Conformance is judged by deep semantic equality (`conformance/README.md`): object key order never matters; arrays are ordered.

## 15. What throws, what never does

- `evaluate`, `evaluatePlan`, `matchingRules`, `missingFacts`: never throw for any request or plan value, given a valid rulebook — malformed input is a BLOCK decision (§ 4, § 12 step 0), a NaN or infinity in a plan included — and never throw on a rulebook of another format either: that is BLOCK `rulebook_version` (§ 11). Given a `/3` rulebook that was never validated and is malformed in some other way, behaviour is undefined (§ 6 step 0).
- `compileDomain`, `validateRule`, `validatePlanRule`, `checkRulebook(input)` (when given an input rather than a compiled rulebook): throw `DomainRulesError` on configuration that cannot make a valid rulebook; `checkRulebook` and `backtest` throw `DomainRulesError` on a rulebook of another format. `validateRulebook` returns problems instead of throwing.
- `backtest`, `compareBacktests`: throw `DomainRulesError` on bad input (§ 13.1, § 13.3); a malformed *request inside an event* is a row, not a throw.
- `signApproval`: throws when a required field is missing or `expiresAt` is not later than `issuedAt`; `verifyApproval`, `verifyRulebookSignature`: return `{ ok: false }` / `false`, never throw on bad data.
- `canonicalJson`/`fingerprint`: throw on `undefined` at the top level, a non-finite number, a lone surrogate, or a non-JSON value (function, symbol, bigint).
- `glassesZoneRules`: throws on an undeclared area or role (configuration).

## 16. neuroverse-governance/1 — AI agents calling tools

```
spec: neuroverse-governance/1
rulebook format string: neuroverse-governance/1
approval contract: neuroverse-governance-approval/1
mission format string: neuroverse-governance-plan/1
```

The same engine, in the words of software. An AI agent (the **participant**) calls **tools** in **scopes** under the authority of a **principal** (the human or account it works for), with **arguments** that bind to declared facts, possibly through a **delegation** chain, possibly under a **mission** that tightens the permanent rules for one job. Everything in § 1–§ 15 holds unless this section says otherwise; this section is normative for the `/1` format, and the cases in `conformance/d1-*.json` … `d6-*.json` check it. The reference implementation decides both formats with one `evaluate`, one `evaluatePlan` and one conflict check (§ 16.2); a port MAY do the same or implement `/1` alone.

### 16.1 Vocabulary mapping

| Concept | `/3` | `/1` |
|---|---|---|
| The thing asked for | `action`; `actions[]`; request `action` | `tool`; `tools[]`; request `tool` |
| Where it happens | `area`; `areas[]`; request `areaId` | `scope`; `scopes[]`; request `scope` |
| Who asks | `participant { id, kind, roleId }` | `participant { id, kind, roleId, delegatedBy? }` |
| Whose authority the asker acts under | the site | `principal { id }` (required) |
| Delegation | — | `delegation: [{ id, roleId }]`, harness-assembled, outermost first |
| Arguments | — | `args`: the payload; declared per tool, bound to facts (§ 16.4) |
| Role tool lists | `roles[].actions` | `roles[].tools` |
| Tag lists | `tags.actions / areas / roles` | `tags.tools / scopes / roles` |
| History condition | `{ actions, areas?, sameArea?, … }` | `{ tools, scopes?, sameScope?, … }` |
| Plan checks | `ends_in.areas`, `ends_with.actions`, `before.sameArea`, `at_most.actions`, `at_least.actions` | `ends_in.scopes`, `ends_with.tools`, `before.sameScope`, `at_most.tools`, `at_least.tools` |
| History entry | `{ action, areaId, at? }` | `{ tool, scope, at? }` |
| Site identity | `site { id, name, hours? }` | `id`, `name` |
| Derived role-limit rules | `area_role_limits:<area>[:deny]` | `scope_role_limits:<scope>[:deny]` (same derivation, § 2.2) |
| Built-in checks | `required_facts`, `area_declared`, `role_declared`, `role_permits_action`, `unknown_action`, `plan_area_continuity` | `required_facts`, `args_wellformed`, `scope_declared`, `role_declared`, `scope_permits_tool`, `role_permits_tool`, `unknown_tool`, `delegation_exceeds_authority` (no continuity check: a call lands in its own scope) |
| Approval request | rule, rulebook, participant, action, area | rule, rulebook, **principal**, participant, tool, scope, **argsDigest** |
| Rejected approvals | prose in the PAUSE reason | prose and `approvalsRejected: [{ id, nonce?, code, reason }]` |

`rulebook_version` stays outside `builtin` for both formats (§ 5). Selectors (`who`, `does`, `where`), conditions, outcomes, rule and plan-rule shapes, findings, canonical JSON, the fingerprint, signatures, authorities and versioning are shared unchanged. `at_least` (at least `count` steps whose action/tool is in the selector) joins the plan checks of § 3.5 for both formats; it is additive.

### 16.2 One evaluator

A `/1` rulebook is normalised into the internal shape the `/3` algorithm runs on — `tools` as the action map, `scopes` as the area map, role `tools` as actions, tag lists and history conditions renamed — and decided by the same steps; the names it emits (built-in IDs, approval-request fields, witnesses) are the `/1` ones. The `/1`-only steps (1b, 4b below; the `/1` approval binding in step 8) are gated on things a `/3` rulebook cannot declare, so a `/3` rulebook's trace is unchanged. A port that implements `/1` alone MUST produce the same decisions.

### 16.3 Rulebook, request, decision

**Rulebook** ([`spec/governance-rulebook.schema.json`](spec/governance-rulebook.schema.json)): `format`, `id`, `name`, `kinds`, `authorities` (highest first), `tools[]`, `scopes[]`, `roles[]` (with `tools`, inheritance resolved), `facts`, `limits`, `tags { tools, scopes, roles }`, `otherwise`, `trustedKeys?`, `rules`, `planRules?`, `mission?` (§ 16.7), `builtin` (MUST include the eight `/1` IDs), `findings`, `fingerprint` (SHA-256 over canonical JSON of everything but `findings`, § 8). A **tool** is `{ id, name?, kinds, tags?, scopes?, args?, requires?, effects? }`: `scopes` (non-empty when given) are the only scopes it may be called in; `args` is `{ <field>: { fact, required? } }`, every `fact` a declared fact other than `approvedBy`, no two fields binding one fact; `requires` are facts that MUST be present when it is called (the derived facts a harness supplies). A **scope** is `{ id, name, tags?, allowRoles?, denyRoles? }`. Validation is § 2's, with the `/1` builtin list, the `scope_role_limits:` prefix, and the tool declarations above; the fingerprint is checked over the `/1` artifact as written.

**Condition scope (both formats, clarifying § 3).** A rule may condition on a fact that is required, has a default, or — when the rule's `does` selector is closed (no `*`, so it never matches an undeclared action/tool) — is listed in `requires` by every action/tool the selector resolves to. Such a fact is present whenever the rule can match. A rulebook that was valid before this clarification is unchanged by it.

**Request** ([`spec/governance-request.schema.json`](spec/governance-request.schema.json)):

```json
{ "principal": { "id": "owner-sam" },
  "participant": { "id": "subagent-1", "kind": "agent", "roleId": "subagent_reader", "delegatedBy": "recon-agent-1" },
  "delegation": [ { "id": "recon-agent-1", "roleId": "reconciliation_agent" } ],
  "tool": "ledger.query", "scope": "accounting",
  "args": { "sql": "SELECT …" },
  "facts": { "sql_is_destructive": false, "requested_rows": 500, "approvedBy": … },
  "history": [ { "tool": "report.write", "scope": "reporting", "at": "2026-10-16T09:10:00Z" } ],
  "now": "2026-10-16T09:16:00Z", "consumedApprovals": [] }
```

`principal.id` MUST be a non-empty string (step 1). **Facts, `history`, `now`, `consumedApprovals` and `delegation` come from the harness; `args` is the payload the tool would run with, as the adapter parsed it; nothing comes from the requester's description of itself.**

**Decision** ([`spec/governance-decision.schema.json`](spec/governance-decision.schema.json)): as § 5, with `approvalRequests[]` = `{ ruleId, by?, rulebookFingerprint, principalId, participantId, tool, scope, argsDigest, reason, setBy }` and `approvalsRejected?` (§ 16.6), present iff the request carried an approval that cleared no wait. A check on the trace of a rule that stayed waiting carries the same list. Neither ever carries the approval object, its signature or any key material.

### 16.4 Arguments bound to facts

Step 1b, after the role is resolved and before step 2:

| Condition | Outcome |
|---|---|
| `args` present and not an object (string, number, array, null) | BLOCK `args_wellformed` |
| the tool is undeclared | nothing more is judged here (step 4 refuses it as `unknown_tool`, or asks per `otherwise`) |
| a field present in `args` is not declared for the tool | BLOCK `args_wellformed` |
| a declared field with `required` (default true) is absent | BLOCK `args_wellformed` |
| a field's value is not valid for its fact's type (§ 3.2 `factProblem`) | BLOCK `args_wellformed` |
| `facts` also carries a bound fact | BLOCK `args_wellformed` (two sources for one fact) |
| `args` is not plain JSON (a value canonical JSON refuses) | BLOCK `args_wellformed` |

Every valid declared field is copied into the facts as its bound fact; step 2 then sees it as any other fact. `argsDigest = fingerprint(args ?? {})` (§ 8.2). Derived facts (`sql_is_destructive` from `sql`) are NOT bound: they are facts the tool `requires`, computed by functions the integrator declares to the harness, never by the requester and never by a model; a missing one is `required_facts`.

### 16.5 Delegation stays bounded

Shape (step 1, `required_facts`): `participant.delegatedBy`, when given, is a non-empty string; it is set iff `delegation` is given; `delegation` is a non-empty list of `{ id, roleId }` with non-empty strings; the last link's `id` equals `delegatedBy`. Step 4b, after `role_permits_tool` ALLOW and the tool's `scopes` (a call outside them is BLOCK `scope_permits_tool`): for each link in order, a link whose role is undeclared is BLOCK `role_declared`; a link whose role does not list the tool is BLOCK `delegation_exceeds_authority`, naming the link (index, id, role); stop at the first. When every link permits it, one ALLOW check `delegation_exceeds_authority` is recorded. Never rules (step 3) run first. Mission rules (§ 16.7) bind `who: "*"`, so they bind delegates.

### 16.6 Approvals bound to arguments

Signed approval (`neuroverse-governance-approval/1`, [`spec/governance-approval.schema.json`](spec/governance-approval.schema.json)):

```
{ spec, id, authority?, roleId?, ruleId, rulebookFingerprint, principalId, participantId,
  tool, scope, argsDigest, nonce, issuedAt, expiresAt, keyId, signature }
```

Ed25519 over the canonical JSON without `signature`, as § 9.2. `verifyApproval` branches on `spec`: for `/1` the required fields are the list above, `rulebookFingerprint` and `argsDigest` are 64 hex, key, authority, role and signature checks are § 9.3's; it returns the verified handle. In step 8 the approval is BOUND only when all hold, in this order, the first failure being the rejection `code`:

| Check | `code` |
|---|---|
| it is not a `robot-domain-rules` approval (spec `/3`, or `requestDigest`, or bound to `action`/`areaId`), and its `spec`, if given, is `neuroverse-governance-approval/1` | `spec` |
| with `trustedKeys`: `spec` is declared | `spec` |
| with `trustedKeys`: it is the verified handle (§ 9.3) | `unverified` |
| `ruleId` equals the waiting rule | `rule` |
| `rulebookFingerprint` equals the deciding rulebook's (a mission's compiled rulebook when one is active) | `rulebook` |
| `principalId == request.principal.id` | `principal` |
| `participantId`, `tool`, `scope` equal the request's | `participant`, `tool`, `scope` |
| `argsDigest == fingerprint(request.args ?? {})` | `args` |
| `nonce` is a string not in `consumedApprovals` | `replayed` |
| `issuedAt`, `expiresAt` are timestamps; `now` is given; `issuedAt <= now < expiresAt` | `window_malformed`, `no_now`, `not_yet_valid`, `expired` |
| sufficiency for `by` (§ 6 step 8) | `insufficient` |
| it already cleared another wait in this decision | `spent` |

Without `trustedKeys`, a plain approval (`"name"` or `{ id, authority?, roleId? }`) is accepted as in § 9.4 — development only. **A rejected approval grants nothing and refuses nothing**: the wait stays unmet, the status is PAUSE, a fresh approval request is returned, and `approvalsRejected` names each supplied approval with its `code` and reason. Approving a call with `amount: 120` never clears the same call with `amount: 1200`. Repeated refusals are the harness's to record (as history, e.g. a tool `approval_refused` no role lists) and a rule's to judge (§ 3.4).

### 16.7 Missions: plans as tightening overlays

A mission ([`spec/governance-plan.schema.json#/$defs/mission`](spec/governance-plan.schema.json)) is `{ format: "neuroverse-governance-plan/1", id, objective, permitsRuleId?, permits: [{ id?, tool, scopes? }], approvals?: [{ id?, tool, scopes?, by }], order?: [{ id?, first, then }], atMost?: [{ id?, tools, count }], requires?: [{ id?, tools }] }`; every tool, scope and `by` it names MUST be declared, and it has no other members. `compileMission(rulebook, mission)` MUST refuse a rulebook that already carries a mission or declares an authority `plan`, and returns a NEW `/1` rulebook: the same vocabulary, rules and `otherwise`; the authority `plan` appended last; `mission: { id, objective, planDigest: fingerprint(mission) }`; and these rules, each `setBy: "plan"`, `who: "*"`, `source: { kind: "system", ref: "plan:<id>/…" }`:

| Mission entry | Rule |
|---|---|
| `permits` (when some tool is not permitted) | `permitsRuleId ?? "plan:tools"`: deny, `does: ["!t₁", "!t₂", …]` (every permitted tool removed from the universe; `"*"` when nothing is permitted) |
| `permits[i].scopes` (when some scope is excluded) | `id ?? "plan:scope:<tool>"`: deny, `does: <tool>`, `where: ["!s₁", …]` |
| `approvals[i]` | `id ?? "plan:approve:<tool>"`: `wait { for: "approval", by }`, `does: <tool>`, `where: scopes ?? "*"` |
| `order[i]` | `id ?? "plan:before:<then>"`: deny, `does: <then>`, `history: [{ tools: <first>, op: "<", value: 1 }]` |
| `atMost[i]` | plan rule `id ?? "plan:at_most:<i>"`: `at_most { tools, count }` |
| `requires[i]` | plan rule `id ?? "plan:requires:<i>"`: `at_least { tools, count: 1 }` |

A mission has no `allow`, so it can only add refusals and waits; strictest-wins (§ 6) makes anything looser than the permanent rules ineffective. The compiled fingerprint covers rulebook and mission, every decision under the mission carries it, and an approval issued under the base rulebook does not bind under the mission (`code: rulebook`). An `order` rule needs `history` on every call of its `then` tool (§ 3.4: a missing history is `required_facts`), so a harness MUST supply the participant's history with every request.

### 16.8 Plans

`evaluatePlan` takes a `/1` rulebook and a `/1` plan ([`spec/governance-plan.schema.json`](spec/governance-plan.schema.json)): `{ principal, participant, delegation?, steps: [{ tool, scope?, args?, facts?, note? }], initialFacts, history?, clock?, startTime?, stepDurationSeconds?, now?, consumedApprovals? }`, with § 12's algorithm, except that a step's scope is its own: a step without `scope` is in the previous step's, a step with one is there, and there is no continuity refusal (a tool call lands in a scope; it does not carry the participant). The result is § 12's with `steps[].tool`, `steps[].scope` and `finalScope`.

### 16.9 The enforcing adapter

`engine/adapters/tool-call/` is the reference adapter: `govern(call, session, harness, executor)`. It takes a tool call ([`spec/tool-call.schema.json`](spec/tool-call.schema.json): `{ id?, function: { name, arguments } }` or `{ name, args }`), a session (`{ rulebook, principal, participant, delegation? }`), a harness (`now()`, `resolveScope`, `facts`, `derive` functions by fact, `reserve` for spend ledgers, `approvals`, the consumed-nonce set, the history store) and an executor, and MUST: parse `arguments` when a string; build the request from the harness alone (facts, scope, history, `now`, nonces) and the call (tool, args); verify approvals in the trusted layer; `evaluate`; call the executor exactly once on ALLOW or LIMIT (passing `limits`), never on BLOCK or PAUSE; turn any throw before the executor into BLOCK (`tool_call_malformed`, `args_wellformed`, `harness_failed`, `evaluation_failed`, all `setBy: "adapter"`, never in a rulebook) with the executor not called; refuse a `/3` rulebook (`rulebook_version`); on an executor throw record it, release the spend reservation and consume no nonce; on success commit the reservation, consume `approvalsUsed` and append the call to history. **Cumulative limits are the harness's arithmetic**: it computes a projected total (e.g. `projected_spend_this_week`) with an atomic reserve-then-commit, supplies it as a fact, and the rule is a plain comparison; the engine adds nothing.

### 16.10 Versions and doors

`evaluate`, `evaluatePlan`, `validateRulebook`, `checkRulebook`, `verifyAndEvaluate`, `verifyAndEvaluatePlan`, `verifyApproval`, `signRulebook`, `verifyRulebookSignature` take both formats. `/3`-only doors — `backtest`, the glasses bridge, rendering, drafting, templates, the 0.2 legacy input, `compileDomain` — refuse a `/1` rulebook by name; `compileMission` and the adapter refuse a `/3` rulebook by name. A `neuroverse-governance/N` with N ≠ 1 is refused with the migration (recompile with `compileGovernance`, re-issue approvals). A `/3` approval at a `/1` rulebook and a `/1` approval at a `/3` rulebook are rejected by spec and never reinterpreted.

### 16.11 Backtest

`backtest(rulebook, events, options?)` and `compareBacktests` (§ 13) take a `/1` rulebook and a log of `/1` requests ([`spec/governance-backtest.schema.json`](spec/governance-backtest.schema.json)) — the shape the adapter's `Governed.request` already has, plus `outcome` — and run § 13.2 unchanged through the dialect: `tool`/`scope` are read where § 13 reads `action`/`areaId`; a built history entry is `{ tool, scope, at }`; a gap is a call whose reasons include `unknown_tool`; a request whose arguments cannot be bound (§ 16.4) is a missing-facts row named `args`. The `/1` report has `byScope` for `byArea`, `rows[].tool`/`rows[].scope` for `action`/`areaId`, and `gaps[].tool` for `action`; everything else, including the comparison, is identical. A request's own `history` is used as given, so a log recorded by the adapter (whose requests carry the harness's history) replays exactly as it was decided. Cases: `conformance/d7-backtest.json`.
