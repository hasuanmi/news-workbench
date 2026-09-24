"use client";

import { useEffect, useState } from "react";
import { ErrorState } from "@/components/common/error-state";
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
  onDateChange?: () => void;
}

const PRESET_TOPICS = ["十五运", "AI", "城市治理", "民生", "广交会"];

function makeDefaultFilter(): ReviewFilter {
  return { date: new Date(), topics: [] };
}

interface Availability {
  date: string; total: number; mediaCount: number; selected: number; afterWords: number; eligible: number; minWordCount: number;
  latest: { date: string; total: number; mediaCount: number } | null;
}

export function ReviewFilter({ onGenerate, loading, onDateChange }: ReviewFilterProps) {
  const [filter, setFilter] = useState<ReviewFilter>(() => makeDefaultFilter());
  const [topicInput, setTopicInput] = useState("");
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const selectedDate = format(filter.date, "yyyy-MM-dd");
  useEffect(() => {
    const controller = new AbortController();
    setAvailability(null); setDiagnosticError(null);
    fetch(`/api/review/availability?date=${selectedDate}`, { signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "数据诊断加载失败"); return data; })
      .then(data => { if (!controller.signal.aborted) setAvailability(data); })
      .catch(error => { if (!controller.signal.aborted) setDiagnosticError(error instanceof Error ? error.message : "数据诊断加载失败"); });
    return () => controller.abort();
  }, [selectedDate, retry]);
  const changeDate = (date: Date) => { setFilter(f => ({ ...f, date })); onDateChange?.(); };

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
              <Button disabled={loading} variant="outline" className="w-[200px] justify-start text-left font-normal">
                <CalendarIcon className="h-4 w-4 mr-2" />
                {format(filter.date, "yyyy-MM-dd", { locale: zhCN })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar mode="single" selected={filter.date} onSelect={(d) => d && changeDate(d)} locale={zhCN} />
            </PopoverContent>
          </Popover>
          <p className="text-xs text-[var(--muted-foreground)] mt-2">比较媒体、最低字数、重点稿条件、评报维度、同行遗漏扫描、新华社排除等长期规则均在后台「每日评报管理」中维护，前台无需逐次选择。</p>
          <div className="mt-3 space-y-2 text-sm" aria-label="评报数据诊断" aria-live="polite">
            {diagnosticError ? <ErrorState title="数据诊断读取失败" message={diagnosticError} onRetry={() => setRetry(n => n + 1)} className="py-3" /> : !availability ? <p className="text-[var(--muted-foreground)]">正在核对当日文章与评报规则…</p> : <>
              <p>当日已入库：{availability.total} 篇 / {availability.mediaCount} 家媒体 · 符合评报规则：{availability.eligible} 篇</p>
              <p className="text-xs text-[var(--muted-foreground)]">当日入库 {availability.total} → 默认媒体范围 {availability.selected} → {availability.minWordCount} 字过滤后 {availability.afterWords} → 去重后候选 {availability.eligible} → {availability.eligible ? "可开始 AI 选稿（尚未执行）" : "未进入 AI"}</p>
              {!availability.total && <p>所选日期暂无正式文章入库，采集尚未完成或未产出数据。</p>}
              <p>最近有数据日期：{availability.latest ? `${availability.latest.date}，共 ${availability.latest.total} 篇 / ${availability.latest.mediaCount} 家媒体` : "暂无正式文章"}</p>
              {availability.latest && availability.latest.date !== selectedDate && <Button variant="outline" size="sm" disabled={loading} onClick={() => changeDate(new Date(`${availability.latest!.date}T12:00:00`))}>使用最近有数据日期</Button>}
            </>}
          </div>
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
          <Button variant="ghost" className="ml-3" onClick={() => { setFilter(makeDefaultFilter()); onDateChange?.(); }} disabled={loading}>
            重置
          </Button>
        </div>
      </div>
    </div>
  );
}
