# Align Hypothetical: Meridian Industrial Technologies

> Fortune 1000 industrial manufacturer. $4.2B revenue. 12,000 employees.
> Makes precision components for aerospace, automotive, and energy.
> Headquarters: Cleveland, OH. 14 manufacturing facilities globally.

---

## Step 1: What They Upload

Sarah Chen, VP of Strategy, drags these files into Align:

### Document 1: "Meridian 2027 Strategy" (PDF, 28 pages)
Key excerpts the AI will extract from:
- "Grow aerospace revenue from 35% to 50% of total by 2027"
- "Reduce dependency on automotive sector (currently 45% of revenue)"
- "Acquire 2-3 precision manufacturing companies in the $50M-200M range"
- "Invest $180M in automation over 3 years to reduce per-unit cost by 15%"
- "Expand into defense/military precision components (new vertical)"
- "No facility closures — retool existing plants, don't shut them down"
- "Maintain investment-grade credit rating (currently BBB+)"

### Document 2: "Meridian Culture & Values" (Word doc, 6 pages)
Key excerpts:
- "Safety is non-negotiable. Zero harm. No exceptions."
- "We promote from within. External executive hires require board approval."
- "Engineering excellence over speed-to-market. We'd rather be late than wrong."
- "Every plant is a community. Layoffs are a last resort after retraining."
- "Sustainability targets: 30% carbon reduction by 2028"
- "Supplier relationships are partnerships, not transactions. Minimum 3-year contracts."

### Document 3: "Meridian Org Model" (PDF, 12 pages)
- CEO → 4 Division Presidents (Aerospace, Automotive, Energy, Defense-new)
- Each Division: VP Operations, VP Engineering, VP Sales, Plant Managers
- Corporate: CFO, CHRO, CLO, VP Strategy, VP M&A
- 14 Plant Managers report to Division VP Operations
- Engineering teams organized by capability (machining, casting, assembly, testing)
- Decision authority matrix: who can approve what at what dollar threshold

### Document 4: "Engineering Team Charter" (2 pages)
- "No design change ships without simulation validation + physical test"
- "Tolerance standards: aerospace = AS9100, automotive = IATF 16949, energy = API"
- "New materials require 6-month qualification process. No shortcuts."
- "Engineers own their designs through production. No wall between design and manufacturing."

---

## Step 2: What the System Does

### Conflict Detection (Phase 1)

Align compares all 4 documents. Finds:

**Hard Conflict:**
```
⚠️ Strategy says: "Invest $180M in automation to reduce per-unit cost by 15%"
   Culture says: "Every plant is a community. Layoffs are a last resort after retraining."

   Automation at this scale typically reduces headcount 10-20%.
   Your strategy doesn't mention workforce impact. Your culture says layoffs are last resort.

   Which takes priority?
   ○ Automation proceeds — retraining budget included, no layoffs without retraining first
   ○ Automation proceeds — headcount reduction is acceptable if voluntary/attrition-based
   ○ Scale back automation to levels that don't require headcount changes
   ○ Let me update these docs to address this
```

**Soft Tensions (noted, not blocking):**
```
💡 Tension: Strategy says "grow aerospace to 50% of revenue" + "expand into defense"
   Both require aerospace-grade engineering talent. Your org model shows ONE aerospace
   engineering team. Scaling two high-precision verticals simultaneously with one team
   creates resource tension.

   We'll track this and flag proposals that stretch the aerospace engineering team
   across both divisions without addressing capacity.
```

```
💡 Tension: Culture says "engineering excellence over speed-to-market" +
   Strategy says "acquire 2-3 companies in 3 years."
   Acquisitions typically pressure speed-to-integration. Your culture values
   thoroughness. We'll flag integration plans that prioritize speed over
   engineering alignment.
```

Sarah resolves the hard conflict: "Automation proceeds — retraining budget included, no layoffs without retraining first." This becomes a priority rule in the world file.

### World File Generated (Phase 2)

Align builds the governance world file. Sarah sees:

```
✅ Your alignment engine is ready.

   Strategy rules:    8 guards extracted
   Culture values:    6 values with behavioral indicators
   Red lines:         4 non-negotiables
   Priorities:        7 ranked priorities
   Roles:             14 role types with decision authority
   Sub-models:        1 (Engineering team charter)
   Tensions tracked:  2

   Source documents: 4 files, all rules traced to specific sections.
```

