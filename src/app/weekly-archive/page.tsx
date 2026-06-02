"use client";

import { useState, useRef, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import ReportHtmlViewer from "@/components/ReportHtmlViewer";
import { useWorkspaceData } from "@/lib/useWorkspaceData";
import { importDocxToContent } from "@/lib/docx-import";
import { serializeContent, parseContent, isArchiveReport, reportDate } from "@/lib/report-utils";
import { toast } from "@/components/Toast";
import type { Report } from "@/lib/types";
import { Upload, FileText, Trash2, Calendar, ArrowLeft } from "lucide-react";

export default function WeeklyArchivePage() {
  const { reports, currentUser, workspaceId, addReport, deleteReport } = useWorkspaceData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 업로드된 보관용 보고서만, "보고일"(본문에서 추출) 기준 내림차순.
  const archives = useMemo(
    () =>
      reports
        .filter(isArchiveReport)
        .map((r) => ({ report: r, date: reportDate(r) }))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [reports],
  );
  const selectedEntry = archives.find((e) => e.report.id === selectedId) || null;
  const selected = selectedEntry?.report || null;
  const selectedHtml = selected ? parseContent(selected.content, selected.type).html : null;

  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      toast("error", "docx 파일만 업로드할 수 있습니다.");
      return;
    }
    if (!currentUser) return;
    setUploading(true);
    try {
      const converted = await importDocxToContent(file);
      if (!converted) {
        toast("error", "워드 파일을 읽을 수 없습니다. 파일 형식을 확인해주세요.");
        return;
      }
      const title = file.name.replace(/\.docx$/i, "").trim() || "주간보고";
      const report: Report = {
        id: `r${Date.now()}`,
        title,
        type: "weekly",
        authorId: currentUser.id,
        createdAt: new Date().toISOString().split("T")[0],
        content: serializeContent({ sections: [], html: converted.html, originalDocxBase64: converted.originalDocxBase64, archive: true }),
        status: "closed",
        workspaceId: workspaceId || "",
      };
      const created = await addReport(report);
      toast(created ? "success" : "error", created ? "주간보고가 업로드되었습니다." : "업로드에 실패했습니다.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (report: Report) => {
    if (!window.confirm(`"${report.title}" 항목을 삭제할까요?`)) return;
    if (selectedId === report.id) setSelectedId(null);
    await deleteReport(report.id);
    toast("success", "삭제되었습니다.");
  };

  return (
    <AppLayout
      title="주간보고 리스트"
      description={selected ? "보기 전용" : "지난 주간보고를 업로드해 보관하고, 작성 시 '지난주 보기'로 참고하세요"}
      actions={
        selected ? (
          <button
            onClick={() => setSelectedId(null)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium text-muted-foreground hover:bg-accent/15 hover:text-accent transition-all"
          >
            <ArrowLeft className="w-4 h-4" /> 목록으로
          </button>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-[14px] font-semibold hover:bg-accent-hover transition-colors disabled:opacity-60"
          >
            <Upload className="w-4 h-4" />
            {uploading ? "업로드 중…" : "주간보고 업로드"}
          </button>
        )
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
        }}
      />

      {selected ? (
        /* 보기 전용 상세 — 이미지(주간보고)와 동일한 전체 구조를 그대로 렌더, 편집 불가 */
        <div>
          <div className="flex items-center gap-2 mb-4 text-[13px] text-muted-foreground">
            <span className="text-[15px] font-semibold text-white">{selected.title}</span>
            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> 보고일 {selectedEntry?.date}</span>
          </div>
          <div className="bg-card border border-border rounded-2xl p-6 overflow-x-auto">
            {selectedHtml ? (
              <ReportHtmlViewer html={selectedHtml} />
            ) : (
              <p className="text-[14px] text-muted-foreground py-10 text-center">표시할 내용이 없습니다.</p>
            )}
          </div>
        </div>
      ) : archives.length === 0 ? (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full border-2 border-dashed border-border rounded-2xl py-20 flex flex-col items-center gap-3 text-muted-foreground hover:border-accent/50 hover:text-accent transition-colors disabled:opacity-60"
        >
          <Upload className="w-10 h-10" />
          <span className="text-[15px] font-medium">{uploading ? "업로드 중…" : "주간보고(.docx)를 업로드하세요"}</span>
          <span className="text-[13px] text-muted">여기에 보관한 보고서는 작성 화면의 &quot;지난주 보기&quot;에서 볼 수 있어요</span>
        </button>
      ) : (
        <div className="space-y-2">
          {archives.map(({ report: r, date }) => (
            <div
              key={r.id}
              className="flex items-center gap-4 bg-card border border-border rounded-xl px-5 py-4 hover:border-accent/40 transition-colors"
            >
              <button onClick={() => setSelectedId(r.id)} className="flex items-center gap-4 flex-1 min-w-0 text-left">
                <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-foreground truncate">{r.title}</p>
                  <p className="text-[12px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3 h-3" /> 보고일 {date}
                  </p>
                </div>
              </button>
              <button
                onClick={() => handleDelete(r)}
                className="p-2 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                title="삭제"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
