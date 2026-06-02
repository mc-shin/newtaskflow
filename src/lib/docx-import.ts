// docx 파일을 보고서용 HTML 로 변환하는 공용 유틸.  작성 페이지의 import 와 동일하게
// mammoth 변환 → 표 열너비(colgroup) 주입 → <ol> 을 <ul> 로(단계 마커 1./가./•/-) →
// 빈 wrapper li 표시(normalizeListDepth) 단계를 거친다.  읽기 전용 보관(주간보고 리스트)
// 용도라 편집 전용 처리(빈 셀 placeholder 등)는 제외한다.

// 모든 <ol> 을 <ul> 로 변환(중첩 깊이 유지).  우리 단계/마커 시스템은 <ul> 깊이만 인식하므로
// <ol> 이면 단계가 깨진다(작성 페이지와 동일 로직).
function convertOrderedListsToUnordered(html: string): string {
  if (typeof window === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  doc.querySelectorAll("ol").forEach((ol) => {
    const ul = doc.createElement("ul");
    for (const attr of Array.from(ol.attributes)) {
      if (attr.name === "type" || attr.name === "start") continue;
      ul.setAttribute(attr.name, attr.value);
    }
    while (ol.firstChild) ul.appendChild(ol.firstChild);
    ol.replaceWith(ul);
  });
  return doc.body.innerHTML;
}

// mammoth 가 만든 빈 wrapper <li>(텍스트 없이 중첩 ul 만 든 것)를 data-empty-wrapper 로
// 표시해 마커가 그려지지 않게 한다(스트레이 불릿 방지).
function normalizeListDepth(html: string): string {
  if (typeof window === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const isEmptyWrapperLi = (li: HTMLElement): boolean => {
    const childList = Array.from(li.children);
    const hasNonListChild = childList.some((c) => {
      const tn = c.tagName.toLowerCase();
      return tn !== "ul" && tn !== "ol";
    });
    if (hasNonListChild) return false;
    let ownText = "";
    li.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) ownText += n.textContent || "";
    });
    if (ownText.replace(/\s| /g, "")) return false;
    return (
      childList.some((c) => {
        const tn = c.tagName.toLowerCase();
        return tn === "ul" || tn === "ol";
      }) || childList.length === 0
    );
  };
  doc.querySelectorAll("li").forEach((node) => {
    const li = node as HTMLElement;
    if (!isEmptyWrapperLi(li)) return;
    const existing = li.getAttribute("style") || "";
    const sep = existing && !existing.endsWith(";") ? ";" : "";
    li.setAttribute("style", `${existing}${sep}list-style:none;margin:0;padding-top:0;padding-bottom:0`);
    li.setAttribute("data-empty-wrapper", "true");
  });
  return doc.body.innerHTML;
}

// docx File → { html, originalDocxBase64 }.  실패 시 null.
export async function importDocxToContent(
  file: File,
): Promise<{ html: string; originalDocxBase64: string } | null> {
  try {
    const mammoth = await import("mammoth");
    const JSZip = await import("jszip");
    const arrayBuffer = await file.arrayBuffer();

    // 1. 원본 표 열너비 추출 (tblGrid → % colgroup)
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docXml = await zip.file("word/document.xml")!.async("string");
    const grids = docXml.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/g) || [];
    const tableWidths: string[][] = grids.map((g) => {
      const cols = g.match(/<w:gridCol w:w="(\d+)"/g) || [];
      const widths = cols.map((c) => parseInt(c.match(/w:w="(\d+)"/)![1]));
      const total = widths.reduce((a, b) => a + b, 0) || 1;
      return widths.map((w) => `${Math.round((w / total) * 100)}%`);
    });

    // 2. mammoth 변환 (한국형 목록 스타일 매핑)
    const styleMap = [
      "p[style-name='List Number'] => ol > li:fresh",
      "p[style-name='List Number 2'] => ol|ol > li:fresh",
      "p[style-name='List Number 3'] => ol|ol|ol > li:fresh",
      "p[style-name='List Number 4'] => ol|ol|ol|ol > li:fresh",
      "p[style-name='List Bullet'] => ul > li:fresh",
      "p[style-name='List Bullet 2'] => ul|ul > li:fresh",
      "p[style-name='List Bullet 3'] => ul|ul|ul > li:fresh",
      "p[style-name='List Bullet 4'] => ul|ul|ul|ul > li:fresh",
      "p[style-name='ListParagraph'] => p.list-para",
      "p[style-name='List Paragraph'] => p.list-para",
    ];
    const htmlResult = await mammoth.convertToHtml(
      { arrayBuffer: await file.arrayBuffer() },
      { styleMap, includeDefaultStyleMap: true, includeEmbeddedStyleMap: true, ignoreEmptyParagraphs: false } as Parameters<typeof mammoth.convertToHtml>[1],
    );

    // 3. 각 표에 원본 열너비 colgroup 주입
    let tableIdx = 0;
    let enrichedHtml = htmlResult.value.replace(/<table>/g, () => {
      const widths = tableWidths[tableIdx++];
      if (!widths) return "<table>";
      const colgroup = "<colgroup>" + widths.map((w) => `<col style="width:${w}">`).join("") + "</colgroup>";
      return "<table>" + colgroup;
    });

    // 4. <ol> → <ul> (단계 마커) + 빈 wrapper li 표시
    enrichedHtml = convertOrderedListsToUnordered(enrichedHtml);
    enrichedHtml = normalizeListDepth(enrichedHtml);

    // 5. 원본 docx 를 base64 로 보관 (재내보내기/참고용)
    const base64 = btoa(new Uint8Array(arrayBuffer).reduce((s, b) => s + String.fromCharCode(b), ""));

    return { html: enrichedHtml, originalDocxBase64: base64 };
  } catch (e) {
    console.error("importDocxToContent failed", e);
    return null;
  }
}
