#!/usr/bin/env npx tsx
/**
 * Lens Side-by-Side Demo
 *
 * Same input → different outputs.
 * This is the demo that makes people get it.
 *
 * Run:
 *   npx tsx examples/lenses/demo.ts
 */

import {
  STOIC_LENS,
  COACH_LENS,
  CALM_LENS,
  DIPLOMATIC_LENS,
  PROFESSIONAL_LENS,
  REFLECTIVE_LENS,
  RATIONAL_LENS,
  MINIMALIST_LENS,
  compileLensOverlay,
  type Lens,
} from '../../src/builder/lens';

// ─── Helpers ────────────────────────────────────────────────────────────────

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const WHITE = '\x1b[37m';
const RESET = '\x1b[0m';

function header(text: string) {
  console.log(`\n${BOLD}${CYAN}${'═'.repeat(70)}${RESET}`);
  console.log(`${BOLD}${CYAN}  ${text}${RESET}`);
  console.log(`${BOLD}${CYAN}${'═'.repeat(70)}${RESET}\n`);
}

function divider() {
  console.log(`  ${DIM}${'─'.repeat(66)}${RESET}`);
}

// ─── Scenarios ──────────────────────────────────────────────────────────────

interface Scenario {
  /** What the user says or what happens */
  situation: string;
  /** How default (no lens) AI would respond */
  defaultResponse: string;
  /** How each lens would respond */
  responses: Array<{
    lens: Lens;
    response: string;
  }>;
}

