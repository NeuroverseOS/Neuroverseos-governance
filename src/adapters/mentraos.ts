/**
 * NeuroVerse Adapter — MentraOS Smart Glasses
 *
 * The boundary layer between NeuroVerse governance and MentraOS SDK.
 *
 * This adapter provides two governance layers:
 *   1. Platform Governance — enforces hardware permissions, session isolation,
 *      AI data flow declarations, and AI action confirmation requirements
 *   2. User Rules Override — enforces the user's personal governance preferences
 *      across ALL apps. User rules always win.
 *
 * Architecture:
 *   App receives user data (transcription, camera, location)
 *   → App wants to send data to AI API or take action
 *   → MentraGovernedExecutor.evaluate(intent, appContext)
 *   → Layer 1: User rules check (overrides everything)
 *   → Layer 2: Hardware capability check (physics — never overridden)
 *   → Layer 3: Platform guard engine (world rules)
 *   → verdict: ALLOW / BLOCK / PAUSE
 *
 * The adapter sits at:
 *   App Server → NeuroVerse Guard → MentraOS SDK → Hardware
 *              → NeuroVerse Guard → AI API call (or block)
 *
 * Usage:
 *   import { createMentraGovernedExecutor } from '@neuroverseos/governance/adapters/mentraos';
 *
 *   const executor = await createMentraGovernedExecutor('./world/');
 *   const result = executor.evaluate('ai_send_transcription', appContext);
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
  isAIIntent,
} from '../worlds/mentraos-intent-taxonomy';
import type {
  MentraIntentDefinition,
  MentraPermission,
  GlassesModel,
} from '../worlds/mentraos-intent-taxonomy';

// ─── Spatial Session (optional — future-ready) ───────────────────────────────

/**
 * Reference to a spatial governance session.
 *
 * When spatial governance is active, intents are evaluated against
 * zone rules and handshake rules BEFORE the platform world.
 * This is an optional layer — if no spatial session is attached,
 * the executor works exactly as before.
 *
 * Import the full spatial module from '@neuroverseos/governance/spatial'
 * for zone management, handshake negotiation, and session lifecycle.
 */
export interface SpatialSessionRef {
  /** Evaluate an intent against the spatial context */
  evaluate: (intent: string) => {
    allowed: boolean;
    requiresConfirmation: boolean;
    reason: string;
  };
  /** Human-readable description of the active spatial context */
  description: string;
}

// ─── App Context ─────────────────────────────────────────────────────────────

/**
 * Context for the current app session.
 * This replaces the old SpatialContext — grounded in real app data,
 * not hypothetical spatial tech.
 */
export interface AppContext {
  /** The app's unique identifier from console.mentra.glass */
  appId: string;

  /** Whether the app declared its AI provider(s) at registration */
  aiProviderDeclared: boolean;

  /** List of AI API providers the app declared (e.g., ['openai', 'anthropic']) */
  declaredAIProviders: string[];

  /** Whether the user has opted in to data retention for this app */
  dataRetentionOptedIn: boolean;

  /** Number of distinct data types the app has sent to AI this session */
  aiDataTypesSent: number;

  /** Connected glasses model */
  glassesModel?: GlassesModel;
}

// ─── User Rules ──────────────────────────────────────────────────────────────

/**
 * User's personal governance preferences.
 * These override EVERY app's behavior. The user is king.
 *
 * In production, these are loaded from the user's profile on the MentraOS phone app.
 * The user sets them once, and they apply across all apps.
 */
export interface UserRules {
  /**
   * AI data send policy.
   * - 'declared_only': AI data sends allowed only to declared providers (default)
   * - 'confirm_each': Every AI data send requires user confirmation
   * - 'block_all': No AI data sends allowed (offline-only mode)
   */
  aiDataPolicy: 'declared_only' | 'confirm_each' | 'block_all';

  /**
   * AI auto-action policy.
   * - 'confirm_all': Every AI action must be confirmed on display (default)
   * - 'allow_low_risk': Low-risk actions (display, read) auto-allowed; high-risk confirmed
   * - 'block_all': No AI actions allowed
   */
  aiActionPolicy: 'confirm_all' | 'allow_low_risk' | 'block_all';

  /**
   * AI purchase policy.
   * - 'confirm_each': Per-transaction confirmation required (default)
   * - 'block_all': No AI purchases allowed
   */
  aiPurchasePolicy: 'confirm_each' | 'block_all';

  /**
   * AI messaging policy.
   * - 'confirm_each': Per-message confirmation required (default)
   * - 'block_all': No AI messaging allowed
   */
  aiMessagingPolicy: 'confirm_each' | 'block_all';

