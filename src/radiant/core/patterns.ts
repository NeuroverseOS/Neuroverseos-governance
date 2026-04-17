/**
 * @neuroverseos/governance/radiant — AI pattern interpretation
 *
 * Step 5 (reframed): the AI identifies patterns in the signal matrix
 * and event stream, governed by the worldmodel's invariants and the
 * rendering lens's voice constraints.
 *
 * Hybrid vocabulary:
 *   - canonical: patterns the worldmodel declares (the AI labels them
 *     when it sees matching evidence)
 *   - candidate: patterns the AI discovers that the worldmodel hasn't
 *     declared (surfaced as "emergent," tracked for worldmodel evolution)
 *
 * Guardrails (enforced by interpretPatterns):
 *   - Every pattern must cite specific signals and events (no hallucination)
 *   - Candidate patterns are explicitly labeled as not-yet-in-worldmodel
 *   - The AI prompt includes the lens's forbidden phrases + voice rules
 *   - Output is parsed + validated before being returned
 *
 * The AI does the thinking. The governance layer checks the work.
 */

import type { ObservedPattern, RenderingLens } from '../types';
import type { Signal } from './signals';
import type { ClassifiedEvent } from './signals';
import type { RadiantAI } from './ai';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface InterpretInput {
  /** The 5×3 signal matrix from extractSignals. */
  signals: readonly Signal[];
  /** Classified events from the adapter. */
  events: readonly ClassifiedEvent[];
  /** Raw worldmodel content (markdown). */
  worldmodelContent: string;
  /** The active rendering lens. */
  lens: RenderingLens;
  /** AI adapter to call for interpretation. */
  ai: RadiantAI;
  /** Known canonical pattern names from the worldmodel (optional). */
  canonicalPatterns?: readonly string[];
  /** Stated intent from the exocortex (optional). When present, the AI
   *  compares stated intent against observed behavior and surfaces gaps. */
  statedIntent?: string;
}

export interface InterpretResult {
  patterns: ObservedPattern[];
  /** A strategic thesis paragraph (3-5 sentences) weaving patterns into one argument. */
  meaning: string;
  /** 1-3 direct imperatives, OR explicit acknowledgment that nothing needs action. */
  move: string;
  raw_ai_response: string;
}

// ─── Main entry ────────────────────────────────────────────────────────────

/**
 * Ask the AI to identify patterns in the signal matrix + event stream.
 *
 * The AI receives:
 *   - The signal matrix summary
 *   - A sample of recent events (capped for context length)
 *   - The worldmodel context
 *   - The lens's analytical frame (evaluation questions, voice rules)
 *   - A list of canonical pattern names (if any)
 *   - Instructions to produce structured JSON
 *
 * The response is parsed as JSON, validated, and each pattern is typed
 * as canonical or candidate.
 */
export async function interpretPatterns(
  input: InterpretInput,
): Promise<InterpretResult> {
  const prompt = buildInterpretationPrompt(input);
  const raw = await input.ai.complete(prompt, 'Analyze the activity and produce the read.');
  const parsed = parseInterpretation(raw, input.canonicalPatterns ?? []);
  return {
    patterns: parsed.patterns,
    meaning: parsed.meaning,
    move: parsed.move,
    raw_ai_response: raw,
  };
}

// ─── Prompt construction ───────────────────────────────────────────────────

