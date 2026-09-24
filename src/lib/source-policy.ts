export const sourceStatusLabels = {
  active: "启用中", needs_fix: "待修复", duplicate: "重复停用", manual_disabled: "人工停用",
} as const;
export type SourceStatus = keyof typeof sourceStatusLabels;
export function isSourceStatus(value: unknown): value is SourceStatus {
  return typeof value === "string" && Object.hasOwn(sourceStatusLabels, value);
}
export function normalizeSourceUrl(value: string): string {
  try { return new URL(value.trim()).href; } catch { return value.trim(); }
}
export function sourceCanRun(source: { source_status: string; enabled: boolean; crawl_method: string; source_type: string }) {
  return source.source_status === "active" && source.enabled &&
    ((source.source_type === "website" && source.crawl_method === "html") ||
      (source.source_type === "epaper" && source.crawl_method === "epaper"));
}

export interface SourceActivityRun {
  source_policy_version?: number;
  job?: string;
  steps?: { name: string; source_status?: string; source_id?: string; started_at?: string }[];
}
export function summarizeSourceActivity(runs: SourceActivityRun[], now = new Date()) {
  const dateKey = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
  const days = new Map<string, Set<string>>([[dateKey(now), new Set()]]);
  for (const run of runs) {
    if (run.source_policy_version !== 1 || run.job !== "media_then_clues") continue;
    for (const step of run.steps ?? []) {
      if (step.name !== "media_fetch" || step.source_status !== "active" || !step.source_id || !step.started_at) continue;
      const date = new Date(step.started_at);
      if (Number.isNaN(date.getTime())) continue;
      const day = dateKey(date);
      if (!days.has(day)) days.set(day, new Set());
      days.get(day)!.add(step.source_id);
    }
  }
  return [...days].sort(([a], [b]) => b.localeCompare(a)).slice(0, 7)
    .map(([date, ids]) => ({ date, actualSources: ids.size }));
}
