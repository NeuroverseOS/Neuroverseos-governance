/**
 * Domain rules — type definitions.
 *
 * A domain is one physical site (a store, a warehouse, a clinic, a lab) where
 * robots, people and AI-driven agents work side by side. The site declares
 * its own vocabulary — the kinds of participants, the actions, the areas, the
 * roles, the facts a request must bring, the limits a rule may impose and the
 * authorities that set rules — and rules are written in one shape by whoever
 * the site grants authority: people, systems or agents. The result is one
 * rulebook that every participant asks before it acts.
 *
 * Location is NOT this module's job. The spatial system (posemesh, for
 * example) decides which area a participant is in and passes that area ID
 * in with the facts. This module only decides what is allowed there.
 *
 *   spatial system: "robot-7 is in area aisle-3; 2 people are there"
 *        │
 *        ▼
 *   evaluateDomainAction(rulebook, request) → ALLOW | LIMIT | PAUSE | BLOCK
 *                                             + the rules that decided it
 *
 * Everything here is plain data and pure functions. No clock, no network,
 * no model. Same rulebook + same request = same decision.
 */

// ─── Vocabulary: what the site declares ──────────────────────────────────────

/** A value a fact can carry. */
export type FactValue = number | string | boolean;

export type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const DAYS: readonly Day[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** Something a participant can ask to do, in the site's own words. */
export interface ActionDef {
  /** ID used in requests and rules ("move", "deliver_meds", "camera_capture"). */
  id: string;
  /** Human-readable name. Defaults to the ID with spaces. */
  name?: string;
  /** Which participant kinds may do this at all ("robot", "person", or any site-defined kind). */
  kinds: string[];
  /** Free tags rules can match ("movement", "capture"). */
  tags?: string[];
  /** Facts that must be present when this action is requested (on top of the always-required facts). */
  requires?: string[];
  /**
   * What this action does to the declared facts, as far as the rulebook is
   * told. Used only when a whole plan is checked (`evaluatePlan`): each step
   * is evaluated against the facts projected by applying the earlier steps'
   * effects. Effects touch declared facts only; the single-action decision
   * never applies them.
   */
  effects?: Effect[];
  /** Other words people use for it; used only by plain-text drafting. */
  synonyms?: string[];
  /** `/1` only (a tool): the argument fields the call carries, each bound to a declared fact (SPEC.md § 16.4). Inert on a `/3` action. */
  args?: Record<string, ArgBinding>;
  /** `/1` only (a tool): the scopes it may be called in. Absent: any declared scope. Inert on a `/3` action. */
  scopes?: string[];
}

/** How one argument field of a `/1` tool binds to a fact: the field's type is the fact's type; `required` defaults to true. */
export interface ArgBinding {
  fact: string;
  required?: boolean;
}

/**
 * One effect of an action on the projected facts of a plan:
 *   set       — the fact becomes `value` (any declared type)
 *   add       — a number fact goes up by `value`
 *   subtract  — a number fact goes down by `value`
 *   move      — after this step the participant is in the step's area
 *               (the next step's area defaults to it)
 * A projected value outside the fact's declared range is not clamped: the
 * next step is BLOCK `required_facts`, which says the plan as described
 * cannot be carried out.
 */
export type Effect =
  | { op: 'set'; fact: string; value: FactValue }
  | { op: 'add'; fact: string; value: number }
  | { op: 'subtract'; fact: string; value: number }
  | { op: 'move' };

/** A place the spatial system can report. */
export interface AreaDef {
  /** The area ID your spatial system reports (for example a posemesh zone or anchor ID). */
  id: string;
  name: string;
  /** Free tags rules can match ("staff-only", "restricted", "dock", "aisle"). */
  tags?: string[];
  /**
   * Only these roles (by role ID) may act in this area. A role must be listed
   * itself: inheriting a listed role's actions does not pass its area permission.
   * Compiled into a never rule `area_role_limits:<area>`.
   */
  allowRoles?: string[];
  /** These roles (by role ID) may never act in this area. */
  denyRoles?: string[];
  /** Other words people use for it; used only by plain-text drafting. */
  synonyms?: string[];
}

/** A kind of participant with a fixed list of actions it may take. */
export interface RoleDef {
  /** Role ID used in requests ("cleaning_robot", "staff", "shopper"). */
  id: string;
  name: string;
  /** The participant kind this role belongs to ("robot", "person", ...). */
  kind: string;
  /** Actions this role may take at all. Rules can still say no, slower, or wait. */
  actions: string[];
  /** Inherit another role's actions (same kind only). Inheritance only adds, never removes. */
  inherits?: string;
  /** Free tags rules can match ("staff", "after-hours", "visitor"). */
  tags?: string[];
  /** Other words people use for it; used only by plain-text drafting. */
  synonyms?: string[];
}

export type FactType = 'number' | 'boolean' | 'time' | 'day' | 'enum' | 'string';

/**
 * A fact every request must bring (or that has a default). The rulebook
 * trusts the facts it is given and never fills one in.
 */
export interface FactDef {
  id: string;
  type: FactType;
  /** The request must carry it. A missing or invalid required fact is BLOCK `required_facts`. */
  required?: boolean;
  /** Used when the request does not carry the fact. A fact with a default is never "missing". */
  default?: FactValue;
  /** number only */
  min?: number;
  max?: number;
  integer?: boolean;
  /** enum only: the allowed values. */
  values?: string[];
  description?: string;
  /** Other words people use for it; used only by plain-text drafting. */
  synonyms?: string[];
}

/** A named numeric limit rules may impose ("maxSpeedMps"). Several rules on one limit combine by MIN. */
export interface LimitDef {
  id: string;
  name?: string;
  /** Unit for rendering and text drafting ("m/s"). */
  unit?: string;
  /**
   * The request fact that carries the requested value. When present and at or
   * under the limit, the decision is ALLOW and carries the limit; when absent
   * or over it, the decision is LIMIT.
   */
  requestedFact?: string;
  /** The actions a limit normally applies to; used by plain-text drafting as the default `does`. */
  appliesTo?: Selector;
  /** Other words people use for it; used only by plain-text drafting. */
  synonyms?: string[];
}

/** Who may set rules. Listed highest first. */
export interface AuthorityDef {
  id: string;
  name?: string;
}

export interface SiteDef {
  /** Your ID for this site. */
  id: string;
  name: string;
  /** Optional: the posemesh (or other spatial system) domain ID this rulebook is for. */
  spatialDomainId?: string;
  /** Opening hours, 24h "HH:MM" local time. Close may be earlier than open for overnight sites. Optional. */
  hours?: { open: string; close: string };
}

// ─── Rules ───────────────────────────────────────────────────────────────────

/**
 * Who / does / where selector. Entries are OR-ed:
 *   '*'                 everything
 *   'inventory_robot'   an ID
 *   'tag:staff'         everything carrying that tag
 *   'kind:robot'        every role (or action) of that kind
 *   '!dock'             remove this ID, tag or kind from the selection
 * A selector with only '!' entries starts from everything. A single string
 * is the same as a one-entry list.
 */
export type Selector = '*' | string | string[];

export type CompareOp = '==' | '!=' | '>' | '>=' | '<' | '<=';

/** One condition over one fact. A rule's `when` list is AND-ed. */
export type Condition =
  | { fact: string; op: CompareOp; value: FactValue }
  | { fact: string; op: 'in'; values: FactValue[] }
  /** Time window on a `time` fact. `from` <= t < `to`; `from` later than `to` means overnight. */
  | { fact: string; op: 'between'; from: string; to: string }
  /** Day set on a `day` fact. */
  | { fact: string; op: 'days'; days: Day[] };

/**
 * A condition over the participant's recent history, supplied by the caller
 * (`request.history`). The count of entries whose action is in `actions`
 * (and whose area is in `areas`, or is the request's own area when
 * `sameArea`), within the last `withinMinutes` before `request.now` when a
 * window is given, is compared with `value`. The core keeps no history and
 * no clock: without `request.history` a rule that needs it is BLOCK
 * `required_facts`; with a window and no `request.now`, the same.
 */
export interface HistoryCondition {
  actions: Selector;
  /** Only entries in these areas count. Default: any area. */
  areas?: Selector;
  /** Only entries in the request's own area count. */
  sameArea?: boolean;
  /** Only entries whose `at` is at most this many minutes before `request.now` count: absolute time, dates included (1–1440). */
  withinMinutes?: number;
  op: CompareOp;
  /** A whole number, 0 or more. */
  value: number;
}

/** One thing the participant already did, as the caller reports it. */
export interface HistoryEntry {
  action: string;
  areaId: string;
  /** An ISO 8601 timestamp WITH a date (`YYYY-MM-DDTHH:MM[:SS[.sss]][Z|±HH:MM]`; no offset means UTC). Required by rules that use a window. */
  at?: string;
}

/**
 * An ISO 8601 timestamp with a date: `YYYY-MM-DDTHH:MM`, optional seconds
 * and fraction, optional `Z` or `±HH:MM` offset. Without an offset it is
 * read as UTC, so every implementation reads it the same. Used for
 * `request.now`, `history[].at`, approvals' `issuedAt`/`expiresAt`.
 */
export type Timestamp = string;

/** What a rule says when it matches. */
export type Outcome =
  | { answer: 'allow' }
  | { answer: 'limit'; limits: Record<string, number> }
  /**
   * `by`: who may approve — an authority ID (that authority or a higher one),
   * a role ID, or 'tag:<role tag>'. Without `by`, any approval clears the wait.
   */
  | { answer: 'wait'; for: 'approval' | 'condition'; by?: string }
  /** `instead`: a hint about what to do instead (for example "dock"). Returned as `decision.then`. */
  | { answer: 'deny'; instead?: string };

/**
 * Where a rule came from. `text`: drafted from plain words; `agent`: written
 * by an AI agent; `system`: written by another system (a policy service, a
 * regulation feed). What gives a rule weight is never its source but `setBy`:
 * the authority the space granted its author.
 */
export interface RuleSource {
  kind: 'template' | 'question' | 'declaration' | 'manual' | 'text' | 'agent' | 'system' | 'builtin';
  /** Template ID, "question:answer", "area:restroom", the original text, the agent or system ID, ... */
  ref: string;
}

/** One rule. Every rule in a rulebook has this shape, whatever produced it. */
export interface Rule {
  /** Stable ID, cited in every decision. */
  id: string;
  /** The rule in plain words. */
  text: string;
  who: Selector;
  does: Selector;
  where: Selector;
  /** Conditions over facts, AND-ed. Empty or absent = always. */
  when?: Condition[];
  /** Conditions over the participant's recent history, AND-ed with `when`. */
  history?: HistoryCondition[];
  then: Outcome;
  /** Plain-English reason shown in decisions. Defaults to `text`. */
  reason?: string;
  source: RuleSource;
  /** The authority that set this rule — a level the space declared (a person's, a system's or an agent's). Declared, never inferred. */
  setBy: string;
  /** An invariant: checked first, nothing overrides it. Must have `then.answer === 'deny'`. */
  never?: boolean;
}

// ─── Plan rules: what a whole plan must look like ────────────────────────────

/**
 * A rule about the shape of a whole plan rather than one step. Checked only
 * by `evaluatePlan`. A plan rule can only reject (deny): it carries the
 * authority that set it like any rule, and is cited by ID in the result.
 *
 *   ends_in    the plan's last step must leave the participant in `areas`
 *   ends_with  the plan's last action must be in `actions`
 *   before     every step whose action is in `then` must be preceded (earlier
 *              in the plan, or in the supplied history) by a step whose
 *              action is in `first` — in the same area when `sameArea`
 *   at_most    at most `count` steps whose action is in `actions`
 *   at_least   at least `count` steps whose action is in `actions`
 */
export type PlanCheck =
  | { kind: 'ends_in'; areas: Selector }
  | { kind: 'ends_with'; actions: Selector }
  | { kind: 'before'; first: Selector; then: Selector; sameArea?: boolean }
  | { kind: 'at_most'; actions: Selector; count: number }
  /** at least `count` steps whose action is in `actions` (additive in 0.6; the mirror of at_most). */
  | { kind: 'at_least'; actions: Selector; count: number };

export interface PlanRule {
  id: string;
  text: string;
  /** Which roles the plan rule binds. */
  who: Selector;
  check: PlanCheck;
  reason?: string;
  setBy: string;
  source: RuleSource;
}

/** One step of a plan an agent proposes. */
export interface PlanStep {
  action: string;
  /**
   * The area of the step. Defaults to where the previous step left the
   * participant. The first step must say. A later step may name an area only
   * when it is that place, or when its action has a `move` effect (it moves
   * there); otherwise the step is BLOCK `plan_area_continuity`.
   */
  area?: string;
  /** Facts the planner expects at this step (people counts, an approval), laid over the projected facts. */
  facts?: Record<string, unknown>;
  /** Free-form, carried into the result for the planner's own use. */
  note?: string;
}

/** A whole plan: who, the steps in order, and the facts before the first step. */
export interface Plan {
  participant: { id: string; kind: string; roleId: string };
  steps: PlanStep[];
  initialFacts: Record<string, unknown>;
  /** What the participant did before the plan starts. Seeds the history each step sees. */
  history?: HistoryEntry[];
  /** The declared time fact that advances as the plan runs. */
  clock?: string;
  /** "HH:MM" at the first step. With `clock` and `stepDurationSeconds`, later steps advance. Defaults to the time of day of `now` when `now` is given. */
  startTime?: string;
  stepDurationSeconds?: number;
  /**
   * The instant of the first step (a `Timestamp`), advancing by
   * `stepDurationSeconds` per step: each step's `request.now`, used for
   * history windows and approval expiry, and the `at` of the history entries
   * the plan appends. Without it those entries have no `at`.
   */
  now?: Timestamp;
  /** Approval instances (nonces) already used, as for a request. */
  consumedApprovals?: string[];
}

export interface PlanStepResult {
  index: number;
  action: string;
  areaId: string;
  /** The facts this step was decided on: initial facts, projected effects, the step's own facts. */
  facts: Record<string, unknown>;
  decision: DomainDecision;
  note?: string;
}

export interface PlanEvaluation {
  /** The strictest status across the plan checks and the evaluated steps. */
  status: DomainDecisionStatus;
  /** Steps in order, up to and including the first BLOCK (nothing is projected past a refusal). */
  steps: PlanStepResult[];
  /** Every plan rule that applies, with its verdict. */
  planChecks: PlanRuleCheck[];
  /** The first BLOCK, by step. Absent when nothing blocks. */
  firstViolation?: { stepIndex: number; ruleId: string; reason: string; setBy: string; from: 'step' | 'plan' };
  /** Every approval a PAUSE step would need, so a planner can collect them up front. */
  approvalRequests: ApprovalRequest[];
  /** Every approval instance a step of the plan would spend ({ ruleId, nonce }), in step order: the caller records them once the plan runs. A nonce a step uses is consumed for every later step. */
  approvalsUsed: Array<{ ruleId: string; nonce: string }>;
  /** The projected facts after the last evaluated step. */
  finalFacts: Record<string, unknown>;
  /** Where the participant is after the last evaluated step: where it was asked to act, or — when that step was refused for not being there (plan_area_continuity) — where the earlier steps left it. */
  finalArea: string;
  /** `fingerprint` of the plan as described, with every `approvedBy` and `consumedApprovals` left out, so collecting approvals does not change it. */
  planDigest: string;
  /** The rulebook that decided. */
  fingerprint: string;
}

/** A plan rule's verdict on a plan. `stepIndex` is the step where it was violated, when that is meaningful. */
export interface PlanRuleCheck {
  ruleId: string;
  status: 'ALLOW' | 'BLOCK';
  reason: string;
  setBy: string;
  stepIndex?: number;
}

// ─── Findings: rules at odds ─────────────────────────────────────────────────

export type FindingKind =
  | 'contradiction'        // two rules at the same authority can match the same request and give different answers
  | 'authority-override'   // a lower authority tries to loosen what a higher authority set; it never takes effect
  | 'tightening'           // a lower authority makes a higher authority's answer stricter (allowed; for information)
  | 'shadowed'             // a rule fully covered by a stricter one; it can never change a decision
  | 'duplicate'            // same scope, same answer
  | 'limit_disagreement'   // two limits on the same name overlap with different values
  | 'never_vs_rule'        // a rule tries to allow something a never rule forbids
  | 'unmatched_selector';  // a selector entry (a tag, a kind) matches nothing declared, or a whole selector is empty: the rule binds less than it reads (one rule, no witness)

export interface Finding {
  kind: FindingKind;
  severity: 'conflict' | 'warning' | 'info';
  ruleIds: string[];
  /**
   * 'certain': the analysis is exact and `witness` is a real request that matches both rules.
   * 'possible': the overlap could not be decided exactly (one of the rules has history
   *             conditions, which depend on what the caller supplies); no witness is given.
   * Rules that provably never match the same request produce no finding.
   */
  certainty: 'certain' | 'possible';
  /** A concrete request that matches both rules. Present on every 'certain' finding between two rules; a finding on one rule (unmatched_selector) or between two plan rules has none. */
  witness?: Witness;
  message: string;
}

/** A request that triggers both rules of a finding. Facts the rules do not mention are at a valid sample value. */
export interface Witness {
  participant: { id: string; kind: string; roleId: string };
  action: string;
  areaId: string;
  facts: Record<string, FactValue>;
}

// ─── The rulebook ────────────────────────────────────────────────────────────

/** Checks the evaluator always runs. They have IDs so decisions can cite them. */
export interface BuiltinCheck {
  id: string;
  text: string;
}

/**
 * The complete, portable rulebook for one site. Plain JSON — store it, sign
 * it, ship it to every robot, pair of glasses and agent.
 *
 * `compileDomain` returns it deep-frozen and detached from the input.
 * `verifyFingerprint(rulebook)` recomputes the fingerprint of a copy received
 * as JSON and says whether it still matches.
 */
export interface Rulebook {
  /** The rulebook's declared version. A `/2` rulebook is refused with a versioned message, never reinterpreted (SPEC.md § 11). */
  format: 'neuroverse-domain-rules/3';
  site: SiteDef;
  /** The template this rulebook was built from, if any. */
  template?: string;
  kinds: string[];
  /** Highest first. */
  authorities: AuthorityDef[];
  actions: ActionDef[];
  areas: AreaDef[];
  /** Roles with inheritance already resolved (actions are the full set). */
  roles: RoleDef[];
  facts: FactDef[];
  limits: LimitDef[];
  /** Tags rules may name even when no declared thing carries them yet. */
  tags: { actions: string[]; areas: string[]; roles: string[] };
  /** Template question answers, by question ID. */
  answers: Record<string, string>;
  /** What happens when a request asks for an action the rulebook does not know. */
  otherwise: 'deny' | 'wait-for-approval';
  /**
   * Keys whose signed approvals count. When declared (non-empty), an approval
   * clears a wait only if it is a verified `SignedApproval` for this request
   * and this rulebook. When absent, a plain `Approval` is accepted (development only).
   */
  trustedKeys?: TrustedKey[];
  /** Every rule, never rules included (flagged `never: true`). */
  rules: Rule[];
  /** Rules about whole plans (`evaluatePlan`). Omitted when there are none. */
  planRules?: PlanRule[];
  builtin: BuiltinCheck[];
  /** What the conflict check found. Compile never hides these. Not part of the fingerprint: their messages are free text. */
  findings: Finding[];
  /** SHA-256 (64 hex) of the canonical JSON of everything above except `findings`. Cite it in logs to prove which rules decided. */
  fingerprint: string;
}

// ─── Requests and decisions ──────────────────────────────────────────────────

/** The approval contract version carried by every signed approval. */
export const APPROVAL_SPEC = 'robot-domain-rules-approval/3';

/**
 * Who approved an action. A plain string is accepted as an unqualified
 * approval (development only). When the rulebook declares `trustedKeys`,
 * only the verified approval object `verifyApproval` returned (object
 * identity, never a flag in the data: a `verified` member in a request is
 * ignored) that is bound to this rule, this rulebook, this participant,
 * this action and this area, is within its validity window at
 * `request.now`, and whose `nonce` is not in `request.consumedApprovals`,
 * clears that rule's approval wait. It never clears anything else: every
 * other rule is decided on the facts the request carries now.
 * `facts.approvedBy` may be one approval or a list; each clears at most one wait.
 */
export interface Approval {
  id: string;
  /** The authority the approver holds, by ID. */
  authority?: string;
  /** The role the approver holds, by ID. */
  roleId?: string;
  /** @deprecated Ignored on input since 0.5.3: verification is object identity (`verifyApproval`'s return value), never a member of the data. */
  verified?: boolean;
  /** `APPROVAL_SPEC` on a /3 signed approval. */
  spec?: string;
  /** The rule whose approval wait this clears. */
  ruleId?: string;
  /** The fingerprint of the rulebook the approver saw. */
  rulebookFingerprint?: string;
  participantId?: string;
  action?: string;
  areaId?: string;
  /** The unique approval instance; the caller records it as consumed once acted on. */
  nonce?: string;
  issuedAt?: Timestamp;
  expiresAt?: Timestamp;
  /** The trusted key that signed it. */
  keyId?: string;
  signature?: string;
  /** @deprecated /2 binding; present only on a /2 approval, which is refused. */
  requestDigest?: string;
}

/**
 * What a PAUSE for approval returns: everything a person (or their signing
 * tool) needs to produce a `SignedApproval` for exactly this rule, this
 * participant, this action and this area under this rulebook.
 */
export interface ApprovalRequest {
  /** The rule that is waiting. */
  ruleId: string;
  /** The authority (or higher), role, or `tag:<role tag>` the approver must hold. Absent: anyone. */
  by?: string;
  /** The rulebook the approver is approving under. */
  rulebookFingerprint: string;
  participantId: string;
  action: string;
  areaId: string;
  reason: string;
  setBy: string;
}

/**
 * An approval as data, signed with Ed25519. See `signApproval` /
 * `verifyApproval`. It authorises ONE rule's approval wait for ONE
 * participant, action and area under ONE rulebook, for ONE use (`nonce`)
 * within [`issuedAt`, `expiresAt`). It is not a statement about the facts:
 * the live decision checks the facts current at evaluation time.
 */
export interface SignedApproval {
  spec: typeof APPROVAL_SPEC;
  /** The approver's ID. */
  id: string;
  authority?: string;
  roleId?: string;
  ruleId: string;
  rulebookFingerprint: string;
  participantId: string;
  action: string;
  areaId: string;
  /** Unique per approval instance (a UUID, a counter under the key — the signer's choice). */
  nonce: string;
  issuedAt: Timestamp;
  /** Required. The evaluator refuses the approval at or after this instant (`request.now`). */
  expiresAt: Timestamp;
  /** Which of the rulebook's `trustedKeys` signed it. */
  keyId: string;
  /** Ed25519 signature, 64 bytes as lowercase hex, over the canonical JSON of every other field. */
  signature: string;
}

/** A public key the rulebook trusts for approvals. */
export interface TrustedKey {
  keyId: string;
  /** Raw Ed25519 public key, 32 bytes as lowercase hex. */
  publicKey: string;
  /** The authority this key may approve as. A signed approval under this key must claim this authority or none. */
  authority?: string;
  /** The role this key may approve as. */
  roleId?: string;
}

export interface DomainRequest {
  participant: { id: string; kind: string; roleId: string };
  action: string;
  /** The area the participant is in (or, for an entering action, the area it wants to enter). */
  areaId?: string;
  /** @deprecated 0.2 name for `areaId`. Still accepted. */
  zoneId?: string;
  /** @deprecated 0.2 field; copied into `facts.targetRobotId` when that fact is absent. */
  targetRobotId?: string;
  /**
   * The facts the rulebook declares, plus the built-in `approvedBy` (an
   * `Approval` or a non-empty string, or a list of them, set when a person
   * has approved this specific action). The evaluator never guesses a fact:
   * a required fact that is missing or invalid gives BLOCK `required_facts`,
   * never a crash and never permission.
   */
  facts: Record<string, unknown>;
  /**
   * What this participant did recently, as the caller reports it. Needed only
   * by rules with `history` conditions; a rule that needs it and does not get
   * it is BLOCK `required_facts`.
   */
  history?: HistoryEntry[];
  /**
   * The instant of this request, as the caller's trusted layer supplies it
   * (the engine has no clock). Needed when a rule in scope has a history
   * window, and when a signed approval is checked; without it in those cases
   * the request is BLOCK `required_facts`.
   */
  now?: Timestamp;
  /**
   * Nonces of approvals the caller has already acted on. An approval whose
   * nonce is listed here does not apply (replay). The caller keeps this set;
   * `decision.approvalsUsed` says what to add to it after acting.
   */
  consumedApprovals?: string[];
}

/**
 *   ALLOW — go ahead
 *   LIMIT — go ahead, within `limits`
 *   PAUSE — wait: for a person's approval, or for the situation to change
 *   BLOCK — no
 */
export type DomainDecisionStatus = 'ALLOW' | 'LIMIT' | 'PAUSE' | 'BLOCK';

export interface DomainCheck {
  ruleId: string;
  status: DomainDecisionStatus;
  /** Plain-English reason. */
  reason: string;
  /** The authority that set the rule; 'builtin' for the evaluator's own checks. */
  setBy: string;
  /** `/1` only: on the check of a rule that stayed waiting, why each supplied approval was rejected (never the approval itself). */
  approvalsRejected?: ApprovalRejection[];
}

/** A decision, parameterised by the approval-request shape of its format: `DomainDecision` (/3) or `GovernanceDecision` (/1). */
export interface DecisionOf<A> {
  status: DomainDecisionStatus;
  /** The strictest checks — the reasons for this decision. */
  reasons: DomainCheck[];
  /** Effective limits (MIN across matching limit rules), present when any limit rule matched. */
  limits?: Record<string, number>;
  /** A deny rule's `instead` hint (for example "dock"). */
  then?: string;
  /** When the status is PAUSE for approval: what to get signed, one per rule still waiting. */
  approvalRequests?: A[];
  /**
   * The approval instances that cleared a wait in this decision, when the
   * status is ALLOW or LIMIT: `{ ruleId, nonce }` for each. After acting, the
   * caller adds each nonce to the `consumedApprovals` it supplies next time.
   */
  approvalsUsed?: Array<{ ruleId: string; nonce: string }>;
  /**
   * `/1` only: present iff the request carried an approval that cleared no
   * wait — why each one was rejected, by code (SPEC.md § 16.6). It names the
   * approval (`id`, `nonce`) and never carries the approval object, its
   * signature or any key material.
   */
  approvalsRejected?: ApprovalRejection[];
  /** Every check that ran, in order. */
  trace: DomainCheck[];
  /** The rulebook that decided. */
  fingerprint: string;
}

export type DomainDecision = DecisionOf<ApprovalRequest>;

// ─── neuroverse-governance/1: AI agents calling tools (SPEC.md § 16) ─────────
//
// The same engine, in the words of software: a `tool` is an action, a `scope`
// is an area, a `principal` is the human whose authority the agent acts
// under, and a call carries `args` that bind to declared facts. One evaluator
// decides both formats (model.ts holds the mapping); these types are the /1
// artifacts as they are written and read.

/** A tool an agent may call: the /1 word for an action. `args` fields bind to declared facts; `scopes` bounds where it may be called. */
export interface ToolDef {
  id: string;
  name?: string;
  kinds: string[];
  tags?: string[];
  /** The scopes this tool may be called in. Absent: any declared scope. */
  scopes?: string[];
  /** Every argument field the call may carry, bound to a declared fact. An undeclared field, a missing required one or a wrong type is refused (`args_wellformed`). */
  args?: Record<string, ArgBinding>;
  /** Facts that must be present when this tool is called (derived or supplied by the harness), on top of always-required facts. */
  requires?: string[];
  effects?: Effect[];
}

/** A scope a call lands in: the /1 word for an area (a data store, a mail domain, a file tree, a payment rail). */
export interface ScopeDef {
  id: string;
  name: string;
  tags?: string[];
  /** Only these roles may act in this scope. Compiled into the never rule `scope_role_limits:<scope>`. */
  allowRoles?: string[];
  /** These roles may never act in this scope. */
  denyRoles?: string[];
}

/** A role in /1: the tools it may call. */
export interface GovernanceRoleDef {
  id: string;
  name: string;
  kind: string;
  tools: string[];
  inherits?: string;
  tags?: string[];
}

/** A /1 history condition: `tools`/`scopes` for `actions`/`areas`. */
export interface GovernanceHistoryCondition {
  tools: Selector;
  scopes?: Selector;
  sameScope?: boolean;
  withinMinutes?: number;
  op: CompareOp;
  value: number;
}

/** A /1 rule: as a rule, with history conditions in /1 words. */
export type GovernanceRule = Omit<Rule, 'history'> & { history?: GovernanceHistoryCondition[] };

export type GovernancePlanCheck =
  | { kind: 'ends_in'; scopes: Selector }
  | { kind: 'ends_with'; tools: Selector }
  | { kind: 'before'; first: Selector; then: Selector; sameScope?: boolean }
  | { kind: 'at_most'; tools: Selector; count: number }
  | { kind: 'at_least'; tools: Selector; count: number };

export type GovernancePlanRule = Omit<PlanRule, 'check'> & { check: GovernancePlanCheck };

/** What a compiled mission rulebook records about the mission it carries. */
export interface MissionRef {
  id: string;
  objective: string;
  /** `fingerprint` of the mission as given to `compileMission`. */
  planDigest: string;
}

/** The complete, portable /1 rulebook. Plain JSON; `compileGovernance` returns it deep-frozen. */
export interface GovernanceRulebook {
  format: 'neuroverse-governance/1';
  id: string;
  name: string;
  kinds: string[];
  /** Highest first. A mission rulebook ends with `plan`. */
  authorities: AuthorityDef[];
  tools: ToolDef[];
  scopes: ScopeDef[];
  roles: GovernanceRoleDef[];
  facts: FactDef[];
  limits: LimitDef[];
  tags: { tools: string[]; scopes: string[]; roles: string[] };
  otherwise: 'deny' | 'wait-for-approval';
  trustedKeys?: TrustedKey[];
  rules: GovernanceRule[];
  planRules?: GovernancePlanRule[];
  /** Present on a rulebook `compileMission` produced. */
  mission?: MissionRef;
  builtin: BuiltinCheck[];
  findings: Finding[];
  /** SHA-256 (64 hex) of the canonical JSON of everything above except `findings`. */
  fingerprint: string;
}

/** What `compileGovernance` takes. Roles list `tools`; everything else as the rulebook. */
export interface GovernanceCompileInput {
  id: string;
  name: string;
  kinds?: string[];
  authorities: AuthorityDef[];
  tools: ToolDef[];
  scopes: ScopeDef[];
  roles: GovernanceRoleDef[];
  facts?: FactDef[];
  limits?: LimitDef[];
  tags?: { tools?: string[]; scopes?: string[]; roles?: string[] };
  otherwise?: 'deny' | 'wait-for-approval';
  trustedKeys?: TrustedKey[];
  rules?: GovernanceRule[];
  planRules?: GovernancePlanRule[];
  /** Set by `compileMission`; not for callers. */
  mission?: MissionRef;
}

/** One link of a delegation chain, as the harness assembled it: the delegating participant and its role. */
export interface DelegationLink {
  id: string;
  roleId: string;
}

export interface GovernanceParticipant {
  id: string;
  kind: string;
  roleId: string;
  /** The participant that delegated to this one. Requires `request.delegation`. */
  delegatedBy?: string;
}

export interface GovernanceHistoryEntry {
  tool: string;
  scope: string;
  at?: Timestamp;
}

/** One question: may this participant, under this principal, call this tool in this scope with these arguments, given these facts? */
export interface GovernanceRequest {
  /** The human (or account) whose authority the participant acts under. Required. */
  principal: { id: string };
  participant: GovernanceParticipant;
  /** The chain from the principal's direct agent down to `participant.delegatedBy`, outermost first. Required iff `delegatedBy` is set. */
  delegation?: DelegationLink[];
  tool: string;
  scope: string;
  /** The real argument payload the tool would run with. Declared fields bind to facts; anything else is refused. */
  args?: unknown;
  /** Harness-supplied facts (derived and supplied), plus the built-in `approvedBy`. Never the requester's. */
  facts: Record<string, unknown>;
  history?: GovernanceHistoryEntry[];
  now?: Timestamp;
  consumedApprovals?: string[];
}

/** What a /1 PAUSE for approval returns: everything a signer needs for exactly this call. */
export interface GovernanceApprovalRequest {
  ruleId: string;
  by?: string;
  rulebookFingerprint: string;
  principalId: string;
  participantId: string;
  tool: string;
  scope: string;
  /** `fingerprint` of the call's `args` (of `{}` when absent). */
  argsDigest: string;
  reason: string;
  setBy: string;
}

export const GOVERNANCE_APPROVAL_SPEC = 'neuroverse-governance-approval/1';

/** A /1 signed approval: one rule's wait, for one principal, participant, tool, scope and exact arguments, under one rulebook, once, within a window. */
export interface GovernanceSignedApproval {
  spec: typeof GOVERNANCE_APPROVAL_SPEC;
  id: string;
  authority?: string;
  roleId?: string;
  ruleId: string;
  rulebookFingerprint: string;
  principalId: string;
  participantId: string;
  tool: string;
  scope: string;
  argsDigest: string;
  nonce: string;
  issuedAt: Timestamp;
  expiresAt: Timestamp;
  keyId: string;
  signature: string;
}

export type ApprovalRejectionCode =
  | 'spec' | 'unverified' | 'rule' | 'rulebook' | 'principal' | 'participant' | 'tool' | 'scope' | 'args'
  | 'replayed' | 'window_malformed' | 'no_now' | 'not_yet_valid' | 'expired' | 'insufficient' | 'spent';

/** Why one supplied approval cleared nothing. Names the approval; never carries it. */
export interface ApprovalRejection {
  id: string;
  nonce?: string;
  code: ApprovalRejectionCode;
  reason: string;
}

export type GovernanceDecision = DecisionOf<GovernanceApprovalRequest>;

/** One step of a /1 plan a planner proposes. */
export interface GovernancePlanStep {
  tool: string;
  scope?: string;
  args?: unknown;
  facts?: Record<string, unknown>;
  note?: string;
}

/** A whole /1 plan for `evaluatePlan`: the pre-check a planner runs before acting. */
export interface GovernancePlan {
  principal: { id: string };
  participant: GovernanceParticipant;
  delegation?: DelegationLink[];
  steps: GovernancePlanStep[];
  initialFacts: Record<string, unknown>;
  history?: GovernanceHistoryEntry[];
  clock?: string;
  startTime?: string;
  stepDurationSeconds?: number;
  now?: Timestamp;
  consumedApprovals?: string[];
}

export interface GovernancePlanStepResult {
  index: number;
  tool: string;
  scope: string;
  facts: Record<string, unknown>;
  decision: GovernanceDecision;
  note?: string;
}

export interface GovernancePlanEvaluation {
  status: DomainDecisionStatus;
  steps: GovernancePlanStepResult[];
  planChecks: PlanRuleCheck[];
  firstViolation?: { stepIndex: number; ruleId: string; reason: string; setBy: string; from: 'step' | 'plan' };
  approvalRequests: GovernanceApprovalRequest[];
  approvalsUsed: Array<{ ruleId: string; nonce: string }>;
  finalFacts: Record<string, unknown>;
  finalScope: string;
  planDigest: string;
  fingerprint: string;
}

/**
 * A mission: the temporary overlay a principal gives an agent for one job
 * (SPEC.md § 16.7). It can only tighten: every tool not in `permits` is
 * denied, a permitted tool outside its `scopes` is denied, `approvals` add
 * waits, `order` adds history rules, and `atMost`/`requires` judge a whole
 * plan. `compileMission` turns it into rules at the authority `plan`, below
 * every declared authority.
 */
export interface Mission {
  format: 'neuroverse-governance-plan/1';
  id: string;
  objective: string;
  /** The id of the compiled "only these tools" deny rule. Default `plan:tools`. */
  permitsRuleId?: string;
  /** The tools the mission may use; every other tool is denied. `scopes` narrows where; `id` names the compiled scope rule (default `plan:scope:<tool>`). */
  permits: Array<{ id?: string; tool: string; scopes?: string[] }>;
  approvals?: Array<{ id?: string; tool: string; scopes?: string[]; by: string }>;
  order?: Array<{ id?: string; first: Selector; then: Selector }>;
  atMost?: Array<{ id?: string; tools: Selector; count: number }>;
  requires?: Array<{ id?: string; tools: Selector }>;
}
