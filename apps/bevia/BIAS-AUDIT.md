# Bevia Bias Audit — We Have a Prosocial Agenda Problem

> Date: 2026-03-29
> Finding: Bevia systematically biases toward prosocial, conflict-avoidant, relationship-preserving behavior. This is NOT neutral behavioral analysis. This is an agenda.

---

## The Problem in One Sentence

**A behavioral mirror doesn't have an opinion about what it reflects. Ours does.**

---

## Where the Bias Shows Up

### 1. Intent Options (100% Prosocial)

Current ToneCheck intents: Be clear, Show respect, Keep the peace, Lead, Build the relationship, Deliver hard feedback.

**Missing (real human intents):**

| Intent | Why it's legitimate |
|---|---|
| Win this argument | Debates, negotiations, competitions exist |
| Set a hard boundary | Sometimes "no" IS the right answer |
| End this relationship | Not every relationship should be saved |
| Express anger | Anger is a valid emotion with valid uses |
| Protect myself | Defensive communication isn't always dysfunction |
| Distance myself | Strategic withdrawal is a real behavioral choice |
| Decline without explaining | "No" is a complete sentence (we literally say this in the Gen Z archetype) |
| Test their honesty | Trust but verify is legitimate |
| Establish dominance | Leadership, parenting, crisis situations |
| Build evidence | HR complaints, legal proceedings, safety documentation |

### 2. Sanitization Is One-Directional

We rewrite "negative" framing → "positive" framing. Never the reverse.

| We sanitize this | Into this | Problem |
|---|---|---|
| "Alex is gaslighting" | "Alex contradicts your stated experience" | If Alex IS gaslighting, we just helped the abuser by softening the language |
| "Alex is manipulative" | "Alex tends to use indirect influence tactics" | Manipulation IS a real pattern. Naming it matters. |
| "Take advantage of" | "Be aware of" | If someone IS being taken advantage of, "be aware" is dangerously passive |
| "Control the conversation" | "Navigate productively" | Depositions, negotiations, crisis management ALL require controlling conversations |

**We protect the OTHER person's reputation at the expense of the USER's clarity.**

### 3. Archetypes Only Reward "Good" Behavior

All 6 archetypes are framed as growth-oriented:
- Ambassador = be nicer
- Guardian = be more protective (of others)
- Commander = be more decisive (but fairly)
- Spy = be more observant (but ethically)
- Interrogator = be more direct (but controlled)
- Provocateur = be more challenging (but for growth)

**No archetype for:**
- Strategic withdrawal
- Self-protection
- Competitive dominance
- Principled aggression
- Righteous anger

### 4. World File Invariants Encode a Worldview

`no_judgment_framing` — assumes judgments are always wrong. Sometimes "this person is harmful" is the accurate, necessary judgment.

`no_manipulation_framing` — assumes manipulation intent is always bad. Negotiation, sales, advocacy, parenting all involve intentional influence.

`awareness_not_optimization` — assumes optimization is bad. Sometimes the user NEEDS to optimize their approach. A job interview IS optimization.

### 5. "How to Bridge" Assumes Bridging Is the Goal

Every ToneCheck output option frames toward connection. No option frames toward:
- Clean exits
- Hard boundaries
- Protective distance
- Righteous confrontation

---

## What Needs to Change

### Principle: Reflect the Full Spectrum. Let the User Choose.

We don't add intents because we approve of them. We add them because they represent **real human behavioral needs.** A mirror that only reflects your smile is useless.

### Fix 1: Full-Spectrum Intent Options

Add to EVERY tool:

**ToneCheck additions:**
- "Set a boundary" — establish a firm limit
- "Win this" — get the outcome you want
- "End this" — exit the conversation/relationship
- "Express frustration" — let them know you're unhappy
- "Protect myself" — defensive, guarded communication
- "Say no" — decline without over-explaining
- "Confront this" — address something directly, even if uncomfortable

**Replay additions:**
- "Confirm my read" — validate that what I experienced is real
- "Build my case" — document a pattern for HR/legal/personal records
- "Understand if I'm being manipulated" — is this person acting in bad faith?
- "Validate my decision to leave" — was I right to walk away?

