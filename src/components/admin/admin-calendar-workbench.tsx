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
  const [tab, setTab] = useState("candidates");

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-serif text-2xl font-bold">新闻日历管理</h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          历史日历(资料库) → 候选节点(待审) → 正式日历(可用)。AI 生成的节点一律先进候选池，审核后才进正式日历。
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="candidates">候选节点</TabsTrigger>
          <TabsTrigger value="history">历史日历</TabsTrigger>
          <TabsTrigger value="events">节点管理</TabsTrigger>
        </TabsList>

        <TabsContent value="candidates" className="mt-4">
          <CandidatePool />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryCalendar />
        </TabsContent>
        <TabsContent value="events" className="mt-4">
          <AdminCalendar />
        </TabsContent>
      </Tabs>
    </div>
  );
}
