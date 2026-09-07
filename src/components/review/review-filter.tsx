"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, RotateCcw, FileText } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

export interface ReviewFilter {
  date: Date;
  mediaIds: string[];
  minWordCount: number;
  highlightFlags: string[];
  dimensions: string[];
  topics: string[];
  scanMissing: boolean;
  customRequirement?: string;
}

interface ReviewFilterProps {
  onGenerate: (filter: ReviewFilter) => void;
  loading?: boolean;
}

interface MediaOption {
  id: string;
  media_name: string;
  media_level: string;
}

const DEFAULT_DIMENSIONS = ["topic", "timeliness", "angle", "depth", "presentation"];

const HIGHLIGHT_FLAGS = [
  { value: "front_page", label: "头版重点" },
  { value: "full_page", label: "整版报道" },
  { value: "cross_page", label: "跨版报道" },
  { value: "series", label: "系列报道" },
  { value: "special", label: "专题策划" },
];

const DIMENSIONS = [
  { value: "topic", label: "选题" },
  { value: "timeliness", label: "时效性" },
  { value: "angle", label: "报道角度" },
  { value: "depth", label: "内容深度" },
  { value: "richness", label: "信息丰富度" },
  { value: "presentation", label: "表现形式" },
  { value: "local", label: "广州本地性" },
  { value: "exclusive", label: "独家性" },
  { value: "headline", label: "标题质量" },
  { value: "service", label: "服务性" },
];

const PRESET_TOPICS = ["十五运", "AI", "城市治理", "民生", "广交会"];

function makeDefaultFilter(mediaIds: string[]): ReviewFilter {
  return {
    date: new Date(),
    mediaIds,
    minWordCount: 2000,
    highlightFlags: [],
    dimensions: [...DEFAULT_DIMENSIONS],
    topics: [],
    scanMissing: true,
  };
}

