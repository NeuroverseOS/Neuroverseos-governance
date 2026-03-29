# NeuroverseOS — Pricing & Profit Margin Spec

> **One rule:** Cost us X to run, charge enough to clear 40% margin. That's it.
> No enterprise tiers. No $499 plans. Credits priced per job based on what it actually costs us.

---

## AI Cost Per Call (what we actually pay)

| Model | Typical cost per call | When we use it |
|-------|----------------------|----------------|
| Haiku | $0.001–0.005 | Simple stuff — translations, parsing, short answers |
| Sonnet | $0.01–0.05 | Heavier analysis — doc ingestion, deep suggestions |
| Governance engine | $0.00 | Rule evaluation, alignment checks — no AI, deterministic |

---

## The Formula

```
Credit price = AI cost ÷ 0.60
```

That's it. If it costs us $0.03 to run, we charge $0.05. We keep 40%, AI eats 60%. Simple.

---

## Credit Pricing Per App

Users buy a universal credit wallet. Credits cost different amounts per action because different jobs cost us different amounts to run.

### How users buy credits

| Pack | Price | Credits |
|------|-------|---------|
| Starter | $2.99 | 50 credits |
| Regular | $4.99 | 100 credits |
| Bulk | $9.99 | 250 credits |

**1 credit ≈ $0.05–0.06 depending on pack size.** Bulk buyers get a slight discount — still clears 40%.

---

### What each action costs (in credits)

#### Unsaid (Communication Translator)
| Action | Our AI cost | Credits charged | We collect | Our margin |
|--------|------------|----------------|------------|------------|
| Quick translate (Haiku) | $0.003 | 1 credit ($0.05) | $0.047 | 94% |
| Deep translate (Sonnet) | $0.02 | 1 credit ($0.05) | $0.03 | 60% |
| Group chat decode | $0.04 | 2 credits ($0.10) | $0.06 | 60% |

**Avg margin: ~70%** — way above 40%.

#### Belief Arena (Daily Lens)
| Action | Our AI cost | Credits charged | We collect | Our margin |
|--------|------------|----------------|------------|------------|
| Daily perspective | $0.03 | 1 credit ($0.05) | $0.02 | 40% |
| Deep dive on a topic | $0.05 | 2 credits ($0.10) | $0.05 | 50% |
| Multi-lens comparison (5 lenses) | $0.08 | 3 credits ($0.15) | $0.07 | 47% |

**Avg margin: ~45%** — clears 40%.

#### Align (Strategy Checker)
| Action | Our AI cost | Credits charged | We collect | Our margin |
|--------|------------|----------------|------------|------------|
| Upload & parse strategy doc (one-time) | $0.50 | 15 credits ($0.75) | $0.25 | 33%* |
| Upload & parse large doc set | $1.50 | 40 credits ($2.00) | $0.50 | 25%* |
| Check doc against strategy (governance engine) | $0.00 | 1 credit ($0.05) | $0.05 | 100% |
| "Fix it" — AI suggests edits | $0.05 | 2 credits ($0.10) | $0.05 | 50% |
| Full alignment report | $0.08 | 3 credits ($0.15) | $0.07 | 47% |

*Onboarding is a loss leader — it costs us more but it's one-time. Users who onboard then run 50+ doc checks at $0.00 AI cost each. **Blended margin across a typical user's lifecycle: ~80%+** because most usage is the free governance engine check.

#### Split (Group Decisions)
| Action | Our AI cost | Credits charged | We collect | Our margin |
|--------|------------|----------------|------------|------------|
| Parse a proposal | $0.01 | 1 credit ($0.05) | $0.04 | 80% |
| Governance evaluation | $0.00 | 0 credits (free) | — | — |
| Generate compromise suggestion | $0.03 | 1 credit ($0.05) | $0.02 | 40% |
| Payment link generation | $0.00 | 0 credits (free) | — | — |

**Avg margin: ~60%.** Governance evaluations are free to run — that's the whole point of deterministic rules.

#### Tribe Finder
| Action | Our AI cost | Credits charged | We collect | Our margin |
|--------|------------|----------------|------------|------------|
| Generate your 50 matches | $0.15 | 5 credits ($0.25) | $0.10 | 40% |
| Map connection paths | $0.03 | 1 credit ($0.05) | $0.02 | 40% |
| Refresh matches (monthly) | $0.10 | 3 credits ($0.15) | $0.05 | 33%* |

*Refresh is thin but it keeps users active and buying credits for other apps.

---

## Margin Summary

| App | Avg margin per action | Why |
|-----|----------------------|-----|
| **Unsaid** | ~70% | Haiku is dirt cheap, most translations are simple |
| **Belief Arena** | ~45% | Sonnet needed for quality, but still clears 40% |
| **Align** | ~80% blended | Governance engine = $0 AI cost for core checks |
| **Split** | ~60% | Governance engine + Haiku = cheap |
| **Tribe Finder** | ~40% | Heaviest AI usage, tightest margins |

**Every app clears 40%.** Some way over, some right at the line. That's fine — the portfolio averages out.

---

## What This Looks Like For Users

A normal person using Unsaid casually: **$2.99 gets them 50 translations.** That lasts weeks.

A team lead using Align: **$4.99 gets them 100 credits.** That's 1 strategy upload + ~85 document checks. Could last months since checks are 1 credit each.

A friend group on Split: **$2.99 split 5 ways = $0.60/person** for 50 group proposals. Basically free.

Someone on Tribe Finder: **$2.99 gets them their 50 matches + 9 connection path lookups.** One-time cost for most people.

**Nobody is paying $150/month for anything.** They buy a $3–10 credit pack when they need it and it lasts.

---

## Margin Protection Rules

1. **Haiku first, always.** Only use Sonnet when the job genuinely needs it.
2. **Cache everything.** Same input = cached output, zero cost.
3. **Governance engine over AI.** If rules can evaluate it, don't call an LLM.
4. **No subscriptions.** Credits only. Users pay for what they use. We never eat cost on inactive subscribers.
5. **If a feature can't clear 40% margin at the credit price users will actually pay, redesign the feature or don't ship it.**

---

## Revenue Projection (10K active users)

Assume average user buys $5/month in credits across all apps:

| Metric | Value |
|--------|-------|
| Active users | 10,000 |
| Avg spend/user/month | $5.00 |
| Monthly revenue | $50,000 |
| Avg blended AI cost (40% of revenue) | $20,000 |
| Infrastructure (servers, CDN, etc.) | ~$2,000 |
| **Monthly profit** | **$28,000** |
| **Profit margin** | **56%** |

At 50K users: **$140K/month profit.** At 100K users: **$280K/month.**

The math is simple because the pricing is simple.
