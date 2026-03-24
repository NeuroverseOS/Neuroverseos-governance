---
world_id: mentraos-smartglasses
name: MentraOS Smart Glasses Governance
version: 2.0.0
runtime_mode: COMPLIANCE
default_profile: standard
alternative_profile: privacy_first
---

# Thesis

Smart glasses sit on a user's face. They see what the user sees, hear what the user hears, and display content directly in the user's field of vision. An ungoverned application running on smart glasses can surveil without consent, drain battery silently, access hardware it never declared need for, or push content that obstructs the wearer's real-world awareness. MentraOS mediates all hardware access through a permission-gated SDK where apps run as remote servers communicating through phone-to-glasses BLE relay. This world translates MentraOS's actual platform constraints — its permission system, hardware capability matrix, session isolation, app lifecycle rules, and open-source contribution governance — into deterministic, enforceable rules. The goal: if MentraOS already prevents an app from accessing the camera without permission, this world makes that constraint visible, composable, and auditable.

MentraOS does not yet have governance that travels with the user. This world adds that layer. When a wearer moves from home to a coffee shop, their governance posture should shift — camera access tightens, microphone requires confirmation, display dims for discretion. When two wearers share a space, their personal governance preferences compose: the most restrictive policy wins. This is not hypothetical — MentraOS already supports multiple concurrent app sessions and BLE proximity. What it lacks is a governance protocol for what happens at the edges where contexts and users intersect. These scenario rules fill that gap.

# Invariants

- `no_undeclared_hardware_access` — Apps must never access microphone, camera, speaker, or display capabilities not declared in their app registration at console.mentra.glass (structural, immutable)
- `no_silent_recording` — Apps must never capture audio or video without active user awareness; background recording without indicator is forbidden (structural, immutable)
- `no_display_obstruction` — Apps must never render content that fully occludes the wearer's real-world field of view for safety-critical periods without user-dismissable controls (structural, immutable)
- `no_cross_session_data_leak` — App session data must not leak between distinct user sessions; each AppSession is isolated per userId and sessionId (structural, immutable)
- `no_credential_exfiltration` — Apps must never transmit MENTRAOS_API_KEY, user auth tokens, or session credentials to third-party endpoints outside the registered app server (structural, immutable)
- `hardware_capability_respected` — Apps must gracefully degrade when running on glasses that lack declared capabilities; an app requiring camera must not crash on Even Realities G1 which has no camera (structural, immutable)
- `ble_connection_integrity` — Apps must not interfere with the BLE connection between glasses and phone; connection management is OS-exclusive (structural, immutable)
- `mit_license_compliance` — All contributions and derivative works must include the MIT license notice as required by Mentra Labs Inc copyright (prompt, immutable)
- `most_restrictive_wins` — When multiple wearers share a governance context, the most restrictive camera, microphone, and streaming policy among all participants applies to every participant; no wearer's governance can be relaxed by another's (structural, immutable)
- `no_context_escalation` — A spatial context change (e.g., home to public) can only tighten governance posture, never relax it, unless the wearer explicitly re-evaluates; governance ratchets toward safety (structural, immutable)
- `bystander_privacy_default` — In any space where non-wearers may be present, camera and microphone access defaults to the most restrictive available policy unless explicit consent is obtained (structural, immutable)

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

## spatial_context
- type: enum
- options: home, private_office, shared_workspace, public_indoor, public_outdoor, unknown
- default: unknown
- label: Spatial Context
- description: The physical environment the wearer currently occupies, determined by location services or manual selection
- mutable: true

## nearby_wearers
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: Nearby Wearers
- description: Number of other MentraOS wearers detected in BLE proximity range
- mutable: true

## governance_handshake_active
- type: number
- min: 0
- max: 1
- step: 1
- default: 0
- label: Governance Handshake Active
- description: Whether a multi-wearer governance negotiation is currently in effect (1 = active, 0 = solo)
- mutable: true

## bystanders_present
- type: number
- min: 0
- max: 1
- step: 1
- default: 0
- label: Bystanders Present
- description: Whether non-wearers (people without glasses) are detected or assumed present in the current space (1 = yes, 0 = no)
- mutable: true

