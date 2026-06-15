"use client";

// 보고서 HTML 을 읽기 전용으로 렌더한다.  편집기와 동일한 report-prose + 표/제목 스타일을
// 써서 보기 화면이 작성 화면과 1:1 로 일치한다.  텍스트 선택·복사 가능(드래그 → Ctrl+C).
//
// 복사(Ctrl+C) 시에는 레벨/중첩 리스트 같은 "구조(HTML)" 는 빼고 "내용(텍스트)만" 클립보드에
// 담는다.  이 뷰("지난주 보기")에서 복사해 작성 화면에 붙여넣은 뒤 Tab 으로 단계를 줄 때,
// 따라온 중첩 구조 때문에 내용이 복제되던 문제를 원천 차단한다.  (붙여넣으면 줄바꿈만 있는
// 평문이 들어가고, 단계는 작성 화면에서 Tab 으로 새로 부여한다.)
export default function ReportHtmlViewer({ html }: { html: string }) {
  function handleCopy(e: React.ClipboardEvent<HTMLDivElement>) {
    const text = window.getSelection()?.toString() ?? "";
    if (!text) return;                            // 선택 영역 없음 → 브라우저 기본 동작
    e.preventDefault();
    e.clipboardData.setData("text/plain", text);  // text/html 은 일부러 안 담음 → 내용만 복사
  }
  return (
    <div
      onCopy={handleCopy}
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