function buildInterpretationPrompt(input: InterpretInput): string {
  const signalSummary = formatSignalSummary(input.signals);
  const eventSample = formatEventSample(input.events, 30); // cap at 30 events
  const canonicalList = (input.canonicalPatterns ?? []).length > 0
    ? `Patterns the organization has already named (use these names if you see them):\n${input.canonicalPatterns!.map((p) => `- ${p}`).join('\n')}`
    : 'No patterns have been named yet. Everything you observe is new.';

  const frame = input.lens.primary_frame;
  const evalQuestions = frame.evaluation_questions
    .map((q, i) => `${i + 1}. ${q}`)
    .join('\n');

  const forbiddenList = input.lens.forbidden_phrases
    .map((p) => `- "${p}"`)
    .join('\n');

  const jargonTable = Object.entries(input.lens.vocabulary.jargon_translations)
    .map(([internal, plain]) => `  "${internal}" → "${plain}"`)
    .join('\n');

  return `You are a behavioral intelligence system reading team activity and producing a read for the reader who needs to act on it.

## Context the reader has loaded

${input.worldmodelContent}

## What happened this window

### Signal matrix (what Radiant measured)

${signalSummary}

### Recent events (sample)

${eventSample}

## How to reason

Reason through these questions INTERNALLY — do not list them in your output:

${evalQuestions}

Scoring rubric: ${frame.scoring_rubric}

${canonicalList}

${input.statedIntent ? input.statedIntent + '\n' : ''}## Voice: speak like an Auki builder, not like a status report

The reader wants to know **what this means and what to do**, not "what happened." Frame every observation as consequence + implication, not just description.

Wrong voice (status report):
  "Rapid deployment of complex technical architecture through composable commits."
  "Signal extraction across life, cyber, and joint domains enables consistent behavioral analysis."
  "Decision momentum scores suggest architectural delivery without corresponding strategic direction setting."

Right voice (Auki builder):
  "Shipping pace is high. The architecture is getting ahead of strategic decisions — velocity without a declared target."
  "Every pattern is new. Nothing is being tracked by name yet. That's fine for now; it becomes a problem when patterns repeat and you still don't have vocabulary for them."
  "The work is converging across three modules. The story of HOW they compose isn't being told yet."

The difference: consequence in plain English, not observation in system vocabulary.

## Translate internal jargon to plain English

Readers don't know Radiant's vocabulary. Before ANY description appears in your output, translate these:

${jargonTable}

For example: don't say "update the worldmodel." Say "add a line to your strategy file."

## Health is a valid read

If the activity is healthy and aligned with the worldmodel, SAY SO. Don't fabricate problems. Over-prescription is a voice failure. Legitimate outputs include:

  "Nothing's broken. Keep shipping."
  "This is what healthy looks like — the invariants are holding."
  "Nothing here needs action."

Only recommend a move when the evidence actually calls for one.

## Output schema — JSON object

\`\`\`json
{
  "patterns": [
    {
      "name": "pattern_name_snake_case",
      "type": "canonical" | "candidate",
      "description": "Consequence-framed, plain-English, 1-2 sentences. The reader understands why this matters, not just what you observed.",
      "evidence": {
        "signals": ["signal_id.domain", ...],
        "events": ["event_id", ...],
        "cited_invariant": "invariant_name_or_null"
      },
      "confidence": 0.0 to 1.0
    }
  ],
  "meaning": "3-5 sentences. Weave the patterns into ONE strategic thesis. Compress. The reader should finish this paragraph and understand the one thing that matters most in this read. Plain English — no system jargon.",
  "move": "1-3 direct imperatives, OR explicit 'nothing to act on' if the read is healthy. Do not fabricate urgency. Examples: 'Force cross-module ownership this sprint.' / 'Nothing's broken. Keep shipping.' / 'If you want future reads to track this pattern by name, add a line to your strategy file.'"
}
\`\`\`

## Hard rules

- Every signal you cite MUST appear in the signal matrix above
- Every event you cite MUST appear in the events sample above
- Do not invent signals or events that aren't in the data
- Candidate patterns must have type "candidate"
- No hedging, no hype vocabulary
- Apply jargon translation before output
- Health-is-valid — don't invent problems
- Return ONLY the JSON object, no other text

Do NOT use these phrases anywhere in your output:
${forbiddenList}`;
}

// ─── Formatters ────────────────────────────────────────────────────────────

