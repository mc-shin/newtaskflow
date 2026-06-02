"use client";

// 보고서 HTML 을 읽기 전용으로 렌더한다.  편집기와 동일한 report-prose + 표/제목 스타일을
// 써서 보기 화면이 작성 화면과 1:1 로 일치한다.  텍스트 선택·복사 가능(드래그 → Ctrl+C).
export default function ReportHtmlViewer({ html }: { html: string }) {
  return (
    <div
      className="text-[14px] text-foreground leading-relaxed
        [&_h1]:text-[20px] [&_h1]:font-bold [&_h1]:text-white [&_h1]:mb-3 [&_h1]:mt-4
        [&_h2]:text-[17px] [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mb-2 [&_h2]:mt-4
        [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mb-2 [&_h3]:mt-3
        [&_p]:mb-1 [&_p]:leading-relaxed
        report-prose
        [&_ul]:mb-1 [&_ul_ul]:mt-1
        [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-1
        [&_li]:mb-1 [&_li]:leading-relaxed
        [&_table]:w-full [&_table]:border-collapse [&_table]:mb-4
        [&_td]:border [&_td]:border-border-hover [&_td]:px-4 [&_td]:py-3 [&_td]:text-[13px] [&_td]:align-top
        [&_th]:border [&_th]:border-border-hover [&_th]:px-4 [&_th]:py-3 [&_th]:text-[13px] [&_th]:font-semibold [&_th]:bg-sidebar-hover [&_th]:text-white
        [&_strong]:font-semibold [&_strong]:text-white
        [&_em]:italic
        [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-2"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