  /**
   * Data retention policy.
   * - 'app_declared': Allow retention if app declared it and user opted in (default)
   * - 'never': No data retention, ever
   */
  dataRetentionPolicy: 'app_declared' | 'never';

  /**
   * Maximum number of AI providers receiving data simultaneously.
   * Default: 5. Set to 1 for single-provider mode.
   */
  maxAIProviders: number;
}

/** Default user rules — reasonable defaults, not paranoid, not permissive */
export const DEFAULT_USER_RULES: UserRules = {
  aiDataPolicy: 'declared_only',
  aiActionPolicy: 'confirm_all',
  aiPurchasePolicy: 'confirm_each',
  aiMessagingPolicy: 'confirm_each',
  dataRetentionPolicy: 'app_declared',
  maxAIProviders: 5,
};

/**
 * Evaluate an intent against the user's personal rules.
 * Returns null if the user rules don't apply to this intent.
 * Returns a block verdict if the user rules block it.
 * Returns a pause verdict if the user rules require confirmation.
 */
export function evaluateUserRules(
  intent: string,
  rules: UserRules,
  appContext: AppContext,
): { verdict: GuardVerdict; reason: string } | null {
  const def = getMentraIntent(intent);
  if (!def) return null;

  // AI data sends
  if (def.domain === 'ai_data' && intent !== 'ai_retain_session_data') {
    if (rules.aiDataPolicy === 'block_all') {
      return {
        verdict: {
          status: 'BLOCK',
          ruleId: 'user-rule-ai-data-block',
          reason: `User rules block all AI data sends. Intent: ${intent}`,
          evidence: makeEvidence('user-rule-ai-data-block'),
        },
        reason: 'User has blocked all AI data sends',
      };
    }
    if (rules.aiDataPolicy === 'confirm_each') {
      return {
        verdict: {
          status: 'PAUSE',
          ruleId: 'user-rule-ai-data-confirm',
          reason: `User rules require confirmation for every AI data send. Intent: ${intent}`,
          evidence: makeEvidence('user-rule-ai-data-confirm'),
        },
        reason: 'User requires confirmation for each AI data send',
      };
    }
    // 'declared_only' — check if provider is declared
    if (!appContext.aiProviderDeclared) {
      return {
        verdict: {
          status: 'BLOCK',
          ruleId: 'user-rule-undeclared-provider',
          reason: `App "${appContext.appId}" has not declared its AI provider. User rules require declared providers only.`,
          evidence: makeEvidence('user-rule-undeclared-provider'),
        },
        reason: 'App has not declared its AI provider',
      };
    }
  }

  // AI data retention
  if (intent === 'ai_retain_session_data') {
    if (rules.dataRetentionPolicy === 'never') {
      return {
        verdict: {
          status: 'BLOCK',
          ruleId: 'user-rule-no-retention',
          reason: `User rules block all data retention. App "${appContext.appId}" cannot retain session data.`,
          evidence: makeEvidence('user-rule-no-retention'),
        },
        reason: 'User has blocked all data retention',
      };
    }
    if (!appContext.dataRetentionOptedIn) {
      return {
        verdict: {
          status: 'BLOCK',
          ruleId: 'user-rule-retention-no-optin',
          reason: `User has not opted in to data retention for app "${appContext.appId}".`,
          evidence: makeEvidence('user-rule-retention-no-optin'),
        },
        reason: 'User has not opted in to data retention for this app',
      };
    }
  }

  // AI purchases
  if (intent === 'ai_auto_purchase') {
    if (rules.aiPurchasePolicy === 'block_all') {
      return {
        verdict: {
          status: 'BLOCK',
          ruleId: 'user-rule-no-purchases',
          reason: 'User rules block all AI-initiated purchases.',
          evidence: makeEvidence('user-rule-no-purchases'),
        },
        reason: 'User has blocked all AI purchases',
      };
    }
    // 'confirm_each' — always requires confirmation
    return {
      verdict: {
        status: 'PAUSE',
        ruleId: 'user-rule-purchase-confirm',
        reason: `AI wants to make a purchase. User rules require per-transaction confirmation.`,
        evidence: makeEvidence('user-rule-purchase-confirm'),
      },
      reason: 'User requires per-transaction confirmation for AI purchases',
    };
  }

  // AI messaging
  if (intent === 'ai_auto_respond_message') {
    if (rules.aiMessagingPolicy === 'block_all') {
      return {
        verdict: {
          status: 'BLOCK',
          ruleId: 'user-rule-no-messaging',
          reason: 'User rules block all AI-initiated messaging.',
          evidence: makeEvidence('user-rule-no-messaging'),
        },
        reason: 'User has blocked all AI messaging',
      };
    }
    return {
      verdict: {
        status: 'PAUSE',
        ruleId: 'user-rule-message-confirm',
        reason: `AI wants to send a message on your behalf. User rules require per-message confirmation.`,
        evidence: makeEvidence('user-rule-message-confirm'),
      },
      reason: 'User requires per-message confirmation for AI messaging',
    };
  }

  // AI actions (general)
  if (def.domain === 'ai_action' && intent !== 'ai_auto_purchase' && intent !== 'ai_auto_respond_message') {
    if (rules.aiActionPolicy === 'block_all') {
      return {
        verdict: {
          status: 'BLOCK',
          ruleId: 'user-rule-no-ai-actions',
          reason: `User rules block all AI auto-actions. Intent: ${intent}`,
          evidence: makeEvidence('user-rule-no-ai-actions'),
        },
        reason: 'User has blocked all AI auto-actions',
      };
    }
    if (rules.aiActionPolicy === 'confirm_all') {
      return {
        verdict: {
          status: 'PAUSE',
          ruleId: 'user-rule-action-confirm',
          reason: `AI wants to take action: ${intent}. User rules require confirmation.`,
          evidence: makeEvidence('user-rule-action-confirm'),
        },
        reason: 'User requires confirmation for all AI actions',
      };
    }
    // 'allow_low_risk' — check risk level
    if (def.base_risk === 'high' || def.base_risk === 'critical') {
      return {
        verdict: {
          status: 'PAUSE',
          ruleId: 'user-rule-high-risk-confirm',
          reason: `AI wants to take high-risk action: ${intent}. User rules require confirmation for high-risk actions.`,
          evidence: makeEvidence('user-rule-high-risk-confirm'),
        },
        reason: 'User requires confirmation for high-risk AI actions',
      };
    }
  }

  // Third-party sharing — always blocked or confirmed
  if (intent === 'ai_share_with_third_party') {
    return {
      verdict: {
        status: 'PAUSE',
        ruleId: 'user-rule-third-party-confirm',
        reason: `App wants to share your data with a third party beyond its declared AI provider. Confirmation required.`,
        evidence: makeEvidence('user-rule-third-party-confirm'),
      },
      reason: 'Third-party data sharing requires user confirmation',
    };
  }

  return null;
}