---

## Step 3: Mode 1 — "Does This Document Align?"

Sarah's colleague drops in a document:

**"Q4 Proposal: Outsource Casting Operations to Jabil (Mexico)"** (8 pages)

The proposal argues: outsourcing casting to Jabil saves $12M/year, reduces facility overhead, allows Meridian to focus on higher-value machining and assembly.

### What the AI analyzes:

The AI reads the proposal against every rule in Meridian's world file. Here's what it's actually evaluating — this is the transparency:

```
For each rule in your world file, the AI asks:
"Does this proposal's INTENT and ACTIONS align with, drift from,
or conflict with this specific rule?"

It's checking YOUR stated rules against THIS document.
It is NOT predicting whether outsourcing will succeed or fail.
It IS telling you where this proposal contradicts what you said matters.
```

### Verdict: CONFLICT (47% aligned)

```
┌──────────────────────────────────────────────────┐
│ 🎯 Alignment Check                      1 cr ↗   │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌────────────────────────────────┐              │
│  │   ● CONFLICT       47% aligned │              │
│  └────────────────────────────────┘              │
│                                                  │
│  Strategy alignment:     ██████░░░░ 62%          │
│  Culture alignment:      ███░░░░░░░ 31%          │
│                                                  │
│  ❌ CONFLICTS (4)                                 │
│                                                  │
│  1. Culture: "Supplier relationships are          │
│     partnerships, not transactions."             │
│     Proposal: Outsources to Jabil on a           │
│     cost-reduction basis. No mention of           │
│     partnership terms, minimum contract           │
│     length, or relationship investment.           │
│     → Your culture says min 3-year contracts.     │
│       This proposal frames Jabil as a vendor,    │
│       not a partner.                             │
│                                                  │
│  2. Culture: "Every plant is a community.         │
│     Layoffs are a last resort after retraining." │
│     Proposal: Closing the Akron casting facility │
│     affects ~180 workers. Proposal mentions       │
│     "workforce transition" but no retraining      │
│     plan, no timeline, no budget.                │
│     → Your resolved conflict rule requires        │
│       retraining budget before any automation/    │
│       consolidation. This proposal has none.     │
│                                                  │
│  3. Engineering charter: "Engineers own their     │
│     designs through production."                 │
│     Proposal: Casting moves to Jabil (Mexico).   │
│     Meridian engineers lose direct oversight of   │
│     the casting process. No mention of how        │
│     engineering maintains ownership.              │
│                                                  │
│  4. Red line: "Safety is non-negotiable."         │
│     Proposal: No safety audit plan for Jabil     │
│     facility. No mention of how Meridian's        │
│     safety standards transfer to outsourced       │
│     operations.                                  │
│                                                  │
│  ⚠️ GAPS (2)                                      │
│                                                  │
│  5. Strategy: "Maintain investment-grade credit   │
│     rating (BBB+)."                              │
│     Proposal: $12M savings cited but no analysis │
│     of one-time transition costs, contract        │
│     obligations, or impact on credit metrics.    │
│                                                  │
│  6. Strategy: "No facility closures — retool      │
│     existing plants."                            │
│     Proposal: Effectively closes Akron casting.  │
│     Calls it "consolidation" but the result is   │
│     the same — Akron casting stops.              │
│     → This may be LIP SERVICE. Uses softer       │
│       language ("consolidate") for what your      │
│       strategy explicitly prohibits ("closure"). │
│                                                  │
│  ✅ ALIGNED (3)                                    │
│                                                  │
│  7. Strategy: "Reduce per-unit cost by 15%."      │
│     Proposal directly addresses cost reduction.  │
│                                                  │
│  8. Strategy: "Focus on higher-value activities." │
│     Proposal argues casting is lower-value.      │
│                                                  │
│  9. Strategy: "Invest in automation."             │
│     Proposal frees capital for automation in      │
│     retained operations.                         │
│                                                  │
├──────────────────────────────────────────────────┤
│  ✏️ Rewrite (2cr)   📥 PDF (3cr)   📤 Share     │
└──────────────────────────────────────────────────┘
```

### What the user actually got:

Not a prediction of whether outsourcing will work. A **map of where this proposal contradicts their own stated strategy and culture.** Specifically:
- 4 conflicts with rules they defined
- 1 lip service detection (calling a closure a "consolidation")
- 2 gaps where the proposal doesn't address things their strategy requires
- 3 genuine alignments

