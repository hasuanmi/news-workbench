import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export default function LeadsPage() {
  return (
    <AppShell>
      <ModulePlaceholder
        title="新闻线索"
        phase="M3（数据源 PoC 之后）"
        desc="媒体官网/电子报抓取 → AI 识别新栏目/新策划 → 每日 09:00 生成线索卡片；每周一 10:00 汇总媒体特色简报。前置依赖：M2 媒体数据源 PoC 与 WF03 抓取适配器。"
      />
    </AppShell>
  );
}
