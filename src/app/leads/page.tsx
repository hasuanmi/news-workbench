import { AppShell } from "@/components/app-shell";
import { LeadsBoard } from "@/components/leads/leads-board";

export default function LeadsPage() {
  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-serif font-bold text-[#1f1b16]">新闻线索</h1>
          <p className="text-sm text-[#6b6257] mt-1">
            AI 从已入库文章中识别的新栏目、系列报道、专题、特色策划线索
          </p>
        </div>
        <LeadsBoard />
      </div>
    </AppShell>
  );
}
