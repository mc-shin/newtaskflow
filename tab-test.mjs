import { JSDOM } from "jsdom";
const dom = new JSDOM("<!DOCTYPE html><body></body>");
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

// ---- copy of indentLi / outdentLi (reports/new) ----
function indentLi(li, moveCaret){
  let extractedChildren=null;
  for(let c=li.lastElementChild;c;c=c.previousElementSibling){const t=c.tagName.toLowerCase();if(t==="ul"||t==="ol"){extractedChildren=c;break;}}
  if(extractedChildren)extractedChildren.remove();
  const parentUl=li.parentElement; if(!parentUl)return;
  const ptag=parentUl.tagName.toLowerCase(); if(ptag!=="ul"&&ptag!=="ol")return;
  let targetUl; const prev=li.previousElementSibling;
  if(prev&&prev.tagName.toLowerCase()==="li"){
    let nestedUl=null;
    for(let c=prev.lastElementChild;c;c=c.previousElementSibling){const t=c.tagName.toLowerCase();if(t==="ul"||t==="ol"){nestedUl=c;break;}}
    if(!nestedUl){nestedUl=document.createElement(ptag);prev.appendChild(nestedUl);}
    targetUl=nestedUl;
  } else {
    const wrapper=document.createElement("li");wrapper.setAttribute("data-empty-wrapper","true");wrapper.setAttribute("data-indent-wrapper","true");
    const innerUl=document.createElement(ptag);wrapper.appendChild(innerUl);parentUl.insertBefore(wrapper,li);targetUl=innerUl;
  }
  targetUl.appendChild(li);
  if(extractedChildren){while(extractedChildren.firstElementChild)targetUl.appendChild(extractedChildren.firstElementChild);}
  moveCaret(li);
}
function outdentLi(li, moveCaret){
  const parentUl=li.parentElement; if(!parentUl)return;
  const ptag=parentUl.tagName.toLowerCase();
  const tail=[]; for(let n=li.nextElementSibling;n;n=n.nextElementSibling)tail.push(n);
  const grandLi=parentUl.parentElement;
  if(!grandLi||grandLi.tagName.toLowerCase()!=="li"){
    let nested=null;
    for(let c=li.lastElementChild;c;c=c.previousElementSibling){const tg=c.tagName.toLowerCase();if(tg==="ul"||tg==="ol"){nested=c;break;}}
    if(nested)nested.remove();
    const p=document.createElement("p");while(li.firstChild)p.appendChild(li.firstChild);
    parentUl.parentNode?.insertBefore(p,parentUl.nextSibling);li.remove();
    if(nested){const wrapUl=document.createElement(ptag);const wrap=document.createElement("li");wrap.setAttribute("data-empty-wrapper","true");wrap.appendChild(nested);wrapUl.appendChild(wrap);p.parentNode?.insertBefore(wrapUl,p.nextSibling);}
    if(tail.length>0){const tailUl=document.createElement(ptag);for(const s of tail)tailUl.appendChild(s);const after=nested?(p.nextElementSibling?.nextSibling||null):p.nextSibling;p.parentNode?.insertBefore(tailUl,after);}
    if(parentUl.children.length===0)parentUl.remove();
    moveCaret(p);return;
  }
  const greatUl=grandLi.parentElement; if(!greatUl)return;
  const gtag=greatUl.tagName.toLowerCase(); if(gtag!=="ul"&&gtag!=="ol")return;
  let nested=null;
  for(let c=li.lastElementChild;c;c=c.previousElementSibling){const tg=c.tagName.toLowerCase();if(tg==="ul"||tg==="ol"){nested=c;break;}}
  if(nested)nested.remove();
  greatUl.insertBefore(li,grandLi.nextSibling);
  let afterAnchor=li.nextSibling;
  if(nested){const wrapUl=document.createElement(ptag);const wrap=document.createElement("li");wrap.setAttribute("data-empty-wrapper","true");wrap.appendChild(nested);wrapUl.appendChild(wrap);greatUl.insertBefore(wrapUl,afterAnchor);afterAnchor=wrapUl.nextSibling;}
  if(tail.length>0){const splitWrapper=document.createElement("li");splitWrapper.setAttribute("data-empty-wrapper","true");const splitUl=document.createElement(ptag);splitWrapper.appendChild(splitUl);for(const s of tail)splitUl.appendChild(s);greatUl.insertBefore(splitWrapper,afterAnchor);}
  if(parentUl.children.length===0)parentUl.remove();
  if(grandLi.getAttribute("data-empty-wrapper")==="true"&&grandLi.children.length===0&&!(grandLi.textContent||"").trim())grandLi.remove();
  moveCaret(li);
}

const HTML = `<ul>
<li>측정데이터<ul>
<li>IQ데이터<ul><li>FSVA</li><li>서버에</li></ul></li>
<li>센싱채널<ul><li>BackGround</li></ul></li>
<li>Indoor<ul><li>측정효율화</li><li>송신부</li></ul></li>
</ul></li>
<li>6G통합<ul>
<li>Cesium<ul><li>OSM</li><li>시뮬</li></ul></li>
</ul></li>
</ul>`;

function ownText(li){let s="";li.childNodes.forEach(n=>{if(n.nodeType===3)s+=n.textContent;else if(n.nodeType===1&&!["ul","ol"].includes(n.tagName.toLowerCase()))s+=n.textContent;});return s.trim();}
function depthOf(li){let d=0;for(let p=li.parentElement;p;p=p.parentElement){const t=p.tagName.toLowerCase();if(t==="ul"||t==="ol")d++;}return d;}
function dump(root){
  const lines=[];
  root.querySelectorAll("li").forEach(li=>{
    const d=depthOf(li); const t=ownText(li);
    const wrap=li.getAttribute("data-empty-wrapper")==="true";
    const mark=d===1?"1.":d===2?"가.":d===3?"•":d===4?"-":d===5?"!5!":"?"+d;
    lines.push(`${"   ".repeat(d-1)}${mark}${wrap?"[wrap]":""} ${t}`);
  });
  return lines.join("\n");
}
function run(label, pick, fn){
  const d=new JSDOM(`<!DOCTYPE html><body><div id=ed>${HTML}</div></body>`);
  globalThis.document=d.window.document; globalThis.Node=d.window.Node;
  const ed=d.window.document.getElementById("ed");
  const li=[...ed.querySelectorAll("li")].find(x=>ownText(x)===pick);
  console.log(`\n===== ${label} (대상: ${pick}, 깊이 ${depthOf(li)}) =====`);
  fn(li,()=>{});
  console.log(dump(ed));
}

// 시나리오들
run("indent: IQ데이터(d2→د3)", "IQ데이터", indentLi);
run("outdent: IQ데이터(d2→d1, 자식 있음)", "IQ데이터", outdentLi);
run("outdent: 센싱채널(d2 중간항목, 자식 있음)", "센싱채널", outdentLi);
run("indent: 센싱채널(d2→d3)", "센싱채널", indentLi);
run("outdent: FSVA(d3 leaf)", "FSVA", outdentLi);
