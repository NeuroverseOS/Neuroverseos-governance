/**
 * Governance Question Set — The 12 Questions That Define Your AI
 *
 * These questions are the front door to the governance system.
 * A user answers 12 plain-language questions. Each answer maps to
 * one or more governance rules. The rules compile into a world file.
 *
 * Design principles:
 *   - Every question is answerable by a non-technical person
 *   - Every question maps to a real governance constraint
 *   - Questions are ordered from most intuitive to most nuanced
 *   - Each question has 2-4 answer options, never more
 *   - The "safe" answer is always the default
 *
 * Categories:
 *   1-3:  Communication & Identity (AI speaking as you)
 *   4-5:  Money & Transactions
 *   6-8:  Data & Privacy
 *   9-10: Autonomy & Control
 *   11-12: Memory & Retention
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GovernanceQuestion {
  /** Unique question identifier */
  id: string;

  /** Category for grouping in the UI */
  category: 'communication' | 'money' | 'privacy' | 'autonomy' | 'memory';

  /** The question as spoken to the user (conversational, not technical) */
  prompt: string;

  /** Short follow-up context if the user seems unsure */
  clarification: string;

  /** The answer options */
  options: AnswerOption[];

  /** Index of the default (safe) option */
  defaultIndex: number;

  /** Priority order for display (lower = asked first) */
  order: number;
}

export interface AnswerOption {
  /** Machine-readable value */
  value: string;

  /** What the user hears/reads as their choice */
  label: string;

  /** One-line explanation of what this means */
  explanation: string;

  /** The governance rules this answer produces */
  rules: RuleMapping[];
}

export interface RuleMapping {
  /** Rule identifier (maps to world file rule IDs) */
  ruleId: string;

  /** Plain English description of the rule */
  description: string;

  /** The constraint type */
  constraint: 'block' | 'confirm' | 'allow' | 'limit';

  /** What this rule controls */
  scope: string;

  /** Structured rule data for the compiler */
  data: Record<string, unknown>;
}

// ─── The Questions ──────────────────────────────────────────────────────────

