---
world_id: bevia-align
name: Align — Strategy Alignment Governance
version: 1.0.0
runtime_mode: COMPLIANCE
default_profile: standard
alternative_profile: strict
---

# Thesis

Align evaluates documents against corporate strategy, culture, and org models. It builds governance world files from uploaded documents, detects conflicts between docs, and uses the guard engine for alignment checking. Align must never silently merge contradictory documents, never auto-apply rewrites, and must surface every conflict for user resolution. The user's strategy is THEIR governance — we compile it, we don't interpret it.

# Invariants

- `never_silently_merge` — When uploaded documents contain contradictions, Align must detect and surface them for user resolution BEFORE building the world file. Hard conflicts block. Soft tensions are noted. Never silently merge. (structural, immutable)
- `user_strategy_is_law` — The world file generated from user docs IS their governance. Align evaluates against it faithfully. We don't add rules they didn't express. We don't soften rules they stated as absolutes. (structural, immutable)
- `suggest_never_auto_apply` — Rewrite suggestions are suggestions. The user accepts or rejects each one. Never auto-apply changes to a document. (structural, immutable)
- `verdict_integrity` — Deterministic red line flags cannot be overridden by AI analysis. If the deterministic pass says CONFLICT on a red line, that verdict stands regardless of AI's interpretation. (structural, immutable)
- `org_hierarchy_enforced` — Sub-models (team governance) can tighten but never loosen org-level rules. Team charters cannot override company strategy or culture values. (structural, immutable)
- `simulation_is_projection` — Strategy simulations ("what happens if you adopt this?") are projections based on rule-forward modeling, not predictions. Always labeled as such. (structural, immutable)
- `source_attribution` — Every rule in the generated world file must trace back to a specific document and section. No orphan rules. No rules the AI invented. (structural, immutable)

# State

## documents_uploaded
- type: number
- min: 0
- max: 100
- default: 0

## conflicts_detected
- type: number
- min: 0
- max: 100
- default: 0

## conflicts_resolved
- type: number
- min: 0
- max: 100
- default: 0

## world_file_generated
- type: boolean
- default: false

## org_model_loaded
- type: boolean
- default: false

## team_sub_models
- type: number
- min: 0
- max: 50
- default: 0

# Rules

## rule-001: Conflict detection required (structural)
When documents_uploaded > 1 AND conflicts_detected = 0
Then run conflict_detection before world_generation

## rule-002: Hard conflicts block world generation (structural)
When conflicts_detected > 0 AND conflicts_resolved < hard_conflict_count
Then BLOCK world_generation

## rule-003: Sub-model hierarchy enforcement (structural)
When team_sub_models > 0
Then validate sub_models cannot loosen org_rules

## rule-004: Simulation step limit (structural)
When simulation_steps > 10
Then BLOCK with message "Maximum 10 simulation steps per run"

# Guards

## guard-001: Block world generation with unresolved conflicts
When intent matches generate_world AND hard_conflicts_unresolved > 0
Then BLOCK with conflicts list

## guard-002: Block auto-apply of rewrites
When intent matches apply_rewrite AND user_approval = false
Then BLOCK

## guard-003: Block sub-model loosening org rules
When intent matches save_sub_model AND loosens_org_rules = true
Then BLOCK with explanation of which org rule would be loosened

## guard-004: Require source attribution
When intent matches save_world_file AND orphan_rules > 0
Then BLOCK with list of rules missing source attribution

## guard-005: Block simulation without world file
When intent matches run_simulation AND world_file_generated = false
Then BLOCK with message "Upload and process strategy documents first"

# Roles

## executive
- name: Executive (C-suite, VP)
- permissions: [upload_strategy, upload_culture, set_red_lines, approve_world_file, run_simulation, override_drift]
- constraints: [cannot_override_red_lines_without_re_upload]

## director
- name: Director
- permissions: [upload_strategy, check_alignment, run_simulation, manage_team_charter]
- constraints: [cannot_set_org_red_lines]

## team_lead
- name: Team Lead
- permissions: [check_alignment, manage_team_sub_model, view_verdicts]
- constraints: [sub_model_cannot_loosen_org_rules]

## individual_contributor
- name: Individual Contributor
- permissions: [check_alignment, view_verdicts]
- constraints: [cannot_modify_strategy, cannot_modify_culture]

# Lenses

## align_lens
- name: Align Analyzer
- tagline: Evidence-based. No opinions.
- formality: professional
- verbosity: balanced
- emotion: neutral
- confidence: authoritative

> response_framing: Every verdict must cite specific evidence — quotes from the document mapped to specific rules from the strategy. Never say "this feels misaligned." Say "this contradicts rule X because [specific evidence]."
> behavior_shaping: Be thorough but not overwhelming. Surface the top 3-5 findings prominently. Detailed breakdowns go in expandable sections. The busy VP should get the answer in 5 seconds.
