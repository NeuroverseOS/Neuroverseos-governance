/**
 * CLI Harness: neuroverse configure-world
 *
 * Interactive conversational wizard that translates human reasoning
 * into a fully compiled governance world.
 *
 * Users think: "complaints reduce trust"
 * Engine needs: { trigger: { field: "complaints", operator: ">", value: 30 },
 *                 effect:  { target: "trust_score", operation: "subtract", value: 15 } }
 *
 * This wizard bridges that gap — no syntax, no equations, just outcomes.
 *
 * Usage:
 *   neuroverse configure-world
 *   neuroverse configure-world --output ./my-world/
 *   neuroverse configure-world --non-interactive  (uses defaults, for CI)
 *
 * Flow:
 *   1. What are you building?           → context + world identity
 *   2. What should be blocked/reviewed? → guard rules
 *   3. What are you protecting?         → state variables (health metrics)
 *   4. What makes it worse?             → degradation rules
 *   5. What makes it better?            → advantage rules
 *   6. (optional) Refine thresholds     → gates + collapse
 *   7. Generate compiled world          → JSON output
 */

import type {
  StateVariable,
  StateSchema,
  Guard,
  GuardsConfig,
  Rule,
  Trigger,
  Effect,
  GatesConfig,
  ViabilityGate,
  WorldIdentity,
  Invariant,
  OutcomesConfig,
  ComputedOutcome,
  WorldMetadata,
} from '../types';
import {
  ask,
  askMany,
  choose,
  confirm,
  heading,
  summary,
  info,
  closePrompts,
} from './prompt-utils';

// ─── Domain Templates ───────────────────────────────────────────────────────

interface DomainTemplate {
  label: string;
  healthMetrics: string[];
  negativDrivers: string[];
  positiveDrivers: string[];
  blockActions: string[];
  reviewActions: string[];
}

const DOMAIN_TEMPLATES: Record<string, DomainTemplate> = {
  'Customer service': {
    label: 'Customer service',
    healthMetrics: ['customer_satisfaction', 'trust_score', 'resolution_rate'],
    negativDrivers: ['complaints', 'slow_responses', 'escalations'],
    positiveDrivers: ['fast_responses', 'positive_feedback', 'first_contact_resolution'],
    blockActions: ['share customer PII', 'issue unauthorized refunds', 'make legal promises'],
    reviewActions: ['escalations', 'large refund requests', 'account closures'],
  },
  'Trading system': {
    label: 'Trading system',
    healthMetrics: ['portfolio_health', 'risk_score', 'compliance_rate'],
    negativDrivers: ['losses', 'risk_violations', 'unauthorized_trades'],
    positiveDrivers: ['profitable_trades', 'risk_compliance', 'diversification'],
    blockActions: ['exceed risk limits', 'trade restricted securities', 'bypass compliance'],
    reviewActions: ['large positions', 'new asset classes', 'margin changes'],
  },
  'Content moderation': {
    label: 'Content moderation',
    healthMetrics: ['content_quality', 'safety_score', 'creator_trust'],
    negativDrivers: ['policy_violations', 'false_positives', 'user_reports'],
    positiveDrivers: ['clean_content', 'accurate_moderation', 'appeal_resolutions'],
    blockActions: ['approve harmful content', 'ban without review', 'ignore reports'],
    reviewActions: ['borderline content', 'repeat offenders', 'appeal requests'],
  },
  'Research agent': {
    label: 'Research agent',
    healthMetrics: ['accuracy_score', 'source_quality', 'output_reliability'],
    negativDrivers: ['hallucinations', 'unsourced_claims', 'bias_incidents'],
    positiveDrivers: ['verified_findings', 'diverse_sources', 'peer_validation'],
    blockActions: ['fabricate citations', 'present opinion as fact', 'ignore contradicting evidence'],
    reviewActions: ['novel conclusions', 'controversial topics', 'policy recommendations'],
  },
};

// ─── Translation Layer ──────────────────────────────────────────────────────

/**
 * Translate a human-readable health metric name into a state variable.
 * "customer satisfaction" → { id: "customer_satisfaction", type: "number", min: 0, max: 100, default: 70 }
 */
