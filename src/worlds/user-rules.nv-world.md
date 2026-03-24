---
world_id: mentraos-user-rules
name: MentraOS User Rules — Personal AI Governance
version: 1.0.0
runtime_mode: COMPLIANCE
default_profile: standard
alternative_profile: strict
---

# Thesis

Every app on MentraOS runs its own AI. A nutrition app sends camera images to GPT-4 for food recognition. A meeting assistant pipes transcriptions to Claude for summarization. A navigation app feeds location data to an AI for route suggestions. The user has no unified control over what these AIs do with their data, what actions they take on the user's behalf, or what they retain after the session ends.

This world is the user's personal governance layer. It sits above every app on MentraOS. It does not care which app is running, which AI provider the app uses, or what the app's own policies say. These are the user's rules, and they override everything.

The principle: the user is king. Apps serve the user. AI serves the user. When there is a conflict between what an app wants to do and what the user has decided, the user wins. Always.

This world governs three things: (1) what data AI can access and where it can send that data, (2) what actions AI can take on the user's behalf, and (3) what happens to user data after the AI is done with it. Everything else — hardware permissions, session isolation, platform constraints — is handled by the platform world. This world only governs the AI interaction layer.

# Invariants

- `user_rules_override_all` — User rules take precedence over every app's configured behavior. No app can relax a user rule. An app can be more restrictive than the user's rules, never less. (structural, immutable)
- `no_ai_action_without_display` — AI must never take an action on the user's behalf without first showing the user what it intends to do on the glasses display. The user must see it before it happens. (structural, immutable)
- `no_silent_data_exfiltration` — User data (transcription, images, location, calendar, contacts) must never be sent to an external AI API without the user being aware that it is happening. Awareness means the app declared this data flow at install time and the user approved it. (structural, immutable)
- `no_ai_financial_transactions` — AI must never initiate, authorize, or complete a financial transaction (purchase, transfer, subscription, tip) without explicit per-transaction user confirmation. Blanket pre-authorization is not valid consent. (structural, immutable)
- `no_ai_impersonation` — AI must never send messages, emails, social media posts, or any communication that appears to come from the user without explicit per-message user confirmation. (structural, immutable)
- `session_data_default_ephemeral` — By default, all user data processed during a session (transcriptions, images, AI conversation history) is ephemeral and must not be retained by the app or AI provider after the session ends. Apps that need retention must declare it and the user must opt in. (structural, immutable)
- `ai_transparency_required` — The user must be able to see, at any time, what data an app's AI currently has access to and what it has sent externally during the current session. No black-box AI processing. (structural, immutable)

# State

## ai_data_sends
- type: number
- min: 0
- max: 100000
- step: 1
- default: 0
- label: AI Data Sends
- description: Number of times any app sent user data (transcription, image, location) to an external AI API during this session

## ai_data_sends_undeclared
- type: number
- min: 0
- max: 1000
- step: 1
- default: 0
- label: Undeclared AI Data Sends
- description: Number of times an app sent user data to an AI API without having declared that data flow at install time

## ai_auto_actions
- type: number
- min: 0
- max: 10000
- step: 1
- default: 0
- label: AI Auto-Actions
- description: Number of actions AI took on the user's behalf (messages sent, purchases made, settings changed)

## ai_auto_actions_unconfirmed
- type: number
- min: 0
- max: 1000
- step: 1
- default: 0
- label: Unconfirmed AI Auto-Actions
- description: Number of AI actions taken without showing the user first and getting confirmation

## ai_purchase_attempts
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: AI Purchase Attempts
- description: Number of times AI attempted to initiate a financial transaction

## ai_message_sends
- type: number
- min: 0
- max: 1000
- step: 1
- default: 0
- label: AI Message Sends
- description: Number of messages AI sent on the user's behalf (email, SMS, social media, chat)

## ai_message_sends_unconfirmed
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: Unconfirmed AI Message Sends
- description: Messages AI sent on user's behalf without per-message confirmation

## data_retention_violations
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: Data Retention Violations
- description: Number of times an app retained session data beyond session end without user opt-in

## ai_transparency_requests
- type: number
- min: 0
- max: 10000
- step: 1
- default: 0
- label: AI Transparency Requests
- description: Number of times user requested to see what data AI has access to

## ai_transparency_fulfilled
- type: number
- min: 0
- max: 10000
- step: 1
- default: 0
- label: AI Transparency Fulfilled
- description: Number of transparency requests that were successfully fulfilled by the app

## active_ai_providers
- type: number
- min: 0
- max: 20
- step: 1
- default: 0
- label: Active AI Providers
- description: Number of distinct AI API providers currently receiving user data across all running apps

