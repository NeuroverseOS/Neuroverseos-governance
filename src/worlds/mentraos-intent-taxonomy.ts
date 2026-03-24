/**
 * MentraOS Intent Taxonomy — Canonical Intent-to-SDK Mapping
 *
 * This is the contract between NeuroVerse governance and the MentraOS platform.
 * Every user action that touches hardware, data, AI processing, or session
 * state must map to exactly one intent in this taxonomy. The guard engine
 * evaluates intents, not natural language.
 *
 * Two categories of intents:
 *   1. Hardware intents — SDK methods that access glasses hardware
 *   2. AI interaction intents — data flows to AI APIs, AI actions on
 *      behalf of the user, AI data retention decisions
 *
 * Flow:
 *   User speech → classifyIntentWithAI(knownIntents) → MentraIntent
 *   → evaluateGuard(event, world) → verdict → MentraOS SDK call (or block)
 *
 * Design rules:
 *   - One intent per SDK method or AI action type. No ambiguity.
 *   - Intent names are snake_case, prefixed by domain.
 *   - Every intent declares which MentraOS permission it requires.
 *   - Every intent declares which glasses support it.
 *   - AI intents use 'NONE' permission (they operate at the app server layer).
 *   - The taxonomy is the single source of truth for governance coverage.
 */

// ─── Intent Definition ──────────────────────────────────────────────────────

export interface MentraIntentDefinition {
  /** Canonical intent identifier (e.g., "camera_photo_capture") */
  intent: string;

  /** Human-readable description of what this intent does */
  description: string;

  /** MentraOS SDK method(s) this maps to */
  sdk_method: string;

  /** MentraOS permission required (from app_config.json) */
  permission: MentraPermission;

  /** Hardware domain this intent belongs to */
  domain: MentraDomain;

  /** Which glasses models support this capability */
  supported_glasses: GlassesModel[];

  /** Governance tool category for guard engine classification */
  action_category: 'read' | 'write' | 'delete' | 'network' | 'shell' | 'browser' | 'other';

  /** Risk level baseline (can be elevated by spatial context) */
  base_risk: 'low' | 'medium' | 'high' | 'critical';

  /** Whether the action produces data that leaves the device boundary */
  exfiltration_risk: boolean;

  /** Whether the action is reversible */
  reversible: boolean;
}

// ─── Enums ──────────────────────────────────────────────────────────────────

export type MentraPermission =
  | 'CAMERA'
  | 'MICROPHONE'
  | 'LOCATION'
  | 'CALENDAR'
  | 'READ_NOTIFICATIONS'
  | 'NONE';

export type MentraDomain =
  | 'camera'
  | 'microphone'
  | 'display'
  | 'location'
  | 'calendar'
  | 'notifications'
  | 'session'
  | 'dashboard'
  | 'audio'
  | 'tool_call'
  | 'ai_data'
  | 'ai_action';

export type GlassesModel =
  | 'even_realities_g1'
  | 'mentra_live'
  | 'mentra_mach1'
  | 'vuzix_z100';

// ─── Taxonomy ───────────────────────────────────────────────────────────────

