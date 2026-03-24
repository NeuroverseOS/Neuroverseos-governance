---
world_id: mentraos-smartglasses
name: MentraOS Smart Glasses — AI Interaction Governance
version: 3.0.0
runtime_mode: COMPLIANCE
default_profile: standard
alternative_profile: strict
---

# Thesis

MentraOS is an operating system for smart glasses. Apps run on their own servers and connect through the MentraOS SDK via WebSocket. Every app gets access to hardware — camera, microphone, display, location — through permission-gated SDK methods. What MentraOS does not govern is what happens after the app receives that data. An app that gets transcription data can send it to OpenAI, Claude, Gemini, or any AI API it wants. An app that captures a photo can pipe it to a vision model for analysis. The OS controls the pipe. It does not control what's on the other end.

This world governs the AI interaction layer — the space between the MentraOS SDK and the AI backends that apps use to process user data. It enforces three categories of rules: (1) platform constraints that are physically real (hardware capabilities, declared permissions, session isolation), (2) AI data flow governance (what user data goes to which AI, and whether the user knows about it), and (3) AI autonomy limits (what the AI can do vs. suggest, and what requires user confirmation).

User rules (defined in mentraos-user-rules) override this world. If this world allows an app to send transcriptions to its declared AI API, but the user's personal rules say "confirm every AI data send," the user wins. This world defines the platform's baseline governance. The user's world defines the ceiling.

# Invariants

- `no_undeclared_hardware_access` — Apps must never access microphone, camera, speaker, or display capabilities not declared in their app registration at console.mentra.glass (structural, immutable)
- `no_silent_recording` — Apps must never capture audio or video without active user awareness; background recording without indicator is forbidden (structural, immutable)
- `no_display_obstruction` — Apps must never render content that fully occludes the wearer's real-world field of view without user-dismissable controls (structural, immutable)
- `no_cross_session_data_leak` — App session data must not leak between distinct user sessions; each AppSession is isolated per userId and sessionId (structural, immutable)
- `no_credential_exfiltration` — Apps must never transmit MENTRAOS_API_KEY, user auth tokens, or session credentials to third-party endpoints outside the registered app server (structural, immutable)
- `hardware_capability_respected` — Apps must gracefully degrade when running on glasses that lack declared capabilities; camera apps must not crash on Even Realities G1 which has no camera (structural, immutable)
- `ai_data_flow_declared` — Every AI API endpoint that receives user data must be declared in the app's registration. Undeclared AI backends are forbidden. (structural, immutable)
- `ai_actions_require_display` — Any action the AI intends to take on the user's behalf must first be shown on the glasses display. The user sees it before it happens. (structural, immutable)
- `user_rules_take_precedence` — When a user's personal governance rules conflict with this world's rules, the user's rules win. This world can only be tightened by user rules, never relaxed. (structural, immutable)

# State

## permission_violations
- type: number
- min: 0
- max: 10000
- step: 1
- default: 0
- label: Permission Violations
- description: Number of attempts to access hardware capabilities not declared in app registration

## active_sessions
- type: number
- min: 0
- max: 1000
- step: 1
- default: 0
- label: Active Sessions
- description: Number of concurrent AppSession instances running

## camera_access_events
- type: number
- min: 0
- max: 100000
- step: 1
- default: 0
- label: Camera Access Events
- description: Number of camera capture or stream operations performed

## microphone_access_events
- type: number
- min: 0
- max: 100000
- step: 1
- default: 0
- label: Microphone Access Events
- description: Number of audio capture or transcription operations performed

## display_render_events
- type: number
- min: 0
- max: 100000
- step: 1
- default: 0
- label: Display Render Events
- description: Number of layout render operations (showTextWall, image display, etc.)

## battery_drain_rate
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: Battery Drain Rate
- description: Estimated battery consumption percentage per hour from app activity
- display_as: percentage

## cross_session_leak_attempts
- type: number
- min: 0
- max: 1000
- step: 1
- default: 0
- label: Cross-Session Leak Attempts
- description: Number of attempts to access data from another user session

## hardware_mismatch_errors
- type: number
- min: 0
- max: 1000
- step: 1
- default: 0
- label: Hardware Mismatch Errors
- description: Number of times an app tried to use capabilities unsupported by connected glasses

