/**
 * Role-Based Governance Builder — Organizations, Not Just Individuals
 *
 * A store owner buys 100 glasses. Managers get different AI permissions
 * than floor staff. The owner defines roles once. Rules flow to every
 * device assigned to that role.
 *
 * This module extends the personal GovernanceBuilder with:
 *   - Roles (manager, employee, contractor, etc.)
 *   - Per-role rule overrides
 *   - Organization-wide baselines
 *   - Role hierarchy (manager inherits from employee, can only expand)
 *
 * Usage:
 *   const org = new OrgGovernanceBuilder('acme-co');
 *
 *   // Set baseline for everyone
 *   org.baseline.answer('ai_purchases', 'never');
 *
 *   // Create roles
 *   org.createRole('floor_staff', 'Floor Staff');
 *   org.createRole('manager', 'Store Manager', 'floor_staff');
 *
 *   // Override per role
 *   org.role('manager').answer('ai_purchases', 'confirm_each');
 *
 *   // Get rules for a specific role
 *   const staffRules = org.rulesForRole('floor_staff');
 *   const managerRules = org.rulesForRole('manager');
 */

import { GovernanceBuilder } from './index';
import type { CompiledRuleSet } from './compiler';
import { compileAnswers, toUserRules, toWorldFile } from './compiler';
import type { UserRules } from '../adapters/mentraos';
import { GOVERNANCE_QUESTIONS, getDefaultAnswers } from './questions';
import type { GovernanceQuestion } from './questions';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OrgRole {
  /** Role identifier (e.g., 'floor_staff', 'manager') */
  id: string;

  /** Human-readable name */
  name: string;

  /** Parent role ID — this role inherits from parent and can only expand */
  parentId?: string;

  /** Role-specific governance builder */
  builder: GovernanceBuilder;

  /** Additional org-specific restrictions */
  restrictions: OrgRestriction[];
}

export interface OrgRestriction {
  /** Restriction identifier */
  id: string;

  /** Plain English description */
  description: string;

  /** What this restricts */
  scope: string;

  /** Whether it's active */
  enabled: boolean;
}

/** Pre-built restriction templates for common org needs */
export interface OrgRestrictionTemplate {
  id: string;
  description: string;
  scope: string;
  prompt: string;
}

// ─── Org-Specific Questions ─────────────────────────────────────────────────

/**
 * Additional questions that only apply to organizations,
 * not individual users. These sit on top of the 12 personal questions.
 */
