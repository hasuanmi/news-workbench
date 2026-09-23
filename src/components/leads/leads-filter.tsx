"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/common/loading-button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, RotateCcw, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

export interface LeadsFilter {
  timeRange: "24h" | "3d" | "7d" | "custom";
  customStart?: Date;
  customEnd?: Date;
  mediaScope: "all" | "central" | "provincial" | "municipal" | "custom";
  customMediaIds?: string[];
  clueTypes: string[];
  topics: string[];
  customRequirement?: string;
}

interface LeadsFilterProps {
  onIdentify: (filter: LeadsFilter) => void;
  loading?: boolean;
}

const CLUE_TYPES = [
  { value: "new_column", label: "新栏目" },
  { value: "series", label: "系列报道" },
  { value: "special_topic", label: "专题" },
  { value: "feature_plan", label: "特色策划" },
];

const PRESET_TOPICS = ["人工智能", "城市治理", "民生", "科技创新", "产业", "文化", "教育"];

export function LeadsFilter({ onIdentify, loading }: LeadsFilterProps) {
  const [filter, setFilter] = useState<LeadsFilter>({
    timeRange: "24h",
    mediaScope: "all",
    clueTypes: CLUE_TYPES.map((t) => t.value),
    topics: [],
  });
  const [topicInput, setTopicInput] = useState("");

  const handleReset = () => {
    setFilter({
      timeRange: "24h",
      mediaScope: "all",
      clueTypes: CLUE_TYPES.map((t) => t.value),
      topics: [],
    });
    setTopicInput("");
  };

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

  const toggleClueType = (type: string) => {
    setFilter((f) => ({
      ...f,
      clueTypes: f.clueTypes.includes(type) ? f.clueTypes.filter((t) => t !== type) : [...f.clueTypes, type],
    }));
  };

  return (
    <div className="bg-white border border-[var(--border)] rounded-lg p-6 mb-6">
      <div className="space-y-5">
        {/* 时间范围 */}
        <div>
          <label className="text-sm font-medium text-[var(--foreground)] mb-2 block">时间范围</label>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "24h", label: "过去 24 小时" },
              { value: "3d", label: "过去 3 天" },
              { value: "7d", label: "过去 7 天" },
              { value: "custom", label: "自定义" },
            ].map((opt) => (
              <Button
                key={opt.value}
                variant={filter.timeRange === opt.value ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter((f) => ({ ...f, timeRange: opt.value as LeadsFilter["timeRange"] }))}
              >
                {opt.label}
              </Button>
            ))}
            {filter.timeRange === "custom" && (
              <div className="flex items-center gap-2 ml-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <CalendarIcon className="h-4 w-4 mr-1" />
                      {filter.customStart ? format(filter.customStart, "MM-dd") : "开始日期"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={filter.customStart}
                      onSelect={(d) => setFilter((f) => ({ ...f, customStart: d }))}
                      locale={zhCN}
                    />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <CalendarIcon className="h-4 w-4 mr-1" />
                      {filter.customEnd ? format(filter.customEnd, "MM-dd") : "结束日期"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={filter.customEnd}
                      onSelect={(d) => setFilter((f) => ({ ...f, customEnd: d }))}
                      locale={zhCN}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </div>

        {/* 媒体范围 */}
        <div>
          <label className="text-sm font-medium text-[var(--foreground)] mb-2 block">媒体范围</label>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "all", label: "全部媒体" },
              { value: "central", label: "央媒" },
              { value: "provincial", label: "省级媒体" },
              { value: "municipal", label: "地市媒体" },
            ].map((opt) => (
              <Button
                key={opt.value}
                variant={filter.mediaScope === opt.value ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter((f) => ({ ...f, mediaScope: opt.value as LeadsFilter["mediaScope"] }))}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {/* 识别类型 */}
        <div>
          <label className="text-sm font-medium text-[var(--foreground)] mb-2 block">识别类型（多选）</label>
          <div className="flex flex-wrap gap-2">
            {CLUE_TYPES.map((type) => (
              <Button
                key={type.value}
                variant={filter.clueTypes.includes(type.value) ? "default" : "outline"}
                size="sm"
                onClick={() => toggleClueType(type.value)}
              >
                {type.label}
              </Button>
            ))}
          </div>
        </div>

        {/* 重点主题 */}
        <div>
          <label className="text-sm font-medium text-[var(--foreground)] mb-2 block">重点主题（可选）</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {PRESET_TOPICS.map((topic) => (
              <Button
                key={topic}
                variant={filter.topics.includes(topic) ? "default" : "outline"}
                size="sm"
                onClick={() => toggleTopic(topic)}
              >
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
              placeholder="输入自定义主题，回车添加"
              className="flex-1 px-3 py-1.5 text-sm border border-[var(--border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/20"
            />
            <Button variant="outline" size="sm" onClick={addCustomTopic}>
              添加
            </Button>
          </div>
          {filter.topics.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {filter.topics.map((topic) => (
                <span
                  key={topic}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-[var(--brand)]/10 text-[var(--brand)] rounded"
                >
                  {topic}
                  <button onClick={() => toggleTopic(topic)} className="hover:text-[var(--foreground)]">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 自定义要求 */}
        <div>
          <label className="text-sm font-medium text-[var(--foreground)] mb-2 block">自定义要求（可选）</label>
          <textarea
            value={filter.customRequirement || ""}
            onChange={(e) => setFilter((f) => ({ ...f, customRequirement: e.target.value }))}
            placeholder="例如：优先识别最近新推出的栏目和系列，不要普通单篇新闻；重点关注 AI、城市更新和民生策划。"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/20 resize-none"
          />
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3 pt-2">
          <LoadingButton
            onClick={() => onIdentify(filter)}
            loading={loading}
            loadingText="识别中…"
            disabled={filter.clueTypes.length === 0}
            className="bg-[var(--brand)] hover:bg-[#9a2f27] text-white"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            开始识别
          </LoadingButton>
          <Button variant="outline" onClick={handleReset} disabled={loading}>
            <RotateCcw className="h-4 w-4 mr-2" />
            重置条件
          </Button>
        </div>
      </div>
    </div>
  );
}
