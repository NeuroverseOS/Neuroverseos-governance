---
world_id: mentraos-mirror
name: Mirror — Behavioral Simulation Engine
version: 1.0.0
runtime_mode: SIMULATION
default_profile: standard
alternative_profile: sensitive
---

# Thesis

Mirror is a unified behavioral simulation layer for MentraOS smart glasses. It operates at three zoom levels of the same system: Shadow (real-time consequence prediction), Graph (reputation tracking over time), and Archetype (intentional identity training). The user does not open three apps — they experience one continuous loop: live conversation → insight → behavior choice → reputation update → archetype alignment → debrief → back to real life.

Mirror hooks into MentraOS transcript streams via `onTranscriptSegment(speaker, text, timestamp)`. It classifies conversational events, simulates behavioral consequences using a composite model grounded in OCEAN/Big Five, Gottman's Four Horsemen, Social Exchange Theory, and Transactional Analysis. It tracks per-contact reputation profiles with dimension-specific exponential decay curves. It optionally scores archetype alignment when the user opts into Game Mode.

The behavioral model is deterministic. The same transcript segment + context → same classification + consequence prediction. No randomness. No network calls during evaluation. AI classification assistance happens only during post-conversation debrief when the user is available to correct misclassifications.

User rules from MentraOS always override Mirror's behavior. If the user says "no recording," Mirror stops. If the user says "quiet mode," Mirror suppresses all whispers. The user is king.

# Invariants

- `no_mid_conversation_interruption` — Mirror must never interrupt the user's natural conversation flow with modal prompts, sounds, or attention-demanding overlays. Whispers are passive overlays only. (structural, immutable)
- `no_false_precision` — Mirror must never display precise numerical scores (e.g., "trust: 44%") in real-time whispers. Directional language only ("trust dropping," "conflict rising"). Precise scores are reserved for Graph mode where users expect approximation. (structural, immutable)
- `no_judgment_framing` — Mirror must never frame insights as judgment ("you failed," "you were wrong"). All framing must be observational ("this pattern emerged," "this shifted"). (structural, immutable)
- `user_consent_required` — Mirror must never begin tracking, classifying, or simulating without explicit user activation. No background analysis before opt-in. (structural, immutable)
- `contact_data_isolated` — Per-contact reputation profiles must never leak between contacts. Alex's trust score must not influence Sarah's profile. Each contact is an independent behavioral context. (structural, immutable)
- `quiet_mode_absolute` — When quiet mode activates (automatic or manual), ALL whispers, scoring, and reputation updates cease immediately. Recording continues only if user has not disabled it. Quiet mode is sacred. (structural, immutable)
- `debrief_never_forced` — Post-conversation debrief must always be optional. "Review this?" is a question, never a demand. User can skip any debrief with zero penalty. (structural, immutable)
- `archetype_contextual` — Archetype mode must never penalize behavior that is contextually appropriate. Being direct in a situation requiring directness is not a failure of "Ambassador" alignment. Context overrides archetype scoring. (structural, immutable)
- `replay_is_you` — When the AI simulates the user in debrief/replay mode, it must mimic the user's actual speech patterns, vocabulary, and cadence learned from their transcripts. It must sound like the user on a good day, not a generic coach. (structural, immutable)
- `user_rules_take_precedence` — When a user's personal MentraOS governance rules conflict with Mirror's rules, the user's rules win. Mirror can only be tightened by user rules, never relaxed. (structural, immutable)

# State

## mode
- type: enum
- options: shadow, graph, archetype
- default: shadow
- label: Active Mode
- description: Current operating mode. Shadow is default (always-on, minimal). Graph is user-initiated review. Archetype is opt-in training mode.

## quiet_mode
- type: boolean
- default: false
- label: Quiet Mode
- description: When active, suppresses ALL whispers, scoring, and reputation updates. Triggered automatically during high emotional intensity or manually by user.

## emotional_intensity
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: Emotional Intensity
- description: Current conversation emotional intensity (0-100). Derived from transcript velocity, Gottman horseman detection, and escalation patterns. Triggers quiet mode at threshold.
- display_as: integer

## quiet_mode_threshold
- type: number
- min: 50
- max: 95
- step: 5
- default: 75
- label: Quiet Mode Threshold
- description: Emotional intensity level that triggers automatic quiet mode activation.
- display_as: integer

## whispers_delivered
- type: number
- min: 0
- max: 1000
- step: 1
- default: 0
- label: Whispers Delivered
- description: Number of whisper insights delivered in the current conversation. Hard-capped at 2 per conversation in Shadow mode.

## max_whispers_per_conversation
- type: number
- min: 0
- max: 5
- step: 1
- default: 2
- label: Max Whispers Per Conversation
- description: Maximum whisper insights allowed per single conversation. Default 2. Higher in Archetype mode.

