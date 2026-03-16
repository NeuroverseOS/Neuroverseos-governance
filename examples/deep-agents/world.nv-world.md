---
world_id: deep-agents-demo
name: Deep Agents Demo Governance
version: 1.0.0
runtime_mode: COMPLIANCE
default_profile: standard
alternative_profile: strict
---

# Thesis

This world governs a Deep Agents coding agent. The agent can read files, write code, and run shell commands — but every action passes through NeuroVerse governance first. Destructive commands are blocked. Secret access is denied. Repository boundaries are enforced. This is what governed AI development looks like.

# Invariants

- `no_destructive_commands` — Agent must never execute destructive shell commands (rm -rf, format, dd, etc.) (structural, immutable)
- `no_secret_access` — Agent must never read, copy, or transmit secrets, credentials, or API keys (structural, immutable)
- `no_system_modification` — Agent must not modify files outside the project repository (structural, immutable)
- `no_production_push` — Agent must not push directly to main or production branches (structural, immutable)
- `dependency_approval_required` — Adding or removing dependencies requires explicit approval (prompt, immutable)

# State

## files_modified
- type: number
- min: 0
- max: 10000
- step: 1
- default: 0
- label: Files Modified
- description: Total files modified this session

## commands_blocked
- type: number
- min: 0
- max: 1000
- step: 1
- default: 0
- label: Commands Blocked
- description: Number of commands blocked by governance

## tests_passing
- type: number
- min: 0
- max: 100
- step: 1
- default: 100
- label: Tests Passing
- description: Percentage of tests passing

# Assumptions

## standard
- name: Standard Development
- description: Normal development mode. Read/write project files. Safe shell commands only.
- shell_access: safe_commands
- file_access: project_only

## strict
- name: Strict Mode
- description: All writes require approval. Shell limited to tests.
- shell_access: test_only
- file_access: read_mostly

# Rules

## rule-001: Destructive Command Blocked (structural)
Destructive shell commands are never allowed.

When commands_blocked > 0 [state]
Then session_health *= 0.50

> trigger: A destructive command was attempted and blocked.
> rule: Coding agents must never execute destructive system commands.
> shift: Session health degrades. Agent behavior is flagged.
> effect: Session health reduced by 50%.

## rule-002: Clean Development (advantage)
Productive changes with no blocked commands indicate healthy behavior.

When files_modified > 0 [state] AND commands_blocked == 0 [state] AND tests_passing > 85 [state]
Then session_health *= 1.20

> trigger: Agent is productive with zero governance violations.
> rule: Well-behaved agents should be recognized.
> shift: Session health improves.
> effect: Session health boosted by 20%.

# Gates

- HEALTHY: session_health >= 80
- CAUTIOUS: session_health >= 50
- RESTRICTED: session_health > 20
- TERMINATED: session_health <= 20

# Outcomes

## session_health
- type: number
- range: 0-100
- display: percentage
- label: Session Health
- primary: true