function metricToStateVariable(metric: string): { id: string; variable: StateVariable } {
  const id = metric
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  return {
    id,
    variable: {
      type: 'number',
      min: 0,
      max: 100,
      step: 5,
      default: 70,
      mutable: true,
      label: metric.replace(/\b\w/g, (c) => c.toUpperCase()),
      description: `Measures ${metric.toLowerCase()} on a 0-100 scale`,
      display_as: 'integer',
    },
  };
}

/**
 * Translate a negative driver into BOTH:
 *   1. An event-triggered rule: event "complaint" → trust_score -= 5 (per-event)
 *   2. A state-triggered rule: complaints_count > 30 → trust_score *= 0.7 (threshold)
 *
 * Drivers are events that affect variables, not variables themselves.
 */
function negativeDriverToRule(
  driver: string,
  healthMetrics: Array<{ id: string }>,
  ruleIndex: number,
): { id: string; rules: Rule[]; stateVar: { id: string; variable: StateVariable } } {
  const driverId = driver
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  const primaryTarget = healthMetrics[0]?.id || 'system_health';
  const eventRuleId = `rule-${String(ruleIndex).padStart(3, '0')}`;
  const stateRuleId = `rule-${String(ruleIndex).padStart(3, '0')}-threshold`;
  const counterId = `${driverId}_count`;

  // Counter state variable (tracks how many events occurred)
  const stateVar: StateVariable = {
    type: 'number',
    min: 0,
    max: 100,
    step: 1,
    default: 0,
    mutable: true,
    label: `${driver.replace(/\b\w/g, (c) => c.toUpperCase())} Count`,
    description: `Number of ${driver.toLowerCase()} events (0 = none)`,
    display_as: 'integer',
  };

  // Rule 1: Event-triggered — each event chips away at health
  const eventRule: Rule = {
    id: eventRuleId,
    severity: 'degradation',
    label: `${driver} event degrades ${primaryTarget.replace(/_/g, ' ')}`,
    description: `Each ${driver.toLowerCase()} event reduces ${primaryTarget.replace(/_/g, ' ')} by 5 and increments the counter.`,
    order: ruleIndex,
    triggers: [{
      field: 'event',
      operator: '==',
      value: driverId,
      source: 'state',
    }],
    effects: [
      { target: primaryTarget, operation: 'subtract', value: 5 },
      { target: counterId, operation: 'add', value: 1 },
    ],
    causal_translation: {
      trigger_text: `A ${driver.toLowerCase()} event occurs`,
      rule_text: `Each ${driver.toLowerCase()} chips away at system health`,
      shift_text: `${primaryTarget.replace(/_/g, ' ')} decreases incrementally`,
      effect_text: `${primaryTarget.replace(/_/g, ' ')} reduced by 5 points per event`,
    },
  };

  // Rule 2: State-triggered — threshold causes compounding pressure
  const stateRule: Rule = {
    id: stateRuleId,
    severity: 'degradation',
    label: `${driver} accumulation compounds damage`,
    description: `When ${driver.toLowerCase()} count exceeds threshold, ${primaryTarget.replace(/_/g, ' ')} suffers compounding loss.`,
    order: ruleIndex + 100,
    triggers: [{
      field: counterId,
      operator: '>',
      value: 30,
      source: 'state',
    }],
    effects: [
      { target: primaryTarget, operation: 'multiply', value: 0.7 },
    ],
    causal_translation: {
      trigger_text: `${driver} count exceeds safe threshold (30)`,
      rule_text: `Accumulated ${driver.toLowerCase()} creates compounding pressure`,
      shift_text: `${primaryTarget.replace(/_/g, ' ')} begins accelerating decline`,
      effect_text: `${primaryTarget.replace(/_/g, ' ')} multiplied by 0.7 (30% loss)`,
    },
  };

  return { id: eventRuleId, rules: [eventRule, stateRule], stateVar: { id: counterId, variable: stateVar } };
}

/**
 * Translate a positive driver into BOTH:
 *   1. An event-triggered rule: event "fast_response" → trust_score += 3 (per-event)
 *   2. A state-triggered rule: fast_response_count > 20 → trust_score *= 1.15 (threshold boost)
 */
