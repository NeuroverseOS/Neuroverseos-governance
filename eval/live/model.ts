/**
 * The model behind the agent, provider-agnostic: messages in, tool calls out.
 *
 *   scriptedModel(...)   deterministic stand-in for tests and dry runs: does the
 *                        task script, and follows the planted attack when told to.
 *   httpModel(...)       an OpenAI-compatible chat-completions endpoint over fetch
 *                        (base URL, model and key from the environment). No SDK.
 *
 * A Model never sees the world directly: the arm feeds it messages and tool
 * results and executes (or refuses) what it asks for.
 */

import type { Attack } from './attacks';
import type { ScriptedCall, Task } from './task';

export interface ModelToolCall { id: string; name: string; args: Record<string, unknown> }
export interface ModelMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; toolCalls?: ModelToolCall[]; toolCallId?: string }
export interface ToolSpec { name: string; description: string; parameters: Record<string, unknown> }
export interface Usage { promptTokens: number; completionTokens: number }
export interface ModelReply { toolCalls: ModelToolCall[]; text?: string; usage?: Usage }

export interface Model {
  readonly name: string;
  reply(messages: ModelMessage[], tools: ToolSpec[]): Promise<ModelReply>;
}

/** Per (task, attack, arm) a fresh model instance; the scripted one needs to know the script, the http one does not. */
export interface RunContext { task: Task; attack: Attack; phaseId: string; arm: 'gated' | 'ungated' }
export type ModelFactory = (ctx: RunContext) => Model;

/** The meta-tool through which the agent delegates a call to its read-only subagent. */
export const DELEGATE_TOOL = 'delegate';

export interface ScriptedOptions {
  /** Follow the planted attack (emit its calls) or only do the task. */
  follow: boolean;
  /** Report this usage per reply, so the spend cap can be exercised without a network. */
  usagePerTurn?: Usage;
}

/** The deterministic stand-in: one tool call per reply, in script order, then done. */
export function scriptedModel(options: ScriptedOptions): ModelFactory {
  return ({ task, attack, phaseId }) => {
    const phase = task.phases.find(p => p.id === phaseId);
    if (!phase) throw new Error(`scripted model: unknown phase ${phaseId}`);
    const planted = options.follow && attack.scripted && attack.scripted.phase === phaseId ? attack.scripted : null;
    const calls: ScriptedCall[] = planted ? (planted.insertAt === 'before' ? [...planted.calls, ...phase.script] : [...phase.script, ...planted.calls]) : [...phase.script];
    let i = 0;
    return {
      name: 'scripted',
      async reply() {
        const usage = options.usagePerTurn ? { ...options.usagePerTurn } : undefined;
        if (i >= calls.length) return { toolCalls: [], text: 'done', ...(usage ? { usage } : {}) };
        const c = calls[i++];
        const tc: ModelToolCall = c.as === 'subagent'
          ? { id: `s-${i}`, name: DELEGATE_TOOL, args: { to: task.subagent.id, tool: c.tool, args: c.args } }
          : { id: `s-${i}`, name: c.tool, args: c.args };
        return { toolCalls: [tc], ...(usage ? { usage } : {}) };
      },
    };
  };
}

export interface HttpOptions {
  baseUrl: string;
  model: string;
  apiKey: string;
  maxTokens?: number;
  temperature?: number;
  fetchImpl?: typeof fetch;
}

/** An OpenAI-compatible chat-completions client over fetch. The key is sent only as the bearer token; it is never logged or returned. */
export function httpModel(options: HttpOptions): ModelFactory {
  const f = options.fetchImpl ?? fetch;
  return () => ({
    name: options.model,
    async reply(messages, tools) {
      const body = {
        model: options.model,
        messages: messages.map(m => m.role === 'assistant' && m.toolCalls?.length
          ? { role: 'assistant', content: m.content || null, tool_calls: m.toolCalls.map(t => ({ id: t.id, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.args) } })) }
          : m.role === 'tool' ? { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
          : { role: m.role, content: m.content }),
        tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
        tool_choice: 'auto',
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0,
      };
      const res = await f(`${options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`model endpoint ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json = await res.json() as { choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const msg = json.choices?.[0]?.message;
      const toolCalls: ModelToolCall[] = (msg?.tool_calls ?? []).map((t, i) => {
        let args: unknown = {};
        try { args = JSON.parse(t.function?.arguments || '{}'); } catch { args = { __unparsable: t.function?.arguments ?? '' }; }
        return { id: t.id ?? `t-${i}`, name: t.function?.name ?? '', args: (args && typeof args === 'object' && !Array.isArray(args) ? args : { __not_an_object: args }) as Record<string, unknown> };
      });
      return {
        toolCalls,
        ...(msg?.content ? { text: msg.content } : {}),
        ...(json.usage ? { usage: { promptTokens: json.usage.prompt_tokens ?? 0, completionTokens: json.usage.completion_tokens ?? 0 } } : {}),
      };
    },
  });
}

/** A rough prompt-size estimate for the cap's pre-call check (four characters per token). */
export function estimateTokens(messages: ModelMessage[], tools: ToolSpec[]): number {
  const text = messages.map(m => m.content + (m.toolCalls ? JSON.stringify(m.toolCalls) : '')).join('\n') + JSON.stringify(tools);
  return Math.ceil(text.length / 4);
}
