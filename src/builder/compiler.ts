/**
 * Rule Compiler — Answers → Rules → World File
 *
 * Takes the user's answers from the question flow and compiles them
 * into three things:
 *
 *   1. CompiledRuleSet — structured rules for the adapter to enforce
 *   2. UserRules — the adapter-compatible rules object
 *   3. World file content — a user-rules.nv-world.md string
 *
 * The compiler never invents rules. It only maps answers to the
 * RuleMappings defined in the question set. What the user answers
 * is exactly what gets enforced. No hidden behavior.
 */

import type { GovernanceQuestion, AnswerOption, RuleMapping } from './questions';
import { GOVERNANCE_QUESTIONS } from './questions';
import type { UserRules } from '../adapters/mentraos';

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single compiled rule, ready for display and enforcement */
export interface CompiledRule {
  /** Rule identifier */
  id: string;

  /** Plain English description (shown to the user) */
  description: string;

  /** What this rule does: block, confirm, allow, or limit */
  constraint: 'block' | 'confirm' | 'allow' | 'limit';

  /** Which AI capability this governs */
  scope: string;

  /** The raw data for the adapter */
  data: Record<string, unknown>;

  /** Which question produced this rule */
  sourceQuestion: string;

  /** Which answer the user chose */
  sourceAnswer: string;

  /** Whether the user has toggled this rule on (default: true) */
  enabled: boolean;

  /** Category for grouping */
  category: GovernanceQuestion['category'];
}

/** The complete set of compiled rules */
export interface CompiledRuleSet {
  /** All compiled rules */
  rules: CompiledRule[];

  /** When this rule set was compiled */
  compiledAt: number;

  /** Answers that produced this rule set */
  answers: Map<string, string>;
}

/** User's answers to the question flow */
export type UserAnswers = Map<string, string>;

// ─── Compiler ───────────────────────────────────────────────────────────────

/**
 * Compile user answers into a structured rule set.
 *
 * For each question, looks up the selected answer option and extracts
 * its rule mappings. Missing answers use the question's default.
 */
export function compileAnswers(answers: UserAnswers): CompiledRuleSet {
  const rules: CompiledRule[] = [];

  for (const question of GOVERNANCE_QUESTIONS) {
    const selectedValue = answers.get(question.id);
    const option = selectedValue
      ? question.options.find(o => o.value === selectedValue)
      : question.options[question.defaultIndex];

    if (!option) continue;

    for (const mapping of option.rules) {
      rules.push({
        id: mapping.ruleId,
        description: mapping.description,
        constraint: mapping.constraint,
        scope: mapping.scope,
        data: mapping.data,
        sourceQuestion: question.id,
        sourceAnswer: option.value,
        enabled: true,
        category: question.category,
      });
    }
  }

  return {
    rules,
    compiledAt: Date.now(),
    answers,
  };
}

/**
 * Convert a compiled rule set into the adapter's UserRules format.
 *
 * This bridges the gap between the human-facing rule set and the
 * machine-facing adapter. The adapter doesn't know about questions —
 * it just enforces UserRules.
 */
export function toUserRules(ruleSet: CompiledRuleSet): UserRules {
  const rules: UserRules = {
    aiDataPolicy: 'declared_only',
    aiActionPolicy: 'confirm_all',
    aiPurchasePolicy: 'confirm_each',
    aiMessagingPolicy: 'confirm_each',
    dataRetentionPolicy: 'app_declared',
    maxAIProviders: 5,
  };

  for (const rule of ruleSet.rules) {
    if (!rule.enabled) continue;

    // Map compiled rules to adapter UserRules fields
    switch (rule.scope) {
      case 'ai_auto_respond_message':
        if (rule.data.aiMessagingPolicy === 'block_all') {
          rules.aiMessagingPolicy = 'block_all';
        } else if (rule.data.aiMessagingPolicy === 'confirm_each') {
          rules.aiMessagingPolicy = 'confirm_each';
        }
        break;

      case 'ai_auto_purchase':
      case 'ai_subscription':
        if (rule.data.aiPurchasePolicy === 'block_all' || rule.data.aiSubscriptionPolicy === 'block_all') {
          rules.aiPurchasePolicy = 'block_all';
        } else if (rule.data.aiPurchasePolicy === 'confirm_each' || rule.data.aiSubscriptionPolicy === 'confirm_each') {
          rules.aiPurchasePolicy = 'confirm_each';
        }
        break;

      case 'ai_send_image':
        if (rule.data.aiCameraPolicy === 'block_all') {
          rules.aiDataPolicy = 'block_all';
        } else if (rule.data.aiCameraPolicy === 'confirm_each') {
          rules.aiDataPolicy = 'confirm_each';
        }
        break;

      case 'ai_send_transcription':
        if (rule.data.aiAudioPolicy === 'block_all') {
          rules.aiDataPolicy = 'block_all';
        } else if (rule.data.aiAudioPolicy === 'confirm_each') {
          if (rules.aiDataPolicy !== 'block_all') {
            rules.aiDataPolicy = 'confirm_each';
          }
        }
        break;

      case 'ai_auto_setting_change':
      case 'ai_auto_schedule':
        if (rule.data.aiSettingsPolicy === 'block_all' || rule.data.aiCalendarPolicy === 'block_all') {
          rules.aiActionPolicy = 'block_all';
        } else if (rule.data.aiSettingsPolicy === 'confirm_each' || rule.data.aiCalendarPolicy === 'confirm_each') {
          if (rules.aiActionPolicy !== 'block_all') {
            rules.aiActionPolicy = 'confirm_all';
          }
        }
        break;

      case 'ai_retain_session_data':
        if (rule.data.dataRetentionPolicy === 'never') {
          rules.dataRetentionPolicy = 'never';
        } else if (rule.data.dataRetentionPolicy === 'app_declared') {
          rules.dataRetentionPolicy = 'app_declared';
        }
        break;
    }
  }

  return rules;
}

