---
world_id: trading-agent
name: Trading Agent Governance
version: 1.0.0
runtime_mode: COMPLIANCE
default_profile: conservative
alternative_profile: aggressive
---

# Thesis

Autonomous trading agents that can place orders, manage positions, and interact with financial APIs must operate within strict governance. An ungoverned trading agent can exceed position limits, ignore stop-losses, concentrate risk in a single asset, or trade during restricted periods. Financial governance is not optional — it is a regulatory and fiduciary requirement.

# Invariants

- `position_limits_enforced` — No single position may exceed the declared maximum size (structural, immutable)
- `stop_loss_required` — Every open position must have a defined stop-loss; naked positions are forbidden (structural, immutable)
- `daily_loss_limit_enforced` — Total daily realized + unrealized losses must not exceed the declared limit (structural, immutable)
- `no_restricted_period_trading` — Agent must not place orders during declared restricted trading periods (structural, immutable)
- `no_insider_information_use` — Agent must never trade on material non-public information (structural, immutable)
- `audit_trail_maintained` — Every order, fill, cancellation, and position change must be logged with timestamp and rationale (structural, immutable)

# State

## portfolio_value
- type: number
- min: 0
- max: 100000000
- step: 100
- default: 100000
- label: Portfolio Value
- description: Current total portfolio value in base currency

## daily_pnl
- type: number
- min: -10000000
- max: 10000000
- step: 100
- default: 0
- label: Daily P&L
- description: Realized and unrealized profit/loss for the current trading day

## daily_loss_limit
- type: number
- min: 0
- max: 10000000
- step: 1000
- default: 5000
- label: Daily Loss Limit
- description: Maximum allowable loss in a single trading day

## open_positions
- type: number
- min: 0
- max: 1000
- step: 1
- default: 0
- label: Open Positions
- description: Number of currently open positions

## max_positions
- type: number
- min: 1
- max: 1000
- step: 1
- default: 10
- label: Max Positions
- description: Maximum number of concurrent open positions allowed

## largest_position_pct
- type: number
- min: 0
- max: 100
- step: 1
- default: 0
- label: Largest Position %
- description: Percentage of portfolio in the single largest position

## orders_today
- type: number
- min: 0
- max: 10000
- step: 1
- default: 0
- label: Orders Today
- description: Total orders placed in the current trading day

## positions_without_stop
- type: number
- min: 0
- max: 1000
- step: 1
- default: 0
- label: Positions Without Stop-Loss
- description: Number of open positions with no stop-loss set

# Assumptions

## conservative
- name: Conservative Trading
- description: Small position sizes. Strict stop-losses. Low daily loss tolerance. Maximum diversification.
- max_position_pct: 5
- stop_loss_required: always
- daily_loss_tolerance: strict
- diversification: high

## aggressive
- name: Aggressive Trading
- description: Larger positions allowed. Wider stop-losses. Higher daily loss tolerance. More concentrated bets permitted.
- max_position_pct: 15
- stop_loss_required: always
- daily_loss_tolerance: moderate
- diversification: moderate

# Rules

## rule-001: Daily Loss Limit Breached (structural)
When the daily loss limit is exceeded, all trading must stop immediately.

When daily_pnl < 0 [state] AND daily_loss_limit > 0 [state]
Then trading_viability *= 0.00
Collapse: trading_viability < 0.05

> trigger: Daily P&L loss exceeds the declared daily loss limit.
> rule: Loss limits are absolute constraints. Continued trading after a limit breach amplifies risk.
> shift: Trading halts. All open orders cancelled. Positions held until human review.
> effect: Trading viability set to zero. No new orders allowed.

## rule-002: Position Concentration Risk (degradation)
A single position consuming too much of the portfolio creates concentration risk.

When largest_position_pct > 20 [state]
Then trading_viability *= 0.50

> trigger: Largest single position exceeds 20% of portfolio value.
> rule: Concentration kills portfolios. Diversification is a governance requirement, not a suggestion.
> shift: Trading viability degrades. Agent should reduce the concentrated position.
> effect: Trading viability reduced to 50%.

## rule-003: Naked Positions (structural)
Open positions without stop-losses violate risk management governance.

When positions_without_stop > 0 [state]
Then trading_viability *= 0.30
Collapse: trading_viability < 0.05

> trigger: One or more positions have no stop-loss set.
> rule: Every position must have a defined exit. Naked positions expose the portfolio to unlimited downside.
> shift: Trading viability drops severely. Agent must set stop-losses immediately.
> effect: Trading viability reduced to 30%.

## rule-004: Too Many Positions (degradation)
Exceeding the maximum position count indicates over-trading.

When open_positions > max_positions [state]
Then trading_viability *= 0.60

> trigger: Number of open positions exceeds the declared maximum.
> rule: Position limits prevent portfolio fragmentation and ensure each position is meaningful.
> shift: Trading viability degrades. Agent should close some positions before opening new ones.
> effect: Trading viability reduced to 60%.

## rule-005: Disciplined Trading (advantage)
A session with profitable P&L, proper stop-losses, and reasonable position sizing.

When daily_pnl > 0 [state] AND positions_without_stop == 0 [state] AND largest_position_pct < 15 [state]
Then trading_viability *= 1.20

> trigger: Positive P&L with all risk controls in place.
> rule: Disciplined trading should be rewarded. Profitable days with proper risk management indicate a well-governed agent.
> shift: Trading viability improves. Agent can continue with current strategy.
> effect: Trading viability boosted by 20%.

## rule-006: Conservative Position Sizing (advantage)
Small, well-distributed positions indicate prudent risk management.

When open_positions > 3 [state] AND largest_position_pct < 10 [state] AND positions_without_stop == 0 [state]
Then trading_viability *= 1.15

> trigger: Multiple positions, all small and with stop-losses — textbook diversification.
> rule: Good risk distribution deserves recognition. This is how institutional trading should work.
> shift: Trading viability improves slightly. Portfolio is well-structured.
> effect: Trading viability boosted by 15%.

# Gates

- OPTIMAL: trading_viability >= 90
- HEALTHY: trading_viability >= 60
- CAUTIOUS: trading_viability >= 35
- AT_RISK: trading_viability > 10
- HALTED: trading_viability <= 10

# Outcomes

## trading_viability
- type: number
- range: 0-100
- display: percentage
- label: Trading Viability
- primary: true

## daily_pnl
- type: number
- range: -10000000-10000000
- display: currency
- label: Daily P&L

## open_positions
- type: number
- range: 0-1000
- display: integer
- label: Open Positions

## largest_position_pct
- type: number
- range: 0-100
- display: percentage
- label: Largest Position %
