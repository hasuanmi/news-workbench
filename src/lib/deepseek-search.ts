import "server-only";

export interface SearchSource {
  title?: string;
  url: string;
}

export interface DeepseekSearchResult {
  text: string;
  sources: SearchSource[];
}

/**
 * 调用 DeepSeek Responses API 的原生 web_search 工具（服务端执行检索）。
 * 统一使用 DeepSeek，不引入任何第三方搜索依赖。
 *
 * 返回：
 *  - text：模型最终回答（含 markdown 来源链接）
 *  - sources：检索到的真实来源 URL（取自 web_search_call 的 open_page / find_in_page 的 url 字段，
 *            已剔除 DeepSeek 追加的 #ws_call_id= 锚点）
 */
export async function deepseekWebSearch(opts: {
  instructions?: string;
  input: string;
  model?: string;
  timeoutMs?: number;
}): Promise<DeepseekSearchResult> {
  const key = process.env.DEFAULT_LLM_API_KEY;
  if (!key) {
    throw new Error("缺少 DEFAULT_LLM_API_KEY，无法调用 DeepSeek 联网检索");
  }
  const model = opts.model || process.env.DEEPSEEK_SEARCH_MODEL || "deepseek-v4-pro";

  const body: Record<string, unknown> = {
    model,
    input: opts.input,
    tools: [{ type: "web_search" }],
    stream: false,
  };
  if (opts.instructions) body.instructions = opts.instructions;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 150000);
  try {
    const res = await fetch("https://api.deepseek.com/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`DeepSeek Responses 调用失败(${res.status}): ${txt.slice(0, 300)}`);
    }
    const json = (await res.json()) as { output?: Array<Record<string, any>> };
    const out = json.output ?? [];
    const sources: SearchSource[] = [];
    const seen = new Set<string>();
    let text = "";
    for (const item of out) {
      if (item.type === "web_search_call") {
        const act = item.action as { type?: string; url?: string } | undefined;
        const url =
          act?.type === "open_page" || act?.type === "find_in_page" ? act?.url : undefined;
        if (url) {
          const clean = String(url).split("#ws_call_id=")[0].trim();
          if (clean && !seen.has(clean)) {
            seen.add(clean);
            sources.push({ url: clean });
          }
        }
      } else if (item.type === "message") {
        const content = (item.content as Array<{ type?: string; text?: string }>) ?? [];
        for (const part of content) {
          if (part.type === "output_text" || part.type === "text") text += part.text ?? "";
        }
      }
    }
    return { text: text.trim(), sources };
  } finally {
    clearTimeout(timer);
  }
}
