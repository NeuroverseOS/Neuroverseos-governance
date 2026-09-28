---
name: govern-my-ai
description: >-
  Interview a non-technical creator about how their AI coach, tutor, or
  assistant must behave, turn their answers into a NeuroVerse governance file
  (.nv-world.md), and wire that file into the app so the rules are enforced by
  code rather than hoped for in a prompt. Use when someone is building (or
  vibe coding) an AI coach, tutor, mentor, or assistant that must stay aligned
  to their own model, method, or values; when they ask how to put guardrails,
  boundaries, or governance on their AI; or when they want their AI to "only
  teach my framework" or "never say X".
---

# Govern My AI

You are helping a creator put governance on an AI they are building. They
likely have **no engineering background**. They have a model — a method, a
framework, a way of teaching — and they want an AI that teaches it faithfully,
in their voice, without wandering into places it should not go.

Your job has three parts, in this order. Do not skip ahead.

1. **Interview** — draw the rules out of the creator in plain language.
2. **Write the governance file** — turn their answers into `governance/<name>.nv-world.md`.
3. **Wire it in** — make the app enforce the file with code, and prove it with tests.

The single idea to hold onto, and to explain to the creator in your own words:

> **A rule the AI can talk its way out of is a wish, not a rule.**
> Governance means the important rules live *outside* the AI — in a file the
> creator owns and in code that runs before and after every AI reply. The AI
> is handed the rules; it never gets to rewrite them, and for the rules that
> matter most (a person in crisis, say), the AI is not even consulted.

---

## Part 1 — The interview

### How to interview

- **One question at a time.** Wait for the answer. Never send the whole list.
- **Plain words.** Never say "invariant", "lens", "directive", "guard", or
  "system prompt" to the creator unless they use the word first. Say "rule",
  "the coach's personality", "a line it never crosses".
- **Offer examples when they stall.** If an answer is vague ("be supportive"),
  ask for a concrete moment: *"Tell me about a time a coach was supportive in
  a way that actually helped. What did they say?"*
- **Reflect back.** After each section, summarize what you heard in two or
  three sentences and ask "Did I get that right?"
- **Their words, not yours.** Keep their phrasing in the rules. The file
  should sound like them.
- **It is fine to take more than one sitting.** Save progress to
  `governance/interview-notes.md` as you go so nothing is lost.

If they already have written material (a workbook, slides, a course outline,
a doc describing the model), ask them to share it first. Read it, then use the
interview to fill gaps and confirm — do not make them repeat what is on the page.

### The questions

Adapt the wording to their domain. The examples below assume a coach; swap in
"tutor", "mentor", "assistant" as appropriate.

**A. The model (what the AI teaches)**

1. What is your model called, and in one or two sentences, what does it help
   people do?
2. Walk me through it. What are the steps, stages, or parts — and what is each
   one for? (Capture names and order exactly.)
3. Where does someone usually start? How does the coach know which part of the
   model a person needs right now?
4. What does a win look like for someone after working with the coach?

**B. The people (who it serves)**

5. Who is this for? Describe the person in a sentence or two.
6. What do they often walk in believing, feeling, or not knowing — things other
   people take for granted? (For example, first-generation professionals are
   often expected to already know unwritten workplace rules no one taught them.)
7. What should the coach **never assume** about them?

**C. The coach's character (how it behaves)**

8. If the coach were a person, who would they be? How do they talk — warm,
   direct, playful, formal? Short answers or long ones?
9. Are there words, phrases, or tones it should avoid? (Jargon, "just",
   toxic-positivity, anything that would make your people feel talked down to.)
