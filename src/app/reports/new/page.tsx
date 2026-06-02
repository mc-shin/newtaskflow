"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/AppLayout";
import { FormField, FormInput, FormTextarea, FormSelect, FormButton } from "@/components/Modal";
import LastWeekButton from "@/components/LastWeekButton";
import { useWorkspaceData } from "@/lib/useWorkspaceData";
import type { Report } from "@/lib/types";
import { ArrowLeft, Upload, Save, FileText, X } from "lucide-react";
import type { Template } from "@/lib/types";
import {
  TEMPLATE_SECTIONS,
  makeEmptyForm,
  serializeContent,
  parseTemplateFile,
  pickLastWeekReport,
  TYPE_LABELS,
} from "@/lib/report-utils";
import { toast } from "@/components/Toast";
import type { ReportFormState } from "@/lib/report-utils";

// Tab indent + Enter auto-continues numbered/lettered list prefixes.
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
// Tab/Shift+Tab 단계 전환.  document.execCommand("indent"/"outdent") 은 선택 영역에
// 따라 의도치 않은 인접 항목까지 함께 옮기는 경우가 있어, 정확히 커서가 위치한 한 줄만
// 손대도록 수동 DOM 조작으로 구현했다.  반환값이 true 면 키 이벤트를 소비.
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

