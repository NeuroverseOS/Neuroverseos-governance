# NeuroverseOS — Pricing & Profit Margin Spec

> Target: **40% minimum profit margin** after AI/infrastructure costs
> Rule: If we can't hit 40% on a feature, we don't ship it (or we redesign it)

---

## AI Cost Reality Check (March 2026 pricing)

| Model | Input (per 1M tokens) | Output (per 1M tokens) | Typical call cost |
|-------|----------------------|------------------------|-------------------|
| Claude Sonnet | $3.00 | $15.00 | $0.01–0.05 |
| Claude Haiku | $0.25 | $1.25 | $0.001–0.005 |
| Claude Opus | $15.00 | $75.00 | $0.05–0.30 |
| GPT-4o | $2.50 | $10.00 | $0.01–0.04 |
| GPT-4o-mini | $0.15 | $0.60 | $0.001–0.003 |

**Key insight:** Most of our apps need Haiku/Sonnet-class models, not Opus. The governance engine is deterministic (zero AI cost for evaluation). AI is only needed at ingestion and suggestion steps.

---

## Per-App Margin Analysis

### App 1: Unsaid (Communication Translator)

**What costs money:** One LLM call per translation (sender lens + receiver lens + message).

| Metric | Value |
|--------|-------|
| AI cost per translation | ~$0.02 (Sonnet) or ~$0.003 (Haiku) |
| Infrastructure/hosting | ~$0.001 per request |
| **Total cost per translation** | **$0.003–0.02** |

**Pricing model: Credits**
- $5 unlock fee (one-time) → gives 20 free translations
- $2.99 for 50 credits (translations) after that
- Cost per credit: $0.06
- AI cost per credit: $0.02 (Sonnet) max
- **Gross margin per credit: 67%** ✅ (exceeds 40%)
- Even at Haiku pricing ($0.003/call): **margin jumps to 95%**

**Volume play:** Unsaid is the viral funnel. Even if some users only pay $5, they bring 10 friends who each pay $5. The math works because:
- 1M translations/month × $0.003 (Haiku) = $3,000 AI cost
- 1M translations/month at $0.06/credit = $60,000 revenue
- **Margin: 95%** at scale with Haiku

**When to use Sonnet vs Haiku:**
- Default: Haiku (fast, cheap, good enough for generational translations)
- Premium "Deep Translation" mode: Sonnet (nuanced, multi-layer analysis)
- Users don't choose — the product decides based on complexity

---

### App 2: Belief Arena (Lenses Webapp)

**What costs money:** One LLM call per daily lens perspective + context integration.

| Metric | Value |
|--------|-------|
| AI cost per daily perspective | ~$0.03 (Sonnet, with calendar context) |
| AI cost per deep dive | ~$0.05 (Sonnet, longer output) |
| Infrastructure + calendar API | ~$0.005/day |
| **Total cost per active user/day** | **$0.035–0.055** |

**Pricing model: Subscription**
- $4.99/month (single lens, 1 daily perspective)
- $9.99/month (unlimited lenses, multiplayer view, deep dives)
- Assume average user hits the AI 1.5x/day

| Plan | Revenue/month | Cost/month (per user) | Margin |
|------|--------------|----------------------|--------|
| Basic ($4.99) | $4.99 | $1.05 (30 days × $0.035) | **79%** ✅ |
| Pro ($9.99) | $9.99 | $2.48 (30 days × avg $0.055 × 1.5 calls) | **75%** ✅ |

**Risk:** Power users who hit it 10x/day. Mitigation: rate limit deep dives to 5/day on Pro. That caps cost at $7.50/month — still 25% margin on $9.99, and these users are rare.

---

### App 3: Align (Leadership Strategy Engine)

**What costs money:**
- **Ingestion (one-time):** Parsing strategy docs → world file. Heavy AI use. ~$0.50–2.00 per onboarding depending on doc size.
- **Document checks (daily use):** Guard engine evaluation is **deterministic — zero AI cost.** The engine evaluates rules, not prompts. Only the "Fix it" suggestion step uses AI (~$0.05/suggestion).
- **The "Fix it" button:** Sonnet call to suggest edits. ~$0.05 per use.

| Metric | Value |
|--------|-------|
| Onboarding AI cost (one-time) | $0.50–2.00 |
| Document check (guard engine) | $0.00 (deterministic) |
| "Fix it" suggestion | ~$0.05 |
| Infrastructure/month | ~$2.00/user |

**Pricing model: Value-based tiers**

| Tier | Price | What you get | Avg AI cost/month | Margin |
|------|-------|-------------|-------------------|--------|
| Starter | $29/month | 1 strategy, 20 doc checks, 5 fix-its | $2.25 | **92%** ✅ |
| Team | $99/month (5 seats) | 3 strategies, unlimited checks, 50 fix-its, dashboard | $6.50 | **93%** ✅ |
| Enterprise | $499/month (25 seats) | Unlimited everything, SSO, API access, custom rules | $30.00 | **94%** ✅ |

