#!/usr/bin/env npx tsx
/**
 * Organization Governance Demo — Store Owner with 100 Glasses
 *
 * You own a retail store. You bought 100 MentraOS glasses.
 * 80 are for floor staff. 15 are for managers. 5 are for you.
 *
 * You want:
 *   - Floor staff: scan products, look up inventory, help customers.
 *     No purchases, no data export, no customer profiling, nothing remembered.
 *   - Managers: everything floor staff can do, plus approve restocks,
 *     export reports (with confirmation), and adjust prices (with confirmation).
 *   - Owner: everything managers can do, plus view analytics and change org rules.
 *
 * This demo shows:
 *   1. Start from a preset (Retail Staff)
 *   2. Create roles with inheritance
 *   3. See how rules compose across the hierarchy
 *   4. Test enforcement for each role
 *
 * Run:
 *   npx tsx examples/governance-builder/org-demo.ts
 */

import { GovernanceBuilder, applyPreset } from '../../src/builder';
import { OrgGovernanceBuilder } from '../../src/builder/org-builder';
import { MentraGovernedExecutor } from '../../src/adapters/mentraos';
import type { AppContext } from '../../src/adapters/mentraos';
import { parseWorldMarkdown } from '../../src/engine/bootstrap-parser';
import { emitWorldDefinition } from '../../src/engine/bootstrap-emitter';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Helpers ────────────────────────────────────────────────────────────────

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const RESET = '\x1b[0m';

function header(text: string) {
  console.log(`\n${BOLD}${CYAN}${'='.repeat(63)}${RESET}`);
  console.log(`${BOLD}${CYAN}  ${text}${RESET}`);
  console.log(`${BOLD}${CYAN}${'='.repeat(63)}${RESET}\n`);
}

function step(num: number, text: string) {
  console.log(`\n${BOLD}${BLUE}-- Step ${num}: ${text} --${RESET}\n`);
}

function role(name: string) {
  console.log(`\n  ${BOLD}${MAGENTA}[ ${name} ]${RESET}`);
}

function test(roleName: string, app: string, intent: string) {
  console.log(`  ${BOLD}${MAGENTA}[${roleName}]${RESET} ${app} -> ${intent}`);
}

function result(allowed: boolean, needsConfirm: boolean, reason: string) {
  if (allowed) {
    console.log(`    ${GREEN}ALLOWED${RESET} ${DIM}${reason}${RESET}`);
  } else if (needsConfirm) {
    console.log(`    ${YELLOW}NEEDS YOUR OK${RESET} ${reason}`);
  } else {
    console.log(`    ${RED}BLOCKED${RESET} ${reason}`);
  }
}

function info(text: string) {
  console.log(`  ${DIM}${text}${RESET}`);
}

// ─── Load Platform World ────────────────────────────────────────────────────

const worldPath = resolve(__dirname, '../../src/worlds/mentraos-smartglasses.nv-world.md');
const worldMd = readFileSync(worldPath, 'utf-8');
const parseResult = parseWorldMarkdown(worldMd);

if (!parseResult.world || parseResult.issues.some(i => i.severity === 'error')) {
  console.error('World parse errors:', parseResult.issues.filter(i => i.severity === 'error'));
  process.exit(1);
}

const emitted = emitWorldDefinition(parseResult.world);
const world = emitted.world;

// ═══════════════════════════════════════════════════════════════════════════
// Demo Start
// ═══════════════════════════════════════════════════════════════════════════

header('Store Owner AI Governance — 100 Glasses, 3 Roles');
console.log(`  ${DIM}You own a retail store. You define the AI rules.${RESET}`);
console.log(`  ${DIM}Floor staff, managers, and you — different permissions, one system.${RESET}`);

// ── Step 1: Create the org ──────────────────────────────────────────────

step(1, 'Create the organization');

const org = new OrgGovernanceBuilder('acme-retail', 'Acme Retail');
info('Organization: Acme Retail');

// Set org-wide baseline from the "Business Owner" preset
applyPreset(org.baseline, 'business_owner');
info('Baseline loaded from "Business Owner" preset');
info('This applies to EVERYONE — floor staff, managers, and owner');

// ── Step 2: Create roles ────────────────────────────────────────────────

step(2, 'Define roles');

// Floor staff — most restricted
org.createRole('floor_staff', 'Floor Staff');
applyPreset(org.role('floor_staff'), 'retail_staff');
info('Floor Staff: retail preset — scan products, help customers, nothing else');

// Managers — inherit from floor staff, expand some permissions
org.createRole('manager', 'Store Manager', 'floor_staff');
applyPreset(org.role('manager'), 'retail_staff');
// Managers can send messages (with approval) and adjust settings (with approval)
org.role('manager').answer('ai_send_messages', 'ask_each_time');
org.role('manager').answer('ai_change_settings', 'confirm');
org.role('manager').answer('ai_schedule_events', 'confirm');
info('Store Manager: inherits floor staff rules + can send messages and change settings (with approval)');

// Owner — maximum org-level access
org.createRole('owner', 'Store Owner', 'manager');
applyPreset(org.role('owner'), 'business_owner');
org.role('owner').answer('ai_send_messages', 'ask_each_time');
org.role('owner').answer('ai_change_settings', 'confirm');
org.role('owner').answer('ai_schedule_events', 'confirm');
org.role('owner').answer('ai_remember_conversations', 'opted_in_apps');
info('Store Owner: inherits manager rules + can retain data for opted-in apps');

// Show the org structure
console.log(org.previewAll());

// ── Step 3: Show the rules for each role ────────────────────────────────

step(3, 'Compiled rules per role');

const staffRules = org.rulesForRole('floor_staff');
const managerRules = org.rulesForRole('manager');
const ownerRules = org.rulesForRole('owner');

