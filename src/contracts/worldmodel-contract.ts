/**
 * WorldModel Contract — .worldmodel.md → Behavioral World Model Types
 *
 * Defines the three-layer intermediate representation produced by the parser
 * and consumed by the compiler.
 *
 * Three Layers:
 *   1. Core Model Geometry  — mission, domains (skills + values), overlaps, center identity
 *   2. Contextual Modifiers — authority, spatial contexts, interpretation rules
 *   3. Evolution Layer      — aligned/drift behaviors, signals, priorities, evolution conditions
 *
 * Input:  .worldmodel.md file (structured markdown)
 * Output: .nv-world.md + signals.json + overlaps.json + contexts.json + lenses.json
 */

// ─── Frontmatter ────────────────────────────────────────────────────────────

export interface WorldModelFrontmatter {
  /** Unique identifier derived from name (kebab-case) */
  model_id: string;

  /** Human-readable model name */
  name: string;

  /** Semantic version */
  version: string;
}

// ─── Layer 1: Core Model Geometry ───────────────────────────────────────────

/**
 * A domain is a mode of operating that carries both skills and values.
 * Domains are NOT personality traits — they are capability environments.
 */
export interface ParsedDomain {
  /** kebab-case identifier derived from name */
  id: string;

  /** Human-readable domain name */
  name: string;

  /** Skills: capabilities within this domain */
  skills: string[];

  /** Values: constraints governing skills in this domain */
  values: string[];

  /** Line number in source for error reporting */
  line: number;
}

/**
 * An overlap effect describes what emerges when two domains interact well.
 * These are interpretive states, not enforced rules.
 */
export interface ParsedOverlap {
  /** First domain name */
  domainA: string;

  /** Second domain name */
  domainB: string;

  /** Emergent state name (e.g., "Inspiration", "Trust") */
  effect: string;

  /** Line number in source */
  line: number;
}

/**
 * The structural heart of the behavioral model.
 * Defines what the system is trying to become.
 */
export interface CoreModelGeometry {
  /** The core aim — not a slogan */
  mission: string;

  /** Major operating domains, each carrying skills and values */
  domains: ParsedDomain[];

  /** Emergent states arising between domain pairings */
  overlapEffects: ParsedOverlap[];

  /** The identity that emerges when all domains are aligned */
  centerIdentity: string;
}

// ─── Layer 2: Contextual Modifiers ──────────────────────────────────────────

/**
 * Defines how behavior is interpreted differently depending on context.
 * These do NOT define truth — they define how meaning changes depending on
 * who is acting, where behavior occurs, and what phase the system is in.
 */
export interface ContextualModifiers {
  /** Who is acting? (e.g., founder, maintainer, contributor, agent) */
  authorityLayers: string[];

  /** Where is behavior happening? (e.g., planning, execution, deployment) */
  spatialContexts: string[];

  /** How does context change meaning? Free-form interpretation rules */
  interpretationRules: string[];
}

// ─── Layer 3: Evolution Layer ───────────────────────────────────────────────

/**
 * A decision priority defining tradeoff resolution.
 * Format: preferred > over
 */
export interface ParsedPriority {
  /** What should win in the tradeoff */
  preferred: string;

  /** What it wins over */
  over: string;

  /** Line number in source */
  line: number;
}

/**
 * The executable temporal layer.
 * Defines observable behaviors, signals, and adaptation conditions.
 */
export interface EvolutionLayer {
  /** What does success look like in action? */
  alignedBehaviors: string[];

  /** What does misalignment look like? */
  driftBehaviors: string[];

  /** Observable metrics (snake_case identifiers) */
  signals: string[];

  /** Tradeoff resolution rules */
  decisionPriorities: ParsedPriority[];

  /** When should the model adapt? */
  evolutionConditions: string[];
}

// ─── Full Parsed Model ──────────────────────────────────────────────────────

/**
 * The complete three-layer behavioral world model.
 *
 * Layer 1 (geometry) defines the model.
 * Layer 2 (modifiers) shapes interpretation.
 * Layer 3 (evolution) drives executable governance.
 */
export interface ParsedWorldModel {
  frontmatter: WorldModelFrontmatter;
  geometry: CoreModelGeometry;
  modifiers: ContextualModifiers;
  evolution: EvolutionLayer;
}

// ─── Compiler Output Types ──────────────────────────────────────────────────

/**
 * Signal schema emitted as signals.json.
 */
export interface SignalSchema {
  model_id: string;
  signals: SignalEntry[];
}

export interface SignalEntry {
  id: string;
  name: string;
  type: 'number';
  default: number;
}

/**
 * Overlap map emitted as overlaps.json.
 * Includes both a flat pairing list and a matrix view.
 */
export interface OverlapMap {
  model_id: string;
  pairings: OverlapPairing[];
  /** domainA id → domainB id → emergent state name */
  matrix: Record<string, Record<string, string>>;
}

export interface OverlapPairing {
  domainA: string;
  domainB: string;
  effect: string;
}

/**
 * Contextual modifiers emitted as contexts.json.
 */
export interface ContextsConfig {
  model_id: string;
  authority_layers: string[];
  spatial_contexts: string[];
  interpretation_rules: string[];
}

/**
 * A lens suggestion derived from overlap effects.
 */
export interface LensSuggestion {
  id: string;
  name: string;
  tagline: string;
  derived_from: {
    domainA: string;
    domainB: string;
    effect: string;
  };
  tone: {
    formality: string;
    verbosity: string;
    emotion: string;
    confidence: string;
  };
  directives: LensDirectiveEntry[];
}

export interface LensDirectiveEntry {
  scope: string;
  instruction: string;
}

/**
 * Complete compiler output bundle.
 */
export interface WorldModelOutput {
  /** Complete .nv-world.md content string */
  worldMarkdown: string;

  /** Signal schema for signals.json */
  signalSchema: SignalSchema;

  /** Overlap map for overlaps.json */
  overlapMap: OverlapMap;

  /** Context config for contexts.json */
  contextsConfig: ContextsConfig;

  /** Lens suggestions for lenses.json */
  lensSuggestions: LensSuggestion[];
}

// ─── Validation Types ───────────────────────────────────────────────────────

export type WorldModelIssueSeverity = 'error' | 'warning' | 'info';

/**
 * A single issue found during parsing or validation.
 */
export interface WorldModelIssue {
  /** Line number in source (1-based, 0 if unknown) */
  line: number;

  /** Which section the issue was found in */
  section: string;

  /** Human-readable message (designed to teach the method) */
  message: string;

  /** Severity level */
  severity: WorldModelIssueSeverity;
}

/**
 * Result of parsing a .worldmodel.md file.
 */
export interface WorldModelParseResult {
  /** The parsed model, or null if parsing failed */
  model: ParsedWorldModel | null;

  /** All issues encountered during parsing */
  issues: WorldModelIssue[];
}

// ─── Exit Codes ─────────────────────────────────────────────────────────────

export const WORLDMODEL_EXIT_CODES = {
  SUCCESS: 0,
  FAIL: 1,
  ERROR: 3,
} as const;

export type WorldModelExitCode =
  (typeof WORLDMODEL_EXIT_CODES)[keyof typeof WORLDMODEL_EXIT_CODES];
