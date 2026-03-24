/**
 * Example Zones — Real-world spatial governance scenarios
 *
 * These demonstrate what zone governance looks like in practice.
 * Each zone is a real-world location type with rules that make sense
 * for that context.
 *
 * When Mentra + Auki go spatial, these become discoverable.
 * Your glasses walk into a space, detect the Auki anchor or BLE beacon,
 * and present the zone's rules for opt-in.
 */

import type { Zone } from '../types';
import { ZONE_TEMPLATES } from '../engine';

// ─── Coffee Shop ─────────────────────────────────────────────────────────────

export const BLUE_BOTTLE_HAYES: Zone = {
  zoneId: 'zone-bluebottle-hayes-001',
  name: 'Blue Bottle Coffee — Hayes Valley',
  publisher: {
    name: 'Blue Bottle Coffee',
    type: 'business',
    verified: true,
  },
  rules: {
    ...ZONE_TEMPLATES.cafe,
    // Blue Bottle addition: no AI product recommendations (respect the craft)
    custom: [{
      id: 'no-product-recs',
      description: 'No AI-generated product recommendations in our space',
      targetIntent: 'ai_recommend_product',
      effect: 'block',
      rationale: 'We curate our own experience. Ask our baristas, not your AI.',
    }],
  },
  discovery: { method: 'auki_anchor', anchorId: 'auki-bb-hayes-001', confidence: 0.95 },
  type: 'hospitality',
  requiresOptIn: false,
  rationale: 'A coffee shop where people work, talk, and think. We protect the vibe and the people in it.',
  rulesUpdatedAt: Date.now(),
  version: '1.0.0',
};

// ─── Hospital ────────────────────────────────────────────────────────────────

export const UCSF_MEDICAL: Zone = {
  zoneId: 'zone-ucsf-medical-001',
  name: 'UCSF Medical Center — Main Campus',
  publisher: {
    name: 'UCSF Health',
    type: 'institution',
    verified: true,
  },
  rules: {
    ...ZONE_TEMPLATES.healthcare,
    custom: [
      {
        id: 'phi-in-network',
        description: 'No patient health information may be sent to AI providers outside the UCSF network',
        targetIntent: 'ai_send_transcription',
        effect: 'block',
        rationale: 'HIPAA compliance. PHI stays in-network.',
      },
      {
        id: 'no-clinical-ai-action',
        description: 'AI cannot take autonomous clinical actions',
        targetIntent: 'ai_auto_action',
        effect: 'block',
        rationale: 'Clinical decisions require licensed physician confirmation.',
      },
    ],
  },
  discovery: { method: 'ble_beacon', beaconId: 'ucsf-main-lobby-001', rssi: -65 },
  type: 'healthcare',
  requiresOptIn: true,
  rationale: 'A hospital where patients, families, and staff deserve absolute privacy. Recording is prohibited. AI actions require clinical oversight. Patient data never leaves our network.',
  rulesUpdatedAt: Date.now(),
  version: '2.0.0',
};

// ─── Retail ──────────────────────────────────────────────────────────────────

export const APPLE_UNION_SQUARE: Zone = {
  zoneId: 'zone-apple-unisonq-001',
  name: 'Apple Union Square',
  publisher: {
    name: 'Apple Inc.',
    type: 'business',
    verified: true,
  },
  rules: {
    ...ZONE_TEMPLATES.retail,
    camera: 'blocked', // No photos of displays / unreleased products
    custom: [
      {
        id: 'no-price-comparison',
        description: 'No AI-powered real-time price comparison while in store',
        targetIntent: 'ai_compare_prices',
        effect: 'block',
        rationale: 'Respect our retail experience. Compare prices on your own time.',
      },
      {
        id: 'no-product-scanning',
        description: 'No AI scanning of unreleased or display products',
        targetIntent: 'ai_send_image',
        effect: 'block',
        rationale: 'Display products may include unreleased items under NDA.',
      },
    ],
  },
  discovery: { method: 'ble_beacon', beaconId: 'apple-usq-main-001', rssi: -60 },
  type: 'retail',
  requiresOptIn: false,
  rationale: 'A retail experience designed to be explored in person. No AI product scanning, no real-time price comparison, no unauthorized recording of displays.',
  rulesUpdatedAt: Date.now(),
  version: '1.0.0',
};

// ─── Concert Venue ───────────────────────────────────────────────────────────

