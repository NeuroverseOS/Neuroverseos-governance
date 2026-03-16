---
world_id: research-agent
name: Research Agent Governance
version: 1.0.0
runtime_mode: COMPLIANCE
default_profile: conservative
alternative_profile: exploratory
---

# Thesis

AI research agents that autonomously search, synthesize, and publish findings must operate within governance boundaries. An ungoverned research agent can fabricate citations, plagiarize content, exceed API rate limits, or publish unreviewed conclusions. Research governance ensures rigor, attribution, and responsible resource usage.

# Invariants

- `sources_must_be_cited` — Every claim must be traceable to a declared source; unsourced assertions are forbidden (structural, immutable)
- `no_fabricated_citations` — Agent must never invent, hallucinate, or misattribute sources or data (structural, immutable)
- `no_plagiarism` — Agent must not reproduce copyrighted content without proper attribution and licensing compliance (structural, immutable)
- `api_rate_limits_respected` — Agent must respect rate limits on all external APIs and data sources (structural, immutable)
- `no_unauthorized_publication` — Research findings must not be published externally without human review and approval (prompt, immutable)
- `data_provenance_tracked` — Every piece of data used must have clear provenance (source URL, access date, license) (structural, immutable)

# State

## sources_consulted
- type: number
- min: 0
- max: 10000
- step: 1
- default: 0
- label: Sources Consulted
- description: Total number of unique sources accessed

## claims_made
- type: number
- min: 0
- max: 10000
- step: 1
- default: 0
- label: Claims Made
- description: Total assertions or findings produced

## unsourced_claims
- type: number
- min: 0
- max: 10000
- step: 1
- default: 0
- label: Unsourced Claims
- description: Claims without traceable source attribution

## api_calls_made
- type: number
- min: 0
- max: 100000
- step: 1
- default: 0
- label: API Calls Made
- description: Total external API calls made

## api_budget
- type: number
- min: 0
- max: 100000
- step: 100
- default: 5000
- label: API Call Budget
- description: Maximum allowed API calls for this research session

## synthesis_quality
- type: number
- min: 0
- max: 100
- step: 1
- default: 50
- label: Synthesis Quality
- description: Quality score based on source diversity, citation coverage, and coherence

# Assumptions

## conservative
- name: Conservative Research
- description: Prioritize accuracy over speed. Require multiple sources per claim. Strict API budget adherence. No publication without review.
- source_requirement: multiple_per_claim
- api_strictness: hard_limit
- publication_gate: human_required

## exploratory
- name: Exploratory Research
- description: Allow broader exploration with single-source claims. Softer API limits. Still require review for publication.
- source_requirement: at_least_one
- api_strictness: soft_warning
- publication_gate: human_required

# Rules

## rule-001: API Budget Exhausted (structural)
When the API call budget is exceeded, no further external calls are allowed.

When api_calls_made > api_budget [state]
Then research_viability *= 0.00
Collapse: research_viability < 0.05

> trigger: API call budget exceeded — no more external requests allowed.
> rule: Rate limits and budgets exist to prevent abuse and cost overruns.
> shift: Research loop halts for external calls. Agent must work with existing data.
> effect: Research viability set to zero for external operations.

## rule-002: Unsourced Claims (degradation)
Research with many unsourced claims lacks rigor and trustworthiness.

When unsourced_claims > 3 [state] AND claims_made > 0 [state]
Then research_viability *= 0.40

> trigger: More than 3 claims made without source attribution.
> rule: Every assertion must be traceable. Unsourced claims undermine research integrity.
> shift: Research viability drops significantly. Agent must add citations.
> effect: Research viability reduced to 40%.

## rule-003: Source Diversity (advantage)
Consulting many diverse sources produces higher quality research.

When sources_consulted > 10 [state] AND unsourced_claims == 0 [state]
Then research_viability *= 1.25

> trigger: 10+ sources consulted with zero unsourced claims.
> rule: Diverse, well-cited research is the gold standard.
> shift: Research viability improves. Findings are well-supported.
> effect: Research viability boosted by 25%.

## rule-004: Low Source Coverage (degradation)
Making many claims from few sources indicates shallow research.

When claims_made > 10 [state] AND sources_consulted < 3 [state]
Then research_viability *= 0.50

> trigger: 10+ claims from fewer than 3 sources — research is too narrow.
> rule: Good research requires multiple perspectives and cross-referencing.
> shift: Research viability degrades. Agent should broaden its sources.
> effect: Research viability reduced to 50%.

# Gates

- RIGOROUS: research_viability >= 85
- SOLID: research_viability >= 60
- DEVELOPING: research_viability >= 35
- WEAK: research_viability > 10
- UNRELIABLE: research_viability <= 10

# Outcomes

## research_viability
- type: number
- range: 0-100
- display: percentage
- label: Research Viability
- primary: true

## sources_consulted
- type: number
- range: 0-10000
- display: integer
- label: Sources Consulted

## unsourced_claims
- type: number
- range: 0-10000
- display: integer
- label: Unsourced Claims