## conversation_active
- type: boolean
- default: false
- label: Conversation Active
- description: Whether a conversation is currently being tracked.

## events_detected
- type: number
- min: 0
- max: 10000
- step: 1
- default: 0
- label: Events Detected
- description: Total conversational events detected in this session.

## active_contact_id
- type: enum
- options: none, contact_1, contact_2, contact_3, contact_4, contact_5, contact_6, contact_7, contact_8, contact_9, contact_10
- default: none
- label: Active Contact
- description: Currently identified conversation partner. Loaded from user's contact list.

## archetype_active
- type: enum
- options: none, ambassador, spy, interrogator, commander, guardian, provocateur
- default: none
- label: Active Archetype
- description: Currently active archetype for training mode. None when not in Archetype mode.

## archetype_alignment
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: Archetype Alignment
- description: Current conversation alignment score with active archetype (0-100).
- display_as: percentage

## trust_delta_session
- type: number
- min: -100
- max: 100
- step: 1
- default: 0
- label: Trust Delta (Session)
- description: Net trust change with active contact during this conversation.

## composure_delta_session
- type: number
- min: -100
- max: 100
- step: 1
- default: 0
- label: Composure Delta (Session)
- description: Net composure change during this conversation.

## influence_delta_session
- type: number
- min: -100
- max: 100
- step: 1
- default: 0
- label: Influence Delta (Session)
- description: Net influence change with active contact during this conversation.

## empathy_delta_session
- type: number
- min: -100
- max: 100
- step: 1
- default: 0
- label: Empathy Delta (Session)
- description: Net empathy change during this conversation.

## volatility_delta_session
- type: number
- min: -100
- max: 100
- step: 1
- default: 0
- label: Volatility Delta (Session)
- description: Net volatility change during this conversation. Positive = more volatile.

## assertiveness_delta_session
- type: number
- min: -100
- max: 100
- step: 1
- default: 0
- label: Assertiveness Delta (Session)
- description: Net assertiveness change during this conversation.

## openness_delta_session
- type: number
- min: -100
- max: 100
- step: 1
- default: 0
- label: Openness Delta (Session)
- description: Net openness change during this conversation.

## conflict_risk
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: Conflict Risk
- description: Current real-time conflict probability based on conversation trajectory (0-100).
- display_as: percentage

## ego_state_user
- type: enum
- options: unknown, parent, adult, child
- default: unknown
- label: User Ego State
- description: Current detected Transactional Analysis ego state of the user. Parent = controlling/nurturing. Adult = rational/factual. Child = emotional/creative.

## ego_state_other
- type: enum
- options: unknown, parent, adult, child
- default: unknown
- label: Other Ego State
- description: Current detected ego state of the conversation partner.

## horseman_detected
- type: enum
- options: none, criticism, contempt, defensiveness, stonewalling
- default: none
- label: Gottman Horseman Detected
- description: Most recent Gottman Four Horseman pattern detected in conversation. These are research-validated predictors of relationship breakdown.

## conversation_energy
- type: number
- min: -100
- max: 100
- step: 1
- default: 0
- label: Conversation Energy
- description: Net energy arc of the conversation. Positive = energizing. Negative = draining. Tracked as first-class metric per user request.

## debrief_pending
- type: boolean
- default: false
- label: Debrief Pending
- description: Whether a post-conversation debrief is available but not yet reviewed.

## classification_corrections
- type: number
- min: 0
- max: 10000
- step: 1
- default: 0
- label: Classification Corrections
- description: Total number of times the user corrected an AI classification during debrief. Used to improve per-user model accuracy.

## streak_count
- type: number
- min: 0
- max: 1000
- step: 1
- default: 0
- label: Archetype Streak
- description: Number of consecutive conversations with archetype alignment above 80%.

# Assumptions

## standard
- name: Standard Mode
- description: Default behavioral sensitivity. Balanced detection thresholds. Suitable for professional and casual conversations.
- parameters: { quiet_mode_threshold: 75, max_whispers_per_conversation: 2 }

## sensitive
- name: Sensitive Mode
- description: Higher sensitivity for emotionally charged contexts. Lower quiet mode threshold. Fewer whispers. More conservative event detection.
- parameters: { quiet_mode_threshold: 60, max_whispers_per_conversation: 1 }

## training
- name: Training Mode
- description: Used during Archetype mode. Higher whisper allowance for active feedback. Standard quiet mode threshold.
- parameters: { quiet_mode_threshold: 75, max_whispers_per_conversation: 4 }

# Rules

## rule-001: Whisper budget enforcement (structural)
Mirror must respect the whisper budget per conversation. Exceeding the limit degrades trust in the system.