## session_duration_minutes
- type: number
- min: 0
- max: 1440
- step: 1
- default: 0
- label: Session Duration
- description: How long the current session has been active in minutes

# Assumptions

## standard
- name: Standard User Rules
- description: Default user governance. AI can process user data through declared APIs. AI can suggest actions but must show them on display before executing. All auto-actions require confirmation. Data is ephemeral by default. Financial transactions always require per-transaction confirmation. Messages always require per-message confirmation.
- ai_data_policy: declared_apis_only
- ai_action_policy: suggest_and_confirm
- ai_purchase_policy: per_transaction_confirmation
- ai_messaging_policy: per_message_confirmation
- data_retention_policy: ephemeral_unless_opted_in
- transparency_policy: on_request

## strict
- name: Strict User Rules
- description: Maximum user control. AI can only process data locally or through a single user-designated AI provider. Every AI data send requires real-time confirmation. No auto-actions of any kind. No data retention. Transparency dashboard always visible.
- ai_data_policy: single_provider_confirmed
- ai_action_policy: no_auto_actions
- ai_purchase_policy: blocked
- ai_messaging_policy: blocked
- data_retention_policy: never_retain
- transparency_policy: always_visible

## permissive
- name: Permissive User Rules
- description: Minimal friction. AI can use declared APIs freely. AI can auto-execute low-risk actions (display content, read data) without confirmation. Medium-risk actions (send messages, change settings) require confirmation. High-risk actions (purchases, account changes) always require confirmation. Data retention allowed for opted-in apps.
- ai_data_policy: declared_apis_freely
- ai_action_policy: auto_low_risk_confirm_high_risk
- ai_purchase_policy: per_transaction_confirmation
- ai_messaging_policy: per_message_confirmation
- data_retention_policy: app_declared_allowed
- transparency_policy: on_request

# Rules

## rule-001: Undeclared AI Data Exfiltration (structural)
An app sent user data to an AI API it did not declare at install time. The user never agreed to this data flow.

When ai_data_sends_undeclared > 0 [state]
Then user_trust *= 0.15
Collapse: user_trust < 0.10

> trigger: App transmitted user data (transcription, camera image, location, calendar) to an AI API endpoint not listed in the app's declared data flows at registration.
> rule: Apps must declare every external AI API they send user data to. This declaration happens at app registration on console.mentra.glass. Undeclared data flows mean the user was never informed and never consented. This is the most severe violation — it breaks the fundamental trust contract.
> shift: User trust collapses. App is suspended immediately.
> effect: User trust reduced to 15%. Collapse imminent.

## rule-002: AI Action Without Display (structural)
AI took an action on the user's behalf without first showing it on the glasses display.

When ai_auto_actions_unconfirmed > 0 [state]
Then user_trust *= 0.25
Collapse: user_trust < 0.10

> trigger: AI executed an action (sent a message, changed a setting, made a request) without first rendering the intended action on the glasses display for user review.
> rule: The user must see what AI intends to do before it does it. This is not about blocking AI actions — it is about ensuring the user is never surprised. Show it on the display. Wait for confirmation. Then act. Skipping the display step means the AI acted in the dark.
> shift: User trust drops severely. All AI auto-actions suspended for this app.
> effect: User trust reduced to 25%.

## rule-003: AI Financial Transaction (structural)
AI attempted to initiate a financial transaction. These always require explicit per-transaction confirmation.

When ai_purchase_attempts > 0 [state] AND ai_auto_actions_unconfirmed > 0 [state]
Then user_trust *= 0.10
Collapse: user_trust < 0.10

> trigger: AI attempted to make a purchase, transfer money, subscribe to a service, or complete any financial transaction without per-transaction user confirmation.
> rule: Financial transactions are irreversible and consequential. No amount of convenience justifies letting AI spend the user's money without explicit confirmation for each transaction. Pre-authorization ("buy anything under $10") is not valid consent. Each transaction is confirmed individually.
> shift: User trust collapses. App's financial capabilities permanently revoked.
> effect: User trust reduced to 10%. Immediate collapse.

## rule-004: AI Impersonation (structural)
AI sent a message that appears to come from the user without per-message confirmation.

When ai_message_sends_unconfirmed > 0 [state]
Then user_trust *= 0.20
Collapse: user_trust < 0.10

> trigger: AI composed and sent an email, text message, social media post, or chat message in the user's name without the user reviewing and confirming that specific message.
> rule: Messages sent in the user's name are the user's reputation. A poorly worded AI-generated email sent without review can damage relationships, careers, or legal standing. Every message must be shown on the display and confirmed before sending. "Auto-reply" features must still show each reply.
> shift: User trust drops severely. App's messaging capabilities suspended.
> effect: User trust reduced to 20%.

## rule-005: Data Retention Violation (structural)
App retained user data after the session ended without the user having opted in to retention.

