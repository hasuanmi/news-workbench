-- 候选池增加周年基准年（用于确认进正式日历时计算正确的"N周年"）
ALTER TABLE calendar_candidate ADD COLUMN IF NOT EXISTS base_year integer;
