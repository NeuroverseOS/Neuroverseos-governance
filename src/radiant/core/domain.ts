/**
 * @neuroverseos/governance/radiant — actor_domain classification
 *
 * Every event in Radiant's pipeline is tagged `life`, `cyber`, or `joint`
 * before signals are extracted. This is the fixed, universal classifier —
 * declared as part of the NeuroverseOS universe, not a per-worldmodel choice.
 *
 *   life   — human actions alone (commits authored by people, human reviews,
 *             human-written decisions)
 *   cyber  — AI or bot actions alone (AI-generated code, automated comments,
 *             bot commits)
 *   joint  — activity where human and AI both participated: a human accepting
 *             or rejecting AI output, iterative co-edits, co-authored commits,
 *             escalation loops between life-side and cyber-side
 *
 * The classifier is deterministic and pure. It looks only at the event's
 * actor metadata and its relationships (co-actors, respondsTo). Adapters
 * are responsible for populating those fields accurately from their source
 * of truth (GitHub, ExoCortex, chat, etc.).
 *
 * See radiant/PROJECT-PLAN.md — "actor_domain Classification".
 */

// ─── Types ─────────────────────────────────────────────────────────────────

/**
 * What kind of actor produced an event.
 *
 *   human   — a person
 *   ai      — an AI agent (Claude, Copilot-generated code, agent output)
 *   bot     — a non-AI automated actor (dependabot, CI bots, webhook bots)
 *   unknown — actor kind cannot be determined from available evidence
 *
 * `bot` is grouped with `ai` on the cyber side of the boundary — from the
 * gyroscope's perspective, both are non-human actors operating in the
 * universe. The distinction may matter to specific signals but not to the
 * domain classifier.
 */
export type ActorKind = 'human' | 'ai' | 'bot' | 'unknown';

/** An entity that produced or participated in an event. */
export interface Actor {
  id: string;
  kind: ActorKind;
  name?: string;
}

/** A reference to a prior event this one responds to. */
export interface EventReference {
  eventId: string;
  actor: Actor;
}

/**
 * A minimal event shape sufficient for domain classification and downstream
 * signal extraction. Adapters (GitHub, ExoCortex, chat) populate these
 * fields from their respective source of truth.
 *
 * The classifier in this file only reads `actor`, `coActors`, and
 * `respondsTo`. Signal extractors (step 4) additionally read `kind` and
 * `content`. Later steps may extend this interface; keep additions
 * optional so existing adapters remain compatible.
 */
export interface Event {
  id: string;
  timestamp: string; // ISO 8601
  actor: Actor;
  /** Additional participants (e.g. Co-authored-by trailers on a commit). */
  coActors?: Actor[];
  /** If this event is a reply, review, merge, or edit of a prior event. */
  respondsTo?: EventReference;
  /**
   * Loose event-kind tag from the adapter — e.g. `commit`, `pr_opened`,
   * `pr_review`, `issue_comment`, `chat_message`. Free-form string so any
   * adapter can declare its own kinds; signal extractors interpret them.
   */
  kind?: string;
  /**
   * Human-meaningful textual content of the event — commit message, PR
   * description, review body, chat message body, etc. Used by signal
   * extractors to score clarity and related signals.
   */
  content?: string;
  /** Adapter-specific structured data, opaque to core Radiant. */
  metadata?: Record<string, unknown>;
}

/**
 * The three-way domain tag applied to every event. Drives which gyroscope's
 * capability space the event contributes to (life or cyber), or — for joint
 * events — feeds the bridging-component scoring that powers N.
 */
export type ActorDomain = 'life' | 'cyber' | 'joint';

// ─── Internal predicates ───────────────────────────────────────────────────

/** Life side of the boundary: human, or unknown (conservative default). */
function isLifeSide(k: ActorKind): boolean {
  return k === 'human' || k === 'unknown';
}

/** Cyber side of the boundary: AI or bot. */
function isCyberSide(k: ActorKind): boolean {
  return k === 'ai' || k === 'bot';
}

/** True iff `a` and `b` are on opposite sides of the life/cyber boundary. */
function crossesBoundary(a: ActorKind, b: ActorKind): boolean {
  return (isLifeSide(a) && isCyberSide(b)) || (isCyberSide(a) && isLifeSide(b));
}

// ─── Classifier ────────────────────────────────────────────────────────────

/**
 * Tag an event as `life`, `cyber`, or `joint`.
 *
 * Rules, in order:
 *
 *   1. Mixed authorship → joint. If the event has co-actors and the
 *      combined set spans both life-side and cyber-side, the event is
 *      joint regardless of who's primary. A commit with a human author
 *      and an AI co-author is joint.
 *
 *   2. Cross-boundary response → joint. If the event is a response to a
 *      prior event whose actor is on the opposite side of the boundary,
 *      the event is joint. A human merging an AI-authored PR is joint.
 *      An AI commenting on a human-authored issue is joint.
 *
 *   3. Otherwise, classify by the primary actor's kind.
 *      - ai | bot  → cyber
 *      - human | unknown → life
 *
 * Rule 3's `unknown → life` default is deliberate: most events in most
 * systems come from humans. When an adapter cannot determine actor kind,
 * the event is assumed human until proven otherwise. Upgrading requires
 * positive evidence (a bot user-agent, an AI signature, a "Co-authored-by:
 * Claude" trailer, etc.), never absence.
 */
export function classifyActorDomain(event: Event): ActorDomain {
  const primaryKind = event.actor.kind;
  const coKinds = (event.coActors ?? []).map((a) => a.kind);

  // Rule 1: mixed authorship across the boundary → joint
  const allKinds = [primaryKind, ...coKinds];
  const hasLife = allKinds.some(isLifeSide);
  const hasCyber = allKinds.some(isCyberSide);
  if (hasLife && hasCyber) {
    return 'joint';
  }

  // Rule 2: cross-boundary response → joint
  if (
    event.respondsTo &&
    crossesBoundary(primaryKind, event.respondsTo.actor.kind)
  ) {
    return 'joint';
  }

  // Rule 3: homogeneous — classify by primary actor
  return isCyberSide(primaryKind) ? 'cyber' : 'life';
}