// Mammoth converts ilvl=1 (Word 2단계) list items into a `<ul><li><ul><li>X</li></ul></li></ul>`
// envelope. The outer `<li>` is empty but still renders a bullet (●) because its parent <ul>
// inherits `list-disc`, which looks like a duplicated parent level next to the real ○ items.
// Root cause: when Word's list is interrupted by a non-list paragraph (e.g. a hand-typed
// "2." heading or "- " sub-bullet), mammoth restarts a fresh <ul>; if the first item after
// the restart is at ilvl=1 it builds a hollow ilvl=0 wrapper to keep nesting depth.
//
// This pass walks every <li> and, when it contains ONLY nested <ul>/<ol> (no text, no other
// elements), hides its bullet and collapses its vertical space so only the real inner items
// remain visible.
// docx 임포트본의 빈 <td></td> 셀에 placeholder 를 채워서 contentEditable 에서 커서가
// 들어갈 수 있게 한다.  mammoth 는 빈 셀을 그대로 비워두는데, 빈 cell 은 브라우저의
// contentEditable 에서 클릭/포커스가 안 잡혀 사용자가 입력 불가능.
// <p><br></p> 를 채워 클릭 가능한 빈 단락을 만들어줌.
function fillEmptyCells(html: string): string {
  if (typeof window === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  doc.querySelectorAll("td, th").forEach((cell) => {
    // 이미 element 자식(p, ul, img 등) 이 있으면 건드리지 않음
    if (cell.children.length > 0) return;
    // 보이는 텍스트 (ZWSP/ZWNJ/ZWJ/BOM 제외) 또는 이미지/svg 등이 있으면 건드리지 않음
    const visible = (cell.textContent || "").replace(/[\s​‌‍﻿]/g, "");
    if (visible) return;
    if (cell.querySelector("img, svg, iframe, video, audio, canvas, embed, object, picture")) return;
    // 빈 셀 — 기존 내용(빈 <p></p> 등 cursor 진입 불가 element 포함) 모두 비우고 새로 추가
    cell.innerHTML = "";
    const p = doc.createElement("p");
    p.textContent = "​"; // zero-width space text node — browser cursor 진입 가능
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

// docx 임포트본의 모든 <ol> 을 <ul> 로 변환(중첩 깊이 그대로 유지).
// mammoth 는 Word 의 "번호 단계"(decimal·ganada 등)를 <ol>, "불릿 단계"를 <ul> 로 만든다.
// 그런데 우리 에디터의 단계/마커 시스템(1./가./•/-)과 Tab·Shift+Tab 은 100% <ul> 깊이만
// 인식한다.  <ol> 은 .report-prose 규칙에 없어 브라우저 기본 십진수로 떨어지고, <ol> 안의
// <ul> 은 조상 <ul> 수가 모자라 단계가 어긋난다(전부 "1." 로 뭉개짐).  그래서 임포트 직후
// 모든 <ol> 을 <ul> 로 통일하면, 깊이 1/2/3/4 가 곧 1./가./•/- 로 렌더되어 Word 의 다단계
// 정의와 일치하고 단계 이동도 정상 동작한다.  (type/start 속성은 ul 에 의미 없어 버림.)
function convertOrderedListsToUnordered(html: string): string {
  if (typeof window === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  // querySelectorAll 은 정적 NodeList — 부모 <ol> 을 먼저 치환해도 (자식을 먼저 옮긴 뒤
  // replaceWith 하므로) 중첩 <ol> 은 문서에 그대로 남아 이어서 처리된다.
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

function normalizeListDepth(html: string): string {
  if (typeof window === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const isEmptyWrapperLi = (li: HTMLElement): boolean => {
    // Has text content (other than whitespace)?  Then it's a real list item.
    const text = (li.textContent || "").replace(/\s| /g, "");
    // li has a real (non-list) child element with text?  Then it's a real list item.
    const childList = Array.from(li.children);
    const hasNonListChild = childList.some((c) => {
      const tn = c.tagName.toLowerCase();
      return tn !== "ul" && tn !== "ol";
    });
    if (hasNonListChild) return false;
    // Only nested lists inside: any direct text?  If the only "text" came from nested li's,
    // li.textContent will include their text — so instead inspect li's OWN text nodes only.
    let ownText = "";
    li.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) ownText += n.textContent || "";
    });
    if (ownText.replace(/\s| /g, "")) return false;
    // If there is no child list and no own text, this is an empty placeholder li — also hide.
    void text;
    return childList.some((c) => {
      const tn = c.tagName.toLowerCase();
      return tn === "ul" || tn === "ol";
    }) || childList.length === 0;
  };

  doc.querySelectorAll("li").forEach((li) => {
    if (!isEmptyWrapperLi(li as HTMLElement)) return;
    const existing = li.getAttribute("style") || "";
    const sep = existing && !existing.endsWith(";") ? ";" : "";
    // list-style:none → no bullet.  margin:0/padding-top:0 → no extra vertical gap.
    li.setAttribute(
      "style",
      `${existing}${sep}list-style:none;margin:0;padding-top:0;padding-bottom:0`,
    );
    li.setAttribute("data-empty-wrapper", "true");
  });

  return doc.body.innerHTML;
}

// docx 임포트본의 "<p>- text</p>" 4단계 평문 단락을 직전 <ul> 의 마지막 <li> 자식
// nested <ul> 로 끌어와서 li 구조로 통일한다.  새 매핑 (1./가./●/-) 에서 "-" 는 4단계
// 이므로 직전 list 의 deepest +1 위치에 들어가야 하는데, findAttachmentLi 가 deepest li
// 까지 들어간 뒤 그 안에 nested ul 을 만들므로 자동으로 deepest+1 깊이가 된다.
// (양식 nesting 이 ●까지면 깊이 4, 가까지면 깊이 3 — deepest 가 짧으면 그 다음 깊이로.)
// 직전 <ul> 이 없는 고립 케이스는 건드리지 않고 applyBulletIndentation 의 fallback 로 넘긴다.
function bakeHyphenParagraphsToListItems(html: string): string {
  if (typeof window === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // 트리에서 deepest 마지막 visible <li> 찾기 — depth-3 attachment 지점.
  function findAttachmentLi(ul: Element): Element | null {
    const lastLi = ul.querySelector(":scope > li:last-child");
    if (!lastLi) return null;
    let nested: Element | null = null;
    for (let c = lastLi.lastElementChild; c; c = c.previousElementSibling) {
      const tg = c.tagName.toLowerCase();
      if ((tg === "ul" || tg === "ol") && c.children.length > 0) { nested = c; break; }
    }
    if (nested) return findAttachmentLi(nested);
    return lastLi;
  }

  // li 의 첫 텍스트 노드(또는 자손)에서 "- " 접두사 제거
  function stripLeadingHyphen(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent || "";
      const stripped = t.replace(/^[-‐‑–—]\s+/, "");
      if (stripped !== t) { node.textContent = stripped; return true; }
      return /^\s*$/.test(t); // 공백만 있으면 다음 노드 탐색 계속
    }
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (stripLeadingHyphen(c)) {
        if (c.nodeType === Node.TEXT_NODE && !(c.textContent || "").trim()) continue;
        return true;
      }
    }
    return false;
  }

  const allPs = Array.from(doc.querySelectorAll("p"));
  const processed = new Set<Element>();

  for (let i = 0; i < allPs.length; i++) {
    const p = allPs[i];
    if (processed.has(p) || !p.parentNode) continue;
    if (!/^[-‐‑–—]\s+/.test(p.textContent || "")) continue;

    // 연속된 hyphen <p> 그룹 수집 (모두 같은 depth-3 <ul> 에 sibling 으로)
    const group: Element[] = [];
    let cur: Element | null = p;
    while (cur && cur.tagName && cur.tagName.toLowerCase() === "p") {
      if (!/^[-‐‑–—]\s+/.test(cur.textContent || "")) break;
      group.push(cur);
      cur = cur.nextElementSibling;
    }

    // 직전 <ul>/<ol> 찾기 — 중간 <p>(예: 헤딩) 는 건너뜀, 다른 블록 만나면 중단
    let prevList: Element | null = null;
    let prev = group[0].previousElementSibling;
    while (prev) {
      const tg = prev.tagName.toLowerCase();
      if (tg === "ul" || tg === "ol") { prevList = prev; break; }
      if (tg !== "p") break;
      prev = prev.previousElementSibling;
    }
    if (!prevList) { for (const g of group) processed.add(g); continue; }

    const attachLi = findAttachmentLi(prevList);
    if (!attachLi) { for (const g of group) processed.add(g); continue; }

    // attachLi 안의 마지막 nested <ul>/<ol> 재사용, 없으면 새로 만듦
    let depthUl: Element | null = null;
    for (let c = attachLi.lastElementChild; c; c = c.previousElementSibling) {
      const tg = c.tagName.toLowerCase();
      if (tg === "ul" || tg === "ol") { depthUl = c; break; }
    }
    if (!depthUl) { depthUl = doc.createElement("ul"); attachLi.appendChild(depthUl); }

    for (const g of group) {
      const li = doc.createElement("li");
      // 자식 노드(inline 포맷 포함) 그대로 이동
      while (g.firstChild) li.appendChild(g.firstChild);
      // 첫 텍스트 노드의 "- " 제거
      stripLeadingHyphen(li);
      depthUl.appendChild(li);
      processed.add(g);
      g.remove();
    }
  }
  return doc.body.innerHTML;
}

// Walk a mammoth-converted HTML string and add visual indentation to plain <p> elements
// that begin with a bullet glyph. Compensates for mammoth flattening deep nested
// Word lists into a flat sequence of paragraphs.
function applyBulletIndentation(html: string): string {
  if (typeof window === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  // Bullet char → indent level (1 = shallow, higher = deeper). Order matters: more-specific
  // patterns first.
  const indentMap: { regex: RegExp; level: number }[] = [
    { regex: /^\s*[●◆■▣]\s/, level: 1 },
    { regex: /^\s*[•·▪]\s/, level: 1 },
    { regex: /^\s*[○◦◯]\s/, level: 2 },
    { regex: /^\s*[-‐‑–—]\s/, level: 3 },
    { regex: /^\s*[▷▶►]\s/, level: 2 },
    { regex: /^\s*[★☆]\s/, level: 1 },
  ];
  // <ul> uses `pl-5` (1.25rem) per nesting depth.  Match that exactly so a hyphen
  // <p> at level=3 lines up with where a <ul><ul><ul><li> would render, not one
  // step deeper.  The old 1.5rem multiplier overshot, making level=3 look like
  // level=4 visually.
  const REM_PER_LEVEL = 1.25;
  const paragraphs = doc.querySelectorAll("p");
  paragraphs.forEach((p) => {
    // Skip paragraphs already inside a list — <li>/<ul>/<ol> provide their own indent.
    if (p.closest("li, ul, ol")) return;
    const text = (p.textContent || "");
    for (const { regex, level } of indentMap) {
      if (regex.test(text)) {
        const existingStyle = p.getAttribute("style") || "";
        // Only set margin-left if not already styled (don't override mammoth's own indent).
        if (!/margin-left/i.test(existingStyle)) {
          p.setAttribute("style", `${existingStyle}${existingStyle && !existingStyle.endsWith(";") ? ";" : ""}margin-left:${level * REM_PER_LEVEL}rem`);
        }
        break;
      }
    }
  });
  return doc.body.innerHTML;
}

function HtmlEditor({ htmlRef, initialHtml }: { htmlRef: React.RefObject<HTMLDivElement | null>; initialHtml: string }) {
  useEffect(() => {
    if (htmlRef.current) htmlRef.current.innerHTML = fillEmptyCells(initialHtml);
  }, [initialHtml]); // eslint-disable-line react-hooks/exhaustive-deps

  // 빈 셀 cursor 진입 보장 — mousedown + click 양쪽에 동기 placeholder 설치 + cursor 배치
  useEffect(() => {
    const editor = htmlRef.current;
    if (!editor) return;

    // ZWSP/ZWNJ/ZWJ/BOM 같은 invisible 텍스트는 우리가 placeholder 에 넣은 것이므로
    // "텍스트 있음" 판정에서 제외 — 그렇지 않으면 placeholder 가 들어간 셀이 두 번째
    // 클릭부터 "텍스트 셀" 로 잘못 인식되어 우리 핸들러가 건너뛰고 브라우저가 인접
    // 셀로 cursor 를 보내는 버그가 발생한다.
    const hasMeaningful = (c: Element) => {
      const visible = (c.textContent || "").replace(/[\s​‌‍﻿]/g, "");
      if (visible) return true;
      return !!c.querySelector("img, svg, iframe, video, audio, canvas, embed, object, picture");
    };

    // 이미 placeholder <p> 가 있으면 그것을 재사용 (innerHTML 다시 비우지 않음 — 두 번째
    // 클릭에서도 같은 노드 재사용해서 cursor 안정적).
    const installPlaceholder = (cell: Element): HTMLElement => {
      if (hasMeaningful(cell)) {
        const last = cell.querySelector(":scope > p:last-of-type");
        return (last || cell) as HTMLElement;
      }
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

    editor.querySelectorAll("td, th").forEach((cell) => {
      if (!hasMeaningful(cell)) installPlaceholder(cell);
    });

    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const cell = target.closest("td, th");
      if (!cell || !editor.contains(cell)) return;
      if (hasMeaningful(cell)) return; // 텍스트/이미지/svg 등 있으면 브라우저에 위임
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


export default function NewReportPage() {
  const router = useRouter();
  const { reports, projects, users, currentUser, addReport, distributeReport, addActivity, addNotification, workspaceId, templates, addTemplate, deleteTemplate } = useWorkspaceData();
  const [form, setForm] = useState<ReportFormState>(makeEmptyForm());
  const htmlRef = useRef<HTMLDivElement>(null);

  // 지난주 보기: 보관본(보고일 최신) 또는 최근 보고서.  LastWeekButton 이 새 창으로 띄운다.
  const lastWeekReport = useMemo<Report | null>(() => pickLastWeekReport(reports), [reports]);

  const reportTemplates = templates.filter((t) => t.type === "report");

  const applyReportTemplate = (tpl: Template) => {
    try {
      const data = JSON.parse(tpl.data);
      if (data.html) {
        setForm((f) => ({
          ...f,
          type: data.type || f.type,
          sections: data.sections || f.sections,
          _importedHtml: data.html,
          _originalDocxBase64: data.originalDocxBase64,
        }));
      } else if (data.sections) {
        setForm((f) => ({
          ...f,
          type: data.type || f.type,
          sections: data.sections,
          _importedHtml: undefined,
          _originalDocxBase64: undefined,
        }));
      }
      toast("success", `"${tpl.name}" 템플릿이 적용되었습니다`);
    } catch {
      toast("error", "템플릿 데이터를 불러올 수 없습니다");
    }
  };

  const saveReportAsTemplate = () => {
    const name = window.prompt("템플릿 이름을 입력하세요");
    if (!name) return;
    const latestHtml = htmlRef.current?.innerHTML || form._importedHtml;
    const tpl: Template = {
      id: `tpl${Date.now()}`,
      workspaceId: workspaceId || "",
      type: "report",
      name,
      data: JSON.stringify({
        type: form.type,
        sections: form.sections,
        html: latestHtml || undefined,
        originalDocxBase64: form._originalDocxBase64 || undefined,
      }),
      createdBy: currentUser?.id || "",
      createdAt: new Date().toISOString(),
    };
    addTemplate(tpl);
    toast("success", "템플릿이 저장되었습니다");
  };

  // Only admin and final_manager can create templates
  useEffect(() => {
    if (currentUser && currentUser.role !== "admin" && currentUser.role !== "final_manager") {
      router.push("/reports");
    }
  }, [currentUser, router]);

  if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "final_manager")) {
    return null;
  }

  const handleTypeChange = (type: Report["type"]) => {
    setForm((f) => ({
      ...f,
      type,
      sections: TEMPLATE_SECTIONS[type].map((t) => ({ title: t.title, content: "" })),
      _importedHtml: undefined,
    }));
  };

  const updateSection = (idx: number, value: string) => {
    setForm((f) => {
      const next = [...f.sections];
      next[idx] = { ...next[idx], content: value };
      return { ...f, sections: next };
    });
  };

  const handleFileUpload = async (file: File) => {
    if (file.name.endsWith(".docx")) {
      try {
        const mammoth = await import("mammoth");
        const JSZip = await import("jszip");
        const arrayBuffer = await file.arrayBuffer();

        // 1. Extract original column widths from docx XML
        const zip = await JSZip.loadAsync(arrayBuffer);
        const docXml = await zip.file("word/document.xml")!.async("string");
        const grids = docXml.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/g) || [];
        const tableWidths: string[][] = grids.map((g) => {
          const cols = g.match(/<w:gridCol w:w="(\d+)"/g) || [];
          const widths = cols.map((c) => parseInt(c.match(/w:w="(\d+)"/)![1]));
          const total = widths.reduce((a, b) => a + b, 0);
          return widths.map((w) => `${Math.round((w / total) * 100)}%`);
        });

        // 2. Convert to HTML with style maps for Word's standard list paragraph styles.
        // mammoth normally flattens deep nested lists when the docx uses manual indent or
        // non-standard styles; we map common Korean Word list styles to nested ul/ol so
        // structure is preserved.
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

        // 3. Inject colgroup with original widths into each table
        let tableIdx = 0;
        let enrichedHtml = htmlResult.value.replace(/<table>/g, () => {
          const widths = tableWidths[tableIdx++];
          if (!widths) return "<table>";
          const colgroup = "<colgroup>" + widths.map((w) => `<col style="width:${w}">`).join("") + "</colgroup>";
          return "<table>" + colgroup;
        });

        // 3.5 Word 의 번호 단계(<ol>)를 우리 단계 시스템(<ul> 깊이 = 1./가./•/-)에 맞게
        // 모두 <ul> 로 변환.  이게 없으면 <ol> 단계가 브라우저 기본 십진수로 떨어져
        // Word 의 다단계가 전부 "1." 로 뭉개지고 Tab 단계 이동도 어긋난다.
        enrichedHtml = convertOrderedListsToUnordered(enrichedHtml);

        // 4. Mark mammoth-inserted empty wrapper <li> elements with data-empty-wrapper
        // first, so bakeHyphenParagraphsToListItems below can correctly walk through
        // them to find the real attachment point for depth-3 items.
        enrichedHtml = normalizeListDepth(enrichedHtml);

        // 5. Convert <p>- text</p> (mammoth's 3단계 form) to depth-3 <li> nested under
        // the preceding <ul>'s deepest last visible <li>.  This unifies docx-imported
        // 3단계 with Tab-generated 3단계 — both become <li> inside <ul><ul><ul> and
        // render identically via the CSS [&_ul_ul_ul]:list-['-_'] marker.
        enrichedHtml = bakeHyphenParagraphsToListItems(enrichedHtml);

        // 6. Reconstruct visual indentation for any remaining bullet-glyph <p> paragraphs
        // (●, ○, •, ▶ etc.) that bakeHyphenParagraphsToListItems didn't handle —
        // applies progressive margin-left so the editor mirrors the original document.
        enrichedHtml = applyBulletIndentation(enrichedHtml);

        // 7. 빈 <td> 셀에 placeholder 채우기 — contentEditable 에서 커서가 들어가도록.
        // 새 양식들이 빈 표 칸을 많이 가지고 있어 사용자가 클릭해도 입력 불가했던 문제 해결.
        enrichedHtml = fillEmptyCells(enrichedHtml);

        // Store original docx as base64 for later re-export
        const base64 = btoa(new Uint8Array(arrayBuffer).reduce((s, b) => s + String.fromCharCode(b), ""));

        setForm((f) => ({
          ...f,
          type: "custom" as Report["type"],
          sections: [{ title: "워드 문서 내용", content: "" }],
          _importedHtml: enrichedHtml,
          _originalDocxBase64: base64,
        }));
      } catch {
        toast("error", "워드 파일을 읽을 수 없습니다. 파일 형식을 확인해주세요.");
      }
    } else {
      const text = await file.text();
      const sections = parseTemplateFile(text);
      setForm((f) => ({ ...f, type: "custom" as Report["type"], sections, _importedHtml: undefined }));
    }
  };

  const createReport = async (shouldDistribute: boolean) => {
    // Validation
    if (!form.title.trim()) {
      toast("warning", "보고서 제목을 입력해주세요.");
      return;
    }

    const latestHtml = htmlRef.current?.innerHTML || form._importedHtml;
    const hasContent = latestHtml || form.sections.some((s) => s.content.trim());
    if (!hasContent) {
      toast("warning", "보고서 내용을 작성하거나 양식 파일을 첨부해주세요.");
      return;
    }

    const localId = `r${Date.now()}`;
    const report: Report = {
      id: localId,
      title: form.title.trim(),
      type: form.type,
      authorId: currentUser.id,
      projectId: form.projectId || undefined,
      createdAt: new Date().toISOString().split("T")[0],
      content: serializeContent({ sections: form.sections, html: latestHtml, originalDocxBase64: form._originalDocxBase64 }),
      status: "template",
      workspaceId: workspaceId || "",
    };

    const created = await addReport(report);
    if (!created) {
      toast("error", "보고서 생성에 실패했습니다.");
      return;
    }

    if (shouldDistribute) {
      await distributeReport(created.id);
      addActivity(`보고서 "${report.title}"을(를) 배포했습니다`, report.title, "report");
      const notifyIds = users.filter(u => u.id !== currentUser?.id).map(u => u.id);
      addNotification(notifyIds, "report_distributed", "보고서 배포", `"${report.title}" 보고서가 배포되었습니다`, `/reports/${created.id}`);
      toast("success", `"${report.title}" 보고서가 배포되었습니다.`);
    } else {
      addActivity(`보고서 "${report.title}" 양식을 등록했습니다`, report.title, "report");
      toast("success", `"${report.title}" 양식이 등록되었습니다.`);
    }

    router.push("/reports");
  };

  return (
    <AppLayout
      title="새 보고서 작성"
      description="보고서 양식을 등록하고 배포하세요"
      actions={
        <div className="flex items-center gap-2">
          <LastWeekButton report={lastWeekReport} />
          <button onClick={() => router.push("/reports")} className="p-2.5 rounded-xl hover:bg-accent/15 hover:text-accent transition-all">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Meta fields */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
          <FormField label="보고서 제목">
            <FormInput
              placeholder="보고서 제목을 입력하세요"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </FormField>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="유형">
              <FormSelect value={form.type} onChange={(e) => handleTypeChange(e.target.value as Report["type"])}>
                <option value="weekly">주간</option>
                <option value="monthly">월간</option>
                <option value="custom">커스텀</option>
              </FormSelect>
            </FormField>
            <FormField label="프로젝트 (선택)">
              <FormSelect value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}>
                <option value="">없음</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="양식 파일 업로드">
              <label className="flex items-center gap-2 px-4 py-2.5 bg-background border border-border rounded-xl text-[14px] text-muted-foreground hover:border-accent cursor-pointer transition-colors">
                <Upload className="w-4 h-4" />
                <span>{form._importedHtml ? "파일 적용됨" : ".docx / .txt / .md"}</span>
                <input
                  type="file"
                  accept=".txt,.md,.text,.docx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </FormField>
          </div>

          {/* Saved report templates */}
          {reportTemplates.length > 0 && (
            <div>
              <p className="text-[13px] font-medium text-muted-foreground mb-2">저장된 양식</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {reportTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="flex items-center justify-between bg-background border border-border rounded-xl p-3 hover:border-accent/40 cursor-pointer transition-colors"
                    onClick={() => applyReportTemplate(tpl)}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-accent" />
                      <span className="text-[13px] text-foreground">{tpl.name}</span>
                    </div>
                    <button
                      className="p-1 rounded-lg hover:bg-danger/15 text-muted hover:text-danger transition-colors"
                      onClick={(e) => { e.stopPropagation(); deleteTemplate(tpl.id); }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Content area */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-[16px] font-semibold text-white mb-4">
            {form._importedHtml ? "워드 문서 내용" : `보고서 내용 (${TYPE_LABELS[form.type]})`}
          </h3>

          {form._importedHtml ? (
            <div>
              <HtmlEditor htmlRef={htmlRef} initialHtml={form._importedHtml} />
              <p className="text-[12px] text-muted mt-3">워드 문서의 표, 서식이 그대로 유지됩니다. 클릭하여 내용을 수정할 수 있습니다.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {form.sections.map((section, i) => (
                <FormField key={`${form.type}-${i}`} label={section.title}>
                  <FormTextarea
                    rows={form.type === "custom" ? 15 : 6}
                    placeholder={TEMPLATE_SECTIONS[form.type][i]?.placeholder || ""}
                    value={section.content}
                    onChange={(e) => updateSection(i, e.target.value)}
                  />
                </FormField>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center">
          <button
            className="flex items-center gap-2 text-[13px] text-accent hover:text-accent-hover transition-colors"
            onClick={saveReportAsTemplate}
          >
            <Save className="w-4 h-4" />
            양식 템플릿으로 저장
          </button>
          <div className="flex gap-3">
            <FormButton variant="secondary" onClick={() => router.push("/reports")}>취소</FormButton>
            <FormButton variant="secondary" onClick={() => createReport(false)}>양식 등록</FormButton>
            <FormButton onClick={() => createReport(true)}>바로 배포</FormButton>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
