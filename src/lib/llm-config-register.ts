/**
 * 应用启动时注册 LLM 配置 getter
 * 在 layout.tsx 或 middleware 中调用
 */

import { setLLMConfigGetters } from "@/lib/llm-client";
import { getCustomLLMConfig, isCustomLLMEnabled } from "@/app/api/admin/llm/route";

export function registerLLMConfig() {
  setLLMConfigGetters(getCustomLLMConfig, isCustomLLMEnabled);
}
