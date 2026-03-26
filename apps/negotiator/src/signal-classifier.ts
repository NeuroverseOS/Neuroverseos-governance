/**
 * Negotiator Signal Classifier
 *
 * Proactive engine that analyzes conversation for behavioral signals.
 * Works with voice-only OR voice+camera. Camera adds weight but never
 * initiates a signal on its own (governance: no_camera_confidence).
 *
 * Signal types:
 *   1. Inconsistency — details that change across tellings
 *   2. Cognitive Load — unusual effort on simple questions
 *   3. Deflection — answering a different question
 *   4. Emotional Mismatch — tone doesn't match content
 *   5. Overcompensation — excessive emphasis where none was needed
 *
 * Escalation (governance: no_single_signal_escalation):
 *   0 signals → silence (most of the time)
 *   1 signal  → silence (single signals are normal behavior)
 *   2 signals → ~ insight (something to notice)
 *   3+ signals → ~~ or ~~~ insight (worth acting on)
 *
 * Punctuation system for monochrome display:
 *   ~    light signal — "something to notice"
 *   ~~   medium signal — "worth exploring"
 *   ~~~  strong signal — "slow down, multiple things don't line up"
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type SignalType = 'inconsistency' | 'cognitive_load' | 'deflection' | 'emotional_mismatch' | 'overcompensation';

export type SignalStrength = 'none' | 'light' | 'medium' | 'strong';

export type Sensitivity = 'conservative' | 'standard' | 'sensitive';

export interface DetectedSignal {
  type: SignalType;
  description: string;
  timestamp: number;
}

export interface SignalClassification {
  action: 'SILENT' | 'SURFACE';
  strength: SignalStrength;
  prefix: '' | '~' | '~~' | '~~~';
  signals: DetectedSignal[];
  reasoning: string;
  /** Suggested negotiation move if SURFACE */
  suggestedMove?: string;
}

// ─── Classifier Prompts ─────────────────────────────────────────────────────

const CLASSIFIER_PROMPT_VOICE_ONLY = `You are a behavioral signal classifier for a negotiation app on smart glasses. You analyze conversation transcripts for patterns that suggest misalignment between words and intent.

You are NOT a lie detector. You detect PATTERNS, not TRUTH.

## The 5 Signal Types

1. INCONSISTENCY — Details that changed from earlier in the conversation. Timelines that shifted. Facts that don't match.
2. COGNITIVE_LOAD — Unusual pauses before simple questions. Overly complex explanations for simple things. Answers that sound rehearsed.
3. DEFLECTION — Answering a different question than was asked. Changing the subject. Redirecting to tangents.
4. EMOTIONAL_MISMATCH — Tone that doesn't match content. Flat delivery of exciting news. Excessive emotion on minor points.
5. OVERCOMPENSATION — "Honestly," "I swear," "to tell you the truth" unprompted. Repeating the same point without being asked. Over-justifying simple answers.

## Critical Rules

- A SINGLE signal = SILENT. Always. One hesitation is normal. One deflection is normal. NEVER surface a single signal.
- Consider CONTEXT. Nervousness is not deception. Second language speakers pause more. Some people over-explain naturally.
- NEVER claim someone is lying. Frame everything as "something to look at" or "worth clarifying."

## Output Format (JSON only)

If no actionable pattern:
{"action":"SILENT","strength":"none","signals":[],"reasoning":"normal conversation"}

If 2+ signals detected:
{"action":"SURFACE","strength":"light","signals":[{"type":"deflection","description":"didn't answer the timeline question"},{"type":"cognitive_load","description":"long pause before simple answer"}],"reasoning":"two distinct signals in close proximity","suggestedMove":"Ask the timeline question again, differently"}

Strength mapping:
- 2 signals = "light" (prefix ~)
- 3 signals = "medium" (prefix ~~)
- 4+ signals = "strong" (prefix ~~~)`;

const CLASSIFIER_PROMPT_WITH_CAMERA = `${CLASSIFIER_PROMPT_VOICE_ONLY}

## Camera Signals (SECONDARY ONLY)

You may also receive camera context describing the other person's visual behavior. Camera signals can ADD WEIGHT to voice/language signals but can NEVER initiate a flag on their own.

Camera observations that may be relevant:
- Gaze avoidance during a specific claim
- Sudden body shift when a topic is raised
- Facial expression that contradicts verbal tone

Camera observations that are NOT signals:
- Normal eye movement
- Fidgeting (could be anything)
- Looking away briefly (normal)

RULE: If the ONLY signal is camera-based, output SILENT. Camera needs voice/language signals to be meaningful.`;

// ─── Classifier Engine ──────────────────────────────────────────────────────

/** How many recent signals to track for deduplication */
const SIGNAL_CACHE_SIZE = 15;
const SIMILARITY_THRESHOLD = 0.6;

export class SignalClassifier {
  private sensitivity: Sensitivity;
  private conversationBuffer: Array<{ text: string; timestamp: number }> = [];
  private recentSignals: Array<{ text: string; timestamp: number }> = [];
  private cameraEnabled: boolean;
  private maxConversationEntries = 25;

  constructor(sensitivity: Sensitivity = 'standard', cameraEnabled: boolean = false) {
    this.sensitivity = sensitivity;
    this.cameraEnabled = cameraEnabled;
  }

