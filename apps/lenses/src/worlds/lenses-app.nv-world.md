---
world_id: lenses-app
name: "Lenses App Governance"
version: "1.0.0"
runtime_mode: COMPLIANCE
description: >
  App-specific governance for the Lenses app.
  This sits BELOW the platform world (mentraos-smartglasses) and user rules,
  but ABOVE the raw AI call. It governs what the Lenses app itself is allowed
  to do — and users can customize these rules in app settings.

  Three layers of governance (top wins):
    1. User Rules — personal, cross-app (user is king)
    2. Platform World — MentraOS enforces hardware + session safety
    3. App World (this) — app-specific behavior rules

  This world proves that governance isn't just for platforms.
  Every app can have its own governance — and users can tune it.
---

# Thesis

The Lenses app helps people think differently by giving AI a perspective. But even a helpful app needs rules. This world governs what the app can and cannot do with your data, your attention, and your trust. Users can customize these rules in Settings > App Rules.

# Invariants

- `lens-transparency` — The active lens name and author must always be visible to the user. The user must always know WHO is shaping their AI's responses. (structural, immutable)
- `no-hidden-data-flow` — Every piece of data sent to the AI provider must correspond to a user-initiated action (tap, voice command, or explicit setting). No background data collection. (structural, immutable)
- `user-controls-activation` — The AI must never listen or respond without the user explicitly activating it, unless the user has deliberately chosen "always on" mode in settings. (structural, immutable)
- `byo-key-integrity` — The user's API key is used only to call their chosen AI provider. It is never logged, transmitted to NeuroverseOS servers, or used for any other purpose. (structural, immutable)
- `no-behavioral-persistence` — Lens directives shape the current session only. The app does not build a behavioral profile of the user across sessions. Each session starts fresh. (structural, immutable)
- `response-length-respect` — AI responses must respect the user's configured max_response_words setting. Glasses displays are small. Walls of text are hostile UX. (structural, soft)
- `ambient-never-persisted` — The ambient speech buffer exists only in RAM for the configured duration. It is never written to disk, never transmitted until the user explicitly activates, and is destroyed when the session ends or the buffer window expires. (structural, immutable)
- `ambient-user-initiated-only` — Ambient context is only included in an AI call when the user explicitly triggers activation (tap, double-tap, wake word). The buffer is passive — it listens but never acts on its own. (structural, immutable)
- `ambient-bystander-disclosure` — The user must acknowledge during opt-in that ambient mode captures speech from people nearby. This is a one-time acknowledgment stored in the user's MentraOS settings, not on our servers. (structural, immutable)
- `ambient-separation-from-identity` — Ambient speech transcription is never associated with speaker identity. The buffer contains raw text with no speaker labels, voiceprints, or identification metadata. (structural, immutable)

# State

- `activation_count` — counter, initial 0. Number of times the user has activated the AI this session.
- `lens_switches` — counter, initial 0. Number of times the user has switched lenses this session.
- `ai_calls_made` — counter, initial 0. Number of AI API calls made this session.
- `ai_calls_failed` — counter, initial 0. Number of AI API calls that failed this session.
- `camera_context_uses` — counter, initial 0. Number of times camera context was included.
- `session_trust` — score, initial 1.0, range [0.0, 1.0]. App behavior trust score for this session.
- `ambient_enabled` — boolean, initial false. Whether the user has opted into ambient context for this session.
- `ambient_buffer_seconds` — number, initial 120, range [30, 300]. Max seconds of ambient speech retained in the rolling buffer.
- `ambient_sends` — counter, initial 0. Number of AI calls that included ambient context this session.
- `ambient_tokens_sent` — counter, initial 0. Cumulative input tokens from ambient context this session.
- `ambient_bystander_ack` — boolean, initial false. Whether the user has acknowledged bystander disclosure.

# Assumptions

