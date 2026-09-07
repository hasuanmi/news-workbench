/**
 * 统一 LLM 客户端
 *
 * 独立部署策略：
 * - 优先使用自定义 OpenAI 兼容模型（M1.5 后台配置 或 DEFAULT_LM_* 环境变量）。
 * - 回退豆包：仅在 coze-coding-dev-sdk 可用时（沙箱环境）；
 *   独立部署若未安装该包，则只走自定义模型，未配置时直接报错。
 *
 * 不依赖任何扣子专属运行时。
 */

import { openAIStream, openAIInvoke, type OpenAIConfig, type ChatMessage } from "@/lib/llm-adapter";

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

/** 从环境变量构造默认 OpenAI 兼容配置（独立部署时可通过 .env 直接配 AI 模型） */
function envDefaultConfig(): OpenAIConfig | null {
  const baseUrl = process.env.DEFAULT_LLM_BASE_URL;
  const apiKey = process.env.DEFAULT_LLM_API_KEY;
  const model = process.env.DEFAULT_LLM_MODEL;
  if (!baseUrl || !apiKey || !model) return null;
  return { baseUrl, apiKey, model };
}

/** 尝试获取可用配置：后台自定义 > 环境变量默认 */
function resolveConfig(): OpenAIConfig | null {
  if (isCustomLLMEnabled()) {
    const c = getCustomLLMConfig();
    if (c) return c;
  }
  return envDefaultConfig();
}

/**
 * 尝试调用 coze-coding-dev-sdk 豆包回退。
 * 独立部署未安装该包时返回 null。
 */
async function* doubaoFallbackStream(
  messages: ChatMessage[],
  options?: { temperature?: number; model?: string },
): AsyncGenerator<LLMStreamChunk> | null {
  try {
    // 动态导入：独立部署未安装 coze-coding-dev-sdk 时此分支不执行
    const mod = await import("coze-coding-dev-sdk").catch(() => null);
    if (!mod) return null;
    const { LLMClient, Config } = mod as {
      LLMClient: new (c: unknown) => {
        stream: (m: ChatMessage[], c: Record<string, unknown>) => AsyncIterable<{ content: unknown }>;
      };
      Config: new () => unknown;
    };
    const config = new Config();
    const client = new LLMClient(config);
    const llmConfig: Record<string, unknown> = {};
    if (options?.model) llmConfig.model = options.model;
    if (options?.temperature !== undefined) llmConfig.temperature = options.temperature;
    const stream = client.stream(messages, llmConfig);
    for await (const chunk of stream) {
      if (chunk.content) {
        yield { content: String(chunk.content), done: false };
      }
    }
    yield { content: "", done: true };
  } catch {
    return null;
  }
}

async function doubaoFallbackInvoke(
  messages: ChatMessage[],
  options?: { temperature?: number; model?: string },
): Promise<string | null> {
  try {
    const mod = await import("coze-coding-dev-sdk").catch(() => null);
    if (!mod) return null;
    const { LLMClient, Config } = mod as {
      LLMClient: new (c: unknown) => {
        invoke: (m: ChatMessage[], c: Record<string, unknown>) => Promise<{ content: unknown }>;
      };
      Config: new () => unknown;
    };
    const config = new Config();
    const client = new LLMClient(config);
    const llmConfig: Record<string, unknown> = {};
    if (options?.model) llmConfig.model = options.model;
    if (options?.temperature !== undefined) llmConfig.temperature = options.temperature;
    const res = await client.invoke(messages, llmConfig);
    return String(res.content);
  } catch {
    return null;
  }
}

/**
 * 流式调用（统一入口）
 * 优先自定义模型 / 环境变量默认模型，回退豆包（仅沙箱可用）
 */
export async function* unifiedStream(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    model?: string;
  },
): AsyncGenerator<LLMStreamChunk> {
  const config = resolveConfig();
  if (config) {
    try {
      yield* openAIStream(config, messages);
      return;
    } catch (err) {
      console.error("自定义模型调用失败，尝试回退:", err);
    }
  }

  const fallback = await doubaoFallbackStream(messages, options);
  if (fallback) {
    yield* fallback;
    return;
  }

  throw new Error(
    "无可用的 LLM 配置。请在后台「接入大模型」中配置，或设置环境变量 DEFAULT_LLM_BASE_URL / DEFAULT_LLM_API_KEY / DEFAULT_LLM_MODEL。"
  );
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
  const config = resolveConfig();
  if (config) {
    try {
      const res = await openAIInvoke(config, messages);
      return res.content;
    } catch (err) {
      console.error("自定义模型调用失败，尝试回退:", err);
    }
  }

  const fallback = await doubaoFallbackInvoke(messages, options);
  if (fallback !== null) return fallback;

  throw new Error(
    "无可用的 LLM 配置。请在后台「接入大模型」中配置，或设置环境变量 DEFAULT_LLM_BASE_URL / DEFAULT_LLM_API_KEY / DEFAULT_LLM_MODEL。"
  );
}
