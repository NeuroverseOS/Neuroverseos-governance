---
world_id: mentraos-spatial
name: "MentraOS Spatial Governance"
version: "1.0.0"
runtime_mode: COMPLIANCE
description: >
  Spatial governance layer for MentraOS smart glasses. Activates when
  glasses detect zones (via posemesh portal scanning, BLE, geofence) or nearby
  participants (multi-user handshake). Rules are temporary — they apply
  while you're in the space and dissolve when you leave.
---

# Thesis

Smart glasses live in the real world. The rules that apply at home don't apply at a hospital. The rules that apply when you're alone don't apply when you're standing next to someone who doesn't want to be recorded. Spatial governance makes AI respect the physical context it operates in.

This world governs the spatial layer — the bridge between physical location and AI behavior. It enforces three principles: (1) zones publish rules and users opt in explicitly, (2) when multiple AR users share a space their governance composes via handshake with "most restrictive wins," and (3) all spatial rules are temporary — they dissolve when you leave.

This layer sits between user rules (which always win) and the platform world. A zone can tighten your rules, never relax them. A handshake participant can tighten the group, never relax it.

# Invariants

- `opt_in_required` — Users must explicitly accept a zone's rules before they apply. No zone can force governance on a user without consent. Discovery is passive; acceptance is active. (structural, immutable)
- `most_restrictive_wins` — When zone rules, handshake rules, and user rules overlap, the most restrictive value for each field wins. A zone cannot relax your personal rules. A single handshake participant blocking recording means nobody records. (structural, immutable)
- `rules_are_temporary` — Spatial rules apply only during the spatial session. When you leave a zone or a handshake dissolves, the rules dissolve with it. No spatial rule persists beyond the session. (structural, immutable)
- `no_identity_leak` — Handshake negotiation shares governance constraints, not identity. "I require no recording" is a constraint, not a name. Participants are anonymous by default. (structural, immutable)
- `zone_transparency` — When a zone's rules are active, the user must be able to see which zone they're in, what rules apply, and how to exit. No invisible governance. (structural, immutable)
- `user_can_always_leave` — A user can exit any zone or leave any handshake at any time. Governance never traps the user. If you don't like the rules, you leave. Your personal rules remain. (structural, immutable)
- `physics_over_policy` — Hardware constraints override spatial rules. If glasses don't have a camera, a zone rule allowing cameras is irrelevant. Physics always wins. (structural, immutable)
- `bystander_default_protection` — In any space with non-consenting bystanders, the default is elevated bystander protection. Zones can tighten this to strict. No zone can lower it below standard. (structural, immutable)

# State

- `active_zone` — string, initial "none". The currently active zone ID.
- `zone_opt_ins` — counter, initial 0. Number of zone opt-ins this session.
- `zone_declines` — counter, initial 0. Number of zone opt-in declines.
- `handshake_participants` — counter, initial 0. Current handshake participant count.
- `handshake_negotiations` — counter, initial 0. Number of handshake re-negotiations.
- `spatial_blocks` — counter, initial 0. Number of intents blocked by spatial rules.
- `spatial_confirms` — counter, initial 0. Number of intents requiring spatial confirmation.
- `spatial_trust` — score, initial 1.0, range [0.0, 1.0]. Spatial governance health score.

# Assumptions

- `standard` — Default spatial behavior. zone_opt_in_required=true, handshake_auto_join=false, bystander_protection=elevated, max_handshake_participants=10
- `strict` — Privacy-first spatial. zone_opt_in_required=true, handshake_auto_join=false, bystander_protection=strict, max_handshake_participants=5
- `open` — For controlled spaces (home, private office). zone_opt_in_required=false, handshake_auto_join=true, bystander_protection=standard, max_handshake_participants=20

# Rules

- `rule-001` — Zone rules applied without opt-in. trigger: zone_active AND NOT zone_opted_in → spatial_trust *= 0.10, BLOCK: "Zone rules cannot apply without your explicit opt-in."
- `rule-002` — Handshake identity leaked. trigger: handshake_active AND identity_shared → spatial_trust *= 0.05, BLOCK: "Handshake negotiation must be anonymous."
- `rule-003` — Bystander protection violated. trigger: bystander_protection == "strict" AND camera == "allowed" → spatial_trust *= 0.20, BLOCK: "Camera blocked in strict bystander protection zone."
- `rule-004` — Zone exit blocked. trigger: user_exit_requested AND exit_denied → spatial_trust *= 0.01, BLOCK: "Users must always be able to exit a zone."
- `rule-005` — Spatial rules persisted beyond session. trigger: session_ended AND spatial_rules_active → spatial_trust *= 0.10, BLOCK: "Spatial rules must dissolve when session ends."
- `rule-006` — Clean spatial session (advantage). trigger: zone_opt_ins > 0 AND spatial_blocks == 0 → spatial_trust *= 1.08
- `rule-007` — Zone relaxing user rules. trigger: zone_rule_less_restrictive_than_user_rule → spatial_trust *= 0.30, BLOCK: "Zones can only tighten rules, never relax them."

# Gates

- ACTIVE: spatial_trust >= 0.7
- CAUTIOUS: spatial_trust >= 0.3
- SUSPENDED: spatial_trust < 0.3

# Outcomes

- `clean_spatial` — Desired. User navigated zones and handshakes with no governance violations. Tracked by: zone_opt_ins > 0 AND spatial_blocks == 0.
- `forced_governance` — Undesired. A zone or handshake tried to apply rules without consent. Tracked by: spatial_trust < 0.5.