## camera_stream_active
- type: number
- min: 0
- max: 1
- step: 1
- default: 0
- label: Camera Stream Active
- description: Whether a managed camera stream (HLS or RTMP restream) is currently broadcasting
- mutable: true

## location_sharing_active
- type: number
- min: 0
- max: 1
- step: 1
- default: 0
- label: Location Sharing Active
- description: Whether the LOCATION permission is actively being used to share wearer position data
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
- streaming_policy: blocked
- location_policy: blocked
- dashboard_policy: main_only

## public_space
- name: Public Space Governance
- description: Governance posture for public environments — coffee shops, transit, sidewalks, stores. Bystanders cannot consent to being recorded. Camera is auto-blocked. Microphone requires per-use confirmation and only captures the wearer's voice (no ambient). Display dims and uses text-only to avoid drawing attention or leaking content to onlookers. Streaming is blocked entirely. Location sharing requires confirmation. This profile activates when spatial_context is public_indoor or public_outdoor.
- camera_policy: blocked
- microphone_policy: per_use_confirmation
- display_policy: text_only_dimmed
- session_policy: ephemeral_no_persist
- network_policy: app_server_only
- contribution_policy: feature_branch_to_dev
- store_policy: registered_and_reviewed
- streaming_policy: blocked
- location_policy: per_use_confirmation
- dashboard_policy: main_only

## shared_session
- name: Shared Session / Multi-Wearer Governance
- description: Governance posture when multiple MentraOS wearers occupy the same space and their governance handshakes. The most restrictive policy among all participants wins for every hardware capability. If any wearer blocks camera, camera is blocked for all. If any wearer requires mic confirmation, all require it. This prevents one wearer's app from surveilling through another wearer's more permissive policy. Streaming is blocked unless all participants explicitly allow it. Dashboard content is limited to prevent information leakage between wearers.
- camera_policy: most_restrictive
- microphone_policy: most_restrictive
- display_policy: most_restrictive
- session_policy: isolated_per_user
- network_policy: app_server_only
- contribution_policy: feature_branch_to_dev
- store_policy: registered_and_reviewed
- streaming_policy: unanimous_consent
- location_policy: most_restrictive
- dashboard_policy: main_only

## home
- name: Home / Private Space Governance
- description: Relaxed governance for the wearer's own private space. Full hardware access within declared permissions. Camera and microphone operate normally with permission grants. Display supports all layout types including images and expanded dashboard. Streaming allowed. Location sharing allowed. Persistent dashboard in always-on mode permitted. This is the most permissive profile but still enforces all structural invariants — declared permissions are still required, sessions are still isolated, credentials are still protected.
- camera_policy: permission_required
- microphone_policy: permission_required
- display_policy: full_capability
- session_policy: isolated_per_user
- network_policy: app_server_only
- contribution_policy: feature_branch_to_dev
- store_policy: registered_and_reviewed
- streaming_policy: permission_required
- location_policy: permission_required
- dashboard_policy: full_access

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

## rule-008: Public Space Camera Block (structural)
Camera access is automatically blocked in public spaces. Bystanders cannot consent to being recorded by a device they may not even notice.

When spatial_context == "public_indoor" [state] AND camera_access_events > 0 [state]
Then platform_trust *= 0.20
Collapse: platform_trust < 0.10

> trigger: App attempted camera capture or streaming while wearer is in a public indoor space (coffee shop, transit, store).
> rule: Public spaces contain bystanders who have not consented to recording. MentraOS camera permissions govern what an app declared — spatial governance governs where those permissions apply. Camera access that is legitimate at home becomes a surveillance violation in public. The CAMERA permission does not override spatial context.
> shift: Platform trust drops severely. Camera access is suspended for the remainder of the spatial context.
> effect: Platform trust reduced to 20%. App flagged for spatial policy violation.

## rule-009: Public Space Camera Block — Outdoor (structural)
Same protection extends to outdoor public spaces where bystanders are present.

When spatial_context == "public_outdoor" [state] AND camera_access_events > 0 [state]
Then platform_trust *= 0.20
Collapse: platform_trust < 0.10

