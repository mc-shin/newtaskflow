"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAppStore } from "@/lib/store";
import ReportHtmlViewer from "@/components/ReportHtmlViewer";
import { parseContent, reportDate } from "@/lib/report-utils";
import { Calendar } from "lucide-react";

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center text-[14px] text-muted-foreground">{children}</div>
  );
}

// 새 창 전용 읽기 전용 보고서 뷰.  사이드바 없이 보고서만 꽉 차게 보여줘 "보면서 작성"에 적합.
// 데이터는 localStorage 로 영속화된 스토어가 새 탭에서 rehydrate 되므로 그대로 사용.
function ReportViewInner() {
  const id = useSearchParams().get("id");
  const hydrated = useAppStore((s) => s._hydrated);
  const reports = useAppStore((s) => s.reports);

  if (!hydrated) return <Center>불러오는 중…</Center>;
  const report = reports.find((r) => r.id === id);
  if (!report) return <Center>보고서를 찾을 수 없습니다.</Center>;

  const html = parseContent(report.content, report.type).html;
  return (
    <div className="min-h-screen bg-background px-5 py-6 sm:px-10">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className="text-[16px] font-semibold text-white">{report.title}</span>
          <span className="text-[13px] text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> 보고일 {reportDate(report)}
          </span>
          <span className="text-[12px] text-muted ml-auto">필요한 내용을 드래그해 복사(Ctrl+C)한 뒤 작성 창에 붙여넣으세요</span>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 overflow-x-auto">
          {html ? (
            // min-w 로 표 형태 유지 — 창이 좁아지면 찌그러지지 않고 가로 스크롤된다.
            <div className="min-w-[1000px]">
              <ReportHtmlViewer html={html} />
            </div>
          ) : (
            <p className="text-[14px] text-muted-foreground py-10 text-center">표시할 내용이 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReportViewPage() {
  return (
    <Suspense fallback={<Center>불러오는 중…</Center>}>
      <ReportViewInner />
    </Suspense>
  );
}