export const MENTRA_INTENT_TAXONOMY: MentraIntentDefinition[] = [

  // ── Camera Domain ───────────────────────────────────────────────────────

  {
    intent: 'camera_photo_capture',
    description: 'Capture a single photo from the glasses camera',
    sdk_method: 'session.camera.requestPhoto()',
    permission: 'CAMERA',
    domain: 'camera',
    supported_glasses: ['mentra_live'],
    action_category: 'write',
    base_risk: 'high',
    exfiltration_risk: true,
    reversible: false,
  },
  {
    intent: 'camera_stream_start',
    description: 'Start a managed video stream (HLS) from the glasses camera',
    sdk_method: 'session.camera.startManagedStream()',
    permission: 'CAMERA',
    domain: 'camera',
    supported_glasses: ['mentra_live'],
    action_category: 'write',
    base_risk: 'critical',
    exfiltration_risk: true,
    reversible: true,
  },
  {
    intent: 'camera_stream_stop',
    description: 'Stop an active camera stream',
    sdk_method: 'session.camera.stopStream()',
    permission: 'CAMERA',
    domain: 'camera',
    supported_glasses: ['mentra_live'],
    action_category: 'write',
    base_risk: 'low',
    exfiltration_risk: false,
    reversible: false,
  },
  {
    intent: 'camera_restream_start',
    description: 'Restream camera feed to an external RTMP destination (e.g., social media)',
    sdk_method: 'session.camera.startRestream()',
    permission: 'CAMERA',
    domain: 'camera',
    supported_glasses: ['mentra_live'],
    action_category: 'network',
    base_risk: 'critical',
    exfiltration_risk: true,
    reversible: true,
  },

  // ── Microphone Domain ──────────────────────────────────────────────────

  {
    intent: 'microphone_transcription_start',
    description: 'Start receiving speech-to-text transcription events',
    sdk_method: 'session.events.onTranscription()',
    permission: 'MICROPHONE',
    domain: 'microphone',
    supported_glasses: ['even_realities_g1', 'mentra_live'],
    action_category: 'read',
    base_risk: 'medium',
    exfiltration_risk: true,
    reversible: true,
  },
  {
    intent: 'microphone_translation_start',
    description: 'Start receiving translation events from spoken audio',
    sdk_method: 'session.events.onTranslation()',
    permission: 'MICROPHONE',
    domain: 'microphone',
    supported_glasses: ['even_realities_g1', 'mentra_live'],
    action_category: 'read',
    base_risk: 'medium',
    exfiltration_risk: true,
    reversible: true,
  },
  {
    intent: 'microphone_phone_passthrough',
    description: 'Use phone microphone as audio input (glasses without built-in mic)',
    sdk_method: 'session.audio.startPhoneMic()',
    permission: 'MICROPHONE',
    domain: 'microphone',
    supported_glasses: ['mentra_mach1', 'vuzix_z100'],
    action_category: 'read',
    base_risk: 'medium',
    exfiltration_risk: true,
    reversible: true,
  },

  // ── Display Domain ────────────────────────────────────────────────────

  {
    intent: 'display_text_wall',
    description: 'Show a single text block on the glasses display',
    sdk_method: 'session.layouts.showTextWall()',
    permission: 'NONE',
    domain: 'display',
    supported_glasses: ['even_realities_g1', 'mentra_mach1', 'vuzix_z100'],
    action_category: 'write',
    base_risk: 'low',
    exfiltration_risk: false,
    reversible: true,
  },
  {
    intent: 'display_double_text_wall',
    description: 'Show two text blocks (top/bottom) on the glasses display',
    sdk_method: 'session.layouts.showDoubleTextWall()',
    permission: 'NONE',
    domain: 'display',
    supported_glasses: ['even_realities_g1', 'mentra_mach1', 'vuzix_z100'],
    action_category: 'write',
    base_risk: 'low',
    exfiltration_risk: false,
    reversible: true,
  },
  {
    intent: 'display_reference_card',
    description: 'Show a reference card layout with structured content',
    sdk_method: 'session.layouts.showReferenceCard()',
    permission: 'NONE',
    domain: 'display',
    supported_glasses: ['even_realities_g1'],
    action_category: 'write',
    base_risk: 'low',
    exfiltration_risk: false,
    reversible: true,
  },
  {
    intent: 'display_dashboard_card',
    description: 'Show a dashboard card layout',
    sdk_method: 'session.layouts.showDashboardCard()',
    permission: 'NONE',
    domain: 'display',
    supported_glasses: ['even_realities_g1'],
    action_category: 'write',
    base_risk: 'low',
    exfiltration_risk: false,
    reversible: true,
  },
  {
    intent: 'display_image',
    description: 'Display an image on the glasses',
    sdk_method: 'session.layouts.showImage()',
    permission: 'NONE',
    domain: 'display',
    supported_glasses: ['even_realities_g1'],
    action_category: 'write',
    base_risk: 'low',
    exfiltration_risk: false,
    reversible: true,
  },

  // ── Dashboard Domain ──────────────────────────────────────────────────

  {
    intent: 'dashboard_update_main',
    description: 'Update the persistent dashboard content (compact mode)',
    sdk_method: 'session.dashboard.content.setMain()',
    permission: 'NONE',
    domain: 'dashboard',
    supported_glasses: ['even_realities_g1', 'mentra_mach1', 'vuzix_z100'],
    action_category: 'write',
    base_risk: 'low',
    exfiltration_risk: false,
    reversible: true,
  },
  {
    intent: 'dashboard_update_expanded',
    description: 'Update the expanded dashboard content (user-opened mode)',
    sdk_method: 'session.dashboard.content.setExpanded()',
    permission: 'NONE',
    domain: 'dashboard',
    supported_glasses: ['even_realities_g1', 'mentra_mach1', 'vuzix_z100'],
    action_category: 'write',
    base_risk: 'low',
    exfiltration_risk: false,
    reversible: true,
  },

  // ── Location Domain ───────────────────────────────────────────────────

  {
    intent: 'location_access',
    description: 'Access current location data from the paired phone',
    sdk_method: 'session.location.get()',
    permission: 'LOCATION',
    domain: 'location',
    supported_glasses: ['even_realities_g1', 'mentra_live', 'mentra_mach1', 'vuzix_z100'],
    action_category: 'read',
    base_risk: 'medium',
    exfiltration_risk: true,
    reversible: false,
  },
  {
    intent: 'location_continuous_sharing',
    description: 'Start continuous location updates to the app server',
    sdk_method: 'session.location.startContinuous()',
    permission: 'LOCATION',
    domain: 'location',
    supported_glasses: ['even_realities_g1', 'mentra_live', 'mentra_mach1', 'vuzix_z100'],
    action_category: 'network',
    base_risk: 'high',
    exfiltration_risk: true,
    reversible: true,
  },

  // ── Calendar & Notifications ──────────────────────────────────────────

  {
    intent: 'calendar_read',
    description: 'Read calendar events from the paired phone',
    sdk_method: 'session.calendar.getEvents()',
    permission: 'CALENDAR',
    domain: 'calendar',
    supported_glasses: ['even_realities_g1', 'mentra_live', 'mentra_mach1', 'vuzix_z100'],
    action_category: 'read',
    base_risk: 'low',
    exfiltration_risk: false,
    reversible: true,
  },
  {
    intent: 'notifications_read',
    description: 'Read phone notifications',
    sdk_method: 'session.notifications.getRecent()',
    permission: 'READ_NOTIFICATIONS',
    domain: 'notifications',
    supported_glasses: ['even_realities_g1', 'mentra_live', 'mentra_mach1', 'vuzix_z100'],
    action_category: 'read',
    base_risk: 'low',
    exfiltration_risk: false,
    reversible: true,
  },

  // ── Audio Domain ──────────────────────────────────────────────────────

  {
    intent: 'audio_play',
    description: 'Play audio through the glasses speaker',
    sdk_method: 'session.audio.play()',
    permission: 'NONE',
    domain: 'audio',
    supported_glasses: ['mentra_live'],
    action_category: 'write',
    base_risk: 'low',
    exfiltration_risk: false,
    reversible: true,
  },

  // ── Session Domain ────────────────────────────────────────────────────

  {
    intent: 'session_data_export',
    description: 'Export session data to external storage or API',
    sdk_method: 'session.export()',
    permission: 'NONE',
    domain: 'session',
    supported_glasses: ['even_realities_g1', 'mentra_live', 'mentra_mach1', 'vuzix_z100'],
    action_category: 'network',
    base_risk: 'high',
    exfiltration_risk: true,
    reversible: false,
  },

  // ── Tool Call Domain ──────────────────────────────────────────────────

  {
    intent: 'tool_call_execute',
    description: 'Execute a custom tool call defined by the app via handleToolCall',
    sdk_method: 'AppServer.handleToolCall()',
    permission: 'NONE',
    domain: 'tool_call',
    supported_glasses: ['even_realities_g1', 'mentra_live', 'mentra_mach1', 'vuzix_z100'],
    action_category: 'other',
    base_risk: 'medium',
    exfiltration_risk: false,
    reversible: false,
  },

  // ── AI Data Flow Domain ─────────────────────────────────────────────────
  // These intents govern what user data apps send to their AI backends.
  // They operate at the app server layer (not the glasses hardware layer),
  // so they work on all glasses models and require no hardware permission.

  {
    intent: 'ai_send_transcription',
    description: 'Send user speech transcription to an external AI API for processing',
    sdk_method: 'app_server.ai.sendTranscription()',
    permission: 'NONE',
    domain: 'ai_data',
    supported_glasses: ['even_realities_g1', 'mentra_live', 'mentra_mach1', 'vuzix_z100'],
    action_category: 'network',
    base_risk: 'medium',
    exfiltration_risk: true,
    reversible: false,
  },
  {
    intent: 'ai_send_image',
    description: 'Send a camera-captured image to an external AI API for vision analysis',
    sdk_method: 'app_server.ai.sendImage()',
    permission: 'NONE',
    domain: 'ai_data',
    supported_glasses: ['even_realities_g1', 'mentra_live', 'mentra_mach1', 'vuzix_z100'],
    action_category: 'network',
    base_risk: 'high',
    exfiltration_risk: true,
    reversible: false,
  },
  {
    intent: 'ai_send_location',
    description: 'Send user location data to an external AI API for context-aware processing',
    sdk_method: 'app_server.ai.sendLocation()',
    permission: 'NONE',
    domain: 'ai_data',
    supported_glasses: ['even_realities_g1', 'mentra_live', 'mentra_mach1', 'vuzix_z100'],
    action_category: 'network',
    base_risk: 'medium',
    exfiltration_risk: true,
    reversible: false,
  },
  {
    intent: 'ai_send_calendar',
    description: 'Send user calendar data to an external AI API for scheduling assistance',
    sdk_method: 'app_server.ai.sendCalendar()',
    permission: 'NONE',
    domain: 'ai_data',
    supported_glasses: ['even_realities_g1', 'mentra_live', 'mentra_mach1', 'vuzix_z100'],
    action_category: 'network',
    base_risk: 'medium',
    exfiltration_risk: true,
    reversible: false,
  },
  {
    intent: 'ai_send_notifications',
    description: 'Send user notification data to an external AI API for summarization or triage',
    sdk_method: 'app_server.ai.sendNotifications()',
    permission: 'NONE',
    domain: 'ai_data',
    supported_glasses: ['even_realities_g1', 'mentra_live', 'mentra_mach1', 'vuzix_z100'],
    action_category: 'network',
    base_risk: 'medium',
    exfiltration_risk: true,
    reversible: false,
  },

  // ── AI Action Domain ──────────────────────────────────────────────────
  // These intents govern actions AI takes on behalf of the user.
  // Every action here must be shown on the glasses display before execution.

  {
    intent: 'ai_auto_respond_message',
    description: 'AI generates and sends a message (email, SMS, chat) on the user\'s behalf',
    sdk_method: 'app_server.ai.sendMessage()',
    permission: 'NONE',
    domain: 'ai_action',
    supported_glasses: ['even_realities_g1', 'mentra_live', 'mentra_mach1', 'vuzix_z100'],
    action_category: 'network',
    base_risk: 'high',
    exfiltration_risk: true,
    reversible: false,
  },
  {
    intent: 'ai_auto_purchase',
    description: 'AI initiates a financial transaction (purchase, subscription, tip) on the user\'s behalf',
    sdk_method: 'app_server.ai.purchase()',
    permission: 'NONE',
    domain: 'ai_action',
    supported_glasses: ['even_realities_g1', 'mentra_live', 'mentra_mach1', 'vuzix_z100'],
    action_category: 'network',
    base_risk: 'critical',
    exfiltration_risk: true,
    reversible: false,
  },
  {
    intent: 'ai_auto_schedule',
    description: 'AI creates, modifies, or cancels a calendar event on the user\'s behalf',
    sdk_method: 'app_server.ai.schedule()',
    permission: 'NONE',
    domain: 'ai_action',
    supported_glasses: ['even_realities_g1', 'mentra_live', 'mentra_mach1', 'vuzix_z100'],
    action_category: 'write',
    base_risk: 'medium',
    exfiltration_risk: false,
    reversible: true,
  },
  {
    intent: 'ai_auto_setting_change',
    description: 'AI changes a user setting or app configuration on the user\'s behalf',
    sdk_method: 'app_server.ai.changeSetting()',
    permission: 'NONE',
    domain: 'ai_action',
    supported_glasses: ['even_realities_g1', 'mentra_live', 'mentra_mach1', 'vuzix_z100'],
    action_category: 'write',
    base_risk: 'medium',
    exfiltration_risk: false,
    reversible: true,
  },
  {
    intent: 'ai_retain_session_data',
    description: 'AI or app retains user session data (transcriptions, images, conversation) beyond session end',
    sdk_method: 'app_server.ai.retainData()',
    permission: 'NONE',
    domain: 'ai_data',
    supported_glasses: ['even_realities_g1', 'mentra_live', 'mentra_mach1', 'vuzix_z100'],
    action_category: 'write',
    base_risk: 'high',
    exfiltration_risk: true,
    reversible: false,
  },
  {
    intent: 'ai_share_with_third_party',
    description: 'AI or app shares user data with a third-party service beyond the declared AI provider',
    sdk_method: 'app_server.ai.shareExternal()',
    permission: 'NONE',
    domain: 'ai_data',
    supported_glasses: ['even_realities_g1', 'mentra_live', 'mentra_mach1', 'vuzix_z100'],
    action_category: 'network',
    base_risk: 'critical',
    exfiltration_risk: true,
    reversible: false,
  },
];

