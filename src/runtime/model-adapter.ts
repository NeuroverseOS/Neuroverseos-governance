/**
 * Model Adapter — Minimal LLM Connection Layer
 *
 * Connects to any OpenAI-compatible API (OpenAI, Anthropic, Ollama, etc.)
 * using Node's built-in fetch. Zero dependencies.
 *
 * The adapter does exactly two things:
 *   1. Send messages to the model
 *   2. Receive responses (text + tool calls)
 *
 * No orchestration, no memory management, no retries.
 * The session manager handles all of that.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ModelConfig {
  /** API base URL (e.g., "https://api.openai.com/v1") */
  baseUrl: string;

  /** API key for authentication */
  apiKey: string;

  /** Model identifier (e.g., "gpt-4o", "claude-sonnet-4-20250514") */
  model: string;

  /** System prompt prepended to all conversations */
  systemPrompt?: string;

  /** Max tokens for response. Default: 4096. */
  maxTokens?: number;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ModelResponse {
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: string;
}

// ─── Default System Prompt ──────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `You are an AI assistant operating under NeuroVerse governance.
All your tool calls are evaluated against governance rules before execution.
If an action is blocked, you will be told why. Adjust your approach accordingly.
Do not attempt to bypass governance rules.`;

// ─── Model Adapter ──────────────────────────────────────────────────────────

export class ModelAdapter {
  private config: ModelConfig;
  private messages: ChatMessage[];
  private tools: ToolDefinition[];

  constructor(config: ModelConfig, tools: ToolDefinition[] = []) {
    this.config = config;
    this.tools = tools;
    this.messages = [];

    // Initialize with system prompt
    const systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    this.messages.push({ role: 'system', content: systemPrompt });
  }

  /**
   * Send a user message and get the model's response.
   */
  async chat(userMessage: string): Promise<ModelResponse> {
    this.messages.push({ role: 'user', content: userMessage });
    return this.complete();
  }

  /**
   * Send a tool result back to the model and get the next response.
   */
  async sendToolResult(toolCallId: string, result: string): Promise<ModelResponse> {
    this.messages.push({
      role: 'tool',
      content: result,
      tool_call_id: toolCallId,
    });
    return this.complete();
  }

  /**
   * Send a governance block message as a tool result.
   */
  async sendBlockedResult(toolCallId: string, reason: string): Promise<ModelResponse> {
    return this.sendToolResult(
      toolCallId,
      `[GOVERNANCE BLOCKED] ${reason}. Please adjust your approach.`,
    );
  }

  /**
   * Call the model API and parse the response.
   */
  private async complete(): Promise<ModelResponse> {
    const url = `${this.config.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: this.messages,
      max_tokens: this.config.maxTokens ?? 4096,
    };

    if (this.tools.length > 0) {
      body.tools = this.tools;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Model API error ${response.status}: ${text}`);
    }

    const data = await response.json() as any;
    const choice = data.choices?.[0];

    if (!choice) {
      throw new Error('Model returned no choices');
    }

    const message = choice.message;

    // Add assistant response to history
    this.messages.push(message);

    return {
      content: message.content ?? null,
      toolCalls: message.tool_calls ?? [],
      finishReason: choice.finish_reason ?? 'stop',
    };
  }

  /** Get current message count (for context tracking). */
  get messageCount(): number {
    return this.messages.length;
  }
}

// ─── Provider Presets ───────────────────────────────────────────────────────

export interface ProviderPreset {
  baseUrl: string;
  defaultModel: string;
  envVar: string;
}

export const PROVIDERS: Record<string, ProviderPreset> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    envVar: 'OPENAI_API_KEY',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    envVar: 'ANTHROPIC_API_KEY',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3',
    envVar: '',
  },
};

/**
 * Resolve a provider name to a ModelConfig.
 * Reads API key from environment variable.
 */
export function resolveProvider(
  provider: string,
  overrides?: Partial<ModelConfig>,
): ModelConfig {
  const preset = PROVIDERS[provider];
  if (!preset) {
    throw new Error(
      `Unknown provider: "${provider}". Available: ${Object.keys(PROVIDERS).join(', ')}`,
    );
  }

  const apiKey = overrides?.apiKey
    ?? (preset.envVar ? process.env[preset.envVar] : '')
    ?? '';

  if (!apiKey && preset.envVar) {
    throw new Error(
      `Missing API key. Set ${preset.envVar} or pass --api-key.`,
    );
  }

  return {
    baseUrl: overrides?.baseUrl ?? preset.baseUrl,
    apiKey,
    model: overrides?.model ?? preset.defaultModel,
    systemPrompt: overrides?.systemPrompt,
    maxTokens: overrides?.maxTokens,
  };
}
