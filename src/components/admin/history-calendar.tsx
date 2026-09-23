"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Upload, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface HistoryFile {
  id: string;
  file_name: string;
  file_type: string;
  year: number;
  parse_status: string;
  node_count: number;
  created_at: string;
}
interface ParsedNode {
  node_name: string;
  event_date: string | null;
  candidate_month: number | null;
  date_status: string;
  region: string;
  importance: string;
  category_code: string | null;
  description: string | null;
  raw_text: string;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  uploaded: { label: "已上传", cls: "border-[#5b6b8c] text-[#5b6b8c]" },
  parsed: { label: "已解析", cls: "border-[#b8860b] text-[#b8860b]" },
  confirmed: { label: "已入库", cls: "bg-[#3f7d5c] text-white" },
  failed: { label: "失败", cls: "bg-[var(--brand)] text-white" },
};

function dateLabel(n: ParsedNode): string {
  if (n.date_status === "confirmed" && n.event_date) return n.event_date;
  if (n.date_status === "month_known" && n.candidate_month) return `${n.candidate_month}月`;
  return "待定";
}

export function HistoryCalendar() {
  const [files, setFiles] = useState<HistoryFile[]>([]);
  const [loading, setLoading] = useState(false);

  const [year, setYear] = useState<number>(new Date().getUTCFullYear() - 1);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [activeFile, setActiveFile] = useState<HistoryFile | null>(null);
  const [nodes, setNodes] = useState<ParsedNode[]>([]);
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const loadFiles = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/calendar/history")
      .then((r) => r.json())
      .then((d) => setFiles(d.items ?? []))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  async function handleUpload() {
    if (!pickedFile) return toast.error("请先选择文件");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", pickedFile);
      fd.append("year", String(year));
      const res = await fetch("/api/admin/calendar/history/upload", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "上传失败");
        return;
      }
      toast.success("上传成功，可点击解析");
      setPickedFile(null);
      if (fileRef.current) fileRef.current.value = "";
      loadFiles();
      // 自动打开解析
      const f: HistoryFile = {
        id: d.fileId,
        file_name: d.fileName,
        file_type: pickedFile.name.endsWith(".docx") ? "docx" : pickedFile.name.endsWith(".xlsx") ? "xlsx" : "csv",
        year,
        parse_status: "uploaded",
        node_count: 0,
        created_at: new Date().toISOString(),
      };
      setActiveFile(f);
      setNodes([]);
    } finally {
      setUploading(false);
    }
  }

  async function handleParse() {
    if (!activeFile) return;
    setParsing(true);
    setNodes([]);
    try {
      const res = await fetch("/api/admin/calendar/history/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: activeFile.id }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "解析失败（大模型配额可能受限，请稍后重试）");
        return;
      }
      setNodes(d.nodes ?? []);
      toast.success(`解析出 ${d.nodes?.length ?? 0} 个节点（原始行 ${d.rawRowCount}）`);
      loadFiles();
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirm() {
    if (!activeFile || nodes.length === 0) return;
    setConfirming(true);
    try {
      const res = await fetch("/api/admin/calendar/history/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: activeFile.id, nodes }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "入库失败");
        return;
      }
      toast.success(`已确认入库 ${d.inserted} 个历史节点`);
      setNodes([]);
      setActiveFile(null);
      loadFiles();
    } finally {
      setConfirming(false);
    }
  }

  async function viewNodes(f: HistoryFile) {
    setActiveFile(f);
    setParsing(true);
    setNodes([]);
    try {
      const res = await fetch(`/api/admin/calendar/history/${f.id}/nodes`);
      const d = await res.json();
      setNodes(d.items ?? []);
    } finally {
      setParsing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-xs text-[var(--muted-foreground)]">所属年份</label>
          <Input
            type="number"
            className="w-28"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-[var(--muted-foreground)]">历史日历文件 (docx/xlsx/csv)</label>
          <Input
            ref={fileRef}
            type="file"
            accept=".docx,.xlsx,.csv"
            className="w-64"
            onChange={(e) => setPickedFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <Button onClick={handleUpload} disabled={uploading}>
          {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
          上传
        </Button>
      </div>

      {activeFile && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span className="font-medium">{activeFile.file_name}</span>
                <Badge variant="outline">{activeFile.year} 年</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleParse} disabled={parsing}>
                  {parsing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                  解析（AI 识别）
                </Button>
                <Button size="sm" onClick={handleConfirm} disabled={confirming || nodes.length === 0}>
                  {confirming ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                  确认入库
                </Button>
              </div>
            </div>
            {nodes.length === 0 ? (
              <div className="text-sm text-[var(--muted-foreground)] py-4 text-center">
                尚未解析。点击「解析」由大模型识别节点（大模型配额受限时可能失败，请稍后重试）。
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">时间</TableHead>
                      <TableHead>节点名称</TableHead>
                      <TableHead className="w-16">重要度</TableHead>
                      <TableHead className="w-20">地域</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nodes.map((n, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm whitespace-nowrap">
                          <span className="flex items-center gap-1 flex-wrap">
                            {dateLabel(n)}
                            <span
                              className={cn(
                                "text-[10px] px-1 rounded",
                                n.date_status === "confirmed" && "bg-[#3f7d5c] text-white",
                                n.date_status === "month_known" && "bg-[var(--gold)] text-white",
                                n.date_status === "unknown" && "bg-[var(--muted-foreground)] text-white",
                              )}
                            >
                              {n.date_status === "confirmed" ? "已定" : n.date_status === "month_known" ? "仅月份" : "待定"}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">{n.node_name}</TableCell>
                        <TableCell>
                          <Badge
                            className={cn(
                              "text-[10px]",
                              n.importance === "S" && "bg-[var(--brand)] text-white",
                              n.importance === "A" && "bg-[var(--gold)] text-white",
                              n.importance === "B" && "bg-[var(--muted-foreground)] text-white",
                            )}
                          >
                            {n.importance}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{n.region}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <h3 className="font-medium text-sm">历史日历资料库</h3>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              上传的原始文件永久保留，解析结果可重复生成。点击文件查看已解析节点。
            </p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[var(--muted-foreground)]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中
            </div>
          ) : files.length === 0 ? (
            <div className="py-12 text-center text-[var(--muted-foreground)]">暂无历史文件</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>文件名</TableHead>
                  <TableHead className="w-20">年份</TableHead>
                  <TableHead className="w-20">类型</TableHead>
                  <TableHead className="w-24">状态</TableHead>
                  <TableHead className="w-20">节点数</TableHead>
                  <TableHead className="w-24 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.file_name}</TableCell>
                    <TableCell>{f.year}</TableCell>
                    <TableCell className="uppercase text-xs">{f.file_type}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-[10px]", STATUS_BADGE[f.parse_status]?.cls)}>
                        {STATUS_BADGE[f.parse_status]?.label ?? f.parse_status}
                      </Badge>
                    </TableCell>
                    <TableCell>{f.node_count}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => viewNodes(f)}>
                        <AlertCircle className="w-3.5 h-3.5 mr-1" /> 查看
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
