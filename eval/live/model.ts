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

export interface ModelToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** Provider-specific fields returned with the call, echoed back unchanged when the call is replayed; never read by the harness. */
  extra?: Record<string, unknown>;
}
export interface ModelMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; toolCalls?: ModelToolCall[]; toolCallId?: string }
export interface ToolSpec { name: string; description: string; parameters: Record<string, unknown> }
export interface Usage { promptTokens: number; completionTokens: number }
/** `finishReason` is the endpoint's own word for why the reply ended (`stop`, `tool_calls`, `length`, …); recorded, never interpreted beyond `length` = cut off by the completion budget. */
export interface ModelReply { toolCalls: ModelToolCall[]; text?: string; usage?: Usage; finishReason?: string }

/** The completion budget sent as `max_tokens` unless configured; a model whose reasoning counts against it needs room before its first tool call. */
export const DEFAULT_MAX_TOKENS = 8192;

/** Hooks the arm passes per call: `beforeAttempt` runs before every attempt (retries included) and returns a reason to stop, or null. */
export interface ReplyHooks { beforeAttempt?: () => string | null }

export interface Model {
  readonly name: string;
  reply(messages: ModelMessage[], tools: ToolSpec[], hooks?: ReplyHooks): Promise<ModelReply>;
}

/** A model call that failed for good: after the retries, or on a status that is not retried. Carries no key material. */
export class ModelCallError extends Error {
  constructor(message: string, readonly status?: number, readonly attempts = 1) { super(message); this.name = 'ModelCallError'; }
}

export const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
export const BACKOFF_MS = [1000, 2000, 4000, 8000];

/** Retry-After as milliseconds: seconds, or an HTTP date; undefined when absent or unreadable. */
export function retryAfterMs(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const s = Number(header);
  if (Number.isFinite(s) && s >= 0) return s * 1000;
  const t = Date.parse(header);
  return Number.isFinite(t) ? Math.max(0, t - now) : undefined;
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
  /** Sent only when given: some providers reject any non-default value, and some reject a request that sets both temperature and top_p (top_p is never sent). */
  temperature?: number;
  fetchImpl?: typeof fetch;
  /** Injectable for tests; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
  /** Retries after a 429, 500, 502, 503, 504 or a network error (default 4, backing off 1s, 2s, 4s, 8s or Retry-After). */
  maxRetries?: number;
}

/**
 * An OpenAI-compatible chat-completions client over fetch. The key is sent
 * only as the bearer token; it is never logged, returned or put in an error.
 * A 429, 500, 502, 503, 504 or a network error is retried with backoff (or
 * Retry-After), four times by default; every attempt first runs the hook the
 * arm supplies (the spend cap's pre-check), and a failed attempt settles no
 * usage. After the last retry the error is thrown as a ModelCallError.
 */
export function httpModel(options: HttpOptions): ModelFactory {
  const f = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(res => setTimeout(res, ms)));
  const maxRetries = options.maxRetries ?? BACKOFF_MS.length;
  return () => ({
    name: options.model,
    async reply(messages, tools, hooks) {
      const body = {
        model: options.model,
        messages: messages.map(m => m.role === 'assistant' && m.toolCalls?.length
          ? { role: 'assistant', content: m.content || null, tool_calls: m.toolCalls.map(t => ({ id: t.id, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.args) }, ...(t.extra ? { extra_content: t.extra } : {}) })) }
          : m.role === 'tool' ? { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
          : { role: m.role, content: m.content }),
        tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
        tool_choice: 'auto',
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      };
      const url = `${options.baseUrl.replace(/\/$/, '')}/chat/completions`;
      const text = JSON.stringify(body);
      let res: Response | undefined;
      for (let attempt = 0; ; attempt++) {
        const stop = hooks?.beforeAttempt?.();
        if (stop) throw new ModelCallError(`stopped before the call: ${stop}`, undefined, attempt + 1);
        let failure: { status?: number; message: string } | null = null;
        try {
          res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` }, body: text });
          if (res.ok) break;
          failure = { status: res.status, message: `model endpoint ${res.status}: ${(await res.text()).slice(0, 300)}` };
          if (!RETRY_STATUSES.has(res.status)) throw new ModelCallError(failure.message, res.status, attempt + 1);
        } catch (e) {
          if (e instanceof ModelCallError) throw e;
          failure = { message: `model endpoint unreachable: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300) };
        }
        if (attempt >= maxRetries) throw new ModelCallError(`${failure.message} (after ${attempt + 1} attempts)`, failure.status, attempt + 1);
        await sleep(retryAfterMs(res?.headers?.get?.('retry-after') ?? null) ?? BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]);
        res = undefined;
      }
      const json = await res!.json() as { choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string }; extra_content?: Record<string, unknown> }> }; finish_reason?: string | null }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const msg = json.choices?.[0]?.message;
      const finishReason = typeof json.choices?.[0]?.finish_reason === 'string' ? json.choices[0].finish_reason : undefined;
      const toolCalls: ModelToolCall[] = (msg?.tool_calls ?? []).map((t, i) => {
        let args: unknown = {};
        try { args = JSON.parse(t.function?.arguments || '{}'); } catch { args = { __unparsable: t.function?.arguments ?? '' }; }
        const extra = t.extra_content && typeof t.extra_content === 'object' ? t.extra_content : undefined;   // opaque; kept with this call, by position, and echoed back as received
        return { id: t.id ?? `t-${i}`, name: t.function?.name ?? '', args: (args && typeof args === 'object' && !Array.isArray(args) ? args : { __not_an_object: args }) as Record<string, unknown>, ...(extra ? { extra } : {}) };
      });
      return {
        toolCalls,
        ...(msg?.content ? { text: msg.content } : {}),
        ...(finishReason !== undefined ? { finishReason } : {}),
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
