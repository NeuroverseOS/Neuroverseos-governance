// Bevia — CLI/Engine Integration Layer
//
// Maps NeuroverseOS engine functions to Bevia operations.
// We use the PROGRAMMATIC API, not CLI subprocess calls.
// But each function documents which CLI command it replaces.
//
// This is how Bevia eats its own dogfood: every governance operation
// uses the same engine functions that power the CLI.

// ─── Engine Imports ──────────────────────────────────────────────────────────
// These are the same functions invoked by `neuroverse <command>`

import { evaluateGuard } from '../../engine/guard-engine.js';
import { parseWorldMarkdown } from '../../engine/bootstrap-parser.js';
import { emitWorldDefinition } from '../../engine/bootstrap-emitter.js';
import { validateWorld } from '../../engine/validate-engine.js';
import { simulateWorld, renderSimulateText } from '../../engine/simulate-engine.js';
import { improveWorld, renderImproveText } from '../../engine/improve-engine.js';
import { explainWorld, renderExplainText } from '../../engine/explain-engine.js';
import { generateImpactReport, renderImpactReport } from '../../engine/impact-report.js';
import { generateDecisionFlow, renderDecisionFlow } from '../../engine/decision-flow-engine.js';
import type { WorldDefinition } from '../../types.js';
import type { GuardEvent, GuardVerdict, GuardEngineOptions } from '../../contracts/guard-contract.js';

// ─── bootstrap ───────────────────────────────────────────────────────────────
// CLI: neuroverse bootstrap --input world.nv-world.md --output ./world/ [--validate]
// Used by: Align (compile user strategy docs into world files)
//          Platform (compile bevia world files at cold start)

export function bootstrap(markdown: string): {
  world: WorldDefinition | null;
  issues: { message: string; severity?: string }[];
} {
  const parsed = parseWorldMarkdown(markdown);

  if (!parsed.world) {
    return {
      world: null,
      issues: parsed.issues.map(i => ({ message: i.message, severity: (i as any).severity })),
    };
  }

  const emitted = emitWorldDefinition(parsed.world);
  return {
    world: emitted.world,
    issues: [...parsed.issues, ...emitted.issues].map(i => ({ message: i.message, severity: (i as any).severity })),
  };
}

// ─── validate ────────────────────────────────────────────────────────────────
// CLI: neuroverse validate --world <dir> [--format full|summary|findings]
// Used by: Align (validate user-generated strategy world files after ingestion)
//          Platform (CI/CD pre-deploy validation of all Bevia world files)

export function validate(world: WorldDefinition): {
  valid: boolean;
  findings: { message: string; severity: string }[];
  summary: string;
} {
  const result = validateWorld(world);
  const findings = (result as any).findings || [];
  const errors = findings.filter((f: any) => f.severity === 'error');

  return {
    valid: errors.length === 0,
    findings,
    summary: errors.length === 0
      ? `World is valid. ${findings.length} finding(s).`
      : `World has ${errors.length} error(s). ${findings.length} total finding(s).`,
  };
}

// ─── guard ───────────────────────────────────────────────────────────────────
// CLI: neuroverse guard --world <dir> [--trace] [--level basic|standard|strict]
// Used by: EVERY edge function (evaluateAction calls this)
//          This is the core runtime governance evaluation.

export function guard(
  event: GuardEvent,
  world: WorldDefinition,
  options?: GuardEngineOptions,
): GuardVerdict {
  return evaluateGuard(event, world, options || { trace: true, level: 'standard' });
}

// ─── simulate ────────────────────────────────────────────────────────────────
// CLI: neuroverse simulate <world> [--steps N] [--set key=value] [--profile name]
// Used by: Align (strategy impact simulation — "what happens if you adopt this?")
//          Replay (behavioral trajectory projection — shadow engine)

export function simulate(
  world: WorldDefinition,
  options?: {
    steps?: number;
    stateOverrides?: Record<string, unknown>;
    profile?: string;
  },
) {
  return simulateWorld(world, {
    steps: Math.min(options?.steps || 5, 50),
    stateOverrides: options?.stateOverrides,
    profile: options?.profile,
  });
}

