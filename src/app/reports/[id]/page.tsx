"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import AppLayout from "@/components/AppLayout";
import { FormField, FormTextarea, FormButton } from "@/components/Modal";
import LastWeekButton from "@/components/LastWeekButton";
import { useWorkspaceData } from "@/lib/useWorkspaceData";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Report, ReportStage, User as UserType } from "@/lib/types";
import { ROLE_LABEL, stageForRole } from "@/lib/types";
import { ArrowLeft, Download, Send, Trash2, User, Calendar, FileBarChart, Users, CheckCircle2, ShieldCheck, UserCog, Quote, Pencil, Eye, Plus, RefreshCw } from "lucide-react";
import {
  TEMPLATE_SECTIONS,
  parseContent,
  serializeContent,
  pickLastWeekReport,
  TYPE_LABELS,
} from "@/lib/report-utils";
import type { StructuredContent } from "@/lib/report-utils";
import { toast } from "@/components/Toast";

// Auto-continue numbered/lettered list patterns when Enter is pressed at the end of
// a line that starts with "1. ", "가. ", "1) ", "가) ", or a bullet symbol.
// Tab inserts two spaces so existing templates can be indented further.
const KOREAN_ORDINALS = "가나다라마바사아자차카타파하";
const LINE_BREAK_BLOCK_TAGS = new Set(["p", "div", "li", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "ul", "ol", "table", "tr"]);
function nextKoreanOrdinal(c: string): string | null {
  const i = KOREAN_ORDINALS.indexOf(c);
  if (i < 0 || i >= KOREAN_ORDINALS.length - 1) return null;
  return KOREAN_ORDINALS[i + 1];
}
function detectListContinuation(textBeforeCursor: string): string | null {
  let m = textBeforeCursor.match(/^(\s*)(\d+)\.\s/);
  if (m) return `${m[1]}${parseInt(m[2]) + 1}. `;
  m = textBeforeCursor.match(/^(\s*)(\d+)\)\s/);
  if (m) return `${m[1]}${parseInt(m[2]) + 1}) `;
  m = textBeforeCursor.match(/^(\s*)([가나다라마바사아자차카타파하])\.\s/);
  if (m) {
    const n = nextKoreanOrdinal(m[2]);
    if (n) return `${m[1]}${n}. `;
  }
  m = textBeforeCursor.match(/^(\s*)([가나다라마바사아자차카타파하])\)\s/);
  if (m) {
    const n = nextKoreanOrdinal(m[2]);
    if (n) return `${m[1]}${n}) `;
  }
  m = textBeforeCursor.match(/^(\s*)([•·◆▪▶])\s/);
  if (m) return `${m[1]}${m[2]} `;
  // 3단계 하이픈 — docx 가져오기 시 <p style="margin-left:3.75rem">- text</p> 형태로 들어옴.
  // Enter 후에도 같은 <p> 안에 머무르며 (insertHTML 가 <br> 만 넣음) margin-left 가 그대로
  // 유지되므로, 접두사만 다시 채워주면 3단계가 자연스럽게 이어진다.
  m = textBeforeCursor.match(/^(\s*)([-‐‑–—])\s/);
  if (m) return `${m[1]}${m[2]} `;
  // 2단계 원형 글머리표 — 일부 docx 는 <li> 가 아닌 평문 <p> 로 ○ 를 쓰는 경우가 있어 함께 처리.
  m = textBeforeCursor.match(/^(\s*)([○◦◯])\s/);
  if (m) return `${m[1]}${m[2]} `;
  return null;
}
// Walk back through siblings (and up across inline ancestors) to gather all text on the
// current visual line — bounded by <br>, block elements, or the editor root. Handles
// docx-converted content where the bullet text may live in a sibling span/text node.
function getLineTextBeforeCaret(range: Range, editor: Element): string {
  let text = "";
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    text = (range.startContainer.textContent || "").substring(0, range.startOffset);
  }
  let node: Node | null = range.startContainer;
  outer: while (node && node !== editor) {
    let prev = node.previousSibling;
    while (prev) {
      if (prev.nodeType === Node.ELEMENT_NODE) {
        const tag = (prev as Element).tagName.toLowerCase();
        if (tag === "br" || LINE_BREAK_BLOCK_TAGS.has(tag)) break outer;
        text = (prev.textContent || "") + text;
      } else if (prev.nodeType === Node.TEXT_NODE) {
        text = (prev.textContent || "") + text;
      }
      prev = prev.previousSibling;
    }
    const parent: Node | null = node.parentNode;
    if (!parent || parent === editor) break;
    if (parent.nodeType === Node.ELEMENT_NODE && LINE_BREAK_BLOCK_TAGS.has((parent as Element).tagName.toLowerCase())) break;
    node = parent;
  }
  return text;
}
// Returns the innermost <li> containing `node`, or null if the caret isn't in a list item.
function innermostLi(node: Node | null, editor: Element): HTMLElement | null {
  let cur: Node | null = node;
  while (cur && cur !== editor) {
    if (cur.nodeType === Node.ELEMENT_NODE && (cur as Element).tagName.toLowerCase() === "li") {
      return cur as HTMLElement;
    }
    cur = cur.parentNode;
  }
  return null;
}
// True when the <li> is a leaf (no nested ul/ol) with no visible text.  Pressing
// Enter on such an item makes the browser outdent it one level (the native "exit
// list" gesture) — turning e.g. an empty 3단계 "•" into a 2단계 "나.".  The user does
// NOT want that, so we override it and keep the chosen 단계 (see handleKeyDown).
function isEmptyLeafLi(li: HTMLElement): boolean {
  for (const c of Array.from(li.children)) {
    const t = c.tagName.toLowerCase();
    if (t === "ul" || t === "ol") return false; // 자식 목록이 있으면 leaf 아님
  }
  // 공백·탭·개행 + 폭 없는 문자(ZWSP=200B, ZWNJ=200C, ZWJ=200D, BOM=FEFF)만 있으면 빈 항목.
  const txt = li.textContent || "";
  for (let i = 0; i < txt.length; i++) {
    const code = txt.charCodeAt(i);
    const zeroWidth = code === 0x200b || code === 0x200c || code === 0x200d || code === 0xfeff;
    if (!zeroWidth && txt[i].trim() !== "") return false;
  }
  return true;
}

// Tab indents level 1→2→3 (●→○→-), Shift+Tab outdents 3→2→1→plain.
// 1·2단계는 <ul><li> 깊이 1/2, 3단계는 깊이 3 <li> (직접 입력) 또는 docx 임포트본의
// <p style="margin-left:3.75rem">- ...</p>.  심볼은 CSS의 list-style 깊이 규칙이
// 자동으로 갱신해준다.  반환값=true 면 Tab 키를 소비, false 면 호출자가 폴백 처리.
// Tab/Shift+Tab 단계 전환.  document.execCommand 는 선택 영역에 따라 의도치 않은
// 인접 항목까지 함께 옮기는 경우가 있어, 정확히 커서가 위치한 한 줄만 손대도록
// 수동 DOM 조작으로 구현.  반환값 true → 키 이벤트 소비.
function changeLineLevel(editor: HTMLElement, shiftKey: boolean): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);

  // 커서가 든 블록: <li> 우선(docx 가 <li> 안에 <p> 를 두는 경우 대응), 없으면 <p>.
  let targetBlock: HTMLElement | null = null;
  let pFallback: HTMLElement | null = null;
  for (let cur: Node | null = range.startContainer; cur && cur !== editor; cur = cur.parentNode) {
    if (cur.nodeType === Node.ELEMENT_NODE) {
      const t = (cur as Element).tagName.toLowerCase();
      if (t === "li") { targetBlock = cur as HTMLElement; break; }
      if (t === "p" && !pFallback) pFallback = cur as HTMLElement;
    }
  }
  if (!targetBlock) targetBlock = pFallback;
  if (!targetBlock) return false;

  const moveCaret = (el: Element) => {
    // 항목 "자체 텍스트"의 끝(중첩 ul/ol 앞)에 커서를 둔다.  selectNodeContents+collapse(false)
    // 는 중첩 자식 목록까지 포함해 맨 끝으로 가서 커서가 자식 항목 안으로 튀는 문제가 있다.
    const r = document.createRange();
    let lastOwn: Node | null = null;
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        const t = (n as Element).tagName.toLowerCase();
        if (t === "ul" || t === "ol") break; // 중첩 목록 시작 → 자체 텍스트는 여기까지
      }
      lastOwn = n;
    }
    if (lastOwn && lastOwn.nodeType === Node.TEXT_NODE) r.setStart(lastOwn, (lastOwn.textContent || "").length);
    else if (lastOwn) r.setStartAfter(lastOwn);
    else r.setStart(el, 0);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  };

  // 단계 이동: 인접한 <ul>/<ol>/<p> 블록 묶음(run)을 통째로 평탄화 → 대상 한 줄의 깊이만
  // ±1 → 재구성.  이래야 평문(<p>)↔목록 왕복에도 리스트가 쪼개지지 않아(번호·가나다 카운터
  // 리셋 방지) 다른 항목의 절대 깊이·시각 순서가 보존된다.
  const run = lvlFindRun(targetBlock, editor);
  if (run.length === 0) return false;
  const items = lvlFlatten(run, editor);
  const target = items.find((it) => it.src === targetBlock);
  if (!target) return false;
  const oldDepth = target.depth;
  let newDepth: number;
  if (shiftKey) {
    // 1단계에서 Shift+Tab 으로 0단계(평문)로 내려가지 못하게 막는다.  목록 중간에 평문이
    // 생겨 번호가 끊기는(가./1. 리셋) 현상을 원천 차단 — 평문은 목록 바깥에서만 존재.
    if (oldDepth <= 1) return true; // 더 내릴 수 없음 — 키만 소비
    newDepth = oldDepth - 1;
  } else {
    if (oldDepth >= 4) return true; // 최대 4단계, 키만 소비
    newDepth = oldDepth + 1;
  }
  target.depth = newDepth;
  const { frag, newTarget } = lvlRebuild(items, "ul", targetBlock);
  const parent = run[0].parentNode;
  const anchor = run[run.length - 1].nextSibling;
  for (const n of run) n.remove();
  parent?.insertBefore(frag, anchor);
  if (newTarget) moveCaret(newTarget);
  return true;
}

// ── 단계 이동(Tab/Shift+Tab) 핵심: 평탄화 → 대상 깊이만 ±1 → 트리 재구성 ──
// 리스트를 (항목, 깊이) 평탄 배열로 만들고, 대상 한 줄의 깊이만 바꾼 뒤 트리를 다시
// 짜면, 다른 항목들의 절대 깊이·시각 순서가 항상 보존된다.  깊은 중첩(docx 임포트본)
// 에서도 형제가 떨어져 나가거나 단계 규칙이 깨지지 않는다.
type LvlItem = { src: HTMLElement; depth: number; content: Node[]; isP: boolean };

