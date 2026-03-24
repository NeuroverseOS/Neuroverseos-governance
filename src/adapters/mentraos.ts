/**
 * NeuroVerse Adapter — MentraOS Smart Glasses
 *
 * The boundary layer between NeuroVerse governance and MentraOS SDK.
 *
 * This adapter provides three things MentraOS doesn't have:
 *   1. Context Resolver  — determines spatial governance posture from sensors
 *   2. Handshake Engine  — composes governance across multiple wearers
 *   3. Governed Executor — evaluates every SDK call against the world + context
 *
 * Architecture:
 *   User speech → classifyIntentWithAI(MENTRA_KNOWN_INTENTS)
 *   → MentraGovernedExecutor.evaluate(intent, context)
 *   → evaluateGuard(event, world) → verdict
 *   → MentraOS SDK call (or block)
 *
 * The adapter sits at:
 *   User → LLM → Intent → NeuroVerse Guard → Mentra SDK → Hardware
 *
 * Usage:
 *   import { createMentraGovernedExecutor } from '@neuroverseos/governance/adapters/mentraos';
 *
 *   const executor = await createMentraGovernedExecutor('./world/');
 *   const context = resolveContext({ location: 'public_indoor', nearbyWearers: 1 });
 *   const result = executor.evaluate('camera_photo_capture', context);
 */

import type { GuardEvent, GuardVerdict, GuardEngineOptions } from '../contracts/guard-contract';
import type { PlanDefinition, PlanProgress } from '../contracts/plan-contract';
import type { WorldDefinition } from '../types';
import { evaluateGuard } from '../engine/guard-engine';
import { loadWorld } from '../loader/world-loader';
import {
  GovernanceBlockedError as BaseGovernanceBlockedError,
  trackPlanProgress,
  buildEngineOptions,
} from './shared';
import type { PlanTrackingState, PlanTrackingCallbacks } from './shared';
import {
  getMentraIntent,
  MENTRA_KNOWN_INTENTS,
} from '../worlds/mentraos-intent-taxonomy';
import type {
  MentraIntentDefinition,
  MentraPermission,
  GlassesModel,
} from '../worlds/mentraos-intent-taxonomy';

// ─── Context Resolver ───────────────────────────────────────────────────────

/**
 * Spatial context state — the source of truth for where governance rules apply.
 *
 * This is what makes rules actually trigger. Without it, spatial_context
 * and bystanders_present are just state variables with no source.
 */
export interface SpatialContext {
  /** Physical environment classification */
  locationType: 'home' | 'private_office' | 'shared_workspace' | 'public_indoor' | 'public_outdoor' | 'unknown';

  /** Whether non-wearers are present or assumed present */
  bystandersPresent: boolean;

  /** Number of other MentraOS wearers in BLE range */
  nearbyWearers: number;

  /** Whether a multi-wearer governance handshake is active */
  handshakeActive: boolean;
}

/**
 * Sensor inputs that feed the context resolver.
 * In production, these come from the phone's sensors and MentraOS BLE stack.
 * For testing, they're mocked.
 */
export interface ContextSensorInputs {
  /** Location classification (from geofence, manual, or posemesh) */
  location?: 'home' | 'private_office' | 'shared_workspace' | 'public_indoor' | 'public_outdoor';

  /** Number of nearby MentraOS wearers detected via BLE */
  nearbyWearers?: number;

  /** Override: force bystanders present (e.g., from manual toggle) */
  bystandersPresent?: boolean;

  /** Whether the user has confirmed a private space (overrides location) */
  privateSpaceConfirmed?: boolean;
}

/**
 * Resolve spatial context from sensor inputs.
 *
 * Rules:
 *   - Unknown location defaults to most restrictive assumption (bystanders present)
 *   - Public spaces always assume bystanders unless explicitly overridden
 *   - Private space confirmation overrides location-based bystander detection
 *   - Nearby wearers > 0 triggers handshake requirement
 */
export function resolveContext(inputs: ContextSensorInputs): SpatialContext {
  const locationType = inputs.location ?? 'unknown';
  const nearbyWearers = inputs.nearbyWearers ?? 0;

  // Bystander detection: public spaces assume bystanders by default
  let bystandersPresent: boolean;
  if (inputs.bystandersPresent !== undefined) {
    // Explicit override
    bystandersPresent = inputs.bystandersPresent;
  } else if (inputs.privateSpaceConfirmed) {
    bystandersPresent = false;
  } else if (locationType === 'home' || locationType === 'private_office') {
    bystandersPresent = false;
  } else if (locationType === 'public_indoor' || locationType === 'public_outdoor' || locationType === 'shared_workspace') {
    bystandersPresent = true;
  } else {
    // Unknown → assume bystanders (safe default)
    bystandersPresent = true;
  }

  return {
    locationType,
    bystandersPresent,
    nearbyWearers,
    handshakeActive: false, // Handshake starts inactive, must be explicitly established
  };
}

