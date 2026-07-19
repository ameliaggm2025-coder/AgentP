const OPENAI_API = 'https://api.openai.com/v1/chat/completions';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 是否已設定 OpenAI 金鑰 */
export function openaiConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * 呼叫 OpenAI Chat Completions，回傳純文字回覆。
 * 用原生 fetch，不引入 SDK，保持相依最小。
 */
export async function chatComplete(
  messages: ChatMessage[],
  opts?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY 未設定');

  const model = opts?.model ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const res = await fetch(OPENAI_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts?.temperature ?? 0.6,
      max_tokens: opts?.maxTokens ?? 500,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI ${res.status}: ${t}`);
  }
  const json = await res.json();
  const content: string | undefined = json?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('OpenAI 回應為空');
  return content;
}
