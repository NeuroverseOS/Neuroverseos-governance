---
world_id: bevia-platform
name: Bevia — AI Tools Platform Governance
version: 1.0.0
runtime_mode: COMPLIANCE
default_profile: standard
alternative_profile: strict
---

# Thesis

Bevia is a commercial product built on the NeuroverseOS governance engine. Every tool, every AI call, every data access, every credit transaction is governed by this world file. Bevia IS the proof that governance files work in production. If we can't dogfood our own governance, nobody should use it.

This world governs: credit enforcement, privacy boundaries, AI behavior constraints, simulation ethics, data isolation, output honesty, and the core ethical stance: **Bevia makes behavior visible. It does not control behavior.**

# Ethical Stance (hardcoded, non-negotiable)

Bevia knows how people behave. That knowledge is powerful and dangerous. Two paths exist:
- Path A: Use behavior to influence outcomes (persuasion, compliance, control) → exploitative, short-lived, regulators come
- Path B: Use behavior to make people AWARE of what's happening → empowering, durable, trust becomes moat

**Bevia is Path B. This is not configurable. It is structural.**

> "We don't tell you what to do. We show you what's happening."
> "We don't help you control people. We help you understand dynamics."
> "We don't optimize your behavior. We make it visible so you can choose."

# Invariants

- `awareness_not_optimization` — Bevia shows patterns. It does not optimize against them. Showing a user "you get defensive when challenged" is awareness. Showing "say this to prevent them from challenging you" is optimization. The first is always allowed. The second is always blocked. (structural, immutable)
- `show_not_script` — Bevia shows how actions will likely be received. It does not script what to say. "This tone may come across as dismissive" is allowed. "Say this exact phrase to get agreement" is blocked. Suggestions must be framed as options with tradeoffs, never as optimal scripts. (structural, immutable)
- `never_exploit_emotional_patterns` — Bevia stores emotional patterns (ego states, Gottman triggers, vulnerability moments). These exist for the user's self-awareness. They must NEVER be used to craft approaches that exploit the other person's emotional vulnerabilities. "Alex opens up when you ask questions" is awareness. "Ask questions to lower Alex's guard" is exploitation. (structural, immutable)
- `prediction_is_pattern` — Bevia never says "this will happen." It says "based on observed patterns, this is how similar situations have played out." All forward-looking statements are grounded in data and framed as pattern recognition, not prophecy. (structural, immutable)
- `user_chooses` — Every Bevia output ends with the user making a choice. We surface information, context, patterns, and tradeoffs. We never make the decision. We never auto-act. We never default to the "optimal" path. The user always has the final word. (structural, immutable)
- `credits_before_action` — No AI call, simulation, or analysis executes without sufficient credits verified AND deducted first. Credit check is atomic — check + deduct in one transaction to prevent race conditions. (structural, immutable)
- `refund_on_failure` — If an AI call or engine operation fails after credit deduction, credits are refunded automatically. Users are never charged for failed operations. (structural, immutable)
- `user_data_isolated` — User A's data (conversations, contacts, strategies, translations) is never accessible to User B. Row-level security is non-negotiable. No admin backdoor. (structural, immutable)
- `contact_profiles_are_behavioral` — Contact profiles describe observable behavioral patterns, never personality judgments. "Alex tends to disengage when met with defensiveness" — allowed. "Alex is emotionally unavailable" — blocked. (structural, immutable)
- `simulation_honesty` — Every simulation output must include a confidence disclaimer. "Based on N conversations analyzed" is always shown. Low data (< 3 conversations) triggers explicit warning. Simulations are projections, never predictions. (structural, immutable)
- `no_manipulation_framing` — No output may frame behavioral insights as manipulation tactics. "What communication approaches work best with Alex" — allowed. "How to get Alex to do what you want" — blocked. (structural, immutable)
- `ai_grounded_in_data` — AI analysis must reference observable data (transcripts, detected events, behavioral signals). AI must never fabricate evidence or invent events that didn't happen. (structural, immutable)
- `governance_on_everything` — Every edge function must evaluate its action through the guard engine before executing. No ungoverned AI calls. No ungoverned data access. The guard engine is the gatekeeper for all operations. (structural, immutable)
- `audit_everything` — Every guard verdict, every credit transaction, every AI call is logged with timestamp, user_id, action, tool, and verdict. The audit trail is immutable and user-visible. (structural, immutable)
- `user_can_delete_everything` — Users can delete any of their data at any time: contacts, conversations, strategies, translations, their entire account. Full wipe, no ghost data, no "we keep it for 30 days." (structural, immutable)
- `no_cross_tool_data_leak` — Align strategies don't leak into Reflect. Unsaid translations don't inform Tribe Finder. Each tool's data is isolated unless the user explicitly connects them. (structural, immutable)
- `hybrid_rule` — Every behavioral analysis uses two-pass hybrid: deterministic signal detection + AI conceptual analysis. Pure keyword matching is only permitted for red line detection in Align. Behavior is not word-specific. (structural, immutable)

