/**
 * @neuroverseos/governance/radiant — AI adapter
 *
 * Abstract interface for calling an LLM, plus a concrete Anthropic
 * implementation using raw fetch (no SDK dependency).
 *
 * The interface is intentionally thin — one function, string in, string
 * out. The system prompt is composed upstream by `composeSystemPrompt`;
 * the AI adapter just sends it and the user query, returns the response.
 *
 * Phase 1 targets Anthropic Claude. The interface is generic enough to
 * add OpenAI, LangChain, or local-model implementations later.
 */

/**
 * A minimal AI completion interface. Implementors call an LLM with a
 * system prompt and a user query and return the response text.
 */
export interface RadiantAI {
  complete(systemPrompt: string, userQuery: string): Promise<string>;
}

/**
 * Create an Anthropic Claude AI adapter using raw fetch (no SDK).
 *
 * @param apiKey — Anthropic API key. Read from ANTHROPIC_API_KEY env.
 * @param model — model identifier. Default: claude-sonnet-4-20250514.
 * @param maxTokens — max tokens for the response. Default: 4096.
 */
export function createAnthropicAI(
  apiKey: string,
  model = 'claude-sonnet-4-20250514',
  maxTokens = 4096,
): RadiantAI {
  return {
    async complete(systemPrompt: string, userQuery: string): Promise<string> {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userQuery }],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `Anthropic API error ${res.status}: ${body.slice(0, 500)}`,
        );
      }

      const data = (await res.json()) as {
        content: Array<{ type: string; text?: string }>;
      };

      const text = data.content
        ?.filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('');

      if (!text) {
        throw new Error('Anthropic returned no text content');
      }

      return text;
    },
  };
}

/**
 * Create a mock AI adapter for testing. Returns a fixed response
 * without calling any API.
 */
export function createMockAI(fixedResponse: string): RadiantAI {
  return {
    async complete(): Promise<string> {
      return fixedResponse;
    },
  };
}
