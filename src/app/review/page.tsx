import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export default function ReviewPage() {
  return (
    <AppShell>
      <ModulePlaceholder
        title="每日评报"
        phase="M4"
        desc="抓取 6 家同城媒体当天报道 → 重点稿筛选 → 同题聚类 → 六维比较与差异点 → 生成约 1000 字评报（流式输出，人工可改）。评报维度与字数阈值已在系统配置中就绪。"
      />
    </AppShell>
  );
}