## tool_calls_processed
- type: number
- min: 0
- max: 100000
- step: 1
- default: 0
- label: Tool Calls Processed
- description: Number of handleToolCall invocations processed by the app server

## credential_exposure_attempts
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: Credential Exposure Attempts
- description: Number of attempts to transmit API keys or auth tokens to unauthorized endpoints

## glasses_model
- type: enum
- options: even_realities_g1, mentra_live, mentra_mach1, vuzix_z100, unknown
- default: unknown
- label: Connected Glasses Model
- description: The smart glasses hardware currently connected via BLE
- mutable: true

## ai_data_sends
- type: number
- min: 0
- max: 100000
- step: 1
- default: 0
- label: AI Data Sends
- description: Number of times this app sent user data to its declared AI API endpoints

## ai_data_sends_undeclared
- type: number
- min: 0
- max: 1000
- step: 1
- default: 0
- label: Undeclared AI Data Sends
- description: Number of times this app sent user data to an AI API not declared in its app registration

## ai_auto_actions
- type: number
- min: 0
- max: 10000
- step: 1
- default: 0
- label: AI Auto-Actions
- description: Number of actions the app's AI took on the user's behalf

## ai_auto_actions_unconfirmed
- type: number
- min: 0
- max: 1000
- step: 1
- default: 0
- label: Unconfirmed AI Auto-Actions
- description: Number of AI actions taken without first showing the action on the glasses display

## ai_provider_declared
- type: number
- min: 0
- max: 1
- step: 1
- default: 0
- label: AI Provider Declared
- description: Whether the app has declared its AI API provider(s) in its registration (1 = yes, 0 = no)
- mutable: true

## ai_data_types_sent
- type: number
- min: 0
- max: 10
- step: 1
- default: 0
- label: AI Data Types Sent
- description: Number of distinct data types (transcription, image, location, calendar, etc.) sent to AI during this session

## ai_retention_opted_in
- type: number
- min: 0
- max: 1
- step: 1
- default: 0
- label: Data Retention Opted In
- description: Whether the user has opted in to data retention for this app (1 = yes, 0 = no)
- mutable: true

## dashboard_mode
- type: enum
- options: main, expanded, always_on, off
- default: off
- label: Dashboard Mode
- description: Current dashboard display mode on the glasses
- mutable: true

# Assumptions

## standard
- name: Standard App Governance
- description: Normal app operation with AI governance. Apps declare permissions and AI providers at registration. Hardware access through SDK managers. AI can process user data through declared APIs. AI actions must be shown on display before execution. Data is ephemeral by default. Apps can request data retention if declared and user opts in.
- hardware_policy: declared_permissions_only
- ai_data_policy: declared_apis_only
- ai_action_policy: display_then_confirm
- data_retention_policy: ephemeral_unless_opted_in
- session_policy: isolated_per_user

## strict
- name: Strict App Governance
- description: Maximum restriction on AI interactions. AI data sends require per-send user confirmation. No AI auto-actions permitted. No data retention under any circumstances. All AI processing must be visible to the user in real-time.
- hardware_policy: declared_permissions_only
- ai_data_policy: per_send_confirmation
- ai_action_policy: no_auto_actions
- data_retention_policy: never_retain
- session_policy: isolated_per_user

## developer
- name: Developer Mode Governance
- description: Relaxed governance for app development and testing. AI data flows are logged but not blocked for undeclared providers during development. All other platform constraints remain enforced. Not available in production app store.
- hardware_policy: declared_permissions_only
- ai_data_policy: log_only
- ai_action_policy: display_then_confirm
- data_retention_policy: session_scoped
- session_policy: isolated_per_user

# Rules

## rule-001: Undeclared Hardware Access (structural)
Apps accessing hardware capabilities they did not declare during registration at console.mentra.glass violates the MentraOS permission model.

When permission_violations > 0 [state]
Then platform_trust *= 0.30
Collapse: platform_trust < 0.10

> trigger: App attempted to use camera, microphone, speaker, or display without declaring the permission in its app registration configuration.
> rule: MentraOS requires all hardware permissions to be declared at app registration time. The SDK gates access through session managers (audio, camera, layouts). Undeclared access means the app is circumventing the SDK.
> shift: Platform trust drops critically. App may be suspended from the Mentra Store.
> effect: Platform trust reduced to 30%. Continued violations trigger collapse.

