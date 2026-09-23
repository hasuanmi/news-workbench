import { AppShell } from "@/components/app-shell";
import { WeeklyBriefingList } from "@/components/leads/weekly-briefing";

export default function WeeklyPage() {
  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-serif font-bold text-[var(--foreground)]">每周媒体简报</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            基于本周新闻线索，AI 分析各媒体新栏目、重点系列、关注专题与特色策划
          </p>
        </div>
        <WeeklyBriefingList />
      </div>
    </AppShell>
  );
}