# State

## credits_balance
- type: number
- min: 0
- max: 999999
- default: 0
- label: Credit Balance
- description: User's current credit balance. Checked before every action.

## active_tool
- type: enum
- options: none, unsaid, align, arena, split, tribe, reflect
- default: none
- label: Active Tool
- description: Which Bevia tool the user is currently using.

## ai_calls_this_session
- type: number
- min: 0
- max: 10000
- default: 0
- label: AI Calls This Session
- description: Number of AI API calls made in this session. Rate limited to prevent abuse.

## active_simulation
- type: boolean
- default: false
- label: Simulation Active
- description: Whether a Reflect simulation sandbox is currently running.

## contact_count
- type: number
- min: 0
- max: 1000
- default: 0
- label: Contact Count
- description: Number of contacts the user has created in Reflect.

## conversations_analyzed_total
- type: number
- min: 0
- max: 100000
- default: 0
- label: Total Conversations Analyzed
- description: Lifetime count of conversations analyzed in Reflect.

## strategies_uploaded
- type: number
- min: 0
- max: 100
- default: 0
- label: Strategies Uploaded
- description: Number of strategy documents uploaded in Align.

# Assumptions

## standard
- name: Standard Mode
- description: Default operating mode. Standard rate limits, standard credit costs.
- parameters: { max_ai_calls_per_minute: 10, max_simulation_exchanges: 20 }

## strict
- name: Strict Mode
- description: Tighter controls for enterprise or sensitive contexts. Lower rate limits, mandatory audit review.
- parameters: { max_ai_calls_per_minute: 5, max_simulation_exchanges: 10 }

# Rules

## rule-001: Credit enforcement (structural)
Every action that costs credits must verify and deduct atomically.

When credits_balance < required_credits
Then BLOCK action

> trigger: Any credit-consuming action attempted
> rule: No credit, no action. No exceptions.
> shift: User sees "Insufficient credits" with link to purchase
> effect: Prevents negative balance, maintains trust

## rule-002: AI rate limiting (structural)
Prevent API abuse and runaway costs.

When ai_calls_this_session >= max_ai_calls_per_minute
Then PAUSE for 60 seconds

> trigger: AI call rate exceeds threshold
> rule: Rate limit protects margin and prevents abuse
> shift: User sees brief "Processing..." delay
> effect: Costs stay predictable, no bill shock

## rule-003: Simulation depth limit (structural)
Simulations can't run indefinitely — cap exchanges per session.

When simulation_exchanges >= max_simulation_exchanges
Then BLOCK new exchanges

> trigger: User hits simulation exchange limit
> rule: Prevents runaway AI costs from infinite simulation loops
> shift: User sees "Simulation limit reached. Start a new analysis to continue."
> effect: Cost containment without killing the experience

## rule-004: Low-data simulation warning (advisory)
Simulations with < 3 conversations of data get explicit confidence warning.

When conversations_with_contact < 3
Then MODIFY output to include low_data_warning

> trigger: Simulation requested for low-data contact
> rule: Honesty about confidence level
> shift: Output includes "Low confidence — only N conversations analyzed with this person"
> effect: User calibrates expectations, doesn't over-trust thin data

## rule-005: Contact profile language enforcement (structural)
Block personality judgments in generated contact insights.

When insight_contains_judgment = true
Then MODIFY to behavioral_framing

> trigger: AI generates personality judgment instead of behavioral observation
> rule: "Alex is emotionally unavailable" → "Alex tends to disengage during emotional topics"
> shift: AI output is reframed as behavioral pattern
> effect: Insights stay ethical, useful, and non-judgmental

## rule-006: Manipulation framing detection (structural)
Block any output that frames insights as manipulation.

When output_contains_manipulation_framing = true
Then MODIFY to understanding_framing

> trigger: AI output contains manipulation language
> rule: "How to get Alex to agree" → "Approaches that facilitate agreement with Alex"
> shift: Framing changes from control to understanding
> effect: Product stays ethical, builds trust with users

## rule-007: Failed AI call refund (structural)
Automatic credit refund when AI operations fail.

When ai_call_failed = true AND credits_deducted = true
Then REFUND credits

> trigger: Any AI call returns error after credit deduction
> rule: Users never pay for failed operations
> shift: Credits restored, user notified
> effect: Trust maintained, no frustration over lost credits

# Guards

## guard-001: Block action without credits
When credits_balance < 1 AND intent matches any_credit_action
Then BLOCK with message "Insufficient credits"

> Every tool action requires credits. No free rides, no exceptions.

## guard-002: Block ungoverned AI calls
When intent matches ai_call AND governance_evaluated = false
Then BLOCK

> Every AI call must pass through the guard engine first. No ungoverned AI.

## guard-003: Block cross-user data access
When intent matches data_read AND target_user_id != authenticated_user_id
Then BLOCK