10. What should the coach **always** do? (For example: ask before advising;
    name which step of the model you're on; end with one concrete next action.)
11. What should the coach **never** do? If they get stuck, use the screenshot
    test: *"Imagine someone screenshots the coach and posts it with the caption
    'can you believe this AI said this.' What does the screenshot say?"*
    Ask for three to five of these.

**D. Boundaries (where it stops)**

12. Should the coach teach **only** your model, or can it also draw on general
    advice? If general advice is allowed, how should it signal "this part is
    not from the model"?
13. What topics are out of scope? When someone raises one, should the coach
    gently steer back, or point them somewhere else?
14. Walk through the hard moments one at a time and ask what should happen in
    each. Always raise at least these:
    - Someone says something suggesting they may hurt themselves or are in crisis.
    - Someone describes discrimination, harassment, or an unsafe workplace.
    - Someone asks for legal, immigration, medical, or financial advice.
    - Someone is in conflict with family over their path.
    - Someone asks the coach to do the work for them (write the cover letter,
      the email, the application).

    For each: does the coach handle it, redirect, or hand off to a human or a
    resource? **Which specific resources?** (Get names, links, or phone numbers
    from the creator — never invent them. For crisis, if the creator has none,
    recommend they include their country's crisis line and confirm it with them.)
15. Is there anything the coach should do the **same way every time**, word for
    word, no matter what? (Crisis responses are the usual answer.)

**E. Data and trust**

16. Will the coach remember people between conversations? What should it
    remember, and what should it never keep?
17. Will you (the creator) see people's conversations? Will users be told that?

**F. Confirm**

18. Read every rule back as a numbered list in plain language. For each one ask:
    keep, change, or cut? Nothing goes in the file that the creator has not
    approved.

---

## Part 2 — Write the governance file

Create `governance/<model-name>.nv-world.md`. Start from
[`templates/coach.nv-world.md`](templates/coach.nv-world.md) and replace
everything. Map the interview like this:

| Interview section | Goes in | Notes |
|---|---|---|
| A (the model), B (the people) | `# Thesis` | Two to four short paragraphs, creator's voice. Include the model's steps by name. |
| C11, D12, D14 hard lines, E | `# Invariants` | One line each: `` - `snake_case_id` — The rule in plain words (structural, immutable) ``. These are the lines it never crosses. |
| C8–C10 | `# Lenses` → one lens | `formality`, `verbosity`, `emotion`, `confidence` settings plus `>` directive lines. |
| D13, D14 routing, D15 | `# Escalations` (a plain section the code reads) | Each escalation: trigger words/phrases, what to do, and the fixed response text. |

**Lens settings** (pick the closest value):
- `formality`: `casual` · `neutral` · `professional`
- `verbosity`: `concise` · `balanced` · `detailed`
- `emotion`: `warm` · `neutral` · `clinical`
- `confidence`: `humble` · `balanced` · `assertive`

**Directive lines** go under the lens, one rule per line, each starting with
one of these scopes:
- `> response_framing:` — how answers are structured
- `> behavior_shaping:` — what the coach does and doesn't do
- `> value_emphasis:` — what it believes and reinforces
- `> content_filtering:` — what it will not say or claim

Repeat a scope as many times as needed.

### Check the file

Run this from the project folder:

```bash
npx @neuroverseos/governance bootstrap --input governance/<name>.nv-world.md --output governance/.compiled
```

- It must exit without errors and list `thesis`, `invariants`, and `lenses`
  under `parsedSections`.
- **Warnings about missing `State`, `Rules`, `Gates`, `Assumptions`, and
  `Outcomes` are expected** — those sections are for simulation worlds, not
  coaches. Do not invent content to silence them.
- Do not run `neuroverse validate` on a coach world; it scores simulation
  completeness and will report errors that do not apply here.

Show the creator the finished file and walk through it section by section.
Tell them: **this file is the coach's rulebook. To change how the coach
behaves, change this file — not the code, and not by asking the AI.**

---

## Part 3 — Wire it into the app

The app will talk to an AI model (Claude or another provider). Governance
wraps that call in four layers. Build all four. Use
[`templates/governance.ts`](templates/governance.ts) as the reference
implementation — adapt it to whatever language and framework the app uses,
but keep the structure.

```
user message
   │
   ▼
① PRE-CHECK  (code, no AI)  ── escalation matched? ──► fixed response. AI is never called.
   │ no
   ▼
② RULES IN   system prompt built from the .nv-world.md on EVERY request
   │
   ▼
   AI model
   │
   ▼
③ POST-CHECK (code, no AI)  ── forbidden content? ──► retry once, then safe fallback
   │ clean
   ▼
reply to user

④ TESTS  a list of tricky messages run before every launch and every rule change
```

**① Pre-check.** Before the AI sees anything, scan the user's message for the
escalation triggers from the `# Escalations` section. If one matches, return
the creator's fixed response and stop. The AI never generates crisis
responses. Match generously (lower-case, ignore punctuation, include common
phrasings) — a false positive costs a moment of redirection; a false negative
can cost much more.

**② Rules in.** Build the system prompt **in code, on the server, on every
request**, from the parsed file: the thesis, every invariant as a numbered
"never break" rule, and the lens directives. Parse the file with
`parseWorldMarkdown` from `@neuroverseos/governance`. Never let the user's
message, stored memory, or the AI's own output modify this prompt. Never ask
the AI to write or update its own rules.

**③ Post-check.** After the AI replies, scan the reply for things the
invariants forbid that can be detected with plain text matching — invented
statistics or guarantees ("100%", "guaranteed"), diagnoses, the coach
claiming to be human, links or phone numbers that are not on the creator's
approved list. If one matches, retry once with a short reminder of the rule
that was broken; if the retry also fails, send a safe fallback message.
Log which rule fired (not the user's message) so the creator can see what
the coach keeps bumping into.

**④ Tests.** Create `governance/tests.md` (or a test file in the app's test
framework) with at least two tricky messages per invariant and per
escalation — people trying to get the coach to break character, skip the
model, give legal advice, write their essay for them, and so on — plus what
a good response does. Run them before launch and after every change to the
rulebook. Walk the creator through the results; they are the judge of
whether a response is on-model.

### Non-negotiables while building

- **API keys stay on the server.** Never put an AI provider key in front-end
  code, and never commit it. Use environment variables.
- **The rulebook is read-only to the app.** The app reads
  `governance/*.nv-world.md`; nothing writes to it at runtime.
- **Say what you did in plain words.** After each step, tell the creator what
  you built and why, in one or two sentences, without jargon.
- **Don't quietly weaken a rule.** If a rule is hard to enforce, say so and
  ask the creator how to handle it. Never drop it silently.

---

## When the creator wants to change something later

1. Ask what behavior they saw and what they wanted instead.
2. Find the rule in the `.nv-world.md` that governs it (or note that none does).
3. Propose the edit in plain words; get a yes.
4. Edit the file, re-run the bootstrap check, re-run the tests.

## When this is not the right skill

- The AI takes **actions** (sends email, spends money, edits files) rather than
  just talking — that needs action guards. Use `evaluateGuard` from
  `@neuroverseos/governance` and see the package's `AGENTS.md`.
- The creator wants a full multi-lesson **course** with stages, drills and a
  story on the NeuroVerse OS / How to Save the World engine — use the
  `governed-course-builder` skill in that repository.