> trigger: App attempted camera capture or streaming while wearer is in a public outdoor space (sidewalk, park, plaza).
> rule: Outdoor public spaces contain bystanders who cannot consent. The same spatial governance that blocks indoor public camera applies outdoors. A wearer walking down a street with an active camera stream is broadcasting every face they pass.
> shift: Platform trust drops severely. Camera access suspended for this spatial context.
> effect: Platform trust reduced to 20%.

## rule-010: Public Space Microphone Confirmation (degradation)
Microphone access in public spaces requires per-use confirmation to prevent ambient audio capture of bystander conversations.

When spatial_context == "public_indoor" [state] AND microphone_access_events > 5 [state]
Then platform_trust *= 0.50

> trigger: App performed more than 5 audio transcription events in a public indoor space without per-use confirmation gates.
> rule: Microphone in public captures more than the wearer's voice — it captures ambient conversation from bystanders. In public spaces, continuous transcription should be gated by per-use confirmation. Apps that request onTranscription() events continuously in public are capturing conversations the wearer is not part of.
> shift: Platform trust degrades. Microphone access restricted to confirmed-only mode.
> effect: Platform trust reduced to 50%.

## rule-011: Display Discretion in Public (degradation)
Display content should be dimmed and text-only in public spaces to prevent information leakage to onlookers and reduce social conspicuousness.

When spatial_context == "public_indoor" [state] AND display_render_events > 10 [state]
Then platform_trust *= 0.80

> trigger: App rendered more than 10 display events in a public indoor space using full-brightness or image-capable layouts.
> rule: Smart glasses in public are socially visible. Content displayed on glasses can be seen or inferred by people nearby. Governance recommends text-only dimmed displays in public to minimize information leakage. Apps using showDoubleTextWall, REFERENCE_CARD, or DASHBOARD_CARD layouts with images should degrade to TEXT_WALL in public contexts.
> shift: Platform trust mildly degrades. Display auto-switches to text-only dimmed mode.
> effect: Platform trust reduced to 80%.

## rule-012: Multi-Wearer Governance Handshake (structural)
When nearby wearers are detected, governance negotiation activates. The most restrictive policy among all participants applies.

When nearby_wearers > 0 [state] AND governance_handshake_active == 0 [state] AND camera_access_events > 0 [state]
Then platform_trust *= 0.30
Collapse: platform_trust < 0.10

> trigger: Camera access occurred while other MentraOS wearers are nearby but governance handshake has not been established.
> rule: When wearers share a space, each wearer's personal governance must compose with every other wearer's. Until the handshake completes, the default is maximum restriction — camera blocked, microphone confirmation-required, streaming blocked. An app that captures camera while a nearby wearer's governance blocks camera is violating that wearer's governance, not just the platform's. The most_restrictive_wins invariant makes this structural.
> shift: Platform trust drops critically. All hardware access gates to most-restrictive defaults until handshake completes.
> effect: Platform trust reduced to 30%. Collapse imminent without handshake resolution.

## rule-013: Handshake Established — Clean Multi-Wearer Operation (advantage)
When governance handshake is active and all policies are negotiated, multi-wearer operation is the gold standard of spatial governance.

When governance_handshake_active == 1 [state] AND nearby_wearers > 0 [state] AND permission_violations == 0 [state]
Then platform_trust *= 1.15

> trigger: Multiple wearers are operating with an active governance handshake and no violations have occurred.
> rule: Successful multi-wearer governance composition proves the model works. Each wearer's personal governance was respected, the most restrictive policies were applied, and all apps continued to operate cleanly within the negotiated boundaries. This is the behavior the platform should reward.
> shift: Platform trust improves significantly. All participating apps earn multi-wearer compliance reputation.
> effect: Platform trust boosted by 15%.

## rule-014: Streaming in Public or Shared Context (structural)
Active camera streams (HLS or RTMP restream) are blocked in public spaces and require unanimous consent in shared wearer contexts.

When camera_stream_active == 1 [state] AND bystanders_present == 1 [state]
Then platform_trust *= 0.15
Collapse: platform_trust < 0.10