export const CHASE_CENTER: Zone = {
  zoneId: 'zone-chase-center-001',
  name: 'Chase Center',
  publisher: {
    name: 'Chase Center / GSW',
    type: 'business',
    verified: true,
  },
  rules: {
    ...ZONE_TEMPLATES.entertainment,
    custom: [{
      id: 'no-event-recording',
      description: 'No audio or video recording of live performances',
      targetIntent: 'stream_start',
      effect: 'block',
      rationale: 'Live performance rights. Recording violates artist/league agreements.',
    }],
  },
  discovery: { method: 'geofence', lat: 37.768, lng: -122.3877, radiusMeters: 200 },
  type: 'entertainment',
  requiresOptIn: true,
  rationale: 'A live event venue. No recording of performances. No streaming. AR overlays must not obstruct the live experience. Strict bystander protection for 18,000+ attendees.',
  rulesUpdatedAt: Date.now(),
  version: '1.0.0',
};

// ─── Coworking Space ─────────────────────────────────────────────────────────

export const WEWORK_SOMA: Zone = {
  zoneId: 'zone-wework-soma-001',
  name: 'WeWork — SoMa',
  publisher: {
    name: 'WeWork',
    type: 'business',
    verified: true,
  },
  rules: {
    ...ZONE_TEMPLATES.workplace,
    aiDataSend: 'allowed', // Productivity AI is the whole point
    aiOverlay: 'allowed',  // AR workspace tools welcome
    custom: [{
      id: 'no-competitor-intel',
      description: 'No AI analysis of other tenants\' visible screens or conversations',
      targetIntent: 'ai_send_image',
      effect: 'confirm',
      rationale: 'Shared workspace. Respect other tenants\' IP and privacy.',
    }],
  },
  discovery: { method: 'auki_anchor', anchorId: 'auki-wework-soma-floor3', confidence: 0.92 },
  type: 'workplace',
  requiresOptIn: false,
  rationale: 'A shared workspace where productivity AI is welcome but recording is restricted. Other tenants\' work is their own — no AI should analyze it.',
  rulesUpdatedAt: Date.now(),
  version: '1.0.0',
};

// ─── Museum ──────────────────────────────────────────────────────────────────

export const SFMOMA: Zone = {
  zoneId: 'zone-sfmoma-001',
  name: 'SFMOMA',
  publisher: {
    name: 'San Francisco Museum of Modern Art',
    type: 'institution',
    verified: true,
  },
  rules: {
    ...ZONE_TEMPLATES.education,
    aiRecommendations: 'allowed',  // "Tell me about this painting" is great
    aiDataSend: 'declared_only',   // AI art analysis is part of the experience
    custom: [{
      id: 'no-flash-no-stream',
      description: 'No flash photography or live streaming of exhibitions',
      targetIntent: 'stream_start',
      effect: 'block',
      rationale: 'Protect the art and the experience of other visitors.',
    }],
  },
  discovery: { method: 'nfc_tap', tagId: 'sfmoma-entrance-nfc-001' },
  type: 'education',
  requiresOptIn: false,
  rationale: 'A museum where AI can enhance the art experience (tell me about this piece) but recording and streaming are prohibited. No commercial AI recommendations.',
  rulesUpdatedAt: Date.now(),
  version: '1.0.0',
};

// ─── Home ────────────────────────────────────────────────────────────────────

export const MY_HOME: Zone = {
  zoneId: 'zone-home-user-001',
  name: 'Home',
  publisher: {
    name: 'You',
    type: 'individual',
    verified: false,
  },
  rules: {
    ...ZONE_TEMPLATES.home,
    // Home is your space — fully permissive by default
    // You can tighten it if you want (e.g., "no AI recording when guests are over")
  },
  discovery: { method: 'geofence', lat: 37.7749, lng: -122.4194, radiusMeters: 50 },
  type: 'residential',
  requiresOptIn: false,
  rationale: 'Your home. Your rules. Everything is allowed by default. Tighten as needed.',
  rulesUpdatedAt: Date.now(),
  version: '1.0.0',
};

// ─── All Example Zones ───────────────────────────────────────────────────────

export const EXAMPLE_ZONES: Zone[] = [
  BLUE_BOTTLE_HAYES,
  UCSF_MEDICAL,
  APPLE_UNION_SQUARE,
  CHASE_CENTER,
  WEWORK_SOMA,
  SFMOMA,
  MY_HOME,
];