function positiveDriverToRule(
  driver: string,
  healthMetrics: Array<{ id: string }>,
  ruleIndex: number,
): { id: string; rules: Rule[]; stateVar: { id: string; variable: StateVariable } } {
  const driverId = driver
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  const primaryTarget = healthMetrics[0]?.id || 'system_health';
  const eventRuleId = `rule-${String(ruleIndex).padStart(3, '0')}`;
  const stateRuleId = `rule-${String(ruleIndex).padStart(3, '0')}-threshold`;
  const counterId = `${driverId}_count`;

  const stateVar: StateVariable = {
    type: 'number',
    min: 0,
    max: 100,
    step: 1,
    default: 0,
    mutable: true,
    label: `${driver.replace(/\b\w/g, (c) => c.toUpperCase())} Count`,
    description: `Number of ${driver.toLowerCase()} events (0 = none)`,
    display_as: 'integer',
  };

  // Rule 1: Event-triggered — each event improves health
  const eventRule: Rule = {
    id: eventRuleId,
    severity: 'advantage',
    label: `${driver} event improves ${primaryTarget.replace(/_/g, ' ')}`,
    description: `Each ${driver.toLowerCase()} event increases ${primaryTarget.replace(/_/g, ' ')} by 3 and increments the counter.`,
    order: ruleIndex,
    triggers: [{
      field: 'event',
      operator: '==',
      value: driverId,
      source: 'state',
    }],
    effects: [
      { target: primaryTarget, operation: 'add', value: 3 },
      { target: counterId, operation: 'add', value: 1 },
    ],
    causal_translation: {
      trigger_text: `A ${driver.toLowerCase()} event occurs`,
      rule_text: `Each ${driver.toLowerCase()} reinforces system health`,
      shift_text: `${primaryTarget.replace(/_/g, ' ')} improves incrementally`,
      effect_text: `${primaryTarget.replace(/_/g, ' ')} increased by 3 points per event`,
    },
  };

  // Rule 2: State-triggered — threshold causes compounding boost
  const stateRule: Rule = {
    id: stateRuleId,
    severity: 'advantage',
    label: `${driver} momentum amplifies improvement`,
    description: `When ${driver.toLowerCase()} count exceeds threshold, ${primaryTarget.replace(/_/g, ' ')} gets a compounding boost.`,
    order: ruleIndex + 100,
    triggers: [{
      field: counterId,
      operator: '>',
      value: 20,
      source: 'state',
    }],
    effects: [
      { target: primaryTarget, operation: 'multiply', value: 1.15 },
    ],
    causal_translation: {
      trigger_text: `${driver} count exceeds momentum threshold (20)`,
      rule_text: `Sustained ${driver.toLowerCase()} creates compounding improvement`,
      shift_text: `${primaryTarget.replace(/_/g, ' ')} begins accelerating growth`,
      effect_text: `${primaryTarget.replace(/_/g, ' ')} multiplied by 1.15 (15% boost)`,
    },
  };

  return { id: eventRuleId, rules: [eventRule, stateRule], stateVar: { id: counterId, variable: stateVar } };
}

/**
 * Translate a block action description into a guard.
 * "share customer PII" → { enforcement: "block", intent_patterns: ["*share*pii*", ...] }
 */
function blockActionToGuard(action: string, index: number): Guard {
  const id = `guard_block_${String(index).padStart(3, '0')}`;
  const words = action
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const pattern = `*${words.join('*')}*`;

  return {
    id,
    label: `Block: ${action}`,
    description: `Prevents the system from attempting to ${action.toLowerCase()}.`,
    category: 'structural',
    enforcement: 'block',
    immutable: false,
    intent_patterns: [pattern],
  };
}

/**
 * Translate a review action into a pause guard.
 */
function reviewActionToGuard(action: string, index: number): Guard {
  const id = `guard_pause_${String(index).padStart(3, '0')}`;
  const words = action
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const pattern = `*${words.join('*')}*`;

  return {
    id,
    label: `Review: ${action}`,
    description: `Requires human review before the system can ${action.toLowerCase()}.`,
    category: 'operational',
    enforcement: 'pause',
    immutable: false,
    intent_patterns: [pattern],
  };
}

/**
 * Generate sensible default gates for a primary health metric.
 */
