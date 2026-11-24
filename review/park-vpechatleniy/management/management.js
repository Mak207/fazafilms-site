/* Static review tab. The source report is loaded only when this tab is opened. */
(function(){
  "use strict";
  const scriptURL=document.currentScript.src;
  const rootURL=new URL(".",scriptURL);
  const dataURL=new URL("audit-2026-11-24.json",rootURL);
  dataURL.searchParams.set("v","20261124-management-1");
  const pdfURL=new URL("audit-2026-11-24.pdf",rootURL);
  const host=document.getElementById("management-content");
  const ids=["audit","conclusions","recommendations"];
  const names={audit:"Аудит",conclusions:"Выводы",recommendations:"Рекомендации"};
  const statuses={documented:"Зафиксировано",discussed:"Обсуждалось",open:"Открытый вопрос",analysis:"Вывод анализа",proposed:"Предложение"};
  let loaded=false,loading=false;

  function node(tag,cls,text){
    const value=document.createElement(tag);
    if(cls)value.className=cls;
    if(text!==undefined)value.textContent=String(text);
    return value;
  }
  const list=value=>Array.isArray(value)?value:[];
  const words=value=>typeof value==="string"?value.trim():"";
  function icon(kind){
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    for(const [key,value] of Object.entries({viewBox:"0 0 24 24",width:"18",height:"18",fill:"none",stroke:"currentColor","stroke-width":"1.6","stroke-linecap":"round","stroke-linejoin":"round","aria-hidden":"true"}))svg.setAttribute(key,value);
    const path=document.createElementNS("http://www.w3.org/2000/svg","path");
    path.setAttribute("d",kind==="download"?"M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4":kind==="document"?"M14 3H5v18h14V8l-5-5ZM14 3v5h5M8 12h8M8 16h6":"m9 5 7 7-7 7");
    svg.append(path);
    return svg;
  }
  function sourceLinks(pages,source){
    const links=node("div","mg-sources");
    links.setAttribute("aria-label","Страницы источника");
    const valid=[...new Set(list(pages).filter(page=>Number.isInteger(page)&&page>0&&page<=source.pageCount))].sort((a,b)=>a-b);
    for(const page of valid){
      const link=node("a","","стр. "+page+" ↗");
      link.href=pdfURL.href+"#page="+page;link.target="_blank";link.rel="noopener noreferrer";
      link.setAttribute("aria-label","Открыть страницу "+page+" исходного PDF");
      links.append(link);
    }
    return links;
  }
  function badge(status,label){
    return node("span","mg-status mg-status-"+status,label||statuses[status]||"");
  }
  function dateLabel(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(words(value)))return "";
    const date=new Date(value+"T12:00:00Z");
    return Number.isFinite(date.valueOf())?new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(date):"";
  }
  function heading(text,level=3){
    return node("h"+level,"",text);
  }
  function itemCard(item,source){
    const article=node("article","mg-item");
    article.dataset.item=item.id;
    const title=node("div","mg-item-heading");
    title.append(heading(words(item.title)||"Положение документа",4));
    if(statuses[item.status])title.append(badge(item.status));
    article.append(title);
    const paragraphs=node("div","mg-paragraphs");
    for(const paragraph of list(item.paragraphs).filter(words))paragraphs.append(node("p","",paragraph));
    article.append(paragraphs,sourceLinks(item.pages,source));
    return article;
  }
  function responsibility(value,source){
    if(!value||!list(value.rows).length)return null;
    const section=node("section","mg-responsibility");
    section.setAttribute("aria-labelledby","mg-responsibility-title");
    const header=node("div","mg-responsibility-heading"),label=node("div");
    label.append(node("p","mg-kicker","Роли и полномочия"));
    const title=heading(words(value.title)||"Схема ответственности",4);title.id="mg-responsibility-title";
    label.append(title);header.append(label,badge("proposed","Предлагаемая структура"));
    section.append(header);
    if(words(value.summary))section.append(node("p","mg-responsibility-summary",value.summary));
    section.append(sourceLinks(value.pages,source));
    const table=node("table","mg-role-table"),caption=node("caption","mg-sr-only","Ответственность, решения и границы полномочий по ролям");
    const thead=node("thead"),row=node("tr");
    for(const text of ["Роль","За что отвечает","Что решает","Границы полномочий"]){const th=node("th","",text);th.scope="col";row.append(th);}
    thead.append(row);
    const tbody=node("tbody");
    for(const role of value.rows){
      const tr=node("tr"),th=node("th");th.scope="row";th.append(node("span","mg-role-name",role.role),sourceLinks(role.pages,source));tr.append(th);
      for(const [key,label] of [["answersFor","За что отвечает"],["decides","Что решает"],["boundary","Границы полномочий"]]){
        const td=node("td","",role[key]);td.dataset.label=label;tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(caption,thead,tbody);section.append(table);
    return section;
  }
  function reportSection(section,index,report){
    const details=node("details","mg-section mg-section-"+section.id);details.id="mg-"+section.id;details.dataset.section=section.id;
    const summary=node("summary"),number=node("span","mg-number",String(index+1).padStart(2,"0"));
    number.setAttribute("aria-hidden","true");
    const label=node("span","mg-section-label");label.append(heading(names[section.id]));
    if(words(section.summary))label.append(node("span","mg-section-summary",section.summary));
    const arrow=node("span","mg-chevron");arrow.append(icon("arrow"));
    summary.append(number,label,arrow);
    const body=node("div","mg-section-body"),items=node("div","mg-items");
    for(const item of list(section.items))items.append(itemCard(item,report.source));
    body.append(items);
    if(section.id==="recommendations"){const roles=responsibility(report.responsibility,report.source);if(roles)body.append(roles);}
    details.append(summary,body);
    return details;
  }
  function transcript(report){
    const pages=list(report.pages).filter(page=>Number.isInteger(page.number)&&page.number>0&&page.number<=report.source.pageCount&&typeof page.text==="string").sort((a,b)=>a.number-b.number);
    if(!pages.length)return null;
    const details=node("details","mg-transcript"),summary=node("summary"),label=node("span","mg-transcript-label"),arrow=node("span","mg-chevron");
    label.append(node("strong","","Полный текст документа"),node("small","",pages.length+" страниц · текст исходного PDF"));arrow.append(icon("arrow"));
    summary.append(icon("document"),label,arrow);
    const body=node("div","mg-transcript-body");body.append(node("p","","Раскройте нужную страницу или откройте её в исходном PDF."));
    const pageList=node("div","mg-page-list");
    for(const page of pages){
      const item=node("details","mg-source-page"),title=node("summary","","Страница "+page.number),content=node("div");
      title.append(icon("arrow"));content.append(sourceLinks([page.number],report.source),node("div","mg-source-text",page.text));item.append(title,content);pageList.append(item);
    }
    body.append(pageList);details.append(summary,body);
    return details;
  }
  function render(report){
    const fragment=document.createDocumentFragment();
    const overview=node("div","mg-overview"),conclusion=node("section","mg-conclusion");
    conclusion.setAttribute("aria-labelledby","mg-conclusion-title");
    const meta=node("div","mg-report-meta"),date=node("time","",dateLabel(report.date));date.dateTime=report.date;
    meta.append(date,badge("proposed","Аналитическое предложение"));
    const title=heading("Главный вывод");title.id="mg-conclusion-title";
    conclusion.append(meta,title,node("p","mg-lead",report.summary));
    const source=node("aside","mg-document");source.setAttribute("aria-label","Исходный документ");
    const sourceHeading=node("div","mg-document-heading"),documentIcon=node("span","mg-document-icon"),sourceLabel=node("div");
    documentIcon.append(icon("document"));sourceLabel.append(node("p","mg-kicker","Исходный документ"),heading(report.source.title||report.title||"Аудит управления"));
    sourceHeading.append(documentIcon,sourceLabel);
    source.append(sourceHeading,node("p","mg-document-meta",report.source.pageCount+" страниц · Редакция 1"));
    const actions=node("div","mg-document-actions"),open=node("a","mg-button mg-primary"),download=node("a","mg-button");
    open.href=pdfURL.href;open.target="_blank";open.rel="noopener noreferrer";open.append(icon("document"),node("span","","Открыть PDF"));
    download.href=pdfURL.href;download.download=words(report.source.fileName)||"audit-2026-11-24.pdf";download.append(icon("download"),node("span","","Скачать"));
    actions.append(open,download);source.append(actions);overview.append(conclusion,source);fragment.append(overview);
    const guide=node("div","mg-reading-guide"),toggle=node("button","mg-expand-all","Раскрыть все разделы");toggle.type="button";
    guide.append(node("span","","От наблюдений — к решениям"),toggle);fragment.append(guide);
    const sections=node("div","mg-sections");
    for(const [index,id] of ids.entries())sections.append(reportSection(report.sections.find(section=>section.id===id),index,report));
    const disclosures=Array.from(sections.children);
    const updateToggle=()=>{toggle.textContent=disclosures.every(item=>item.open)?"Свернуть разделы":"Раскрыть все разделы";};
    for(const item of disclosures)item.addEventListener("toggle",updateToggle);
    toggle.addEventListener("click",()=>{const open=!disclosures.every(item=>item.open);for(const item of disclosures)item.open=open;updateToggle();});
    fragment.append(sections);
    const fullText=transcript(report);if(fullText)fragment.append(fullText);
    fragment.append(node("p","mg-note","Рекомендации и схема ответственности представлены как предложения. Ссылки на страницы ведут к исходному документу."));
    host.replaceChildren(fragment);
  }
  function valid(value){
    return value&&value.version===1&&words(value.summary)&&Number.isInteger(value.source?.pageCount)&&value.source.pageCount>0&&ids.every(id=>list(value.sections).some(section=>section.id===id&&Array.isArray(section.items)));
  }
  function renderError(){
    const box=node("div","mg-error");box.setAttribute("role","alert");
    box.append(heading("Разбор пока не загрузился"),node("p","","Проверьте соединение и повторите попытку. Исходный PDF можно открыть отдельно."));
    const actions=node("div","mg-error-actions"),retry=node("button","mg-button mg-primary","Повторить"),pdf=node("a","mg-button","Открыть PDF");
    retry.type="button";retry.addEventListener("click",()=>load(true));pdf.href=pdfURL.href;pdf.target="_blank";pdf.rel="noopener noreferrer";actions.append(retry,pdf);box.append(actions);host.replaceChildren(box);
  }
  async function load(force=false){
    if(!host||loading||(loaded&&!force))return;
    loading=true;host.setAttribute("aria-busy","true");
    const pending=node("div","mg-loading");pending.setAttribute("role","status");pending.append(icon("document"),node("p","","Загружаем аудит, выводы и рекомендации…"));host.replaceChildren(pending);
    try{
      const response=await fetch(dataURL.href,{cache:"no-store",credentials:"same-origin"});
      if(!response.ok)throw new Error("report-unavailable");
      const report=await response.json();if(!valid(report))throw new Error("invalid-report");
      render(report);loaded=true;
    }catch{loaded=false;renderError();}
    finally{loading=false;host.setAttribute("aria-busy","false");}
  }
  window.addEventListener("park-folder-change",event=>{if(event.detail?.folder==="management")load();});
  if(document.body.dataset.folder==="management")load();
})();
