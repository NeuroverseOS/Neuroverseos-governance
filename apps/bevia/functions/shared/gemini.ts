// Bevia — Gemini AI client for Supabase Edge Functions
// Lovable uses Gemini, so all AI calls go through here

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface GeminiRequest {
  systemPrompt?: string;
  messages: GeminiMessage[];
  model?: 'gemini-2.0-flash' | 'gemini-2.0-flash-lite' | 'gemini-1.5-pro';
  temperature?: number;
  maxTokens?: number;
}

export interface GeminiResponse {
  ok: boolean;
  text: string;
  error?: string;
}

/**
 * Call Gemini API. Defaults to gemini-2.0-flash (cheap, fast).
 * Use gemini-1.5-pro for heavy analysis (Align ingestion, complex rewrites).
 */
export async function callGemini(req: GeminiRequest): Promise<GeminiResponse> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return { ok: false, text: '', error: 'GEMINI_API_KEY not set' };
  }

  const model = req.model ?? 'gemini-2.0-flash';
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;

  const contents = req.messages.map(m => ({
    role: m.role,
    parts: m.parts,
  }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: req.temperature ?? 0.7,
      maxOutputTokens: req.maxTokens ?? 2048,
    },
  };

  if (req.systemPrompt) {
    body.systemInstruction = { parts: [{ text: req.systemPrompt }] };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      return { ok: false, text: '', error: `Gemini ${response.status}: ${err}` };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (!text) {
      return { ok: false, text: '', error: 'Empty response from Gemini' };
    }

    return { ok: true, text };
  } catch (err) {
    return { ok: false, text: '', error: `Gemini call failed: ${(err as Error).message}` };
  }
}
