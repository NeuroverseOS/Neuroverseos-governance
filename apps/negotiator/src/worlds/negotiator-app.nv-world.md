---
world_id: negotiator-app
name: Negotiator App Governance
version: 1.0.0
runtime_mode: COMPLIANCE
default_profile: standard
---

# Thesis

Negotiator helps you read the room — not by detecting lies, but by surfacing behavioral signals that suggest something doesn't line up. Hesitation, deflection, inconsistency, over-explanation — these are patterns, not proof. The app makes the invisible visible so you can negotiate better, ask sharper questions, and make decisions with more information. It does not tell you what's true. It tells you what deserves a closer look.

"We don't detect lies. We detect when something doesn't add up."

Three layers of governance protect the user (top wins):
  1. User Rules — personal, cross-app (user is king)
  2. Platform World — MentraOS enforces hardware + session safety
  3. App World (this) — Negotiator-specific behavior rules

This is the strictest governance of any NeuroverseOS app. The power to analyze someone's behavior in real time demands it.

# Invariants

- `signals_not_truth` — Negotiator NEVER presents a signal as a truth claim about another person's honesty. All outputs are framed as patterns, not proof. "This pattern suggests..." / "Something doesn't line up..." — NEVER "they are lying" / "this is false" / "they're being dishonest." The AI cannot make truth claims about another person's internal state or intentions. This is the core invariant. (structural, immutable)
- `no_single_signal_escalation` — A single behavioral signal is ALWAYS treated as normal human behavior. One hesitation, one pause, one deflection — these happen in every conversation. The app stays silent on single signals. Two distinct signals in proximity may surface an insight (~ prefix). Three or more sustained signals escalate (~~ or ~~~). This prevents false positives from damaging real relationships. (structural, immutable)
- `context_before_signal` — Before surfacing ANY signal, the AI must consider context. Someone stuttering in a second language is not deflecting. Someone pausing before a hard topic is not hiding something. Someone over-explaining to their boss may just be thorough. Nervousness is not deception. Anxiety is not evasion. Context defeats signal. (structural, immutable)
- `no_camera_confidence` — Camera-based signals (gaze direction, head movement, micro-expressions) are NEVER used as primary indicators. They may add weight to a pattern already established by voice and language signals, but they cannot initiate a flag on their own. The science does not support camera-based deception detection. (structural, immutable)
- `human_dignity_floor` — The AI must never make the user feel superior to the person being analyzed. "You caught them" is toxic. "Here's what you might want to clarify" is useful. The goal is better communication and negotiation — not surveillance, not gotchas, not power trips. Every output must respect the dignity of the person being analyzed. (structural, immutable)
- `bystander_analysis_consent` — Analyzing someone's behavioral signals without their knowledge is a significant ethical act. Requires the same ambient bystander acknowledgment as other NeuroverseOS apps. The user must explicitly acknowledge they are analyzing someone who hasn't consented to behavioral analysis. (structural, immutable)
- `no_diagnostic_labels` — Negotiator does not diagnose. It does not label anyone as "anxious," "narcissistic," "manipulative," "sociopathic," or any clinical or personality-disorder term. Those are for licensed professionals. Negotiator reads patterns, not pathology. (structural, immutable)
- `ambient_never_persisted` — The ambient speech buffer exists only in RAM. It is never written to disk. Behavioral signal analysis is ephemeral — what was said and what was flagged dies when the session ends. No recordings, no transcripts, no behavioral profiles. (structural, immutable)

# State

## session_trust
- type: number
- min: 0
- max: 100
- step: 1
- default: 100
- label: Session Trust Score

## signals_surfaced
- type: number
- min: 0
- max: 10000
- step: 1
- default: 0
- label: Signals Surfaced

## false_positive_dismissals
- type: number
- min: 0
- max: 10000
- step: 1
- default: 0
- label: Dismissed Signals (user said "wrong")

# Assumptions

## standard
- name: Standard
- description: Balanced sensitivity. Surfaces signals when 2+ distinct patterns appear. Most users.
- signal_threshold: 2
- max_ai_calls_per_minute: 10
- allow_camera_signals: false
- allow_ambient_context: true
- ambient_buffer_seconds: 120

## conservative
- name: Conservative
- description: High threshold. Only surfaces signals when 3+ strong patterns appear. For users who want fewer interruptions and higher confidence.
- signal_threshold: 3
- max_ai_calls_per_minute: 5
- allow_camera_signals: false
- allow_ambient_context: true
- ambient_buffer_seconds: 120

## sensitive
- name: Sensitive
- description: Lower threshold. Surfaces more signals, including weaker patterns. For experienced negotiators who want maximum awareness. Higher false positive rate.
- signal_threshold: 2
- max_ai_calls_per_minute: 15
- allow_camera_signals: true
- allow_ambient_context: true
- ambient_buffer_seconds: 180

# Rules

## rule-001: Single Signal Suppression (structural)
A single behavioral signal is normal. Suppress it.

When signals_surfaced == 1 [state] AND session_trust > 50 [state]
Then session_trust *= 1.00

> trigger: Only one signal detected in the current analysis window.
> rule: Single signals are noise, not signal. Everyone hesitates. Everyone deflects occasionally. Surfacing a single signal creates paranoia, not awareness.
> shift: No change. Signal suppressed. This is the system working correctly.
> effect: No output to user.

## rule-002: High Dismissal Rate (degradation)
User keeps dismissing signals. The sensitivity is probably too high.

When false_positive_dismissals > 5 [state]
Then session_trust *= 0.85

> trigger: User dismissed more than 5 signals this session.
> rule: If the user keeps saying "wrong," the app is crying wolf. Trust degrades. The system should suggest lowering sensitivity.
> shift: Session trust degrades. User prompted to adjust sensitivity.
> effect: Session trust reduced by 15%.

# Gates

- ACTIVE: session_trust >= 70
- DEGRADED: session_trust >= 30
- SUSPENDED: session_trust > 10
- REVOKED: session_trust <= 10

# Outcomes

## session_trust
- type: number
- range: 0-100
- display: percentage
- label: Session Trust Score
- primary: true

## signals_surfaced
- type: number
- range: 0-10000
- display: integer
- label: Signals Surfaced
