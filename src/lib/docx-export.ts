// Shared docx export — used by both reports/[id] detail page and weekly-archive page.
// Moved verbatim from reports/[id]/page.tsx (no logic change).
import type { Report } from "@/lib/types";
import type { StructuredContent } from "@/lib/report-utils";

// HTML 셀(<td>) 안의 항목들을 순서대로 {text, depth} 로 추출.
// depth = <ul>/<ol> 조상 수.  깊이-3 <p> (margin-left>=3rem) 도 동일하게 depth=3 으로 본다.
// 빈 wrapper <li>(data-empty-wrapper, 또는 자식이 <ul>/<ol> 뿐) 는 항목으로 카운트하지 않는다.
function extractHtmlItemsFromCell(cell: Element): { text: string; depth: number }[] {
  const items: { text: string; depth: number }[] = [];
  const ownText = (el: Element): string => {
    let s = "";
    el.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) s += n.textContent || "";
      else if (n.nodeType === Node.ELEMENT_NODE) {
        const t = (n as Element).tagName.toLowerCase();
        if (t !== "ul" && t !== "ol") s += (n.textContent || "");
      }
    });
    return s.trim();
  };
  const walk = (node: Node, depth: number): void => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "li") {
      const isWrapper = el.getAttribute("data-empty-wrapper") === "true";
      const t = ownText(el);
      // 텍스트가 있으면 자체 항목 — 중첩 ul/ol 이 있더라도 별개의 라인.
      // 텍스트가 없고 자식이 ul/ol 뿐이면 empty wrapper 로 간주 (push 하지 않음).
      const isEmptyHull = !t && el.children.length > 0 && Array.from(el.children).every((c) => {
        const ct = c.tagName.toLowerCase();
        return ct === "ul" || ct === "ol";
      });
      if (!isWrapper && !isEmptyHull && t) {
        items.push({ text: t, depth });
      }
      el.childNodes.forEach((c) => walk(c, depth));
      return;
    }
    if (tag === "ul" || tag === "ol") {
      el.childNodes.forEach((c) => walk(c, depth + 1));
      return;
    }
    if (tag === "p") {
      const t = (el.textContent || "").trim();
      if (t) {
        const ml = (el as HTMLElement).style.marginLeft;
        const isLevel3 = !!(ml && parseFloat(ml) >= 3);
        items.push({ text: t, depth: isLevel3 ? 3 : 0 });
      }
      return;
    }
    el.childNodes.forEach((c) => walk(c, depth));
  };
  walk(cell, 0);
  return items;
}