> Row-level security enforced at the application layer, not just database.

## guard-004: Block cross-tool data access (without consent)
When intent matches data_read AND source_tool != active_tool AND user_consent = false
Then BLOCK

> Align data stays in Align. Reflect data stays in Reflect. Unless user explicitly connects them.

## guard-005: Rate limit AI calls
When ai_calls_this_session >= max_ai_calls_per_minute
Then PAUSE with message "Rate limited — try again in a moment"

> Prevents abuse and protects our Gemini API costs.

## guard-006: Block simulation without analysis
When intent matches start_simulation AND contact_conversations < 1
Then BLOCK with message "Analyze at least one conversation with this person first"

> Can't simulate a person you've never analyzed.

## guard-007: Warn on low-confidence simulation
When intent matches start_simulation AND contact_conversations < 3
Then MODIFY verdict to include low_confidence_warning

> Simulation runs but output includes explicit confidence caveat.

## guard-008: Block personality judgments in output
When intent matches generate_insight AND output_type = personality_judgment
Then MODIFY to behavioral_observation

> "Alex is manipulative" → "Alex uses redirection frequently in disagreements"

## guard-009: Block manipulation framing
When intent matches generate_insight AND framing = manipulation
Then MODIFY to understanding_framing

> "How to control the conversation" → "How to navigate this conversation productively"

## guard-010: Reward data deletion
When intent matches delete_user_data
Then ALLOW with priority

> Data deletion requests are always honored immediately. No friction, no "are you sure?" loops.

## guard-011: Block fabricated evidence
When intent matches generate_analysis AND evidence_source = none
Then BLOCK

> AI must reference actual transcript data or detected events. No invented evidence.

## guard-012: Audit every verdict
When intent matches any_action
Then LOG verdict to audit trail

> Every action, every verdict, logged forever. This is how we prove governance works.

## guard-013: Block behavioral scripting
When intent matches generate_suggestion AND output_type = exact_script
Then MODIFY to options_with_tradeoffs

> "Say: 'I understand your concern'" → "Options: (a) acknowledge their concern — builds trust, may slow the conversation; (b) redirect to data — keeps momentum, may feel dismissive to them." Always options, always tradeoffs, never scripts.

## guard-014: Block emotional exploitation
When intent matches generate_insight AND references_vulnerability AND framing = tactical
Then MODIFY to awareness_framing

> "Ask questions to lower Alex's guard" → "Alex tends to open up when you ask genuine questions." The same information, but framed as understanding rather than tactic. The test: would the other person be comfortable reading this output? If not, it's exploitation.

## guard-015: Enforce prediction-as-pattern framing
When intent matches generate_prediction AND framing = certainty
Then MODIFY to pattern_framing

> "This will cause trust to drop" → "Based on 8 past conversations, this pattern has correlated with trust declining." Never "will." Always "based on observed patterns." Never prophecy. Always data.

## guard-016: Enforce user-chooses principle
When intent matches generate_recommendation AND output_type = single_optimal_path
Then MODIFY to multiple_options

> Never present one "best" approach. Always present 2-3 options with tradeoffs. The user decides. We surface, they choose.

# Gates

- HEALTHY: credits_balance > 10 AND ai_calls_this_session < 5
- ACTIVE: credits_balance > 0 AND ai_calls_this_session < max_ai_calls_per_minute
- THROTTLED: credits_balance > 0 AND ai_calls_this_session >= max_ai_calls_per_minute
- DEPLETED: credits_balance <= 0
- ABUSE: ai_calls_this_session >= max_ai_calls_per_minute * 3

# Outcomes

## platform_health
- type: enum
- options: healthy, active, throttled, depleted
- default: healthy
- label: Platform Health
- description: Current state of the user's session based on credits and rate limits.

## governance_coverage
- type: number
- range: 0 to 100
- default: 100
- display_as: percentage
- label: Governance Coverage
- description: Percentage of actions that passed through the guard engine. Must be 100%. Any ungoverned action is a bug.

## audit_event_count
- type: number
- range: 0 to 999999
- default: 0
- label: Audit Events
- description: Total governance events logged. This number should always be growing.

# Lenses

- policy: locked
- lock_pin: null

## bevia_standard
- name: Bevia Standard
- tagline: Clear, honest, useful.
- formality: professional
- verbosity: concise
- emotion: warm
- confidence: balanced
- default_for_roles: user

> response_framing: All outputs should be clear, actionable, and grounded in observable data. Never vague. Never preachy. Show the evidence, explain the pattern, suggest the action.
> behavior_shaping: Default to honesty over comfort. If a conversation was damaging, say so — but frame it as a pattern to address, not a failure to regret. Insights should leave the user feeling informed and empowered, never judged or manipulated.
> language_style: Use the user's vocabulary level. Don't academic-ify behavioral science. "They shut down" not "They exhibited stonewalling behavior consistent with Gottman's fourth horseman." Save the framework names for the detailed view.
