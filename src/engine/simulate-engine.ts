/**
 * Simulate Engine — Deterministic State Evolution (Reference Simulator)
 *
 * Pure function: (world, options) → SimulationResult
 *
 * This is NeuroVerse's REFERENCE SIMULATOR — one way to model how a world
 * evolves over time. It is NOT the governance engine.
 *
 * simulateWorld() ≠ evaluateGuard()
 *
 *   evaluateGuard()  — Runtime enforcement. Decides if an action is allowed.
 *                      Includes safety layer, role checks, plan enforcement,
 *                      kernel rules, level constraints. Use for governance.
 *
 *   simulateWorld()  — State evolution modeling. Evaluates rule triggers,
 *                      applies effects, tracks viability over N steps.
 *                      Use for scenario planning and what-if analysis.
 *
 * World files (.nv-world.md) are portable — they define rules, roles, and
 * constraints that can be consumed by any simulator or governance engine.
 * This simulator is a reference implementation, not the only interpreter.
 *
 * Supports:
 *   - Single-step evaluation (default)
 *   - Multi-step iteration (--steps N)
 *   - State overrides (start from non-default values)
 *   - Assumption profile selection
 *   - Collapse detection (early termination)
 *
 * INVARIANTS:
 *   - Deterministic: same world + same options → same result.
 *   - Zero network calls. Zero LLM calls. Zero async.
 *   - Every rule evaluation is recorded in the trace.
 *   - World definition is REQUIRED — no world, no simulation.
 */

import type {
  WorldDefinition, Rule, Effect, Trigger,
  StateSchema, StateVariable, AssumptionConfig,
  ViabilityStatus, TriggerOperator,
  GovernanceEvent,
} from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SimulateOptions {
  /** Number of simulation steps (default: 1) */
  steps?: number;
  /** State variable overrides (start values) */
  stateOverrides?: Record<string, string | number | boolean>;
  /** Assumption profile to use (default: world default) */
  profile?: string;
  /**
   * Governance events to inject into the simulation.
   * Events are applied before state-driven rules each step.
   * This is the bridge: Guard → Events → Simulate → State Evolution.
   *
   * Events are distributed across steps (round-robin) or all applied to step 1
   * if there are fewer steps than events.
   */
  events?: GovernanceEvent[];
}

export interface SimulationResult {
  worldId: string;
  worldName: string;
  profile: string;
  initialState: Record<string, string | number | boolean>;
  steps: SimulationStep[];
  finalState: Record<string, string | number | boolean>;
  finalViability: ViabilityStatus;
  collapsed: boolean;
  collapseStep?: number;
  collapseRule?: string;
  /** Total events consumed during simulation */
  eventsConsumed: number;
}

export interface SimulationStep {
  step: number;
  /** Events applied during this step (before rules) */
  eventsApplied: EventApplication[];
  rulesEvaluated: RuleEvaluation[];
  rulesFired: number;
  stateAfter: Record<string, string | number | boolean>;
  viability: ViabilityStatus;
  collapsed: boolean;
}

/** Record of an event applied during simulation */
export interface EventApplication {
  eventType: string;
  rulesTriggered: string[];
  effects: AppliedEffect[];
}

export interface RuleEvaluation {
  ruleId: string;
  label: string;
  triggered: boolean;
  excluded: boolean;
  effects: AppliedEffect[];
  collapsed: boolean;
  collapseField?: string;
}

export interface AppliedEffect {
  target: string;
  operation: string;
  value: number | boolean | string;
  before: string | number | boolean;
  after: string | number | boolean;
}

// ─── Core Engine ─────────────────────────────────────────────────────────────