// XML 셀(<w:tc>) 의 단락들을 순서대로 {text, depth} 로 추출.  HTML 비교용.
function extractXmlItemsFromCell(cellXml: string): { text: string; depth: number }[] {
  const paras = cellXml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
  return paras
    .map((p) => {
      const text = ((p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
        .map((t) => t.match(/>([^<]*)</)?.[1] || "")).join("").trim();
      const ilvlMatch = p.match(/<w:ilvl\s+w:val="(\d+)"/);
      // depth 추론: ilvl 있으면 ilvl+1.  없으면 텍스트 prefix 로:
      //   "1." → depth=1, "가." → depth=2, "●" → depth=3, "-" → depth=4
      let depth = 0;
      if (ilvlMatch) depth = parseInt(ilvlMatch[1]) + 1;
      else if (/^[-‐‑–—]\s/.test(text)) depth = 4;
      else if (/^[•●○◦▪]\s/.test(text)) depth = 3;
      else if (/^[가-힣]+\.\s/.test(text)) depth = 2;
      else if (/^\d+\.\s/.test(text)) depth = 1;
      return { text, depth };
    })
    .filter((it) => it.text);
}

// 다단계 목록 정의의 abstractNumId (기존 양식과 충돌 안 나게 큰 값) + 셀별 numId 시작값.
// 각 셀(프로젝트)마다 별도 numId 를 주고, 그 num 마다 lvlOverride/startOverride 로
// 카운터를 1부터 재시작시킨다(아래 injectListNumbering 참고).  numId 만 다르게 하고
// 같은 abstractNum 을 참조하면 Word 는 카운터를 문서 전체로 이어 매기므로 반드시
// startOverride 가 있어야 셀마다 1. 부터 새로 시작한다.
const LIST_ABSTRACT_ID = 990;
const LIST_NUM_BASE = 991; // 셀별 numId: 991, 992, ...

// numbering.xml 에 1./가./•/- 4단계 목록 정의(abstractNum)와, 각 셀용 num 인스턴스를 주입.
//   ilvl0=decimal "1."  ilvl1=ganada "가."  ilvl2=bullet "•"  ilvl3=bullet "-"
// 들여쓰기는 각 레벨 pPr 의 ind(left): 1단계 0, 이후 360 twips(0.25in)씩 계단식.
function injectListNumbering(numXml: string, numIds: number[]): string {
  let out = numXml;
  // abstractNum 정의 — 한 번만 (멱등).
  if (!out.includes(`w:abstractNumId="${LIST_ABSTRACT_ID}"`)) {
    const markerRpr = `<w:rPr><w:rFonts w:ascii="맑은 고딕" w:eastAsia="맑은 고딕" w:hAnsi="맑은 고딕" w:cs="맑은 고딕"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`;
    const lvl = (ilvl: number, fmt: string, text: string, left: number) =>
      `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/>` +
      `<w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/>` +
      `<w:pPr><w:ind w:left="${left}" w:hanging="360"/></w:pPr>${markerRpr}</w:lvl>`;
    const abstractNum =
      `<w:abstractNum w:abstractNumId="${LIST_ABSTRACT_ID}"><w:multiLevelType w:val="multilevel"/>` +
      lvl(0, "decimal", "%1.", 360) +
      lvl(1, "ganada", "%2.", 720) +
      lvl(2, "bullet", "•", 1080) +
      lvl(3, "bullet", "-", 1440) +
      `</w:abstractNum>`;
    // abstractNum 은 모든 <w:num> 앞에 와야 하므로 첫 <w:num ...> 앞에 삽입.
    out = out.replace(/<w:num\s+w:numId/, `${abstractNum}<w:num w:numId`);
    if (out === numXml) out = out.replace("</w:numbering>", `${abstractNum}</w:numbering>`);
  }
  // 각 셀용 num 인스턴스 — 같은 abstractNum 을 참조하되 lvlOverride/startOverride 로
  // 각 레벨 카운터를 1부터 강제 재시작시킨다.  numId 만 다르게 줘도 Word 는 같은
  // abstractNum 을 쓰면 카운터를 문서 전체로 이어서 매기므로(=프로젝트마다 연속),
  // startOverride 가 있어야 셀(프로젝트)마다 1.,2. 가 새로 시작한다.  이는 Word 가
  // "번호 다시 시작" 시 실제로 생성하는 구조와 동일하다.
  const startOverrides = [0, 1, 2, 3]
    .map((il) => `<w:lvlOverride w:ilvl="${il}"><w:startOverride w:val="1"/></w:lvlOverride>`)
    .join("");
  for (const id of numIds) {
    if (out.includes(`w:numId="${id}"`)) continue;
    out = out.replace(
      "</w:numbering>",
      `<w:num w:numId="${id}"><w:abstractNumId w:val="${LIST_ABSTRACT_ID}"/>${startOverrides}</w:num></w:numbering>`
    );
  }
  return out;
}

// document.xml 에서 최상위 <w:tc> 들만 balanced 하게 추출한다.  단순 non-greedy 정규식
// (/<w:tc>[\s\S]*?<\/w:tc>/g) 은 중첩 테이블(셀 안의 표)에서 외부 <w:tc> 를 첫 내부
// </w:tc> 에서 잘라 불완전한 조각을 만든다.  그 조각을 완전한 셀로 치환하면 </w:tc>
// 짝이 깨져 docx 가 손상(Word 가 못 엶)된다.  depth 추적으로 최상위 셀만 온전히 추출.
function extractTopLevelTcs(xml: string): string[] {
  const cells: string[] = [];
  let depth = 0;
  let start = -1;
  const re = /<w:tc(?:\s[^>]*)?>|<\/w:tc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[0][1] === "/") {
      depth--;
      if (depth === 0 && start >= 0) {
        cells.push(xml.slice(start, m.index + m[0].length));
        start = -1;
      }
    } else {
      if (depth === 0) start = m.index;
      depth++;
    }
  }
  return cells;
}