function generateGates(primaryMetricId: string): GatesConfig {
  const gates: ViabilityGate[] = [
    { status: 'THRIVING', field: primaryMetricId, operator: '>=', value: 80, color: '#22c55e', icon: '◆' },
    { status: 'STABLE', field: primaryMetricId, operator: '>=', value: 60, color: '#3b82f6', icon: '●' },
    { status: 'COMPRESSED', field: primaryMetricId, operator: '>=', value: 40, color: '#f59e0b', icon: '▲' },
    { status: 'CRITICAL', field: primaryMetricId, operator: '>=', value: 20, color: '#ef4444', icon: '✦' },
    { status: 'MODEL_COLLAPSES', field: primaryMetricId, operator: '<', value: 20, color: '#7f1d1d', icon: '✕' },
  ];

  return {
    viability_classification: gates,
    structural_override: {
      description: 'System collapse when primary health metric falls below critical threshold',
      enforcement: 'mandatory',
    },
    sustainability_threshold: 40,
    collapse_visual: {
      background: '#7f1d1d',
      text: '#fecaca',
      border: '#ef4444',
      label: 'SYSTEM COLLAPSED',
    },
  };
}

// ─── Wizard Phases ──────────────────────────────────────────────────────────

interface WizardState {
  worldName: string;
  worldId: string;
  thesis: string;
  domain: string;
  blockActions: string[];
  reviewActions: string[];
  healthMetrics: string[];
  negativeDrivers: string[];
  positiveDrivers: string[];
}

async function phaseContext(): Promise<Pick<WizardState, 'worldName' | 'worldId' | 'thesis' | 'domain'>> {
  heading("Let's define your system");
  info("We'll do two things:");
  info('  1. Control what actions are allowed');
  info('  2. Model what happens over time');

  const domain = await choose('What are you building?', [
    ...Object.keys(DOMAIN_TEMPLATES),
    'Something else',
  ]);

  const worldName = await ask('Give your world a name', domain === 'Something else' ? 'My System' : `${domain} Governance`);
  const worldId = worldName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

  const thesis = await ask(
    'In one sentence, what does this system govern?',
    domain !== 'Something else'
      ? `Governance model for ${domain.toLowerCase()} operations`
      : undefined,
  );

  return { worldName, worldId, thesis, domain };
}

async function phaseGuard(domain: string): Promise<Pick<WizardState, 'blockActions' | 'reviewActions'>> {
  heading('Layer 1: Action Control');
  info('What should this system NOT do?');

  const template = DOMAIN_TEMPLATES[domain];
  let blockActions: string[];
  let reviewActions: string[];

  if (template) {
    info(`\n  Suggested for ${domain}:`);
    template.blockActions.forEach((a) => info(`    BLOCK: ${a}`));
    const useSuggested = await confirm('Use these suggestions?');

    if (useSuggested) {
      blockActions = [...template.blockActions];
    } else {
      blockActions = await askMany('What should be BLOCKED?', 'actions the system must never do');
    }

    info('\n  What should require human review?');
    if (useSuggested) {
      template.reviewActions.forEach((a) => info(`    REVIEW: ${a}`));
      const useReviewSuggested = await confirm('Use these suggestions?');
      reviewActions = useReviewSuggested ? [...template.reviewActions] : await askMany('What needs human REVIEW?');
    } else {
      reviewActions = await askMany('What needs human REVIEW?', 'actions that need approval');
    }
  } else {
    blockActions = await askMany('What should be BLOCKED?', 'actions the system must never do');
    reviewActions = await askMany('What needs human REVIEW?', 'actions that need approval');
  }

  // Add more if desired
  if (blockActions.length > 0 || reviewActions.length > 0) {
    summary('Actions configured', [
      ...blockActions.map((a) => `BLOCK: ${a}`),
      ...reviewActions.map((a) => `REVIEW: ${a}`),
    ]);
  }

  return { blockActions, reviewActions };
}

