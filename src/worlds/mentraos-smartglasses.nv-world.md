---
world_id: mentraos-smartglasses
name: MentraOS Smart Glasses Governance
version: 1.0.0
runtime_mode: COMPLIANCE
default_profile: standard
alternative_profile: privacy_first
---

# Thesis

Smart glasses sit on a user's face. They see what the user sees, hear what the user hears, and display content directly in the user's field of vision. An ungoverned application running on smart glasses can surveil without consent, drain battery silently, access hardware it never declared need for, or push content that obstructs the wearer's real-world awareness. MentraOS mediates all hardware access through a permission-gated SDK where apps run as remote servers communicating through phone-to-glasses BLE relay. This world translates MentraOS's actual platform constraints — its permission system, hardware capability matrix, session isolation, app lifecycle rules, and open-source contribution governance — into deterministic, enforceable rules. The goal: if MentraOS already prevents an app from accessing the camera without permission, this world makes that constraint visible, composable, and auditable.

# Invariants

- `no_undeclared_hardware_access` — Apps must never access microphone, camera, speaker, or display capabilities not declared in their app registration at console.mentra.glass (structural, immutable)
- `no_silent_recording` — Apps must never capture audio or video without active user awareness; background recording without indicator is forbidden (structural, immutable)
- `no_display_obstruction` — Apps must never render content that fully occludes the wearer's real-world field of view for safety-critical periods without user-dismissable controls (structural, immutable)
- `no_cross_session_data_leak` — App session data must not leak between distinct user sessions; each AppSession is isolated per userId and sessionId (structural, immutable)
- `no_credential_exfiltration` — Apps must never transmit MENTRAOS_API_KEY, user auth tokens, or session credentials to third-party endpoints outside the registered app server (structural, immutable)
- `hardware_capability_respected` — Apps must gracefully degrade when running on glasses that lack declared capabilities; an app requiring camera must not crash on Even Realities G1 which has no camera (structural, immutable)
- `ble_connection_integrity` — Apps must not interfere with the BLE connection between glasses and phone; connection management is OS-exclusive (structural, immutable)
- `mit_license_compliance` — All contributions and derivative works must include the MIT license notice as required by Mentra Labs Inc copyright (prompt, immutable)

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

# Assumptions

## standard
- name: Standard App Operation
- description: Normal app development and runtime. Apps declare permissions at registration, access hardware through SDK managers, and operate within their session boundary. Camera and microphone require explicit permission grants. Display access follows hardware capability matrix. All development happens on feature branches from dev.
- camera_policy: permission_required
- microphone_policy: permission_required
- display_policy: capability_checked
- session_policy: isolated_per_user
- network_policy: app_server_only
- contribution_policy: feature_branch_to_dev
- store_policy: registered_and_reviewed

## privacy_first
- name: Privacy-First Mode
- description: Enhanced privacy governance for sensitive environments. Camera access blocked entirely. Microphone requires per-use confirmation. Display limited to text-only. No data persists beyond session end. Represents a user's personal governance composing with platform rules — tightening what the platform allows but never relaxing structural constraints.
- camera_policy: blocked
- microphone_policy: per_use_confirmation
- display_policy: text_only
- session_policy: ephemeral_no_persist
- network_policy: app_server_only
- contribution_policy: feature_branch_to_dev
- store_policy: registered_and_reviewed

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
Smart glasses have limited battery. Apps consuming excessive power degrade the user experience and hardware longevity.

When battery_drain_rate > 25 [state]
Then platform_trust *= 0.70

> trigger: App's estimated battery consumption exceeds 25% per hour, leaving the user with less than 4 hours of total glasses operation.
> rule: Wearable devices require power-conscious apps. The onGlassesBattery() event exists to help apps monitor and respond to battery state.
> shift: Platform trust degrades. App may receive battery warnings from the OS.
> effect: Platform trust reduced to 70%.

## rule-005: Credential Exposure (structural)
API keys and auth tokens must never leave the app server boundary.

When credential_exposure_attempts > 0 [state]
Then platform_trust *= 0.10
Collapse: platform_trust < 0.10

> trigger: App attempted to transmit MENTRAOS_API_KEY, session tokens, or user authentication credentials to an endpoint outside the registered app server.
> rule: The MENTRAOS_API_KEY authenticates the app server to the platform. Exposure compromises the entire app's user base. Webview auth is handled automatically by the platform — apps must not extract or forward tokens.
> shift: Platform trust collapses. App is immediately suspended.
> effect: Platform trust reduced to 10%. Triggers collapse.

## rule-006: Clean Session Operation (advantage)
An app session that serves users without violations validates the governance model.

When tool_calls_processed > 0 [state] AND permission_violations == 0 [state] AND cross_session_leak_attempts == 0 [state] AND hardware_mismatch_errors == 0 [state]
Then platform_trust *= 1.10

> trigger: App has processed tool calls and served users without triggering any governance violations.
> rule: Good platform citizenship should be recognized. Clean sessions build trust and improve Store ranking.
> shift: Platform trust improves. App earns reliability reputation.
> effect: Platform trust boosted by 10%.

## rule-007: Display Safety Violation (structural)
Full-screen obstruction without dismissal controls endangers the wearer's physical safety.

When display_render_events > 0 [state] AND permission_violations > 0 [state]
Then platform_trust *= 0.40

> trigger: App rendered content that fully occludes the wearer's field of view without providing a user-dismissable control, or rendered on glasses that don't support display (Mentra Live).
> rule: Smart glasses are worn during real-world activity. Display content must never compromise physical safety. The showTextWall() method has view type and duration parameters specifically to prevent indefinite obstruction.
> shift: Platform trust drops. App faces safety review.
> effect: Platform trust reduced to 40%.

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

## battery_drain_rate
- type: number
- range: 0-100
- display: percentage
- label: Battery Drain Rate