// ─── Handshake Engine ───────────────────────────────────────────────────────

/**
 * Multi-wearer governance handshake state.
 *
 * When wearers share a space, their personal governance must compose.
 * The handshake protocol negotiates the most restrictive policy
 * among all participants for every hardware capability.
 */
export interface HandshakeState {
  /** Participating wearer IDs */
  participants: string[];

  /** Per-participant consent for each capability */
  cameraConsent: Record<string, boolean>;
  microphoneConsent: Record<string, boolean>;
  streamingConsent: Record<string, boolean>;
  locationConsent: Record<string, boolean>;

  /** Handshake completion status */
  status: 'pending' | 'active' | 'expired';

  /** Negotiated policies (most restrictive wins) */
  negotiatedCamera: 'allowed' | 'blocked';
  negotiatedMicrophone: 'allowed' | 'confirmation_required' | 'blocked';
  negotiatedStreaming: 'allowed' | 'blocked';
  negotiatedLocation: 'allowed' | 'blocked';
}

/**
 * Individual wearer's governance preferences for handshake negotiation.
 */
export interface WearerGovernance {
  wearerId: string;
  cameraAllowed: boolean;
  microphoneAllowed: boolean;
  streamingAllowed: boolean;
  locationAllowed: boolean;
}

/**
 * Create an empty handshake in pending state.
 */
export function createHandshake(initiatorId: string): HandshakeState {
  return {
    participants: [initiatorId],
    cameraConsent: { [initiatorId]: true },
    microphoneConsent: { [initiatorId]: true },
    streamingConsent: { [initiatorId]: true },
    locationConsent: { [initiatorId]: true },
    status: 'pending',
    negotiatedCamera: 'allowed',
    negotiatedMicrophone: 'allowed',
    negotiatedStreaming: 'allowed',
    negotiatedLocation: 'allowed',
  };
}

/**
 * Add a wearer to the handshake and re-negotiate.
 *
 * Invariant: most_restrictive_wins.
 * If ANY participant blocks a capability, it's blocked for ALL.
 */
export function joinHandshake(
  state: HandshakeState,
  wearer: WearerGovernance,
): HandshakeState {
  const next = { ...state };

  // Add participant
  if (!next.participants.includes(wearer.wearerId)) {
    next.participants = [...next.participants, wearer.wearerId];
  }

  // Record individual consent
  next.cameraConsent = { ...next.cameraConsent, [wearer.wearerId]: wearer.cameraAllowed };
  next.microphoneConsent = { ...next.microphoneConsent, [wearer.wearerId]: wearer.microphoneAllowed };
  next.streamingConsent = { ...next.streamingConsent, [wearer.wearerId]: wearer.streamingAllowed };
  next.locationConsent = { ...next.locationConsent, [wearer.wearerId]: wearer.locationAllowed };

  // Re-negotiate: most restrictive wins
  const allCamera = Object.values(next.cameraConsent);
  const allMic = Object.values(next.microphoneConsent);
  const allStreaming = Object.values(next.streamingConsent);
  const allLocation = Object.values(next.locationConsent);

  next.negotiatedCamera = allCamera.every(Boolean) ? 'allowed' : 'blocked';
  next.negotiatedMicrophone = allMic.every(Boolean)
    ? 'allowed'
    : allMic.some(Boolean)
      ? 'confirmation_required'
      : 'blocked';
  next.negotiatedStreaming = allStreaming.every(Boolean) ? 'allowed' : 'blocked';
  next.negotiatedLocation = allLocation.every(Boolean) ? 'allowed' : 'blocked';

  // Handshake is active once all participants have joined and negotiation is complete
  next.status = next.participants.length >= 2 ? 'active' : 'pending';

  return next;
}

/**
 * Check if a specific intent is allowed under the current handshake.
 */