## rule-002: Hardware Capability Mismatch (degradation)
Apps must check hardware capabilities before attempting operations. Even Realities G1 has no camera. Mentra Live has no display. Apps must degrade gracefully.

When hardware_mismatch_errors > 3 [state]
Then platform_trust *= 0.60

> trigger: App attempted to use a capability (e.g., camera on G1, display on Mentra Live) that the connected glasses hardware does not support.
> rule: MentraOS supports four glasses models with different capability matrices. Apps must respect the compatibility matrix and provide fallback behavior.
> shift: Platform trust degrades. App quality score decreases in the Mentra Store.
> effect: Platform trust reduced to 60%.

## rule-003: Cross-Session Data Leak (structural)
Each AppSession is scoped to a userId and sessionId. Accessing another session's data violates isolation.

When cross_session_leak_attempts > 0 [state]
Then platform_trust *= 0.20
Collapse: platform_trust < 0.10

> trigger: App attempted to read, write, or reference data belonging to a different user's session.
> rule: AppSession isolation is a core MentraOS security boundary. The onSession() lifecycle hook receives a scoped session object. Crossing session boundaries indicates either a bug or malicious intent.
> shift: Platform trust drops severely. App is flagged for security review.
> effect: Platform trust reduced to 20%. Near-certain collapse on repeated violation.

## rule-004: Excessive Battery Drain (degradation)
Smart glasses have limited battery. Apps consuming excessive power degrade the user experience.

When battery_drain_rate > 25 [state]
Then platform_trust *= 0.70

> trigger: App's estimated battery consumption exceeds 25% per hour.
> rule: Wearable devices require power-conscious apps. Heavy AI processing should happen server-side, not drain the glasses or phone.
> shift: Platform trust degrades. App may receive battery warnings from the OS.
> effect: Platform trust reduced to 70%.

## rule-005: Credential Exposure (structural)
API keys and auth tokens must never leave the app server boundary.

When credential_exposure_attempts > 0 [state]
Then platform_trust *= 0.10
Collapse: platform_trust < 0.10

> trigger: App attempted to transmit MENTRAOS_API_KEY, session tokens, or user authentication credentials to an endpoint outside the registered app server.
> rule: The MENTRAOS_API_KEY authenticates the app server to the platform. Exposure compromises the entire app's user base.
> shift: Platform trust collapses. App is immediately suspended.
> effect: Platform trust reduced to 10%. Triggers collapse.

## rule-006: Undeclared AI Data Flow (structural)
App sent user data to an AI API it did not declare at registration. The user never consented to this data flow.

When ai_data_sends_undeclared > 0 [state]
Then platform_trust *= 0.15
Collapse: platform_trust < 0.10

> trigger: App transmitted user data (transcription text, camera images, location coordinates, calendar events) to an AI API endpoint not listed in the app's declared integrations at console.mentra.glass.
> rule: Every AI provider that touches user data must be declared at registration. This is how users make informed decisions about which apps to install. A nutrition app that declares "sends food photos to OpenAI Vision" is transparent. The same app secretly piping data to an undeclared endpoint is a trust violation. The app store listing shows declared AI providers so users can evaluate before installing.
> shift: Platform trust collapses. App suspended and flagged for review.
> effect: Platform trust reduced to 15%. Near-certain collapse.

## rule-007: AI Action Without Display (structural)
AI took an action on the user's behalf without first showing it on the glasses display.

When ai_auto_actions_unconfirmed > 0 [state]
Then platform_trust *= 0.25
Collapse: platform_trust < 0.10

> trigger: The app's AI executed an external action (sent a message, made an API call, changed a setting, placed an order) without first rendering the intended action on the glasses display for user review and confirmation.
> rule: Smart glasses display is the user's window into what AI is doing. An AI assistant that auto-sends an email the user never saw on their display has acted behind the user's back. The flow must always be: AI decides action → show on display → user confirms → execute. Skipping display means the user lost control.
> shift: Platform trust drops severely. App's AI auto-action privileges suspended.
> effect: Platform trust reduced to 25%.

## rule-008: Excessive AI Data Types (degradation)
App is sending too many distinct types of user data to its AI backend.