export const ORG_QUESTIONS: GovernanceQuestion[] = [
  {
    id: 'org_data_export',
    category: 'privacy',
    order: 13,
    prompt: 'Can employees export company data through AI?',
    clarification: 'This means AI copying, summarizing, or transmitting internal company information to external services, personal devices, or third parties.',
    defaultIndex: 0,
    options: [
      {
        value: 'never',
        label: 'Never — company data stays internal',
        explanation: 'AI cannot send any company data to external services or personal accounts',
        rules: [{
          ruleId: 'org_no_data_export',
          description: 'AI cannot export company data to external services',
          constraint: 'block',
          scope: 'ai_share_with_third_party',
          data: { orgDataExportPolicy: 'block_all' },
        }],
      },
      {
        value: 'manager_only',
        label: 'Only managers can export data',
        explanation: 'Floor staff cannot export; managers can with confirmation',
        rules: [{
          ruleId: 'org_data_export_role_gated',
          description: 'Only managers can export company data, with confirmation',
          constraint: 'confirm',
          scope: 'ai_share_with_third_party',
          data: { orgDataExportPolicy: 'role_gated', allowedRoles: ['manager'] },
        }],
      },
    ],
  },
  {
    id: 'org_ai_inventory_actions',
    category: 'autonomy',
    order: 14,
    prompt: 'Can AI automatically adjust inventory or place restock orders?',
    clarification: 'AI might suggest reordering products or adjusting counts based on what it sees. This controls whether it can act on those suggestions.',
    defaultIndex: 1,
    options: [
      {
        value: 'never',
        label: 'Never — all inventory changes are manual',
        explanation: 'AI can suggest but cannot modify inventory or trigger orders',
        rules: [{
          ruleId: 'org_no_auto_inventory',
          description: 'AI cannot modify inventory or place orders',
          constraint: 'block',
          scope: 'ai_auto_setting_change',
          data: { orgInventoryPolicy: 'block_all' },
        }],
      },
      {
        value: 'suggest_only',
        label: 'AI suggests, humans approve',
        explanation: 'AI flags low stock and suggests reorders — a person must approve',
        rules: [{
          ruleId: 'org_inventory_suggest',
          description: 'AI suggests inventory changes but cannot execute them',
          constraint: 'confirm',
          scope: 'ai_auto_setting_change',
          data: { orgInventoryPolicy: 'suggest_only' },
        }],
      },
      {
        value: 'auto_restock',
        label: 'Auto-restock below threshold, flag everything else',
        explanation: 'Routine restocks happen automatically; unusual changes need approval',
        rules: [{
          ruleId: 'org_inventory_auto_restock',
          description: 'Routine restocks are automatic; unusual changes need manager approval',
          constraint: 'limit',
          scope: 'ai_auto_setting_change',
          data: { orgInventoryPolicy: 'auto_routine_confirm_unusual' },
        }],
      },
    ],
  },
  {
    id: 'org_pricing_changes',
    category: 'autonomy',
    order: 15,
    prompt: 'Can AI change product prices?',
    clarification: 'AI might suggest price adjustments based on demand, competition, or inventory. This controls whether it can actually change prices.',
    defaultIndex: 0,
    options: [
      {
        value: 'never',
        label: 'Never — pricing is human-only',
        explanation: 'AI cannot modify any price in any system',
        rules: [{
          ruleId: 'org_no_price_changes',
          description: 'AI cannot change product prices',
          constraint: 'block',
          scope: 'ai_auto_setting_change',
          data: { orgPricingPolicy: 'block_all' },
        }],
      },
      {
        value: 'suggest_only',
        label: 'AI suggests, manager approves',
        explanation: 'AI can recommend price changes but a manager must confirm each one',
        rules: [{
          ruleId: 'org_price_suggest',
          description: 'AI recommends prices but managers must approve changes',
          constraint: 'confirm',
          scope: 'ai_auto_setting_change',
          data: { orgPricingPolicy: 'suggest_only' },
        }],
      },
    ],
  },
  {
    id: 'org_employee_monitoring',
    category: 'privacy',
    order: 16,
    prompt: 'Can AI track employee performance through the glasses?',
    clarification: 'This means AI analyzing how fast employees work, how they interact with customers, or how they move through the store.',
    defaultIndex: 0,
    options: [
      {
        value: 'never',
        label: 'Never — glasses are tools, not surveillance',
        explanation: 'AI cannot generate employee performance scores or behavioral assessments from glasses data',
        rules: [{
          ruleId: 'org_no_employee_surveillance',
          description: 'AI cannot track or score employee performance through glasses',
          constraint: 'block',
          scope: 'ai_retain_session_data',
          data: { orgEmployeeMonitoring: 'block_all' },
        }],
      },
      {
        value: 'aggregate_only',
        label: 'Aggregate team stats only — no individual tracking',
        explanation: 'AI can report team-level metrics (store throughput, average task time) but never individual employee data',
        rules: [{
          ruleId: 'org_aggregate_monitoring',
          description: 'Only aggregate team metrics — no individual employee tracking',
          constraint: 'limit',
          scope: 'ai_retain_session_data',
          data: { orgEmployeeMonitoring: 'aggregate_only' },
        }],
      },
    ],
  },
  {
    id: 'org_customer_data',
    category: 'privacy',
    order: 17,
    prompt: 'Can AI collect or remember information about customers?',
    clarification: 'When employees interact with customers through AI glasses, the AI might recognize faces, remember preferences, or build profiles.',
    defaultIndex: 0,
    options: [
      {
        value: 'never',
        label: 'Never — no customer profiling',
        explanation: 'AI cannot identify, profile, or remember individual customers',
        rules: [{
          ruleId: 'org_no_customer_profiling',
          description: 'AI cannot identify or profile customers',
          constraint: 'block',
          scope: 'ai_retain_session_data',
          data: { orgCustomerDataPolicy: 'block_all' },
        }],
      },
      {
        value: 'opted_in_customers',
        label: 'Only for customers who opted in (loyalty program)',
        explanation: 'AI can recognize and serve loyalty program members who consented — everyone else is anonymous',
        rules: [{
          ruleId: 'org_customer_loyalty_only',
          description: 'AI can recognize opted-in loyalty customers only — everyone else is anonymous',
          constraint: 'limit',
          scope: 'ai_retain_session_data',
          data: { orgCustomerDataPolicy: 'opted_in_only' },
        }],
      },
    ],
  },
];

// ─── Org Builder ────────────────────────────────────────────────────────────

export class OrgGovernanceBuilder {
  /** Organization identifier */
  readonly orgId: string;

  /** Organization display name */
  readonly orgName: string;

  /** Baseline rules that apply to ALL roles */
  readonly baseline: GovernanceBuilder;

  /** Org-specific questions (beyond the 12 personal ones) */
  readonly orgQuestions: GovernanceQuestion[] = ORG_QUESTIONS;

  private roles: Map<string, OrgRole> = new Map();

