/** Review dates are business calendar days in Asia/Shanghai, not UTC days. */
export function reviewDate(value: string | Date = new Date()): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value) return value;
    throw new Error("评报日期无效");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("评报日期无效");
  return new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

export function reviewDayBounds(value: string) {
  const date = reviewDate(value);
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { date, start: `${date}T00:00:00+08:00`, end: `${next.toISOString().slice(0, 10)}T00:00:00+08:00` };
}

export function emptyReviewMessage(date: string, total: number, selected: number, threshold: number): string {
  if (!total) return `${date}（北京时间）尚无已入库的正式文章，请检查媒体抓取状态或选择有文章的日期。`;
  if (!selected) return `${date} 已入库 ${total} 篇文章，但默认评报媒体范围内为 0 篇，请检查媒体配置。`;
  return `${date} 默认评报媒体有 ${selected} 篇文章，但均未达到 ${threshold} 字门槛；请检查文章正文或选稿规则。`;
}