role('Floor Staff');
info(`  Data policy: ${staffRules.aiDataPolicy}`);
info(`  Action policy: ${staffRules.aiActionPolicy}`);
info(`  Purchases: ${staffRules.aiPurchasePolicy}`);
info(`  Messaging: ${staffRules.aiMessagingPolicy}`);
info(`  Retention: ${staffRules.dataRetentionPolicy}`);

role('Store Manager');
info(`  Data policy: ${managerRules.aiDataPolicy}`);
info(`  Action policy: ${managerRules.aiActionPolicy}`);
info(`  Purchases: ${managerRules.aiPurchasePolicy}`);
info(`  Messaging: ${managerRules.aiMessagingPolicy}`);
info(`  Retention: ${managerRules.dataRetentionPolicy}`);

role('Store Owner');
info(`  Data policy: ${ownerRules.aiDataPolicy}`);
info(`  Action policy: ${ownerRules.aiActionPolicy}`);
info(`  Purchases: ${ownerRules.aiPurchasePolicy}`);
info(`  Messaging: ${ownerRules.aiMessagingPolicy}`);
info(`  Retention: ${ownerRules.dataRetentionPolicy}`);

// ── Step 4: Enforcement tests ───────────────────────────────────────────

step(4, 'Test enforcement across roles');

const inventoryApp: AppContext = {
  appId: 'inventory-pro',
  aiProviderDeclared: true,
  declaredAIProviders: ['openai'],
  dataRetentionOptedIn: false,
  aiDataTypesSent: 1,
  glassesModel: 'even_realities_g1',
};

const analyticsApp: AppContext = {
  appId: 'store-analytics',
  aiProviderDeclared: true,
  declaredAIProviders: ['anthropic'],
  dataRetentionOptedIn: true,
  aiDataTypesSent: 2,
  glassesModel: 'even_realities_g1',
};

// Test each role
for (const [roleName, rules] of [
  ['Floor Staff', staffRules],
  ['Store Manager', managerRules],
  ['Store Owner', ownerRules],
] as const) {
  role(roleName);
  const executor = new MentraGovernedExecutor(world, {}, rules);

  // Product scan (send image to AI)
  test(roleName, 'inventory-pro', 'ai_send_image');
  let r = executor.evaluate('ai_send_image', inventoryApp);
  result(r.allowed, r.requiresConfirmation, r.verdict.reason ?? '');

  // Send message
  test(roleName, 'inventory-pro', 'ai_auto_respond_message');
  r = executor.evaluate('ai_auto_respond_message', inventoryApp);
  result(r.allowed, r.requiresConfirmation, r.verdict.reason ?? '');

  // Purchase
  test(roleName, 'inventory-pro', 'ai_auto_purchase');
  r = executor.evaluate('ai_auto_purchase', inventoryApp);
  result(r.allowed, r.requiresConfirmation, r.verdict.reason ?? '');

  // Change settings
  test(roleName, 'inventory-pro', 'ai_auto_setting_change');
  r = executor.evaluate('ai_auto_setting_change', inventoryApp);
  result(r.allowed, r.requiresConfirmation, r.verdict.reason ?? '');

  // Retain data
  test(roleName, 'store-analytics', 'ai_retain_session_data');
  r = executor.evaluate('ai_retain_session_data', analyticsApp);
  result(r.allowed, r.requiresConfirmation, r.verdict.reason ?? '');

  console.log();
}

// ── Step 5: Show world file for one role ────────────────────────────────

step(5, 'Generated world file for Floor Staff');

const staffWorld = org.worldFileForRole('floor_staff');
const lines = staffWorld.split('\n').slice(0, 20);
for (const line of lines) {
  console.log(`  ${DIM}${line}${RESET}`);
}
info(`... (${staffWorld.split('\n').length} total lines)`);

// ── Summary ─────────────────────────────────────────────────────────────

header('What just happened');
console.log(`  ${BOLD}1.${RESET} Store owner created org with "Business Owner" baseline`);
console.log(`  ${BOLD}2.${RESET} Three roles: Floor Staff, Manager, Owner`);
console.log(`  ${BOLD}3.${RESET} Roles inherit — manager builds on staff, owner builds on manager`);
console.log(`  ${BOLD}4.${RESET} Baseline is the floor — nobody can go below it`);
console.log();
console.log(`  ${BOLD}Results across roles:${RESET}`);
console.log(`    Product scan (AI image): all roles ${GREEN}allowed${RESET} (declared app)`);
console.log(`    Send message:  staff ${RED}blocked${RESET}, manager ${YELLOW}confirm${RESET}, owner ${YELLOW}confirm${RESET}`);
console.log(`    Purchase:      ALL roles ${RED}blocked${RESET} (baseline forbids it)`);
console.log(`    Change setting: staff ${RED}blocked${RESET}, manager ${YELLOW}confirm${RESET}, owner ${YELLOW}confirm${RESET}`);
console.log(`    Data retention: staff ${RED}blocked${RESET}, manager ${RED}blocked${RESET}, owner ${GREEN}allowed${RESET} (opted in)`);
console.log();
console.log(`  ${DIM}Same questions. Different answers per role. Rules compose automatically.${RESET}`);
console.log(`  ${DIM}The owner defines it once. 100 glasses follow the rules.${RESET}`);
console.log();
console.log(`  ${BOLD}${CYAN}Where this lives:${RESET}`);
console.log(`  ${CYAN}Today: in the governance engine, enforced per-device.${RESET}`);
console.log(`  ${CYAN}Tomorrow: in MentraOS console.mentra.glass, managed by IT.${RESET}`);
console.log(`  ${CYAN}The rules travel with the glasses, not the building.${RESET}`);
console.log();
