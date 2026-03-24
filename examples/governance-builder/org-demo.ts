#!/usr/bin/env npx tsx
/**
 * Organization Governance Demo — Company with 50 Glasses, 3 Roles
 *
 * You run a company. You bought 50 MentraOS glasses.
 * 30 are for employees. 15 are for managers. 5 are for executives.
 *
 * You want:
 *   - Employees: use AI for note-taking and lookups.
 *     No purchases, no data export, nothing remembered.
 *   - Managers: everything employees can do, plus send messages
 *     and adjust settings (with confirmation).
 *   - Executives: everything managers can do, plus view analytics
 *     and retain data for opted-in apps.
 *
 * This demo shows:
 *   1. Start from a preset (Business Owner)
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

header('Company AI Governance — 50 Glasses, 3 Roles');
console.log(`  ${DIM}You run a company. You define the AI rules.${RESET}`);
console.log(`  ${DIM}Employees, managers, and executives — different permissions, one system.${RESET}`);

// ── Step 1: Create the org ──────────────────────────────────────────────

step(1, 'Create the organization');

const org = new OrgGovernanceBuilder('acme-co', 'Acme Co');
info('Organization: Acme Co');

// Set org-wide baseline from the "Business Owner" preset
applyPreset(org.baseline, 'business_owner');
info('Baseline loaded from "Business Owner" preset');
info('This applies to EVERYONE — floor staff, managers, and owner');

// ── Step 2: Create roles ────────────────────────────────────────────────

step(2, 'Define roles');

// Employees — most restricted
org.createRole('employee', 'Employee');
applyPreset(org.role('employee'), 'max_privacy');
info('Employee: max privacy preset — AI assists but nothing leaves without approval');

// Managers — inherit from employee, expand some permissions
org.createRole('manager', 'Manager', 'employee');
applyPreset(org.role('manager'), 'max_privacy');
// Managers can send messages (with approval) and adjust settings (with approval)
org.role('manager').answer('ai_send_messages', 'ask_each_time');
org.role('manager').answer('ai_change_settings', 'confirm');
org.role('manager').answer('ai_schedule_events', 'confirm');
info('Manager: inherits employee rules + can send messages and change settings (with approval)');

// Executive — maximum org-level access
org.createRole('executive', 'Executive', 'manager');
applyPreset(org.role('executive'), 'business_owner');
org.role('executive').answer('ai_send_messages', 'ask_each_time');
org.role('executive').answer('ai_change_settings', 'confirm');
org.role('executive').answer('ai_schedule_events', 'confirm');
org.role('executive').answer('ai_remember_conversations', 'opted_in_apps');
info('Executive: inherits manager rules + can retain data for opted-in apps');

// Show the org structure
console.log(org.previewAll());

// ── Step 3: Show the rules for each role ────────────────────────────────

step(3, 'Compiled rules per role');

const employeeRules = org.rulesForRole('employee');
const managerRules = org.rulesForRole('manager');
const executiveRules = org.rulesForRole('executive');

role('Employee');
info(`  Data policy: ${employeeRules.aiDataPolicy}`);
info(`  Action policy: ${employeeRules.aiActionPolicy}`);
info(`  Purchases: ${employeeRules.aiPurchasePolicy}`);
info(`  Messaging: ${employeeRules.aiMessagingPolicy}`);
info(`  Retention: ${employeeRules.dataRetentionPolicy}`);

role('Manager');
info(`  Data policy: ${managerRules.aiDataPolicy}`);
info(`  Action policy: ${managerRules.aiActionPolicy}`);
info(`  Purchases: ${managerRules.aiPurchasePolicy}`);
info(`  Messaging: ${managerRules.aiMessagingPolicy}`);
info(`  Retention: ${managerRules.dataRetentionPolicy}`);

role('Executive');
info(`  Data policy: ${executiveRules.aiDataPolicy}`);
info(`  Action policy: ${executiveRules.aiActionPolicy}`);
info(`  Purchases: ${executiveRules.aiPurchasePolicy}`);
info(`  Messaging: ${executiveRules.aiMessagingPolicy}`);
info(`  Retention: ${executiveRules.dataRetentionPolicy}`);

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
  ['Employee', employeeRules],
  ['Manager', managerRules],
  ['Executive', executiveRules],
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

step(5, 'Generated world file for Employee');

const staffWorld = org.worldFileForRole('employee');
const lines = staffWorld.split('\n').slice(0, 20);
for (const line of lines) {
  console.log(`  ${DIM}${line}${RESET}`);
}
info(`... (${staffWorld.split('\n').length} total lines)`);

// ── Summary ─────────────────────────────────────────────────────────────

header('What just happened');
console.log(`  ${BOLD}1.${RESET} Company created org with "Business Owner" baseline`);
console.log(`  ${BOLD}2.${RESET} Three roles: Employee, Manager, Executive`);
console.log(`  ${BOLD}3.${RESET} Roles inherit — manager builds on employee, executive builds on manager`);
console.log(`  ${BOLD}4.${RESET} Baseline is the floor — nobody can go below it`);
console.log();
console.log(`  ${BOLD}Results across roles:${RESET}`);
console.log(`    AI image send:  all roles ${GREEN}allowed${RESET} (declared app)`);
console.log(`    Send message:   employee ${RED}blocked${RESET}, manager ${YELLOW}confirm${RESET}, executive ${YELLOW}confirm${RESET}`);
console.log(`    Purchase:       ALL roles ${RED}blocked${RESET} (baseline forbids it)`);
console.log(`    Change setting: employee ${RED}blocked${RESET}, manager ${YELLOW}confirm${RESET}, executive ${YELLOW}confirm${RESET}`);
console.log(`    Data retention: employee ${RED}blocked${RESET}, manager ${RED}blocked${RESET}, executive ${GREEN}allowed${RESET} (opted in)`);
console.log();
console.log(`  ${DIM}Same questions. Different answers per role. Rules compose automatically.${RESET}`);
console.log(`  ${DIM}Define it once. 50 glasses follow the rules.${RESET}`);
console.log();
console.log(`  ${BOLD}${CYAN}Where this lives:${RESET}`);
console.log(`  ${CYAN}Today: in the governance engine, enforced per-device.${RESET}`);
console.log(`  ${CYAN}Tomorrow: in MentraOS console.mentra.glass, managed by IT.${RESET}`);
console.log(`  ${CYAN}The rules travel with the glasses, not the building.${RESET}`);
console.log();