async function phaseSystem(domain: string): Promise<Pick<WizardState, 'healthMetrics' | 'negativeDrivers' | 'positiveDrivers'>> {
  heading('Layer 2: System Dynamics');
  info("Now let's define what a healthy system looks like over time.\n");

  const template = DOMAIN_TEMPLATES[domain];
  let healthMetrics: string[];
  let negativeDrivers: string[];
  let positiveDrivers: string[];

  // Health metrics
  info('What are you trying to protect or optimize?');
  if (template) {
    info('  Examples:');
    template.healthMetrics.forEach((m) => info(`    • ${m.replace(/_/g, ' ')}`));
    const useSuggested = await confirm('Use these suggestions?');
    if (useSuggested) {
      healthMetrics = [...template.healthMetrics];
    } else {
      healthMetrics = await askMany('What metrics define system health?', 'e.g., customer satisfaction, trust, revenue');
    }
  } else {
    healthMetrics = await askMany('What metrics define system health?', 'e.g., customer satisfaction, trust, revenue');
  }

  if (healthMetrics.length === 0) {
    healthMetrics = ['system_health'];
    info('  Defaulting to "system_health" as primary metric.');
  }

  // Negative drivers
  info('\n  What makes this worse?');
  if (template) {
    info('  Examples:');
    template.negativDrivers.forEach((d) => info(`    • ${d.replace(/_/g, ' ')}`));
    const useSuggested = await confirm('Use these suggestions?');
    negativeDrivers = useSuggested ? [...template.negativDrivers] : await askMany('What degrades your system?');
  } else {
    negativeDrivers = await askMany('What degrades your system?', 'e.g., complaints, errors, delays');
  }

  // Positive drivers
  info('\n  What makes this better?');
  if (template) {
    info('  Examples:');
    template.positiveDrivers.forEach((d) => info(`    • ${d.replace(/_/g, ' ')}`));
    const useSuggested = await confirm('Use these suggestions?');
    positiveDrivers = useSuggested ? [...template.positiveDrivers] : await askMany('What improves your system?');
  } else {
    positiveDrivers = await askMany('What improves your system?', 'e.g., fast responses, positive feedback');
  }

  summary('System dynamics', [
    `Health: ${healthMetrics.join(', ')}`,
    `Degrades from: ${negativeDrivers.join(', ') || '(none)'}`,
    `Improves from: ${positiveDrivers.join(', ') || '(none)'}`,
  ]);

  return { healthMetrics, negativeDrivers, positiveDrivers };
}

// ─── World Generation ───────────────────────────────────────────────────────

interface GeneratedWorld {
  worldJson: WorldIdentity;
  stateSchema: StateSchema;
  guardsJson: GuardsConfig;
  rules: Rule[];
  gatesJson: GatesConfig;
  invariants: Invariant[];
  outcomes: OutcomesConfig;
  metadata: WorldMetadata;
}

