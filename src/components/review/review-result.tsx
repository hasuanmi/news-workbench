"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import type { ReviewModule } from "@/lib/review-types";

interface ReviewResultProps {
  modules: ReviewModule[];
  finalSummary: string;
  displayRules?: {
    show_comparison_table?: boolean;
    show_media_name?: boolean;
    show_article_title?: boolean;
    show_article_url?: boolean;
    show_evidence?: boolean;
    peer_highlights_max?: number;
    same_topic_max?: number;
    summary_max_length?: number;
    language_style?: string;
  } | null;
}

const MODULE_TITLES: Record<string, string> = {
  today_focus: "今日重点",
  same_topic: "同题观察",
  peer_highlights: "同行亮点",
  gz_daily: "广州日报观察",
};

const MODULE_ICONS: Record<string, string> = {
  today_focus: "📌",
  same_topic: "🔍",
  peer_highlights: "💡",
  gz_daily: "📰",
};

export function ReviewResult({ modules, finalSummary, displayRules }: ReviewResultProps) {
  // 默认展示规则
  const rules = {
    show_comparison_table: displayRules?.show_comparison_table ?? true,
    show_media_name: displayRules?.show_media_name ?? true,
    show_article_title: displayRules?.show_article_title ?? true,
    show_article_url: displayRules?.show_article_url ?? true,
    show_evidence: displayRules?.show_evidence ?? true,
    peer_highlights_max: displayRules?.peer_highlights_max ?? 5,
    same_topic_max: displayRules?.same_topic_max ?? 5,
    summary_max_length: displayRules?.summary_max_length ?? 200,
    language_style: displayRules?.language_style ?? "专业、客观、简洁",
  };

  return (
    <div className="space-y-6">
      {modules.map((module) => (
        <ModuleSection
          key={module.type}
          module={module}
          rules={rules}
        />
      ))}

      {/* 最终评报 */}
      {finalSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <span>📝</span>
              最终评报
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              {finalSummary.split("\n").map((para, i) =>
                para.trim() ? (
                  <p key={i} className="text-foreground/90 leading-relaxed mb-3">
                    {para}
                  </p>
                ) : null
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ModuleSection({
  module,
  rules,
}: {
  module: ReviewModule;
  rules: {
    show_comparison_table: boolean;
    show_media_name: boolean;
    show_article_title: boolean;
    show_article_url: boolean;
    show_evidence: boolean;
    peer_highlights_max: number;
    same_topic_max: number;
    summary_max_length: number;
    language_style: string;
  };
}) {
  const title = MODULE_TITLES[module.type] || module.type;
  const icon = MODULE_ICONS[module.type] || "📋";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <span>{icon}</span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 模块摘要 */}
        {module.summary && (
          <p className="text-sm text-muted-foreground">{module.summary}</p>
        )}

        {/* 同题观察：对比表 */}
        {module.type === "same_topic" && rules.show_comparison_table && module.topics && (
          <div className="space-y-4">
            {module.topics.slice(0, rules.same_topic_max).map((topic, idx) => (
              <div key={idx} className="space-y-2">
                <h4 className="font-medium text-foreground flex items-center gap-2">
                  <Badge variant="outline">{topic.theme}</Badge>
                </h4>
                {topic.comparison && topic.comparison.length > 0 && (
                  <div className="border border-border/40 rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          {rules.show_media_name && <th className="text-left px-3 py-2 font-medium">媒体</th>}
                          <th className="text-left px-3 py-2 font-medium">主要角度</th>
                          <th className="text-left px-3 py-2 font-medium">特点</th>
                          {rules.show_article_title && <th className="text-left px-3 py-2 font-medium">标题</th>}
                          {rules.show_article_url && <th className="px-3 py-2 w-8"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {topic.comparison.map((row, rowIdx) => (
                          <tr key={rowIdx} className="border-t border-border/30">
                            {rules.show_media_name && (
                              <td className="px-3 py-2 text-foreground/80">{row.media}</td>
                            )}
                            <td className="px-3 py-2 text-foreground/80">{row.angle}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.highlight}</td>
                            {rules.show_article_title && (
                              <td className="px-3 py-2 text-foreground/70 text-xs">{row.title}</td>
                            )}
                            {rules.show_article_url && (
                              <td className="px-3 py-2">
                                {row.url && (
                                  <a href={row.url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-3.5 w-3.5 text-primary" />
                                  </a>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {topic.analysis && (
                  <p className="text-xs text-muted-foreground mt-1">{topic.analysis}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 同行亮点列表 */}
        {module.type === "peer_highlights" && module.items && (
          <div className="space-y-3">
            {module.items.slice(0, rules.peer_highlights_max).map((item, idx) => (
              <div key={idx} className="border border-border/40 rounded-md p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {rules.show_media_name && (
                      <Badge variant="outline" className="text-xs mb-1">
                        {item.media}
                      </Badge>
                    )}
                    {rules.show_article_title && item.title && (
                      <h5 className="font-medium text-sm text-foreground">
                        {item.title}
                      </h5>
                    )}
                  </div>
                  {rules.show_article_url && item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      <ExternalLink className="h-3.5 w-3.5 text-primary" />
                    </a>
                  )}
                </div>
                {item.summary && (
                  <p className="text-xs text-muted-foreground">{item.summary}</p>
                )}
                {rules.show_evidence && item.why_noteworthy && (
                  <p className="text-xs text-foreground/70">
                    <span className="font-medium">值得关注：</span>
                    {item.why_noteworthy}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 今日重点 / 广州日报观察 */}
        {(module.type === "today_focus" || module.type === "gz_daily") && module.items && (
          <div className="space-y-3">
            {module.items.map((item, idx) => (
              <div key={idx} className="border border-border/40 rounded-md p-3 space-y-1.5">
                {rules.show_media_name && item.media && (
                  <Badge variant="outline" className="text-xs">
                    {item.media}
                  </Badge>
                )}
                {rules.show_article_title && item.title && (
                  <h5 className="font-medium text-sm text-foreground">
                    {item.title}
                  </h5>
                )}
                {item.summary && (
                  <p className="text-xs text-muted-foreground">{item.summary}</p>
                )}
                {rules.show_evidence && item.why_noteworthy && (
                  <p className="text-xs text-foreground/70">
                    <span className="font-medium">值得关注：</span>
                    {item.why_noteworthy}
                  </p>
                )}
                {rules.show_article_url && item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    原文链接
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
