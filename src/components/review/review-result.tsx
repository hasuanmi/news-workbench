"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface ReviewResult {
  todayHighlights: {
    themes: string[];
    media: string[];
    summary: string;
  };
  topicComparison: Array<{
    topic: string;
    rows: Array<{ media: string; angle: string; feature: string }>;
    aiSummary: string;
  }>;
  peerHighlights: Array<{
    media: string;
    title: string;
    summary: string;
    reason: string;
    url?: string;
  }>;
  finalReview: string;
}

interface ReviewResultProps {
  result: ReviewResult;
}

export function ReviewResult({ result }: ReviewResultProps) {
  return (
    <div className="space-y-6">
      {/* 区块一：今日重点 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-serif">今日重点</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="text-sm font-medium text-[#1f1b16] mb-1">共同关注主题</div>
            <div className="flex flex-wrap gap-1">
              {result.todayHighlights.themes.map((theme) => (
                <Badge key={theme} variant="secondary">
                  {theme}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-[#1f1b16] mb-1">涉及媒体</div>
            <div className="flex flex-wrap gap-1">
              {result.todayHighlights.media.map((m) => (
                <Badge key={m} variant="outline">
                  {m}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-[#1f1b16] mb-1">主要报道情况</div>
            <p className="text-sm text-[#1f1b16] leading-relaxed">{result.todayHighlights.summary}</p>
          </div>
        </CardContent>
      </Card>

      {/* 区块二：同题观察 */}
      {result.topicComparison.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-serif">同题观察</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.topicComparison.map((tc) => (
              <div key={tc.topic} className="border-b border-[#e8e2d8] pb-4 last:border-0">
                <h4 className="font-medium text-[#1f1b16] mb-2">主题：{tc.topic}</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#e8e2d8]">
                        <th className="text-left py-2 px-2 text-[#6b6257]">媒体</th>
                        <th className="text-left py-2 px-2 text-[#6b6257]">主要角度</th>
                        <th className="text-left py-2 px-2 text-[#6b6257]">特点</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tc.rows.map((row, i) => (
                        <tr key={i} className="border-b border-[#e8e2d8]/50">
                          <td className="py-2 px-2 font-medium">{row.media}</td>
                          <td className="py-2 px-2">{row.angle}</td>
                          <td className="py-2 px-2">{row.feature}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 text-sm text-[#6b6257]">
                  <span className="font-medium">AI 差异分析：</span>
                  {tc.aiSummary}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 区块三：同行亮点 */}
      {result.peerHighlights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-serif">同行亮点</CardTitle>
            <p className="text-sm text-[#6b6257]">其他媒体重点报道、但广州日报没有重点覆盖的内容</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.peerHighlights.map((h, i) => (
              <div key={i} className="p-3 bg-[#faf7f2] rounded border border-[#e8e2d8]">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline">{h.media}</Badge>
                  <span className="font-medium text-[#1f1b16]">{h.title}</span>
                </div>
                <p className="text-sm text-[#1f1b16] mb-1">{h.summary}</p>
                <p className="text-xs text-[#6b6257]">
                  <span className="font-medium">为什么值得关注：</span>
                  {h.reason}
                </p>
                {h.url && (
                  <a href={h.url} target="_blank" rel="noopener" className="text-xs text-[#b3392f] hover:underline mt-1 inline-block">
                    查看原文 →
                  </a>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 区块四：最终评报 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-serif">最终评报</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none">
            {result.finalReview.split("\n").map((para, i) => (
              <p key={i} className="text-sm text-[#1f1b16] leading-relaxed mb-2">
                {para}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
