/**
 * NeuroverseOS Shared Behavioral System
 *
 * One system. Three expressions. User-controlled adaptation.
 *
 * This module is imported by ALL NeuroverseOS apps (Lenses, StarTalk,
 * Negotiator, L<3gic). It provides:
 *
 *   1. Unified Journal — one schema for behavioral tracking across apps
 *   2. Signal Taxonomy — shared signal types with per-app mapping
 *   3. Mode Tracking — standardized mode tags across all apps
 *   4. Behavioral Sequence — nextAction tracking (acted/delayed/switched/dropped)
 *   5. Follow-through Rate — the north star metric
 *   6. Adaptation Control — user chooses how the system adapts
 *
 * Governance:
 *   - No truth claims
 *   - No single-signal outputs
 *   - No silent behavioral adaptation (user sees everything)
 *   - No user profiling beyond aggregate counts
 *   - "You respond best to..." = allowed
 *   - "You behave this way when..." = blocked
 *
 * Storage: MentraOS SimpleStorage (session.storage.set/get)
 *   - 1MB per app/user, 100KB per value
 *   - Persists across sessions automatically
 */

// ─── Signal Taxonomy ────────────────────────────────────────────────────────
// One shared vocabulary. All apps use the same signal names.
// Each app maps to the subset that's relevant.

export const SIGNAL_TYPES = {
  // Negotiator signals
  deflection: { label: 'Deflection', description: 'Answering a different question than asked' },
  inconsistency: { label: 'Inconsistency', description: 'Details that changed from earlier' },
  overcompensation: { label: 'Overcompensation', description: 'Excessive emphasis where none needed' },
  cognitive_load: { label: 'Cognitive Load', description: 'Unusual effort on simple questions' },
  emotional_mismatch: { label: 'Emotional Mismatch', description: 'Tone doesn\'t match content' },

  // Lenses signals (proactive)
  reframing_opportunity: { label: 'Reframing', description: 'Moment that benefits from perspective shift' },
  cognitive_distortion: { label: 'Cognitive Distortion', description: 'Thought pattern that doesn\'t match reality' },
  decision_moment: { label: 'Decision Moment', description: 'User at a crossroads' },
  avoidance: { label: 'Avoidance', description: 'Actively avoiding something important' },

  // StarTalk signals
  communication_mismatch: { label: 'Style Mismatch', description: 'Communication styles clashing' },
  compatibility_tension: { label: 'Compatibility Tension', description: 'Known sign friction point' },
} as const;

export type SignalType = keyof typeof SIGNAL_TYPES;

/** Which signals each app uses */
export const APP_SIGNALS: Record<string, SignalType[]> = {
  negotiator: ['deflection', 'inconsistency', 'overcompensation', 'cognitive_load', 'emotional_mismatch'],
  lenses: ['reframing_opportunity', 'cognitive_distortion', 'decision_moment', 'avoidance'],
  startalk: ['communication_mismatch', 'compatibility_tension', 'emotional_mismatch'],
};

// ─── Mode Taxonomy ──────────────────────────────────────────────────────────
// All apps output [MODE:X] tags. Same modes everywhere.

export const MODES = ['direct', 'translate', 'reflect', 'challenge', 'teach'] as const;
export type Mode = typeof MODES[number];

// ─── Behavioral Sequence ────────────────────────────────────────────────────
// What happened AFTER the signal was shown?

export type NextAction =
  | 'acted'     // User tapped to follow up — strong signal
  | 'delayed'   // User acted later in the session — latent resonance
  | 'switched'  // User changed voice/context — wrong lens, right signal
  | 'dropped';  // No interaction within window — wrong moment or weak signal

// ─── Adaptation Control ─────────────────────────────────────────────────────
// User chooses how the system adapts. No silent optimization.

export type AdaptationMode =
  | 'lean'      // Prioritize high-effectiveness signals
  | 'balanced'  // Even distribution across signal types
  | 'challenge'; // Favor lower-success but harder/deeper signals

// ─── Unified Journal ────────────────────────────────────────────────────────

