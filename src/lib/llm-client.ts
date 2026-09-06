/**
 * 统一 LLM 客户端
 * 优先使用自定义模型（M1.5），未配置则回退平台豆包
 */

import { LLMClient, Config } from "coze-coding-dev-sdk";
import { openAIStream, type OpenAIConfig, type ChatMessage } from "@/lib/llm-adapter";

// 运行时动态导入，避免循环依赖
let getCustomLLMConfig: () => OpenAIConfig | null = () => null;
let isCustomLLMEnabled: () => boolean = () => false;

export function setLLMConfigGetters(
  getConfig: () => OpenAIConfig | null,
  isEnabled: () => boolean,
) {
  getCustomLLMConfig = getConfig;
  isCustomLLMEnabled = isEnabled;
}

export interface LLMStreamChunk {
  content: string;
  done: boolean;
}

/**
 * 流式调用（统一入口）
 * 优先自定义模型，回退豆包
 */
export async function* unifiedStream(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    model?: string; // 豆包模型 ID（仅回退时使用）
  },
): AsyncGenerator<LLMStreamChunk> {
  // 优先使用自定义模型
  if (isCustomLLMEnabled()) {
    const config = getCustomLLMConfig();
    if (config) {
      try {
        yield* openAIStream(config, messages);
        return;
      } catch (err) {
        // 自定义模型失败，回退豆包
        console.error("自定义模型调用失败，回退豆包:", err);
      }
    }
  }

  // 回退豆包
  const config = new Config();
  const client = new LLMClient(config);

  const llmConfig: Record<string, unknown> = {};
  if (options?.model) llmConfig.model = options.model;
  if (options?.temperature !== undefined) llmConfig.temperature = options.temperature;

  const stream = client.stream(messages, llmConfig as any);

  for await (const chunk of stream) {
    if (chunk.content) {
      yield { content: chunk.content.toString(), done: false };
    }
  }

  yield { content: "", done: true };
}

/**
 * 非流式调用（统一入口）
 */
export async function unifiedInvoke(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    model?: string;
  },
): Promise<string> {
  // 优先使用自定义模型
  if (isCustomLLMEnabled()) {
    const config = getCustomLLMConfig();
    if (config) {
      try {
        const { openAIInvoke } = await import("@/lib/llm-adapter");
        const res = await openAIInvoke(config, messages);
        return res.content;
      } catch (err) {
        console.error("自定义模型调用失败，回退豆包:", err);
      }
    }
  }

  // 回退豆包
  const config = new Config();
  const client = new LLMClient(config);

  const llmConfig: Record<string, unknown> = {};
  if (options?.model) llmConfig.model = options.model;
  if (options?.temperature !== undefined) llmConfig.temperature = options.temperature;

  const res = await client.invoke(messages, llmConfig as any);
  return res.content;
}
