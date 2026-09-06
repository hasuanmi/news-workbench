import "server-only";
import { supabase } from "@/lib/db";

export interface AppConfig {
  calendarWindowDays: number;
  clueAutoThreshold: number;
  clueReviewThreshold: number;
  reviewWordThreshold: number;
  reviewAutoThreshold: number;
  reviewReviewThreshold: number;
  leadCron: string;
  weeklyCron: string;
  dynamicDiscoverCron: string;
  dailyReviewCron: string;
}

const DEFAULT_CONFIG: AppConfig = {
  calendarWindowDays: 14,
  clueAutoThreshold: 0.85,
  clueReviewThreshold: 0.6,
  reviewWordThreshold: 2000,
  reviewAutoThreshold: 0.8,
  reviewReviewThreshold: 0.5,
  leadCron: "0 9 * * *",
  weeklyCron: "0 10 * * 1",
  dynamicDiscoverCron: "0 6 * * *",
  dailyReviewCron: "30 10 * * *",
};

let cache: { value: AppConfig; at: number } | null = null;
const CACHE_TTL_MS = 60_000;

/** 读取应用配置（工作流只从此处取阈值，不硬编码） */
interface ConfigRow {
  key: string;
  value: string;
}

export async function getAppConfig(): Promise<AppConfig> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  try {
    const { data } = await supabase()
      .schema("public")
      .from("app_config")
      .select("key, value");
    const map = new Map<string, string>((data as ConfigRow[] ?? []).map((r) => [r.key, r.value]));
    const num = (k: string, d: number) => {
      const v = map.get(k);
      const n = v === undefined || v === null ? NaN : Number(v);
      return Number.isFinite(n) ? n : d;
    };
    const str = (k: string, d: string) => String(map.get(k) ?? d);
    const cfg: AppConfig = {
      calendarWindowDays: num("calendar.window_days", DEFAULT_CONFIG.calendarWindowDays),
      clueAutoThreshold: num("clue.auto_approve_threshold", DEFAULT_CONFIG.clueAutoThreshold),
      clueReviewThreshold: num("clue.review_threshold", DEFAULT_CONFIG.clueReviewThreshold),
      reviewWordThreshold: num("review.word_count_threshold", DEFAULT_CONFIG.reviewWordThreshold),
      reviewAutoThreshold: num("review.auto_approve_threshold", DEFAULT_CONFIG.reviewAutoThreshold),
      reviewReviewThreshold: num("review.review_threshold", DEFAULT_CONFIG.reviewReviewThreshold),
      leadCron: str("cron.news_lead", DEFAULT_CONFIG.leadCron),
      weeklyCron: str("cron.weekly_briefing", DEFAULT_CONFIG.weeklyCron),
      dynamicDiscoverCron: str("cron.dynamic_node_discover", DEFAULT_CONFIG.dynamicDiscoverCron),
      dailyReviewCron: str("cron.daily_review", DEFAULT_CONFIG.dailyReviewCron),
    };
    cache = { value: cfg, at: Date.now() };
    return cfg;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function invalidateConfigCache() {
  cache = null;
}
