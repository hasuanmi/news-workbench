import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { testOpenAIConnection, type OpenAIConfig } from "@/lib/llm-adapter";

/**
 * 内存存储自定义 LLM 配置
 * 服务停止后自动清除，不落库
 */
let customLLMConfig: OpenAIConfig | null = null;
let customLLMEnabled = false;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  return NextResponse.json({
    enabled: customLLMEnabled,
    config: customLLMConfig
      ? {
          baseUrl: customLLMConfig.baseUrl,
          model: customLLMConfig.model,
          stream: customLLMConfig.stream,
          maxCompletionTokens: customLLMConfig.maxCompletionTokens,
          // API Key 不返回完整值，只返回脱敏
          apiKeyMasked: maskApiKey(customLLMConfig.apiKey),
        }
      : null,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const {
    baseUrl,
    apiKey,
    model,
    stream = true,
    maxCompletionTokens,
    extraBody,
  } = body;

  if (!baseUrl || !apiKey || !model) {
    return NextResponse.json(
      { error: "缺少必填字段：baseUrl、apiKey、model" },
      { status: 400 },
    );
  }

  customLLMConfig = {
    baseUrl,
    apiKey,
    model,
    stream,
    maxCompletionTokens,
    extraBody,
  };

  return NextResponse.json({
    success: true,
    config: {
      baseUrl: customLLMConfig.baseUrl,
      model: customLLMConfig.model,
      stream: customLLMConfig.stream,
      apiKeyMasked: maskApiKey(customLLMConfig.apiKey),
    },
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { enabled } = await request.json();

  if (!customLLMConfig) {
    return NextResponse.json(
      { error: "请先配置模型" },
      { status: 400 },
    );
  }

  customLLMEnabled = Boolean(enabled);

  return NextResponse.json({
    success: true,
    enabled: customLLMEnabled,
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  customLLMConfig = null;
  customLLMEnabled = false;

  return NextResponse.json({ success: true });
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

// 导出给 test route 用
export function getCustomLLMConfig(): OpenAIConfig | null {
  return customLLMConfig;
}

export function isCustomLLMEnabled(): boolean {
  return customLLMEnabled;
}
