import type { Report } from "./types";

export interface StructuredContent {
  sections: { title: string; content: string }[];
  html?: string;
  originalDocxBase64?: string; // original .docx file stored as base64 for re-export
  archive?: boolean; // true 면 "주간보고 리스트"에 업로드한 보관용 보고서
}

// "주간보고 리스트"에 업로드된 보관용 보고서인지 판별.  content JSON 안의 archive:true
// 플래그를 전체 파싱 없이 문자열 포함 검사로 가볍게 확인한다.
export function isArchiveReport(report: Report): boolean {
  return typeof report.content === "string" && report.content.includes('"archive":true');
}

// "2026-05-26" / "2026.05.26" / "2026년 5월 26일" 등에서 정렬 가능한 "YYYY-MM-DD" 추출.
function parseDateLike(s: string): string {
  const m = s.match(/(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

// 보고서 본문(html)의 표에서 "보고일" 셀을 찾아, 같은/다음 셀의 날짜를 추출한다.
function extractReportDate(html: string): string {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return "";
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const cells = Array.from(doc.querySelectorAll("td, th"));
    for (let i = 0; i < cells.length; i++) {
      if (!(cells[i].textContent || "").replace(/\s/g, "").includes("보고일")) continue;
      const same = parseDateLike(cells[i].textContent || ""); // "보고일: 2026-05-26" 같은 한 셀
      if (same) return same;
      for (let j = i + 1; j < Math.min(i + 4, cells.length); j++) { // 인접 셀
        const d = parseDateLike(cells[j].textContent || "");
        if (d) return d;
      }
    }
  } catch { /* ignore */ }
  return "";
}

// 정렬·표시용 "보고일".  본문에서 추출하고, 못 찾으면 업로드 날짜(createdAt)로 폴백.
export function reportDate(report: Report): string {
  try {
    const html = parseContent(report.content, report.type).html;
    if (html) {
      const d = extractReportDate(html);
      if (d) return d;
    }
  } catch { /* ignore */ }
  return report.createdAt;
}

// "지난주 보기"에 띄울 보고서 선택: "주간보고 리스트"에 업로드한 보관본 중 보고일이 가장
// 최근인 것.  보관본이 없으면 가장 최근 작성 보고서(업로드일 기준)로 폴백.
export function pickLastWeekReport(reports: Report[]): Report | null {
  const archives = reports
    .filter(isArchiveReport)
    .map((r) => ({ r, d: reportDate(r) }))
    .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
  if (archives.length) return archives[0].r;
  const others = reports
    .filter((r) => !isArchiveReport(r))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return others[0] || null;
}

export interface ReportFormState {
  title: string;
  type: Report["type"];
  projectId: string;
  sections: { title: string; content: string }[];
  status: Report["status"];
  _importedHtml?: string;
  _originalDocxBase64?: string;
}

export const TEMPLATE_SECTIONS: Record<Report["type"], { title: string; placeholder: string }[]> = {
  weekly: [
    { title: "이번 주 완료 작업", placeholder: "이번 주에 완료한 작업을 작성하세요..." },
    { title: "진행 중인 작업", placeholder: "현재 진행 중인 작업을 작성하세요..." },
    { title: "이슈 및 리스크", placeholder: "이슈 사항이나 리스크를 작성하세요..." },
    { title: "다음 주 계획", placeholder: "다음 주 계획을 작성하세요..." },
  ],
  monthly: [
    { title: "주요 성과", placeholder: "이번 달 주요 성과를 작성하세요..." },
    { title: "KPI 달성 현황", placeholder: "KPI 달성 현황을 작성하세요..." },
    { title: "이슈 및 리스크", placeholder: "이슈 사항이나 리스크를 작성하세요..." },
    { title: "다음 달 계획", placeholder: "다음 달 계획을 작성하세요..." },
  ],
  custom: [
    { title: "내용", placeholder: "보고서 내용을 자유롭게 작성하세요..." },
  ],
};

export function buildEmptySections(type: Report["type"]): StructuredContent {
  return { sections: TEMPLATE_SECTIONS[type].map((t) => ({ title: t.title, content: "" })) };
}

export function parseContent(content: string, type: Report["type"]): StructuredContent {
  try {
    const parsed = JSON.parse(content) as StructuredContent;
    if (parsed && Array.isArray(parsed.sections)) return parsed;
  } catch { /* legacy plain-text */ }
  return { sections: [{ title: type === "custom" ? "내용" : "본문", content }] };
}

export function serializeContent(sc: StructuredContent): string {
  return JSON.stringify(sc);
}

export function makeEmptyForm(type: Report["type"] = "weekly"): ReportFormState {
  return {
    title: "",
    type,
    projectId: "",
    sections: buildEmptySections(type).sections,
    status: "template",
  };
}

export function parseTemplateFile(text: string): { title: string; content: string }[] {
  const lines = text.split("\n");
  const sections: { title: string; content: string }[] = [];
  let currentTitle = "";
  let currentContent: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith("##") ||
      trimmed.startsWith("【") ||
      /^\d+\.\s/.test(trimmed) ||
      (trimmed.endsWith(":") && trimmed.length < 50) ||
      (trimmed.endsWith("：") && trimmed.length < 50)
    ) {
      if (currentTitle) {
        sections.push({ title: currentTitle, content: currentContent.join("\n").trim() });
      }
      currentTitle = trimmed.replace(/^#+\s*/, "").replace(/^【|】$/g, "").replace(/^\d+\.\s*/, "").replace(/:$|：$/, "").trim();
      currentContent = [];
    } else if (currentTitle && trimmed) {
      currentContent.push(trimmed);
    }
  }
  if (currentTitle) {
    sections.push({ title: currentTitle, content: currentContent.join("\n").trim() });
  }
  if (sections.length === 0) return [{ title: "내용", content: "" }];
  return sections;
}

export const TYPE_LABELS: Record<string, string> = { weekly: "주간", monthly: "월간", custom: "커스텀" };
