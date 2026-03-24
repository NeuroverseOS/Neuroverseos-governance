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

# State

- `activation_count` — counter, initial 0. Number of times the user has activated the AI this session.
- `lens_switches` — counter, initial 0. Number of times the user has switched lenses this session.
- `ai_calls_made` — counter, initial 0. Number of AI API calls made this session.
- `ai_calls_failed` — counter, initial 0. Number of AI API calls that failed this session.
- `camera_context_uses` — counter, initial 0. Number of times camera context was included.
- `session_trust` — score, initial 1.0, range [0.0, 1.0]. App behavior trust score for this session.

# Assumptions

- `standard` — Default app behavior. max_ai_calls_per_minute=10, max_camera_captures_per_minute=3, allow_lens_stacking=true, allow_camera_context=true, allow_always_on=false
- `privacy_first` — Stricter — no camera, no always-on, confirm each AI call. max_ai_calls_per_minute=5, max_camera_captures_per_minute=0, allow_lens_stacking=true, allow_camera_context=false, allow_always_on=false
- `power_user` — Looser — allows always-on, higher rate limits. max_ai_calls_per_minute=30, max_camera_captures_per_minute=10, allow_lens_stacking=true, allow_camera_context=true, allow_always_on=true

# Rules

- `rule-001` — Rate Limit Exceeded. trigger: ai_calls_made > max_ai_calls_per_minute within 60s → session_trust *= 0.80, PAUSE: "You're sending a lot of requests. Slow down?"
- `rule-002` — Camera Without Permission. trigger: camera_context_uses > 0 AND allow_camera_context == false → session_trust *= 0.20, BLOCK: "Camera context is disabled in your app settings."
- `rule-003` — Always-On Without Permission. trigger: activation_mode == "always_on" AND allow_always_on == false → session_trust *= 0.30, BLOCK: "Always-on mode is not enabled. Use tap or voice activation."
- `rule-004` — Excessive Failures. trigger: ai_calls_failed > 5 within 60s → session_trust *= 0.50, PAUSE: "Multiple AI calls are failing. Check your API key in Settings."
- `rule-005` — Clean Session (advantage). trigger: ai_calls_made > 10 AND ai_calls_failed == 0 → session_trust *= 1.05
- `rule-006` — Lens Stack Limit. trigger: active_lens_count > 3 → PAUSE: "That's a lot of lenses stacked. Responses might get unpredictable."

# Gates

- ACTIVE: session_trust >= 0.7
- DEGRADED: session_trust >= 0.3
- SUSPENDED: session_trust < 0.3

# Outcomes

- `healthy_session` — Desired. The user has a productive session with no governance violations. Tracked by: ai_calls_made > 0 AND ai_calls_failed == 0 AND session_trust >= 0.9.
- `degraded_session` — Undesired. Something went wrong — rate limits hit, bad API key, etc. Tracked by: session_trust < 0.7.
- `suspended_session` — Undesired. App behavior was unhealthy enough to suspend. Tracked by: session_trust < 0.3.