- `standard` — Default app behavior. max_ai_calls_per_minute=10, max_camera_captures_per_minute=3, allow_lens_stacking=true, allow_camera_context=true, allow_always_on=false, allow_ambient_context=true, ambient_buffer_seconds=120, max_ambient_tokens_per_call=700
- `privacy_first` — Stricter — no camera, no ambient, no always-on, confirm each AI call. max_ai_calls_per_minute=5, max_camera_captures_per_minute=0, allow_lens_stacking=true, allow_camera_context=false, allow_always_on=false, allow_ambient_context=false, ambient_buffer_seconds=0, max_ambient_tokens_per_call=0
- `power_user` — Looser — allows always-on, ambient, higher rate limits. max_ai_calls_per_minute=30, max_camera_captures_per_minute=10, allow_lens_stacking=true, allow_camera_context=true, allow_always_on=true, allow_ambient_context=true, ambient_buffer_seconds=300, max_ambient_tokens_per_call=1500

# Rules

- `rule-001` — Rate Limit Exceeded. trigger: ai_calls_made > max_ai_calls_per_minute within 60s → session_trust *= 0.80, PAUSE: "You're sending a lot of requests. Slow down?"
- `rule-002` — Camera Without Permission. trigger: camera_context_uses > 0 AND allow_camera_context == false → session_trust *= 0.20, BLOCK: "Camera context is disabled in your app settings."
- `rule-003` — Always-On Without Permission. trigger: activation_mode == "always_on" AND allow_always_on == false → session_trust *= 0.30, BLOCK: "Always-on mode is not enabled. Use tap or voice activation."
- `rule-004` — Excessive Failures. trigger: ai_calls_failed > 5 within 60s → session_trust *= 0.50, PAUSE: "Multiple AI calls are failing. Check your API key in Settings."
- `rule-005` — Clean Session (advantage). trigger: ai_calls_made > 10 AND ai_calls_failed == 0 → session_trust *= 1.05
- `rule-006` — Lens Stack Limit. trigger: active_lens_count > 3 → PAUSE: "That's a lot of lenses stacked. Responses might get unpredictable."
- `rule-007` — Ambient Without Opt-In. trigger: ambient_sends > 0 AND ambient_enabled == false → session_trust *= 0.10, BLOCK: "Ambient context requires explicit opt-in in Settings."
- `rule-008` — Ambient Without Bystander Acknowledgment. trigger: ambient_enabled == true AND ambient_bystander_ack == false → BLOCK: "You must acknowledge the bystander disclosure before using ambient context."
- `rule-009` — Ambient in Privacy-First Mode. trigger: ambient_sends > 0 AND assumption == "privacy_first" → BLOCK: "Ambient context is disabled in privacy-first mode."
- `rule-010` — Ambient Token Budget Exceeded. trigger: ambient_tokens_sent > max_ambient_tokens_per_call → MODIFY: Truncate ambient buffer from the beginning (oldest speech first) to fit within token budget. Newest context is always most relevant.
- `rule-011` — Ambient Buffer Expiry. trigger: ambient_buffer_age > ambient_buffer_seconds → MODIFY: Purge expired entries from the rolling buffer. Stale context is worse than no context.

# Gates

- ACTIVE: session_trust >= 0.7
- DEGRADED: session_trust >= 0.3
- SUSPENDED: session_trust < 0.3

# Outcomes

- `healthy_session` — Desired. The user has a productive session with no governance violations. Tracked by: ai_calls_made > 0 AND ai_calls_failed == 0 AND session_trust >= 0.9.
- `degraded_session` — Undesired. Something went wrong — rate limits hit, bad API key, etc. Tracked by: session_trust < 0.7.
- `suspended_session` — Undesired. App behavior was unhealthy enough to suspend. Tracked by: session_trust < 0.3.
- `ambient_governed` — Desired. Ambient context was used within governance boundaries — user opted in, bystander acknowledged, token budgets respected, buffer lifecycle enforced. Tracked by: ambient_sends > 0 AND ambient_enabled == true AND ambient_bystander_ack == true AND ambient_tokens_sent <= max_ambient_tokens_per_call.
- `ambient_leak` — Undesired. Ambient context was sent without proper governance. This should NEVER happen — if it does, it's a code bug, not a user error. Tracked by: ambient_sends > 0 AND (ambient_enabled == false OR ambient_bystander_ack == false).
