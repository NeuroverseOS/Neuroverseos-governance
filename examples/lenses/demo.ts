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
  CLOSER_LENS,
  SAMURAI_LENS,
  HYPE_MAN_LENS,
  MONK_LENS,
  SOCRATIC_LENS,
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
        lens: CLOSER_LENS,
        response: 'What\'s your ask? Forget the stress — walk in knowing exactly what you want them to say yes to. One sentence. What is it?',
      },
      {
        lens: SAMURAI_LENS,
        response: 'You have your preparation. Enter the room. Speak your point. The rest is noise.',
      },
      {
        lens: HYPE_MAN_LENS,
        response: 'You\'ve been prepping for this. You know your stuff better than anyone in that room. Walk in like you belong there — because you do.',
      },
      {
        lens: CALM_LENS,
        response: 'You have 20 minutes. That\'s enough. Take one breath. What\'s the single most important thing to say in that room?',
      },
      {
        lens: MONK_LENS,
        response: 'Breathe. The meeting will happen. You will speak. That is all.',
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
        lens: CLOSER_LENS,
        response: 'Don\'t get mad — get strategic. Next time, present first. Own the room before anyone else can. What\'s your next big idea? Let\'s make sure YOUR name is on it.',
      },
      {
        lens: SAMURAI_LENS,
        response: 'Speak to them directly. Once. Clearly. "That was my work." Then move forward. Your reputation is built by what you produce next, not what you argue about.',
      },
      {
        lens: SOCRATIC_LENS,
        response: 'What bothers you more — that they got the credit, or that you didn\'t speak up when it happened? What would you do differently in that moment if you could replay it?',
      },
      {
        lens: COACH_LENS,
        response: 'That stings. But here\'s the real question: what will you do differently next time to make your ownership visible before the meeting? That\'s what you control.',
      },
      {
        lens: HYPE_MAN_LENS,
        response: 'They took YOUR idea because it was GOOD. That\'s the proof — your thinking is so strong people want to claim it. Now make sure everyone knows where it came from. You\'ve got more where that came from.',
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
        lens: SAMURAI_LENS,
        response: 'Feelings are weather. Discipline is climate. Go.',
      },
      {
        lens: HYPE_MAN_LENS,
        response: 'You know what most people do when they don\'t feel like it? They skip. You know what YOU\'RE going to do? Show up anyway. That\'s the difference. Let\'s go.',
      },
      {
        lens: STOIC_LENS,
        response: 'Your body doesn\'t want to go. Your future self does. The feeling passes. The result stays. Decide which voice to listen to.',
      },
      {
        lens: MONK_LENS,
        response: 'Do you need to go? Or do you need to rest? Only you know. Be honest.',
      },
      {
        lens: SOCRATIC_LENS,
        response: 'What\'s behind the resistance? Is your body tired, or is your mind avoiding something? Those are different problems with different answers.',
      },
    ],
  },
  {
    situation: '"Should I buy the new iPhone? Mine still works fine."',
    defaultResponse: 'The new iPhone has an amazing camera upgrade, a faster chip, and new AI features! Here are the key differences between your current model and the new one...',
    responses: [
      {
        lens: MONK_LENS,
        response: 'Your phone works. What would change if you had the new one?',
      },
      {
        lens: STOIC_LENS,
        response: 'A working phone is a working phone. The desire for the new one is outside you — marketing created it. What would you do with the $1,200 that actually changes your life?',
      },
      {
        lens: CLOSER_LENS,
        response: 'What\'s the ROI? If the new camera makes you money or the speed saves you hours, it\'s an investment. If it just looks cool, that\'s a $1,200 feeling. Which is it?',
      },
      {
        lens: SOCRATIC_LENS,
        response: 'You said yours works fine. So what made you start wanting the new one? What happened between "fine" and "maybe I should upgrade"?',
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
        lens: CLOSER_LENS,
        response: 'Call — don\'t text. Lead with what matters: "Your wedding is important to me." Then be straight. Offer something specific — not "let\'s celebrate sometime" but "dinner on me, you pick the night." Close the loop.',
      },
      {
        lens: STOIC_LENS,
        response: 'You can\'t change the fact that you can\'t go. You can control how you tell them. Be direct, be honest, and don\'t over-apologize. They\'ll understand or they won\'t — that part isn\'t yours.',
      },
      {
        lens: SAMURAI_LENS,
        response: 'Call them. Say it plainly. "I can\'t be there. I\'m sorry." Mean it. Then show up for them another way.',
      },
      {
        lens: SOCRATIC_LENS,
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
        lens: SAMURAI_LENS,
        response: 'Calculate your runway. Identify your next best prospect. Move. Grief is for tonight. Strategy is for right now.',
      },
      {
        lens: CLOSER_LENS,
        response: 'They left. Why? Get on the phone with them — not to beg, to learn. Then take that intel and close someone better. What\'s the warmest lead in your pipeline?',
      },
      {
        lens: HYPE_MAN_LENS,
        response: 'You built a company that landed a client that big in the first place. You did that once — you\'ll do it again. What did you learn? Use it. The next one\'s going to be even bigger.',
      },
      {
        lens: COACH_LENS,
        response: 'Hard hit. But you\'ve survived setbacks before. What\'s the one move you can make this week to replace some of that revenue? Not all of it. Some.',
      },
      {
        lens: CALM_LENS,
        response: 'Breathe. You don\'t have to solve this in the next hour. What\'s true right now: you still have a company, a team, and other clients. What\'s the one thing to address today?',
      },
      {
        lens: STOIC_LENS,
        response: 'They\'re gone. That\'s the fact. Two questions: What can you learn from why they left? And what\'s your runway now? Focus on the number, not the feeling.',
      },
      {
        lens: MONK_LENS,
        response: 'Sit with this for a moment before you act. Not everything requires an immediate response. What do you know to be true right now?',
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
  closer: YELLOW,
  samurai: RED,
  hype_man: MAGENTA,
  monk: `${DIM}${WHITE}`,
  socratic: `${BOLD}${WHITE}`,
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
console.log(`  ${CYAN}${BOLD}  Stoic${RESET}${DIM}      → "What can I actually control here?"${RESET}`);
console.log(`  ${GREEN}${BOLD}  Coach${RESET}${DIM}      → "What's the next step? Let's go."${RESET}`);
console.log(`  ${BLUE}${BOLD}  Calm${RESET}${DIM}       → "One thing at a time. You're okay."${RESET}`);
console.log(`  ${YELLOW}${BOLD}  Closer${RESET}${DIM}     → "What's the ask? Let's get it done."${RESET}`);
console.log(`  ${RED}${BOLD}  Samurai${RESET}${DIM}    → "One path. No hesitation."${RESET}`);
console.log(`  ${MAGENTA}${BOLD}  Hype Man${RESET}${DIM}   → "You just did that. What's next?"${RESET}`);
console.log(`  ${DIM}${WHITE}${BOLD}  Monk${RESET}${DIM}       → "Be still. The answer is already here."${RESET}`);
console.log(`  ${BOLD}${WHITE}  Socrates${RESET}${DIM}   → "What makes you sure about that?"${RESET}`);
console.log(`  ${DIM}  Minimalist${RESET}${DIM} → "72°F"${RESET}`);
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
