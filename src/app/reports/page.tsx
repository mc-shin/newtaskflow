"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/AppLayout";
import { useWorkspaceData } from "@/lib/useWorkspaceData";
import { cn } from "@/lib/utils";
import { Plus, FileText, Calendar, User, Eye, FileBarChart, Users } from "lucide-react";
import { TYPE_LABELS, isArchiveReport } from "@/lib/report-utils";

type FilterTab = "all" | "distributed" | "closed";
const TAB_LABELS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "distributed", label: "배포중" },
  { key: "closed", label: "완료" },
];

export default function ReportsPage() {
  const router = useRouter();
  const { reports, users, projects, currentUser, wsDataLoading } = useWorkspaceData();
  const [filterTab, setFilterTab] = useState<FilterTab>("all");

  const isAdminOrManager = currentUser?.role === "admin" || currentUser?.role === "final_manager" || currentUser?.role === "mid_manager";
  // Only admin and final_manager can create/distribute new templates.
  const canCreateReport = currentUser?.role === "admin" || currentUser?.role === "final_manager";
  const teamMembers = users.filter((u) => u.role === "member");

  const filteredReports = useMemo(() => {
    // "주간보고 리스트"에 업로드한 보관용 보고서는 워크플로 목록에서 제외(전용 페이지에서만).
    let list = reports.filter((r) => !isArchiveReport(r));

    // Members only see distributed reports
    if (!isAdminOrManager) {
      list = list.filter((r) => r.status === "distributed");
    }

    // Apply tab filter
    if (filterTab === "distributed") list = list.filter((r) => r.status === "distributed");
    if (filterTab === "closed") list = list.filter((r) => r.status === "closed");

    return list;
  }, [reports, filterTab, isAdminOrManager]);

  const getSubmissionCount = (report: typeof reports[0]) => {
    const submissions = report.submissions ? Object.keys(report.submissions).length : 0;
    const total = teamMembers.length;
    return `${submissions}/${total}명 제출`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "template":
        return { label: "양식", className: "bg-muted/30 text-muted-foreground" };
      case "distributed":
        return { label: "배포중", className: "bg-accent/15 text-accent" };
      case "closed":
        return { label: "완료", className: "bg-success/15 text-success" };
      default:
        return { label: status, className: "bg-muted/30 text-muted-foreground" };
    }
  };

  return (
    <AppLayout
      title="보고서"
      description="프로젝트 진행 보고서를 관리하세요"
      actions={
        canCreateReport ? (
          <button
            onClick={() => router.push("/reports/new")}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] bg-accent hover:bg-accent-hover text-white font-medium transition-all"
          >
            <Plus className="w-4 h-4" />
            새 보고서
          </button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <div className="bg-card border border-border rounded-2xl">
          <div className="p-6 border-b border-border flex items-center justify-between">
            <h3 className="text-[18px] font-semibold text-white">보고서 목록</h3>
            <div className="flex gap-1 p-1 bg-background rounded-lg">
              {TAB_LABELS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilterTab(tab.key)}
                  className={cn(
                    "px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors",
                    filterTab === tab.key
                      ? "bg-accent text-white"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-border">
            {filteredReports.length === 0 && (
              <p className="text-muted-foreground text-[14px] py-12 text-center">
                {wsDataLoading ? "불러오는 중…" : "보고서가 없습니다"}
              </p>
            )}
            {filteredReports.map((report) => {
              const author = users.find((u) => u.id === report.authorId);
              const project = projects.find((p) => p.id === report.projectId);
              const badge = getStatusBadge(report.status);

              return (
                <div
                  key={report.id}
                  onClick={() => router.push(`/reports/${report.id}`)}
                  className="p-6 flex items-center gap-4 hover:bg-card-hover/30 transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-lg bg-accent-muted flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-[14px] font-medium text-white truncate">{report.title}</h4>
                      <span
                        className={cn(
                          "text-[12px] px-2.5 py-1 rounded-lg font-medium flex-shrink-0",
                          badge.className
                        )}
                      >
                        {badge.label}
                      </span>
                      <span className="text-[12px] px-2.5 py-1 rounded-lg bg-card border border-border text-muted-foreground flex-shrink-0">
                        {TYPE_LABELS[report.type]}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[13px] text-muted-foreground">
                      {author && (
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          {author.name}
                        </span>
                      )}
                      {project && (
                        <span className="flex items-center gap-1">
                          <FileBarChart className="w-3.5 h-3.5" />
                          {project.name}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {report.createdAt}
                      </span>
                      {isAdminOrManager && report.status !== "template" && (
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {getSubmissionCount(report)}
                        </span>
                      )}
                    </div>
                  </div>
                  <Eye className="w-4 h-4 text-muted flex-shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
