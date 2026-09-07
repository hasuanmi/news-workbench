/** 评报模块类型 */
export type ReviewModuleType = "today_focus" | "same_topic" | "peer_highlights" | "gz_daily";

/** 同题对比行 */
export interface ComparisonRow {
  media: string;
  angle: string;
  highlight: string;
  title?: string;
  url?: string;
}

/** 同题主题 */
export interface TopicItem {
  theme: string;
  comparison: ComparisonRow[];
  analysis?: string;
}

/** 通用条目 */
export interface ReviewItem {
  media?: string;
  title?: string;
  summary?: string;
  url?: string;
  why_noteworthy?: string;
}

/** 评报模块 */
export interface ReviewModule {
  type: ReviewModuleType;
  summary?: string;
  topics?: TopicItem[];
  items?: ReviewItem[];
}
