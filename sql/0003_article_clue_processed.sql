-- article 表补列：线索流水线处理标记
-- clue-pipeline.ts 用 clue_processed=false 筛选待处理文章，
-- 但 schema.ts 里漏定义该列，导致新建库缺少此列 → 线索识别恒返回 0。
ALTER TABLE "article" ADD COLUMN IF NOT EXISTS "clue_processed" boolean NOT NULL DEFAULT false;