export interface SignalRecord {
  signalType: SignalType;
  app: string;
  mode: Mode;
  dismissed: boolean;
  nextAction: NextAction;
  timeIntoSession: number;  // seconds since session start
  proactive: boolean;       // AI initiated vs user tapped
}

export interface SignalEffectiveness {
  surfaced: number;
  acted: number;
  dismissed: number;
}

export interface UnifiedJournal {
  // ── Aggregate counts ──────────────────────────────────────────────────
  totalSignals: number;
  totalFollowThroughs: number;
  totalDismissals: number;
  totalSessions: number;
  currentStreakDays: number;
  lastSessionDate: string;

  // ── Per-signal effectiveness ──────────────────────────────────────────
  signalEffectiveness: Record<string, SignalEffectiveness>;

  // ── Per-mode effectiveness ────────────────────────────────────────────
  modeEffectiveness: Record<string, { used: number; acted: number }>;

  // ── Behavioral patterns ───────────────────────────────────────────────
  behaviorPatterns: {
    acted: number;
    delayed: number;
    switched: number;
    dropped: number;
  };

  // ── Rolling window (last 50 signals for pattern analysis) ─────────────
  recentSignals: SignalRecord[];

  // ── App-specific data (each app can store its own small blob) ─────────
  appData: Record<string, unknown>;
}

export const EMPTY_JOURNAL: UnifiedJournal = {
  totalSignals: 0,
  totalFollowThroughs: 0,
  totalDismissals: 0,
  totalSessions: 0,
  currentStreakDays: 0,
  lastSessionDate: '',
  signalEffectiveness: {},
  modeEffectiveness: {},
  behaviorPatterns: { acted: 0, delayed: 0, switched: 0, dropped: 0 },
  recentSignals: [],
  appData: {},
};

// ─── Journal Operations ─────────────────────────────────────────────────────

/** Calculate follow-through rate (0-100) */
export function followThroughRate(journal: UnifiedJournal): number {
  if (journal.totalSignals === 0) return 0;
  return Math.round((journal.totalFollowThroughs / journal.totalSignals) * 100);
}

/** Get the user's most effective signal type (needs 3+ data points) */
export function bestSignalType(journal: UnifiedJournal): string | null {
  let best: string | null = null;
  let bestRate = 0;
  for (const [type, stats] of Object.entries(journal.signalEffectiveness)) {
    if (stats.surfaced < 3) continue;
    const rate = stats.acted / stats.surfaced;
    if (rate > bestRate) { bestRate = rate; best = type; }
  }
  return best;
}

/** Get the user's most effective mode */
export function bestMode(journal: UnifiedJournal): Mode | null {
  let best: Mode | null = null;
  let bestRate = 0;
  for (const [mode, stats] of Object.entries(journal.modeEffectiveness)) {
    if (stats.used < 3) continue;
    const rate = stats.acted / stats.used;
    if (rate > bestRate) { bestRate = rate; best = mode as Mode; }
  }
  return best;
}

/** Record a signal being surfaced */
export function recordSignalSurfaced(journal: UnifiedJournal, signalType: string): void {
  journal.totalSignals++;
  const eff = journal.signalEffectiveness[signalType] ?? { surfaced: 0, acted: 0, dismissed: 0 };
  eff.surfaced++;
  journal.signalEffectiveness[signalType] = eff;
}

/** Record a mode being used */
export function recordModeUsed(journal: UnifiedJournal, mode: string): void {
  const eff = journal.modeEffectiveness[mode] ?? { used: 0, acted: 0 };
  eff.used++;
  journal.modeEffectiveness[mode] = eff;
}