When ai_data_types_sent > 4 [state]
Then platform_trust *= 0.65

> trigger: App has sent more than 4 distinct types of user data (transcription, images, location, calendar, contacts, notifications, etc.) to its AI API during a single session.
> rule: Each data type sent to AI expands the app's knowledge of the user. A meeting app sending transcriptions is expected. The same app also sending location, calendar, contacts, and camera feeds suggests data over-collection. Apps should send only the data types necessary for their declared function.
> shift: Platform trust degrades. User notified of data breadth.
> effect: Platform trust reduced to 65%.

## rule-009: Display Safety Violation (structural)
Full-screen obstruction without dismissal controls endangers the wearer's physical safety.

When display_render_events > 0 [state] AND permission_violations > 0 [state]
Then platform_trust *= 0.40

> trigger: App rendered content that fully occludes the wearer's field of view without providing a user-dismissable control.
> rule: Smart glasses are worn during real-world activity. Display content must never compromise physical safety.
> shift: Platform trust drops. App faces safety review.
> effect: Platform trust reduced to 40%.

## rule-010: Clean AI Session (advantage)
App processed user data through AI with full compliance — declared providers, confirmed actions, proper data handling.

When ai_data_sends > 0 [state] AND ai_data_sends_undeclared == 0 [state] AND ai_auto_actions_unconfirmed == 0 [state] AND permission_violations == 0 [state]
Then platform_trust *= 1.12

> trigger: App has actively used AI to process user data and has maintained full compliance with all governance rules.
> rule: Apps that declare their AI providers, show actions before executing, and respect platform constraints earn trust. This is the model for how AI-powered apps should work on wearables. Clean operation across sessions builds the app's reputation in the Mentra Store.
> shift: Platform trust improves. App earns AI governance compliance badge.
> effect: Platform trust boosted by 12%.

## rule-011: Clean Platform Session (advantage)
App operated without any platform violations — no undeclared access, no session leaks, no credential exposure.

When tool_calls_processed > 0 [state] AND permission_violations == 0 [state] AND cross_session_leak_attempts == 0 [state] AND hardware_mismatch_errors == 0 [state]
Then platform_trust *= 1.10

> trigger: App has processed tool calls and served users without triggering any platform governance violations.
> rule: Good platform citizenship should be recognized. Clean sessions build trust and improve Store ranking.
> shift: Platform trust improves. App earns reliability reputation.
> effect: Platform trust boosted by 10%.

## rule-012: No AI Provider Declared (degradation)
App uses AI features but has not declared any AI provider in its registration.

When ai_data_sends > 0 [state] AND ai_provider_declared == 0 [state]
Then platform_trust *= 0.35

> trigger: App is sending user data to AI endpoints but did not declare any AI provider in its app registration at console.mentra.glass.
> rule: Apps that use AI must declare it. Users deserve to know that their data is being processed by AI, and which AI. An app that processes transcriptions through an AI without declaring it is hiding its architecture from the user. Even if the AI provider is the app developer's own model, it must be declared.
> shift: Platform trust drops. App must update its registration to declare AI integrations.
> effect: Platform trust reduced to 35%.

# Gates

- TRUSTED: platform_trust >= 90
- OPERATING: platform_trust >= 60
- CAUTIOUS: platform_trust >= 35
- RESTRICTED: platform_trust > 10
- SUSPENDED: platform_trust <= 10

# Outcomes

## platform_trust
- type: number
- range: 0-100
- display: percentage
- label: Platform Trust Score
- primary: true

## permission_violations
- type: number
- range: 0-10000
- display: integer
- label: Permission Violations

## hardware_mismatch_errors
- type: number
- range: 0-1000
- display: integer
- label: Hardware Mismatch Errors

## cross_session_leak_attempts
- type: number
- range: 0-1000
- display: integer
- label: Cross-Session Leak Attempts

## ai_data_sends_undeclared
- type: number
- range: 0-1000
- display: integer
- label: Undeclared AI Data Sends

## ai_auto_actions_unconfirmed
- type: number
- range: 0-1000
- display: integer
- label: Unconfirmed AI Actions

## ai_data_types_sent
- type: number
- range: 0-10
- display: integer
- label: AI Data Types Sent
