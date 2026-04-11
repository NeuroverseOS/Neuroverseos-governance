---
world_id: behavioral-demo
name: Behavioral Demo
version: 1.0.0
default_profile: baseline
alternative_profile: pressure
---

# Thesis

Behavior should be interpreted through repeated action, clarity of ownership, and consistency between stated intent and follow-through. Actions are stronger evidence than promises. Ambiguity is a signal, not noise. Alignment is measured by what people do, not what they say.

# Invariants

- `behavior_over_promises` — Repeated action is stronger evidence than stated intent (structural, immutable)
- `clarity_matters` — Ambiguity and ownership diffusion are meaningful behavioral signals (structural, immutable)

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