// ─── explain ─────────────────────────────────────────────────────────────────
// CLI: neuroverse explain <world> [--json]
// Used by: Align (show user their compiled strategy rules in plain language)
//          Dashboard (explain what governance is active)

export function explain(world: WorldDefinition): {
  text: string;
  data: unknown;
} {
  const result = explainWorld(world);
  return {
    text: renderExplainText(result),
    data: result,
  };
}

// ─── improve ─────────────────────────────────────────────────────────────────
// CLI: neuroverse improve <world> [--json]
// Used by: Align (suggest missing guards/rules after strategy ingestion)
//          Platform (quarterly governance review)

export function improve(world: WorldDefinition): {
  text: string;
  data: unknown;
} {
  const result = improveWorld(world);
  return {
    text: renderImproveText(result),
    data: result,
  };
}

// ─── impact ──────────────────────────────────────────────────────────────────
// CLI: neuroverse impact [--log <path>] [--json]
// Used by: Dashboard (governance effectiveness report)
//          Reports (counterfactual: "what if governance wasn't active?")

export function impact(auditEvents: unknown[]): {
  text: string;
  data: unknown;
} {
  const result = generateImpactReport(auditEvents as any);
  return {
    text: renderImpactReport(result),
    data: result,
  };
}

// ─── decision-flow ───────────────────────────────────────────────────────────
// CLI: neuroverse decision-flow [--log <path>] [--json]
// Used by: Dashboard (visualize which guards fire most)
//          Analytics (intent → rule → outcome clustering)

export function decisionFlow(auditEvents: unknown[]): {
  text: string;
  data: unknown;
} {
  const result = generateDecisionFlow(auditEvents as any);
  return {
    text: renderDecisionFlow(result),
    data: result,
  };
}

// ─── CLI → Bevia Mapping (documentation) ─────────────────────────────────────
// Every CLI command and how Bevia uses it.

export const CLI_MAPPING = {
  // BUILD PHASE
  'neuroverse bootstrap': 'Used by: compileWorld() in governance.ts — compiles .nv-world.md at cold start',
  'neuroverse validate': 'Used by: align-ingest — validates user strategy worlds after generation',
  'neuroverse derive': 'Used by: align-ingest — AI-assisted world synthesis from uploaded docs',
  'neuroverse init': 'Available for: users who want to create custom governance from scratch',
  'neuroverse configure-world': 'Replaced by: Align conflict detection + resolution UX (no wizard)',
  'neuroverse infer-world': 'Used by: align-ingest — scans uploaded docs to infer governance rules',
  'neuroverse add': 'Available for: programmatic rule addition (future: user adds custom rules)',

  // RUNTIME
  'neuroverse guard': 'Used by: evaluateAction() in EVERY edge function — runtime governance',
  'neuroverse simulate': 'Used by: Align simulation + Replay shadow projection',
  'neuroverse explain': 'Used by: Align strategy dashboard — shows rules in plain language',
  'neuroverse improve': 'Used by: Align post-ingestion — suggests missing rules',

  // ANALYSIS
  'neuroverse impact': 'Used by: Reports — "what would have happened without governance?"',
  'neuroverse decision-flow': 'Used by: Dashboard audit log — intent/rule/outcome visualization',
  'neuroverse trace': 'Used by: Dashboard audit log tab — read audit events',

  // TESTING
  'neuroverse test --fuzz': 'Used by: CI/CD — fuzz guard evaluation before deploy',
  'neuroverse redteam': 'Used by: Security audit — adversarial containment testing',

  // LENSES
  'neuroverse lens compile': 'Used by: Perspectives tool — compiles philosophy lenses',
  'neuroverse lens preview': 'Available for: testing lens output before deploy',

  // NOT USED
  'neuroverse demo': 'Not used by Bevia — standalone governance demo',
  'neuroverse playground': 'Not used by Bevia — standalone web demo',
  'neuroverse equity-penalties': 'Not used by Bevia — standalone trading simulation',
  'neuroverse run': 'Not used by Bevia — standalone governed runtime',
  'neuroverse mcp': 'Not used by Bevia — MCP server for IDE integration',
} as const;
