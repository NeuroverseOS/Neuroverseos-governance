/**
 * Lenses App — Full Governance Loader
 *
 * Loads the parsed .nv-world.md and adds guards, kernel, and roles
 * programmatically. This is how the NeuroverseOS governance framework
 * is designed to work:
 *
 *   1. Author the world file in markdown (.nv-world.md)
 *      → Thesis, Invariants, State, Assumptions, Rules, Gates, Outcomes, Lenses
 *
 *   2. Parse + emit via bootstrap pipeline
 *      → WorldDefinition with all parseable sections
 *
 *   3. Add guards, kernel, and roles programmatically
 *      → Full governed world with intent vocabulary, boundary enforcement,
 *        role-based access, and declarative guard evaluation
 *
 * This file does step 3. We eat our own dog food.
 *
 * Usage:
 *   import { loadLensesGovernedWorld } from './worlds/lenses-governance';
 *   const world = loadLensesGovernedWorld();
 */

import type {
  WorldDefinition,
  GuardsConfig,
  Guard,
  IntentPattern,
  KernelConfig,
  RolesConfig,
  WorldRoleDefinition,
} from '../../../../src/types';

import { parseWorldMarkdown } from '../../../../src/engine/bootstrap-parser';
import { emitWorldDefinition } from '../../../../src/engine/bootstrap-emitter';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Intent Vocabulary ──────────────────────────────────────────────────────
// Every user action the app can take, mapped to regex patterns for matching.
// The guard engine matches incoming GuardEvents against these patterns.

const INTENT_VOCABULARY: Record<string, IntentPattern> = {
  // ── AI Data Flow ──────────────────────────────────────────────────────
  ai_send_transcription: {
    label: 'Send Transcription to AI',
    pattern: 'send.*transcri|ai.*transcri|transcri.*ai|call.*ai|ai.*call',
  },
  ai_send_ambient: {
    label: 'Send Ambient Context to AI',
    pattern: 'ambient.*send|send.*ambient|ambient.*ai|ai.*ambient|ambient.*context',
  },
  ai_send_image: {
    label: 'Send Camera Image to AI',
    pattern: 'send.*image|send.*photo|camera.*ai|ai.*camera|vision.*ai',
  },
  ai_send_location: {
    label: 'Send Location to AI',
    pattern: 'send.*location|location.*ai|ai.*location|geo.*ai',
  },

  // ── Display ───────────────────────────────────────────────────────────
  display_response: {
    label: 'Display AI Response on Glasses',
    pattern: 'display.*response|show.*response|render.*text|text.*wall|display.*text',
  },

  // ── Activation ────────────────────────────────────────────────────────
  activate_listening: {
    label: 'Activate Microphone Listening',
    pattern: 'activate|listen|start.*listen|mic.*on|microphone.*on|wake.*word',
  },
  enable_always_on: {
    label: 'Enable Always-On Mode',
    pattern: 'always.*on|continuous.*listen|persistent.*listen|always.*listen',
  },

  // ── Ambient ───────────────────────────────────────────────────────────
  enable_ambient: {
    label: 'Enable Ambient Context',
    pattern: 'enable.*ambient|ambient.*on|start.*ambient|ambient.*enable',
  },
  buffer_ambient_speech: {
    label: 'Buffer Ambient Speech to RAM',
    pattern: 'buffer.*ambient|ambient.*buffer|passive.*listen|background.*listen',
  },

  // ── Proactive ──────────────────────────────────────────────────────────
  proactive_classify: {
    label: 'Proactive Classification (AI call on ambient speech)',
    pattern: 'proactive.*classify|classify.*ambient|auto.*classify|proactive.*ai',
  },
  proactive_perspective: {
    label: 'Proactive Perspective (uninvited AI response)',
    pattern: 'proactive.*perspective|proactive.*insight|uninvited.*response|auto.*perspective',
  },

  // ── Lens Management ───────────────────────────────────────────────────
  switch_lens: {
    label: 'Switch Active Lens',
    pattern: 'switch.*lens|change.*lens|use.*lens|activate.*lens',
  },
  stack_lens: {
    label: 'Stack Additional Lens',
    pattern: 'stack.*lens|add.*lens|combine.*lens',
  },

  // ── Camera ────────────────────────────────────────────────────────────
  capture_camera: {
    label: 'Capture Camera Image',
    pattern: 'capture.*camera|take.*photo|camera.*capture|snapshot|take.*picture',
  },

  // ── Data Lifecycle ────────────────────────────────────────────────────
  persist_session_data: {
    label: 'Persist Session Data to Disk',
    pattern: 'persist|save.*disk|write.*file|store.*data|save.*session',
  },
  export_data: {
    label: 'Export User Data',
    pattern: 'export.*data|download.*data|send.*data.*external|transmit.*external',
  },

  // ── API Key ───────────────────────────────────────────────────────────
  access_api_key: {
    label: 'Access User API Key',
    pattern: 'api.*key|secret.*key|credential|access.*key',
  },
  transmit_api_key: {
    label: 'Transmit API Key to External Service',
    pattern: 'transmit.*key|send.*key|exfiltrate|leak.*key|log.*key',
  },
};