**Audit additions:**
- "Kill this proposal" — find every reason it shouldn't happen
- "Expose the risk" — find what they're hiding or glossing over
- "Protect my position" — frame analysis to support my argument

**Consensus additions:**
- "Protect my team's interests" — this isn't about fairness, it's about my group
- "Block a bad idea" — prevent a decision, not find compromise

### Fix 2: Conditional Sanitization

**Don't sanitize when the user's intent makes "harsh" language appropriate.**

If intent = "confirm my read" or "build my case" or "understand if I'm being manipulated":
- DON'T rewrite "gaslighting" → "contradicts your experience"
- DON'T rewrite "manipulative" → "uses indirect influence"
- DO flag it with: "Strong language detected. Based on the patterns observed, this characterization [is/is not] supported by the data."

**New rule: Sanitization is context-dependent, not blanket.**

```
if (userIntent in ['protect_myself', 'build_case', 'confirm_read', 'understand_manipulation']) {
  // Skip personality-judgment sanitization
  // Instead: validate or challenge the characterization with evidence
  // "You called this 'gaslighting.' Based on 5 analyzed conversations,
  //  the pattern of contradicting your stated experience appears in 3 of them.
  //  This is consistent with that characterization."
} else {
  // Standard sanitization — reframe to behavioral observations
}
```

### Fix 3: Remove "Good/Bad" from Behavioral Analysis

**Stop:**
- Calling Adult ego state "healthiest" — it's context-dependent
- Treating conflict as always negative — conflict is sometimes necessary
- Framing de-escalation as always positive — sometimes escalation is warranted
- Rewarding vulnerability — sometimes guarding yourself is correct
- Penalizing defensiveness — sometimes you NEED to defend

**Start:**
- Describing what happened without valence: "You escalated. Here's the trajectory that creates."
- Letting the user decide if the trajectory is what they want
- Presenting ALL behavioral choices as having tradeoffs, not moral weight

### Fix 4: Intent = Free Text + Parsed

Don't limit to predefined pills. Let users TYPE their intent:

```
"I want to fire this person kindly"
"I need to win this custody negotiation"
"I want to tell my mom to stop"
"I need to get this investor to say yes"
```

Parse the free text into behavioral dimensions:
- Goal: termination, confrontation, persuasion, boundary-setting, exit
- Intensity: gentle, firm, aggressive
- Relationship priority: preserve, neutral, willing to damage
- Time horizon: this conversation, long-term

Then surface: "Your intent suggests you want [X]. We'll frame analysis around that goal. You can adjust anytime."

### Fix 5: Update World File Invariants

**Replace:** `no_judgment_framing`
**With:** `evidence_based_framing` — All characterizations must be supported by observed data. If data supports calling behavior "manipulative," the system uses that word. If data doesn't support it, the system says so. Evidence, not euphemism.

**Replace:** `no_manipulation_framing`
**With:** `intent_aware_framing` — Output framing matches user's stated intent. If intent is "negotiate effectively," framing includes influence tactics. If intent is "understand dynamics," framing is observational. The system mirrors the user's goal, not our moral preferences.

**Keep:** `never_exploit_emotional_patterns` — BUT reframe: the system never crafts approaches designed to harm. It CAN show the user what approaches exist, including aggressive ones, and let them choose. The line is: show all options, never recommend harmful ones.

---

## The Corrected Ethical Stance

**Old:** "Bevia doesn't help you control people."
**New:** "Bevia shows you ALL the dynamics — including uncomfortable ones. You decide what to do. We don't filter based on what we think you SHOULD want."

**Old:** "We show you what's happening so you can choose."
**New:** "We show you what's happening — ALL of it — relative to whatever you're trying to achieve. We don't hide the sharp edges."

**The line we KEEP:** We never fabricate, we never manipulate our own output to steer the user, and we always show the tradeoffs of every approach including harmful ones ("this will likely damage the relationship" IS a tradeoff we surface — we just don't BLOCK the user from choosing it).

---

## Summary

**We are a behavioral analysis tool. Our bias should be: accuracy. Not kindness.**

Kindness is ONE valid behavioral strategy. So is firmness. So is confrontation. So is withdrawal. So is aggression. Our job is to show them all clearly, show the likely consequences of each, and let the human decide.

A mirror that only shows you smiling is a lie.