export const GOVERNANCE_QUESTIONS: GovernanceQuestion[] = [

  // ═══ Communication & Identity ═════════════════════════════════════════════

  {
    id: 'ai_send_messages',
    category: 'communication',
    order: 1,
    prompt: 'Should AI ever send messages for you — emails, texts, or chats?',
    clarification: 'This means AI composing and sending a message that appears to come from you, like replying to an email or sending a text.',
    defaultIndex: 1,
    options: [
      {
        value: 'never',
        label: 'Never',
        explanation: 'AI can never send any message on your behalf',
        rules: [{
          ruleId: 'ai_messaging_blocked',
          description: 'AI cannot send messages on your behalf',
          constraint: 'block',
          scope: 'ai_auto_respond_message',
          data: { aiMessagingPolicy: 'block_all' },
        }],
      },
      {
        value: 'ask_each_time',
        label: 'Only if I approve each message first',
        explanation: 'AI shows you the draft on your glasses — you tap to send or discard',
        rules: [{
          ruleId: 'ai_messaging_confirm',
          description: 'AI must show you each message before sending',
          constraint: 'confirm',
          scope: 'ai_auto_respond_message',
          data: { aiMessagingPolicy: 'confirm_each' },
        }],
      },
      {
        value: 'allow_low_risk',
        label: 'Auto-send simple replies, ask for important ones',
        explanation: 'Quick replies like "On my way" or "Thanks" send automatically — longer messages need your OK',
        rules: [{
          ruleId: 'ai_messaging_tiered',
          description: 'Simple replies auto-send; important messages require your approval',
          constraint: 'allow',
          scope: 'ai_auto_respond_message',
          data: { aiMessagingPolicy: 'tiered', autoReplyMaxLength: 20 },
        }],
      },
    ],
  },

  {
    id: 'ai_social_media',
    category: 'communication',
    order: 2,
    prompt: 'Can AI post to your social media?',
    clarification: 'This means AI creating and publishing posts, comments, or stories on platforms like Instagram, Twitter, or LinkedIn.',
    defaultIndex: 0,
    options: [
      {
        value: 'never',
        label: 'Never',
        explanation: 'AI can never post to any social media account',
        rules: [{
          ruleId: 'ai_social_blocked',
          description: 'AI cannot post to your social media',
          constraint: 'block',
          scope: 'ai_social_post',
          data: { aiSocialPolicy: 'block_all' },
        }],
      },
      {
        value: 'draft_only',
        label: 'It can draft posts, but I publish them myself',
        explanation: 'AI prepares posts and saves them as drafts — you decide what goes live',
        rules: [{
          ruleId: 'ai_social_draft',
          description: 'AI can draft social media posts but cannot publish',
          constraint: 'confirm',
          scope: 'ai_social_post',
          data: { aiSocialPolicy: 'draft_only' },
        }],
      },
    ],
  },

  {
    id: 'ai_voice_identity',
    category: 'communication',
    order: 3,
    prompt: 'Can AI speak in phone calls or voice chats as you?',
    clarification: 'This means AI using a voice — whether synthetic or cloned — to speak to another person in a call, representing itself as you.',
    defaultIndex: 0,
    options: [
      {
        value: 'never',
        label: 'Never — only I speak as me',
        explanation: 'AI can never represent your voice in calls or voice chats',
        rules: [{
          ruleId: 'ai_voice_blocked',
          description: 'AI cannot speak as you in calls',
          constraint: 'block',
          scope: 'ai_voice_call',
          data: { aiVoicePolicy: 'block_all' },
        }],
      },
      {
        value: 'disclose',
        label: 'Only if it says it\'s an AI assistant',
        explanation: 'AI can handle calls but must identify itself as your AI assistant, not as you',
        rules: [{
          ruleId: 'ai_voice_disclosed',
          description: 'AI can speak in calls only if it identifies itself as an AI',
          constraint: 'allow',
          scope: 'ai_voice_call',
          data: { aiVoicePolicy: 'disclosed_only' },
        }],
      },
    ],
  },

  // ═══ Money & Transactions ═════════════════════════════════════════════════

  {
    id: 'ai_purchases',
    category: 'money',
    order: 4,
    prompt: 'Should AI ever be able to spend your money?',
    clarification: 'This covers purchases, subscriptions, tips, donations — anything that charges your payment method.',
    defaultIndex: 0,
    options: [
      {
        value: 'never',
        label: 'Never',
        explanation: 'AI can never initiate any financial transaction',
        rules: [{
          ruleId: 'ai_purchase_blocked',
          description: 'AI cannot spend your money',
          constraint: 'block',
          scope: 'ai_auto_purchase',
          data: { aiPurchasePolicy: 'block_all' },
        }],
      },
      {
        value: 'confirm_each',
        label: 'Only with my approval for each purchase',
        explanation: 'AI shows the item, price, and payment method — you approve or decline each time',
        rules: [{
          ruleId: 'ai_purchase_confirm',
          description: 'AI must get your approval for every purchase',
          constraint: 'confirm',
          scope: 'ai_auto_purchase',
          data: { aiPurchasePolicy: 'confirm_each' },
        }],
      },
    ],
  },

  {
    id: 'ai_subscriptions',
    category: 'money',
    order: 5,
    prompt: 'Can AI sign you up for free trials or subscriptions?',
    clarification: 'Free trials often convert to paid subscriptions. This controls whether AI can commit you to any recurring service.',
    defaultIndex: 0,
    options: [
      {
        value: 'never',
        label: 'Never — I sign up for things myself',
        explanation: 'AI cannot create any accounts, trials, or subscriptions on your behalf',
        rules: [{
          ruleId: 'ai_subscription_blocked',
          description: 'AI cannot sign you up for trials or subscriptions',
          constraint: 'block',
          scope: 'ai_subscription',
          data: { aiSubscriptionPolicy: 'block_all' },
        }],
      },
      {
        value: 'confirm',
        label: 'Only with my explicit approval',
        explanation: 'AI shows the terms and asks for your confirmation before any signup',
        rules: [{
          ruleId: 'ai_subscription_confirm',
          description: 'AI must get your approval before any signup',
          constraint: 'confirm',
          scope: 'ai_subscription',
          data: { aiSubscriptionPolicy: 'confirm_each' },
        }],
      },
    ],
  },

  // ═══ Data & Privacy ═══════════════════════════════════════════════════════

  {
    id: 'ai_camera_sharing',
    category: 'privacy',
    order: 6,
    prompt: 'Can apps send what your camera sees to AI for analysis?',
    clarification: 'Some apps use AI to identify objects, read text, or recognize food. This sends your camera image to a cloud AI service.',
    defaultIndex: 1,
    options: [
      {
        value: 'never',
        label: 'Never send camera images to AI',
        explanation: 'No app can send camera data to any AI service — camera stays fully local',
        rules: [{
          ruleId: 'ai_camera_blocked',
          description: 'Camera data cannot be sent to AI services',
          constraint: 'block',
          scope: 'ai_send_image',
          data: { aiCameraPolicy: 'block_all' },
        }],
      },
      {
        value: 'ask_each_time',
        label: 'Ask me each time before sending',
        explanation: 'You see a preview of what will be sent and tap to approve or decline',
        rules: [{
          ruleId: 'ai_camera_confirm',
          description: 'You must approve each time before camera data is sent to AI',
          constraint: 'confirm',
          scope: 'ai_send_image',
          data: { aiCameraPolicy: 'confirm_each' },
        }],
      },
      {
        value: 'declared_apps',
        label: 'Allow apps that told me upfront they use AI',
        explanation: 'Apps that disclosed AI camera use when you installed them can send images — undisclosed apps are blocked',
        rules: [{
          ruleId: 'ai_camera_declared',
          description: 'Only apps that declared AI camera use at install can send images',
          constraint: 'allow',
          scope: 'ai_send_image',
          data: { aiCameraPolicy: 'declared_only' },
        }],
      },
    ],
  },

  {
    id: 'ai_listening',
    category: 'privacy',
    order: 7,
    prompt: 'Can apps send your conversations to AI?',
    clarification: 'Apps that transcribe speech or translate languages send your audio (as text) to AI services for processing.',
    defaultIndex: 2,
    options: [
      {
        value: 'never',
        label: 'Never — keep all audio local',
        explanation: 'No speech data ever leaves your device for AI processing',
        rules: [{
          ruleId: 'ai_audio_blocked',
          description: 'Speech and audio data cannot be sent to AI',
          constraint: 'block',
          scope: 'ai_send_transcription',
          data: { aiAudioPolicy: 'block_all' },
        }],
      },
      {
        value: 'ask_each_time',
        label: 'Ask me before each send',
        explanation: 'You see what text will be sent and approve or decline',
        rules: [{
          ruleId: 'ai_audio_confirm',
          description: 'You must approve each time before audio data is sent to AI',
          constraint: 'confirm',
          scope: 'ai_send_transcription',
          data: { aiAudioPolicy: 'confirm_each' },
        }],
      },
      {
        value: 'declared_apps',
        label: 'Allow apps that told me upfront',
        explanation: 'Apps that disclosed AI audio processing at install can transcribe — undisclosed apps are blocked',
        rules: [{
          ruleId: 'ai_audio_declared',
          description: 'Only apps that declared AI audio use can send transcriptions',
          constraint: 'allow',
          scope: 'ai_send_transcription',
          data: { aiAudioPolicy: 'declared_only' },
        }],
      },
    ],
  },

  {
    id: 'ai_location_sharing',
    category: 'privacy',
    order: 8,
    prompt: 'Can AI know where you are?',
    clarification: 'Some apps send your location to AI for context — like a restaurant finder or navigation assistant.',
    defaultIndex: 1,
    options: [
      {
        value: 'never',
        label: 'Never share my location with AI',
        explanation: 'No app can send your location data to any AI service',
        rules: [{
          ruleId: 'ai_location_blocked',
          description: 'Location data cannot be sent to AI',
          constraint: 'block',
          scope: 'ai_send_location',
          data: { aiLocationPolicy: 'block_all' },
        }],
      },
      {
        value: 'ask_each_time',
        label: 'Ask me each time',
        explanation: 'You approve or decline each time an app wants to share your location with AI',
        rules: [{
          ruleId: 'ai_location_confirm',
          description: 'You must approve each location share with AI',
          constraint: 'confirm',
          scope: 'ai_send_location',
          data: { aiLocationPolicy: 'confirm_each' },
        }],
      },
      {
        value: 'while_using',
        label: 'While I\'m actively using an app',
        explanation: 'Apps can share location with AI only while you\'re actively using them — not in the background',
        rules: [{
          ruleId: 'ai_location_active',
          description: 'AI gets location only while you actively use the app',
          constraint: 'allow',
          scope: 'ai_send_location',
          data: { aiLocationPolicy: 'active_use_only' },
        }],
      },
    ],
  },

  // ═══ Autonomy & Control ═══════════════════════════════════════════════════

  {
    id: 'ai_change_settings',
    category: 'autonomy',
    order: 9,
    prompt: 'Can AI change your settings or preferences?',
    clarification: 'This means AI adjusting things like volume, brightness, notification preferences, or app configurations on its own.',
    defaultIndex: 1,
    options: [
      {
        value: 'never',
        label: 'Never — I control all my settings',
        explanation: 'AI can suggest changes but cannot modify any setting or preference',
        rules: [{
          ruleId: 'ai_settings_blocked',
          description: 'AI cannot change your settings',
          constraint: 'block',
          scope: 'ai_auto_setting_change',
          data: { aiSettingsPolicy: 'block_all' },
        }],
      },
      {
        value: 'confirm',
        label: 'Only with my approval',
        explanation: 'AI proposes the change on your display — you confirm or reject',
        rules: [{
          ruleId: 'ai_settings_confirm',
          description: 'AI must show you setting changes before applying them',
          constraint: 'confirm',
          scope: 'ai_auto_setting_change',
          data: { aiSettingsPolicy: 'confirm_each' },
        }],
      },
      {
        value: 'minor_auto',
        label: 'Minor things automatically, big things need my OK',
        explanation: 'Volume, brightness, display mode adjust automatically — account or security settings require approval',
        rules: [{
          ruleId: 'ai_settings_tiered',
          description: 'Minor settings auto-adjust; significant changes need your approval',
          constraint: 'allow',
          scope: 'ai_auto_setting_change',
          data: { aiSettingsPolicy: 'tiered' },
        }],
      },
    ],
  },

  {
    id: 'ai_schedule_events',
    category: 'autonomy',
    order: 10,
    prompt: 'Can AI add or change events on your calendar?',
    clarification: 'This means AI creating meetings, moving appointments, or canceling events based on what it thinks you need.',
    defaultIndex: 1,
    options: [
      {
        value: 'never',
        label: 'Never touch my calendar',
        explanation: 'AI can show you calendar info but can never create, move, or delete events',
        rules: [{
          ruleId: 'ai_calendar_blocked',
          description: 'AI cannot modify your calendar',
          constraint: 'block',
          scope: 'ai_auto_schedule',
          data: { aiCalendarPolicy: 'block_all' },
        }],
      },
      {
        value: 'confirm',
        label: 'Only with my approval',
        explanation: 'AI shows the proposed calendar change — you approve or reject',
        rules: [{
          ruleId: 'ai_calendar_confirm',
          description: 'AI must show calendar changes before making them',
          constraint: 'confirm',
          scope: 'ai_auto_schedule',
          data: { aiCalendarPolicy: 'confirm_each' },
        }],
      },
      {
        value: 'add_only',
        label: 'It can add events, but not change or delete mine',
        explanation: 'AI can suggest and add new events but cannot modify or remove existing ones',
        rules: [{
          ruleId: 'ai_calendar_add_only',
          description: 'AI can add events but cannot change or delete existing ones',
          constraint: 'limit',
          scope: 'ai_auto_schedule',
          data: { aiCalendarPolicy: 'add_only' },
        }],
      },
    ],
  },

  // ═══ Memory & Retention ═══════════════════════════════════════════════════

  {
    id: 'ai_remember_conversations',
    category: 'memory',
    order: 11,
    prompt: 'Should AI remember your conversations after you\'re done?',
    clarification: 'This means AI keeping a record of what was said — your transcriptions, questions, and AI responses — after the session ends.',
    defaultIndex: 0,
    options: [
      {
        value: 'never',
        label: 'Forget everything when I\'m done',
        explanation: 'All conversation data is deleted when the session ends — every interaction starts fresh',
        rules: [{
          ruleId: 'ai_memory_ephemeral',
          description: 'AI forgets everything when your session ends',
          constraint: 'block',
          scope: 'ai_retain_session_data',
          data: { dataRetentionPolicy: 'never' },
        }],
      },
      {
        value: 'ask_each_time',
        label: 'Ask me at the end of each session',
        explanation: 'Before ending, AI asks "Want me to remember this?" — you choose each time',
        rules: [{
          ruleId: 'ai_memory_ask',
          description: 'AI asks before keeping any conversation data',
          constraint: 'confirm',
          scope: 'ai_retain_session_data',
          data: { dataRetentionPolicy: 'confirm_each_session' },
        }],
      },
      {
        value: 'opted_in_apps',
        label: 'Only for apps I\'ve specifically allowed',
        explanation: 'Apps you\'ve opted in to can remember — all other apps forget when you\'re done',
        rules: [{
          ruleId: 'ai_memory_opted_in',
          description: 'Only apps you specifically approved can remember conversations',
          constraint: 'allow',
          scope: 'ai_retain_session_data',
          data: { dataRetentionPolicy: 'app_declared' },
        }],
      },
    ],
  },

  {
    id: 'ai_share_between_apps',
    category: 'memory',
    order: 12,
    prompt: 'Can one app share your data with another app\'s AI?',
    clarification: 'For example, your fitness app sharing health data with a nutrition app\'s AI, or your calendar app sharing schedule data with a travel app.',
    defaultIndex: 0,
    options: [
      {
        value: 'never',
        label: 'Never — each app stays in its own lane',
        explanation: 'Apps cannot share your data with other apps or their AI services',
        rules: [{
          ruleId: 'ai_cross_app_blocked',
          description: 'Apps cannot share your data with other apps',
          constraint: 'block',
          scope: 'ai_share_with_third_party',
          data: { aiCrossAppPolicy: 'block_all' },
        }],
      },
      {
        value: 'ask_each_time',
        label: 'Ask me each time',
        explanation: 'You see exactly what data will be shared and with which app — you approve or decline',
        rules: [{
          ruleId: 'ai_cross_app_confirm',
          description: 'You must approve each time an app wants to share data with another app',
          constraint: 'confirm',
          scope: 'ai_share_with_third_party',
          data: { aiCrossAppPolicy: 'confirm_each' },
        }],
      },
    ],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get questions in display order */
export function getOrderedQuestions(): GovernanceQuestion[] {
  return [...GOVERNANCE_QUESTIONS].sort((a, b) => a.order - b.order);
}

/** Get questions by category */
export function getQuestionsByCategory(category: GovernanceQuestion['category']): GovernanceQuestion[] {
  return GOVERNANCE_QUESTIONS.filter(q => q.category === category);
}

/** Get the default answers (safest options) */
export function getDefaultAnswers(): Map<string, string> {
  const answers = new Map<string, string>();
  for (const q of GOVERNANCE_QUESTIONS) {
    answers.set(q.id, q.options[q.defaultIndex].value);
  }
  return answers;
}

/** Get all category labels for display */
export const CATEGORY_LABELS: Record<GovernanceQuestion['category'], string> = {
  communication: 'Communication & Identity',
  money: 'Money & Transactions',
  privacy: 'Data & Privacy',
  autonomy: 'Autonomy & Control',
  memory: 'Memory & Retention',
};

/** Category display order */
export const CATEGORY_ORDER: GovernanceQuestion['category'][] = [
  'communication',
  'money',
  'privacy',
  'autonomy',
  'memory',
];