/** Record user acting on a signal (follow-through) */
export function recordFollowThrough(
  journal: UnifiedJournal,
  signalTypes: string[],
  mode: string,
  app: string,
  timeIntoSession: number,
  proactive: boolean,
): void {
  journal.totalFollowThroughs++;
  journal.behaviorPatterns.acted++;

  for (const type of signalTypes) {
    const eff = journal.signalEffectiveness[type] ?? { surfaced: 0, acted: 0, dismissed: 0 };
    eff.acted++;
    journal.signalEffectiveness[type] = eff;
  }

  const modeEff = journal.modeEffectiveness[mode] ?? { used: 0, acted: 0 };
  modeEff.acted++;
  journal.modeEffectiveness[mode] = modeEff;

  for (const type of signalTypes) {
    journal.recentSignals.push({
      signalType: type as SignalType,
      app,
      mode: mode as Mode,
      dismissed: false,
      nextAction: 'acted',
      timeIntoSession,
      proactive,
    });
  }

  trimRecentSignals(journal);
}

/** Record user dismissing a signal */
export function recordDismissal(
  journal: UnifiedJournal,
  signalTypes: string[],
  app: string,
  timeIntoSession: number,
  proactive: boolean,
): void {
  journal.totalDismissals++;
  journal.behaviorPatterns.dropped++;

  for (const type of signalTypes) {
    const eff = journal.signalEffectiveness[type] ?? { surfaced: 0, acted: 0, dismissed: 0 };
    eff.dismissed++;
    journal.signalEffectiveness[type] = eff;
  }

  for (const type of signalTypes) {
    journal.recentSignals.push({
      signalType: type as SignalType,
      app,
      mode: 'direct' as Mode,
      dismissed: true,
      nextAction: 'dropped',
      timeIntoSession,
      proactive,
    });
  }

  trimRecentSignals(journal);
}

/** Update streak at session end */
export function updateStreak(journal: UnifiedJournal): void {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  if (journal.lastSessionDate === yesterday) {
    journal.currentStreakDays++;
  } else if (journal.lastSessionDate !== today) {
    journal.currentStreakDays = 1;
  }

  journal.lastSessionDate = today;
  journal.totalSessions++;
}

function trimRecentSignals(journal: UnifiedJournal): void {
  if (journal.recentSignals.length > 50) {
    journal.recentSignals = journal.recentSignals.slice(-50);
  }
}

// ─── Dashboard Formatters ───────────────────────────────────────────────────

/** Format dashboard string for any app (60 char max for MentraOS) */
export function formatDashboard(
  appLabel: string,
  journal: UnifiedJournal,
  sessionMinutes: number,
  sessionSignals: number,
): string {
  const ft = followThroughRate(journal);
  const streak = journal.currentStreakDays;
  return `${appLabel} · ${sessionSignals} · ${ft}% acted · ${streak}d · ${sessionMinutes}m`;
}

// ─── Mode Tag Parser ────────────────────────────────────────────────────────

/** Strip [MODE:X] tag from AI response and return the mode + clean text */
export function parseAndStripModeTag(text: string): { mode: Mode | null; text: string } {
  const match = text.match(/^\[MODE:(\w+)\]\n?/);
  if (match) {
    const mode = MODES.includes(match[1] as Mode) ? (match[1] as Mode) : null;
    return { mode, text: text.replace(/^\[MODE:\w+\]\n?/, '') };
  }
  return { mode: null, text };
}

// ─── SimpleStorage Helpers ──────────────────────────────────────────────────

/** Load journal from MentraOS SimpleStorage */
export async function loadJournal(storage: { get(key: string): Promise<unknown> }): Promise<UnifiedJournal> {
  try {
    const stored = await storage.get('neuroverse_journal');
    if (stored) return stored as UnifiedJournal;
  } catch { /* first session */ }
  return { ...EMPTY_JOURNAL, signalEffectiveness: {}, modeEffectiveness: {}, behaviorPatterns: { acted: 0, delayed: 0, switched: 0, dropped: 0 }, recentSignals: [], appData: {} };
}

/** Save journal to MentraOS SimpleStorage */
export async function saveJournal(storage: { set(key: string, value: unknown): Promise<void> }, journal: UnifiedJournal): Promise<void> {
  try {
    await storage.set('neuroverse_journal', journal);
  } catch (err) {
    console.warn('[NeuroverseOS] Failed to save journal:', err instanceof Error ? err.message : err);
  }
}