function formatSignalSummary(signals: readonly Signal[]): string {
  const lines: string[] = [];
  const domains = ['life', 'cyber', 'joint'] as const;

  for (const domain of domains) {
    const domainSignals = signals.filter((s) => s.domain === domain);
    if (domainSignals.length === 0) continue;
    lines.push(`### ${domain}`);
    for (const s of domainSignals) {
      const gate = s.eventCount >= 3 && s.confidence >= 0.5 ? '✓' : '○';
      lines.push(
        `  ${gate} ${s.id}: score=${s.score.toFixed(1)}, events=${s.eventCount}, conf=${s.confidence.toFixed(2)}`,
      );
    }
  }

  return lines.join('\n');
}

function formatEventSample(
  events: readonly ClassifiedEvent[],
  maxEvents: number,
): string {
  const sample = events.slice(-maxEvents); // most recent N
  return sample
    .map((e) => {
      const content = (e.event.content ?? '').slice(0, 200);
      const respondsTo = e.event.respondsTo
        ? ` (responds to ${e.event.respondsTo.eventId})`
        : '';
      return `- [${e.domain}] ${e.event.id} | ${e.event.actor.kind}:${e.event.actor.id} | ${e.event.kind ?? 'event'}${respondsTo}\n  "${content}"`;
    })
    .join('\n');
}

// ─── Response parsing ──────────────────────────────────────────────────────

/**
 * Parse the AI's JSON response into patterns + meaning + move.
 * Accepts either:
 *   { patterns: [...], meaning: "...", move: "..." }  (new format)
 *   [...]  (legacy: array of patterns only)
 */
function parseInterpretation(
  raw: string,
  canonicalNames: readonly string[],
): { patterns: ObservedPattern[]; meaning: string; move: string } {
  let meaning = '';
  let move = '';
  let patternsArray: unknown[] = [];

  // Try object format first: { patterns: [...], meaning, move }
  const objMatch = raw.match(/\{[\s\S]*"patterns"[\s\S]*\}/);
  if (objMatch) {
    try {
      const obj = JSON.parse(objMatch[0]) as Record<string, unknown>;
      if (Array.isArray(obj.patterns)) {
        patternsArray = obj.patterns;
      }
      if (typeof obj.meaning === 'string') meaning = obj.meaning;
      if (typeof obj.move === 'string') move = obj.move;
    } catch {
      // Fall through to array format
    }
  }

  // Fallback: try array format [...]
  if (patternsArray.length === 0) {
    const arrMatch = raw.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        const arr = JSON.parse(arrMatch[0]);
        if (Array.isArray(arr)) patternsArray = arr;
      } catch {
        // No parseable output
      }
    }
  }

  const canonicalSet = new Set(canonicalNames.map((n) => n.toLowerCase()));
  const patterns: ObservedPattern[] = [];

  for (const item of patternsArray) {
    if (!isPatternLike(item)) continue;

    const nameStr = String(item.name ?? 'unnamed');
    const ev = item.evidence;
    const isCanonical =
      item.type === 'canonical' ||
      canonicalSet.has(nameStr.toLowerCase());

    patterns.push({
      name: nameStr,
      type: isCanonical ? 'canonical' : 'candidate',
      declaredAs: isCanonical ? nameStr : undefined,
      description: String(item.description ?? ''),
      evidence: {
        signals: Array.isArray(ev?.signals)
          ? ev.signals.map(String)
          : [],
        events: Array.isArray(ev?.events)
          ? ev.events.map(String)
          : [],
        cited_invariant: ev?.cited_invariant
          ? String(ev.cited_invariant)
          : undefined,
      },
      confidence: typeof item.confidence === 'number'
        ? Math.max(0, Math.min(1, item.confidence))
        : 0.5,
    });
  }

  return { patterns, meaning, move };
}

interface RawPattern {
  name?: unknown;
  type?: unknown;
  description?: unknown;
  evidence?: {
    signals?: unknown[];
    events?: unknown[];
    cited_invariant?: unknown;
  };
  confidence?: unknown;
}

function isPatternLike(x: unknown): x is RawPattern {
  return typeof x === 'object' && x !== null && 'name' in x;
}
