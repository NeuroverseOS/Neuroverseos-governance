/**
 * ZoneRules — the per-zone rules a pair of smart glasses enforces on-device.
 *
 * Structurally identical to `ZoneRules` in `@neuroverseos/governance/spatial`
 * (and its `mergeRules`), copied here so this package has no dependencies.
 * Output from `glassesZoneRules()` therefore feeds that package's spatial
 * engine or MentraOS adapter unchanged. That package is optional, never
 * required.
 */

export interface ZoneRules {
  /** Camera policy in this zone */
  camera: 'allowed' | 'confirm_each' | 'blocked';

  /** Microphone / recording policy */
  microphone: 'allowed' | 'confirm_each' | 'blocked';

  /** AI data send policy (sending captured data to AI providers) */
  aiDataSend: 'allowed' | 'declared_only' | 'confirm_each' | 'blocked';

  /** AI action policy (AI taking actions on user's behalf) */
  aiActions: 'allowed' | 'confirm_all' | 'blocked';

  /** AI recommendations / suggestions policy */
  aiRecommendations: 'allowed' | 'non_commercial' | 'blocked';

  /** Location sharing policy */
  locationSharing: 'allowed' | 'confirm_each' | 'blocked';

  /** Display behavior — can AI overlay content in this space? */
  aiOverlay: 'allowed' | 'non_obstructive' | 'blocked';

  /** Data retention — can apps retain data captured in this zone? */
  dataRetention: 'allowed' | 'session_only' | 'blocked';

  /** Commercial behavior — can AI suggest purchases, compare prices? */
  commercialAI: 'allowed' | 'blocked';

  /** Bystander protection — are there non-consenting people present? */
  bystanderProtection: 'standard' | 'elevated' | 'strict';

  /** Custom constraints (zone-specific) */
  custom?: ZoneCustomRule[];
}

export interface ZoneCustomRule {
  /** Rule identifier */
  id: string;

  /** Human-readable description */
  description: string;

  /** What intent this blocks/modifies */
  targetIntent: string;

  /** What happens */
  effect: 'block' | 'confirm' | 'modify';

  /** Why this rule exists */
  rationale: string;
}

// ─── Restrictiveness Orderings ───────────────────────────────────────────────
// Higher index = more restrictive. Used by mostRestrictive().

const CAMERA_ORDER = ['allowed', 'confirm_each', 'blocked'] as const;
const MIC_ORDER = ['allowed', 'confirm_each', 'blocked'] as const;
const AI_DATA_ORDER = ['allowed', 'declared_only', 'confirm_each', 'blocked'] as const;
const AI_ACTION_ORDER = ['allowed', 'confirm_all', 'blocked'] as const;
const AI_REC_ORDER = ['allowed', 'non_commercial', 'blocked'] as const;
const LOCATION_ORDER = ['allowed', 'confirm_each', 'blocked'] as const;
const OVERLAY_ORDER = ['allowed', 'non_obstructive', 'blocked'] as const;
const RETENTION_ORDER = ['allowed', 'session_only', 'blocked'] as const;
const COMMERCIAL_ORDER = ['allowed', 'blocked'] as const;
const BYSTANDER_ORDER = ['standard', 'elevated', 'strict'] as const;

function mostRestrictive<T extends string>(a: T, b: T, order: readonly T[]): T {
  const idxA = order.indexOf(a);
  const idxB = order.indexOf(b);
  return idxA >= idxB ? a : b;
}

/**
 * Merge two ZoneRules, taking the most restrictive value for each field.
 * This is the core of "most restrictive wins."
 */
export function mergeRules(a: ZoneRules, b: ZoneRules): ZoneRules {
  return {
    camera: mostRestrictive(a.camera, b.camera, CAMERA_ORDER),
    microphone: mostRestrictive(a.microphone, b.microphone, MIC_ORDER),
    aiDataSend: mostRestrictive(a.aiDataSend, b.aiDataSend, AI_DATA_ORDER),
    aiActions: mostRestrictive(a.aiActions, b.aiActions, AI_ACTION_ORDER),
    aiRecommendations: mostRestrictive(a.aiRecommendations, b.aiRecommendations, AI_REC_ORDER),
    locationSharing: mostRestrictive(a.locationSharing, b.locationSharing, LOCATION_ORDER),
    aiOverlay: mostRestrictive(a.aiOverlay, b.aiOverlay, OVERLAY_ORDER),
    dataRetention: mostRestrictive(a.dataRetention, b.dataRetention, RETENTION_ORDER),
    commercialAI: mostRestrictive(a.commercialAI, b.commercialAI, COMMERCIAL_ORDER),
    bystanderProtection: mostRestrictive(a.bystanderProtection, b.bystanderProtection, BYSTANDER_ORDER),
    custom: [...(a.custom ?? []), ...(b.custom ?? [])],
  };
}
