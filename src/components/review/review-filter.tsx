"use client";

import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileText } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Button } from "@/components/ui/button";

/** 前台每日评报条件——只保留日期、关注主题、自定义要求；其余长期规则在后台统一维护 */
export interface ReviewFilter {
  date: Date;
  topics: string[];
  customRequirement?: string;
}

interface ReviewFilterProps {
  onGenerate: (filter: ReviewFilter) => void;
  loading?: boolean;
}

const PRESET_TOPICS = ["十五运", "AI", "城市治理", "民生", "广交会"];

function makeDefaultFilter(): ReviewFilter {
  return { date: new Date(), topics: [] };
}

export function ReviewFilter({ onGenerate, loading }: ReviewFilterProps) {
  const [filter, setFilter] = useState<ReviewFilter>(() => makeDefaultFilter());
  const [topicInput, setTopicInput] = useState("");

  const toggleTopic = (topic: string) => {
    setFilter((f) => ({
      ...f,
      topics: f.topics.includes(topic) ? f.topics.filter((t) => t !== topic) : [...f.topics, topic],
    }));
  };

  const addCustomTopic = () => {
    if (topicInput.trim() && !filter.topics.includes(topicInput.trim())) {
      setFilter((f) => ({ ...f, topics: [...f.topics, topicInput.trim()] }));
      setTopicInput("");
    }
  };

  return (
    <div className="bg-white border border-[var(--border)] rounded-lg p-6 mb-6">
      <div className="space-y-5">
        {/* 日期 */}
        <div>
          <label className="text-sm font-medium text-[var(--foreground)] mb-2 block">评报日期</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[200px] justify-start text-left font-normal">
                <CalendarIcon className="h-4 w-4 mr-2" />
                {format(filter.date, "yyyy-MM-dd", { locale: zhCN })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar mode="single" selected={filter.date} onSelect={(d) => d && setFilter((f) => ({ ...f, date: d }))} locale={zhCN} />
            </PopoverContent>
          </Popover>
          <p className="text-xs text-[var(--muted-foreground)] mt-2">比较媒体、最低字数、重点稿条件、评报维度、同行遗漏扫描、新华社排除等长期规则均在后台「每日评报管理」中维护，前台无需逐次选择。</p>
        </div>

        {/* 关注主题（可选） */}
        <div>
          <label className="text-sm font-medium text-[var(--foreground)] mb-2 block">关注主题（可选）</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {PRESET_TOPICS.map((topic) => (
              <Button key={topic} variant={filter.topics.includes(topic) ? "default" : "outline"} size="sm" onClick={() => toggleTopic(topic)}>
                {topic}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustomTopic()}
              placeholder="输入自定义主题，回车添加（不填则按后台默认全量评报）"
              className="flex-1 px-3 py-1.5 text-sm border border-[var(--border)] rounded-md"
            />
            <Button variant="outline" size="sm" onClick={addCustomTopic}>
              添加
            </Button>
          </div>
        </div>

        {/* 自定义要求（可选） */}
        <div>
          <label className="text-sm font-medium text-[var(--foreground)] mb-2 block">自定义要求（可选）</label>
          <textarea
            value={filter.customRequirement || ""}
            onChange={(e) => setFilter((f) => ({ ...f, customRequirement: e.target.value }))}
            placeholder="例如：今天重点关注十五运和城市治理，尤其比较谁有一手采访、广州本地案例和更强的数据支撑。（不填则按后台默认规则执行全量评报）"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md resize-none"
          />
        </div>

        {/* 操作按钮 */}
        <div className="flex pt-2">
          <Button
            onClick={() => onGenerate(filter)}
            disabled={loading}
            className="bg-[var(--brand)] hover:bg-[#9a2f27] text-white"
          >
            <FileText className="h-4 w-4 mr-2" />
            {loading ? "选稿中..." : "开始选稿"}
          </Button>
          <Button variant="ghost" className="ml-3" onClick={() => setFilter(makeDefaultFilter())} disabled={loading}>
            重置
          </Button>
        </div>
      </div>
    </div>
  );
}