function makeEvidence(ruleId: string) {
  return {
    worldId: 'mentraos-user-rules',
    worldName: 'MentraOS User Rules',
    worldVersion: '1.0.0',
    evaluatedAt: Date.now(),
    invariantsSatisfied: 0,
    invariantsTotal: 0,
    guardsMatched: [ruleId],
    rulesMatched: [],
    enforcementLevel: 'strict',
  };
}

// ─── Governed Executor ──────────────────────────────────────────────────────

export interface MentraGuardResult {
  /** Whether the action is allowed */
  allowed: boolean;

  /** Whether the action requires user confirmation (PAUSE) */
  requiresConfirmation: boolean;

  /** The governance verdict */
  verdict: GuardVerdict;

  /** The resolved intent definition (if found in taxonomy) */
  intentDef?: MentraIntentDefinition;

  /** User rules check result (if applicable) */
  userRulesResult?: { reason: string };

  /** The app context used for evaluation */
  appContext: AppContext;

  /** Which governance layer produced this verdict */
  decidingLayer: 'user_rules' | 'spatial' | 'hardware' | 'platform' | 'emergency_override';
}

export interface MentraExecutorOptions {
  /** Include full evaluation trace in verdicts. Default: false. */
  trace?: boolean;

  /** Enforcement level override. */
  level?: 'basic' | 'standard' | 'strict';

  /** Called when an action is blocked. */
  onBlock?: (result: MentraGuardResult) => void;

  /** Called when an action requires confirmation. */
  onPause?: (result: MentraGuardResult) => void;

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
  private _userRules: UserRules;
  private _emergencyOverride: boolean = false;
  private _emergencyActivatedAt: number | null = null;
  private _spatialSession: SpatialSessionRef | null = null;

  constructor(
    world: WorldDefinition,
    options: MentraExecutorOptions = {},
    userRules: UserRules = DEFAULT_USER_RULES,
  ) {
    this.world = world;
    this.options = options;
    this._userRules = userRules;
    this.engineOptions = buildEngineOptions(options, options.plan);
    this.planState = { activePlan: options.plan, engineOptions: this.engineOptions };
    this.planCallbacks = {
      onPlanProgress: options.onPlanProgress,
      onPlanComplete: options.onPlanComplete,
    };
  }

