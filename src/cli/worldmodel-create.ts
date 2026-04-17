/**
 * @neuroverseos/governance — Conversational worldmodel builder
 *
 * Asks you questions in plain language, captures your answers, and
 * uses AI to structure them into a .worldmodel.md that validates
 * and compiles through the NeuroverseOS pipeline.
 *
 * Your natural process: talk → structure → refine.
 * Not: read template → fill in blanks → validate.
 *
 * Requires ANTHROPIC_API_KEY for the AI structuring step.
 * Falls back to template mode without it.
 */

import { createInterface } from 'readline';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

// ─── Questions ─────────────────────────────────────────────────────────────

const QUESTIONS = [
  {
    id: 'name',
    question: 'What should we call this model? (Your name, your org, your project)',
    placeholder: 'e.g., "Kirsten", "Auki", "My Startup"',
  },
  {
    id: 'mission',
    question: 'In one or two sentences — what does this system exist to do? Not a slogan. The real purpose.',
    placeholder: 'e.g., "Protect human thinking while expanding cognitive capability through AI"',
  },
  {
    id: 'domains',
    question: 'What are the 2-3 big areas of focus? Not departments — the major kinds of work that matter most. Separate with commas.',
    placeholder: 'e.g., "Safety and boundaries, Individual authority, AI as cognitive extension"',
  },
  {
    id: 'overlaps',
    question: 'When those areas work well TOGETHER, what does that feel like? Name a feeling for each pair.',
    placeholder: 'e.g., "Safety + Authority = Trust, Authority + AI = Possibility"',
  },
  {
    id: 'center',
    question: 'When EVERYTHING is aligned — all areas working together — what does the system become? One name or phrase.',
    placeholder: 'e.g., "The Sovereign Conduit", "Collective Vanguard Leader"',
  },
  {
    id: 'nonnegotiables',
    question: 'What\'s absolutely non-negotiable? What would you walk away over? List a few.',
    placeholder: 'e.g., "Humans retain authority over thinking. AI extends, never replaces. People can always leave."',
  },
  {
    id: 'success',
    question: 'What does success look like in action? What would you point at and say "that\'s what I mean"?',
    placeholder: 'e.g., "Someone maintaining clear authorship of decisions even when AI contributed"',
  },
  {
    id: 'drift',
    question: 'What does drift look like? What would worry you if you saw it happening?',
    placeholder: 'e.g., "Decision ownership quietly shifting to AI without explicit delegation"',
  },
  {
    id: 'priorities',
    question: 'When tradeoffs appear, what wins? Give a few "X over Y" pairs.',
    placeholder: 'e.g., "Safety over speed, sovereignty over convenience, diversity over uniformity"',
  },
];

// ─── Interactive session ───────────────────────────────────────────────────

export interface ConversationalAnswers {
  name: string;
  mission: string;
  domains: string;
  overlaps: string;
  center: string;
  nonnegotiables: string;
  success: string;
  drift: string;
  priorities: string;
}

/**
 * Run the interactive question session. Returns answers.
 */
export async function askQuestions(): Promise<ConversationalAnswers> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr, // questions to stderr so stdout stays clean
  });

  const answers: Record<string, string> = {};

  process.stderr.write('\n');
  process.stderr.write('  ╔══════════════════════════════════════════════════╗\n');
  process.stderr.write('  ║  NeuroVerseOS — Build your thinking constitution ║\n');
  process.stderr.write('  ╚══════════════════════════════════════════════════╝\n');
  process.stderr.write('\n');
  process.stderr.write('  Answer these questions in your own words.\n');
  process.stderr.write('  There are no wrong answers — just say what you mean.\n');
  process.stderr.write('  The AI will structure your answers into a worldmodel.\n\n');

  for (const q of QUESTIONS) {
    const answer = await new Promise<string>((resolve) => {
      process.stderr.write(`  \x1b[1m${q.question}\x1b[0m\n`);
      process.stderr.write(`  \x1b[2m${q.placeholder}\x1b[0m\n`);
      rl.question('  > ', (ans) => {
        process.stderr.write('\n');
        resolve(ans.trim());
      });
    });
    answers[q.id] = answer;
  }

  rl.close();

  return answers as unknown as ConversationalAnswers;
}

/**
 * Structure answers into a .worldmodel.md using AI.
 */
export async function structureWorldmodel(
  answers: ConversationalAnswers,
  apiKey: string,
): Promise<string> {
  const prompt = buildStructuringPrompt(answers);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: 'You are a behavioral model architect. You take conversational answers about an organization\'s values, purpose, and priorities, and structure them into a precise .worldmodel.md file that follows the NeuroVerseOS three-layer format. Output ONLY the markdown file content, nothing else.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`AI structuring failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
  };

  const text = data.content
    ?.filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('');

  if (!text) throw new Error('AI returned no content');

  // Clean markdown fences if present
  return text.replace(/^```markdown\n?/, '').replace(/\n?```$/, '').trim();
}

function buildStructuringPrompt(answers: ConversationalAnswers): string {
  return `Structure these conversational answers into a .worldmodel.md file.

The file MUST follow this exact three-layer format:

---
name: ${answers.name}
version: 1.0.0
---

# Core Model Geometry

## Mission
(from the mission answer)

## Domains
(2-4 domains from the domains answer, each with:)
### Domain Name
#### Skills (8-10 skills per domain, inferred from the answers)
#### Values (3-4 values per domain, drawn from the non-negotiables + mission)

## Overlap Effects
(from the overlaps answer, formatted as: Domain A + Domain B = Emergent State)

## Center Identity
(from the center answer)

# Contextual Modifiers

## Authority Layers
(infer 4-5 authority levels appropriate to this organization)

## Spatial Contexts
(infer 4-5 contexts where behavior happens)

## Interpretation Rules
(infer 3-5 rules about how context changes meaning)

# Evolution Layer

## Aligned Behaviors
(from the success answer, expanded to 5-8 items)

## Drift Behaviors
(from the drift answer, expanded to 5-8 items)

## Signals
(infer 5-7 observable signals from the answers, snake_case)

## Decision Priorities
(from the priorities answer, formatted as: preferred > secondary)

## Evolution Conditions
(infer 3-5 conditions for when the model should adapt)

HERE ARE THE ANSWERS:

Name: ${answers.name}

Mission: ${answers.mission}

Domains: ${answers.domains}

Overlaps: ${answers.overlaps}

Center identity: ${answers.center}

Non-negotiables: ${answers.nonnegotiables}

Success looks like: ${answers.success}

Drift looks like: ${answers.drift}

Priorities: ${answers.priorities}

Output ONLY the .worldmodel.md content. No explanation. No commentary. Just the file.`;
}

/**
 * Save the worldmodel to disk.
 */
export function saveWorldmodel(content: string, outputPath: string): string {
  const resolved = resolve(outputPath);
  writeFileSync(resolved, content, 'utf-8');
  return resolved;
}
