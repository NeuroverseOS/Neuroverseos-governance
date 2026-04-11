/**
 * WorldModel Compiler — ParsedWorldModel → .nv-world.md + Artifacts
 *
 * Deterministic compiler that transforms a three-layer behavioral model
 * into executable NeuroVerse governance artifacts.
 *
 * Layer Mapping:
 *   Core Model Geometry   → thesis, invariants, lenses, overlaps.json
 *   Contextual Modifiers  → contexts.json
 *   Evolution Layer        → state, rules, gates, outcomes, signals.json
 *
 * The generated .nv-world.md is valid for bootstrap-parser.ts (round-trip safe).
 */

import type {
  ParsedWorldModel,
  WorldModelOutput,
  SignalSchema,
  SignalEntry,
  OverlapMap,
  OverlapPairing,
  ContextsConfig,
  LensSuggestion,
  LensDirectiveEntry,
} from '../contracts/worldmodel-contract';

// ─── Helpers ────────────────────────────────────────────────────────────────

function toSnakeCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function toKebabCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function titleCase(text: string): string {
  return text
    .split(/[\s_-]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Find the best-matching signal for a behavior description.
 * Uses substring matching on signal name against the behavior text.
 * Falls back to 'alignment_score' if no match.
 */
function matchSignal(behaviorText: string, signals: string[]): string {
  const lowerText = behaviorText.toLowerCase();
  for (const signal of signals) {
    const signalWords = signal.toLowerCase().split('_');
    // Check if any signal word appears in the behavior text
    if (signalWords.some(w => w.length > 3 && lowerText.includes(w))) {
      return signal;
    }
  }
  return 'alignment_score';
}

// ─── World Markdown Emitter ─────────────────────────────────────────────────

/**
 * Compile ParsedWorldModel into a valid .nv-world.md string.
 *
 * The output is designed to parse cleanly through bootstrap-parser.ts.
 */
export function emitWorldMarkdown(model: ParsedWorldModel): string {
  const lines: string[] = [];

  const worldId = model.frontmatter.model_id;
  const worldName = model.frontmatter.name;
  const version = model.frontmatter.version;

  // ─── Frontmatter ────────────────────────────────────────────────────────
  lines.push('---');
  lines.push(`world_id: ${worldId}`);
  lines.push(`name: ${worldName}`);
  lines.push(`version: ${version}`);
  lines.push('runtime_mode: COMPLIANCE');
  lines.push('default_profile: aligned');
  lines.push('alternative_profile: drifting');
  lines.push('---');
  lines.push('');

  // ─── Thesis (from geometry.mission) ─────────────────────────────────────
  lines.push('# Thesis');
  lines.push('');
  lines.push(model.geometry.mission);
  if (model.geometry.centerIdentity) {
    lines.push(
      `When all domains are aligned, the system operates as: ${model.geometry.centerIdentity}.`,
    );
  }
  lines.push('');

  // ─── Invariants (from geometry.domains[].values) ────────────────────────
  lines.push('# Invariants');
  lines.push('');

  let invariantIdx = 0;
  for (const domain of model.geometry.domains) {
    for (const value of domain.values) {
      invariantIdx++;
      const invId = `${toSnakeCase(domain.name)}_value_${String(invariantIdx).padStart(2, '0')}`;
      lines.push(
        `- \`${invId}\` — ${value} [${domain.name}] (structural, immutable)`,
      );
    }
  }
  lines.push('');

  // ─── State (from evolution.signals + synthetic alignment_score) ─────────
  lines.push('# State');
  lines.push('');

  // Synthetic alignment_score (primary viability metric)
  lines.push('## alignment_score');
  lines.push('- type: number');
  lines.push('- min: 0');
  lines.push('- max: 100');
  lines.push('- step: 5');
  lines.push('- default: 70');
  lines.push('- label: Alignment Score');
  lines.push(
    '- description: Composite behavioral alignment metric derived from all signals',
  );
  lines.push('');

  // Each signal becomes a state variable
  for (const signal of model.evolution.signals) {
    const signalId = toSnakeCase(signal);
    const signalLabel = titleCase(signal);
    lines.push(`## ${signalId}`);
    lines.push('- type: number');
    lines.push('- min: 0');
    lines.push('- max: 100');
    lines.push('- step: 5');
    lines.push('- default: 70');
    lines.push(`- label: ${signalLabel}`);
    lines.push(`- description: Behavioral signal measuring ${signal.replace(/_/g, ' ')}`);
    lines.push('');
  }

  // ─── Assumptions (aligned vs drifting profiles) ─────────────────────────
  lines.push('# Assumptions');
  lines.push('');
  lines.push('## aligned');
  lines.push('- name: Aligned');
  lines.push('- description: All behavioral signals at healthy levels');
  lines.push('- pressure_level: low');
  lines.push('');
  lines.push('## drifting');
  lines.push('- name: Drifting');
  lines.push('- description: Behavioral signals under pressure with drift risk');
  lines.push('- pressure_level: high');
  lines.push('');

  // ─── Rules (from evolution: drift, aligned, priorities) ─────────────────
  lines.push('# Rules');
  lines.push('');

  let ruleIdx = 0;

  // Drift behaviors → degradation rules
  for (const drift of model.evolution.driftBehaviors) {
    ruleIdx++;
    const ruleId = `rule-${String(ruleIdx).padStart(3, '0')}`;
    const matchedSignal = matchSignal(drift, model.evolution.signals);
    const signalId = toSnakeCase(matchedSignal);

    lines.push(`## ${ruleId}: ${drift} (degradation)`);
    lines.push(`Drift behavior detected: ${drift}`);
    lines.push('');
    lines.push(`When ${signalId} < 50 [state]`);
    lines.push('Then alignment_score *= 0.80');
    lines.push('');
    lines.push(`> trigger: ${signalId} drops below threshold`);
    lines.push(`> rule: Drift behavior weakens alignment`);
    lines.push(`> shift: Behavioral alignment decreases`);
    lines.push(`> effect: Alignment score reduced by 20%`);
    lines.push('');
  }

  // Aligned behaviors → advantage rules
  for (const aligned of model.evolution.alignedBehaviors) {
    ruleIdx++;
    const ruleId = `rule-${String(ruleIdx).padStart(3, '0')}`;
    const matchedSignal = matchSignal(aligned, model.evolution.signals);
    const signalId = toSnakeCase(matchedSignal);

    lines.push(`## ${ruleId}: ${aligned} (advantage)`);
    lines.push(`Aligned behavior reinforced: ${aligned}`);
    lines.push('');
    lines.push(`When ${signalId} >= 70 [state]`);
    lines.push('Then alignment_score *= 1.10');
    lines.push('');
    lines.push(`> trigger: ${signalId} above healthy threshold`);
    lines.push(`> rule: Aligned behavior strengthens system`);
    lines.push(`> shift: Behavioral alignment increases`);
    lines.push(`> effect: Alignment score boosted by 10%`);
    lines.push('');
  }

  // Decision priorities → structural rules with collapse
  for (let i = 0; i < model.evolution.decisionPriorities.length; i++) {
    ruleIdx++;
    const priority = model.evolution.decisionPriorities[i];
    const ruleId = `rule-${String(ruleIdx).padStart(3, '0')}`;

    lines.push(
      `## ${ruleId}: ${priority.preferred} over ${priority.over} (structural)`,
    );
    lines.push(
      `Priority: ${priority.preferred} takes precedence over ${priority.over} in tradeoff situations.`,
    );
    lines.push('');
    lines.push('When alignment_score < 40 [state]');
    lines.push('Then alignment_score *= 0.70');
    lines.push('Collapse: alignment_score < 10');
    lines.push('');
    lines.push(`> trigger: Alignment score critically low`);
    lines.push(
      `> rule: Priority violation — ${priority.preferred} must outweigh ${priority.over}`,
    );
    lines.push(`> shift: System enters structural enforcement`);
    lines.push(`> effect: Alignment sharply reduced; collapse if critical`);
    lines.push('');
  }

  // ─── Gates (5 standard gates on alignment_score) ────────────────────────
  lines.push('# Gates');
  lines.push('');
  lines.push('- STRONG: alignment_score >= 85');
  lines.push('- STABLE: alignment_score >= 65');
  lines.push('- WATCHING: alignment_score >= 45');
  lines.push('- FRAGILE: alignment_score > 30');
  lines.push('- MISALIGNED: alignment_score <= 30');
  lines.push('');

  // ─── Outcomes ───────────────────────────────────────────────────────────
  lines.push('# Outcomes');
  lines.push('');

  // Primary outcome: alignment_score
  lines.push('## alignment_score');
  lines.push('- type: number');
  lines.push('- range: 0-100');
  lines.push('- display: percentage');
  lines.push('- label: Alignment Score');
  lines.push('- primary: true');
  lines.push('');

  // Secondary outcomes: each signal
  for (const signal of model.evolution.signals) {
    const signalId = toSnakeCase(signal);
    const signalLabel = titleCase(signal);
    lines.push(`## ${signalId}`);
    lines.push('- type: number');
    lines.push('- range: 0-100');
    lines.push('- display: percentage');
    lines.push(`- label: ${signalLabel}`);
    lines.push('');
  }

  // ─── Lenses (from overlap effects) ──────────────────────────────────────
  const lensSuggestions = buildLensSuggestions(model);
  if (lensSuggestions.length > 0) {
    lines.push('# Lenses');
    lines.push('- policy: role_default');
    lines.push('');

    for (const lens of lensSuggestions) {
      lines.push(`## ${lens.id}`);
      lines.push(`- tagline: ${lens.tagline}`);
      lines.push(
        `- description: Lens derived from ${lens.derived_from.domainA} and ${lens.derived_from.domainB} interaction, producing ${lens.derived_from.effect}.`,
      );
      lines.push(`- formality: ${lens.tone.formality}`);
      lines.push(`- verbosity: ${lens.tone.verbosity}`);
      lines.push(`- emotion: ${lens.tone.emotion}`);
      lines.push(`- confidence: ${lens.tone.confidence}`);
      lines.push('- tags: behavioral, worldmodel, overlap');
      lines.push('- default_for_roles: all');
      lines.push('- priority: 50');
      lines.push('- stackable: true');
      lines.push('');
      for (const directive of lens.directives) {
        lines.push(`> ${directive.scope}: ${directive.instruction}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ─── Signal Schema Emitter ──────────────────────────────────────────────────

/**
 * Emit the signal schema as a structured JSON-serializable object.
 */
export function emitSignalSchema(model: ParsedWorldModel): SignalSchema {
  const signals: SignalEntry[] = model.evolution.signals.map(signal => ({
    id: toSnakeCase(signal),
    name: titleCase(signal),
    type: 'number' as const,
    default: 70,
  }));

  return {
    model_id: model.frontmatter.model_id,
    signals,
  };
}

// ─── Overlap Map Emitter ────────────────────────────────────────────────────

/**
 * Emit the overlap map as a structured JSON-serializable object.
 */
export function emitOverlapMap(model: ParsedWorldModel): OverlapMap {
  const pairings: OverlapPairing[] = model.geometry.overlapEffects.map(o => ({
    domainA: o.domainA,
    domainB: o.domainB,
    effect: o.effect,
  }));

  // Build matrix view
  const matrix: Record<string, Record<string, string>> = {};
  for (const overlap of model.geometry.overlapEffects) {
    const keyA = toKebabCase(overlap.domainA);
    const keyB = toKebabCase(overlap.domainB);
    if (!matrix[keyA]) matrix[keyA] = {};
    matrix[keyA][keyB] = overlap.effect;
  }

  return {
    model_id: model.frontmatter.model_id,
    pairings,
    matrix,
  };
}

// ─── Contexts Config Emitter ────────────────────────────────────────────────

/**
 * Emit the contextual modifiers as a structured JSON-serializable object.
 */
export function emitContextsConfig(model: ParsedWorldModel): ContextsConfig {
  return {
    model_id: model.frontmatter.model_id,
    authority_layers: model.modifiers.authorityLayers,
    spatial_contexts: model.modifiers.spatialContexts,
    interpretation_rules: model.modifiers.interpretationRules,
  };
}

// ─── Lens Suggestions Emitter ───────────────────────────────────────────────

/**
 * Derive tone from domain characteristics using keyword heuristics.
 */
function deriveTone(domainA: string, domainB: string): {
  formality: string;
  verbosity: string;
  emotion: string;
  confidence: string;
} {
  const combined = `${domainA} ${domainB}`.toLowerCase();

  // Formality
  let formality = 'neutral';
  if (/strateg|technic|analytic|research|engineer/.test(combined)) {
    formality = 'professional';
  } else if (/narrat|story|communi|creative/.test(combined)) {
    formality = 'casual';
  }

  // Verbosity
  let verbosity = 'balanced';
  if (/foresight|scenario|plan|design/.test(combined)) {
    verbosity = 'detailed';
  } else if (/prosper|negotiat|stakeholder/.test(combined)) {
    verbosity = 'concise';
  }

  // Emotion
  let emotion = 'neutral';
  if (/empath|emoti|care|safe|trust/.test(combined)) {
    emotion = 'warm';
  } else if (/analytic|system|data/.test(combined)) {
    emotion = 'clinical';
  }

  // Confidence
  let confidence = 'balanced';
  if (/lead|command|decis|strateg/.test(combined)) {
    confidence = 'authoritative';
  } else if (/explor|experiment|creat/.test(combined)) {
    confidence = 'exploratory';
  }

  return { formality, verbosity, emotion, confidence };
}

/**
 * Build lens suggestions from overlap effects.
 * Each overlap produces one lens embodying that emergent state.
 */
function buildLensSuggestions(model: ParsedWorldModel): LensSuggestion[] {
  const lenses: LensSuggestion[] = [];
  const domainMap = new Map(model.geometry.domains.map(d => [d.name.toLowerCase(), d]));

  for (const overlap of model.geometry.overlapEffects) {
    const lensId = toKebabCase(overlap.effect);
    const tone = deriveTone(overlap.domainA, overlap.domainB);

    const domainAData = domainMap.get(overlap.domainA.toLowerCase());
    const domainBData = domainMap.get(overlap.domainB.toLowerCase());

    const directives: LensDirectiveEntry[] = [];

    // response_framing from first domain's skills
    if (domainAData && domainAData.skills.length > 0) {
      directives.push({
        scope: 'response_framing',
        instruction: `Approach through the lens of ${domainAData.skills.join(', ').toLowerCase()}.`,
      });
    }

    // behavior_shaping from second domain's values
    if (domainBData && domainBData.values.length > 0) {
      directives.push({
        scope: 'behavior_shaping',
        instruction: `Maintain ${domainBData.values.join(', ').toLowerCase()} in all responses.`,
      });
    }

    // value_emphasis from the emergent state
    directives.push({
      scope: 'value_emphasis',
      instruction: `Emphasize ${overlap.effect.toLowerCase()} as the emergent state of aligned behavior.`,
    });

    lenses.push({
      id: lensId,
      name: titleCase(overlap.effect),
      tagline: `${overlap.effect} through ${overlap.domainA} and ${overlap.domainB}.`,
      derived_from: {
        domainA: overlap.domainA,
        domainB: overlap.domainB,
        effect: overlap.effect,
      },
      tone,
      directives,
    });
  }

  return lenses;
}

/**
 * Emit lens suggestions as a structured JSON-serializable array.
 */
export function emitLensSuggestions(model: ParsedWorldModel): LensSuggestion[] {
  return buildLensSuggestions(model);
}

// ─── Full Compilation ───────────────────────────────────────────────────────

/**
 * Compile a ParsedWorldModel into all output artifacts.
 *
 * Deterministic. Same input → same output. No LLM calls.
 */
export function compileWorldModel(model: ParsedWorldModel): WorldModelOutput {
  return {
    worldMarkdown: emitWorldMarkdown(model),
    signalSchema: emitSignalSchema(model),
    overlapMap: emitOverlapMap(model),
    contextsConfig: emitContextsConfig(model),
    lensSuggestions: emitLensSuggestions(model),
  };
}
