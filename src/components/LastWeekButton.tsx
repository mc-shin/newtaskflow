"use client";

import { History } from "lucide-react";
import { toast } from "./Toast";
import type { Report } from "@/lib/types";

// "지난주 보기" 버튼 — 모달이 아니라 새 창으로 읽기 전용 보고서를 띄운다.
// 새 창이라 작성 화면을 그대로 둔 채 옆에서 보며 작성할 수 있다.
export default function LastWeekButton({ report }: { report: Report | null }) {
  const open = () => {
    if (!report) {
      toast("warning", "보관된 지난주 보고서가 없습니다. '주간보고 리스트'에서 먼저 업로드하세요.");
      return;
    }
    // 주간보고 표 형태가 유지되는 최소 크기로 새 창을 연다(화면보다 크면 화면에 맞춰 축소됨).
    window.open(`/report-view?id=${report.id}`, "_blank", "noopener,noreferrer,width=1200,height=1000");
  };
  return (
    <button
      onClick={open}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium text-muted-foreground hover:bg-accent/15 hover:text-accent transition-all"
      title="지난주 보고서를 새 창에서 보기"
    >
      <History className="w-4 h-4" />
      지난주 보기
    </button>
  );
}
