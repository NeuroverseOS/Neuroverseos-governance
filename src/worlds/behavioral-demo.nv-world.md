---
world_id: behavioral-demo
name: Behavioral Governance Runtime
version: 2.0.0
default_profile: baseline
alternative_profile: pressure
---

# Thesis

Behavior should be interpreted through repeated action, clarity of ownership, and consistency between stated intent and follow-through. Decisions are governed by observed alignment, not stated confidence. When the system must choose — ship, delay, or escalate — it reads behavior, not promises.

# Invariants

- `behavior_over_promises` — Repeated action is stronger evidence than stated intent (structural, immutable)
- `clarity_matters` — Ambiguity and ownership diffusion are meaningful behavioral signals (structural, immutable)
- `decisions_follow_alignment` — Decisions must reflect measured alignment, not declared readiness (structural, immutable)

# State

## follow_through
- type: number
- min: 0
- max: 100
- step: 5
- default: 70
- label: Follow Through
- description: Measures how consistently actions match stated commitments

## clarity
- type: number
- min: 0
- max: 100
- step: 5
- default: 75
- label: Clarity
- description: Measures directness and explicitness of communication

## alignment_score
- type: number
- min: 0
- max: 100
- step: 5
- default: 80
- label: Alignment Score
- description: Measures consistency between stated priorities and actual behavior

## decision
- type: enum
- options: no_decision, ship_now, delay, escalate
- default: no_decision
- label: Decision
- description: Governed output — what the system recommends based on behavioral alignment

# Assumptions

## baseline
- name: Baseline
- description: Normal operating conditions
- pressure_level: medium

## pressure
- name: Pressure
- description: Higher stress and ambiguity environment
- pressure_level: high

# Rules

## rule-001: ambiguity erodes alignment (degradation)
Repeated ambiguity weakens trust in stated intent.

When clarity < 50 [state]
Then alignment_score *= 0.80

> trigger: Communication becomes vague or indirect.
> rule: Reduced clarity lowers confidence in alignment.
> shift: Interpretation becomes more cautious.
> effect: Alignment score declines.

## rule-002: weak follow-through erodes alignment (degradation)
Failure to follow through consistently weakens credibility.

When follow_through < 60 [state]
Then alignment_score *= 0.75
Collapse: alignment_score < 30

> trigger: Commitments are not consistently honored.
> rule: Action matters more than promises.
> shift: Behavior is interpreted as misaligned.
> effect: Alignment score drops sharply.

## rule-003: strong execution reinforces alignment (advantage)
Consistent action strengthens trust in intent.

When follow_through >= 85 [state] AND clarity >= 80 [state]
Then alignment_score *= 1.10

> trigger: Clear communication and strong execution occur together.
> rule: Consistency strengthens alignment.
> shift: Interpretation becomes more confident.
> effect: Alignment score improves.

## rule-004: alignment supports shipping (advantage)
Strong alignment produces a ship decision.

When alignment_score >= 75 [state]
Then decision = "ship_now"

> trigger: Behavioral alignment is strong enough to act.
> rule: When actions match intent consistently, the system recommends execution.
> shift: Decision moves to ship.
> effect: Decision set to ship_now.

## rule-005: ambiguity requires delay (degradation)
Moderate alignment produces a delay decision.

When alignment_score < 75 [state] AND alignment_score >= 45 [state]
Then decision = "delay"

> trigger: Alignment is uncertain — behavior and intent are not fully consistent.
> rule: When signals are mixed, the system recommends waiting for clarity.
> shift: Decision moves to delay.
> effect: Decision set to delay.

## rule-006: misalignment triggers escalation (structural)
Weak alignment produces an escalate decision.

When alignment_score < 45 [state]
Then decision = "escalate"

> trigger: Behavioral alignment has degraded below acceptable threshold.
> rule: When actions consistently contradict stated intent, the system escalates.
> shift: Decision moves to escalate.
> effect: Decision set to escalate.

# Gates

- STRONG: alignment_score >= 85
- STABLE: alignment_score >= 65
- WATCHING: alignment_score >= 45
- FRAGILE: alignment_score > 30
- MISALIGNED: alignment_score <= 30

# Outcomes

## alignment_score
- type: number
- range: 0-100
- display: percentage
- label: Alignment Score
- primary: true

## decision
- type: enum
- range: ship_now, delay, escalate, no_decision
- display: label
- label: Decision

# Lenses
- policy: role_default

## behavioral-interpreter
- tagline: Read patterns, not promises.
- description: Interprets actions as signals, prioritizes repeated behavior over stated intent, and flags ambiguity, ownership diffusion, and misalignment.
- formality: neutral
- verbosity: concise
- emotion: neutral
- confidence: balanced
- tags: behavior, signals, alignment, analysis
- default_for_roles: all
- priority: 65
- stackable: true

> response_framing: Prioritize observed behavior and follow-through over stated intent.
> behavior_shaping: Look for repeated ambiguity, delay, or ownership diffusion as meaningful signals.
> value_emphasis: Name alignment or misalignment between words and actions clearly.
> content_filtering: Distinguish observed behavior from inference and speculation.
