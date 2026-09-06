import type { Metadata } from "next";
import "./globals.css";
import { registerLLMConfig } from "@/lib/llm-config-register";

// 注册 LLM 配置 getter（服务启动时执行一次）
registerLLMConfig();

export const metadata: Metadata = {
  title: {
    default: "AI 新闻辅助工作台",
    template: "%s | AI 新闻辅助工作台",
  },
  description: "广州日报新闻编辑辅助工作台：新闻日历、新闻线索、每日评报",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="bg-[var(--background)] text-[var(--foreground)] font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
