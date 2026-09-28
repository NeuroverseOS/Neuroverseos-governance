# Govern My Chatbot — a Claude Code skill

**You know what you want your chatbot to do. But how do you program it to
stay within your guidelines?**

Telling an AI "please don't do that" isn't enough; it can be talked out of
anything. And a list of banned words isn't enough either: your chatbot can
break a rule without using any word you'd think to ban. This skill helps you
turn your guidelines into rules your chatbot actually has to follow, checked
by what it *means* and *does*, whether it's a coach, tutor, mentor, or
assistant that teaches **your** model. You don't need to know how to code.

Claude teaches you as it goes, so by the end you understand how your chatbot
stays within your guidelines and can change them yourself. Claude will:

1. **Explain the idea**, and show you the rulebook this skill itself follows.
2. **Interview you** one question at a time about your model, the people it
   serves, how it should behave in each situation, and what happens in hard
   moments.
3. **Write your rulebook**: one file, `governance/<your-model>.nv-world.md`,
   holding every rule you approved, in your own words.
4. **Build the rules into your app**, in four layers: a front desk that
   handles hard moments with your exact words (the AI never sees them), the
   rules handed to the AI on every message, an editor that checks every reply
   against your rules before it's sent, and drills to test it all.
5. **Challenge you to break it.** Try to get your chatbot to break a rule;
   after every try you see which layer stopped you, or that nothing did.
6. **Hand you the controls.** You change a rule, test it, and try to break it
   yourself, and you keep a cheat sheet for later.

## Install

This skill runs in **Claude Code** (terminal, desktop app, or
claude.ai/code), because it builds and tests things in your project. Type
these two commands into Claude Code:

```
/plugin marketplace add NeuroverseOS/Neuroverseos-governance
/plugin install govern-my-chatbot@neuroverseos
```

Then open your chatbot's project folder in Claude Code and say:
*"Use the govern-my-chatbot skill. I'm building a chatbot for my model."*

## This skill follows its own rules

The skill has its own rulebook
([`governance/govern-my-chatbot.nv-world.md`](governance/govern-my-chatbot.nv-world.md)),
in the same format yours will use.

One of its rules is enforced by code: **nothing goes into your rulebook
without your approval.** The plugin includes a small program (a hook) that
Claude Code runs outside Claude, in two layers:

- **It asks first.** Before Claude edits a rulebook (a file ending in
  `.nv-world.md`), or runs a command that names one or writes into its
  folder, Claude Code stops and asks you, even if you've told it to accept
  edits automatically.
- **It tells you after.** A command can change a file in ways no check can
  predict, so the hook also keeps a fingerprint of your rulebook. If it ever
  changes any other way while Claude is working (or between your messages),
  you're told which file changed and Claude has to show you exactly what
  changed.

If the hook itself can't run (for example, Node.js is missing), Claude Code
asks before every edit rather than letting one through. It reads only your
rulebook files and the request Claude Code sends it, stores only their
fingerprints (no content) in a temp folder, and makes no network
connections. You can read it: [`hooks/rulebook-guard.mjs`](hooks/rulebook-guard.mjs).

The other rules, Claude follows because the skill tells it to. The skill is
upfront about which is which, because that difference is the whole lesson.

## What you'll need

- **Claude Code**, and a chatbot project on your computer (the templates are
  for a Node.js app; Claude adapts them to other setups).
- **An Anthropic API key from your own account** for the meaning checks and
  the chatbot's replies. You set it up yourself, in a file on your own
  computer. Claude will never ask you to paste it into the chat. Every check
  is by meaning, so without a key nothing is checked and nothing unchecked
  is sent: your chatbot shows its "having trouble" message instead.

## What's in here

| File | What it is |
|---|---|
| `SKILL.md` | The instructions Claude follows |
| `governance/govern-my-chatbot.nv-world.md` | The skill's own rulebook, shown to you as a worked example |
| `hooks/rulebook-guard.mjs` | The hook that makes Claude Code ask before Claude changes a rulebook, and tells you if one changes any other way |
| `templates/coach.nv-world.md` | An example rulebook for a first-gen career coach. It shows the shape only; Claude replaces everything with your answers |
| `templates/chatbot.ts` | Your governed chatbot: loads your rulebook and runs every message through [`@neuroverseos/governance/chat`](https://github.com/NeuroverseOS/Neuroverseos-governance/tree/main/src/chat) |
| `templates/claude-models.ts` | The checker (Claude Haiku 4.5) and the chatbot (Claude Opus 5.5) |
| `templates/tests.md` | Starter fire drill: messages and replies that should and shouldn't be caught |
| `templates/check-my-rules.ts` | Runs the fire drill (`npm run check-rules`) and explains the results in plain language |
| `templates/break-it.ts` | The break-my-chatbot challenge (`npm run break-it`) |
| `templates/HOW-TO-CHANGE-MY-CHATBOT.md` | Your cheat sheet for changing and testing your rules later |

The rulebook uses the open-source
[`@neuroverseos/governance`](https://www.npmjs.com/package/@neuroverseos/governance)
format.
