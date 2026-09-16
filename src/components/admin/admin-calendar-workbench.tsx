"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CandidatePool } from "./candidate-pool";
import { HistoryCalendar } from "./history-calendar";
import { AdminCalendar } from "./admin-calendar";

/**
 * 新闻日历管理后台：三子页签
 *  - 候选节点：候选池（历史迁移 / AI 补充 / 粘贴识别 / 手动）→ 去重合并 → 审核
 *  - 历史日历：上传原始文件 → AI 解析 → 确认入库（资料库）
 *  - 节点管理：直接维护正式日历（calendar_event）
 */
export function AdminCalendarWorkbench() {
  const [tab, setTab] = useState("events");

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-serif text-2xl font-bold">新闻日历管理</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          AI / 历史 / 用户生成的节点直接进入新闻日历，发现不合适可随时编辑或删除（删除保留原因，供 AI 推荐参考）。
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="events">节点管理</TabsTrigger>
          <TabsTrigger value="candidates">候选节点</TabsTrigger>
          <TabsTrigger value="history">历史日历</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="mt-4">
          <AdminCalendar />
        </TabsContent>
        <TabsContent value="candidates" className="mt-4">
          <CandidatePool />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryCalendar />
        </TabsContent>
      </Tabs>
    </div>
  );
}