// document.xml 의 "최상위 표" 행(<w:tr>)만 balanced 추출한다 (중첩 표의 행은 제외).  w:tbl 깊이를 추적.
function extractTopLevelTrs(xml: string): { str: string; start: number; end: number }[] {
  const rows: { str: string; start: number; end: number }[] = [];
  const re = /<w:tbl(?:\s[^>]*)?>|<\/w:tbl>|<w:tr(?:\s[^>]*)?>|<\/w:tr>/g;
  let tblDepth = 0;
  let trStart = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const tag = m[0];
    if (tag.startsWith("<w:tbl")) tblDepth++;
    else if (tag.startsWith("</w:tbl")) tblDepth--;
    else if (tag.startsWith("</w:tr")) {
      if (tblDepth === 1 && trStart >= 0) {
        rows.push({ str: xml.slice(trStart, m.index + tag.length), start: trStart, end: m.index + tag.length });
        trStart = -1;
      }
    } else if (tblDepth === 1 && trStart < 0) {
      trStart = m.index;
    }
  }
  return rows;
}

// 런(<w:r>)의 글자 크기/굵기를 강제한다.  rPr 유무·self-closing 모두 안전 처리(텍스트 런만).
function setRunFmt(frag: string, halfPt: number, bold: boolean): string {
  return frag.replace(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g, (run) => {
    if (!/<w:t[^>]*>/.test(run)) return run; // 이미지/드로잉 런 제외
    const szTags = `<w:sz w:val="${halfPt}"/><w:szCs w:val="${halfPt}"/>`;
    if (/<w:rPr\s*\/>/.test(run)) {
      return run.replace(/<w:rPr\s*\/>/, `<w:rPr>${bold ? "<w:b/>" : ""}${szTags}</w:rPr>`);
    }
    if (/<w:rPr>[\s\S]*?<\/w:rPr>/.test(run)) {
      return run.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/, (_m, inner) => {
        let i = inner.replace(/<w:sz\s+w:val="\d+"\s*\/>/g, "").replace(/<w:szCs\s+w:val="\d+"\s*\/>/g, "");
        if (bold && !/<w:b\s*\/>/.test(i)) i = "<w:b/>" + i;
        return `<w:rPr>${i}${szTags}</w:rPr>`;
      });
    }
    return run.replace(/^(<w:r(?:\s[^>]*)?>)/, `$1<w:rPr>${bold ? "<w:b/>" : ""}${szTags}</w:rPr>`);
  });
}

// 런의 bold 를 명시적으로 끈다(<w:b w:val="0"/>).  스타일·inline bold 모두 무력화하고 크기는 유지.
function unboldRuns(frag: string): string {
  const off = '<w:b w:val="0"/>';
  return frag.replace(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g, (run) => {
    if (!/<w:t[^>]*>/.test(run)) return run;
    if (/<w:rPr\s*\/>/.test(run)) return run.replace(/<w:rPr\s*\/>/, `<w:rPr>${off}</w:rPr>`);
    if (/<w:rPr>[\s\S]*?<\/w:rPr>/.test(run)) {
      return run.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/, (_m, inner) => {
        let i = inner.replace(/<w:b\s*\/>/g, "").replace(/<w:b\s+w:val="[^"]*"\/>/g, "");
        if (/<w:rFonts(?:\s[^>]*)?\/>/.test(i)) i = i.replace(/(<w:rFonts(?:\s[^>]*)?\/>)/, `$1${off}`);
        else if (/<w:rStyle(?:\s[^>]*)?\/>/.test(i)) i = i.replace(/(<w:rStyle(?:\s[^>]*)?\/>)/, `$1${off}`);
        else i = off + i;
        return `<w:rPr>${i}</w:rPr>`;
      });
    }
    return run.replace(/^(<w:r(?:\s[^>]*)?>)/, `$1<w:rPr>${off}</w:rPr>`);
  });
}

