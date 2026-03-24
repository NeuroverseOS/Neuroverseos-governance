/**
 * Governance Presets — Start From a Real Scenario
 *
 * Instead of answering 12 questions from scratch, users can start
 * from a preset that matches their situation. Then adjust from there.
 *
 * Each preset is a complete set of answers to the 12 core questions,
 * tuned for a specific use case. Users can:
 *   1. Pick a preset
 *   2. See the rules it creates
 *   3. Toggle/adjust any rule
 *   4. Add custom rules on top
 *
 * Presets exist because most people fall into recognizable patterns:
 *   - "I'm privacy-conscious" → strict defaults
 *   - "I want AI to help me but not act for me" → confirm everything
 *   - "I just want it to work" → permissive defaults
 *   - "I run a business" → org-specific defaults
 */

import type { GovernanceBuilder } from './index';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GovernancePreset {
  /** Preset identifier */
  id: string;

  /** Display name */
  name: string;

  /** One-line description */
  tagline: string;

  /** Longer explanation of who this is for */
  description: string;

  /** Icon hint for UI */
  icon: 'shield' | 'brain' | 'lightning' | 'building' | 'hospital' | 'cart' | 'user';

  /** Answers to each of the 12 core questions */
  answers: Record<string, string>;
}

// ─── Presets ────────────────────────────────────────────────────────────────

export const GOVERNANCE_PRESETS: GovernancePreset[] = [

  // ── Privacy First ─────────────────────────────────────────────────────
  {
    id: 'privacy_first',
    name: 'Privacy First',
    tagline: 'AI helps you, but nothing leaves your control.',
    description: 'For people who value privacy above convenience. AI cannot send messages, make purchases, or share data without explicit approval every time. Nothing is remembered after the session. Camera and mic data require confirmation before being sent to AI.',
    icon: 'shield',
    answers: {
      ai_send_messages: 'never',
      ai_social_media: 'never',
      ai_voice_identity: 'never',
      ai_purchases: 'never',
      ai_subscriptions: 'never',
      ai_camera_sharing: 'ask_each_time',
      ai_listening: 'ask_each_time',
      ai_location_sharing: 'never',
      ai_change_settings: 'never',
      ai_schedule_events: 'never',
      ai_remember_conversations: 'never',
      ai_share_between_apps: 'never',
    },
  },

  // ── Helpful Assistant ─────────────────────────────────────────────────
  {
    id: 'helpful_assistant',
    name: 'Helpful Assistant',
    tagline: 'AI suggests everything, acts on nothing without your OK.',
    description: 'For people who want AI to be proactive and helpful but never act without permission. AI can see and hear through declared apps. It can suggest messages, purchases, and schedule changes — but every action requires your confirmation on the glasses display first.',
    icon: 'brain',
    answers: {
      ai_send_messages: 'ask_each_time',
      ai_social_media: 'draft_only',
      ai_voice_identity: 'never',
      ai_purchases: 'confirm_each',
      ai_subscriptions: 'confirm',
      ai_camera_sharing: 'declared_apps',
      ai_listening: 'declared_apps',
      ai_location_sharing: 'ask_each_time',
      ai_change_settings: 'confirm',
      ai_schedule_events: 'confirm',
      ai_remember_conversations: 'ask_each_time',
      ai_share_between_apps: 'ask_each_time',
    },
  },

  // ── Just Works ────────────────────────────────────────────────────────
  {
    id: 'just_works',
    name: 'Just Works',
    tagline: 'Minimal friction. AI handles the small stuff.',
    description: 'For people who want AI to reduce friction in their day. Simple replies auto-send. Calendar events auto-add. Settings auto-adjust. But the hard limits are still there: no purchases without approval, no impersonation, no data shared between apps.',
    icon: 'lightning',
    answers: {
      ai_send_messages: 'allow_low_risk',
      ai_social_media: 'draft_only',
      ai_voice_identity: 'never',
      ai_purchases: 'confirm_each',
      ai_subscriptions: 'never',
      ai_camera_sharing: 'declared_apps',
      ai_listening: 'declared_apps',
      ai_location_sharing: 'while_using',
      ai_change_settings: 'minor_auto',
      ai_schedule_events: 'add_only',
      ai_remember_conversations: 'opted_in_apps',
      ai_share_between_apps: 'ask_each_time',
    },
  },

  // ── Business Owner ────────────────────────────────────────────────────
  {
    id: 'business_owner',
    name: 'Business Owner',
    tagline: 'Your rules for your team\'s glasses.',
    description: 'For store owners, office managers, and team leads who manage multiple glasses. Strict data boundaries — no company data leaves the system. No purchases. No social media. AI helps with work tasks but cannot act autonomously. Camera and mic work through declared business apps only.',
    icon: 'building',
    answers: {
      ai_send_messages: 'ask_each_time',
      ai_social_media: 'never',
      ai_voice_identity: 'never',
      ai_purchases: 'never',
      ai_subscriptions: 'never',
      ai_camera_sharing: 'declared_apps',
      ai_listening: 'declared_apps',
      ai_location_sharing: 'never',
      ai_change_settings: 'never',
      ai_schedule_events: 'confirm',
      ai_remember_conversations: 'never',
      ai_share_between_apps: 'never',
    },
  },

  // ── Healthcare Worker ─────────────────────────────────────────────────
  {
    id: 'healthcare',
    name: 'Healthcare',
    tagline: 'Patient data protection built in.',
    description: 'For doctors, nurses, and clinical staff. Maximum data protection — nothing is retained, nothing leaves the approved network. Camera requires per-use approval (patient images are PHI). AI can transcribe through declared medical apps but cannot send messages or take any autonomous action.',
    icon: 'hospital',
    answers: {
      ai_send_messages: 'never',
      ai_social_media: 'never',
      ai_voice_identity: 'never',
      ai_purchases: 'never',
      ai_subscriptions: 'never',
      ai_camera_sharing: 'ask_each_time',
      ai_listening: 'declared_apps',
      ai_location_sharing: 'never',
      ai_change_settings: 'never',
      ai_schedule_events: 'never',
      ai_remember_conversations: 'never',
      ai_share_between_apps: 'never',
    },
  },

  // ── Retail Staff ──────────────────────────────────────────────────────
  {
    id: 'retail_staff',
    name: 'Retail Staff',
    tagline: 'AI helps with inventory and customers, nothing more.',
    description: 'For retail floor staff. Camera can scan products through declared apps. AI can look up inventory and suggest assistance. But no customer profiling, no purchase authority, no data export, and nothing is remembered after the shift.',
    icon: 'cart',
    answers: {
      ai_send_messages: 'never',
      ai_social_media: 'never',
      ai_voice_identity: 'never',
      ai_purchases: 'never',
      ai_subscriptions: 'never',
      ai_camera_sharing: 'declared_apps',
      ai_listening: 'declared_apps',
      ai_location_sharing: 'never',
      ai_change_settings: 'never',
      ai_schedule_events: 'never',
      ai_remember_conversations: 'never',
      ai_share_between_apps: 'never',
    },
  },

  // ── Personal Use ──────────────────────────────────────────────────────
  {
    id: 'personal',
    name: 'Personal',
    tagline: 'Your glasses, your rules, balanced.',
    description: 'The balanced starting point for personal use. Declared apps can use camera and mic. Messages need approval. No purchases. Location only while actively using an app. AI remembers only what you tell it to. Reasonable defaults you can adjust.',
    icon: 'user',
    answers: {
      ai_send_messages: 'ask_each_time',
      ai_social_media: 'never',
      ai_voice_identity: 'never',
      ai_purchases: 'never',
      ai_subscriptions: 'never',
      ai_camera_sharing: 'declared_apps',
      ai_listening: 'declared_apps',
      ai_location_sharing: 'while_using',
      ai_change_settings: 'confirm',
      ai_schedule_events: 'confirm',
      ai_remember_conversations: 'ask_each_time',
      ai_share_between_apps: 'never',
    },
  },
];