When whispers_delivered >= max_whispers_per_conversation
Then whispers_delivered += 0

> trigger: Whisper delivery attempted after budget exhausted
> rule: Hard cap on whisper count prevents notification fatigue
> shift: System suppresses remaining insights until conversation ends
> effect: User trusts the system to stay quiet

## rule-002: Quiet mode auto-activation (structural)
When emotional intensity exceeds threshold, all output stops immediately. No exceptions.

When emotional_intensity >= quiet_mode_threshold
Then quiet_mode = true

> trigger: Emotional intensity spike detected from transcript patterns
> rule: High-emotion moments are not teaching moments — silence is respect
> shift: All whispers, scoring, and updates cease
> effect: User feels protected, not surveilled

## rule-003: Conflict risk escalation tracking (degradation)
Rising conflict risk increases volatility and reduces trust delta tracking sensitivity.

When conflict_risk >= 60
Then volatility_delta_session += 5

> trigger: Conflict risk exceeds 60% threshold
> rule: High-conflict moments amplify volatility measurement
> shift: Volatility tracking becomes more sensitive to capture escalation
> effect: Post-conversation graph shows the volatility spike clearly

## rule-004: Gottman horseman penalty (degradation)
Detection of any Gottman Four Horseman pattern triggers immediate trust and empathy impact.

When horseman_detected != none
Then trust_delta_session -= 8

> trigger: Criticism, contempt, defensiveness, or stonewalling detected
> rule: Research-validated relationship-damaging patterns carry behavioral cost
> shift: Trust and empathy metrics reflect the damage
> effect: Graph view shows the moment and its impact with causal explanation

## rule-005: Adult ego state reward (advantage)
When both conversation participants operate in Adult ego state, trust and influence improve.

When ego_state_user = adult
Then trust_delta_session += 3

> trigger: User detected speaking from Adult ego state (rational, factual)
> rule: Adult-to-Adult communication is the healthiest Transactional Analysis pattern
> shift: Trust and influence metrics improve
> effect: System reinforces productive communication patterns

## rule-006: Archetype alignment streak tracking (advantage)
Consecutive high-alignment conversations build streaks, reinforcing identity training.

When archetype_alignment >= 80
Then streak_count += 1

> trigger: Conversation ends with archetype alignment at or above 80%
> rule: Consistency matters more than perfection — streaks track sustained effort
> shift: Streak counter increments, unlocking recognition
> effect: User sees "5 conversations in a row as Ambassador" — sticky gamification

## rule-007: Debrief classification learning (advantage)
Each user correction during debrief improves future classification accuracy for that user.

When classification_corrections >= 1
Then classification_corrections += 0

> trigger: User corrects a misclassification during debrief
> rule: User corrections are training data — the system learns your communication style
> shift: Detection model updates per-user thresholds
> effect: System asks fewer questions over time as it learns

## rule-008: Conversation energy drain warning (degradation)
Severely draining conversations trigger a post-conversation energy insight.

When conversation_energy <= -50
Then debrief_pending = true

> trigger: Conversation energy drops below -50 (severely draining)
> rule: Draining conversations deserve gentle acknowledgment
> shift: System flags for debrief with energy context
> effect: User sees "Tough conversation. Review when ready — no rush."

## rule-009: Parent-Child ego state conflict detection (degradation)
When one speaker is in Parent and the other in Child, conflict risk rises.

When ego_state_user = parent
Then conflict_risk += 15

> trigger: Parent-Child ego state mismatch detected
> rule: Parent-Child dynamics in professional contexts predict conflict
> shift: Conflict risk increases, may trigger whisper if budget allows
> effect: Shadow whisper: "You're lecturing — try a question instead"

## rule-010: Shadow mode default enforcement (structural)
Mirror always returns to Shadow mode after Graph or Archetype mode is closed.

When mode != shadow
Then mode = shadow

> trigger: User exits Graph view or Archetype training
> rule: Shadow is the resting state — always on, always minimal
> shift: System returns to passive observation
> effect: User never has to manually "turn on" the base layer

# Lenses

- policy: user_choice
- lock_pin: null

## shadow_lens
- name: Shadow
- tagline: Quiet awareness. See what's coming.
- formality: casual
- verbosity: terse
- emotion: clinical
- confidence: neutral
- default_for_roles: user

> response_framing: Frame all insights as environmental observations, not personal judgments. Use weather metaphors when possible. "The temperature is rising" not "You're getting angry."
> behavior_shaping: Suppress all urges to be helpful or proactive. Only surface high-signal moments. Prefer silence over noise. Every unsent whisper is a gift to the user.

## graph_lens
- name: Graph
- tagline: Your patterns, revealed.
- formality: professional
- verbosity: concise
- emotion: warm
- confidence: neutral