  setSensitivity(s: Sensitivity): void { this.sensitivity = s; }
  getSensitivity(): Sensitivity { return this.sensitivity; }
  setCameraEnabled(enabled: boolean): void { this.cameraEnabled = enabled; }

  addUtterance(text: string): void {
    this.conversationBuffer.push({ text, timestamp: Date.now() });
    if (this.conversationBuffer.length > this.maxConversationEntries) {
      this.conversationBuffer = this.conversationBuffer.slice(-this.maxConversationEntries);
    }
  }

  getRecentConversation(maxEntries: number = 15): string {
    return this.conversationBuffer
      .slice(-maxEntries)
      .map(e => e.text)
      .join('\n');
  }

  /**
   * Classify the current conversation moment.
   * Returns SILENT or SURFACE with signal details and strength prefix.
   */
  async classify(
    callAI: (systemPrompt: string, userMessage: string) => Promise<string>,
    cameraContext?: string,
  ): Promise<SignalClassification> {
    const conversation = this.getRecentConversation();
    if (!conversation.trim()) {
      return { action: 'SILENT', strength: 'none', prefix: '', signals: [], reasoning: 'no conversation' };
    }

    const prompt = this.cameraEnabled && cameraContext
      ? CLASSIFIER_PROMPT_WITH_CAMERA
      : CLASSIFIER_PROMPT_VOICE_ONLY;

    let userMessage = `Recent conversation:\n${conversation}`;
    if (this.cameraEnabled && cameraContext) {
      userMessage += `\n\nCamera context:\n${cameraContext}`;
    }

    try {
      const raw = await callAI(prompt, userMessage);
      const cleaned = raw.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(cleaned) as SignalClassification;

      if (!parsed.action || !['SILENT', 'SURFACE'].includes(parsed.action)) {
        return { action: 'SILENT', strength: 'none', prefix: '', signals: [], reasoning: 'invalid classification' };
      }

      // Enforce governance: no single signal escalation
      if (parsed.signals && parsed.signals.length < 2) {
        return { action: 'SILENT', strength: 'none', prefix: '', signals: [], reasoning: 'single signal suppressed (governance)' };
      }

      // Enforce governance: no_camera_confidence (code-level, not just prompt)
      // If ALL signals are camera-based (gaze, movement, expression), suppress.
      // Camera can only ADD to voice/language signals, never initiate.
      if (parsed.signals && parsed.signals.length > 0) {
        const cameraOnlyTypes = new Set(['gaze_avoidance', 'body_shift', 'facial_expression', 'head_movement']);
        const allCamera = parsed.signals.every(s => cameraOnlyTypes.has(s.type));
        if (allCamera) {
          return { action: 'SILENT', strength: 'none', prefix: '', signals: [], reasoning: 'camera-only signals suppressed (governance: no_camera_confidence)' };
        }
      }

      // Enforce sensitivity thresholds
      const threshold = this.sensitivity === 'conservative' ? 3 : 2;
      if (parsed.signals && parsed.signals.length < threshold) {
        return { action: 'SILENT', strength: 'none', prefix: '', signals: [], reasoning: `below ${this.sensitivity} threshold` };
      }

      // Map strength to prefix
      const signalCount = parsed.signals?.length ?? 0;
      let prefix: '' | '~' | '~~' | '~~~' = '';
      let strength: SignalStrength = 'none';

      if (signalCount >= 4) { prefix = '~~~'; strength = 'strong'; }
      else if (signalCount >= 3) { prefix = '~~'; strength = 'medium'; }
      else if (signalCount >= 2) { prefix = '~'; strength = 'light'; }

      return { ...parsed, strength, prefix };
    } catch {
      return { action: 'SILENT', strength: 'none', prefix: '', signals: [], reasoning: 'classification error' };
    }
  }

  /**
   * Check if an insight is too similar to a recent one.
   */
  isDuplicate(text: string): boolean {
    const normalized = text.toLowerCase().trim();
    for (const recent of this.recentSignals) {
      if (computeSimilarity(normalized, recent.text.toLowerCase()) > SIMILARITY_THRESHOLD) {
        return true;
      }
    }
    return false;
  }

  recordInsight(text: string): void {
    this.recentSignals.push({ text, timestamp: Date.now() });
    if (this.recentSignals.length > SIGNAL_CACHE_SIZE) {
      this.recentSignals = this.recentSignals.slice(-SIGNAL_CACHE_SIZE);
    }
  }

  /**
   * Build the insight text for display on glasses.
   * Prefixed with ~ ~~ or ~~~ based on signal strength.
   */
  buildInsightText(classification: SignalClassification): string {
    if (classification.action !== 'SURFACE') return '';

    const signalNames = classification.signals.map(s => s.description).join(' + ');
    const move = classification.suggestedMove ?? '';

    if (move) {
      return `${classification.prefix} ${move}`;
    }

    return `${classification.prefix} ${signalNames}`;
  }

  destroy(): void {
    this.conversationBuffer = [];
    this.recentSignals = [];
  }
}

// ─── String Similarity (same as Lenses proactive engine) ────────────────────

function computeSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bigram = a.substring(i, i + 2);
    bigramsA.set(bigram, (bigramsA.get(bigram) ?? 0) + 1);
  }

  let intersections = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bigram = b.substring(i, i + 2);
    const count = bigramsA.get(bigram) ?? 0;
    if (count > 0) {
      bigramsA.set(bigram, count - 1);
      intersections++;
    }
  }

  return (2 * intersections) / (a.length + b.length - 2);
}