function generateWorld(state: WizardState): GeneratedWorld {
  // 1. World identity
  const worldJson: WorldIdentity = {
    world_id: state.worldId,
    name: state.worldName,
    thesis: state.thesis,
    version: '1.0.0',
    runtime_mode: 'SIMULATION',
    default_assumption_profile: 'baseline',
    default_alternative_profile: 'stress',
    modules: [],
    players: { thinking_space: true, experience_space: true, action_space: true },
  };

  // 2. State variables — health metrics + drivers
  const variables: Record<string, StateVariable> = {};
  const metricIds: Array<{ id: string }> = [];

  for (const metric of state.healthMetrics) {
    const { id, variable } = metricToStateVariable(metric);
    variables[id] = variable;
    metricIds.push({ id });
  }

  // 3. Rules — translate drivers
  const rules: Rule[] = [];
  let ruleIdx = 1;

  // Negative drivers → event-triggered + state-triggered rules
  for (const driver of state.negativeDrivers) {
    const result = negativeDriverToRule(driver, metricIds, ruleIdx++);
    rules.push(...result.rules);
    if (!variables[result.stateVar.id]) {
      variables[result.stateVar.id] = result.stateVar.variable;
    }
  }

  // Positive drivers → event-triggered + state-triggered rules
  for (const driver of state.positiveDrivers) {
    const result = positiveDriverToRule(driver, metricIds, ruleIdx++);
    rules.push(...result.rules);
    if (!variables[result.stateVar.id]) {
      variables[result.stateVar.id] = result.stateVar.variable;
    }
  }

  // 4. State schema
  const stateSchema: StateSchema = {
    variables,
    presets: {
      'Healthy': {
        description: 'System operating normally',
        values: Object.fromEntries(
          Object.entries(variables).map(([id, v]) => [id, v.default]),
        ),
      },
      'Stressed': {
        description: 'System under pressure',
        values: Object.fromEntries(
          Object.entries(variables).map(([id, v]) => {
            // For driver counters, set high to trigger threshold rules
            if (id.endsWith('_count') && state.negativeDrivers.some((d) =>
              id.startsWith(d.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')))) {
              return [id, 40];
            }
            if (state.healthMetrics.some((m) => m.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') === id)) {
              return [id, 40];
            }
            return [id, v.default];
          }),
        ),
      },
    },
  };

  // 5. Guards
  const guards: Guard[] = [];
  state.blockActions.forEach((action, i) => {
    guards.push(blockActionToGuard(action, i + 1));
  });
  state.reviewActions.forEach((action, i) => {
    guards.push(reviewActionToGuard(action, i + 1));
  });

  const guardsJson: GuardsConfig = {
    guards,
    intent_vocabulary: {},
  };

  // 6. Gates — based on primary health metric
  const primaryMetricId = metricIds[0]?.id || 'system_health';
  const gatesJson = generateGates(primaryMetricId);

  // 7. Invariants
  const invariants: Invariant[] = [
    {
      id: 'system_must_remain_governable',
      label: 'System must remain under governance at all times',
      enforcement: 'structural',
      mutable: false,
    },
  ];

  // 8. Outcomes
  const primaryOutcome: ComputedOutcome = {
    id: primaryMetricId,
    type: 'number',
    range: [0, 100],
    display_as: 'integer',
    label: variables[primaryMetricId]?.label || 'System Health',
    primary: true,
    show_in_comparison: true,
  };

  const outcomes: OutcomesConfig = {
    computed_outcomes: [
      primaryOutcome,
      ...metricIds.slice(1).map((m) => ({
        id: m.id,
        type: 'number' as const,
        range: [0, 100] as [number, number],
        display_as: 'integer' as const,
        label: variables[m.id]?.label || m.id,
        primary: false,
        show_in_comparison: true,
      })),
    ],
    comparison_layout: {
      primary_card: primaryMetricId,
      status_badge: primaryMetricId,
      structural_indicators: metricIds.map((m) => m.id),
    },
  };

  // 9. Metadata
  const metadata: WorldMetadata = {
    format_version: '1.0.0',
    created_at: new Date().toISOString(),
    last_modified: new Date().toISOString(),
    authoring_method: 'configurator-ai',
  };

  return { worldJson, stateSchema, guardsJson, rules, gatesJson, invariants, outcomes, metadata };
}

// ─── File Writer ────────────────────────────────────────────────────────────

async function writeWorld(outputDir: string, world: GeneratedWorld): Promise<string[]> {
  const { mkdirSync, existsSync } = await import('fs');
  const { writeFile } = await import('fs/promises');
  const { join } = await import('path');

  const files: string[] = [];

  // Create directories
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const rulesDir = join(outputDir, 'rules');
  if (!existsSync(rulesDir)) mkdirSync(rulesDir, { recursive: true });

  // Write each file
  const writeJson = async (name: string, data: unknown) => {
    const path = join(outputDir, name);
    await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    files.push(path);
  };

  await writeJson('world.json', world.worldJson);
  await writeJson('state-schema.json', world.stateSchema);
  await writeJson('guards.json', world.guardsJson);
  await writeJson('gates.json', world.gatesJson);
  await writeJson('invariants.json', world.invariants);
  await writeJson('outcomes.json', world.outcomes);
  await writeJson('metadata.json', world.metadata);

  // Rules as individual files
  for (const rule of world.rules) {
    const rulePath = join(rulesDir, `${rule.id}.json`);
    await writeFile(rulePath, JSON.stringify(rule, null, 2) + '\n', 'utf-8');
    files.push(rulePath);
  }

  return files;
}

// ─── Argument Parsing ───────────────────────────────────────────────────────

interface ConfigureArgs {
  outputDir: string;
}

function parseArgs(argv: string[]): ConfigureArgs {
  let outputDir = './world/';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === '--output' || arg === '-o') && i + 1 < argv.length) {
      outputDir = argv[++i];
    }
  }

  return { outputDir };
}