// 셀의 세로 정렬을 상단(top)으로 바꾼다 (vAlign=center/bottom → top).  vAlign 이 없으면 기본이 top 이므로 그대로 둠.
function setCellVAlignTop(cell: string): string {
  return cell.replace(/<w:vAlign\s+w:val="[^"]*"\s*\/>/, '<w:vAlign w:val="top"/>');
}

// 헤더 서식 강제: 타이틀(…Weekly Report) 칸 → 20pt bold, 작성자/보고일 행의 칸 → 12pt.
// 편집/재빌드로 서식이 빠져도 다운로드본에서 항상 보장한다.  본문 표는 건드리지 않음.
function enforceHeaderSizes(xml: string): string {
  const textOf = (s: string) => (s.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((t) => t.match(/>([^<]*)</)?.[1] || "").join("");
  const rows = extractTopLevelTrs(xml);
  const colHdrIdx = rows.findIndex((r) => /실적/.test(textOf(r.str)) && /계획/.test(textOf(r.str)));
  let out = xml;
  for (let ri = 0; ri < rows.length; ri++) {
    const rowText = textOf(rows[ri].str);
    const isInfo = /작성자|보고일/.test(rowText);
    const hasTitle = /Weekly\s*Report/i.test(rowText);
    // 본문 표의 "프로젝트/실적/계획/비고" 열 머리행 + 바로 아래 날짜 범위 행
    const isColHdr = /실적/.test(rowText) && /계획/.test(rowText);
    const prevIsColHdr = ri > 0 && /실적/.test(textOf(rows[ri - 1].str)) && /계획/.test(textOf(rows[ri - 1].str));
    // 본문 프로젝트 행(머리행+날짜행 이후) — 첫 칼럼(프로젝트 제목)의 bold 제거 대상
    const isBodyRow = colHdrIdx >= 0 && ri >= colHdrIdx + 2;
    if (!isInfo && !hasTitle && !isColHdr && !prevIsColHdr && !isBodyRow) continue;
    const cells = extractTopLevelTcs(rows[ri].str);
    let newRow = rows[ri].str;
    for (let ci = 0; ci < cells.length; ci++) {
      const cell = cells[ci];
      const ct = textOf(cell);
      let nc = cell;
      if (/Weekly\s*Report/i.test(ct)) nc = setRunFmt(cell, 40, true);                          // 타이틀 20pt bold
      else if (isInfo && ct.trim() !== "") nc = setRunFmt(cell, 24, false);                     // 작성자/보고일 12pt
      else if ((isColHdr || prevIsColHdr) && ct.trim() !== "") nc = setRunFmt(cell, 24, true);  // 실적/계획 머리행 + 날짜행 12pt bold
      else if (isBodyRow && ci === 0 && ct.trim() !== "") nc = unboldRuns(cell);                // 프로젝트 제목(첫 칼럼) bold 제거
      else if (isBodyRow && ci >= 1) nc = setCellVAlignTop(cell);                                // 본문 내용칸 → 세로 상단 정렬
      if (nc !== cell) newRow = newRow.replace(cell, nc);
    }
    if (newRow !== rows[ri].str) out = out.replace(rows[ri].str, newRow);
  }
  return out;
}

// HTML 셀 내용으로 <w:tc> 안의 모든 <w:p> 를 완전 재빌드한다.
// 원본 docx 의 <w:pPr>/<w:rPr> 을 깊이별 템플릿으로 보존해서 스타일/들여쓰기/폰트가 유지된다.
// 텍스트 단순 매칭 방식 대비, 사용자가 항목을 추가/삭제/재배치해도 UI 와 정확히 일치하는 결과가 나온다.
function rebuildCellFromHtml(
  origCell: string,
  htmlCell: Element,
  esc: (s: string) => string,
  numId: number,
): string {
  const htmlItems = extractHtmlItemsFromCell(htmlCell);
  if (htmlItems.length === 0) return origCell;

  const origParas = origCell.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];

  type Tpl = { pPr: string; rPr: string };
  const tplByIlvl: Map<number, Tpl> = new Map();
  let hyphenTpl: Tpl | null = null;
  let plainTpl: Tpl | null = null;
  let defaultNumId = "";

  for (const para of origParas) {
    const ilvlMatch = para.match(/<w:ilvl\s+w:val="(\d+)"/);
    const numIdMatch = para.match(/<w:numId\s+w:val="(\d+)"/);
    const pPr = para.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] || "";
    const firstRun = para.match(/<w:r[ >][\s\S]*?<\/w:r>/)?.[0] || "";
    const rPr = firstRun.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] || "";
    const text = ((para.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map((t) => t.match(/>([^<]*)</)?.[1] || "")).join("").trim();

    if (ilvlMatch) {
      const ilvl = parseInt(ilvlMatch[1]);
      if (!tplByIlvl.has(ilvl)) tplByIlvl.set(ilvl, { pPr, rPr });
      if (!defaultNumId && numIdMatch) defaultNumId = numIdMatch[1];
    } else if (/^[-‐‑–—]\s/.test(text)) {
      if (!hyphenTpl) hyphenTpl = { pPr, rPr };
    } else {
      if (!plainTpl) plainTpl = { pPr, rPr };
    }
  }
  if (!defaultNumId) defaultNumId = "1";

  // 마커(1./가./•/-)는 bakeListBullets 가 텍스트로 박았으므로, Word 자체 번호·불릿이
  // 또 그려지면 "• 1. asdasd" 처럼 이중 마커가 된다.  numPr 뿐 아니라 pStyle(ListParagraph
  // 등 list 스타일)·기존 ind 까지 모두 버리고, depth 별 들여쓰기(ind)만 직접 부여해
  // 깔끔한 계단식 단락을 만든다.  폰트(rPr)는 원본 템플릿에서 보존.
  const stripNumPr = (pPr: string) => pPr.replace(/<w:numPr>[\s\S]*?<\/w:numPr>/g, "");
  void defaultNumId; void hyphenTpl; void tplByIlvl;
  // 본문 폰트 통일 — 프로젝트명 셀과 동일하게 "맑은 고딕" 10pt (sz=half-point → 20=10pt).
  const BODY_RPR = `<w:rPr><w:rFonts w:ascii="맑은 고딕" w:eastAsia="맑은 고딕" w:hAnsi="맑은 고딕" w:cs="맑은 고딕"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`;

  const newParas: string[] = [];
  for (const item of htmlItems) {
    let pPr = "";
    if (item.depth === 0) {
      // 평문 — 양식의 평문 단락 스타일 유지 (numPr 만 안전하게 제거).
      pPr = stripNumPr(plainTpl?.pPr || "");
    } else {
      // Word 다단계 목록(numbering) 문단으로 — ilvl=depth-1, numId=셀별 고유값(이 셀 전용
      // num 인스턴스).  셀마다 다른 numId 라 프로젝트(셀)마다 번호가 1부터 새로 시작한다.
      // 텍스트 prefix 없이 Word 가 자동으로 번호/불릿을 그린다 (Tab·자동번호 동작).
      const ilvl = item.depth - 1;
      pPr = `<w:pPr><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>`;
    }
    // numbering 이 마커를 그리므로 텍스트엔 prefix 가 없어야 한다 (원본 그대로).
    // placeholder 의 zero-width space(ZWSP/ZWNJ/ZWJ/BOM) 잔재만 제거.
    const text = item.text.replace(/[​‌‍﻿]/g, "");
    newParas.push(`<w:p>${pPr}<w:r>${BODY_RPR}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`);
  }

  // tcPr (셀 속성) 보존하고 본문 단락만 교체
  const tcOpening = origCell.match(/^<w:tc[^>]*>/)?.[0] || "<w:tc>";
  const tcPr = origCell.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/)?.[0] || "";
  return tcOpening + tcPr + newParas.join("") + "</w:tc>";
}