/**
 * Generate a user-rules.nv-world.md from a compiled rule set.
 *
 * This is the ultimate output: a world file that the governance engine
 * can load and enforce. The user never needs to see or edit this file
 * directly — but it's there, auditable, and version-controllable.
 */
export function toWorldFile(ruleSet: CompiledRuleSet): string {
  const enabledRules = ruleSet.rules.filter(r => r.enabled);
  const blockRules = enabledRules.filter(r => r.constraint === 'block');
  const confirmRules = enabledRules.filter(r => r.constraint === 'confirm');
  const allowRules = enabledRules.filter(r => r.constraint === 'allow');
  const limitRules = enabledRules.filter(r => r.constraint === 'limit');

  const invariants = blockRules.map(r =>
    `- \`${r.id}\` — ${r.description} (structural, immutable)`
  ).join('\n');

  const stateVars = enabledRules.map((r, i) => `
## ${r.id}_violations
- type: number
- min: 0
- max: 1000
- step: 1
- default: 0
- label: ${r.description} — Violations
- description: Number of times this rule was violated`
  ).join('\n');

  const ruleBlocks = enabledRules.map((r, i) => {
    const num = String(i + 1).padStart(3, '0');
    const isStructural = r.constraint === 'block';
    const multiplier = isStructural ? '0.20' : '0.50';
    const collapse = isStructural ? '\nCollapse: user_trust < 0.10' : '';

    return `
## rule-${num}: ${r.description} (${isStructural ? 'structural' : 'degradation'})
${r.description}.

When ${r.id}_violations > 0 [state]
Then user_trust *= ${multiplier}${collapse}

> trigger: An app violated this user-defined rule.
> rule: ${r.description}. This rule was set by the user through the governance builder.
> shift: ${isStructural ? 'User trust collapses. Violating app suspended.' : 'User trust degrades. Violating app warned.'}
> effect: User trust reduced to ${isStructural ? '20%' : '50%'}.`;
  }).join('\n');

  const advanageRule = `
## rule-${String(enabledRules.length + 1).padStart(3, '0')}: Clean Session (advantage)
All apps operated within the user's defined rules.

When ${enabledRules.map(r => `${r.id}_violations == 0 [state]`).join(' AND ')}
Then user_trust *= 1.10

> trigger: Session completed with zero rule violations.
> rule: All user-defined governance rules were respected by every running app.
> shift: User trust improves. All apps earn compliance reputation.
> effect: User trust boosted by 10%.`;

  return `---
world_id: mentraos-user-rules
name: My AI Rules
version: 1.0.0
runtime_mode: COMPLIANCE
default_profile: standard
alternative_profile: strict
---

# Thesis

These are your personal AI rules. You defined them. They override every app on your glasses. No app can relax these rules — apps can only be more restrictive than you, never less.

Generated by the Governance Builder at ${new Date(ruleSet.compiledAt).toISOString()}.

# Invariants

${invariants || '(No structural rules defined)'}

# State
${stateVars}

# Assumptions

## standard
- name: Your AI Rules
- description: Your personal governance preferences, applied across all apps.
${enabledRules.map(r => `- ${r.id}: ${r.constraint}`).join('\n')}

# Rules
${ruleBlocks}
${advanageRule}

# Gates

- SOVEREIGN: user_trust >= 90
- COMFORTABLE: user_trust >= 65
- CAUTIOUS: user_trust >= 40
- RESTRICTED: user_trust > 10
- REVOKED: user_trust <= 10

# Outcomes

## user_trust
- type: number
- range: 0-100
- display: percentage
- label: User Trust Score
- primary: true
`;
}

/**
 * Toggle a rule on/off in a compiled rule set.
 * Returns a new rule set (immutable).
 */
export function toggleRule(ruleSet: CompiledRuleSet, ruleId: string, enabled: boolean): CompiledRuleSet {
  return {
    ...ruleSet,
    rules: ruleSet.rules.map(r =>
      r.id === ruleId ? { ...r, enabled } : r
    ),
  };
}

/**
 * Add a custom rule to the rule set (from free-form voice input).
 * Returns a new rule set.
 */
export function addCustomRule(
  ruleSet: CompiledRuleSet,
  rule: Omit<CompiledRule, 'enabled' | 'sourceQuestion' | 'sourceAnswer'>,
): CompiledRuleSet {
  return {
    ...ruleSet,
    rules: [
      ...ruleSet.rules,
      {
        ...rule,
        enabled: true,
        sourceQuestion: 'custom',
        sourceAnswer: 'custom',
      },
    ],
  };
}

/**
 * Remove a rule from the rule set.
 * Returns a new rule set.
 */
export function removeRule(ruleSet: CompiledRuleSet, ruleId: string): CompiledRuleSet {
  return {
    ...ruleSet,
    rules: ruleSet.rules.filter(r => r.id !== ruleId),
  };
}