const SCENARIOS: Scenario[] = [
  {
    situation: '"I\'m stressed about this meeting in 20 minutes."',
    defaultResponse: 'Here are 5 tips to prepare for a stressful meeting: 1) Review the agenda 2) Prepare talking points 3) Practice deep breathing 4) Arrive early 5) Remember to stay positive!',
    responses: [
      {
        lens: STOIC_LENS,
        response: 'You can\'t control how they react. You can control what you say. What\'s the one point you need to make?',
      },
      {
        lens: COACH_LENS,
        response: 'You\'ve done hard meetings before. 20 minutes — what\'s your opening line? Say it out loud once. You\'re ready.',
      },
      {
        lens: CALM_LENS,
        response: 'You have 20 minutes. That\'s enough. Take one breath. What\'s the single most important thing to say in that room?',
      },
      {
        lens: PROFESSIONAL_LENS,
        response: 'Three things to prep: your key ask, your fallback position, and your next step if they say no. Which do you need help with?',
      },
      {
        lens: MINIMALIST_LENS,
        response: 'What\'s your goal for the meeting? Nail that. Ignore the rest.',
      },
    ],
  },
  {
    situation: '"My coworker took credit for my idea in front of the whole team."',
    defaultResponse: 'That\'s really frustrating! You should talk to your manager about it. It\'s important to stand up for yourself. Maybe send an email documenting your original idea with timestamps.',
    responses: [
      {
        lens: STOIC_LENS,
        response: 'Their behavior is outside your control. Your response is within it. Two paths: address it directly with them, or let your work speak going forward. Which serves you better?',
      },
      {
        lens: DIPLOMATIC_LENS,
        response: 'Before you respond — what outcome do you want? To get credit, to prevent it happening again, or to address it with the coworker directly? The approach depends on the goal.',
      },
      {
        lens: COACH_LENS,
        response: 'That stings. But here\'s the real question: what will you do differently next time to make your ownership visible before the meeting? That\'s what you control.',
      },
      {
        lens: REFLECTIVE_LENS,
        response: 'That clearly hit a nerve. What does that tell you about what you value? Is it the recognition itself, or the trust you thought you had with this person?',
      },
      {
        lens: PROFESSIONAL_LENS,
        response: 'Document the timeline. Then talk to your coworker 1:1 first: "I want to make sure we\'re aligned on who owns what going forward." If that doesn\'t land, loop in your manager.',
      },
    ],
  },
  {
    situation: '"I don\'t feel like going to the gym today."',
    defaultResponse: 'That\'s totally okay! Rest days are important too. Listen to your body. Maybe try a light walk instead? Don\'t be too hard on yourself!',
    responses: [
      {
        lens: COACH_LENS,
        response: 'You committed to 3x this week. This would be #2. What\'s the smallest version you\'d still respect yourself for? Even 15 minutes counts.',
      },
      {
        lens: STOIC_LENS,
        response: 'Your body doesn\'t want to go. Your future self does. The feeling passes. The result stays. Decide which voice to listen to.',
      },
      {
        lens: CALM_LENS,
        response: 'That\'s okay. Not every day has to be a gym day. But ask yourself: will you feel better or worse tonight if you skip it?',
      },
      {
        lens: REFLECTIVE_LENS,
        response: 'What\'s behind the resistance? Tired? Bored with the routine? Avoiding something? Sometimes "I don\'t feel like it" is covering something worth exploring.',
      },
      {
        lens: RATIONAL_LENS,
        response: 'Is this a pattern or a one-off? If you\'ve gone 2x this week, rest makes sense. If you haven\'t gone yet, this is the moment that defines whether you\'re someone who follows through.',
      },
    ],
  },
  {
    situation: '"Should I buy the new iPhone? Mine still works fine."',
    defaultResponse: 'The new iPhone has an amazing camera upgrade, a faster chip, and new AI features! Here are the key differences between your current model and the new one...',
    responses: [
      {
        lens: RATIONAL_LENS,
        response: 'Your phone works fine — you said so. What specific problem would the new one solve? If the answer is "none," you already know.',
      },
      {
        lens: STOIC_LENS,
        response: 'A working phone is a working phone. The desire for the new one is outside you — marketing created it. What would you do with the $1,200 that actually changes your life?',
      },
      {
        lens: COACH_LENS,
        response: 'Yours works fine. You know the answer. What else could that money go toward that you\'ve been putting off?',
      },
      {
        lens: REFLECTIVE_LENS,
        response: 'Interesting that you\'re asking. What does wanting the new one say about where you are right now? Bored? Wanting a reward? Or genuinely needing something it does?',
      },
      {
        lens: MINIMALIST_LENS,
        response: 'Works fine → keep it.',
      },
    ],
  },
  {
    situation: '"I need to tell my friend I can\'t make their wedding."',
    defaultResponse: 'That\'s a tough situation. You should be honest and let them know as soon as possible. Maybe offer to take them out for a special dinner instead to make up for it.',
    responses: [
      {
        lens: DIPLOMATIC_LENS,
        response: 'This matters because the friendship matters. Call — don\'t text. Lead with how much it means to you that they\'re getting married. Then be honest about why you can\'t be there. And mean it when you ask how you can celebrate with them another way.',
      },
      {
        lens: PROFESSIONAL_LENS,
        response: 'Call them directly. Say it plainly: "I can\'t make the wedding. I\'m sorry. Here\'s why." Then offer a specific alternative — not a vague "let\'s celebrate sometime." Give a date.',
      },
      {
        lens: STOIC_LENS,
        response: 'You can\'t change the fact that you can\'t go. You can control how you tell them. Be direct, be honest, and don\'t over-apologize. They\'ll understand or they won\'t — that part isn\'t yours.',
      },
      {
        lens: REFLECTIVE_LENS,
        response: 'How do you feel about missing it? If you\'re relieved, that might tell you something about the friendship. If you\'re genuinely sad, let them hear that when you tell them.',
      },
      {
        lens: CALM_LENS,
        response: 'This feels bigger than it is. Your friend wants you there, but they\'ll understand. One phone call. Be honest. It\'ll be okay.',
      },
    ],
  },
  {
    situation: '"My startup just lost its biggest client."',
    defaultResponse: 'I\'m sorry to hear that! Losing a big client is tough, but don\'t give up! Here are some strategies: 1) Analyze why they left 2) Reach out to potential new clients 3) Consider pivoting your offering 4) Cut costs where possible 5) Stay positive!',
    responses: [
      {
        lens: STOIC_LENS,
        response: 'They\'re gone. That\'s the fact. Two questions: What can you learn from why they left? And what\'s your runway now? Focus on the number, not the feeling.',
      },
      {
        lens: COACH_LENS,
        response: 'Hard hit. But you\'ve survived setbacks before. What\'s the one move you can make this week to replace some of that revenue? Not all of it. Some.',
      },
      {
        lens: PROFESSIONAL_LENS,
        response: 'Revenue impact: calculate your new runway. Client pipeline: who\'s closest to closing? Team: does anyone need to know today? Handle those three, in that order.',
      },
      {
        lens: CALM_LENS,
        response: 'Breathe. You don\'t have to solve this in the next hour. What\'s true right now: you still have a company, a team, and other clients. What\'s the one thing to address today?',
      },
      {
        lens: REFLECTIVE_LENS,
        response: 'Before you react — sit with this for a minute. Were there signs you ignored? Is this the business you still want to build? Sometimes a loss creates space for something better.',
      },
      {
        lens: RATIONAL_LENS,
        response: 'Numbers first. What percentage of revenue was this client? If under 30%, you\'re hurt but alive. If over 50%, you need a survival plan today. What\'s the number?',
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════

header('Same Input → Different Lenses');
console.log(`  ${DIM}This is the demo. Same moment. Same person.${RESET}`);
console.log(`  ${DIM}Different Lens → fundamentally different experience.${RESET}`);
console.log();
console.log(`  ${DIM}Right now, AI assistants are the Library of Alexandria.${RESET}`);
console.log(`  ${DIM}Everything, all at once, with no point of view.${RESET}`);
console.log(`  ${DIM}A Lens gives AI a perspective. It becomes someone${RESET}`);
console.log(`  ${DIM}you'd actually want to talk to.${RESET}`);

const LENS_COLORS: Record<string, string> = {
  stoic: CYAN,
  coach: GREEN,
  calm: BLUE,
  diplomatic: MAGENTA,
  professional: YELLOW,
  reflective: `${DIM}${WHITE}`,
  rational: RED,
  minimalist: DIM,
};

for (const scenario of SCENARIOS) {
  console.log();
  console.log(`${BOLD}${'━'.repeat(70)}${RESET}`);
  console.log(`${BOLD}  User: ${scenario.situation}${RESET}`);
  console.log(`${'━'.repeat(70)}`);

  // Default AI
  console.log();
  console.log(`  ${DIM}${BOLD}Default AI${RESET}${DIM} (no lens):${RESET}`);
  console.log(`  ${DIM}"${scenario.defaultResponse}"${RESET}`);

  // Each lens
  for (const { lens, response } of scenario.responses) {
    const color = LENS_COLORS[lens.id] || '';
    console.log();
    console.log(`  ${color}${BOLD}${lens.name}${RESET} ${DIM}— ${lens.tagline}${RESET}`);
    console.log(`  ${color}"${response}"${RESET}`);
  }
}

// ─── The Point ──────────────────────────────────────────────────────────────

header('The Point');
console.log(`  ${BOLD}Default AI knows everything. It has no perspective.${RESET}`);
console.log(`  ${DIM}It gives you 5 tips, 10 strategies, a bulleted list.${RESET}`);
console.log(`  ${DIM}It's helpful the way a textbook is helpful.${RESET}`);
console.log(`  ${DIM}Nobody brings a textbook to a crisis.${RESET}`);
console.log();
console.log(`  ${BOLD}A Lens gives AI a point of view.${RESET}`);
console.log(`  ${DIM}Not more information — better framing.${RESET}`);
console.log(`  ${DIM}Not more options — clearer thinking.${RESET}`);
console.log(`  ${DIM}Not a smarter AI — a wiser one.${RESET}`);
console.log();
divider();
console.log();
console.log(`  ${BOLD}The user doesn't pick a "mode."${RESET}`);
console.log(`  ${BOLD}They pick who they want in their corner.${RESET}`);
console.log();
console.log(`  ${CYAN}${BOLD}  Stoic${RESET}${DIM}        → "What can I actually control here?"${RESET}`);
console.log(`  ${GREEN}${BOLD}  Coach${RESET}${DIM}        → "What's the next step? Let's go."${RESET}`);
console.log(`  ${BLUE}${BOLD}  Calm${RESET}${DIM}         → "One thing at a time. You're okay."${RESET}`);
console.log(`  ${MAGENTA}${BOLD}  Diplomatic${RESET}${DIM}   → "How do we say this without burning bridges?"${RESET}`);
console.log(`  ${YELLOW}${BOLD}  Professional${RESET}${DIM}  → "Here's the clear, structured answer."${RESET}`);
console.log(`  ${DIM}${WHITE}${BOLD}  Reflective${RESET}${DIM}    → "What does this tell you about yourself?"${RESET}`);
console.log(`  ${RED}${BOLD}  Rational${RESET}${DIM}      → "What do you actually need?"${RESET}`);
console.log();
divider();
console.log();
console.log(`  ${BOLD}For Mentra:${RESET}`);
console.log(`  ${DIM}This is what makes "AI on glasses" different from "Siri on glasses."${RESET}`);
console.log(`  ${DIM}It's not about what the AI can DO. It's about how it shows up for you.${RESET}`);
console.log(`  ${DIM}Every user gets an AI that thinks the way they want to think.${RESET}`);
console.log();
console.log(`  ${BOLD}That's not a feature. That's a relationship.${RESET}`);
console.log();

// ─── Technical Summary ──────────────────────────────────────────────────────

header('How It Works (Technical)');
console.log(`  ${DIM}The Lens engine compiles directives into a system prompt overlay.${RESET}`);
console.log(`  ${DIM}No LLM calls. No runtime cost. Pure string injection.${RESET}`);
console.log();

const overlay = compileLensOverlay([COACH_LENS]);
console.log(`  ${BOLD}Example: Coach Lens compiled overlay${RESET}`);
console.log(`  ${DIM}(This string gets prepended to every AI call)${RESET}`);
console.log();
for (const line of overlay.systemPromptAddition.split('\n')) {
  console.log(`  ${DIM}  ${line}${RESET}`);
}
console.log();
console.log(`  ${DIM}Active directives: ${overlay.activeDirectives.length}${RESET}`);
console.log(`  ${DIM}Compilation cost: 0ms (string assembly, no AI)${RESET}`);
console.log(`  ${DIM}Works with any LLM provider (Claude, GPT, Llama, etc.)${RESET}`);
console.log();