// 새 단계 매핑:
//   1단계(depth=1) → "1. " (decimal)
//   2단계(depth=2) → "가. " (hangul)
//   3단계(depth=3) → "● " (disc)
//   4단계(depth=4) → "- " (hyphen)
// CSS 마커는 화면용이고 docx 다운로드 시 사라지므로, 각 항목의 텍스트 앞에 직접 prefix
// 를 박아 넣고 CSS 마커는 list-style:none 으로 꺼서 Word 가 자체 글머리표를 또 그리지
// 않도록 한다.  깊이 1·2 는 형제 li 순번으로 카운터를 매기고, data-empty-wrapper li 는
// 카운터에서 제외 (시각적으로 안 보이는 split wrapper 이므로).
const HANGUL_CHARS = ["가","나","다","라","마","바","사","아","자","차","카","타","파","하"];
function hangulOrd(n: number): string {
  // n 은 1-based.  14 까지는 자모, 15 이상은 가가/가나 식 확장.
  if (n <= HANGUL_CHARS.length) return HANGUL_CHARS[n - 1];
  const q = Math.floor((n - 1) / HANGUL_CHARS.length);
  const r = (n - 1) % HANGUL_CHARS.length;
  return HANGUL_CHARS[q - 1] + HANGUL_CHARS[r];
}