Sarah can now go back to the proposal author and say: "Your proposal conflicts with 4 of our governance rules. Fix these before it goes to the executive team." That's the value.

---

## Step 4: Mode 2 — "What If I Do X in This World?"

Sarah types into the open-ended input:

> "What if we acquire a $150M precision casting company in Germany instead of outsourcing to Jabil?"

### What the AI evaluates:

```
The AI takes your question and checks it against every rule in your world file.
It's asking: "Does THIS action align with, drift from, or conflict with
each of Meridian's stated rules?"

This is not a market analysis. Not a valuation. Not due diligence.
It's a GOVERNANCE CHECK: does this action match what you said you'd do?
```

### Result:

```
┌──────────────────────────────────────────────────┐
│ 🎯 "What if?" Check                     1 cr ↗   │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌────────────────────────────────────┐          │
│  │   ● ALIGN          81% aligned     │          │
│  └────────────────────────────────────┘          │
│                                                  │
│  ✅ Strategy: "Acquire 2-3 precision              │
│     manufacturing companies $50M-200M range"     │
│     → $150M German casting company fits.         │
│                                                  │
│  ✅ Culture: "Supplier relationships are           │
│     partnerships" → Acquisition IS the            │
│     relationship. Stronger than outsourcing.     │
│                                                  │
│  ✅ Culture: "No facility closures" → Akron       │
│     stays open. New facility ADDS capacity.      │
│                                                  │
│  ✅ Engineering: "Engineers own designs through    │
│     production" → Meridian-owned facility means  │
│     full engineering oversight.                  │
│                                                  │
│  ⚠️ Strategy: "Maintain BBB+ credit rating"       │
│     → $150M acquisition impacts balance sheet.   │
│     Your strategy requires investment-grade      │
│     maintenance. This needs CFO analysis.        │
│                                                  │
│  ⚠️ Culture: "Promote from within. External       │
│     executive hires require board approval."     │
│     → German acquisition likely brings external  │
│     leadership. Board approval needed.           │
│                                                  │
│  ⚠️ Tension triggered: Engineering capacity       │
│     → German acquisition adds casting capacity   │
│       but also adds integration workload for     │
│       your already-stretched aerospace           │
│       engineering team.                          │
│                                                  │
│  Net: Stronger alignment than Jabil outsourcing  │
│  (81% vs 47%). 3 items need addressing but none  │
│  are conflicts — they're gaps requiring analysis.│
│                                                  │
└──────────────────────────────────────────────────┘
```

### What the user got:

"The German acquisition aligns with your strategy much better than Jabil outsourcing (81% vs 47%). But here are 3 things you need to address: credit rating impact, board approval for German leadership, and your engineering team capacity tension."

This is actionable. This is traceable. This is honest.

---

## Step 5: Mode 3 — "Show Me Cascading Effects"

Sarah taps "Simulate cascade" on the Jabil outsourcing proposal.

**Pre-confirmation:**
```
┌──────────────────────────────────────────┐
│ Run cascade analysis?                    │
│                                          │
│ Rules to evaluate: 15                    │
│ Steps: 5 (cascading effects)             │
│ Cost: 2 credits ($0.10)                  │
│                                          │
│     [Cancel]    [Run →]                  │
└──────────────────────────────────────────┘
```

### What "cascading effects" actually means:

```
This is NOT a prediction of what happens in the real world.
This traces how ONE rule violation triggers OTHER rules in YOUR governance.

Think of it as: "If you violate rule A, what other rules does that
put pressure on?" It's a CONSISTENCY analysis, not a forecast.
```

### Result:

```
┌──────────────────────────────────────────────────┐
│ 🔗 Cascade Analysis                     2 cr ↗   │
├──────────────────────────────────────────────────┤
│                                                  │
│  Starting point: Outsource casting to Jabil      │
│                                                  │
│  Step 1: "No facility closures" violated         │
│     ↓ triggers                                   │
│  Step 2: "Every plant is a community" violated   │
│     → 180 workers at Akron affected              │
│     → Retraining rule triggered (from your       │
│       conflict resolution)                       │
│     → No retraining plan in proposal = BLOCKED   │
│     ↓ triggers                                   │
│  Step 3: "Promote from within" under pressure    │
│     → If Akron workers are let go, you lose      │
│       internal talent pipeline for casting       │
│     → Future casting leadership must come from   │
│       outside (violates promote-from-within)     │
│     ↓ triggers                                   │
│  Step 4: "Engineering owns designs through       │
│     production" breaks for casting               │
│     → Engineers lose direct casting oversight     │
│     → Quality control shifts to Jabil's process  │
│     → Engineering charter requires sim +          │
│       physical test — who owns this at Jabil?    │
│     ↓ triggers                                   │
│  Step 5: "Safety is non-negotiable" at risk      │
│     → Meridian safety standards must transfer    │
│     → No audit plan for Jabil facility           │
│     → Red line exposure: if Jabil has a safety   │
│       incident, it's on Meridian's record        │
│                                                  │
│  ── Summary ───────────────────────────────────  │
│                                                  │
│  1 rule violation cascades into 4 additional     │
│  governance conflicts. The Jabil proposal        │
│  doesn't just conflict with cost strategy —      │
│  it creates a chain reaction through your        │
│  culture, workforce, engineering, and safety     │
│  governance.                                     │
│                                                  │
│  This is what your rules say. Not a prediction   │
│  — a consistency check against your own values.  │
│                                                  │
├──────────────────────────────────────────────────┤
│  🔄 Try different proposal                       │
│  ✏️ Adjust a rule and re-run (1cr)               │
│  📥 PDF report (3cr)                             │
└──────────────────────────────────────────────────┘
```

---

## Step 6: Mode 4 — "Change Something and Re-Run"

Sarah thinks: "What if we loosen the 'no facility closures' rule to allow closures WITH a transition plan?"

She taps "Adjust a rule and re-run." Sees her current rules:

```
┌──────────────────────────────────────────────────┐
│ Adjust rules and re-simulate          1 cr ↗     │
├──────────────────────────────────────────────────┤
│                                                  │
│  Current rule:                                   │
│  "No facility closures — retool existing plants" │
│  Enforcement: BLOCK                              │
│  Source: Meridian 2027 Strategy, page 14         │
│                                                  │
│  Change to:                                      │
│  ○ Keep as-is (hard block)                       │
│  ○ Allow closures with 12-month transition plan  │
│     and retraining budget (warn, not block)      │
│  ○ Allow closures for facilities under $X        │
│     revenue threshold                            │
│  ○ Custom: [text input]                          │
│                                                  │
│  ⚠️ This change is a SIMULATION ONLY.             │
│     Your actual governance rules are unchanged.  │
│     To change your real rules, re-upload your    │
│     strategy documents.                          │
│                                                  │
└──────────────────────────────────────────────────┘
```

Sarah picks "Allow closures with 12-month transition plan." Re-runs the cascade.

**New result:** The Jabil proposal now triggers 2 conflicts instead of 5. The closure itself is allowed (with conditions), but engineering oversight and safety audit gaps remain.

### What the user got:

The ability to TEST governance changes before committing to them. "If I loosened this rule, how much closer does this proposal get to alignment?" Without actually changing the real governance. A sandbox for policy, not just proposals.

---

## What This Is Worth (Honest Value Statement)

**For Meridian, Align provides:**

1. **Consistency enforcement** — 15 rules extracted from 4 documents, checked automatically against every proposal. No more "we wrote a strategy and forgot about it."

2. **Lip service detection** — The Jabil proposal called a closure a "consolidation." Align caught it. Humans skip past this.

3. **Cascade visibility** — One rule violation triggers 4 more. Nobody traces this manually. The cascade analysis shows the chain reaction within your own governance.

4. **Policy sandbox** — Test rule changes without committing. "What if we loosened X?" See the impact on current and past proposals.

5. **Cross-document conflict detection** — Your strategy and culture contradicted each other on automation/layoffs. Most orgs never discover this until it causes a real crisis.

**What Align does NOT provide:**

- Market analysis (will the German acquisition succeed?)
- Financial modeling (what's the ROI?)
- Risk prediction (what will competitors do?)
- Employee sentiment (how will Akron workers feel?)
- Legal review (is the Jabil contract enforceable?)

**Align checks decisions against your own stated values. It can't tell you if you'll succeed — it can tell you if you're being consistent with what you said matters.**

That's the product. That's the honest pitch.