// li 자체 텍스트(중첩 ul/ol 제외) — 공백·폭없는문자 제거.
function lvlOwnText(li: HTMLElement): string {
  let s = "";
  li.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) s += n.textContent || "";
    else if (n.nodeType === Node.ELEMENT_NODE) {
      const t = (n as Element).tagName.toLowerCase();
      if (t !== "ul" && t !== "ol") s += n.textContent || "";
    }
  });
  return s.replace(/[\s​‌‍﻿]/g, "");
}
function lvlHasChildList(li: HTMLElement): boolean {
  return Array.from(li.children).some((c) => {
    const t = c.tagName.toLowerCase();
    return t === "ul" || t === "ol";
  });
}
// 라벨 없는 구조용 wrapper(빈 wrapper 표시 or 자식 목록만 든 컨테이너)는 평탄화에서 제외.
// 텍스트도 자식도 없는 "빈 항목"(빈 불릿 등)은 실제 항목으로 유지.
function lvlIsStructuralWrapper(li: HTMLElement): boolean {
  if (lvlOwnText(li) !== "") return false;
  if (li.getAttribute("data-empty-wrapper") === "true") return true;
  if (lvlHasChildList(li)) return true;
  return false;
}
// 대상 블록이 속한, 인접한 <ul>/<ol>/<p> 블록 묶음(run)을 셀(td/th) 또는 editor 안에서
// 찾는다.  평문(<p>)도 묶음에 포함해서, p↔목록 왕복 시 리스트가 쪼개지지 않게 한다.
function lvlFindRun(targetBlock: HTMLElement, editor: HTMLElement): HTMLElement[] {
  let topBlock: HTMLElement = targetBlock;
  while (topBlock.parentElement && topBlock.parentElement !== editor) {
    const pt = topBlock.parentElement.tagName.toLowerCase();
    if (pt === "td" || pt === "th") break;
    topBlock = topBlock.parentElement;
  }
  const isBlk = (el: Element | null): boolean => {
    if (!el) return false;
    const t = el.tagName.toLowerCase();
    return t === "ul" || t === "ol" || t === "p";
  };
  let first: HTMLElement = topBlock;
  while (isBlk(first.previousElementSibling)) first = first.previousElementSibling as HTMLElement;
  let last: HTMLElement = topBlock;
  while (isBlk(last.nextElementSibling)) last = last.nextElementSibling as HTMLElement;
  const run: HTMLElement[] = [];
  for (let n: Element | null = first; n; n = n.nextElementSibling) {
    run.push(n as HTMLElement);
    if (n === last) break;
  }
  return run;
}
// run(블록 묶음) → (항목, 깊이) 평탄 배열.  <ul>/<ol> 안의 li 는 ul 깊이대로, <p> 는 depth 0.
function lvlFlatten(run: HTMLElement[], editor: HTMLElement): LvlItem[] {
  const items: LvlItem[] = [];
  const depthOf = (li: HTMLElement): number => {
    let d = 0;
    for (let p: Node | null = li.parentNode; p && p !== editor; p = p.parentNode) {
      if (p.nodeType === Node.ELEMENT_NODE) {
        const t = (p as Element).tagName.toLowerCase();
        if (t === "ul" || t === "ol") d++;
      }
    }
    return d;
  };
  const liContent = (li: HTMLElement): Node[] => {
    let nodes: Node[] = [];
    li.childNodes.forEach((n) => {
      if (n.nodeType === Node.ELEMENT_NODE) {
        const t = (n as Element).tagName.toLowerCase();
        if (t === "ul" || t === "ol") return; // 중첩 목록은 재구성으로 다시 만든다
      }
      nodes.push(n);
    });
    // <li><p>text</p></li> 형태(단일 <p>)면 풀어서, 나중에 depth 0 으로 갈 때 <p><p> 중첩 방지.
    if (nodes.length === 1 && nodes[0].nodeType === Node.ELEMENT_NODE && (nodes[0] as Element).tagName.toLowerCase() === "p") {
      nodes = Array.from((nodes[0] as Element).childNodes);
    }
    return nodes;
  };
  for (const node of run) {
    const tag = node.tagName.toLowerCase();
    if (tag === "ul" || tag === "ol") {
      node.querySelectorAll("li").forEach((n) => {
        const li = n as HTMLElement;
        if (lvlIsStructuralWrapper(li)) return;
        items.push({ src: li, depth: depthOf(li), content: liContent(li), isP: false });
      });
    } else if (tag === "p") {
      items.push({ src: node, depth: 0, content: Array.from(node.childNodes), isP: true });
    }
  }
  return items;
}
// 평탄 배열 → 중첩 트리.  깊이가 건너뛰면 빈 wrapper li 를 만들어 자리만 차지.
// depth 0 항목은 평문 <p> 로 내보내며 목록을 끊는다.
function lvlRebuild(items: LvlItem[], tag: string, targetSrc: HTMLElement): { frag: DocumentFragment; newTarget: HTMLElement | null } {
  const frag = document.createDocumentFragment();
  let ulAtDepth: Record<number, HTMLElement> = {};
  let lastLiAtDepth: Record<number, HTMLElement> = {};
  let newTarget: HTMLElement | null = null;
  const fresh = () => { ulAtDepth = {}; lastLiAtDepth = {}; };
  const ensureUl = (depth: number): HTMLElement => {
    if (ulAtDepth[depth]) return ulAtDepth[depth];
    if (depth === 1) {
      const ul = document.createElement(tag);
      frag.appendChild(ul);
      ulAtDepth[1] = ul;
      return ul;
    }
    const parentUl = ensureUl(depth - 1);
    let parentLi = lastLiAtDepth[depth - 1];
    if (!parentLi) {
      parentLi = document.createElement("li");
      parentLi.setAttribute("data-empty-wrapper", "true");
      parentLi.setAttribute("data-indent-wrapper", "true");
      parentUl.appendChild(parentLi);
      lastLiAtDepth[depth - 1] = parentLi;
    }
    const ul = document.createElement(tag);
    parentLi.appendChild(ul);
    ulAtDepth[depth] = ul;
    return ul;
  };
  for (const it of items) {
    const d = it.depth;
    if (d <= 0) {
      fresh();
      const p = document.createElement("p");
      // 원래 <p> 였던 항목만 속성(스타일 등) 보존 — li→p 로 바뀐 항목은 깨끗한 <p>.
      if (it.isP) for (const a of Array.from(it.src.attributes)) p.setAttribute(a.name, a.value);
      it.content.forEach((n) => p.appendChild(n.cloneNode(true)));
      frag.appendChild(p);
      if (it.src === targetSrc) newTarget = p;
      continue;
    }
    const ul = ensureUl(d);
    const li = document.createElement("li");
    it.content.forEach((n) => li.appendChild(n.cloneNode(true)));
    ul.appendChild(li);
    lastLiAtDepth[d] = li;
    for (const k of Object.keys(ulAtDepth)) if (+k > d) delete ulAtDepth[+k];
    for (const k of Object.keys(lastLiAtDepth)) if (+k > d) delete lastLiAtDepth[+k];
    if (it.src === targetSrc) newTarget = li;
  }
  return { frag, newTarget };
}

function HtmlEditor({ htmlRef, initialHtml }: { htmlRef: React.RefObject<HTMLDivElement | null>; initialHtml: string }) {
  useEffect(() => {
    // 모든 진입 HTML 에 fillEmptyCells 적용 — 빈 <td> 에 placeholder 채워서 커서 진입 보장.
    // 멱등 (이미 placeholder 있으면 건드리지 않음) 이라 여러 번 호출되어도 안전.
    if (htmlRef.current) htmlRef.current.innerHTML = fillEmptyCells(initialHtml);
  }, [initialHtml]); // eslint-disable-line react-hooks/exhaustive-deps

  // 네이티브 mousedown 리스너 (capture phase) — React synthetic event 보다 안정적.
  // 셀의 빈 공간 클릭 시 (1) placeholder 보장 (2) 클릭 후 microtask 에서 커서 명시적 배치.
  // setTimeout 으로 deferring 해서 브라우저 자체 focus/cursor 처리 후 우리가 override.
  useEffect(() => {
    const editor = htmlRef.current;
    if (!editor) return;

    // 셀에 placeholder 강제 설치/교체 — 단, 이미지/svg/iframe 등 의미있는 콘텐츠가 있는
    // 셀은 보존 (로고 셀 등). 보이는 텍스트나 이미지 있는 셀은 그 마지막 자식 반환.
    // 이미 placeholder <p> 가 있으면 그것을 재사용 (innerHTML 다시 비우지 않음 — 두 번째
    // 클릭에서도 같은 노드 재사용해서 cursor 안정적).
    const installPlaceholder = (cell: Element): HTMLElement => {
      if (hasMeaningfulContent(cell)) {
        const last = cell.querySelector(":scope > p:last-of-type");
        return (last || cell) as HTMLElement;
      }
      // 기존 placeholder 가 있으면 재사용
      const existing = cell.querySelector(":scope > p[data-cell-placeholder='true']") as HTMLElement | null;
      if (existing) {
        if (!existing.firstChild || existing.firstChild.nodeType !== Node.TEXT_NODE) {
          existing.textContent = "​";
        }
        return existing;
      }
      cell.innerHTML = "";
      const p = document.createElement("p");
      p.textContent = "​";
      p.setAttribute("data-cell-placeholder", "true");
      p.setAttribute(
        "style",
        "display:block;margin:-0.75rem -1rem;padding:0.75rem 1rem;min-height:1.5em;cursor:text;",
      );
      cell.appendChild(p);
      return p;
    };

    // 초기 DOM 스캔
    editor.querySelectorAll("td, th").forEach((cell) => {
      if (!hasMeaningfulContent(cell)) installPlaceholder(cell);
    });

    // 빈 셀 클릭 시 → placeholder 보장 + 동기적으로 cursor 배치
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const cell = target.closest("td, th");
      if (!cell || !editor.contains(cell)) return;
      if (hasMeaningfulContent(cell)) return; // 의미있는 콘텐츠 있으면 브라우저에 위임

      const placeholder = installPlaceholder(cell);
      e.preventDefault();
      editor.focus();
      const textNode = placeholder.firstChild || placeholder;
      const sel = window.getSelection();
      const offset = textNode.nodeType === Node.TEXT_NODE
        ? (textNode.textContent?.length || 0)
        : 0;
      sel?.collapse(textNode, offset);
    };

    editor.addEventListener("mousedown", handler);
    // click 도 추가 (mousedown 이 묻혀도 click 에서 다시 시도 — 이중 안전망)
    editor.addEventListener("click", handler);
    return () => {
      editor.removeEventListener("mousedown", handler);
      editor.removeEventListener("click", handler);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      const editor = htmlRef.current;
      // 리스트/3단계 위치라면 단계 전환을 시도, 평문이면 공백 2칸 폴백(기존 동작).
      if (editor && changeLineLevel(editor, e.shiftKey)) return;
      if (!e.shiftKey) document.execCommand("insertText", false, "  ");
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      const editor = htmlRef.current;
      if (!editor) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      // 리스트 항목 안에서의 Enter.
      const li = innermostLi(range.startContainer, editor);
      if (li) {
        // 빈 항목에서 Enter 시 브라우저는 한 단계 위로 올려버린다(예: 빈 "•" → "나.").
        // 사용자가 고른 단계를 유지하도록, 같은 단계의 빈 형제 항목을 직접 만든다.
        if (isEmptyLeafLi(li)) {
          e.preventDefault();
          const newLi = document.createElement("li");
          newLi.appendChild(document.createElement("br")); // 빈 항목에 커서가 놓이도록
          li.parentNode?.insertBefore(newLi, li.nextSibling);
          const r = document.createRange();
          r.setStart(newLi, 0);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
        }
        // 내용이 있는 항목은 브라우저 기본 동작(같은 단계 새 항목)이 올바르므로 위임.
        return;
      }
      const before = getLineTextBeforeCaret(range, editor);
      const continuation = detectListContinuation(before);
      if (continuation) {
        e.preventDefault();
        document.execCommand("insertHTML", false, `<br>${continuation}`);
      }
    }
  }

  return (
    <div
      ref={htmlRef}
      contentEditable
      suppressContentEditableWarning
      onKeyDown={handleKeyDown}
      className="w-full min-h-[600px] overflow-y-auto px-6 py-5 bg-background border border-border rounded-xl text-[14px] text-foreground outline-none focus:border-accent transition-colors
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
    />
  );
}


function HtmlViewer({ html }: { html: string }) {
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
      dangerouslySetInnerHTML={{ __html: fillEmptyCells(html) }}
    />
  );
}

function SectionViewer({ sections }: { sections: StructuredContent["sections"] }) {
  return (
    <div className="space-y-6">
      {sections.map((section, i) => (
        <div key={i}>
          <h4 className="text-[15px] font-semibold text-accent mb-2">{section.title}</h4>
          {section.content.trim() ? (
            <p className="text-[14px] text-foreground whitespace-pre-wrap leading-relaxed">{section.content}</p>
          ) : (
            <p className="text-[14px] text-muted-foreground italic">내용이 없습니다</p>
          )}
        </div>
      ))}
    </div>
  );
}