> response_framing: Frame all insights as patterns and trends, not incidents. "Over the last 5 conversations with Alex, trust has been declining" not "You were rude to Alex on Tuesday."
> behavior_shaping: Present data visually. Minimize text. Use directional arrows, trend lines, and comparisons. Let the user discover their own insights from the data.

## archetype_lens
- name: Archetype
- tagline: Train who you want to become.
- formality: casual
- verbosity: concise
- emotion: energetic
- confidence: bold

> response_framing: Frame all feedback as game progress. "Ambassador alignment: climbing" not "You were more diplomatic." Use character language. "That was a Commander move" not "You were assertive."
> behavior_shaping: Be encouraging but honest. Celebrate streaks. Acknowledge breakpoints without dwelling. Always point toward the next conversation as the next opportunity.

# Roles

- policy: public

## user
- name: Mirror User
- permissions: [view_shadow, view_graph, view_archetype, toggle_mode, manage_contacts, start_debrief, skip_debrief, activate_quiet_mode, choose_archetype, correct_classification]
- constraints: [max_whispers_per_conversation, quiet_mode_absolute]
- default_lens: shadow_lens

# Guards

## guard-001: Block whisper during quiet mode
When quiet_mode = true AND intent matches whisper_delivery
Then BLOCK

> Quiet mode is absolute. No whispers escape.

## guard-002: Block scoring during quiet mode
When quiet_mode = true AND intent matches reputation_update
Then BLOCK

> No reputation scoring during quiet mode. Resume after.

## guard-003: Require consent before first tracking
When user_consent_required = true AND intent matches start_tracking
Then PAUSE

If user confirms consent
  Then ALLOW

> First-time activation requires explicit opt-in.

## guard-004: Block archetype scoring without active archetype
When archetype_active = none AND intent matches archetype_score
Then BLOCK

> Cannot score archetype alignment without an active archetype selected.

## guard-005: Rate-limit event detection
When events_detected >= 100 AND intent matches event_classify
Then MODIFY

> After 100 events in a session, only classify high-confidence events. Prevents over-processing.

## guard-006: Block cross-contact data access
When intent matches contact_data_read AND scope != active_contact_id
Then BLOCK

> Contact data isolation. Cannot read another contact's profile during active conversation.

## guard-007: Block replay without transcript
When debrief_pending = false AND intent matches start_replay
Then BLOCK

> Cannot replay a conversation that hasn't been recorded or has already been debriefed.

## guard-008: Penalize notification fatigue
When whispers_delivered >= max_whispers_per_conversation AND intent matches whisper_delivery
Then PENALIZE

> Over-whispering degrades system credibility. Tracked for model improvement.

## guard-009: Reward debrief participation
When intent matches complete_debrief
Then REWARD

> Completing debrief (even without corrections) rewards engagement with the system.

## guard-010: Block archetype penalty for contextual behavior
When archetype_contextual = true AND intent matches archetype_penalize
Then MODIFY

> If behavior is contextually appropriate (e.g., being direct when needed), do not penalize archetype alignment. Modify to neutral instead.

# Gates

- THRIVING: conflict_risk < 20 AND emotional_intensity < 40 AND trust_delta_session > 0
- STABLE: conflict_risk < 50 AND emotional_intensity < 60
- COMPRESSED: conflict_risk >= 50 OR emotional_intensity >= 60 OR horseman_detected != none
- CRITICAL: conflict_risk >= 80 OR emotional_intensity >= quiet_mode_threshold
- MODEL_COLLAPSES: quiet_mode = true AND emotional_intensity >= 95

# Outcomes

## trust_trajectory
- type: number
- range: -100 to 100
- default: 0
- display_as: integer
- label: Trust Trajectory
- description: Direction and magnitude of trust change across recent conversations with a contact. Positive = building trust. Negative = eroding.

## volatility_index
- type: number
- range: 0 to 100
- default: 0
- display_as: integer
- label: Volatility Index
- description: How emotionally variable the user's conversations are. High volatility = unpredictable. Low = consistent.

## archetype_mastery
- type: number
- range: 0 to 100
- default: 0
- display_as: percentage
- label: Archetype Mastery
- description: Long-term mastery of the selected archetype across all conversations. Based on streak consistency and alignment averages.

## relationship_health
- type: enum
- options: thriving, stable, strained, critical
- default: stable
- label: Relationship Health
- description: Overall health assessment of the relationship with a specific contact based on trust trajectory, conflict frequency, and energy patterns.

## self_awareness_score
- type: number
- range: 0 to 100
- default: 0
- display_as: percentage
- label: Self-Awareness Score
- description: Meta-metric tracking how often the user's self-perception (debrief corrections) aligns with the system's classification. Higher = the system knows you well.