export function simulateWorld(
  world: WorldDefinition,
  options: SimulateOptions = {},
): SimulationResult {
  if (!world || !world.world) {
    throw new Error(
      'World definition required. simulateWorld() cannot run without a world.\n' +
      'Load one with: loadWorld("./world/") or parseWorldMarkdown(markdown)',
    );
  }

  const steps = Math.max(1, Math.min(options.steps ?? 1, 50));
  const profileName = options.profile ?? world.world.default_assumption_profile;

  // Build initial state from defaults
  const state = buildInitialState(world.stateSchema, options.stateOverrides);

  // Initialize outcome fields that aren't already in state schema.
  // Primary outcomes default to 100, others to 0. This ensures rules
  // referencing outcome fields (e.g. "agent_trust *= 0.5") have a value.
  for (const outcome of world.outcomes?.computed_outcomes ?? []) {
    if (!(outcome.id in state)) {
      state[outcome.id] = outcome.primary ? 100 : 0;
    }
  }

  // Resolve assumption parameters
  const assumptions = resolveAssumptions(world.assumptions, profileName);

  const initialState = { ...state };
  const simulationSteps: SimulationStep[] = [];
  let collapsed = false;
  let collapseStep: number | undefined;
  let collapseRule: string | undefined;

  // Sort rules by order
  const sortedRules = [...world.rules].sort((a, b) => a.order - b.order);

  // Distribute events across steps (round-robin)
  const allEvents = options.events ?? [];
  const eventsByStep: GovernanceEvent[][] = Array.from({ length: steps }, () => []);
  for (let i = 0; i < allEvents.length; i++) {
    const stepIdx = Math.min(i, steps - 1);
    eventsByStep[stepIdx].push(allEvents[i]);
  }

  let totalEventsConsumed = 0;

  for (let stepNum = 1; stepNum <= steps; stepNum++) {
    if (collapsed) break;

    const stepEvents = eventsByStep[stepNum - 1];
    const stepResult = evaluateStep(
      stepNum, sortedRules, state, assumptions, world, stepEvents,
    );

    totalEventsConsumed += stepResult.eventsApplied.length;
    simulationSteps.push(stepResult);

    if (stepResult.collapsed) {
      collapsed = true;
      collapseStep = stepNum;
      collapseRule = stepResult.rulesEvaluated.find(r => r.collapsed)?.ruleId;
    }
  }

  const finalViability = classifyViability(state, world);

  return {
    worldId: world.world.world_id,
    worldName: world.world.name,
    profile: profileName,
    initialState,
    steps: simulationSteps,
    finalState: { ...state },
    finalViability,
    collapsed,
    collapseStep,
    collapseRule,
    eventsConsumed: totalEventsConsumed,
  };
}

// ─── Step Evaluation ─────────────────────────────────────────────────────────

function evaluateStep(
  stepNum: number,
  rules: Rule[],
  state: Record<string, string | number | boolean>,
  assumptions: Record<string, string>,
  world: WorldDefinition,
  events: GovernanceEvent[] = [],
): SimulationStep {
  const evaluations: RuleEvaluation[] = [];
  const eventApplications: EventApplication[] = [];
  let rulesFired = 0;
  let collapsed = false;
  const firedRuleIds = new Set<string>();

  // Phase A: Apply events — match event types to event-triggered rules
  for (const evt of events) {
    const application: EventApplication = {
      eventType: evt.type,
      rulesTriggered: [],
      effects: [],
    };

    for (const rule of rules) {
      // Event-triggered rule: rule has a trigger with field matching "event:<type>"
      // Convention: trigger.field === "event" and trigger.value === event.type
      const eventTrigger = rule.triggers.find(
        t => t.field === 'event' && t.source === 'state',
      );
      if (!eventTrigger) continue;

      // Check if this rule matches this event type
      const matches = evaluateOperator(evt.type, eventTrigger.operator, eventTrigger.value);
      if (!matches) continue;

      application.rulesTriggered.push(rule.id);
      firedRuleIds.add(rule.id);

      // Apply effects
      for (const effect of rule.effects ?? []) {
        const applied = applyEffect(effect, state);
        if (applied) application.effects.push(applied);
      }
    }

    eventApplications.push(application);
  }

  // Phase B: Evaluate state-driven rules (existing logic)
  for (const rule of rules) {
    if (collapsed) {
      evaluations.push({
        ruleId: rule.id, label: rule.label,
        triggered: false, excluded: true, effects: [], collapsed: false,
      });
      continue;
    }

    // Check exclusive_with
    const excluded = rule.exclusive_with ? firedRuleIds.has(rule.exclusive_with) : false;
    if (excluded) {
      evaluations.push({
        ruleId: rule.id, label: rule.label,
        triggered: false, excluded: true, effects: [], collapsed: false,
      });
      continue;
    }

    // Evaluate triggers
    const triggered = evaluateTriggers(rule.triggers, state, assumptions);

    if (!triggered) {
      evaluations.push({
        ruleId: rule.id, label: rule.label,
        triggered: false, excluded: false, effects: [], collapsed: false,
      });
      continue;
    }

    // Apply effects
    firedRuleIds.add(rule.id);
    rulesFired++;
    const appliedEffects: AppliedEffect[] = [];

    // Direct effects
    for (const effect of rule.effects ?? []) {
      const applied = applyEffect(effect, state);
      if (applied) appliedEffects.push(applied);
    }

    // Conditional effects
    for (const ce of rule.effects_conditional ?? []) {
      const conditionMet = evaluateSingleTrigger(ce.condition, state, assumptions);
      const andMet = ce.and ? evaluateSingleTrigger(ce.and, state, assumptions) : true;
      const orMet = ce.or ? evaluateSingleTrigger(ce.or, state, assumptions) : false;
      const anyMet = ce.condition_any
        ? ce.condition_any.some(c => evaluateSingleTrigger(c, state, assumptions))
        : false;

      const shouldApply = (conditionMet && andMet) || (ce.or && orMet) || (ce.condition_any && anyMet);

      if (shouldApply) {
        for (const effect of ce.effects) {
          const applied = applyEffect(effect, state);
          if (applied) appliedEffects.push(applied);
        }
      }
    }

    // Collapse check
    let ruleCollapsed = false;
    if (rule.collapse_check) {
      const fieldVal = typeof state[rule.collapse_check.field] === 'number'
        ? state[rule.collapse_check.field] as number
        : 0;
      if (evaluateOperator(fieldVal, rule.collapse_check.operator, rule.collapse_check.value)) {
        ruleCollapsed = true;
        collapsed = true;
      }
    }
    if (!ruleCollapsed && rule.secondary_check) {
      const fieldVal = typeof state[rule.secondary_check.field] === 'number'
        ? state[rule.secondary_check.field] as number
        : 0;
      if (evaluateOperator(fieldVal, rule.secondary_check.operator, rule.secondary_check.value)) {
        ruleCollapsed = true;
        collapsed = true;
      }
    }

    evaluations.push({
      ruleId: rule.id,
      label: rule.label,
      triggered: true,
      excluded: false,
      effects: appliedEffects,
      collapsed: ruleCollapsed,
      collapseField: ruleCollapsed
        ? (rule.collapse_check?.field ?? rule.secondary_check?.field)
        : undefined,
    });
  }

  const viability = classifyViability(state, world);

  return {
    step: stepNum,
    eventsApplied: eventApplications,
    rulesEvaluated: evaluations,
    rulesFired,
    stateAfter: { ...state },
    viability,
    collapsed,
  };
}

