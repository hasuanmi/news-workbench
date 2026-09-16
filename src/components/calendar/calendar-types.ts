// 新闻日历改版：共享类型定义。数据字段以现有 API 返回为准。

export interface CalCategory {
  id: string;
  code: string;
  category_name: string;
  color: string;
  sort_order?: number;
  enabled?: boolean;
}

/** 列表/月历主数据 —— /api/calendar 的 occurrences item */
export interface CalEvent {
  id: string;
  event_name: string;
  date: string; // YYYY-MM-DD 当年发生日
  daysUntil: number;
  anniversary: number | null;
  importance: string | null;
  region: string | null; // local / national
  category?: CalCategory | null;
  background?: string | null;
  planning_hint?: unknown;
  source?: string | null;
  source_name?: string | null;
  tags?: unknown;
}

/** 时间待定节点 —— /api/calendar 的 floating item */
export interface FloatingEvent {
  id: string;
  event_name: string;
  date_status: "month_known" | "unknown";
  candidate_month: number | null;
  importance: string | null;
  region?: string | null;
  category?: CalCategory | null;
  background?: string | null;
  planning_hint?: unknown;
  source?: string | null;
  tags?: unknown;
}

/** 详情 —— /api/calendar/:id 的 item */
export interface CalDetail {
  id: string;
  event_name: string;
  event_type: "fixed" | "dynamic";
  original_date: string | null;
  event_date: string | null;
  anniversary_base_year: number | null;
  anniversary: number | null;
  event_year?: number | null;
  region: string;
  importance: string;
  review_status: string;
  enabled: boolean;
  needs_review: boolean;
  description: string | null;
  tags: string[];
  source_name: string | null;
  source?: string | null;
  date_status?: string | null;
  event_month?: number | null;
  category?: { code: string; category_name: string; color: string } | null;
}