// ─── Lookup Helpers ─────────────────────────────────────────────────────────

/** All canonical intent strings for use with classifyIntentWithAI() */
export const MENTRA_KNOWN_INTENTS: string[] =
  MENTRA_INTENT_TAXONOMY.map(d => d.intent);

/** Map from intent string to full definition */
export const MENTRA_INTENT_MAP: Map<string, MentraIntentDefinition> =
  new Map(MENTRA_INTENT_TAXONOMY.map(d => [d.intent, d]));

/** Get the definition for an intent, or undefined if unknown */
export function getMentraIntent(intent: string): MentraIntentDefinition | undefined {
  return MENTRA_INTENT_MAP.get(intent);
}

/** Get all intents that require a specific permission */
export function getIntentsByPermission(permission: MentraPermission): MentraIntentDefinition[] {
  return MENTRA_INTENT_TAXONOMY.filter(d => d.permission === permission);
}

/** Get all intents supported by a specific glasses model */
export function getIntentsByGlasses(model: GlassesModel): MentraIntentDefinition[] {
  return MENTRA_INTENT_TAXONOMY.filter(d => d.supported_glasses.includes(model));
}

/** Check if an intent is supported on a given glasses model */
export function isIntentSupported(intent: string, model: GlassesModel): boolean {
  const def = MENTRA_INTENT_MAP.get(intent);
  return def ? def.supported_glasses.includes(model) : false;
}