**Why margins are insane:** The core product (document alignment checking) uses the deterministic governance engine. No AI call needed. The AI only fires at onboarding and when users explicitly ask for suggestions. Most daily usage = zero marginal AI cost.

**This is the money printer.** A VP checking a $500K vendor proposal against their strategy doesn't blink at $99/month. The value-to-price ratio is absurd from their perspective.

---

### App 4: Split (Friend Group Governance)

**What costs money:** Governance engine evaluations (deterministic, free) + AI for natural language proposal parsing.

| Metric | Value |
|--------|-------|
| AI cost per proposal (parsing input) | ~$0.01 (Haiku) |
| Governance evaluation | $0.00 (deterministic) |
| Infrastructure per group/month | ~$0.50 |
| **Total cost per active group/month** | **$0.50–1.50** |

**Pricing model: Freemium → Group subscription**
- Free: 1 group, 10 proposals/month
- $3.99/month: unlimited groups, unlimited proposals, payment link generation
- Cost per paying group: ~$1.50/month
- **Margin: 62%** ✅

---

### App 5: Tribe Finder

**What costs money:** Heavy AI for profile matching + LinkedIn API costs.

| Metric | Value |
|--------|-------|
| AI cost per match generation | ~$0.15 (Sonnet, analyzing 50 profiles) |
| AI cost per connection path | ~$0.03 |
| LinkedIn API overhead | $0.00 (free tier covers it) |
| Infrastructure | ~$1.00/user/month |
| **Total cost per user/month** | **$1.50–3.00** |

**Pricing model: One-time reveal + subscription**
- $9.99 one-time: Your first 50 matches + connection map
- $4.99/month: refreshed matches, new connections, expanded network
- **One-time margin: 70–85%** ✅
- **Subscription margin: 40–67%** ✅ (depends on refresh frequency)

---

## Summary: 40% Margin Scorecard

| App | Pricing | AI Cost/User/Month | Revenue/User/Month | Gross Margin | Status |
|-----|---------|-------------------|-------------------|--------------|--------|
| **Unsaid** | Credits ($0.06/use) | $0.003–0.02 | Variable | **67–95%** | ✅ CLEAR |
| **Belief Arena** | $4.99–9.99/mo | $1.05–2.48 | $4.99–9.99 | **75–79%** | ✅ CLEAR |
| **Align** | $29–499/mo | $2.25–30.00 | $29–499 | **92–94%** | ✅ CLEAR |
| **Split** | $3.99/mo | ~$1.50 | $3.99 | **62%** | ✅ CLEAR |
| **Tribe Finder** | $9.99 + $4.99/mo | $1.50–3.00 | $4.99–9.99 | **40–85%** | ✅ BORDERLINE |

**Every app clears 40%.** Align is the standout — deterministic evaluation means near-zero marginal AI costs for the core product loop.

---

## Margin Protection Rules

1. **Default to the cheapest model that works.** Haiku for simple tasks, Sonnet for nuanced ones, Opus never (unless user explicitly pays for premium tier).
2. **Cache aggressively.** Same translation request = cached result, zero AI cost. Same document checked twice = cached verdict.
3. **Rate limit, don't price-gate.** Power users hit limits, not paywalls. This feels fairer and caps our cost exposure.
4. **Deterministic where possible.** The governance engine evaluates rules without AI. Every feature that can use rule evaluation instead of AI prompting should.
5. **No free tiers that bleed money.** Every free tier must have hard usage caps that keep per-user cost under $0.50/month. If they love it, they pay.
6. **Monitor cost-per-user weekly.** Any user costing more than their revenue gets flagged. Adjust rate limits or pricing before it becomes a pattern.

---

## The Big Picture

**Total addressable revenue at 10K paying users across all apps:**

| App | Users | Avg Revenue/User/Mo | Monthly Revenue | Monthly AI Cost | Monthly Profit |
|-----|-------|-------------------|-----------------|-----------------|----------------|
| Unsaid | 5,000 | $3.50 | $17,500 | $1,500 | $16,000 |
| Belief Arena | 2,000 | $7.50 | $15,000 | $3,000 | $12,000 |
| Align | 500 | $150 | $75,000 | $4,000 | $71,000 |
| Split | 2,000 | $3.99 | $7,980 | $3,000 | $4,980 |
| Tribe Finder | 500 | $7.50 | $3,750 | $1,500 | $2,250 |
| **Total** | **10,000** | | **$119,230** | **$13,000** | **$106,230** |

**Blended margin: 89%.** Well above your 40% target.

**Align alone at 500 users = $71K/month profit.** That's the priority.

---

## What Could Kill Margins

1. **Model price increases** — Unlikely (prices have only dropped), but hedge by supporting multiple providers
2. **Abuse/scraping** — Rate limiting + $5 unlock fees prevent bot abuse
3. **Over-engineering AI into deterministic flows** — If the governance engine can evaluate it with rules, DON'T use an LLM. This is the #1 margin protector.
4. **Free tier generosity** — Every free user costs money. Be generous with trials, stingy with ongoing free access.
5. **Opus usage creep** — Never default to Opus. It's 5x the cost of Sonnet for marginal quality improvement in most use cases.