// ─── Guards ─────────────────────────────────────────────────────────────────
// Declarative guards that the guard engine evaluates on every action.
// First match wins. Structural guards are immutable — cannot be disabled.

const GUARDS: Guard[] = [
  // ── Structural Guards (immutable, cannot be disabled) ──────────────────

  {
    id: 'guard-api-key-exfiltration',
    label: 'Block API Key Exfiltration',
    description: 'The user\'s API key must never be logged, transmitted to NeuroverseOS servers, or sent to any endpoint other than the declared AI provider.',
    category: 'structural',
    enforcement: 'block',
    immutable: true,
    invariant_ref: 'byo_key_integrity',
    intent_patterns: ['transmit_api_key'],
  },
  {
    id: 'guard-no-persist-to-disk',
    label: 'Block Session Data Persistence',
    description: 'Session data (conversation history, ambient buffer, transcriptions) must never be written to disk. RAM only.',
    category: 'structural',
    enforcement: 'block',
    immutable: true,
    invariant_ref: 'ambient_never_persisted',
    intent_patterns: ['persist_session_data'],
  },
  {
    id: 'guard-no-data-export',
    label: 'Block Undeclared Data Export',
    description: 'User data must never be sent to any service other than the user\'s declared AI provider.',
    category: 'structural',
    enforcement: 'block',
    immutable: true,
    invariant_ref: 'no_hidden_data_flow',
    intent_patterns: ['export_data'],
  },
  {
    id: 'guard-ambient-requires-optin',
    label: 'Block Ambient Without Opt-In',
    description: 'Ambient speech buffering must not start until the user explicitly enables it AND acknowledges the bystander disclosure.',
    category: 'structural',
    enforcement: 'block',
    immutable: true,
    invariant_ref: 'ambient_bystander_disclosure',
    intent_patterns: ['enable_ambient', 'buffer_ambient_speech'],
  },
  {
    id: 'guard-ambient-send-requires-activation',
    label: 'Block Ambient Send Without User Activation',
    description: 'Ambient context must only be included in AI calls when the user explicitly activates (tap, double-tap, wake word). The buffer never acts autonomously.',
    category: 'structural',
    enforcement: 'block',
    immutable: true,
    invariant_ref: 'ambient_user_initiated_only',
    intent_patterns: ['ai_send_ambient'],
  },

  // ── Operational Guards (can be tuned by governance profile) ────────────

  {
    id: 'guard-ai-call-rate',
    label: 'Rate Limit AI Calls',
    description: 'Pause and confirm when AI call rate exceeds the governance profile limit.',
    category: 'operational',
    enforcement: 'pause',
    immutable: false,
    intent_patterns: ['ai_send_transcription'],
    default_enabled: true,
  },
  {
    id: 'guard-camera-context',
    label: 'Gate Camera Context',
    description: 'Camera context requires explicit permission in the governance profile. Blocked when disallowed.',
    category: 'operational',
    enforcement: 'block',
    immutable: false,
    intent_patterns: ['capture_camera', 'ai_send_image'],
    default_enabled: true,
  },
  {
    id: 'guard-always-on',
    label: 'Gate Always-On Mode',
    description: 'Always-on listening requires explicit permission in the governance profile. Blocked when disallowed.',
    category: 'operational',
    enforcement: 'block',
    immutable: false,
    intent_patterns: ['enable_always_on'],
    default_enabled: true,
  },
  {
    id: 'guard-lens-stack-limit',
    label: 'Limit Lens Stacking',
    description: 'Warn when the user stacks more lenses than the governance profile allows.',
    category: 'operational',
    enforcement: 'pause',
    immutable: false,
    intent_patterns: ['stack_lens'],
    default_enabled: true,
  },
  {
    id: 'guard-ambient-token-budget',
    label: 'Enforce Ambient Token Budget',
    description: 'When ambient context exceeds the token budget, auto-truncate from oldest entries.',
    category: 'operational',
    enforcement: 'modify',
    immutable: false,
    intent_patterns: ['ai_send_ambient'],
    modify_to: 'Truncate ambient buffer from oldest entries to fit within max_ambient_tokens_per_call.',
    default_enabled: true,
  },

  // ── Proactive Guards ─────────────────────────────────────────────────

  {
    id: 'guard-proactive-requires-optin',
    label: 'Block Proactive Without Opt-In',
    description: 'Proactive classification and perspective delivery require explicit user opt-in via Settings > Proactive Frequency. Default is off. All ambient invariants still apply.',
    category: 'structural',
    enforcement: 'block',
    immutable: true,
    invariant_ref: 'proactive_opt_in',
    intent_patterns: ['proactive_classify', 'proactive_perspective'],
  },

  // ── Advisory Guards (warnings, no enforcement) ────────────────────────

  {
    id: 'guard-high-failure-rate',
    label: 'Warn on High Failure Rate',
    description: 'Advisory warning when AI call failure rate is high. Check API key.',
    category: 'advisory',
    enforcement: 'warn',
    immutable: false,
    intent_patterns: ['ai_send_transcription'],
    default_enabled: true,
  },
  {
    id: 'guard-ambient-buffer-stale',
    label: 'Warn on Stale Ambient Buffer',
    description: 'Advisory warning when ambient buffer contains entries older than the configured max age.',
    category: 'advisory',
    enforcement: 'warn',
    immutable: false,
    intent_patterns: ['ai_send_ambient'],
    default_enabled: true,
  },

  // ── Reward Guards (positive reinforcement) ────────────────────────────

  {
    id: 'guard-clean-session',
    label: 'Reward Clean Session',
    description: 'Boost trust when the user completes AI calls with zero governance violations.',
    category: 'advisory',
    enforcement: 'reward',
    immutable: false,
    intent_patterns: ['ai_send_transcription'],
    reward: {
      type: 'weight_increase',
      magnitude: 0.05,
      description: 'Session trust boosted by 5% for sustained clean operation.',
    },
    default_enabled: true,
  },
  {
    id: 'guard-governed-ambient',
    label: 'Reward Governed Ambient Usage',
    description: 'Boost trust when ambient context is used with full governance compliance.',
    category: 'advisory',
    enforcement: 'reward',
    immutable: false,
    intent_patterns: ['ai_send_ambient'],
    reward: {
      type: 'weight_increase',
      magnitude: 0.08,
      description: 'Session trust boosted by 8% for compliant ambient context usage.',
    },
    default_enabled: true,
  },
];

