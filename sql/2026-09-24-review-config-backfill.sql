-- Only populate missing keys. Preserve existing review settings and legacy values.
BEGIN;
INSERT INTO app_config (key, value, description)
SELECT 'review.comparison_media', value, '每日评报比较媒体（从旧配置迁移）'
FROM app_config WHERE key = 'review.media_names'
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_config (key, value, description) VALUES
('review.comparison_media', '["广州日报","南方日报","南方都市报","新快报","羊城晚报","信息时报"]'::jsonb, '每日评报默认比较媒体'),
('review.selection_rules', jsonb_build_object(
  'min_word_count', COALESCE((SELECT (value #>> '{}')::integer FROM app_config WHERE key = 'review.word_count_threshold'), 2000),
  'highlight_flags', '["front_page","full_page","cross_page","series","special"]'::jsonb,
  'dimensions', '["topic","timeliness","angle","depth","presentation"]'::jsonb,
  'scan_missing', true, 'exclude_xinhua_reprint', true), '每日评报选稿规则；字数沿用旧配置'),
('review.generation_rules', '{"max_word_count":1000,"modules":{"today_focus":true,"same_topic":true,"peer_highlights":true,"gz_daily":false},"same_topic_max":5,"peer_highlights_max":5,"summary_max_length":200,"language_style":"专业、客观、简洁，符合报纸评报口吻"}'::jsonb, '每日评报生成默认规则'),
('review.display_rules', '{"show_comparison_table":true,"show_media_name":true,"show_article_title":true,"show_article_url":true,"show_evidence":true}'::jsonb, '每日评报展示默认规则')
ON CONFLICT (key) DO NOTHING;
COMMIT;