  /** Get the current user rules */
  get userRules(): UserRules {
    return this._userRules;
  }

  /** Update user rules at runtime (e.g., user changes preferences in phone app) */
  updateUserRules(rules: Partial<UserRules>): void {
    this._userRules = { ...this._userRules, ...rules };
  }

  /**
   * Activate emergency override — user is king.
   *
   * Bypasses all NeuroVerse governance rules (user rules, platform rules).
   * Does NOT bypass MentraOS platform constraints (hardware capability,
   * declared permissions, session isolation). You can't override physics.
   *
   * Returns the timestamp of activation for audit trail.
   */
  activateEmergencyOverride(): number {
    this._emergencyOverride = true;
    this._emergencyActivatedAt = Date.now();
    this.engineOptions = { ...this.engineOptions, emergencyOverride: true };
    return this._emergencyActivatedAt;
  }

  /**
   * Deactivate emergency override — governance resumes.
   * Returns the duration the override was active (ms).
   */
  deactivateEmergencyOverride(): number {
    if (!this._emergencyOverride || !this._emergencyActivatedAt) {
      return 0;
    }
    const duration = Date.now() - this._emergencyActivatedAt;
    this._emergencyOverride = false;
    this._emergencyActivatedAt = null;
    this.engineOptions = { ...this.engineOptions, emergencyOverride: false };
    return duration;
  }

  /** Whether emergency override is currently active */
  get isEmergencyOverrideActive(): boolean {
    return this._emergencyOverride;
  }

  /** Timestamp when emergency override was activated, or null */
  get emergencyActivatedAt(): number | null {
    return this._emergencyActivatedAt;
  }

  // ── Spatial Governance (optional) ────────────────────────────────────────

  /**
   * Attach a spatial session to this executor.
   *
   * When attached, intents are evaluated against the spatial context
   * (zone rules + handshake rules) AFTER user rules but BEFORE
   * hardware and platform checks. This is Layer 1.5.
   *
   * Pass null to detach (e.g., when leaving a zone).
   */
  setSpatialSession(session: SpatialSessionRef | null): void {
    this._spatialSession = session;
  }

  /** Whether a spatial session is currently active */
  get hasSpatialSession(): boolean {
    return this._spatialSession !== null;
  }

  /** Get the current spatial session description */
  get spatialDescription(): string | null {
    return this._spatialSession?.description ?? null;
  }