// ─── Trigger Evaluation ──────────────────────────────────────────────────────

function evaluateTriggers(
  triggers: Trigger[],
  state: Record<string, string | number | boolean>,
  assumptions: Record<string, string>,
): boolean {
  if (!triggers || triggers.length === 0) return true;
  return triggers.every(t => evaluateSingleTrigger(t, state, assumptions));
}

function evaluateSingleTrigger(
  trigger: Trigger,
  state: Record<string, string | number | boolean>,
  assumptions: Record<string, string>,
): boolean {
  const source = trigger.source === 'assumption' ? assumptions : state;
  const fieldValue = source[trigger.field];

  if (fieldValue === undefined) return false;

  return evaluateOperator(fieldValue, trigger.operator, trigger.value);
}

function evaluateOperator(
  fieldValue: string | number | boolean,
  operator: TriggerOperator,
  conditionValue: string | number | boolean | string[],
): boolean {
  switch (operator) {
    case '==':
      return fieldValue === conditionValue;
    case '!=':
      return fieldValue !== conditionValue;
    case '>':
      return typeof fieldValue === 'number' && typeof conditionValue === 'number'
        && fieldValue > conditionValue;
    case '<':
      return typeof fieldValue === 'number' && typeof conditionValue === 'number'
        && fieldValue < conditionValue;
    case '>=':
      return typeof fieldValue === 'number' && typeof conditionValue === 'number'
        && fieldValue >= conditionValue;
    case '<=':
      return typeof fieldValue === 'number' && typeof conditionValue === 'number'
        && fieldValue <= conditionValue;
    case 'in':
      return Array.isArray(conditionValue) && conditionValue.includes(String(fieldValue));
    default:
      return false;
  }
}

// ─── Effect Application ──────────────────────────────────────────────────────

function applyEffect(
  effect: Effect,
  state: Record<string, string | number | boolean>,
): AppliedEffect | null {
  const before = state[effect.target];
  let after: string | number | boolean;

  switch (effect.operation) {
    case 'multiply':
    case 'multiply_dynamic': {
      const current = typeof before === 'number' ? before : 0;
      const factor = typeof effect.value === 'number' ? effect.value : 1;
      after = current * factor;
      break;
    }
    case 'add':
    case 'add_dynamic': {
      const current = typeof before === 'number' ? before : 0;
      const addend = typeof effect.value === 'number' ? effect.value : 0;
      after = current + addend;
      break;
    }
    case 'subtract':
    case 'subtract_dynamic': {
      const current = typeof before === 'number' ? before : 0;
      const subtrahend = typeof effect.value === 'number' ? effect.value : 0;
      after = current - subtrahend;
      break;
    }
    case 'set':
    case 'set_dynamic':
      after = effect.value;
      break;
    case 'set_boolean':
      after = !!effect.value;
      break;
    default:
      return null;
  }

  state[effect.target] = after;

  return {
    target: effect.target,
    operation: effect.operation,
    value: effect.value,
    before: before ?? 0,
    after,
  };
}

