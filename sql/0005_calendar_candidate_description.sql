-- 候选项补 description 列（历史节点迁移 / 手动 / 粘贴识别都会携带说明）
ALTER TABLE "calendar_candidate" ADD COLUMN IF NOT EXISTS "description" text;