// ─── Kernel ─────────────────────────────────────────────────────────────────
// Input/output boundary enforcement. Patterns are checked against every AI
// call input (user message) and output (AI response). This catches prompt
// injection, data exfiltration attempts, and unsafe AI outputs.

const KERNEL: KernelConfig = {
  artifact_type: 'nv-kernel',
  kernel_id: 'lenses-app-kernel',
  version: '2.0.0',
  domain: 'lenses-app',
  enforcement_level: 'standard',

  input_boundaries: {
    forbidden_patterns: [
      {
        id: 'injection-ignore-instructions',
        pattern: 'ignore\\s+(all\\s+)?(previous|prior|above|system)\\s+(instructions?|prompts?|rules?)',
        reason: 'Prompt injection attempt: instruction override',
        action: 'BLOCK',
      },
      {
        id: 'injection-you-are-now',
        pattern: 'you\\s+are\\s+now\\s+(a|an|the|no\\s+longer)',
        reason: 'Prompt injection attempt: role hijacking',
        action: 'BLOCK',
      },
      {
        id: 'injection-reveal-system',
        pattern: '(reveal|show|print|output|repeat)\\s+(your|the)\\s+(system|initial|original)\\s+(prompt|instructions?|message)',
        reason: 'Prompt injection attempt: system prompt extraction',
        action: 'BLOCK',
      },
      {
        id: 'injection-jailbreak',
        pattern: '(DAN|do\\s+anything\\s+now|jailbreak|unrestricted\\s+mode|developer\\s+mode)',
        reason: 'Prompt injection attempt: jailbreak',
        action: 'BLOCK',
      },
      {
        id: 'injection-delimiter',
        pattern: '(\\[SYSTEM\\]|\\[INST\\]|<\\|im_start\\|>|<\\|system\\|>|<<SYS>>)',
        reason: 'Prompt injection attempt: delimiter attack',
        action: 'BLOCK',
      },
      {
        id: 'exfil-api-key-request',
        pattern: '(what\\s+is|tell\\s+me|show|reveal|print|output)\\s+(my|the|your)\\s+(api|API)\\s+key',
        reason: 'Data exfiltration attempt: API key extraction via prompt',
        action: 'BLOCK',
      },
      {
        id: 'exfil-ambient-dump',
        pattern: '(repeat|recite|output|print|list)\\s+(everything|all|the\\s+entire)\\s+(you\\s+heard|ambient|buffer|transcript)',
        reason: 'Data exfiltration attempt: ambient buffer dump via prompt',
        action: 'WARN',
      },
    ],
  },

  output_boundaries: {
    forbidden_patterns: [
      {
        id: 'output-api-key-leak',
        pattern: '(sk-[a-zA-Z0-9]{20,}|key-[a-zA-Z0-9]{20,})',
        reason: 'Output contains what appears to be an API key. Blocked to prevent credential leak.',
        action: 'BLOCK',
      },
      {
        id: 'output-system-prompt-leak',
        pattern: '(## Behavioral Guidelines|## Constraints|systemPromptAddition|compileLensOverlay)',
        reason: 'Output contains system prompt internals. Blocked to prevent governance leak.',
        action: 'BLOCK',
      },
      {
        id: 'output-verbatim-ambient',
        pattern: '\\[CONTEXT — what was just said around me',
        reason: 'Output repeats the ambient context injection verbatim. The lens should use ambient context, not echo it.',
        action: 'WARN',
      },
    ],
  },

  response_vocabulary: {
    blocked_input: 'I can\'t process that request.',
    blocked_output: 'Response filtered by governance.',
    rate_limited: 'Give me a moment.',
    ambient_blocked: 'Ambient context is not available right now.',
    api_key_invalid: 'Check your API key in Settings.',
  },

  metadata: {
    compiled_by: 'neuroverse-governance-v2',
    compiled_at: '2026-03-24T00:00:00.000Z',
    source_hash: 'lenses-app-kernel-v2',
    compiler_version: '0.4.0',
  },
};