// ─── State Initialization ────────────────────────────────────────────────────

function buildInitialState(
  schema: StateSchema,
  overrides?: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  const state: Record<string, string | number | boolean> = {};

  for (const [name, variable] of Object.entries(schema.variables ?? {})) {
    state[name] = variable.default;
  }

  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      state[key] = value;
    }
  }

  return state;
}

function resolveAssumptions(
  config: AssumptionConfig,
  profileName: string,
): Record<string, string> {
  const profile = config.profiles?.[profileName];
  return profile?.parameters ?? {};
}

// ─── Viability Classification ────────────────────────────────────────────────

function classifyViability(
  state: Record<string, string | number | boolean>,
  world: WorldDefinition,
): ViabilityStatus {
  const gates = world.gates?.viability_classification ?? [];

  // Gates are ordered from best to worst — first match wins
  for (const gate of gates) {
    const fieldValue = state[gate.field];
    if (typeof fieldValue !== 'number') continue;

    if (evaluateOperator(fieldValue, gate.operator, gate.value)) {
      return gate.status;
    }
  }

  return 'MODEL_COLLAPSES';
}

// ─── Text Renderer ───────────────────────────────────────────────────────────

export function renderSimulateText(result: SimulationResult): string {
  const lines: string[] = [];

  lines.push(`SIMULATION: ${result.worldName}`);
  lines.push(`Profile: ${result.profile}`);
  lines.push(`Steps: ${result.steps.length}`);
  lines.push('');

  // Initial state
  lines.push('INITIAL STATE');
  for (const [key, value] of Object.entries(result.initialState)) {
    lines.push(`  ${key}: ${value}`);
  }
  lines.push('');

  // Steps
  for (const step of result.steps) {
    lines.push(`STEP ${step.step}`);

    // Show events applied this step
    if (step.eventsApplied && step.eventsApplied.length > 0) {
      for (const evt of step.eventsApplied) {
        lines.push(`  EVENT: ${evt.eventType}`);
        if (evt.rulesTriggered.length > 0) {
          lines.push(`    Rules triggered: ${evt.rulesTriggered.join(', ')}`);
        }
        for (const effect of evt.effects) {
          const beforeStr = formatValue(effect.before);
          const afterStr = formatValue(effect.after);
          lines.push(`    ${effect.target}: ${beforeStr} -> ${afterStr}`);
        }
      }
    }

    const fired = step.rulesEvaluated.filter(r => r.triggered);
    const skipped = step.rulesEvaluated.filter(r => !r.triggered && !r.excluded);
    const excluded = step.rulesEvaluated.filter(r => r.excluded);

    if (fired.length === 0) {
      lines.push('  No rules fired (state unchanged)');
    } else {
      for (const rule of fired) {
        lines.push(`  FIRED: ${rule.label}`);
        for (const effect of rule.effects) {
          const beforeStr = formatValue(effect.before);
          const afterStr = formatValue(effect.after);
          lines.push(`    ${effect.target}: ${beforeStr} -> ${afterStr}`);
        }
        if (rule.collapsed) {
          lines.push(`    COLLAPSE on ${rule.collapseField}`);
        }
      }
    }

    if (excluded.length > 0) {
      lines.push(`  Excluded: ${excluded.map(r => r.label).join(', ')}`);
    }

    lines.push(`  Viability: ${step.viability}`);

    if (step.collapsed) {
      lines.push('  ** MODEL COLLAPSED **');
    }

    lines.push('');
  }

  // Final state
  lines.push('FINAL STATE');
  for (const [key, value] of Object.entries(result.finalState)) {
    const initial = result.initialState[key];
    const changed = initial !== value;
    const marker = changed ? ' (changed)' : '';
    lines.push(`  ${key}: ${formatValue(value)}${marker}`);
  }
  lines.push('');

  if (result.eventsConsumed > 0) {
    lines.push(`EVENTS CONSUMED: ${result.eventsConsumed}`);
  }
  lines.push(`VIABILITY: ${result.finalViability}`);
  if (result.collapsed) {
    lines.push(`COLLAPSED at step ${result.collapseStep} (rule: ${result.collapseRule})`);
  }

  return lines.join('\n');
}

function formatValue(v: string | number | boolean): string {
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
  return String(v);
}