  /**
   * Evaluate an intent against user rules + platform world.
   *
   * Three-layer evaluation:
   *   0. Emergency override — if active, skip governance (layers 1 + 1.5 + 3),
   *      but STILL enforce platform constraints (layer 2)
   *   1. User rules check — personal governance override, can BLOCK or PAUSE
   *   1.5. Spatial governance — zone + handshake rules (optional, temporary)
   *      ↑ ONLY ACTIVE when a spatial session is attached
   *   2. Hardware capability check — validates glasses support
   *      ↑ THIS IS A PLATFORM CONSTRAINT — never overridden
   *   3. Platform guard engine — full world rule evaluation
   */
  evaluate(
    intent: string,
    appContext: AppContext,
  ): MentraGuardResult {
    const intentDef = getMentraIntent(intent);
    const glassesModel = appContext.glassesModel;

    // Layer 1: User rules check
    // SKIPPED during emergency override
    if (!this._emergencyOverride) {
      const userRulesResult = evaluateUserRules(intent, this._userRules, appContext);
      if (userRulesResult) {
        const allowed = false;
        const requiresConfirmation = userRulesResult.verdict.status === 'PAUSE';
        const result: MentraGuardResult = {
          allowed: requiresConfirmation ? false : false,
          requiresConfirmation,
          verdict: userRulesResult.verdict,
          intentDef,
          userRulesResult: { reason: userRulesResult.reason },
          appContext,
          decidingLayer: 'user_rules',
        };
        if (requiresConfirmation) {
          this.options.onPause?.(result);
        } else {
          this.options.onBlock?.(result);
        }
        this.options.onEvaluate?.(result);
        return result;
      }
    }

    // Layer 1.5: Spatial governance check (optional)
    // SKIPPED during emergency override. SKIPPED if no spatial session attached.
    if (!this._emergencyOverride && this._spatialSession) {
      const spatialResult = this._spatialSession.evaluate(intent);
      if (!spatialResult.allowed && !spatialResult.requiresConfirmation) {
        const verdict: GuardVerdict = {
          status: 'BLOCK',
          ruleId: 'spatial-zone-rule',
          reason: spatialResult.reason,
          evidence: makeEvidence('spatial-zone-rule'),
        };
        const result: MentraGuardResult = {
          allowed: false,
          requiresConfirmation: false,
          verdict,
          intentDef,
          appContext,
          decidingLayer: 'spatial',
        };
        this.options.onBlock?.(result);
        this.options.onEvaluate?.(result);
        return result;
      }
      if (spatialResult.requiresConfirmation) {
        const verdict: GuardVerdict = {
          status: 'PAUSE',
          ruleId: 'spatial-zone-rule',
          reason: spatialResult.reason,
          evidence: makeEvidence('spatial-zone-rule'),
        };
        const result: MentraGuardResult = {
          allowed: false,
          requiresConfirmation: true,
          verdict,
          intentDef,
          appContext,
          decidingLayer: 'spatial',
        };
        this.options.onPause?.(result);
        this.options.onEvaluate?.(result);
        return result;
      }
    }

    // Layer 2: Hardware compatibility check
    // NEVER OVERRIDDEN — this is a MentraOS platform constraint.
    // You cannot take a photo on glasses with no camera, emergency or not.
    if (intentDef && glassesModel && !intentDef.supported_glasses.includes(glassesModel)) {
      const verdict: GuardVerdict = {
        status: 'BLOCK',
        ruleId: 'hardware-capability',
        reason: `${intent} not supported on ${glassesModel} — requires: ${intentDef.supported_glasses.join(', ')}`,
        evidence: {
          worldId: this.world.world?.world_id ?? 'unknown',
          worldName: this.world.world?.name ?? 'unknown',
          worldVersion: this.world.world?.version ?? 'unknown',
          evaluatedAt: Date.now(),
          invariantsSatisfied: 0,
          invariantsTotal: 0,
          guardsMatched: ['hardware-capability'],
          rulesMatched: [],
          enforcementLevel: 'strict',
        },
      };
      const result: MentraGuardResult = {
        allowed: false,
        requiresConfirmation: false,
        verdict,
        intentDef,
        appContext,
        decidingLayer: 'hardware',
      };
      this.options.onBlock?.(result);
      this.options.onEvaluate?.(result);
      return result;
    }

    // Layer 3: Platform guard engine evaluation (full world rules)
    const event: GuardEvent = {
      intent,
      tool: intentDef?.sdk_method ?? intent,
      scope: intentDef?.domain ?? 'unknown',
      actionCategory: intentDef?.action_category,
      riskLevel: intentDef?.base_risk ?? 'medium',
      irreversible: intentDef ? !intentDef.reversible : false,
      args: {
        app_id: appContext.appId,
        ai_provider_declared: appContext.aiProviderDeclared ? 1 : 0,
        ai_data_types_sent: appContext.aiDataTypesSent,
        ai_retention_opted_in: appContext.dataRetentionOptedIn ? 1 : 0,
        glasses_model: glassesModel ?? 'unknown',
        is_ai_intent: isAIIntent(intent) ? 1 : 0,
      },
    };

    const verdict = evaluateGuard(event, this.world, this.engineOptions);

    const allowed = verdict.status === 'ALLOW' || verdict.status === 'REWARD';
    const requiresConfirmation = verdict.status === 'PAUSE';

    if (allowed) {
      trackPlanProgress(event, this.planState, this.planCallbacks);
    }

    const result: MentraGuardResult = {
      allowed,
      requiresConfirmation,
      verdict,
      intentDef,
      appContext,
      decidingLayer: this._emergencyOverride ? 'emergency_override' : 'platform',
    };

    if (!allowed && !requiresConfirmation) {
      this.options.onBlock?.(result);
    }
    if (requiresConfirmation) {
      this.options.onPause?.(result);
    }
    this.options.onEvaluate?.(result);

    return result;
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
  userRules: UserRules = DEFAULT_USER_RULES,
): Promise<MentraGovernedExecutor> {
  const world = await loadWorld(worldPath);
  return new MentraGovernedExecutor(world, options, userRules);
}

/**
 * Create a MentraOS governed executor from an already-loaded WorldDefinition.
 */
export function createMentraGovernedExecutorFromWorld(
  world: WorldDefinition,
  options: MentraExecutorOptions = {},
  userRules: UserRules = DEFAULT_USER_RULES,
): MentraGovernedExecutor {
  return new MentraGovernedExecutor(world, options, userRules);
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
  getAIDataIntents,
  getAIActionIntents,
  getAIIntents,
  isAIIntent,
} from '../worlds/mentraos-intent-taxonomy';
export type {
  MentraIntentDefinition,
  MentraPermission,
  MentraDomain,
  GlassesModel,
} from '../worlds/mentraos-intent-taxonomy';
