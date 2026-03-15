---
world_id: autoresearch
name: Autoresearch Governance
version: 1.0.0
runtime_mode: SIMULATION
default_profile: conservative
alternative_profile: exploratory
---

# Thesis

Autonomous AI research loops must operate within structured governance: experiments are reproducible, metrics are tracked, compute budgets are enforced, and agents cannot drift beyond their declared research context. A research world without constraints produces noise, not knowledge.

# Invariants

- `experiments_must_be_reproducible` — Every experiment must log architecture, hyperparameters, dataset, and training config sufficient to reproduce results (structural, immutable)
- `metrics_must_be_recorded` — Every training run must produce at least one evaluation metric; runs without metrics are invalid (structural, immutable)
- `dataset_must_be_declared` — The dataset used for training and evaluation must be explicitly declared and never changed without governance approval (structural, immutable)
- `goal_must_be_defined` — The optimization goal (metric + direction) must be defined before any experiment runs (structural, immutable)
- `no_data_leakage` — Training data must never contaminate evaluation data; train/val/test splits must be fixed (structural, immutable)
- `compute_budget_enforced` — Experiments must respect declared compute limits; exceeding budget halts the loop (structural, immutable)
- `architecture_constraints_honored` — If the research context declares architectural constraints, experiments must satisfy them (prompt, immutable)

# State

## experiments_run
- type: number
- min: 0
- max: 10000
- step: 1
- default: 0
- label: Experiments Run
- description: Total number of experiments completed in this research loop

## best_metric_value
- type: number
- min: -1000
- max: 1000
- step: 0.01
- default: 100
- label: Best Metric Value
- description: Best value achieved for the primary evaluation metric

## keep_rate
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: Keep Rate
- description: Percentage of experiments that improved upon the previous best result

## compute_used_minutes
- type: number
- min: 0
- max: 100000
- step: 1
- default: 0
- label: Compute Used (minutes)
- description: Total wall-clock training time consumed across all experiments

## compute_budget_minutes
- type: number
- min: 0
- max: 100000
- step: 60
- default: 1440
- label: Compute Budget (minutes)
- description: Maximum allowed wall-clock training time for the research loop

## research_context_drift
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: Context Drift
- description: Degree to which recent experiments have diverged from the declared research context. 0 = on-topic. 100 = unrelated.

## metric_improvement_rate
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: Improvement Rate
- description: Rate of metric improvement over the last 10 experiments. 0 = stagnant. 100 = rapid improvement.

## failed_experiments
- type: number
- min: 0
- max: 10000
- step: 1
- default: 0
- label: Failed Experiments
- description: Number of experiments that crashed, timed out, or produced no valid metrics

# Assumptions

## conservative
- name: Conservative Research
- description: Prioritize reproducibility and careful iteration. Small architectural changes per experiment. Strict compute limits. Reject experiments that drift from the research context.
- iteration_style: incremental
- drift_tolerance: low
- compute_strictness: high
- failure_tolerance: low

## exploratory
- name: Exploratory Research
- description: Allow broader architectural exploration. Larger jumps between experiments. More lenient compute budget. Accept higher context drift if metrics improve.
- iteration_style: explorative
- drift_tolerance: moderate
- compute_strictness: moderate
- failure_tolerance: moderate

# Rules

## rule-001: Compute Budget Exhausted (structural)
When compute budget is exceeded, the research loop must halt. No further experiments are allowed.

When compute_used_minutes > compute_budget_minutes [state]
Then research_viability *= 0.00
Collapse: research_viability < 0.05

> trigger: Compute usage exceeds declared budget — no training time remains.
> rule: Unbounded compute makes research ungovernable. The budget is a hard constraint, not a suggestion.
> shift: Research loop halts. Final results are reported. No new experiments start.
> effect: Research viability set to zero. Loop terminated.

## rule-002: High Failure Rate (degradation)
Too many failed experiments indicate a systemic problem — bad code, misconfigured environment, or impossible architecture.

When failed_experiments > 5 [state] AND experiments_run > 0 [state]
Then research_viability *= 0.50

> trigger: More than 5 experiments have failed — possible systemic issue.
> rule: Failures consume compute without producing knowledge. High failure rates signal infrastructure problems, not research progress.
> shift: Research viability degrades. Agent should investigate root cause before continuing.
> effect: Research viability reduced to 50%.

## rule-003: Context Drift Warning (degradation)
Experiments diverging from the declared research context waste compute and produce irrelevant results.

When research_context_drift > 40 [state]
Then research_viability *= 0.60

> trigger: Context drift above 40% — experiments are straying from the research topic.
> rule: Governance exists to keep research focused. Agents exploring unrelated architectures are not contributing to the declared goal.
> shift: Research viability degrades. Agent must return to the declared research context.
> effect: Research viability reduced to 60%.

## rule-004: Metric Stagnation (degradation)
When experiments stop improving the primary metric, the research approach may need fundamental revision.

When metric_improvement_rate < 5 [state] AND experiments_run > 10 [state]
Then research_viability *= 0.70

> trigger: Improvement rate below 5% after 10+ experiments — research may have plateaued.
> rule: Stagnant metrics indicate diminishing returns from the current approach. The agent should consider a strategy change.
> shift: Research viability degrades. Agent should try a substantially different approach or conclude the loop.
> effect: Research viability reduced to 70%.

## rule-005: Strong Progress (advantage)
Consistent metric improvement validates the research approach and warrants continued investment.

When metric_improvement_rate > 30 [state] AND keep_rate > 20 [state]
Then research_viability *= 1.20

> trigger: Improvement rate above 30% with keep rate above 20% — research is productive.
> rule: Productive research should be encouraged. Strong metric trends indicate a promising research direction.
> shift: Research viability improves. Continued experimentation is well-justified.
> effect: Research viability boosted by 20%.

## rule-006: No Metrics Recorded (structural)
An experiment that produces no evaluation metrics is invalid and must not count as progress.

When experiments_run > 0 [state] AND best_metric_value == 100 [state]
Then research_viability *= 0.30
Collapse: research_viability < 0.05

> trigger: Experiments have run but no metric improvement from default — metrics may not be recording.
> rule: Research without measurement is not research. Every experiment must produce at least one evaluation metric.
> shift: Research viability drops sharply. Agent must fix metric recording before continuing.
> effect: Research viability reduced to 30%.

## rule-007: Efficient Compute Usage (advantage)
High keep rate with low compute usage indicates efficient research methodology.

When keep_rate > 30 [state] AND compute_used_minutes < compute_budget_minutes [state]
Then research_viability *= 1.15

> trigger: Keep rate above 30% with compute budget remaining — efficient experimentation.
> rule: Efficient use of compute demonstrates disciplined research. Not every experiment needs to be expensive.
> shift: Research viability improves. The research methodology is sustainable.
> effect: Research viability boosted by 15%.

# Gates

- BREAKTHROUGH: research_viability >= 90
- PRODUCTIVE: research_viability >= 60
- ONGOING: research_viability >= 35
- STRUGGLING: research_viability > 10
- HALTED: research_viability <= 10

# Outcomes

## research_viability
- type: number
- range: 0-100
- display: percentage
- label: Research Viability
- primary: true

## best_metric_value
- type: number
- range: -1000-1000
- display: decimal
- label: Best Metric Value

## keep_rate
- type: number
- range: 0-100
- display: percentage
- label: Keep Rate

## experiments_run
- type: number
- range: 0-10000
- display: integer
- label: Experiments Run