export function isIntentAllowedByHandshake(
  intent: string,
  handshake: HandshakeState,
): { allowed: boolean; reason: string } {
  const def = getMentraIntent(intent);
  if (!def) {
    return { allowed: true, reason: 'Unknown intent — not governed by handshake' };
  }

  if (handshake.status !== 'active') {
    // Handshake pending → most restrictive default (block sensitive)
    if (def.domain === 'camera' || def.domain === 'microphone') {
      return { allowed: false, reason: 'Governance handshake pending — hardware access blocked until negotiation completes' };
    }
    return { allowed: true, reason: 'Non-sensitive intent allowed during handshake negotiation' };
  }

  // Active handshake — check negotiated policies
  switch (def.domain) {
    case 'camera':
      if (handshake.negotiatedCamera === 'blocked') {
        return { allowed: false, reason: `Camera blocked — ${findBlockingParticipant(handshake.cameraConsent)} has camera disabled in their governance` };
      }
      // Also check streaming for stream intents
      if (intent.includes('stream') && handshake.negotiatedStreaming === 'blocked') {
        return { allowed: false, reason: `Streaming blocked — requires unanimous consent, ${findBlockingParticipant(handshake.streamingConsent)} blocks streaming` };
      }
      return { allowed: true, reason: 'Camera allowed by all participants' };

    case 'microphone':
      if (handshake.negotiatedMicrophone === 'blocked') {
        return { allowed: false, reason: `Microphone blocked — ${findBlockingParticipant(handshake.microphoneConsent)} has microphone disabled` };
      }
      return { allowed: true, reason: 'Microphone allowed (may require confirmation)' };

    case 'location':
      if (handshake.negotiatedLocation === 'blocked') {
        return { allowed: false, reason: `Location blocked — ${findBlockingParticipant(handshake.locationConsent)} has location disabled` };
      }
      return { allowed: true, reason: 'Location allowed by all participants' };

    default:
      return { allowed: true, reason: 'Intent not governed by multi-wearer handshake' };
  }
}

function findBlockingParticipant(consent: Record<string, boolean>): string {
  const blocker = Object.entries(consent).find(([, v]) => !v);
  return blocker ? blocker[0] : 'unknown participant';
}

// ─── Governed Executor ──────────────────────────────────────────────────────

export interface MentraGuardResult {
  /** Whether the action is allowed */
  allowed: boolean;

  /** The governance verdict */
  verdict: GuardVerdict;

  /** The resolved intent definition (if found in taxonomy) */
  intentDef?: MentraIntentDefinition;

  /** Handshake check result (if multi-wearer) */
  handshakeResult?: { allowed: boolean; reason: string };

  /** The spatial context used for evaluation */
  context: SpatialContext;
}

export interface MentraExecutorOptions {
  /** Include full evaluation trace in verdicts. Default: false. */
  trace?: boolean;

  /** Enforcement level override. */
  level?: 'basic' | 'standard' | 'strict';

  /** Called when an action is blocked. */
  onBlock?: (result: MentraGuardResult) => void;

  /** Called for every evaluation. */
  onEvaluate?: (result: MentraGuardResult) => void;

  /** Plan to enforce. */
  plan?: PlanDefinition;

  /** Plan progress callbacks. */
  onPlanProgress?: (progress: PlanProgress) => void;
  onPlanComplete?: () => void;
}

export class MentraGovernedExecutor {
  private world: WorldDefinition;
  private engineOptions: GuardEngineOptions;
  private options: MentraExecutorOptions;
  private planState: PlanTrackingState;
  private planCallbacks: PlanTrackingCallbacks;

  constructor(world: WorldDefinition, options: MentraExecutorOptions = {}) {
    this.world = world;
    this.options = options;
    this.engineOptions = buildEngineOptions(options, options.plan);
    this.planState = { activePlan: options.plan, engineOptions: this.engineOptions };
    this.planCallbacks = {
      onPlanProgress: options.onPlanProgress,
      onPlanComplete: options.onPlanComplete,
    };
  }