// ─── Functions ──────────────────────────────────────────────────────────────

/** Get all available presets */
export function getPresets(): GovernancePreset[] {
  return GOVERNANCE_PRESETS;
}

/** Get a specific preset by ID */
export function getPreset(id: string): GovernancePreset | undefined {
  return GOVERNANCE_PRESETS.find(p => p.id === id);
}

/**
 * Apply a preset to a GovernanceBuilder.
 * Overwrites all current answers with the preset's answers.
 */
export function applyPreset(builder: GovernanceBuilder, presetId: string): void {
  const preset = getPreset(presetId);
  if (!preset) {
    throw new Error(`Unknown preset: ${presetId}`);
  }

  builder.reset();
  for (const [questionId, value] of Object.entries(preset.answers)) {
    builder.answer(questionId, value);
  }
}

/**
 * Get a human-readable comparison between two presets.
 * Shows where they differ.
 */
export function comparePresets(aId: string, bId: string): Array<{
  question: string;
  presetA: string;
  presetB: string;
}> {
  const a = getPreset(aId);
  const b = getPreset(bId);
  if (!a || !b) return [];

  const diffs: Array<{ question: string; presetA: string; presetB: string }> = [];

  for (const key of Object.keys(a.answers)) {
    if (a.answers[key] !== b.answers[key]) {
      diffs.push({
        question: key,
        presetA: a.answers[key],
        presetB: b.answers[key],
      });
    }
  }

  return diffs;
}
