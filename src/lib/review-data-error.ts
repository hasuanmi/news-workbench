/** Preserve the failing query and database cause; callers log the stack server-side. */
export class ReviewDataError extends Error {
  constructor(
    public readonly operation: string,
    public readonly fields: string,
    public readonly databaseError: { message: string; code?: string; details?: string; hint?: string },
  ) {
    super(`${operation}失败 [${fields}]：${databaseError.message}`, { cause: databaseError });
    this.name = "ReviewDataError";
  }
}

export function reviewErrorResponse(error: unknown) {
  if (error instanceof ReviewDataError) {
    const transportCode = `${error.databaseError.message} ${error.databaseError.details ?? ""}`
      .match(/\b(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|UND_ERR_CONNECT_TIMEOUT)\b/)?.[1];
    return { error: error.message, operation: error.operation, fields: error.fields,
      code: error.databaseError.code || transportCode || null };
  }
  return { error: error instanceof Error ? error.message : "评报数据读取失败" };
}

export function parseReviewConfig<T>(key: string, value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  try { return (typeof value === "string" ? JSON.parse(value) : value) as T; }
  catch {
    throw new ReviewDataError("解析评报规则", `app_config.value (${key})`, {
      message: "配置不是有效 JSON，请检查该配置项", code: "INVALID_CONFIG_JSON",
    });
  }
}