> trigger: App is actively streaming video (via startManagedStream() or RTMP restream) while bystanders are present.
> rule: Camera streaming broadcasts continuously — every face, every conversation, every passing moment. A single photo is a point-in-time capture; a stream is persistent surveillance. In any space with bystanders, streaming is categorically blocked. MentraOS supports RTMP restreaming to social media platforms, which means a stream in public could be broadcasting bystanders to the internet in real time.
> shift: Platform trust collapses. Stream is terminated. App faces immediate review.
> effect: Platform trust reduced to 15%. Near-certain collapse.

## rule-015: Location Sharing in Public (degradation)
Location data combined with public spatial context reveals movement patterns. Governance restricts continuous location sharing in public.

When location_sharing_active == 1 [state] AND spatial_context == "public_outdoor" [state]
Then platform_trust *= 0.65

> trigger: App is actively sharing wearer location data while in a public outdoor space.
> rule: Location data in public outdoor spaces creates a movement trail. Combined with timestamps, this reveals where the wearer goes, how long they stay, and which routes they take. Apps with LOCATION permission should gate continuous sharing to confirmed-only in public outdoor contexts. Indoor location is less precise and less concerning.
> shift: Platform trust degrades. Location sharing downgraded to on-demand only.
> effect: Platform trust reduced to 65%.

## rule-016: Home Context Full Access (advantage)
In private home context with no bystanders and no nearby wearers, governance relaxes to maximum permissiveness within declared permissions.

When spatial_context == "home" [state] AND bystanders_present == 0 [state] AND nearby_wearers == 0 [state] AND permission_violations == 0 [state]
Then platform_trust *= 1.10

> trigger: Wearer is in their home with no bystanders or other wearers, and no governance violations have occurred.
> rule: Home is the baseline for full hardware access. Camera, microphone, streaming, location, and expanded dashboard are all available within declared app permissions. Persistent dashboard in always-on mode is permitted. Extended camera streaming for personal use is legitimate. Governance exists to protect others — when there are no others present and the wearer is in their own space, maximum freedom is the correct posture.
> shift: Platform trust improves. All hardware capabilities available at declared permission level.
> effect: Platform trust boosted by 10%.

## rule-017: Context Transition Ratchet (degradation)
Moving from a permissive context (home) to a restrictive one (public) without governance posture adjustment indicates a policy gap.

When spatial_context == "public_indoor" [state] AND camera_stream_active == 1 [state]
Then platform_trust *= 0.25
Collapse: platform_trust < 0.10

> trigger: Wearer transitioned to a public indoor space while a camera stream was still active from a previous context.
> rule: Context transitions must ratchet governance toward restriction, never maintain permissive state. A camera stream started at home must terminate when the wearer enters a coffee shop. The no_context_escalation invariant requires this. Apps should subscribe to spatial context changes and adjust — MentraOS provides the onLocationUpdate event for this purpose.
> shift: Platform trust drops critically. Active streams terminated. Camera blocked until context stabilizes.
> effect: Platform trust reduced to 25%. Apps must re-negotiate access in the new context.

## rule-018: Bystander-Aware Clean Operation (advantage)
Operating cleanly in the presence of bystanders — no camera, confirmed mic, dimmed display — demonstrates exemplary spatial governance.

When bystanders_present == 1 [state] AND camera_access_events == 0 [state] AND camera_stream_active == 0 [state] AND permission_violations == 0 [state]
Then platform_trust *= 1.12

> trigger: Bystanders are present and the app is operating without any camera access, streaming, or governance violations.
> rule: The hardest governance to get right is the kind that restricts capability the app legitimately has. An app with CAMERA permission that voluntarily avoids camera access when bystanders are present is demonstrating that governance composition works — platform permissions say yes, spatial governance says no, and the app respects spatial governance.
> shift: Platform trust improves. App earns bystander-aware compliance reputation.
> effect: Platform trust boosted by 12%.

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

## spatial_context
- type: string
- range: home|private_office|shared_workspace|public_indoor|public_outdoor|unknown
- display: enum
- label: Spatial Context

## nearby_wearers
- type: number
- range: 0-100
- display: integer
- label: Nearby Wearers

## governance_handshake_active
- type: number
- range: 0-1
- display: boolean
- label: Governance Handshake Active
