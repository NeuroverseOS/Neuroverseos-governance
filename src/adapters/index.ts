/**
 * NeuroVerse Adapters — Framework Integration Layer
 *
 * Each adapter wraps the governance engine for a specific framework:
 *
 *   adapters/langchain  — LangChain callback handler
 *   adapters/openai     — OpenAI function calling guard
 *   adapters/openclaw   — OpenClaw agent plugin
 *   adapters/express    — Express/Fastify HTTP middleware
 *   adapters/shared     — Shared utilities (GovernanceBlockedError, plan tracking, etc.)
 *
 * Import directly from the adapter you need:
 *   import { createNeuroVerseCallbackHandler } from 'neuroverse-governance/adapters/langchain';
 *   import { createGovernedToolExecutor } from 'neuroverse-governance/adapters/openai';
 *   import { createNeuroVersePlugin } from 'neuroverse-governance/adapters/openclaw';
 *   import { createGovernanceMiddleware } from 'neuroverse-governance/adapters/express';
 */

export {
  GovernanceBlockedError,
  trackPlanProgress,
  extractScope,
  buildEngineOptions,
  defaultBlockMessage,
} from './shared';

export type {
  PlanTrackingCallbacks,
  PlanTrackingState,
  BaseAdapterOptions,
} from './shared';

export {
  NeuroVerseCallbackHandler,
  createNeuroVerseCallbackHandler,
  createNeuroVerseCallbackHandlerFromWorld,
  GovernanceBlockedError as LangChainGovernanceBlockedError,
} from './langchain';

export type {
  NeuroVerseHandlerOptions,
} from './langchain';

export {
  GovernedToolExecutor,
  createGovernedToolExecutor,
  createGovernedToolExecutorFromWorld,
  GovernanceBlockedError as OpenAIGovernanceBlockedError,
} from './openai';

export type {
  OpenAIToolCall,
  GovernedToolResult,
  GovernedExecutorOptions,
} from './openai';

export {
  NeuroVersePlugin,
  createNeuroVersePlugin,
  createNeuroVersePluginFromWorld,
  GovernanceBlockedError as OpenClawGovernanceBlockedError,
} from './openclaw';

export type {
  AgentAction,
  HookResult,
  NeuroVersePluginOptions,
} from './openclaw';

export {
  createGovernanceMiddleware,
  createGovernanceMiddlewareFromWorld,
} from './express';

export type {
  GovernanceRequest,
  GovernanceResponse,
  GovernanceMiddlewareOptions,
} from './express';

export {
  AutoresearchGovernor,
} from './autoresearch';

export type {
  ExperimentProposal,
  ExperimentResult,
  ResearchState,
  AutoresearchGovernorConfig,
} from './autoresearch';

export {
  DeepAgentsGuard,
  createDeepAgentsGuard,
  createDeepAgentsGuardFromWorld,
  GovernanceBlockedError as DeepAgentsGovernanceBlockedError,
} from './deep-agents';

export type {
  DeepAgentsToolCall,
  DeepAgentsToolCategory,
  DeepAgentsGuardResult,
  DeepAgentsGuardOptions,
} from './deep-agents';

export {
  MentraGovernedExecutor,
  createMentraGovernedExecutor,
  createMentraGovernedExecutorFromWorld,
  resolveContext,
  createHandshake,
  joinHandshake,
  isIntentAllowedByHandshake,
  GovernanceBlockedError as MentraGovernanceBlockedError,
  MENTRA_INTENT_TAXONOMY,
  MENTRA_KNOWN_INTENTS,
  getMentraIntent,
  getIntentsByPermission,
  getIntentsByGlasses,
  isIntentSupported,
  getHighRiskIntents,
  getExfiltrationIntents,
} from './mentraos';

export type {
  SpatialContext,
  ContextSensorInputs,
  HandshakeState,
  WearerGovernance,
  MentraGuardResult,
  MentraExecutorOptions,
  MentraIntentDefinition,
  MentraPermission,
  MentraDomain,
  GlassesModel,
} from './mentraos';
