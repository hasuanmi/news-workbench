import { AppShell } from "@/components/app-shell";
import { ModulePlaceholder } from "@/components/module-placeholder";

export default function AdminReviewPage() {
  return (
    <AppShell>
      <ModulePlaceholder
        title="新闻线索审核"
        phase="M3"
        desc="AI 识别的新闻线索按置信度路由：≥0.85 自动入库，0.60–0.85 进入本审核队列，<0.60 自动丢弃。阈值可在系统配置中调整。"
      />
    </AppShell>
  );
}