  constructor(orgId: string, orgName: string = orgId) {
    this.orgId = orgId;
    this.orgName = orgName;
    this.baseline = new GovernanceBuilder();
  }

  /**
   * Create a new role.
   * If parentId is specified, this role inherits from the parent
   * and can ONLY expand permissions (never restrict below parent).
   */
  createRole(id: string, name: string, parentId?: string): OrgRole {
    if (this.roles.has(id)) {
      throw new Error(`Role "${id}" already exists`);
    }
    if (parentId && !this.roles.has(parentId)) {
      throw new Error(`Parent role "${parentId}" does not exist. Create it first.`);
    }

    const role: OrgRole = {
      id,
      name,
      parentId,
      builder: new GovernanceBuilder(),
      restrictions: [],
    };

    this.roles.set(id, role);
    return role;
  }

  /** Get a role's builder for setting role-specific answers */
  role(roleId: string): GovernanceBuilder {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role "${roleId}" does not exist`);
    }
    return role.builder;
  }

  /** Get a role definition */
  getRole(roleId: string): OrgRole | undefined {
    return this.roles.get(roleId);
  }

  /** Get all role IDs */
  get roleIds(): string[] {
    return Array.from(this.roles.keys());
  }

  /** Get all roles */
  get allRoles(): OrgRole[] {
    return Array.from(this.roles.values());
  }

  /**
   * Get the effective UserRules for a specific role.
   *
   * Resolution order (most restrictive wins at each level):
   *   1. Org baseline (applies to everyone)
   *   2. Parent role rules (if any)
   *   3. This role's specific rules
   *
   * At each level, the MORE RESTRICTIVE rule wins.
   * A manager can have MORE permissions than an employee,
   * but never FEWER than the baseline.
   */
  rulesForRole(roleId: string): UserRules {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role "${roleId}" does not exist`);
    }

    // Start with baseline
    const baselineRules = this.baseline.userRules();

    // Layer parent rules
    let parentRules: UserRules | null = null;
    if (role.parentId) {
      parentRules = this.rulesForRole(role.parentId);
    }

    // Layer role-specific rules
    const roleRules = role.builder.userRules();

    // Compose: most restrictive at baseline, role can expand from parent
    return composeRoleRules(baselineRules, parentRules, roleRules);
  }

  /**
   * Get compiled rule set for a specific role.
   * Includes both personal questions and org questions.
   */
  compiledRulesForRole(roleId: string): CompiledRuleSet {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role "${roleId}" does not exist`);
    }
    return role.builder.compile();
  }

  /**
   * Generate a world file for a specific role.
   * Includes the role name and org context in the thesis.
   */
  worldFileForRole(roleId: string): string {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role "${roleId}" does not exist`);
    }

    const compiled = role.builder.compile();
    const base = toWorldFile(compiled);

    // Patch the world file with org/role context
    return base
      .replace('world_id: mentraos-user-rules', `world_id: ${this.orgId}-${roleId}`)
      .replace('name: My AI Rules', `name: ${this.orgName} — ${role.name} AI Rules`)
      .replace(
        'These are your personal AI rules.',
        `These are the AI rules for the "${role.name}" role at ${this.orgName}. They were defined by the organization administrator and apply to every device assigned to this role.`,
      );
  }

  /** Add an org-specific restriction to a role */
  addRestriction(roleId: string, restriction: Omit<OrgRestriction, 'enabled'>): void {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role "${roleId}" does not exist`);
    }
    role.restrictions.push({ ...restriction, enabled: true });
  }

  /**
   * Preview all roles and their rules for terminal display.
   */
  previewAll(): string {
    const BOLD = '\x1b[1m';
    const DIM = '\x1b[2m';
    const CYAN = '\x1b[36m';
    const MAGENTA = '\x1b[35m';
    const RESET = '\x1b[0m';

    const lines: string[] = [];
    lines.push('');
    lines.push(`${BOLD}${CYAN}  ${this.orgName} — AI Governance${RESET}`);
    lines.push(`${DIM}  ${this.roles.size} roles defined${RESET}`);
    lines.push('');

    // Baseline
    lines.push(`  ${BOLD}Baseline (applies to everyone)${RESET}`);
    lines.push(this.baseline.summaryLine());
    lines.push('');

    // Each role
    for (const role of this.roles.values()) {
      const parent = role.parentId ? ` (inherits from ${role.parentId})` : '';
      lines.push(`  ${BOLD}${MAGENTA}${role.name}${RESET}${DIM}${parent}${RESET}`);
      lines.push(role.builder.summaryLine());

      if (role.restrictions.length > 0) {
        for (const r of role.restrictions) {
          const status = r.enabled ? '\x1b[31mx\x1b[0m' : '\x1b[2m-\x1b[0m';
          lines.push(`    ${status}  ${r.description}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

// ─── Rule Composition ───────────────────────────────────────────────────────

/** Restriction level ordering for comparison */
const DATA_POLICY_ORDER: Record<string, number> = {
  'block_all': 0,
  'confirm_each': 1,
  'declared_only': 2,
};

const ACTION_POLICY_ORDER: Record<string, number> = {
  'block_all': 0,
  'confirm_all': 1,
  'allow_low_risk': 2,
};

const PURCHASE_POLICY_ORDER: Record<string, number> = {
  'block_all': 0,
  'confirm_each': 1,
};

const MESSAGING_POLICY_ORDER: Record<string, number> = {
  'block_all': 0,
  'confirm_each': 1,
};

const RETENTION_POLICY_ORDER: Record<string, number> = {
  'never': 0,
  'app_declared': 1,
};

function moreRestrictive<T extends string>(
  a: T,
  b: T,
  order: Record<string, number>,
): T {
  return (order[a] ?? 99) <= (order[b] ?? 99) ? a : b;
}

function lessRestrictive<T extends string>(
  a: T,
  b: T,
  order: Record<string, number>,
): T {
  return (order[a] ?? 0) >= (order[b] ?? 0) ? a : b;
}

/**
 * Compose rules across baseline, parent, and role.
 *
 * Baseline is the floor — nobody can go below this.
 * Parent is the next floor — child roles inherit.
 * Role-specific rules can EXPAND from parent (be less restrictive),
 * but can NEVER go below baseline.
 */
function composeRoleRules(
  baseline: UserRules,
  parent: UserRules | null,
  role: UserRules,
): UserRules {
  // Start from role-specific rules
  let effective = { ...role };

  // If there's a parent, role can expand from parent but not restrict below
  if (parent) {
    effective.aiDataPolicy = lessRestrictive(parent.aiDataPolicy, role.aiDataPolicy, DATA_POLICY_ORDER);
    effective.aiActionPolicy = lessRestrictive(parent.aiActionPolicy, role.aiActionPolicy, ACTION_POLICY_ORDER);
    effective.aiPurchasePolicy = lessRestrictive(parent.aiPurchasePolicy, role.aiPurchasePolicy, PURCHASE_POLICY_ORDER);
    effective.aiMessagingPolicy = lessRestrictive(parent.aiMessagingPolicy, role.aiMessagingPolicy, MESSAGING_POLICY_ORDER);
    effective.dataRetentionPolicy = lessRestrictive(parent.dataRetentionPolicy, role.dataRetentionPolicy, RETENTION_POLICY_ORDER);
    effective.maxAIProviders = Math.max(parent.maxAIProviders, role.maxAIProviders);
  }

  // Baseline is the absolute floor — clamp everything
  effective.aiDataPolicy = moreRestrictive(effective.aiDataPolicy, baseline.aiDataPolicy, DATA_POLICY_ORDER) === baseline.aiDataPolicy
    ? effective.aiDataPolicy
    : baseline.aiDataPolicy;

  // Actually: if baseline is MORE restrictive, use baseline. Otherwise keep effective.
  if ((DATA_POLICY_ORDER[baseline.aiDataPolicy] ?? 99) < (DATA_POLICY_ORDER[effective.aiDataPolicy] ?? 99)) {
    effective.aiDataPolicy = baseline.aiDataPolicy;
  }
  if ((ACTION_POLICY_ORDER[baseline.aiActionPolicy] ?? 99) < (ACTION_POLICY_ORDER[effective.aiActionPolicy] ?? 99)) {
    effective.aiActionPolicy = baseline.aiActionPolicy;
  }
  if ((PURCHASE_POLICY_ORDER[baseline.aiPurchasePolicy] ?? 99) < (PURCHASE_POLICY_ORDER[effective.aiPurchasePolicy] ?? 99)) {
    effective.aiPurchasePolicy = baseline.aiPurchasePolicy;
  }
  if ((MESSAGING_POLICY_ORDER[baseline.aiMessagingPolicy] ?? 99) < (MESSAGING_POLICY_ORDER[effective.aiMessagingPolicy] ?? 99)) {
    effective.aiMessagingPolicy = baseline.aiMessagingPolicy;
  }
  if ((RETENTION_POLICY_ORDER[baseline.dataRetentionPolicy] ?? 99) < (RETENTION_POLICY_ORDER[effective.dataRetentionPolicy] ?? 99)) {
    effective.dataRetentionPolicy = baseline.dataRetentionPolicy;
  }
  effective.maxAIProviders = Math.min(effective.maxAIProviders, baseline.maxAIProviders);

  return effective;
}
