/**
 * OpenAI 兼容 LLM 适配器
 * 支持任意 OpenAI 兼容 API（base_url + api_key + model）
 * 用于 M1.5 自定义大模型接入
 */

export interface OpenAIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  stream?: boolean;
  maxCompletionTokens?: number;
  extraBody?: Record<string, unknown>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAIResponse {
  content: string;
  finishReason: string | null;
}

export interface OpenAIChunk {
  content: string;
  done: boolean;
}

/**
 * 非流式调用
 */
export async function openAIInvoke(
  config: OpenAIConfig,
  messages: ChatMessage[],
): Promise<OpenAIResponse> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    stream: false,
  };

  if (config.maxCompletionTokens) {
    body.max_completion_tokens = config.maxCompletionTokens;
  }

  if (config.extraBody) {
    Object.assign(body, config.extraBody);
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  const finishReason = data?.choices?.[0]?.finish_reason ?? null;

  return { content, finishReason };
}

/**
 * 流式调用（SSE）
 * 返回 AsyncGenerator，每次 yield 一个文本块
 */
export async function* openAIStream(
  config: OpenAIConfig,
  messages: ChatMessage[],
): AsyncGenerator<OpenAIChunk> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    stream: true,
  };

  if (config.maxCompletionTokens) {
    body.max_completion_tokens = config.maxCompletionTokens;
  }

  if (config.extraBody) {
    Object.assign(body, config.extraBody);
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  if (!res.body) {
    throw new Error("Response body is null");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;

      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") {
        yield { content: "", done: true };
        return;
      }

      try {
        const json = JSON.parse(data);
        const content = json?.choices?.[0]?.delta?.content ?? "";
        if (content) {
          yield { content, done: false };
        }
      } catch {
        // 忽略解析错误
      }
    }
  }
}

/**
 * 测试连接（发送最小请求）
 */
export async function testOpenAIConnection(config: OpenAIConfig): Promise<{
  success: boolean;
  content?: string;
  error?: string;
}> {
  try {
    const messages: ChatMessage[] = [
      { role: "user", content: "Hi" },
    ];
    const res = await openAIInvoke(config, messages);
    return { success: true, content: res.content };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