// ─── Main ───────────────────────────────────────────────────────────────────

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  try {
    const args = parseArgs(argv);

    // Phase 1: Context
    const context = await phaseContext();

    // Phase 2: Guard (action control)
    const guardState = await phaseGuard(context.domain);

    // Phase 3: System dynamics
    const systemState = await phaseSystem(context.domain);

    // Assemble full wizard state
    const wizardState: WizardState = {
      ...context,
      ...guardState,
      ...systemState,
    };

    // Show summary before generating
    heading('Summary');
    info(`World: ${wizardState.worldName}`);
    info(`Thesis: ${wizardState.thesis}`);
    summary('Guard rules', [
      ...wizardState.blockActions.map((a) => `BLOCK: ${a}`),
      ...wizardState.reviewActions.map((a) => `REVIEW: ${a}`),
    ]);
    summary('System dynamics', [
      `Health metrics: ${wizardState.healthMetrics.join(', ')}`,
      `Degrades from: ${wizardState.negativeDrivers.join(', ') || '(none)'}`,
      `Improves from: ${wizardState.positiveDrivers.join(', ') || '(none)'}`,
    ]);

    const proceed = await confirm('\nCreate world?');
    if (!proceed) {
      info('Aborted.');
      closePrompts();
      process.exit(0);
      return;
    }

    // Generate
    info('\nGenerating world...');
    const world = generateWorld(wizardState);
    const files = await writeWorld(args.outputDir, world);

    // Output result
    heading('World created');
    info(`Output: ${args.outputDir}`);
    info(`Files: ${files.length}`);
    summary('Generated', [
      `${Object.keys(world.stateSchema.variables).length} state variables`,
      `${world.rules.length} rules (${world.rules.filter((r) => r.severity === 'degradation').length} degradation, ${world.rules.filter((r) => r.severity === 'advantage').length} advantage)`,
      `${world.guardsJson.guards.length} guards (${world.guardsJson.guards.filter((g) => g.enforcement === 'block').length} block, ${world.guardsJson.guards.filter((g) => g.enforcement === 'pause').length} pause)`,
      `5 viability gates (THRIVING → MODEL_COLLAPSES)`,
    ]);

    info('\nNext steps:');
    info(`  neuroverse validate --world ${args.outputDir}`);
    info(`  neuroverse simulate ${args.outputDir} --steps 5`);
    info(`  neuroverse explain ${args.outputDir}`);

    // Optional refinement prompt
    const refine = await confirm('\nWant to refine thresholds and collapse rules?', false);
    if (refine) {
      await phaseRefine(args.outputDir, world);
    }

    closePrompts();

    // Final JSON output to stdout
    const result = {
      created: args.outputDir,
      worldName: wizardState.worldName,
      files: files.length,
      stateVariables: Object.keys(world.stateSchema.variables).length,
      rules: world.rules.length,
      guards: world.guardsJson.guards.length,
      gates: 5,
    };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(0);
  } catch (e) {
    closePrompts();
    process.stderr.write(`Error: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(3);
  }
}

// ─── Optional Refinement Phase ──────────────────────────────────────────────

async function phaseRefine(outputDir: string, world: GeneratedWorld): Promise<void> {
  const { writeFile } = await import('fs/promises');
  const { join } = await import('path');

  heading('Refinement: Thresholds & Collapse');

  // Refine gate thresholds
  const primaryMetric = world.gatesJson.viability_classification[0]?.field || 'system_health';
  info(`\n  Primary health metric: ${primaryMetric}`);
  info('  Current gate thresholds:');

  for (const gate of world.gatesJson.viability_classification) {
    info(`    ${gate.status}: ${gate.field} ${gate.operator} ${gate.value}`);
  }

  const changeGates = await confirm('Adjust gate thresholds?', false);
  if (changeGates) {
    for (const gate of world.gatesJson.viability_classification) {
      const newVal = await ask(`  ${gate.status} threshold (${gate.operator})`, String(gate.value));
      const parsed = parseInt(newVal, 10);
      if (!isNaN(parsed)) gate.value = parsed;
    }

    // Write updated gates
    await writeFile(
      join(outputDir, 'gates.json'),
      JSON.stringify(world.gatesJson, null, 2) + '\n',
      'utf-8',
    );
    info('  Gates updated.');
  }

  // Add collapse conditions to rules
  const addCollapse = await confirm('Add collapse conditions to degradation rules?', false);
  if (addCollapse) {
    for (const rule of world.rules.filter((r) => r.severity === 'degradation')) {
      info(`\n  Rule: ${rule.label}`);
      const target = rule.effects?.[0]?.target || primaryMetric;
      const collapseVal = await ask(`  ${target} collapses below what value?`, '10');
      const parsed = parseInt(collapseVal, 10);
      if (!isNaN(parsed)) {
        rule.collapse_check = {
          field: target,
          operator: '<',
          value: parsed,
          result: 'MODEL_COLLAPSES',
        };
        // Write updated rule
        await writeFile(
          join(outputDir, 'rules', `${rule.id}.json`),
          JSON.stringify(rule, null, 2) + '\n',
          'utf-8',
        );
        info(`  Collapse condition added: ${target} < ${parsed}`);
      }
    }
  }
}