function bakeListBullets(html: string): string {
  if (typeof window === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const liDepth = (li: Element): number => {
    let d = 0;
    for (let p: Node | null = li.parentNode; p && p !== doc.body; p = p.parentNode) {
      if (p.nodeType === Node.ELEMENT_NODE) {
        const t = (p as Element).tagName.toLowerCase();
        if (t === "ul" || t === "ol") d++;
      }
    }
    return d;
  };

  const isEmptyWrapper = (li: Element) =>
    li.getAttribute("data-empty-wrapper") === "true"
    || (li.children.length === 1
        && (li.children[0].tagName.toLowerCase() === "ul" || li.children[0].tagName.toLowerCase() === "ol")
        && !(li.textContent || "").replace(/[\s​‌‍﻿]/g, ""));

  // 각 list (ul/ol) 의 직접 자식 li 들에 인덱스를 부여하여 prefix 결정.
  // 깊이 1 → "1. " 식, 깊이 2 → "가. ", 깊이 3 → "• " (U+2022), 깊이 4 → "- "
  const prefixFor = (depth: number, idx: number): string => {
    if (depth === 1) return `${idx}. `;
    if (depth === 2) return `${hangulOrd(idx)}.  `; // "가." 뒤에 스페이스 2칸
    if (depth === 3) return `• `;
    if (depth >= 4) return `- `;
    return "";
  };

  doc.querySelectorAll("ul, ol").forEach((list) => {
    const lis = Array.from(list.children).filter((c) => c.tagName.toLowerCase() === "li") as HTMLElement[];
    // empty wrapper 는 카운터에서 제외.  실제 visible 항목에만 1, 2, 3… 부여.
    let visibleIdx = 0;
    for (const li of lis) {
      if (isEmptyWrapper(li)) continue;
      visibleIdx++;
      const depth = liDepth(li);
      const prefix = prefixFor(depth, visibleIdx);
      if (!prefix) continue;
      // 첫 자식이 텍스트 노드이고 이미 같은/유사 prefix 로 시작하면 중복 방지.
      const firstText = li.childNodes[0];
      const firstStr = firstText ? (firstText.textContent || "") : "";
      const alreadyHas =
        (depth === 1 && /^\d+\.\s/.test(firstStr)) ||
        (depth === 2 && /^[가-힣]+\.\s/.test(firstStr)) ||
        (depth === 3 && /^[•●○◦▪]\s/.test(firstStr)) ||
        (depth >= 4 && /^[-‐‑–—]\s/.test(firstStr));
      if (!alreadyHas) {
        li.insertBefore(doc.createTextNode(prefix), li.firstChild);
      }
      // Word 가 자체 글머리표를 또 그리지 않도록 마커를 끈다.
      const existing = li.getAttribute("style") || "";
      if (!/list-style/i.test(existing)) {
        const sep = existing && !existing.endsWith(";") ? ";" : "";
        li.setAttribute("style", `${existing}${sep}list-style:none`);
      }
    }
  });
  return doc.body.innerHTML;
}

export async function exportToDoc(report: Report, authorName: string, projectName: string | undefined, parsedContent: StructuredContent, allUsers: { id: string; name: string }[]) {
  const { saveAs } = await import("file-saver");
  const filename = report.title.replace(/[/\\?%*:|"<>]/g, "_");

  // docx 재빌드 경로는 Word numbering(목록 문단)을 사용하므로 텍스트 prefix(bakeListBullets)
  // 를 박지 않는다 — 원본 html 그대로 사용.  prefix 는 numbering 정의가 없는 .doc 폴백에서만.

  // If original docx exists, rebuild it with aggregated content
  if (parsedContent.originalDocxBase64 && parsedContent.html) {
    try {
      const JSZip = await import("jszip");

      // Decode original docx
      const binary = atob(parsedContent.originalDocxBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const zip = await JSZip.loadAsync(bytes);
      let xml = await zip.file("word/document.xml")!.async("string");

      // Extract cell texts from aggregated HTML
      const parser = new DOMParser();
      const htmlDoc = parser.parseFromString(parsedContent.html, "text/html");
      // 최상위 td 만 — 중첩 테이블의 내부 td 는 제외해서 최상위 <w:tc> 와 1:1 로 매칭.
      const htmlCells = Array.from(htmlDoc.querySelectorAll("td")).filter((td) => {
        let anc = td.parentElement;
        while (anc) {
          if (anc.tagName.toLowerCase() === "td") return false;
          anc = anc.parentElement;
        }
        return true;
      });

      // ── 여분 행 제거: html(에디터)에 대응되지 않는 원본 템플릿의 "남는 행"을 다운로드에서 삭제 ──
      // html 셀 수만큼만 채워지고 나머지 원본 행이 빈 채로 다운로드에 붙던 문제(템플릿 행 패딩)를 수정.
      // 안전: 같은 표 안에서 "연속된 완전한 <w:tr>" 만 잘라내 docx 손상을 방지. 이상 시 그대로 둠.
      try {
        const topRows = extractTopLevelTrs(xml);
        let accNonV = 0;     // 누적 (vMerge 제외) 셀 수
        let cutIdx = -1;     // 이 행부터가 여분 행
        for (let ri = 0; ri < topRows.length; ri++) {
          const rowNonV = extractTopLevelTcs(topRows[ri].str).filter((c) => !/<w:vMerge\/>/.test(c)).length;
          if (rowNonV === 0) continue;
          if (accNonV >= htmlCells.length) { cutIdx = ri; break; }
          accNonV += rowNonV;
        }
        if (cutIdx >= 0) {
          // 행 사이에 비공백(</w:tbl> 등)이 나오면 표 경계 → 거기까지만 제거
          let endIdx = topRows.length - 1;
          for (let ri = cutIdx; ri < topRows.length - 1; ri++) {
            if (xml.slice(topRows[ri].end, topRows[ri + 1].start).trim() !== "") { endIdx = ri; break; }
          }
          const cutStart = topRows[cutIdx].start;
          const cutEnd = topRows[endIdx].end;
          const removed = xml.slice(cutStart, cutEnd);
          if (/^\s*(?:<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>\s*)+$/.test(removed)) {
            xml = xml.slice(0, cutStart) + xml.slice(cutEnd);
          }
        }
      } catch (e) { console.error("trailing-row trim skipped", e); }

      // 최상위 <w:tc> 만 balanced 추출 (중첩 테이블 셀의 정규식 절단 방지).
      const xmlCells = extractTopLevelTcs(xml);
      const xmlCellTexts = xmlCells.map(cell => {
        const ts = (cell.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(t => t.match(/>([^<]*)</)?.[1] || "");
        return ts.join("").trim();
      });

      // Build HTML cell text map
      const htmlCellTexts = htmlCells.map(td => td.textContent?.trim() || "");

      // Match XML to HTML by finding corresponding cells via sequential text matching
      // Skip XML cells that are vMerge continuations or image-only
      const xmlToHtml = new Map<number, number>();
      let hIdx = 0;
      for (let xIdx = 0; xIdx < xmlCells.length && hIdx < htmlCells.length; xIdx++) {
        const isVMCont = /<w:vMerge\/>/.test(xmlCells[xIdx]);
        if (isVMCont) continue;
        xmlToHtml.set(xIdx, hIdx);
        hIdx++;
      }

      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      // Strategy: for each cell, compare XML para texts with HTML full text.
      // Find which XML paragraphs' text appears in the HTML cell text.
      // If a para's text is found unchanged in HTML -> keep original XML para.
      // If not found -> the text was modified, need to find the replacement.
      // Any new text not matching any original para -> append as new paragraphs.
      // 각 셀: 구조 비교 후 다르면 HTML 기준으로 완전 재빌드.
      // (이전 부분문자열 매칭 방식은 항목 추가/삭제/재배치 시 텍스트가 합쳐지거나
      //  엉뚱한 슬롯에 들어가는 버그가 있어, UI 와 다운로드본이 불일치했음.)
      // 셀(프로젝트)마다 고유 numId 를 부여 → Word 에서 셀마다 번호가 1부터 새로 시작.
      const usedNumIds: number[] = [];
      let nextNumId = LIST_NUM_BASE;
      for (const [xIdx, hIdx2] of xmlToHtml.entries()) {
        const origCell = xmlCells[xIdx];
        const htmlCellEl = htmlCells[hIdx2];
        if (!htmlCellEl) continue;

        // 중첩 테이블(w:tbl)을 포함한 셀은 재빌드 시 내부 표가 손실/손상되므로 원본 유지.
        if (/<w:tbl[\s>]/.test(origCell)) continue;

        const htmlItems = extractHtmlItemsFromCell(htmlCellEl);
        if (htmlItems.length === 0) continue; // 빈 HTML 셀은 원본 유지

        // 구조 시그니처 비교 — 텍스트만 같은지가 아니라 (text, depth) 시퀀스가 같은지.
        const xmlItems = extractXmlItemsFromCell(origCell);
        const htmlSig = JSON.stringify(htmlItems);
        const xmlSig = JSON.stringify(xmlItems);
        if (htmlSig === xmlSig) continue;

        const newCellXml = rebuildCellFromHtml(origCell, htmlCellEl, esc, nextNumId);
        if (newCellXml !== origCell) {
          xml = xml.replace(origCell, newCellXml);
          usedNumIds.push(nextNumId);
          nextNumId++;
        }
      }

      // 헤더 서식 강제(타이틀 20pt bold / 작성자·보고일 12pt) — 편집·재빌드로 서식이 빠져도 보장.
      xml = enforceHeaderSizes(xml);

      zip.file("word/document.xml", xml);

      // numbering.xml 에 목록 정의(abstractNum) + 각 셀용 num 인스턴스를 주입.
      // 셀마다 다른 numId → Word 가 셀(프로젝트)별로 번호를 1부터 새로 매긴다.
      const numFileObj = zip.file("word/numbering.xml");
      if (numFileObj && usedNumIds.length > 0) {
        const numXml = await numFileObj.async("string");
        zip.file("word/numbering.xml", injectListNumbering(numXml, usedNumIds));
      }

      const blob = await zip.generateAsync({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      saveAs(blob, `${filename}.docx`);
      return;
    } catch (e) {
      console.error("DOCX export failed, falling back to .doc", e);
    }
  }

  // Fallback: Word-compatible HTML as .doc
  // 이 경로는 Word numbering 정의가 없으므로, 마커(1./가./•/-)를 텍스트로 박아 보이게 한다.
  let body = "";
  if (parsedContent.html) {
    try {
      body = bakeListBullets(parsedContent.html);
    } catch {
      body = parsedContent.html;
    }
  } else {
    body = parsedContent.sections.map((s) =>
      `<h3>${s.title}</h3>` + (s.content.trim() ? `<p>${s.content.replace(/\n/g, "<br>")}</p>` : "")
    ).join("");
  }

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><style>
body{font-family:'맑은 고딕',sans-serif;font-size:10pt;line-height:1.5}
table{border-collapse:collapse;width:100%}
td,th{border:1px solid #333;padding:6px 10px;vertical-align:top;font-size:10pt}
h1{font-size:18pt}h2{font-size:14pt}h3{font-size:12pt}
p{margin:3pt 0}ul,ol{margin:3pt 0 3pt 20pt}img{max-width:100%}
</style></head><body>${body}</body></html>`;
  const blob = new Blob(["\ufeff" + html], { type: "application/msword" });
  saveAs(blob, `${filename}.doc`);
}