export function ReviewFilter({ onGenerate, loading }: ReviewFilterProps) {
  const [medias, setMedias] = useState<MediaOption[]>([]);
  const [filter, setFilter] = useState<ReviewFilter>(() => makeDefaultFilter([]));
  const [topicInput, setTopicInput] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/medias?scope=review")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const list: MediaOption[] = data.medias ?? [];
        setMedias(list);
        // 默认勾选全部评报监测媒体；为空则回退全部启用媒体
        if (list.length === 0) {
          fetch("/api/medias")
            .then((r2) => r2.json())
            .then((d2) => {
              if (!cancelled) {
                const all: MediaOption[] = d2.medias ?? [];
                setMedias(all);
                setFilter(makeDefaultFilter(all.map((m) => m.id)));
              }
            })
            .catch(() => {});
        } else {
          setFilter(makeDefaultFilter(list.map((m) => m.id)));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleReset = () => {
    setFilter(makeDefaultFilter(medias.map((m) => m.id)));
    setTopicInput("");
  };

  const toggleMedia = (id: string) => {
    setFilter((f) => ({
      ...f,
      mediaIds: f.mediaIds.includes(id) ? f.mediaIds.filter((m) => m !== id) : [...f.mediaIds, id],
    }));
  };

  const toggleFlag = (flag: string) => {
    setFilter((f) => ({
      ...f,
      highlightFlags: f.highlightFlags.includes(flag) ? f.highlightFlags.filter((x) => x !== flag) : [...f.highlightFlags, flag],
    }));
  };

  const toggleDimension = (dim: string) => {
    setFilter((f) => ({
      ...f,
      dimensions: f.dimensions.includes(dim) ? f.dimensions.filter((x) => x !== dim) : [...f.dimensions, dim],
    }));
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

  return (
    <div className="bg-white border border-[#e8e2d8] rounded-lg p-6 mb-6">
      <div className="space-y-5">
        {/* 日期 */}
        <div>
          <label className="text-sm font-medium text-[#1f1b16] mb-2 block">评报日期</label>
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
        </div>

        {/* 对比媒体 */}
        <div>
          <label className="text-sm font-medium text-[#1f1b16] mb-2 block">
            对比媒体（多选，默认取后台开启「评报监测」的媒体）
          </label>
          <div className="flex flex-wrap gap-2">
            {medias.map((m) => (
              <Button key={m.id} variant={filter.mediaIds.includes(m.id) ? "default" : "outline"} size="sm" onClick={() => toggleMedia(m.id)}>
                {m.media_name}
              </Button>
            ))}
            {medias.length === 0 && (
              <span className="text-xs text-[#6b6257]">暂无媒体，请先在「媒体与数据源」中配置</span>
            )}
          </div>
        </div>

        {/* 重点稿筛选条件 */}
        <div>
          <label className="text-sm font-medium text-[#1f1b16] mb-2 block">重点稿筛选条件</label>
          <div className="flex items-center gap-4 mb-2">
            <label className="text-sm text-[#6b6257]">最低字数：</label>
            <input
              type="number"
              value={filter.minWordCount}
              onChange={(e) => setFilter((f) => ({ ...f, minWordCount: Number(e.target.value) }))}
              className="w-24 px-2 py-1 text-sm border border-[#e8e2d8] rounded"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {HIGHLIGHT_FLAGS.map((flag) => (
              <Button key={flag.value} variant={filter.highlightFlags.includes(flag.value) ? "default" : "outline"} size="sm" onClick={() => toggleFlag(flag.value)}>
                {flag.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-[#6b6257] mt-1">如抓取数据中无版面信号，对应条件将自动忽略</p>
        </div>

        {/* 评报维度 */}
        <div>
          <label className="text-sm font-medium text-[#1f1b16] mb-2 block">评报维度（多选）</label>
          <div className="flex flex-wrap gap-2">
            {DIMENSIONS.map((dim) => (
              <Button key={dim.value} variant={filter.dimensions.includes(dim.value) ? "default" : "outline"} size="sm" onClick={() => toggleDimension(dim.value)}>
                {dim.label}
              </Button>
            ))}
          </div>
        </div>

        {/* 关注主题 */}
        <div>
          <label className="text-sm font-medium text-[#1f1b16] mb-2 block">关注主题（可选）</label>
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
              placeholder="输入自定义主题，回车添加"
              className="flex-1 px-3 py-1.5 text-sm border border-[#e8e2d8] rounded-md"
            />
            <Button variant="outline" size="sm" onClick={addCustomTopic}>
              添加
            </Button>
          </div>
        </div>

        {/* 同行遗漏扫描 */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="scanMissing"
            checked={filter.scanMissing}
            onChange={(e) => setFilter((f) => ({ ...f, scanMissing: e.target.checked }))}
            className="h-4 w-4"
          />
          <label htmlFor="scanMissing" className="text-sm text-[#1f1b16]">
            查找"其他媒体重点报道，但广州日报没有重点覆盖"的内容
          </label>
        </div>

        {/* 自定义要求 */}
        <div>
          <label className="text-sm font-medium text-[#1f1b16] mb-2 block">自定义要求（可选）</label>
          <textarea
            value={filter.customRequirement || ""}
            onChange={(e) => setFilter((f) => ({ ...f, customRequirement: e.target.value }))}
            placeholder="例如：今天重点关注十五运和城市治理，尤其比较谁有一手采访、广州本地案例和更强的数据支撑。"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-[#e8e2d8] rounded-md resize-none"
          />
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={() => onGenerate(filter)}
            disabled={loading || filter.mediaIds.length === 0 || filter.dimensions.length === 0}
            className="bg-[#b3392f] hover:bg-[#9a2f27] text-white"
          >
            <FileText className="h-4 w-4 mr-2" />
            {loading ? "生成中..." : "生成每日评报"}
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={loading}>
            <RotateCcw className="h-4 w-4 mr-2" />
            重置条件
          </Button>
        </div>
      </div>
    </div>
  );
}