/** Get all high-risk or critical intents */
export function getHighRiskIntents(): MentraIntentDefinition[] {
  return MENTRA_INTENT_TAXONOMY.filter(d => d.base_risk === 'high' || d.base_risk === 'critical');
}

/** Get all intents with exfiltration risk */
export function getExfiltrationIntents(): MentraIntentDefinition[] {
  return MENTRA_INTENT_TAXONOMY.filter(d => d.exfiltration_risk);
}

/** Get all AI data flow intents (data sent to AI APIs) */
export function getAIDataIntents(): MentraIntentDefinition[] {
  return MENTRA_INTENT_TAXONOMY.filter(d => d.domain === 'ai_data');
}

/** Get all AI action intents (actions AI takes on user's behalf) */
export function getAIActionIntents(): MentraIntentDefinition[] {
  return MENTRA_INTENT_TAXONOMY.filter(d => d.domain === 'ai_action');
}

/** Get all AI-related intents (data + actions) */
export function getAIIntents(): MentraIntentDefinition[] {
  return MENTRA_INTENT_TAXONOMY.filter(d => d.domain === 'ai_data' || d.domain === 'ai_action');
}

/** Check if an intent is an AI interaction intent */
export function isAIIntent(intent: string): boolean {
  const def = MENTRA_INTENT_MAP.get(intent);
  return def ? (def.domain === 'ai_data' || def.domain === 'ai_action') : false;
}
