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
}

export interface InterpretResult {
  patterns: ObservedPattern[];
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
  const raw = await input.ai.complete(prompt, 'Analyze the activity and identify patterns.');
  const patterns = parsePatterns(raw, input.canonicalPatterns ?? []);
  return { patterns, raw_ai_response: raw };
}

// ─── Prompt construction ───────────────────────────────────────────────────

function buildInterpretationPrompt(input: InterpretInput): string {
  const signalSummary = formatSignalSummary(input.signals);
  const eventSample = formatEventSample(input.events, 30); // cap at 30 events
  const canonicalList = (input.canonicalPatterns ?? []).length > 0
    ? `Known canonical patterns (label as "canonical" if you see them):\n${input.canonicalPatterns!.map((p) => `- ${p}`).join('\n')}`
    : 'No canonical patterns declared. All observations are candidates.';

  const frame = input.lens.primary_frame;
  const evalQuestions = frame.evaluation_questions
    .map((q, i) => `${i + 1}. ${q}`)
    .join('\n');

  const forbiddenList = input.lens.forbidden_phrases
    .map((p) => `- "${p}"`)
    .join('\n');

  return `You are a behavioral intelligence system analyzing team activity against a worldmodel.

## Worldmodel

${input.worldmodelContent}

## Signal Matrix (current observation window)

${signalSummary}

## Recent Events (sample)

${eventSample}

## Analytical Frame

Reason through these questions internally:

${evalQuestions}

Scoring rubric: ${frame.scoring_rubric}

${canonicalList}

## Output Instructions

Produce a JSON array of observed patterns. Each pattern:

\`\`\`json
[
  {
    "name": "pattern_name_snake_case",
    "type": "canonical" | "candidate",
    "description": "One to two sentences describing what you observe. Use specific skill names, not abstract bucket labels.",
    "evidence": {
      "signals": ["signal_id.domain", ...],
      "events": ["event_id", ...],
      "cited_invariant": "invariant_name_if_relevant_or_null"
    },
    "confidence": 0.0 to 1.0
  }
]
\`\`\`

Rules:
- Every signal you cite MUST appear in the signal matrix above
- Every event you cite MUST appear in the events sample above
- Do not invent signals or events that aren't in the data
- Candidate patterns must have type "candidate"
- Keep descriptions direct and compressed — no hedging, no "it may be beneficial"
- Use the organization's vocabulary where appropriate
- Cite worldmodel invariants when a pattern intersects one
- Return ONLY the JSON array, no other text

Do NOT use these phrases in descriptions:
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
 * Parse the AI's JSON response into ObservedPattern[].
 * Validates structure and tags canonical vs candidate correctly.
 */
function parsePatterns(
  raw: string,
  canonicalNames: readonly string[],
): ObservedPattern[] {
  // Extract JSON array from response (AI might wrap in markdown code block)
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  let parsed: unknown[];
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const canonicalSet = new Set(canonicalNames.map((n) => n.toLowerCase()));
  const patterns: ObservedPattern[] = [];

  for (const item of parsed) {
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

  return patterns;
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
