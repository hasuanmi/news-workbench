import { AppShell } from "@/components/app-shell";
import { AdminLeadsBoard } from "@/components/admin/admin-leads";

export default function AdminLeadsPage() {
  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-serif font-bold text-[#1f1b16]">线索审核</h1>
          <p className="text-sm text-[#6b6257] mt-1">
            审核 AI 识别的新闻线索，通过/驳回/修改后发布
          </p>
        </div>
        <AdminLeadsBoard />
      </div>
    </AppShell>
  );
}
