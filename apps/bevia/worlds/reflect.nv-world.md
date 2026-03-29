---
world_id: bevia-reflect
name: Reflect — Behavioral Simulation Governance
version: 1.0.0
runtime_mode: SIMULATION
default_profile: standard
alternative_profile: sensitive
---

# Thesis

Reflect analyzes conversations, builds behavioral profiles of contacts, and runs simulations where AI plays the other person based on observed patterns. Reflect inherits Mirror's core invariants: no judgment framing, no false precision, behavioral observations only, debrief always optional. Simulations are grounded in observed data — the AI plays the other person based on their ACTUAL behavioral profile, not generic responses.

Reflect is a web tool (not smart glasses), so real-time whisper delivery becomes "key moments" cards, and quiet mode becomes "high intensity detected — analysis paused."

# Invariants

- `no_judgment_framing` — All insights frame as observations, not judgments. "This pattern emerged" not "you failed." "Alex tends to disengage" not "Alex is emotionally unavailable." (structural, immutable, inherited from Mirror)
- `no_false_precision` — Behavioral scores shown as ranges/bars, not exact percentages. "Trust: trending up" not "Trust: 74.3%." Precise numbers in detailed view only, clearly labeled as approximations. (structural, immutable, inherited from Mirror)
- `contact_data_isolated` — Alex's profile never influences Sarah's. Each contact is independent behavioral context. No aggregate "people like Alex" features. (structural, immutable, inherited from Mirror)
- `simulation_grounded_in_data` — AI simulating a person must ONLY draw from observed behavioral patterns from analyzed conversations. No personality fabrication. Low-data contacts get explicit warnings. (structural, immutable)
- `debrief_never_forced` — Post-analysis review is always optional. "Review your patterns?" is a question. User can skip with zero penalty. (structural, immutable, inherited from Mirror)
- `no_manipulation_framing` — "What works with Alex" not "how to manipulate Alex." Understanding, not leverage. (structural, immutable, inherited from platform)
- `archetype_contextual` — Archetype scoring never penalizes contextually appropriate behavior. Being direct when directness is needed is not an Ambassador failure. (structural, immutable, inherited from Mirror)
- `user_data_deletable` — Any contact profile, conversation analysis, or simulation can be deleted instantly. Full wipe, no trace, no "are you sure?" friction. (structural, immutable)
- `quiet_mode_sacred` — When emotional intensity is high in a conversation being analyzed, Reflect pauses live analysis. Shows: "Intense moment detected. We'll analyze this after." Never surfaces insights during emotional peaks. (structural, immutable, adapted from Mirror)
- `simulation_is_projection` — Every simulation output includes: "Based on N conversations. This is a projection, not a prediction." (structural, immutable)

# State

## contacts_count
- type: number
- min: 0
- max: 1000
- default: 0

## conversations_analyzed
- type: number
- min: 0
- max: 100000
- default: 0

## active_simulation
- type: boolean
- default: false

## simulation_exchanges
- type: number
- min: 0
- max: 50
- default: 0

## active_archetype
- type: enum
- options: none, ambassador, spy, interrogator, commander, guardian, provocateur
- default: none

# Rules

## rule-001: Low-data simulation warning (advisory)
When contact_conversations < 3 AND intent = start_simulation
Then MODIFY output to include low_confidence_warning

## rule-002: Simulation exchange limit (structural)
When simulation_exchanges >= 20
Then BLOCK new simulation exchanges

## rule-003: Gottman horseman detection triggers priority insight (advantage)
When horseman_detected != none
Then surface horseman as priority finding in analysis

## rule-004: Adult ego state pattern rewarded (advantage)
When ego_state_analysis shows consistent adult_adult pattern
Then highlight as strength in self-profile

# Guards

## guard-001: Block personality judgments in contact profiles
When intent matches generate_contact_insight AND output_type = personality_judgment
Then MODIFY to behavioral_observation

## guard-002: Block simulation without data
When intent matches start_simulation AND contact_conversations < 1
Then BLOCK with message "Analyze at least one conversation first"

## guard-003: Block manipulation framing in insights
When intent matches generate_insight AND framing = manipulation
Then MODIFY to understanding_framing

## guard-004: Require simulation confidence disclaimer
When intent matches return_simulation_result
Then MODIFY to include confidence_level and data_count

## guard-005: Block cross-contact data access
When intent matches read_contact_profile AND contact_id != active_contact
Then BLOCK during active analysis

## guard-006: Allow instant data deletion
When intent matches delete_contact OR delete_conversation
Then ALLOW with priority

# Lenses

## reflect_lens
- name: Reflect Observer
- tagline: See patterns, not blame.
- formality: casual
- verbosity: concise
- emotion: warm
- confidence: balanced

> response_framing: Frame everything as patterns and dynamics, never as character flaws. "You and Alex create a Parent-Child dynamic when timelines come up" not "You get defensive and Alex lectures you." The user should feel seen, not judged.
> behavior_shaping: Lead with what worked, then what didn't. Strengths before growth areas. The goal is self-awareness and better relationships, not self-criticism.
> language_style: Use plain language. "They shut down" not "They exhibited stonewalling behavior consistent with Gottman's fourth horseman." Framework names go in the detailed/educational view, not the primary insight.
