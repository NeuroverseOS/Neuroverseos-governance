/**
 * NeuroverseOS Shared Behavioral System
 *
 * Shared CODE, not shared data. Each app writes its own journal
 * to its own SimpleStorage. But they all use the same schema,
 * the same mode vocabulary, and the same behavioral tracking.
 *
 * What's shared:
 *   1. Journal Schema — same structure for behavioral tracking
 *   2. Mode Vocabulary — direct/translate/reflect/challenge/teach (universal)
 *   3. Behavioral Sequence — nextAction: acted/delayed/switched/dropped
 *   4. Follow-through Rate — the north star metric
 *   5. Adaptation Control — user chooses how the system adapts
 *   6. Dashboard Formatters — consistent display across apps
 *
 * What's NOT shared:
 *   - Signal types — each app defines its own. Negotiator has "deflection."
 *     Lenses has "reframing_opportunity." StarTalk has "compatibility_tension."
 *     These don't transfer across apps. Modes do. Signals don't.
 *   - Data — each app has isolated SimpleStorage. No cross-app data access.
 *
 * Governance (honest framing):
 *   - This IS a behavioral model. Not "aggregate counts" — a user-owned
 *     behavioral model stored on their device. They can see it. They can
 *     delete it. That's the governance-safe version.
 *   - No silent adaptation — user sees what the system learns
 *   - No truth claims about other people
 *   - "You respond best to challenge mode" = allowed (about the user)
 *   - "This person is lying" = blocked (about someone else)
 *
 * Storage: MentraOS SimpleStorage (session.storage.set/get)
 *   - Per-app isolated namespace (apps cannot read each other's storage)
 *   - 1MB per app/user, 100KB per value
 *   - Persists across sessions automatically
 */

// ─── Mode Vocabulary (UNIVERSAL — shared across all apps) ───────────────────
// All apps output [MODE:X] tags. Same modes everywhere.
// This IS the cross-app learning layer. Modes transfer. Signals don't.

export const MODES = ['direct', 'translate', 'reflect', 'challenge', 'teach'] as const;
export type Mode = typeof MODES[number];

// ─── Behavioral Sequence ────────────────────────────────────────────────────
// What happened AFTER the insight was shown?
// This replaces the old dismissed: boolean with real behavioral data.

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

// ─── Journal Schema ─────────────────────────────────────────────────────────
// Same structure, per-app data. Signal types are string (app-defined).

export interface SignalRecord {
  /** App-specific signal type (e.g., "deflection" in Negotiator, "reframing" in Lenses) */
  signalType: string;
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

export interface AppJournal {
  // ── Aggregate counts ──────────────────────────────────────────────────
  totalSignals: number;
  totalFollowThroughs: number;
  totalDismissals: number;
  totalSessions: number;
  currentStreakDays: number;
  lastSessionDate: string;

  // ── Per-signal effectiveness (app-specific signal types) ──────────────
  signalEffectiveness: Record<string, SignalEffectiveness>;

  // ── Per-mode effectiveness (UNIVERSAL — the cross-app learning layer) ─
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

  // ── App-specific data (people memory, voice prefs, etc.) ──────────────
  appData: Record<string, unknown>;
}

export const EMPTY_JOURNAL: AppJournal = {
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

/** Calculate follow-through rate (0-100). The north star metric. */
export function followThroughRate(journal: AppJournal): number {
  if (journal.totalSignals === 0) return 0;
  return Math.round((journal.totalFollowThroughs / journal.totalSignals) * 100);
}

/** Get the user's most effective signal type (needs 3+ data points) */
export function bestSignalType(journal: AppJournal): string | null {
  let best: string | null = null;
  let bestRate = 0;
  for (const [type, stats] of Object.entries(journal.signalEffectiveness)) {
    if (stats.surfaced < 3) continue;
    const rate = stats.acted / stats.surfaced;
    if (rate > bestRate) { bestRate = rate; best = type; }
  }
  return best;
}

/** Get the user's most effective mode (universal across apps) */
export function bestMode(journal: AppJournal): Mode | null {
  let best: Mode | null = null;
  let bestRate = 0;
  for (const [mode, stats] of Object.entries(journal.modeEffectiveness)) {
    if (stats.used < 3) continue;
    const rate = stats.acted / stats.used;
    if (rate > bestRate) { bestRate = rate; best = mode as Mode; }
  }
  return best;
}

/** Record a signal being surfaced (signal type is app-defined) */
export function recordSignalSurfaced(journal: AppJournal, signalType: string): void {
  journal.totalSignals++;
  const eff = journal.signalEffectiveness[signalType] ?? { surfaced: 0, acted: 0, dismissed: 0 };
  eff.surfaced++;
  journal.signalEffectiveness[signalType] = eff;
}

/** Record a mode being used */
export function recordModeUsed(journal: AppJournal, mode: string): void {
  const eff = journal.modeEffectiveness[mode] ?? { used: 0, acted: 0 };
  eff.used++;
  journal.modeEffectiveness[mode] = eff;
}

/** Record user acting on a signal (follow-through) */
export function recordFollowThrough(
  journal: AppJournal,
  signalTypes: string[],
  mode: string,
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
      signalType: type,
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
  journal: AppJournal,
  signalTypes: string[],
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
      signalType: type,
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
export function updateStreak(journal: AppJournal): void {
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

function trimRecentSignals(journal: AppJournal): void {
  if (journal.recentSignals.length > 50) {
    journal.recentSignals = journal.recentSignals.slice(-50);
  }
}

// ─── Dashboard Formatters ───────────────────────────────────────────────────

/** Format dashboard string for any app (60 char max for MentraOS) */
export function formatDashboard(
  appLabel: string,
  journal: AppJournal,
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
// Each app calls these with its own session.storage.
// Data is per-app isolated — apps cannot read each other's journals.

const JOURNAL_KEY = 'app_journal';

/** Load journal from this app's SimpleStorage */
export async function loadJournal(storage: { get(key: string): Promise<unknown> }): Promise<AppJournal> {
  try {
    const stored = await storage.get(JOURNAL_KEY);
    if (stored) return stored as AppJournal;
  } catch { /* first session */ }
  return {
    ...EMPTY_JOURNAL,
    signalEffectiveness: {},
    modeEffectiveness: {},
    behaviorPatterns: { acted: 0, delayed: 0, switched: 0, dropped: 0 },
    recentSignals: [],
    appData: {},
  };
}

/** Save journal to this app's SimpleStorage */
export async function saveJournal(
  storage: { set(key: string, value: unknown): Promise<void> },
  journal: AppJournal,
): Promise<void> {
  try {
    await storage.set(JOURNAL_KEY, journal);
  } catch (err) {
    console.warn('[NeuroverseOS] Failed to save journal:', err instanceof Error ? err.message : err);
  }
}