  /**
   * Evaluate an intent against the world + spatial context + handshake.
   *
   * Three-layer evaluation:
   *   1. Handshake check (if multi-wearer) — structural, can only block
   *   2. Intent validation (taxonomy lookup) — validates hardware support
   *   3. Guard engine evaluation — full world rule evaluation
   */
  evaluate(
    intent: string,
    context: SpatialContext,
    handshake?: HandshakeState,
    glassesModel?: GlassesModel,
  ): MentraGuardResult {
    const intentDef = getMentraIntent(intent);

    // Layer 1: Handshake check (most_restrictive_wins)
    let handshakeResult: { allowed: boolean; reason: string } | undefined;
    if (handshake && handshake.participants.length > 1) {
      handshakeResult = isIntentAllowedByHandshake(intent, handshake);
      if (!handshakeResult.allowed) {
        const verdict: GuardVerdict = {
          status: 'BLOCK',
          ruleId: 'handshake-composition',
          reason: handshakeResult.reason,
          evidence: {
            matchedRule: 'Multi-wearer governance handshake',
            matchedPattern: `${intent} blocked by shared session policy`,
          },
        };
        const result: MentraGuardResult = {
          allowed: false,
          verdict,
          intentDef,
          handshakeResult,
          context,
        };
        this.options.onBlock?.(result);
        this.options.onEvaluate?.(result);
        return result;
      }
    }

    // Layer 2: Hardware compatibility check
    if (intentDef && glassesModel && !intentDef.supported_glasses.includes(glassesModel)) {
      const verdict: GuardVerdict = {
        status: 'BLOCK',
        ruleId: 'hardware-capability',
        reason: `${intent} not supported on ${glassesModel} — requires: ${intentDef.supported_glasses.join(', ')}`,
        evidence: {
          matchedRule: 'Hardware capability matrix',
          matchedPattern: `${intentDef.sdk_method} unavailable on ${glassesModel}`,
        },
      };
      const result: MentraGuardResult = {
        allowed: false,
        verdict,
        intentDef,
        handshakeResult,
        context,
      };
      this.options.onBlock?.(result);
      this.options.onEvaluate?.(result);
      return result;
    }

    // Layer 3: Guard engine evaluation (full world rules)
    const event: GuardEvent = {
      intent,
      tool: intentDef?.sdk_method ?? intent,
      scope: intentDef?.domain ?? 'unknown',
      actionCategory: intentDef?.action_category,
      riskLevel: this.elevateRisk(intentDef, context),
      irreversible: intentDef ? !intentDef.reversible : false,
      args: {
        spatial_context: context.locationType,
        bystanders_present: context.bystandersPresent ? 1 : 0,
        nearby_wearers: context.nearbyWearers,
        governance_handshake_active: context.handshakeActive ? 1 : 0,
        glasses_model: glassesModel ?? 'unknown',
      },
    };

    const verdict = evaluateGuard(event, this.world, this.engineOptions);

    const allowed = verdict.status === 'ALLOW' || verdict.status === 'REWARD';

    if (allowed) {
      trackPlanProgress(event, this.planState, this.planCallbacks);
    }

    const result: MentraGuardResult = {
      allowed,
      verdict,
      intentDef,
      handshakeResult,
      context,
    };

    if (!allowed) {
      this.options.onBlock?.(result);
    }
    this.options.onEvaluate?.(result);

    return result;
  }

  /**
   * Elevate risk level based on spatial context.
   * A medium-risk intent at home stays medium.
   * A medium-risk intent in public becomes high.
   * A high-risk intent in public becomes critical.
   */
  private elevateRisk(
    def: MentraIntentDefinition | undefined,
    context: SpatialContext,
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (!def) return 'medium';

    const baseRisk = def.base_risk;
    const isPublic = context.locationType === 'public_indoor' || context.locationType === 'public_outdoor';
    const hasBystanders = context.bystandersPresent;
    const hasNearbyWearers = context.nearbyWearers > 0;

    if (!isPublic && !hasBystanders && !hasNearbyWearers) {
      return baseRisk;
    }

    // Escalation: public/bystanders bump risk one level
    if (def.exfiltration_risk && (isPublic || hasBystanders)) {
      if (baseRisk === 'low') return 'medium';
      if (baseRisk === 'medium') return 'high';
      if (baseRisk === 'high') return 'critical';
    }

    return baseRisk;
  }

  /** Get all known intents for this adapter */
  get knownIntents(): string[] {
    return MENTRA_KNOWN_INTENTS;
  }
}

// ─── Factory Functions ──────────────────────────────────────────────────────

/**
 * Create a MentraOS governed executor from a world directory path.
 */
export async function createMentraGovernedExecutor(
  worldPath: string,
  options: MentraExecutorOptions = {},
): Promise<MentraGovernedExecutor> {
  const world = await loadWorld(worldPath);
  return new MentraGovernedExecutor(world, options);
}

/**
 * Create a MentraOS governed executor from an already-loaded WorldDefinition.
 */
export function createMentraGovernedExecutorFromWorld(
  world: WorldDefinition,
  options: MentraExecutorOptions = {},
): MentraGovernedExecutor {
  return new MentraGovernedExecutor(world, options);
}

// ─── Re-exports ─────────────────────────────────────────────────────────────

export { GovernanceBlockedError } from './shared';
export {
  MENTRA_INTENT_TAXONOMY,
  MENTRA_KNOWN_INTENTS,
  MENTRA_INTENT_MAP,
  getMentraIntent,
  getIntentsByPermission,
  getIntentsByGlasses,
  isIntentSupported,
  getHighRiskIntents,
  getExfiltrationIntents,
} from '../worlds/mentraos-intent-taxonomy';
export type {
  MentraIntentDefinition,
  MentraPermission,
  MentraDomain,
  GlassesModel,
} from '../worlds/mentraos-intent-taxonomy';
