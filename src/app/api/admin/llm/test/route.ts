import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { testOpenAIConnection } from "@/lib/llm-adapter";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const { baseUrl, apiKey, model } = body;

  if (!baseUrl || !apiKey || !model) {
    return NextResponse.json(
      { error: "缺少必填字段" },
      { status: 400 },
    );
  }

  const config = { baseUrl, apiKey, model };
  const result = await testOpenAIConnection(config);

  return NextResponse.json(result);
}
