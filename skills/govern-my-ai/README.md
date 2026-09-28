# Govern My AI — a Claude skill

You're building an AI coach, tutor, or assistant that has to stay true to
**your** model. This skill makes Claude help you do that properly.

Claude will teach you as it goes, so by the end you understand how your
coach is governed and can change the rules yourself. Claude will:

1. **Explain what governance is** and why it matters for the people you serve.
2. **Interview you** one question at a time, in plain language, about your
   model, the people it serves, how the coach should sound, what it must
   always and never do, and what happens in hard moments.
3. **Write your rulebook**: a file (`governance/<your-model>.nv-world.md`)
   that holds every rule you approved, in your own words.
4. **Build the rules into your app** so they're enforced by code, not just
   requested in a prompt. That includes fixed responses for crisis moments,
   checks on every AI reply, and a list of tricky test messages.
5. **Show you the rules working**, live.
6. **Hand you the controls.** You change a rule, add a test, and run the
   checks yourself, and you keep a cheat sheet for later.

The rulebook uses the open-source
[`@neuroverseos/governance`](https://www.npmjs.com/package/@neuroverseos/governance)
format.

## How to use it

**With Claude Code** (terminal, desktop app, or claude.ai/code):

1. In your project, create a folder called `.claude/skills/govern-my-ai/`.
2. Copy this folder's files into it: `SKILL.md` and the `templates/` folder.
3. Tell Claude: *"Use the govern-my-ai skill. I want to build a coach for my model."*

**With Claude on claude.ai** (to do the interview and rulebook before you code):

1. Download this folder as a zip.
2. In Claude's settings, find **Skills** and upload the zip.
3. Start a chat: *"Help me govern the AI coach I'm building."*

## What's in here

| File | What it is |
|---|---|
| `SKILL.md` | The instructions Claude follows: the interview, how to write the rulebook, and how to wire it in |
| `templates/coach.nv-world.md` | An example rulebook for a first-gen career coach. It shows the shape only; Claude replaces everything with your answers |
| `templates/governance.ts` | Reference code that loads the rulebook and enforces it around every AI reply |
| `templates/tests.md` | Starter "fire drill": messages that should and shouldn't set off the crisis and legal responses |
| `templates/check-my-rules.ts` | Runs the fire drill with `npm run check-rules` and explains the results in plain language |
| `templates/HOW-TO-CHANGE-MY-COACH.md` | Your cheat sheet for changing and testing your rules later |