function renderContentToHtml(content: string, reportType: Report["type"]): string {
  let sc: StructuredContent;
  try { sc = JSON.parse(content); } catch { sc = { sections: [{ title: "내용", content }] }; }
  if (sc.html) return sc.html;
  return sc.sections.map((s) =>
    `<h3>${s.title}</h3>` + (s.content.trim() ? `<p>${s.content.replace(/\n/g, "<br>")}</p>` : `<p style="color:#999"><em>내용 없음</em></p>`)
  ).join("");
}

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

async function exportToDoc(report: Report, authorName: string, projectName: string | undefined, parsedContent: StructuredContent, allUsers: { id: string; name: string }[]) {
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


// ─── Admin/Manager: Template View ───────────────────────────────────────────
function AdminTemplateView({ report, parsedContent, onDistribute, onDelete, onBack }: {
  report: Report;
  parsedContent: StructuredContent;
  onDistribute: () => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  return (
    <div className={"space-y-6"}>
      {/* Meta */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[12px] px-2.5 py-1 rounded-lg font-medium bg-muted/30 text-muted-foreground">양식</span>
          <span className="text-[12px] px-2.5 py-1 rounded-lg bg-accent-muted text-accent font-medium">{TYPE_LABELS[report.type]}</span>
          <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Calendar className="w-3.5 h-3.5" />{report.createdAt}
          </span>
        </div>
      </div>

      {/* Template content */}
      <div className="bg-card border border-border rounded-2xl p-6 min-h-[300px]">
        <h3 className="text-[16px] font-semibold text-white mb-4">양식 내용</h3>
        {parsedContent.html ? (
          <HtmlViewer html={parsedContent.html} />
        ) : (
          <SectionViewer sections={parsedContent.sections} />
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <FormButton variant="danger" onClick={onDelete}>
          <Trash2 className="w-4 h-4" />삭제
        </FormButton>
        <FormButton onClick={onDistribute}>
          <Send className="w-4 h-4" />배포
        </FormButton>
      </div>
    </div>
  );
}

type SubmissionEntry = [string, { content: string; submittedAt: string; stage: ReportStage }];

// 빈 <td> 셀에 placeholder 채우기 — contentEditable 에서 커서가 들어가도록.
// 임포트 시점 (reports/new) 에 한번 적용하지만, 기존 저장본 / 머지 결과 / 닫힘 본문 등
// 다른 경로로 들어온 HTML 에도 안전망으로 렌더 시점에 다시 적용.
// 셀에 보존할 의미있는 콘텐츠가 있는지 — 텍스트 외에도 이미지/iframe/embed/svg 등.
// placeholder 로 덮어쓸 때 이 콘텐츠들이 사라지지 않도록 보호.
// 셀 텍스트 비교용 정규화 — placeholder 의 zero-width space(ZWSP/ZWNJ/ZWJ/BOM) 와
// 일반 공백을 모두 제거.  trim() 만으로는 ZWSP 가 안 잘려서 빈 placeholder 셀이
// "내용 있음/변경됨" 으로 오판되는 버그를 막는다.  셀 변경 감지·머지 전반에서 공용.
function normCellText(s: string | null | undefined): string {
  return (s || "").replace(/[\s​‌‍﻿]/g, "");
}

function hasMeaningfulContent(cell: Element): boolean {
  // ZWSP/ZWNJ/ZWJ/BOM 같은 invisible 텍스트는 우리가 placeholder 에 넣은 것이므로
  // "텍스트 있음" 판정에서 제외 — 그렇지 않으면 placeholder 가 들어간 셀이 두 번째
  // 클릭부터 "텍스트 셀" 로 잘못 인식되어 우리 핸들러가 건너뛰고 브라우저가 인접
  // 셀로 cursor 를 보내는 버그가 발생한다.
  if (normCellText(cell.textContent)) return true;
  return !!cell.querySelector("img, svg, iframe, video, audio, canvas, embed, object, picture");
}

function fillEmptyCells(html: string): string {
  if (typeof window === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  doc.querySelectorAll("td, th").forEach((cell) => {
    if (hasMeaningfulContent(cell)) return; // 텍스트/이미지/svg 등 있으면 skip
    // 빈 <p></p> 등 cursor 가 안 들어가는 element 들 모두 제거하고 새로 추가
    cell.innerHTML = "";
    const p = doc.createElement("p");
    p.textContent = "​"; // zero-width space (실제 text node — browser cursor 진입 가능)
    p.setAttribute("data-cell-placeholder", "true");
    // 인라인 스타일 — CSS 미적용 환경에서도 placeholder 가 셀 전체 영역 차지
    p.setAttribute(
      "style",
      "display:block;margin:-0.75rem -1rem;padding:0.75rem 1rem;min-height:1.5em;cursor:text;",
    );
    cell.appendChild(p);
  });
  return doc.body.innerHTML;
}

// Merge every submitter's filled-in cell back into a single copy of the template HTML.
// For each <td>, compare submission cell text vs. the original template cell text.
// If a submitter changed it, append `[Name]content` to the merged cell so the result
// shows all contributors side-by-side inside the original table structure.
function mergeHtmlSubmissions(
  templateHtml: string,
  subs: SubmissionEntry[],
  allUsersMap: Record<string, UserType>,
): { html: string; perCellAuthors: Set<string>[] } {
  if (typeof window === "undefined") return { html: templateHtml, perCellAuthors: [] };
  const parser = new DOMParser();
  const originalDoc = parser.parseFromString(templateHtml, "text/html");
  const originalCells = Array.from(originalDoc.querySelectorAll("td"));
  const originalTexts = originalCells.map((td) => normCellText(td.textContent));
  const originalHtmls = originalCells.map((td) => td.innerHTML);

  const aggregatedDoc = parser.parseFromString(templateHtml, "text/html");
  const aggCells = Array.from(aggregatedDoc.querySelectorAll("td"));
  const perCellAuthors: Set<string>[] = aggCells.map(() => new Set());

  for (const [userId, sub] of subs) {
    const user = allUsersMap[userId];
    if (!user) continue;
    let subContent: StructuredContent;
    try { subContent = JSON.parse(sub.content); } catch { continue; }
    if (!subContent.html) continue;

    const subDoc = parser.parseFromString(subContent.html, "text/html");
    const subCells = Array.from(subDoc.querySelectorAll("td"));

    subCells.forEach((subTd, i) => {
      if (i >= aggCells.length) return;
      // visible 텍스트(ZWSP·공백 제거) 기준 비교 — 빈 placeholder 만 있는 셀은
      // subText 가 "" 가 되어 건너뛰므로, 변경 없는 제출에는 칩이 안 붙는다.
      const subText = normCellText(subTd.textContent);
      const origText = originalTexts[i];
      if (!subText || subText === origText) return;

      perCellAuthors[i].add(user.name);
      const safeColor = (user.color || "#6366f1").replace(/[^#0-9a-fA-F]/g, "");
      // 사용자 요청: chip 라벨은 역할만 표시 ([중간관리자], [팀원] 등). 이름 노출 X —
      // 누가 작성했는지보다 "어느 단계의 기여인지" 만 보이도록.
      const roleShort = user.role === "member" ? "팀원"
        : user.role === "mid_manager" ? "중간관리자"
        : (user.role === "final_manager" || user.role === "admin") ? "최종관리자"
        : "관리자";
      const labelChip = `<span style="display:inline-block;font-size:11px;font-weight:600;color:${safeColor};background:${safeColor}22;padding:1px 6px;border-radius:4px;">[${roleShort}]</span>`;
      const labelLine = `<div style="margin-bottom:4px;">${labelChip}</div>`;
      const isFirstAddition = aggCells[i].innerHTML === originalHtmls[i];
      if (isFirstAddition && !origText) {
        // First contribution into an empty cell — no separator needed.
        aggCells[i].innerHTML = `${labelLine}${subTd.innerHTML}`;
      } else {
        // Subsequent contributor — use a real <hr> element so the editor user can click
        // it to select and Backspace/Delete to remove the divider when consolidating.
        aggCells[i].innerHTML += `<hr style="border:0;border-top:1px dashed #475569;margin:12px 0 8px;">${labelLine}${subTd.innerHTML}`;
      }
    });
  }

  return { html: aggregatedDoc.body.innerHTML, perCellAuthors };
}

// 셀 단위 스마트 병합 — 관리자가 편집 중인 현재 본문(currentHtml)은 그대로 두고,
// 소스 제출(subs) 중 "현재 본문 셀에 아직 없는 내용"만 해당 셀에 누적 추가한다.
// mergeHtmlSubmissions(전체 덮어쓰기)와 달리 관리자의 편집을 절대 날리지 않는다.
//  - 제출 셀 텍스트가 원본 양식과 같으면(미변경) 무시
//  - 이미 현재 본문 셀에 포함된 내용이면 중복 추가하지 않음
function smartMergeNewSubmissions(
  currentHtml: string,
  templateHtml: string,
  subs: SubmissionEntry[],
  allUsersMap: Record<string, UserType>,
): string {
  if (typeof window === "undefined") return currentHtml;
  const parser = new DOMParser();
  const curDoc = parser.parseFromString(currentHtml, "text/html");
  const curCells = Array.from(curDoc.querySelectorAll("td"));
  const origTexts = Array.from(parser.parseFromString(templateHtml, "text/html").querySelectorAll("td"))
    .map((td) => normCellText(td.textContent));

  for (const [userId, sub] of subs) {
    const user = allUsersMap[userId];
    if (!user) continue;
    let subContent: StructuredContent;
    try { subContent = JSON.parse(sub.content); } catch { continue; }
    if (!subContent.html) continue;
    const subCells = Array.from(parser.parseFromString(subContent.html, "text/html").querySelectorAll("td"));
    const safeColor = (user.color || "#6366f1").replace(/[^#0-9a-fA-F]/g, "");
    const roleShort = user.role === "member" ? "팀원"
      : user.role === "mid_manager" ? "중간관리자"
      : (user.role === "final_manager" || user.role === "admin") ? "최종관리자" : "관리자";
    const labelLine = `<div style="margin-bottom:4px;"><span style="display:inline-block;font-size:11px;font-weight:600;color:${safeColor};background:${safeColor}22;padding:1px 6px;border-radius:4px;">[${roleShort}]</span></div>`;

    subCells.forEach((subTd, i) => {
      if (i >= curCells.length) return;
      const subText = normCellText(subTd.textContent);
      const origText = origTexts[i] || "";
      if (!subText || subText === origText) return;           // 제출에 변경 없음
      const curText = normCellText(curCells[i].textContent);
      if (curText.includes(subText)) return;                  // 이미 본문에 있음 → 중복 추가 안 함
      // 현재 셀이 원본 그대로(빈/미편집)면 separator 없이, 아니면 점선으로 구분해 누적.
      const curEmpty = !curText || curText === origText;
      curCells[i].innerHTML = curEmpty
        ? `${labelLine}${subTd.innerHTML}`
        : `${curCells[i].innerHTML}<hr style="border:0;border-top:1px dashed #475569;margin:12px 0 8px;">${labelLine}${subTd.innerHTML}`;
    });
  }
  return curDoc.body.innerHTML;
}

// After merging team/lower-stage submissions, append an empty "내 본문" workspace at the
// bottom of each cell that already has contributions. Gives the aggregator a clear
// place to click their cursor and start typing below the team members' content.
function appendManagerWorkspaceToCells(
  html: string,
  perCellAuthors: Set<string>[],
  manager: UserType,
): string {
  if (typeof window === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const cells = Array.from(doc.querySelectorAll("td"));
  const safeColor = (manager.color || "#6366f1").replace(/[^#0-9a-fA-F]/g, "");

  cells.forEach((cell, i) => {
    const authors = perCellAuthors[i];
    if (!authors || authors.size === 0) return;          // skip cells with no contributions (e.g., project-name labels)
    if (authors.has(manager.name)) return;               // manager already submitted into this cell — don't add a placeholder
    // <hr> + label + empty <p> — real elements that the editor user can select/backspace.
    const hr = doc.createElement("hr");
    hr.setAttribute("style", "border:0;border-top:1px dashed #475569;margin:12px 0 8px;");
    cell.appendChild(hr);
    const labelWrap = doc.createElement("div");
    labelWrap.setAttribute("style", "margin-bottom:4px;");
    const mgrRoleShort = manager.role === "mid_manager" ? "중간관리자"
      : (manager.role === "final_manager" || manager.role === "admin") ? "최종관리자"
      : "관리자";
    labelWrap.innerHTML = `<span style="display:inline-block;font-size:11px;font-weight:600;color:${safeColor};background:${safeColor}22;padding:1px 6px;border-radius:4px;">[${manager.name} · ${mgrRoleShort}]</span>`;
    cell.appendChild(labelWrap);
    const emptyLine = doc.createElement("p");
    emptyLine.setAttribute("style", "margin:0;min-height:1.5em;");
    emptyLine.innerHTML = "<br>";
    cell.appendChild(emptyLine);
  });

  return doc.body.innerHTML;
}

// Build the initial draft sections for the current user. Pulls from existing submission if any,
// otherwise auto-aggregates from the source-stage submissions, otherwise returns blank sections.
function initialDraftSections(parsedContent: StructuredContent, existing: { content: string } | undefined, sourceSubs: SubmissionEntry[]): { title: string; content: string }[] {
  if (existing) {
    try {
      const parsed = JSON.parse(existing.content) as StructuredContent;
      if (parsed && Array.isArray(parsed.sections)) return parsed.sections;
    } catch { /* ignore */ }
  }
  return parsedContent.sections.map((tmpl) => {
    const additions: string[] = [];
    for (const [, sub] of sourceSubs) {
      let subContent: StructuredContent;
      try { subContent = JSON.parse(sub.content); } catch { continue; }
      const m = subContent.sections.find((s) => s.title === tmpl.title);
      if (m && m.content.trim()) additions.push(m.content.trim());
    }
    return { title: tmpl.title, content: additions.join("\n\n") };
  });
}

// ─── Admin/Manager: Distributed/Closed View (stage-aware, section-grid first) ─
function AdminAggregationView({
  report,
  parsedContent,
  teamMembers,
  midManagers,
  finalManagers,
  currentUser,
  hasMidManagers,
  onClose,
  onExport,
  onAggregate,
  onSaveAggregated,
  onSubmitMyStage,
  canDistributeOrClose,
  isClosed,
}: {
  report: Report;
  parsedContent: StructuredContent;
  teamMembers: UserType[];
  midManagers: UserType[];
  finalManagers: UserType[];
  currentUser: UserType;
  hasMidManagers: boolean;
  onClose: () => void;
  onExport: (override?: StructuredContent) => void;
  onAggregate: () => void;
  onSaveAggregated: (html: string) => void;
  onSubmitMyStage: (content: string, stage: ReportStage) => Promise<void> | void;
  canDistributeOrClose: boolean;
  isClosed: boolean;
}) {
  const myStage = stageForRole(currentUser.role);
  const isHtml = !!parsedContent.html;
  const aggHtmlRef = useRef<HTMLDivElement>(null);
  const myAggHtmlRef = useRef<HTMLDivElement>(null);

  const allMembers: UserType[] = [...teamMembers, ...midManagers, ...finalManagers];
  const allUsersMap: Record<string, UserType> = Object.fromEntries(allMembers.map((u) => [u.id, u]));

  const submissions = report.submissions || {};
  const memberSubs = Object.entries(submissions).filter(([, s]) => s.stage === "member") as SubmissionEntry[];
  const midSubs = Object.entries(submissions).filter(([, s]) => s.stage === "mid") as SubmissionEntry[];
  const finalSubs = Object.entries(submissions).filter(([, s]) => s.stage === "final") as SubmissionEntry[];

  // What does THIS user aggregate from?
  const sourceSubs: SubmissionEntry[] = myStage === "mid"
    ? memberSubs
    : myStage === "final"
      ? (hasMidManagers ? midSubs : memberSubs)
      : [];

  // Full roster of users expected to submit at the source stage (submitted + pending).
  // Lets the panel show "X / Y 명 완료" with both submitter cards and pending placeholders.
  const expectedSubmitters: UserType[] = myStage === "mid"
    ? teamMembers
    : myStage === "final"
      ? (hasMidManagers ? midManagers : teamMembers)
      : [];

  // Lifted editor state — shared by section grid and the submit button.
  const existing = report.submissions?.[currentUser.id];
  const [draftSections, setDraftSections] = useState(() => initialDraftSections(parsedContent, existing, sourceSubs));
  const [submitting, setSubmitting] = useState(false);

  function updateDraftSection(idx: number, value: string) {
    setDraftSections((d) => d.map((s, i) => (i === idx ? { ...s, content: value } : s)));
  }

  function quoteToSection(sectionIdx: number, text: string, authorName: string) {
    if (!text.trim()) return;
    setDraftSections((d) => d.map((s, i) => {
      if (i !== sectionIdx) return s;
      const lines = text.trim().split("\n").map((l) => `> ${l}`).join("\n");
      const block = `${lines}\n— ${authorName}`;
      const prefix = s.content && s.content.trim() ? s.content.trimEnd() + "\n\n" : "";
      return { ...s, content: prefix + block };
    }));
    toast("success", `${authorName}님의 내용을 인용했습니다.`);
  }

  function quoteFullReport(authorName: string, parsedSub: StructuredContent) {
    setDraftSections((d) => d.map((s) => {
      const match = parsedSub.sections.find((ps) => ps.title === s.title);
      if (!match || !match.content.trim()) return s;
      const lines = match.content.trim().split("\n").map((l) => `> ${l}`).join("\n");
      const block = `${lines}\n— ${authorName}`;
      const prefix = s.content && s.content.trim() ? s.content.trimEnd() + "\n\n" : "";
      return { ...s, content: prefix + block };
    }));
    toast("success", `${authorName}님의 보고서 전체를 인용했습니다.`);
  }

  // Build live content from the active editor (or section drafts) so a download
  // reflects what the user is seeing RIGHT NOW, including unsaved tweaks.
  // 단, 마감(isClosed) 상태에서는 에디터가 사라지므로 최종관리자의 최종 제출본을 그대로 export.
  function buildLiveContent(): StructuredContent {
    // 마감 상태 — 최종관리자가 제출·확정한 본문만 export (소스 머지 없이).
    if (isClosed && finalSubs.length > 0) {
      const latest = finalSubs.reduce((a, b) => (a[1].submittedAt >= b[1].submittedAt ? a : b));
      try {
        const parsed = JSON.parse(latest[1].content) as StructuredContent;
        return {
          sections: parsed.sections || parsedContent.sections,
          html: parsed.html || parsedContent.html,
          originalDocxBase64: parsedContent.originalDocxBase64,
        };
      } catch { /* fall through */ }
    }
    if (isHtml) {
      const liveHtml = myAggHtmlRef.current?.innerHTML
        || aggHtmlRef.current?.innerHTML
        || parsedContent.html;
      return {
        sections: parsedContent.sections,
        html: liveHtml,
        originalDocxBase64: parsedContent.originalDocxBase64,
      };
    }
    return { sections: draftSections };
  }

  function handleExportLive() {
    onExport(buildLiveContent());
  }

  async function handleSubmitDraft() {
    setSubmitting(true);
    try {
      const liveHtml = myAggHtmlRef.current?.innerHTML
        || aggHtmlRef.current?.innerHTML
        || (existing ? (() => { try { return (JSON.parse(existing.content) as StructuredContent).html; } catch { return undefined; } })() : undefined)
        || parsedContent.html;
      const content: StructuredContent = isHtml
        ? { sections: parsedContent.sections, html: liveHtml, originalDocxBase64: parsedContent.originalDocxBase64 }
        : { sections: draftSections };
      // Await so 취합 완료 sees the updated submission in store before running merge.
      await onSubmitMyStage(serializeContent(content), myStage);
    } finally {
      setSubmitting(false);
    }
  }

  const submissionCount = memberSubs.length;
  const hasAggregated = isClosed;

  const stageLabel: Record<ReportStage, string> = { member: "팀원", mid: "중간관리자", final: "최종관리자" };

  return (
    <div className="space-y-6">
      {/* Report info header — single row: meta badges on the left, action buttons on the right. */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className={cn(
              "text-[12px] px-2.5 py-1 rounded-lg font-medium",
              isClosed ? "bg-success/15 text-success" : "bg-accent/15 text-accent"
            )}>
              {isClosed ? "완료" : "배포중"}
            </span>
            <span className="text-[12px] px-2.5 py-1 rounded-lg bg-accent-muted text-accent font-medium">{TYPE_LABELS[report.type]}</span>
            <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />{report.createdAt}
            </span>
            {/* 헤더 통계 — 현재 사용자의 source stage 만 표시 (하위 단계 노출 차단):
             *  - 중간관리자: 팀원 통계
             *  - 최종관리자 + 중간관리자 있음: 중간 통계만 (팀원 통계 숨김)
             *  - 최종관리자 + 중간관리자 없음: 팀원 통계 (중간 역할 대행) */}
            {(myStage === "mid" || (myStage === "final" && !hasMidManagers)) && (
              <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <Users className="w-3.5 h-3.5" />팀원 {submissionCount}/{teamMembers.length}명 제출
              </span>
            )}
            {myStage === "final" && hasMidManagers && (
              <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <UserCog className="w-3.5 h-3.5" />중간관리자 {midSubs.length}/{midManagers.length}명 취합
              </span>
            )}
            <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <ShieldCheck className="w-3.5 h-3.5" />최종 {finalSubs.length}/{Math.max(finalManagers.length, 1)}명
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <FormButton variant="secondary" onClick={handleExportLive}>
              <Download className="w-4 h-4" />워드 다운로드
            </FormButton>
            {!isClosed && (
              <FormButton onClick={handleSubmitDraft} disabled={submitting}>
                <Send className="w-4 h-4" />
                {existing ? `내 ${stageLabel[myStage]} 보고서 수정` : `내 ${stageLabel[myStage]} 보고서 제출`}
              </FormButton>
            )}
            {canDistributeOrClose && !isClosed && (
              <FormButton
                onClick={async () => {
                  await handleSubmitDraft();
                  onAggregate();
                  onClose();
                }}
                disabled={submitting}
              >
                <CheckCircle2 className="w-4 h-4" />
                {hasMidManagers ? "취합 완료" : "최종 취합 + 마감"}
              </FormButton>
            )}
          </div>
        </div>
      </div>

      {/* 취합(통합) 화면을 바로 보여준다 — 뷰 전환/원본 양식 토글 없이 통합 편집이 기본. */}
      {/* 섹션 기반 변형: 작성자별 누적을 2단 표로. */}
      {!isHtml && (
        <>
          {!isClosed && sourceSubs.length > 0 && (
            <div className="flex items-center justify-between gap-3 bg-accent/5 border border-accent/20 rounded-xl px-4 py-3">
              <p className="text-[13px] text-foreground">
                <strong className="text-accent">{sourceSubs.length}명</strong>의 제출본을 자동 취합해 아래 textarea에 채워둘 수 있습니다.
              </p>
              <button
                onClick={() => {
                  setDraftSections(initialDraftSections(parsedContent, undefined, sourceSubs));
                  toast("success", "최신 제출본으로 다시 취합했습니다.");
                }}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors text-[12px] font-medium"
                title="현재 작성한 내용을 버리고, 최신 제출본으로 자동 취합 본문을 다시 채웁니다"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                자동 취합 다시 받기
              </button>
            </div>
          )}
          <SectionGridView
            parsedContent={parsedContent}
            sourceSubs={sourceSubs}
            finalSubs={finalSubs}
            allUsersMap={allUsersMap}
            draftSections={draftSections}
            myStage={myStage}
            isClosed={isClosed}
            onUpdateDraftSection={updateDraftSection}
            onQuote={quoteToSection}
          />
        </>
      )}

      {/* HTML 변형: 각 셀에 제출본을 [역할] 라벨과 함께 통합한 편집 화면. */}
      {isHtml && (
        <HtmlMergedView
          templateHtml={parsedContent.html || ""}
          sourceSubs={sourceSubs}
          finalSubs={finalSubs}
          expectedSubmitters={expectedSubmitters}
          allUsersMap={allUsersMap}
          currentUser={currentUser}
          existing={existing}
          myAggHtmlRef={myAggHtmlRef}
          myStage={myStage}
          isClosed={isClosed}
        />
      )}

    </div>
  );
}

// ─── HTML merged view: original .docx table with all submitters merged per cell ──
function HtmlMergedView({
  templateHtml,
  sourceSubs,
  finalSubs,
  expectedSubmitters,
  allUsersMap,
  currentUser,
  existing,
  myAggHtmlRef,
  myStage,
  isClosed,
}: {
  templateHtml: string;
  sourceSubs: SubmissionEntry[];
  finalSubs: SubmissionEntry[];
  expectedSubmitters: UserType[];
  allUsersMap: Record<string, UserType>;
  currentUser: UserType;
  existing: { content: string; submittedAt: string; stage: ReportStage } | undefined;
  myAggHtmlRef: React.RefObject<HTMLDivElement | null>;
  myStage: ReportStage;
  isClosed: boolean;
}) {
  // Compute merged HTML once whenever the source set changes.
  // 빈 <td> 셀에 placeholder 채워서 contentEditable 커서 진입 보장 (모든 렌더 경로).
  const merged = useMemo(() => {
    const m = mergeHtmlSubmissions(templateHtml, sourceSubs, allUsersMap);
    return { ...m, html: fillEmptyCells(m.html) };
  }, [templateHtml, sourceSubs, allUsersMap]);

  // 닫힘 상태에서 표시할 최종본 — 최종관리자가 제출한 깔끔한 본문 그대로.
  // 소스(중간관리자/팀원) 본문을 다시 머지하지 않음.
  const closedFinalHtml = useMemo(() => {
    if (!isClosed || finalSubs.length === 0) return null;
    // 가장 최근의 final 제출본
    const latest = finalSubs.reduce((a, b) => (a[1].submittedAt >= b[1].submittedAt ? a : b));
    try {
      const parsed = JSON.parse(latest[1].content) as StructuredContent;
      return parsed.html ? fillEmptyCells(parsed.html) : null;
    } catch { return null; }
  }, [isClosed, finalSubs]);

  // The aggregating user's editable copy — 본인 제출이 있으면 그것을, 없으면 하위 단계
  // 취합본을 그대로 사용한다.  별도의 "[관리자] 빈 워크스페이스" 는 추가하지 않음 —
  // 사용자가 하위 본문을 직접 편집해서 최종본을 만든다 (사용자 요청: "중간관리자만 보이면 됨").
  const initialMyHtml = useMemo(() => {
    if (existing) {
      try {
        const p = JSON.parse(existing.content) as StructuredContent;
        if (p.html) return fillEmptyCells(p.html);
      } catch { /* ignore */ }
    }
    return merged.html || fillEmptyCells(templateHtml);
  }, [existing, merged.html, templateHtml]);

  const submitterCount = sourceSubs.length;
  const stageLabel: Record<ReportStage, string> = { member: "팀원", mid: "중간관리자", final: "최종관리자" };

  return (
    <div className="space-y-5">
      {/* Closed: 최종관리자의 최종본만 표시 — 소스 머지는 안 함 */}
      {isClosed && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-[15px] font-semibold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              최종 취합본
            </h3>
            <p className="text-[12px] text-muted-foreground mt-1">
              최종관리자가 제출·확정한 본문입니다.
            </p>
          </div>
          <div className="p-6 bg-background/30 overflow-x-auto">
            <HtmlViewer html={closedFinalHtml || merged.html || templateHtml} />
          </div>
        </div>
      )}

      {/* Active: single editable view — merged content is the initial value;
          prominent submitter cards above show who contributed. */}
      {!isClosed && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[15px] font-semibold text-white flex items-center gap-2">
                <Pencil className="w-4 h-4 text-accent" />
                내 {stageLabel[myStage]} 본문 (편집)
              </h3>
              {submitterCount > 0 && (
                <button
                  onClick={() => {
                    if (myAggHtmlRef.current) {
                      // 스마트 병합 — 현재 편집 내용은 보존하고, 제출본 중 본문에 아직 없는
                      // 내용만 해당 셀에 누적 추가.  전체 덮어쓰기(편집 손실) 없음.
                      const mergedHtml = smartMergeNewSubmissions(
                        myAggHtmlRef.current.innerHTML,
                        templateHtml,
                        sourceSubs,
                        allUsersMap,
                      );
                      myAggHtmlRef.current.innerHTML = fillEmptyCells(mergedHtml);
                      toast("success", "새 제출 내용을 추가했습니다 (기존 편집 유지).");
                    }
                  }}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors text-[12px] font-medium"
                  title="현재 편집 내용은 유지하고, 제출본 중 본문에 아직 없는 내용만 추가합니다"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  새 제출 내용 추가
                </button>
              )}
            </div>
          </div>

          {/* Submission status — shows BOTH submitters and pending submitters so the
              manager can quickly see who still needs to be chased up. */}
          {expectedSubmitters.length > 0 && (
            <div className="px-6 py-4 border-b border-border bg-background/30">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                  제출 현황
                </span>
                <span className="text-[12px] text-foreground font-semibold">
                  {sourceSubs.length}
                  <span className="text-muted-foreground font-normal"> / {expectedSubmitters.length}명 완료</span>
                </span>
                <div className="flex-1 max-w-[180px] h-1.5 bg-card rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all",
                      sourceSubs.length === expectedSubmitters.length ? "bg-success" : "bg-accent",
                    )}
                    style={{ width: `${(sourceSubs.length / expectedSubmitters.length) * 100}%` }}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {expectedSubmitters.map((u) => {
                  const entry = sourceSubs.find(([uid]) => uid === u.id);
                  const sub = entry?.[1];
                  const submitted = !!sub;
                  const stageShort = u.role === "member" ? "팀원" : u.role === "mid_manager" ? "중간관리자" : u.role === "final_manager" ? "최종관리자" : "관리자";
                  return (
                    <div
                      key={u.id}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all",
                        submitted ? "border" : "border-2 border-dashed",
                      )}
                      style={submitted
                        ? { borderColor: u.color + "55", backgroundColor: u.color + "12" }
                        : { borderColor: "rgba(239, 68, 68, 0.55)", backgroundColor: "rgba(239, 68, 68, 0.08)" }}
                    >
                      <div className="relative flex-shrink-0">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold"
                          style={{ backgroundColor: submitted ? u.color : "#94a3b8" }}
                        >
                          {u.name[0]}
                        </div>
                        {!submitted && (
                          <div
                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-danger flex items-center justify-center ring-2 ring-card"
                            title="미제출"
                          >
                            <span className="text-white text-[10px] font-bold leading-none">!</span>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold leading-tight text-foreground">
                          {u.name}
                        </div>
                        <div className="text-[10px] leading-tight mt-0.5 flex items-center gap-1">
                          <span className="text-muted-foreground">{stageShort}</span>
                          <span className="text-muted-foreground">·</span>
                          {submitted ? (
                            <span className="flex items-center gap-0.5 text-success font-medium">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              {sub!.submittedAt.split("T")[0]}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-danger text-white font-bold text-[10px] tracking-wide">
                              미제출
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {expectedSubmitters.length === 0 && (
            <div className="px-6 py-4 border-b border-border bg-background/30">
              <p className="text-[12px] text-muted-foreground">
                {myStage === "member"
                  ? "원본 양식 위에서 내용을 작성하세요."
                  : "취합 대상이 되는 하위 단계 사용자가 없습니다."}
              </p>
            </div>
          )}

          <div className="p-6">
            <HtmlEditor htmlRef={myAggHtmlRef} initialHtml={initialMyHtml} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section table: LEFT column = section, RIGHT column = stacked persons ──
// Matches the image: each section is a single row with the heading on the left
// and every author's contribution stacked inside the right cell. Drastically
// shortens vertical scroll vs. one-row-per-person layouts.
function SectionGridView({
  parsedContent,
  sourceSubs,
  finalSubs,
  allUsersMap,
  draftSections,
  myStage,
  isClosed,
  onUpdateDraftSection,
  onQuote,
}: {
  parsedContent: StructuredContent;
  sourceSubs: SubmissionEntry[];
  finalSubs: SubmissionEntry[];
  allUsersMap: Record<string, UserType>;
  draftSections: { title: string; content: string }[];
  myStage: ReportStage;
  isClosed: boolean;
  onUpdateDraftSection: (idx: number, value: string) => void;
  onQuote: (sectionIdx: number, text: string, authorName: string) => void;
}) {
  const stageShort: Record<ReportStage, string> = { member: "팀원", mid: "중간", final: "최종" };

  // Pre-compute letter labels per author once so they stay stable across sections.
  const letterMap = new Map<string, string>();
  sourceSubs.forEach(([uid], i) => letterMap.set(uid, String.fromCharCode(97 + i)));

  // 닫힘 상태에서 표시할 최종본 — 최종관리자가 제출한 sections.
  const closedFinalSections = useMemo(() => {
    if (!isClosed || finalSubs.length === 0) return null;
    const latest = finalSubs.reduce((a, b) => (a[1].submittedAt >= b[1].submittedAt ? a : b));
    try {
      const parsed = JSON.parse(latest[1].content) as StructuredContent;
      return parsed.sections || null;
    } catch { return null; }
  }, [isClosed, finalSubs]);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {parsedContent.sections.map((section, sIdx) => {
        const contribs = sourceSubs
          .map(([userId, sub]) => {
            const u = allUsersMap[userId];
            if (!u) return null;
            const letter = letterMap.get(userId)!;
            let parsed: StructuredContent | null = null;
            try { parsed = JSON.parse(sub.content); } catch { parsed = null; }
            const match = parsed?.sections.find((s) => s.title === section.title);
            return { user: u, letter, content: match?.content || "", stage: sub.stage };
          })
          .filter((c): c is NonNullable<typeof c> => c !== null);

        const written = contribs.filter((c) => c.content.trim()).length;
        const total = contribs.length;
        const isLast = sIdx === parsedContent.sections.length - 1;

        return (
          <div key={sIdx} className={cn("flex flex-col md:flex-row", !isLast && "border-b border-border")}>
            {/* LEFT cell: section heading */}
            <div className="md:w-[200px] md:flex-shrink-0 px-5 py-5 bg-card-hover/30 md:border-r border-border">
              <div className="flex items-baseline gap-2">
                <span className="text-[15px] font-bold text-accent">{sIdx + 1}.</span>
                <h3 className="text-[15px] font-bold text-white leading-snug">{section.title}</h3>
              </div>
              <div className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                {written}/{total}명 작성
              </div>
            </div>

            {/* RIGHT cell: stacked author contributions + my editor.
             *  닫힘 상태에서는 contributions(과정) 숨기고 최종본만 노출. */}
            <div className="flex-1 px-5 py-5 min-w-0">
              {/* Author rows (stacked vertically) — 활성 상태에서만 노출 */}
              {!isClosed && (contribs.length === 0 ? (
                <div className="text-[12px] text-muted italic">
                  {myStage === "mid" ? "아직 팀원이 작성하지 않았습니다." : "아직 하위 단계가 작성하지 않았습니다."}
                </div>
              ) : (
                <div className="space-y-3">
                  {contribs.map(({ user, letter, content, stage }) => {
                    const empty = !content.trim();
                    const canQuote = !isClosed && myStage !== "member" && !empty;
                    return (
                      <div key={user.id} className="group/contrib">
                        {/* Header line: [letter] name (stage)  [+ 인용] */}
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-[13px] whitespace-nowrap" style={{ color: user.color }}>
                            [{letter}]
                          </span>
                          <span className="text-[13px] font-semibold text-white">{user.name}</span>
                          <span className="text-[11px] text-muted-foreground">({stageShort[stage]})</span>
                          {canQuote && (
                            <button
                              onClick={() => onQuote(sIdx, content, user.name)}
                              className="opacity-0 group-hover/contrib:opacity-100 ml-auto text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-all flex items-center gap-0.5 font-medium flex-shrink-0"
                              title="이 내용을 내 본문에 인용"
                            >
                              <Plus className="w-2.5 h-2.5" />
                              인용
                            </button>
                          )}
                        </div>
                        {/* Body: indented content with whitespace preserved */}
                        <div className={cn(
                          "text-[13px] whitespace-pre-wrap leading-relaxed pl-5",
                          empty ? "text-muted italic" : "text-foreground",
                        )}>
                          {empty ? "— 미작성" : content}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* My draft for this section */}
              {!isClosed && (
                <div className={cn("mt-5 pt-4", contribs.length > 0 && "border-t border-border/50")}>
                  <label className="text-[11px] font-semibold text-accent flex items-center gap-1.5 mb-2 uppercase tracking-wider">
                    <Pencil className="w-3 h-3" />
                    내 작성 — {section.title}
                  </label>
                  <FormTextarea
                    rows={4}
                    value={draftSections[sIdx]?.content || ""}
                    onChange={(e) => onUpdateDraftSection(sIdx, e.target.value)}
                    placeholder={
                      myStage === "member"
                        ? `${section.title}에 작성할 내용...`
                        : "위에서 [+ 인용] 버튼으로 내용을 추가하거나 자동 취합본을 검토하세요"
                    }
                  />
                </div>
              )}

              {/* Closed: 최종관리자가 제출한 최종본의 해당 섹션을 그대로 표시 (없으면 내 draft 폴백) */}
              {isClosed && ((closedFinalSections?.[sIdx]?.content?.trim()) || draftSections[sIdx]?.content?.trim()) && (
                <div>
                  <div className="text-[11px] font-semibold text-success flex items-center gap-1.5 mb-2 uppercase tracking-wider">
                    <CheckCircle2 className="w-3 h-3" />
                    최종본 — {section.title}
                  </div>
                  <p className="text-[13px] text-foreground whitespace-pre-wrap leading-relaxed pl-1">
                    {(closedFinalSections?.[sIdx]?.content || draftSections[sIdx]?.content || "").trim()}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Flat text-document person view (image-style: dashed dividers, [a]/[b]/[c]) ─
function StackedPersonView({
  submissions,
  teamMembers,
  midManagers,
  finalManagers,
  sourceSubs,
  parsedContent,
  myStage,
  isClosed,
  onQuoteSection,
  onQuoteFullReport,
}: {
  submissions: Record<string, { content: string; submittedAt: string; stage: ReportStage }>;
  allUsersMap: Record<string, UserType>;
  teamMembers: UserType[];
  midManagers: UserType[];
  finalManagers: UserType[];
  sourceSubs: SubmissionEntry[];
  parsedContent: StructuredContent;
  myStage: ReportStage;
  isClosed: boolean;
  onQuoteSection: (sectionIdx: number, text: string, authorName: string) => void;
  onQuoteFullReport: (authorName: string, parsedSub: StructuredContent) => void;
}) {
  const sourceUserIds = new Set(sourceSubs.map(([uid]) => uid));
  const stageLabel: Record<ReportStage, string> = { member: "팀원", mid: "중간관리자", final: "최종관리자" };
  const isHtml = !!parsedContent.html;
  const hasAnySubmission = Object.keys(submissions).length > 0;

  const [hideEmpty, setHideEmpty] = useState(true);

  // 현재 사용자가 봐야 할 source stage 만 보여준다:
  //  - 중간관리자(myStage=mid): 팀원들의 제출본
  //  - 최종관리자(myStage=final) + 중간관리자 있음: 중간관리자들의 취합본만 (팀원 직접 노출 X)
  //  - 최종관리자(myStage=final) + 중간관리자 없음: 팀원들의 제출본 (중간관리자 역할 대행)
  //  - 팀원(myStage=member) 또는 기타: 전체 (현재 컨텍스트에서는 발생 안 함)
  const hasMid = midManagers.length > 0;
  const ordered: { user: UserType; stage: ReportStage }[] = (() => {
    if (myStage === "mid") return teamMembers.map((u) => ({ user: u, stage: "member" as ReportStage }));
    if (myStage === "final") {
      return hasMid
        ? midManagers.map((u) => ({ user: u, stage: "mid" as ReportStage }))
        : teamMembers.map((u) => ({ user: u, stage: "member" as ReportStage }));
    }
    return [
      ...teamMembers.map((u) => ({ user: u, stage: "member" as ReportStage })),
      ...midManagers.map((u) => ({ user: u, stage: "mid" as ReportStage })),
      ...finalManagers.map((u) => ({ user: u, stage: "final" as ReportStage })),
    ];
  })();

  // For the legend at the bottom.
  const legendEntries: { letter: string; user: UserType; stage: ReportStage; hasSubmission: boolean }[] = [];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 text-[12px]">
        <button
          onClick={() => setHideEmpty((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors",
            hideEmpty
              ? "bg-accent/10 border-accent/30 text-accent"
              : "bg-card border-border text-muted-foreground hover:text-foreground",
          )}
        >
          <Eye className="w-3.5 h-3.5" />
          {hideEmpty ? "미제출자 숨김" : "전체 표시"}
        </button>
        <span className="text-muted">
          {teamMembers.filter((u) => submissions[u.id]).length}/{teamMembers.length} 팀원
          {midManagers.length > 0 && ` · ${midManagers.filter((u) => submissions[u.id]).length}/${midManagers.length} 중간`}
          {finalManagers.length > 0 && ` · ${finalManagers.filter((u) => submissions[u.id]).length}/${finalManagers.length} 최종`}
        </span>
      </div>

      {!hasAnySubmission ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <User className="w-10 h-10 mx-auto mb-3 text-muted opacity-50" />
          <p className="text-[14px] text-muted-foreground">아직 제출된 보고서가 없습니다.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 font-mono text-[13.5px] leading-[1.7]">
          {ordered.map(({ user, stage }, idx) => {
            const letter = String.fromCharCode(97 + idx);
            const sub = submissions[user.id];
            legendEntries.push({ letter, user, stage, hasSubmission: !!sub });
            if (!sub && hideEmpty) return null;

            const isFirst = legendEntries.filter((e, i) => i <= idx && (!hideEmpty || e.hasSubmission)).length === 1;
            const canQuote = !!sub && !isClosed && myStage !== "member" && sourceUserIds.has(user.id);

            let parsedSub: StructuredContent | null = null;
            if (sub) {
              try { parsedSub = JSON.parse(sub.content) as StructuredContent; }
              catch { parsedSub = { sections: [{ title: "내용", content: sub.content }] }; }
            }

            return (
              <div key={user.id} className="group/block">
                {/* Dashed divider before each block (and at the top of the first) */}
                <div className={cn("text-muted-foreground/40 select-none", isFirst ? "mb-2" : "my-4")}>
                  ────────────────────────────────────────────────
                </div>

                {/* Header line: [a] name (stage, date) [전체 인용 button] */}
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-foreground" style={{ color: user.color }}>[{letter}]</span>
                    <span className="font-semibold text-white text-[14px]">{user.name}</span>
                    <span className="text-muted-foreground text-[12px]">
                      ({stageLabel[stage]}{sub ? `, ${sub.submittedAt.split("T")[0]}` : ""})
                    </span>
                    {!sub && (
                      <span className="text-[11px] px-2 py-0.5 rounded bg-danger/10 text-danger">미제출</span>
                    )}
                  </div>
                  {canQuote && parsedSub && (
                    <button
                      onClick={() => onQuoteFullReport(user.name, parsedSub!)}
                      className="opacity-0 group-hover/block:opacity-100 text-[11px] px-2.5 py-1 rounded-md bg-accent/15 text-accent hover:bg-accent/25 transition-all flex items-center gap-1 font-medium font-sans flex-shrink-0"
                      title={`${user.name}님의 모든 섹션을 내 본문에 추가`}
                    >
                      <Quote className="w-3 h-3" />
                      전체 인용
                    </button>
                  )}
                </div>

                {/* Content body */}
                {sub && parsedSub && (
                  isHtml && parsedSub.html ? (
                    <div className="font-sans pl-2">
                      <HtmlViewer html={parsedSub.html} />
                    </div>
                  ) : (
                    <div className="text-foreground">
                      {parsedSub.sections.map((s, sIdx) => {
                        const empty = !s.content.trim();
                        return (
                          <div key={sIdx} className="group/sec mb-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-accent font-semibold whitespace-nowrap">{sIdx + 1}.</span>
                              <span className="text-foreground font-semibold">{s.title}</span>
                              {canQuote && !empty && (
                                <button
                                  onClick={() => onQuoteSection(sIdx, s.content, user.name)}
                                  className="opacity-0 group-hover/sec:opacity-100 text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-all font-sans flex items-center gap-0.5"
                                  title="이 섹션만 내 본문에 인용"
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                  인용
                                </button>
                              )}
                            </div>
                            {!empty && (
                              <div className="text-foreground whitespace-pre-wrap pl-6 text-[13px]">
                                {s.content}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </div>
            );
          })}

          {/* Final dashed divider */}
          <div className="text-muted-foreground/40 select-none mt-4">
            ────────────────────────────────────────────────
          </div>
        </div>
      )}

      {/* Legend: who is [a], [b], [c]... */}
      {hasAnySubmission && (
        <details className="bg-card border border-border rounded-xl px-4 py-3">
          <summary className="cursor-pointer text-[12px] text-muted-foreground hover:text-foreground select-none">
            작성자 라벨 풀이
          </summary>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-[12px]">
            {legendEntries
              .filter((e) => !hideEmpty || e.hasSubmission)
              .map(({ letter, user, stage, hasSubmission }) => (
                <div key={user.id} className="flex items-center gap-2">
                  <span className="font-bold font-mono" style={{ color: user.color }}>[{letter}]</span>
                  <span className="text-foreground">{user.name}</span>
                  <span className="text-muted">({stageLabel[stage]})</span>
                  {!hasSubmission && <span className="text-[10px] text-danger">미제출</span>}
                </div>
              ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ─── Member contribution card with + 인용 button ────────────────────────────
function MemberContribCard({ user, content, stage, canQuote, onQuote }: {
  user: UserType;
  content: string;
  stage: ReportStage;
  canQuote: boolean;
  onQuote: () => void;
}) {
  const stageColor = stage === "member" ? "bg-accent-muted text-accent"
    : stage === "mid" ? "bg-info/15 text-info"
    : "bg-warning/15 text-warning";
  const stageLabel = stage === "member" ? "팀원" : stage === "mid" ? "중간" : "최종";
  const empty = !content.trim();

  return (
    <div className={cn(
      "bg-card border rounded-xl p-4 flex flex-col transition-all",
      empty ? "border-border/60 opacity-70" : "border-border hover:border-accent/40"
    )}>
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] text-white font-bold flex-shrink-0"
          style={{ backgroundColor: user.color }}
        >
          {user.name[0]}
        </div>
        <span className="text-[13px] font-medium text-white truncate">{user.name}</span>
        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium ml-auto flex-shrink-0", stageColor)}>
          {stageLabel}
        </span>
      </div>
      <p className="text-[13px] text-foreground whitespace-pre-wrap flex-1 leading-relaxed mb-3 max-h-[200px] overflow-y-auto">
        {empty ? <span className="text-muted italic">아직 작성하지 않음</span> : content}
      </p>
      {canQuote && !empty && (
        <button
          onClick={onQuote}
          className="self-start text-[11px] px-2.5 py-1 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition-colors flex items-center gap-1 font-medium"
          title={`${user.name}님의 내용을 내 본문에 추가합니다`}
        >
          <Quote className="w-3 h-3" />
          + 인용
        </button>
      )}
    </div>
  );
}

// ─── Helper: per-user stage tab button ──────────────────────────────────────
function StageTab({ user, submission, selected, onClick }: {
  user: UserType;
  submission: { content: string; submittedAt: string; stage: ReportStage } | undefined;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium whitespace-nowrap transition-colors flex-shrink-0",
        selected
          ? "bg-accent text-white"
          : "bg-background border border-border text-muted-foreground hover:text-foreground hover:border-accent/50"
      )}
    >
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] text-white font-medium flex-shrink-0"
        style={{ backgroundColor: user.color }}
      >
        {user.name[0]}
      </div>
      {user.name}
      {submission ? (
        <span className="w-2 h-2 rounded-full bg-success flex-shrink-0" />
      ) : (
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-danger/15 text-danger flex-shrink-0">미제출</span>
      )}
    </button>
  );
}

// ─── My stage editor: shown for current user's stage with auto-aggregation ──
function MyStageEditor({
  report,
  parsedContent,
  currentUser,
  myStage,
  memberSubs,
  midSubs,
  hasMidManagers,
  onSubmit,
}: {
  report: Report;
  parsedContent: StructuredContent;
  currentUser: UserType;
  myStage: ReportStage;
  memberSubs: [string, { content: string; submittedAt: string; stage: ReportStage }][];
  midSubs: [string, { content: string; submittedAt: string; stage: ReportStage }][];
  hasMidManagers: boolean;
  onSubmit: (content: string, stage: ReportStage) => void;
}) {
  const existing = report.submissions?.[currentUser.id];
  const [open, setOpen] = useState(false);

  // Source submissions for auto-aggregation
  const sourceSubs = myStage === "mid"
    ? memberSubs
    : myStage === "final"
      ? (hasMidManagers ? midSubs : memberSubs)
      : [];

  const stageLabel: Record<ReportStage, string> = { member: "팀원", mid: "중간관리자", final: "최종관리자" };

  const isHtml = !!parsedContent.html;

  // Initial content: existing submission, or auto-aggregated from sourceSubs, or empty template
  const buildInitial = (): StructuredContent => {
    if (existing) {
      try {
        const p = JSON.parse(existing.content) as StructuredContent;
        if (p && (Array.isArray(p.sections) || p.html)) return p;
      } catch { /* ignore */ }
      return { sections: [{ title: "내용", content: existing.content }] };
    }
    // Auto-aggregate from sourceSubs
    if (sourceSubs.length > 0) {
      if (isHtml && parsedContent.html) {
        const parser = new DOMParser();
        const aggregatedDoc = parser.parseFromString(parsedContent.html, "text/html");
        const aggCells = Array.from(aggregatedDoc.querySelectorAll("td"));
        const originalCells = Array.from(parser.parseFromString(parsedContent.html, "text/html").querySelectorAll("td"));
        const originalTexts = originalCells.map((td) => normCellText(td.textContent));
        for (const [, sub] of sourceSubs) {
          let subContent: StructuredContent;
          try { subContent = JSON.parse(sub.content); } catch { continue; }
          if (!subContent.html) continue;
          const subDoc = parser.parseFromString(subContent.html, "text/html");
          const subCells = Array.from(subDoc.querySelectorAll("td"));
          subCells.forEach((subTd, i) => {
            if (i >= aggCells.length) return;
            const subText = normCellText(subTd.textContent);
            if (subText && subText !== originalTexts[i]) {
              aggCells[i].innerHTML += `<br>${subTd.innerHTML}`;
            }
          });
        }
        return { sections: parsedContent.sections, html: aggregatedDoc.body.innerHTML, originalDocxBase64: parsedContent.originalDocxBase64 };
      } else {
        const aggregated = parsedContent.sections.map((origSection) => {
          const additions: string[] = [];
          for (const [, sub] of sourceSubs) {
            let subContent: StructuredContent;
            try { subContent = JSON.parse(sub.content); } catch { continue; }
            const m = subContent.sections.find((s) => s.title === origSection.title);
            if (m && m.content.trim()) additions.push(m.content.trim());
          }
          return { ...origSection, content: additions.join("\n\n") };
        });
        return { sections: aggregated };
      }
    }
    return { sections: parsedContent.sections.map((s) => ({ title: s.title, content: "" })) };
  };

  const [draft, setDraft] = useState<StructuredContent>(buildInitial);
  const htmlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setDraft(buildInitial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updateSection = (idx: number, value: string) => {
    setDraft((d) => {
      const next = [...d.sections];
      next[idx] = { ...next[idx], content: value };
      return { ...d, sections: next };
    });
  };

  const handleSubmit = () => {
    const finalContent: StructuredContent = isHtml
      ? { ...draft, html: htmlRef.current?.innerHTML || draft.html }
      : draft;
    onSubmit(serializeContent(finalContent), myStage);
    setOpen(false);
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[16px] font-semibold text-white flex items-center gap-2">
            {myStage === "final" ? <ShieldCheck className="w-4 h-4 text-warning" /> : myStage === "mid" ? <UserCog className="w-4 h-4 text-info" /> : <User className="w-4 h-4 text-accent" />}
            내 {stageLabel[myStage]} 보고서
          </h3>
          <p className="text-[12px] text-muted-foreground mt-1">
            {myStage === "member" && "원본 양식에 맞춰 내용을 작성하세요."}
            {myStage === "mid" && `팀원 ${memberSubs.length}명의 제출을 자동 취합해서 보여드립니다. 검토 후 보완해 제출하세요.`}
            {myStage === "final" && (hasMidManagers
              ? `중간관리자 ${midSubs.length}명의 취합본을 자동 취합해서 보여드립니다.`
              : `중간관리자가 없어 팀원 ${memberSubs.length}명의 제출을 바로 취합해서 보여드립니다.`)}
          </p>
        </div>
        {!open && (
          <FormButton onClick={() => setOpen(true)}>
            <Send className="w-4 h-4" />{existing ? "수정" : "작성"}
          </FormButton>
        )}
      </div>

      {open && (
        <div className="mt-5 space-y-4">
          {isHtml ? (
            <>
              <HtmlEditor htmlRef={htmlRef} initialHtml={draft.html || parsedContent.html || ""} />
              <p className="text-[12px] text-muted">표·서식이 유지됩니다. 영역을 클릭해 직접 수정하세요.</p>
            </>
          ) : (
            <div className="space-y-5">
              {draft.sections.map((section, i) => (
                <FormField key={`section-${i}`} label={section.title}>
                  <FormTextarea
                    rows={6}
                    placeholder={TEMPLATE_SECTIONS[report.type]?.[i]?.placeholder || "내용을 입력하세요..."}
                    value={section.content}
                    onChange={(e) => updateSection(i, e.target.value)}
                  />
                </FormField>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <FormButton variant="secondary" onClick={() => setOpen(false)}>취소</FormButton>
            <FormButton onClick={handleSubmit}>
              <Send className="w-4 h-4" />제출
            </FormButton>
          </div>
        </div>
      )}

      {!open && existing && (
        <div className="mt-4 p-4 bg-background rounded-xl border border-border">
          <p className="text-[12px] text-muted-foreground mb-2">제출일: {existing.submittedAt.split("T")[0]}</p>
          {(() => {
            let sc: StructuredContent;
            try { sc = JSON.parse(existing.content); } catch { sc = { sections: [{ title: "내용", content: existing.content }] }; }
            return sc.html ? <HtmlViewer html={sc.html} /> : <SectionViewer sections={sc.sections} />;
          })()}
        </div>
      )}
    </div>
  );
}

// ─── Member View ────────────────────────────────────────────────────────────
function MemberSubmissionView({ report, parsedContent, currentUserId, onSubmit, isClosed }: {
  report: Report;
  parsedContent: StructuredContent;
  currentUserId: string;
  onSubmit: (content: string, stage: ReportStage) => void;
  isClosed: boolean;
}) {
  const existingSubmission = report.submissions?.[currentUserId];
  const [submitted, setSubmitted] = useState(false);

  // Initialize form from existing submission or empty sections
  const initialSections = useMemo(() => {
    if (existingSubmission) {
      try {
        const parsed = JSON.parse(existingSubmission.content) as StructuredContent;
        if (parsed && Array.isArray(parsed.sections)) return parsed.sections;
      } catch { /* ignore */ }
      return [{ title: "내용", content: existingSubmission.content }];
    }
    // Empty sections matching template structure
    return parsedContent.sections.map((s) => ({ title: s.title, content: "" }));
  }, [existingSubmission, parsedContent.sections]);

  const [sections, setSections] = useState(initialSections);
  const htmlRef = useRef<HTMLDivElement>(null);

  const isHtml = !!parsedContent.html;
  const existingHtml = useMemo(() => {
    if (existingSubmission) {
      try {
        const parsed = JSON.parse(existingSubmission.content) as StructuredContent;
        if (parsed.html) return parsed.html;
      } catch { /* ignore */ }
    }
    // If no existing submission, use the original template HTML so member edits on top of it
    if (isHtml && parsedContent.html) return parsedContent.html;
    return "";
  }, [existingSubmission, isHtml, parsedContent.html]);

  const updateSection = (idx: number, value: string) => {
    setSections((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], content: value };
      return next;
    });
  };

  const handleSubmit = () => {
    let content: string;
    if (isHtml) {
      content = serializeContent({ sections, html: htmlRef.current?.innerHTML || "" });
    } else {
      content = serializeContent({ sections });
    }
    onSubmit(content, "member");
    setSubmitted(true);
  };

  // Read-only for template or closed status
  if (report.status === "template" || isClosed) {
    return (
      <div className={"space-y-6"}>
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className={cn(
              "text-[12px] px-2.5 py-1 rounded-lg font-medium",
              isClosed ? "bg-success/15 text-success" : "bg-muted/30 text-muted-foreground"
            )}>
              {isClosed ? "완료" : "양식"}
            </span>
            <span className="text-[12px] px-2.5 py-1 rounded-lg bg-accent-muted text-accent font-medium">{TYPE_LABELS[report.type]}</span>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 min-h-[300px]">
          {parsedContent.html ? (
            <HtmlViewer html={parsedContent.html} />
          ) : (
            <SectionViewer sections={parsedContent.sections} />
          )}
        </div>
        {existingSubmission && (
          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="text-[16px] font-semibold text-white mb-4">내 제출 내용</h3>
            {(() => {
              let sc: StructuredContent;
              try { sc = JSON.parse(existingSubmission.content); } catch { sc = { sections: [{ title: "내용", content: existingSubmission.content }] }; }
              return sc.html ? <HtmlViewer html={sc.html} /> : <SectionViewer sections={sc.sections} />;
            })()}
          </div>
        )}
      </div>
    );
  }

  // Distributed: editable submission
  if (submitted) {
    return (
      <div className="space-y-6">
        <div className="bg-success/10 border border-success/30 rounded-2xl p-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-3" />
          <h3 className="text-[16px] font-semibold text-white mb-1">제출 완료</h3>
          <p className="text-[14px] text-muted-foreground">보고서가 성공적으로 제출되었습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={"space-y-6"}>
      {/* Original template reference - only for non-HTML (section-based) reports */}
      {!isHtml && (
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-[15px] font-semibold text-white mb-3 flex items-center gap-2">
            <FileBarChart className="w-4 h-4 text-accent" />
            원본 양식 (참고)
          </h3>
          <div className="p-4 bg-background rounded-xl border border-border max-h-[300px] overflow-y-auto">
            <SectionViewer sections={parsedContent.sections} />
          </div>
        </div>
      )}

      {/* Editable area */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="text-[16px] font-semibold text-white mb-4">
          {existingSubmission ? "내 제출 내용 수정" : "보고서 작성"}
        </h3>

        {isHtml ? (
          <div>
            <HtmlEditor htmlRef={htmlRef} initialHtml={existingHtml} />
            <p className="text-[12px] text-muted mt-3">원본 양식 위에서 직접 내용을 작성하세요. 표와 서식이 유지됩니다.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {sections.map((section, i) => (
              <FormField key={`section-${i}`} label={section.title}>
                <FormTextarea
                  rows={6}
                  placeholder={TEMPLATE_SECTIONS[report.type]?.[i]?.placeholder || "내용을 입력하세요..."}
                  value={section.content}
                  onChange={(e) => updateSection(i, e.target.value)}
                />
              </FormField>
            ))}
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <FormButton onClick={handleSubmit}>
          <Send className="w-4 h-4" />제출
        </FormButton>
      </div>
    </div>
  );
}

// ─── Main Page Component ────────────────────────────────────────────────────
export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.id as string;
  const { reports, users, projects, currentUser, distributeReport, closeReport, submitReport, deleteReport, updateReport, addActivity, addNotification, refreshReport, refreshWorkspaceMembers, workspaceId } = useWorkspaceData();

  // 지난주 보기: 보관본(보고일 최신).  현재 보고서는 제외.  LastWeekButton 이 새 창으로 띄운다.
  const lastWeekReport = useMemo(() => pickLastWeekReport(reports.filter((r) => r.id !== reportId)), [reports, reportId]);

  // 초기 로드 게이트 — 새로고침 직후 persist 복원본/빈 store 로 자식(draft useState)이
  // 먼저 초기화돼 버리면, 뒤늦게 도착한 제출 내용이 draft 에 반영되지 않아 "제출본이
  // 사라진" 것처럼 보인다.  refreshReport 완료를 기다린 뒤 자식을 렌더해서, draft
  // useState 초기화 시점에 항상 최신 submissions 가 존재하도록 보장한다.
  const [initialLoaded, setInitialLoaded] = useState(false);
  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    setInitialLoaded(false);
    (async () => {
      // 두 호출을 병렬로(순차 대기의 절반).  캐시가 있으면 화면은 이미 떠 있고 이건 백그라운드 갱신이다.
      await Promise.all([
        refreshReport(reportId),
        workspaceId ? refreshWorkspaceMembers(workspaceId) : Promise.resolve(),
      ]);
      if (!cancelled) setInitialLoaded(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  // Periodic background refresh while the page is open (every 20s).
  // Catches submissions that happen while the manager is still working.
  useEffect(() => {
    if (!reportId) return;
    const t = setInterval(() => { refreshReport(reportId); }, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  const report = reports.find((r) => r.id === reportId);

  // 캐시(store)에 보고서가 이미 있으면 로딩 화면 없이 즉시 렌더하고, 최신 데이터는
  // 백그라운드(refreshReport)로 갱신한다.  목록에서 들어온 경우 store 에 최신 내용·제출본이
  // 이미 있어 즉시 표시해도 정확하다.  store 에 아예 없을 때(콜드 진입)만 잠깐 로딩을 보여준다.
  if (!initialLoaded && !report) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <p className="text-muted-foreground text-[16px]">불러오는 중…</p>
        </div>
      </AppLayout>
    );
  }

  if (!report) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <p className="text-muted-foreground text-[16px]">보고서를 찾을 수 없습니다.</p>
        </div>
      </AppLayout>
    );
  }

  const author = users.find((u) => u.id === report.authorId);
  const project = projects.find((p) => p.id === report.projectId);
  const parsedContent = parseContent(report.content, report.type);

  const role = currentUser?.role;
  const canDistributeOrClose = role === "admin" || role === "final_manager";
  const canManage = canDistributeOrClose || role === "mid_manager";
  const isMember = role === "member";

  const teamMembers = users.filter((u) => u.role === "member");
  const midManagers = users.filter((u) => u.role === "mid_manager");
  const finalManagers = users.filter((u) => u.role === "admin" || u.role === "final_manager");
  const hasMidManagers = midManagers.length > 0;

  const isClosed = report.status === "closed";

  const handleDistribute = () => {
    if (!canDistributeOrClose) {
      toast("error", "배포 권한이 없습니다.");
      return;
    }
    distributeReport(reportId);
    addActivity(`보고서 "${report.title}"을(를) 배포했습니다`, report.title, "report");
    // Notify all writers in the workspace (members + mid + final, excluding self)
    const writerIds = users.filter(u => u.id !== currentUser?.id).map(u => u.id);
    addNotification(writerIds, "report_distributed", "보고서 배포", `"${report.title}" 보고서가 배포되었습니다`, `/reports/${reportId}`);
    toast("success", `"${report.title}" 보고서가 배포되었습니다.`);
  };

  const handleClose = () => {
    closeReport(reportId);
    addActivity(`보고서 "${report.title}" 취합을 완료했습니다`, report.title, "report");
    toast("success", "취합이 완료되었습니다.");
  };

  const handleDelete = () => {
    deleteReport(reportId);
    addActivity(`보고서 삭제`, report.title, "report");
    toast("success", "보고서가 삭제되었습니다.");
    router.push("/reports");
  };

  // AdminAggregationView passes the live editor state in `override` so the download
  // reflects the currently-visible aggregated content (team submissions + manager edits),
  // not the stale `report.content` (which is only updated on "취합 완료").
  const handleExport = async (override?: StructuredContent) => {
    try {
      await exportToDoc(report, author?.name || "알 수 없음", project?.name, override || parsedContent, users);
    } catch (e) {
      console.error("export failed", e);
      toast("error", `다운로드 중 오류가 발생했습니다: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleAggregate = () => {
    // Read FRESH submissions from store — handleSubmitDraft just awaited a backend submit,
    // and the closure-captured `report.submissions` may not yet include it.
    const freshReport = useAppStore.getState().reports.find((r) => r.id === reportId) || report;
    if (!freshReport.submissions || !parsedContent) return;

    if (parsedContent.html) {
      // HTML-based: merge by comparing each <td> content
      const parser = new DOMParser();
      const originalDoc = parser.parseFromString(parsedContent.html, "text/html");
      const originalCells = Array.from(originalDoc.querySelectorAll("td"));
      const originalTexts = originalCells.map((td) => normCellText(td.textContent));

      // Create aggregated doc from original
      const aggregatedDoc = parser.parseFromString(parsedContent.html, "text/html");
      const aggCells = Array.from(aggregatedDoc.querySelectorAll("td"));

      // For each submission, compare cells
      for (const [userId, submission] of Object.entries(freshReport.submissions)) {
        const userName = users.find((u) => u.id === userId)?.name || userId;
        let subContent: StructuredContent;
        try { subContent = JSON.parse(submission.content); } catch { continue; }
        if (!subContent.html) continue;

        const subDoc = parser.parseFromString(subContent.html, "text/html");
        const subCells = Array.from(subDoc.querySelectorAll("td"));

        subCells.forEach((subTd, i) => {
          if (i >= aggCells.length || i >= originalTexts.length) return;
          const subText = normCellText(subTd.textContent);
          const origText = originalTexts[i];

          if (subText && subText !== origText) {
            // Content changed - append submitter's content
            const existing = aggCells[i].innerHTML;
            const isFirstAddition = existing === originalCells[i]?.innerHTML;
            if (isFirstAddition && origText === "") {
              // Original was empty, just add the new content
              aggCells[i].innerHTML = `<p><strong>${userName}</strong></p>${subTd.innerHTML}`;
            } else {
              aggCells[i].innerHTML += `<br><p><strong>${userName}</strong></p>${subTd.innerHTML}`;
            }
          }
        });
      }

      const aggregatedHtml = aggregatedDoc.body.innerHTML;
      const newContent = serializeContent({
        ...parsedContent,
        html: aggregatedHtml,
      });
      updateReport(reportId, { content: newContent });
    } else {
      // Section-based: merge sections
      const aggSections = parsedContent.sections.map((origSection) => {
        const additions: string[] = [];
        for (const [userId, submission] of Object.entries(freshReport.submissions!)) {
          const userName = users.find((u) => u.id === userId)?.name || userId;
          let subContent: StructuredContent;
          try { subContent = JSON.parse(submission.content); } catch { continue; }

          const matchingSection = subContent.sections.find((s) => s.title === origSection.title);
          if (matchingSection && matchingSection.content.trim() && matchingSection.content.trim() !== origSection.content.trim()) {
            additions.push(`${userName}\n${matchingSection.content.trim()}`);
          }
        }

        if (additions.length === 0) return origSection;
        const merged = origSection.content.trim()
          ? origSection.content.trim() + "\n\n" + additions.join("\n\n")
          : additions.join("\n\n");
        return { ...origSection, content: merged };
      });

      updateReport(reportId, {
        content: serializeContent({ ...parsedContent, sections: aggSections }),
      });
    }

    addActivity(`보고서 "${report.title}" 취합 완료`, report.title, "report");
  };

  const handleStageSubmit = async (content: string, stage: ReportStage) => {
    if (!currentUser) return;
    // Await so subsequent steps (취합 완료) can read the just-submitted content from store.
    await submitReport(reportId, currentUser.id, content, stage);
    const stageLabel = stage === "member" ? "팀원" : stage === "mid" ? "중간관리자" : "최종관리자";
    addActivity(`${stageLabel} 보고서 "${report.title}"을(를) 제출했습니다`, report.title, "report");

    // Notify the next stage's writers
    let notifyIds: string[] = [];
    if (stage === "member") {
      // notify mid managers if any, else final managers
      notifyIds = hasMidManagers ? midManagers.map(u => u.id) : finalManagers.map(u => u.id);
    } else if (stage === "mid") {
      notifyIds = finalManagers.map(u => u.id);
    }
    if (notifyIds.length > 0) {
      addNotification(notifyIds, "report_submitted", "보고서 제출",
        `${currentUser?.name}님이 ${stageLabel} 보고서를 제출했습니다`, `/reports/${reportId}`);
    }
    toast("success", "보고서가 성공적으로 제출되었습니다.");
  };

  return (
    <AppLayout
      title={report.title}
      description={`${TYPE_LABELS[report.type]} 보고서 · ${report.createdAt}`}
      actions={
        <div className="flex items-center gap-2">
          <LastWeekButton report={lastWeekReport} />
          <button onClick={() => router.push("/reports")} className="p-2.5 rounded-xl hover:bg-accent/15 hover:text-accent transition-all" title="목록으로">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            onClick={async () => {
              await refreshReport(reportId);
              if (workspaceId) await refreshWorkspaceMembers(workspaceId);
              toast("success", "최신 제출본을 가져왔습니다.");
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent/10 text-accent hover:bg-accent/20 transition-colors text-[13px] font-medium"
            title="다른 사람의 새 제출본을 가져옵니다"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            새 제출 가져오기
          </button>
          {canDistributeOrClose && (
            <button onClick={handleDelete} className="p-2.5 rounded-xl hover:bg-danger/15 transition-colors" title="삭제">
              <Trash2 className="w-4 h-4 text-muted-foreground hover:text-danger" />
            </button>
          )}
        </div>
      }
    >
      {!isMember && currentUser ? (
        report.status === "template" ? (
          <AdminTemplateView
            report={report}
            parsedContent={parsedContent}
            onDistribute={handleDistribute}
            onDelete={handleDelete}
            onBack={() => router.push("/reports")}
          />
        ) : (
          <AdminAggregationView
            report={report}
            parsedContent={parsedContent}
            teamMembers={teamMembers}
            midManagers={midManagers}
            finalManagers={finalManagers}
            currentUser={currentUser}
            hasMidManagers={hasMidManagers}
            onClose={handleClose}
            onExport={handleExport}
            onAggregate={handleAggregate}
            onSaveAggregated={(html) => {
              updateReport(reportId, { content: serializeContent({ ...parsedContent, html }) });
              addActivity(`취합 양식 수정`, report.title, "report");
            }}
            onSubmitMyStage={handleStageSubmit}
            canDistributeOrClose={canDistributeOrClose}
            isClosed={isClosed}
          />
        )
      ) : (
        <MemberSubmissionView
          report={report}
          parsedContent={parsedContent}
          currentUserId={currentUser?.id || ""}
          onSubmit={handleStageSubmit}
          isClosed={isClosed}
        />
      )}
    </AppLayout>
  );
}