// ─── Roles ──────────────────────────────────────────────────────────────────
// Who can do what. The Lenses app has three roles:
// - user: The person wearing the glasses (most common)
// - admin: App developer / NeuroverseOS admin
// - auditor: Read-only governance inspector

const ROLES: RolesConfig = {
  assignment: 'per_session',
  roles: [
    {
      id: 'user',
      archetype: 'operator',
      authority: 'execute_within_limits',
      posture: 'task_oriented',
      name: 'User',
      description: 'The person wearing the glasses. Interacts with AI through lenses. Controls their own governance profile, lens selection, API key, and activation mode.',
      icon: '👓',
      roleMandate: 'Use AI through lenses within governed boundaries',
      voiceStyle: 'Conversational, spoken through glasses display',
      canDo: [
        'activate_listening',
        'ai_send_transcription',
        'ai_send_ambient',
        'ai_send_image',
        'ai_send_location',
        'display_response',
        'switch_lens',
        'stack_lens',
        'capture_camera',
        'enable_ambient',
        'enable_always_on',
      ],
      cannotDo: [
        'persist_session_data',
        'export_data',
        'transmit_api_key',
        'access_api_key',
      ],
      trackedOutcomes: ['session_trust', 'ai_calls_made', 'ambient_sends'],
      defaultLens: 'stoic',
    },
    {
      id: 'admin',
      archetype: 'steward',
      authority: 'escalate_audit_freeze',
      posture: 'system_integrity',
      name: 'Admin',
      description: 'NeuroverseOS app administrator. Can inspect governance state, freeze sessions, and audit compliance. Cannot access user data or API keys.',
      icon: '🔧',
      roleMandate: 'Ensure governance compliance across all sessions',
      voiceStyle: 'Technical, governance-focused',
      canDo: [
        'display_response',
        'switch_lens',
      ],
      cannotDo: [
        'ai_send_transcription',
        'ai_send_ambient',
        'ai_send_image',
        'capture_camera',
        'persist_session_data',
        'export_data',
        'transmit_api_key',
        'access_api_key',
        'enable_always_on',
      ],
      trackedOutcomes: ['session_trust', 'governance_blocks'],
    },
    {
      id: 'auditor',
      archetype: 'observer',
      authority: 'none',
      posture: 'analyze',
      name: 'Auditor',
      description: 'Read-only governance inspector. Can view governance verdicts, session metrics, and compliance reports. Cannot trigger any actions.',
      icon: '🔍',
      roleMandate: 'Observe and report on governance compliance',
      voiceStyle: 'Analytical, evidence-based',
      canDo: [
        'display_response',
      ],
      cannotDo: [
        'activate_listening',
        'ai_send_transcription',
        'ai_send_ambient',
        'ai_send_image',
        'ai_send_location',
        'capture_camera',
        'switch_lens',
        'stack_lens',
        'enable_ambient',
        'enable_always_on',
        'persist_session_data',
        'export_data',
        'transmit_api_key',
        'access_api_key',
      ],
      trackedOutcomes: ['session_trust', 'governance_blocks', 'ambient_sends'],
    },
  ] as WorldRoleDefinition[],
  transitions: [
    {
      from: 'user',
      to: 'admin',
      initiator: 'steward',
      condition: 'Requires NeuroverseOS admin authentication',
    },
    {
      from: 'admin',
      to: 'user',
      initiator: 'self',
      condition: 'Admin can step down to user role at any time',
    },
  ],
};

