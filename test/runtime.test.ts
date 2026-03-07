/**
 * Runtime Tests
 *
 * Tests the governed runtime components:
 *   1. Session manager — evaluate, execute, track progress
 *   2. Model adapter — config resolution, provider presets
 *   3. MCP server — tool governance, introspection tools
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../src/runtime/session';
import { McpGovernanceServer } from '../src/runtime/mcp-server';
import { resolveProvider, PROVIDERS, ModelAdapter } from '../src/runtime/model-adapter';
import { parsePlanMarkdown } from '../src/engine/plan-parser';
import type { PlanDefinition } from '../src/contracts/plan-contract';
import type { WorldDefinition } from '../src/types';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeMinimalWorld(): WorldDefinition {
  return {
    world: {
      world_id: 'test_world',
      name: 'Test World',
      thesis: 'A test world for runtime',
      version: '1.0.0',
      runtime_mode: 'COMPLIANCE',
      default_assumption_profile: 'default',
      default_alternative_profile: 'default',
      modules: [],
      players: { thinking_space: true, experience_space: false, action_space: true },
    },
    invariants: [],
    assumptions: { profiles: {}, definitions: {} },
    state_schema: { variables: [], presets: {} },
    rules: [],
    gates: { viability: { thresholds: {}, gate_type: 'simple' } },
    outcomes: { computed_outcomes: [] },
  } as unknown as WorldDefinition;
}

const PLAN_MD = `
---
plan_id: test_plan
objective: Test the runtime
sequential: false
---

# Steps
- Write blog post [tag: content]
- Publish release [tag: deploy]
`;

// ─── Session Manager ────────────────────────────────────────────────────────

describe('Session Manager', () => {
  let world: WorldDefinition;
  let plan: PlanDefinition;

  beforeEach(() => {
    world = makeMinimalWorld();
    const result = parsePlanMarkdown(PLAN_MD);
    plan = result.plan!;
  });

  it('initializes with world', async () => {
    const session = new SessionManager({ world });
    const state = await session.start();
    expect(state.active).toBe(true);
    expect(state.world.world.name).toBe('Test World');
  });

  it('initializes with world + plan', async () => {
    const session = new SessionManager({ world, plan });
    const state = await session.start();
    expect(state.plan).toBeDefined();
    expect(state.progress?.total).toBe(2);
    expect(state.progress?.completed).toBe(0);
  });

  it('evaluates events and tracks stats', async () => {
    const session = new SessionManager({ world, plan });
    await session.start();

    // On-plan action → ALLOW
    const verdict1 = session.evaluate({ intent: 'write blog post' });
    expect(verdict1.status).toBe('ALLOW');

    // Off-plan action → BLOCK
    const verdict2 = session.evaluate({ intent: 'launch advertising campaign' });
    expect(verdict2.status).toBe('BLOCK');

    const state = session.getState();
    expect(state.actionsEvaluated).toBe(2);
    expect(state.actionsAllowed).toBe(1);
    expect(state.actionsBlocked).toBe(1);
  });

  it('executes tool calls with governance', async () => {
    const executedTools: string[] = [];

    const session = new SessionManager({
      world,
      plan,
      toolExecutor: async (name, args) => {
        executedTools.push(name);
        return `executed ${name}`;
      },
    });
    await session.start();

    const result = await session.executeToolCall({
      id: 'call_1',
      type: 'function',
      function: {
        name: 'write blog post',
        arguments: '{}',
      },
    });

    expect(result.allowed).toBe(true);
    expect(result.result).toBe('executed write blog post');
    expect(executedTools).toContain('write blog post');
  });

  it('blocks off-plan tool calls', async () => {
    const session = new SessionManager({ world, plan });
    await session.start();

    const result = await session.executeToolCall({
      id: 'call_2',
      type: 'function',
      function: {
        name: 'launch advertising campaign',
        arguments: '{}',
      },
    });

    expect(result.allowed).toBe(false);
    expect(result.verdict.status).toBe('BLOCK');
  });

  it('tracks plan progress on allowed actions', async () => {
    const progressUpdates: any[] = [];
    const session = new SessionManager({
      world,
      plan,
      onPlanProgress: (p) => progressUpdates.push(p),
    });
    await session.start();

    await session.executeToolCall({
      id: 'call_3',
      type: 'function',
      function: {
        name: 'write blog post',
        arguments: '{}',
      },
    });

    expect(progressUpdates.length).toBeGreaterThanOrEqual(1);
    const state = session.getState();
    expect(state.progress?.completed).toBe(1);
  });

  it('fires onPlanComplete when all steps done', async () => {
    let completed = false;
    const session = new SessionManager({
      world,
      plan: { ...plan, steps: [plan.steps[0]] },
      onPlanComplete: () => { completed = true; },
      onPlanProgress: () => {},
    });
    await session.start();

    await session.executeToolCall({
      id: 'call_4',
      type: 'function',
      function: {
        name: 'write blog post',
        arguments: '{}',
      },
    });

    expect(completed).toBe(true);
  });

  it('fires onVerdict callback', async () => {
    const verdicts: any[] = [];
    const session = new SessionManager({
      world,
      plan,
      onVerdict: (v) => verdicts.push(v),
    });
    await session.start();

    session.evaluate({ intent: 'write blog post' });
    expect(verdicts.length).toBe(1);
  });

  it('stops session', async () => {
    const session = new SessionManager({ world });
    await session.start();

    const finalState = session.stop();
    expect(finalState.active).toBe(false);
  });

  it('works without plan (world-only governance)', async () => {
    const session = new SessionManager({ world });
    await session.start();

    const verdict = session.evaluate({ intent: 'do anything' });
    expect(verdict.status).toBe('ALLOW');
  });
});

// ─── Model Adapter ──────────────────────────────────────────────────────────

describe('Model Adapter', () => {
  it('has provider presets', () => {
    expect(PROVIDERS.openai).toBeDefined();
    expect(PROVIDERS.anthropic).toBeDefined();
    expect(PROVIDERS.ollama).toBeDefined();
  });

  it('resolves openai provider', () => {
    const config = resolveProvider('openai', { apiKey: 'test-key' });
    expect(config.baseUrl).toBe('https://api.openai.com/v1');
    expect(config.model).toBe('gpt-4o');
    expect(config.apiKey).toBe('test-key');
  });

  it('resolves ollama provider without API key', () => {
    const config = resolveProvider('ollama');
    expect(config.baseUrl).toBe('http://localhost:11434/v1');
    expect(config.model).toBe('llama3');
  });

  it('throws on unknown provider', () => {
    expect(() => resolveProvider('nonexistent')).toThrow('Unknown provider');
  });

  it('allows model override', () => {
    const config = resolveProvider('openai', { apiKey: 'key', model: 'gpt-4o-mini' });
    expect(config.model).toBe('gpt-4o-mini');
  });

  it('creates ModelAdapter instance', () => {
    const adapter = new ModelAdapter({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test',
      model: 'gpt-4o',
    });
    expect(adapter.messageCount).toBe(1); // system prompt
  });
});

// ─── MCP Server ─────────────────────────────────────────────────────────────

describe('MCP Governance Server', () => {
  it('creates server with config', () => {
    const server = new McpGovernanceServer({
      world: makeMinimalWorld(),
    });
    expect(server).toBeDefined();
  });

  it('creates server with plan', () => {
    const result = parsePlanMarkdown(PLAN_MD);
    const server = new McpGovernanceServer({
      world: makeMinimalWorld(),
      plan: result.plan!,
    });
    expect(server).toBeDefined();
  });

  it('can disable tool categories', () => {
    const server = new McpGovernanceServer({
      world: makeMinimalWorld(),
      enableShell: false,
      enableFiles: false,
      enableHttp: false,
    });
    expect(server).toBeDefined();
  });
});

// ─── Index Exports ──────────────────────────────────────────────────────────

describe('Runtime Index Exports', () => {
  it('exports runtime classes from main entry', async () => {
    const mod = await import('../src/index');
    expect(mod.SessionManager).toBeDefined();
    expect(mod.ModelAdapter).toBeDefined();
    expect(mod.McpGovernanceServer).toBeDefined();
    expect(mod.resolveProvider).toBeDefined();
    expect(mod.PROVIDERS).toBeDefined();
    expect(mod.runPipeMode).toBeDefined();
  });
});
