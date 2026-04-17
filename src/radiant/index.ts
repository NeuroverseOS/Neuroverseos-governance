/**
 * @neuroverseos/governance/radiant
 *
 * Radiant — Behavioral Intelligence for Collaboration Systems.
 *
 * ExoCortex remembers what happened. Radiant understands what it means —
 * relative to your culture and strategy — and tells you what to do next.
 *
 * This module consumes the existing worldmodel pipeline (parse → compile),
 * guard engine, lens system, and signal schema exported from
 * `@neuroverseos/governance`, and layers on top:
 *
 *   - L/C/N math (Life / Cyber gyroscopes inside the NeuroverseOS universe)
 *   - actor_domain classification (life | cyber | joint)
 *   - 5 signals × 3 domains = 15 behavioral values
 *   - 5 named pattern compositions
 *   - Rendering lens layer (auki-builder first) that transforms patterns
 *     before the renderer sees them — deterministic shaping, no LLM in path
 *   - Stateless commands: emergent, decision
 *   - Stateful (via MemoryProvider) commands: drift, evolve
 *   - Memory Palace 4-layer coding standard (compression / baselines /
 *     knowledge / synthesis) with a SQLite reference implementation
 *   - CLI entry (bin/radiant.ts) and MCP server entry (bin/radiant-mcp.ts)
 *
 * Build state: Phase 1 complete — voice layer, behavioral dashboard,
 * MCP server, Memory Palace write-back, governance audit, ExoCortex
 * handshake. See radiant/PROJECT-PLAN.md for the full roadmap.
 *
 * Usage:
 *   import {
 *     think, emergent, scoreLife, classifyActorDomain,
 *     aukiBuilderLens, checkForbiddenPhrases,
 *   } from '@neuroverseos/governance/radiant';
 */

export const RADIANT_PACKAGE_VERSION = '0.0.0';

// ─── Core types ────────────────────────────────────────────────────────────

export type {
  AlignmentStatus,
  BridgingComponent,
  BridgingComponentScore,
  CyberCapability,
  CyberDimension,
  EvidenceGate,
  LifeCapability,
  LifeDimension,
  Score,
  ScoredObservation,
  ScoreSentinel,
} from './types';

export { DEFAULT_EVIDENCE_GATE, isScored, isSentinel } from './types';

// ─── L/C/N math ────────────────────────────────────────────────────────────

export {
  isPresent,
  presenceAverage,
  scoreLife,
  scoreCyber,
  scoreNeuroVerse,
  scoreComposite,
} from './core/math';

// ─── actor_domain classification ───────────────────────────────────────────

export type {
  Actor,
  ActorDomain,
  ActorKind,
  Event,
  EventReference,
} from './core/domain';

export { classifyActorDomain } from './core/domain';

// ─── Rendering lens types ──────────────────────────────────────────────────

export type {
  ExemplarRef,
  LensVocabulary,
  ObservedPattern,
  OverlapDef,
  PatternEvidence,
  PrimaryFrame,
  RenderingLens,
  VoiceDirectives,
} from './types';

// ─── Rendering lenses (Auki-specific + registry) ───────────────────────────

export { aukiBuilderLens } from './lenses/auki-builder';
export { LENSES, getLens, listLenses } from './lenses/index';

// ─── Signal extraction ─────────────────────────────────────────────────────

export type {
  ClassifiedEvent,
  ExtractionResult,
  Signal,
  SignalExtractor,
  SignalMatrix,
} from './core/signals';

export {
  classifyEvents,
  extractSignals,
  DEFAULT_SIGNAL_EXTRACTORS,
} from './core/signals';

// ─── System prompt composition + voice check ───────────────────────────────

export { composeSystemPrompt } from './core/prompt';
export { checkForbiddenPhrases, type VoiceViolation } from './core/voice-check';

// ─── AI adapter ────────────────────────────────────────────────────────────

export type { RadiantAI } from './core/ai';
export { createAnthropicAI, createMockAI } from './core/ai';

// ─── Scope resolution ──────────────────────────────────────────────────────

export type { RepoScope, OrgScope, Scope, ViewLevel } from './core/scopes';
export { parseScope, parseRepoScope, formatScope } from './core/scopes';

// ─── GitHub adapter ────────────────────────────────────────────────────────

export type { GitHubFetchOptions } from './adapters/github';
export { fetchGitHubActivity, fetchGitHubOrgActivity, createMockGitHubAdapter } from './adapters/github';

// ─── ExoCortex adapter ────────────────────────────────────────────────────

export type { ExocortexContext } from './adapters/exocortex';
export {
  readExocortex, formatExocortexForPrompt, summarizeExocortex,
  readTeamExocortices, formatTeamExocorticesForPrompt,
} from './adapters/exocortex';

// ─── Discord adapter ──────────────────────────────────────────────────────

export type { DiscordFetchOptions, DiscordSignals } from './adapters/discord';
export { fetchDiscordActivity, formatDiscordSignalsForPrompt } from './adapters/discord';

// ─── Pattern interpretation ────────────────────────────────────────────────

export type { InterpretInput, InterpretResult } from './core/patterns';
export { interpretPatterns } from './core/patterns';

// ─── Renderer ──────────────────────────────────────────────────────────────

export type { RenderInput, RenderOutput } from './core/renderer';
export { render } from './core/renderer';

// ─── Governance audit ──────────────────────────────────────────────────────

export type { GovernanceVerdict, GovernanceAudit } from './core/governance';
export { auditGovernance } from './core/governance';

// ─── Memory Palace ─────────────────────────────────────────────────────────

export type { PriorRead, PatternPersistence, WorldmodelItem } from './memory/palace';
export {
  writeRead,
  updateKnowledge,
  loadPriorReads,
  computePersistence,
  formatPriorReadsForPrompt,
} from './memory/palace';

// ─── Commands ──────────────────────────────────────────────────────────────

export type { ThinkInput, ThinkResult } from './commands/think';
export { think } from './commands/think';

export type { EmergentInput, EmergentResult } from './commands/emergent';
export { emergent } from './commands/emergent';