// ─── Assemble Guards Config ─────────────────────────────────────────────────

const GUARDS_CONFIG: GuardsConfig = {
  guards: GUARDS,
  intent_vocabulary: INTENT_VOCABULARY,
  tool_surfaces: ['ai_api', 'microphone', 'camera', 'display', 'ram_buffer'],
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Load the Lenses app world from markdown, then add guards, kernel, and roles.
 *
 * This is the full governance pipeline:
 *   .nv-world.md → parse → emit → add guards/kernel/roles → WorldDefinition
 *
 * Returns the complete WorldDefinition ready for the guard engine.
 */
export function loadLensesGovernedWorld(): WorldDefinition {
  const worldPath = resolve(__dirname, './lenses-app.nv-world.md');
  const worldMd = readFileSync(worldPath, 'utf-8');
  const parseResult = parseWorldMarkdown(worldMd);

  if (!parseResult.world || parseResult.issues.some(i => i.severity === 'error')) {
    const errors = parseResult.issues.filter(i => i.severity === 'error');
    throw new Error(
      `Failed to parse lenses-app.nv-world.md: ${errors.map(e => e.message).join(', ')}`,
    );
  }

  const { world: baseWorld } = emitWorldDefinition(parseResult.world);

  // Add guards, kernel, and roles on top of the parsed world
  const governedWorld: WorldDefinition = {
    ...baseWorld,
    guards: GUARDS_CONFIG,
    kernel: KERNEL,
    roles: ROLES,
  };

  return governedWorld;
}

/**
 * Get just the guards config (for testing or inspection).
 */
export function getLensesGuards(): GuardsConfig {
  return GUARDS_CONFIG;
}

/**
 * Get just the kernel config (for testing or inspection).
 */
export function getLensesKernel(): KernelConfig {
  return KERNEL;
}

/**
 * Get just the roles config (for testing or inspection).
 */
export function getLensesRoles(): RolesConfig {
  return ROLES;
}