When data_retention_violations > 0 [state]
Then user_trust *= 0.30
Collapse: user_trust < 0.10

> trigger: Session ended and the app or its AI provider retained user data (transcriptions, images, conversation history, location logs) without the user having explicitly opted in to data retention for this app.
> rule: Session data is ephemeral by default. When the session ends, the data goes away. Apps that need to retain data (e.g., a note-taking app that saves summaries) must declare retention at install time and the user must opt in. Retaining without opt-in is a privacy violation.
> shift: User trust drops. App flagged for data handling review.
> effect: User trust reduced to 30%.

## rule-006: Transparency Failure (degradation)
User asked to see what data AI has access to, and the app failed to provide it.

When ai_transparency_requests > 0 [state] AND ai_transparency_fulfilled == 0 [state]
Then user_trust *= 0.50

> trigger: User invoked the transparency feature (asking "what data does this app have?") and the app did not provide a clear answer within a reasonable time.
> rule: Transparency is a user right, not a feature. When the user asks what data AI has, the app must answer. This means the app must track what it has sent to its AI provider and be able to report it. Apps that cannot answer transparency requests are black boxes.
> shift: User trust degrades. App marked as non-transparent.
> effect: User trust reduced to 50%.

## rule-007: Excessive AI Providers (degradation)
Too many distinct AI providers are receiving user data simultaneously across running apps.

When active_ai_providers > 5 [state]
Then user_trust *= 0.70

> trigger: More than 5 distinct AI API providers are currently receiving user data across all running apps (e.g., OpenAI for one app, Claude for another, Gemini for a third, plus two more).
> rule: Every AI provider that receives user data is an additional attack surface and privacy risk. The user's transcription going to 6 different AI companies simultaneously means 6 different privacy policies, 6 different data retention practices, and 6 different potential breach vectors. This is a warning, not a block.
> shift: User trust degrades mildly. User notified of provider count.
> effect: User trust reduced to 70%.

## rule-008: Clean AI Session (advantage)
All AI interactions followed user rules — data flows declared, actions confirmed, no retention violations.

When ai_data_sends > 0 [state] AND ai_data_sends_undeclared == 0 [state] AND ai_auto_actions_unconfirmed == 0 [state] AND data_retention_violations == 0 [state]
Then user_trust *= 1.10

> trigger: The session has active AI usage (data has been sent, actions have been taken) and zero violations of user rules have occurred.
> rule: When AI works within the user's rules, trust grows. Apps that respect declared data flows, show actions before executing, and handle data ephemerally earn the user's confidence. This is how the ecosystem should work.
> shift: User trust improves. App earns reliability reputation.
> effect: User trust boosted by 10%.

## rule-009: Full Transparency Compliance (advantage)
Every transparency request was fulfilled. The app is not a black box.

When ai_transparency_requests > 0 [state] AND ai_transparency_fulfilled == ai_transparency_requests [state]
Then user_trust *= 1.12

> trigger: User has made transparency requests and every single one was fulfilled by the app.
> rule: An app that answers every transparency question earns deep trust. The user knows exactly what's happening with their data at all times. This is the gold standard for AI governance on wearables.
> shift: User trust improves significantly. App earns transparency badge.
> effect: User trust boosted by 12%.

## rule-010: Confirmed AI Actions (advantage)
AI actions were taken with proper confirmation flow — shown on display, user approved, then executed.

When ai_auto_actions > 0 [state] AND ai_auto_actions_unconfirmed == 0 [state] AND ai_message_sends_unconfirmed == 0 [state]
Then user_trust *= 1.08

> trigger: AI has taken actions on the user's behalf and every single one was properly confirmed through the display-then-confirm flow.
> rule: AI that asks before acting earns trust. The slight friction of confirmation is the price of user sovereignty. Apps that pay this price reliably build a track record of respectful AI interaction.
> shift: User trust improves. App's AI interaction pattern validated.
> effect: User trust boosted by 8%.

# Gates

- SOVEREIGN: user_trust >= 90
- COMFORTABLE: user_trust >= 65
- CAUTIOUS: user_trust >= 40
- RESTRICTED: user_trust > 10
- REVOKED: user_trust <= 10

# Outcomes

## user_trust
- type: number
- range: 0-100
- display: percentage
- label: User Trust Score
- primary: true

## ai_data_sends
- type: number
- range: 0-100000
- display: integer
- label: AI Data Sends

## ai_auto_actions_unconfirmed
- type: number
- range: 0-1000
- display: integer
- label: Unconfirmed AI Actions

## data_retention_violations
- type: number
- range: 0-100
- display: integer
- label: Data Retention Violations

## active_ai_providers
- type: number
- range: 0-20
- display: integer
- label: Active AI Providers
