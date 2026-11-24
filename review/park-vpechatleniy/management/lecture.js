/* Full text-on-screen lecture before the audit; narration is a separate future edition. */
(function(){
  "use strict";
  const rootURL=new URL(".",document.currentScript.src);
  const video=document.getElementById("management-lecture-player");
  const details=document.getElementById("management-lecture-chapters");
  const transcript=document.getElementById("management-lecture-transcript");
  const status=document.getElementById("management-lecture-status");
  if(!video||!details||!transcript||!status)return;
  let chaptersRequested=false;
  let transcriptLoading=false,transcriptLoaded=false;
  let buttons=[];
  const formatTime=seconds=>{const value=Math.max(0,Math.floor(seconds));return Math.floor(value/60)+":"+String(value%60).padStart(2,"0");};
  function showStatus(text){status.textContent=text;status.hidden=!text;}
  function updateChapter(){
    let current=-1;
    buttons.forEach((item,index)=>{if(item.start<=video.currentTime)current=index;});
    buttons.forEach((item,index)=>{if(index===current)item.button.setAttribute("aria-current","true");else item.button.removeAttribute("aria-current");});
  }
  function seekAndPlay(seconds){
    const seek=()=>{video.currentTime=Number.isFinite(video.duration)?Math.min(seconds,Math.max(0,video.duration-.1)):seconds;updateChapter();};
    if(video.readyState>=1)seek();else video.addEventListener("loadedmetadata",seek,{once:true});
    video.play().then(()=>showStatus("")).catch(()=>showStatus("Нажмите кнопку воспроизведения на видео, чтобы продолжить с выбранной главы."));
  }
  async function loadChapters(){
    if(chaptersRequested)return;
    chaptersRequested=true;
    try{
      const response=await fetch(new URL("lecture/chapters-text-v2.json",rootURL),{credentials:"same-origin"});
      if(!response.ok)throw new Error("chapters-unavailable");
      const value=await response.json();
      const chapters=Array.isArray(value.chapters)?value.chapters.filter(item=>typeof item.title==="string"&&item.title.trim()&&Number.isFinite(item.start_seconds)&&item.start_seconds>=0).sort((a,b)=>a.start_seconds-b.start_seconds).slice(0,30):[];
      if(!chapters.length)return;
      const list=details.querySelector("ol");
      const fragment=document.createDocumentFragment();
      buttons=chapters.map(chapter=>{
        const li=document.createElement("li"),button=document.createElement("button"),time=document.createElement("span"),title=document.createElement("span");
        button.type="button";time.className="mg-lecture-chapter-time";title.className="mg-lecture-chapter-title";
        time.textContent=formatTime(chapter.start_seconds);title.textContent=chapter.title;
        button.setAttribute("aria-label",chapter.title+". Перейти к "+time.textContent);
        button.addEventListener("click",()=>seekAndPlay(chapter.start_seconds));
        button.append(time,title);li.append(button);fragment.append(li);
        return {button,start:chapter.start_seconds};
      });
      list.replaceChildren(fragment);details.hidden=false;updateChapter();
    }catch{chaptersRequested=false;}
  }
  async function loadSources(body){
    if(body.getAttribute("aria-busy")==="true")return;
    body.setAttribute("aria-busy","true");
    const pending=document.createElement("p");pending.setAttribute("role","status");pending.textContent="Загружаем источники…";body.replaceChildren(pending);
    try{
      const response=await fetch(new URL("lecture/sources-text-v2.json",rootURL),{credentials:"same-origin"});
      if(!response.ok)throw new Error("sources-unavailable");
      const value=await response.json();
      if(typeof value.note!=="string"||!Array.isArray(value.references)||!value.references.length||!Array.isArray(value.questions)||!value.questions.length)throw new Error("invalid-sources");
      const fragment=document.createDocumentFragment(),note=document.createElement("p"),heading=document.createElement("h4"),links=document.createElement("ul");
      note.className="mg-lecture-source-note";note.textContent=value.note;
      heading.textContent="Материалы и мировые практики";links.className="mg-lecture-reference-list";
      for(const item of value.references){
        if(typeof item.title!=="string"||typeof item.label!=="string"||typeof item.url!=="string")throw new Error("invalid-reference");
        const url=new URL(item.url);if(url.protocol!=="https:")throw new Error("invalid-reference-url");
        const li=document.createElement("li"),link=document.createElement("a");
        link.href=url.href;link.textContent=item.label;link.title=item.title;link.target="_blank";link.rel="noopener noreferrer";li.append(link);links.append(li);
      }
      const meeting=document.createElement("details"),summary=document.createElement("summary"),timeNote=document.createElement("p"),questions=document.createElement("ol");
      meeting.className="mg-lecture-meeting";summary.textContent="Вопросы встречи и таймкоды ("+value.questions.length+")";
      timeNote.className="mg-lecture-source-note";timeNote.textContent="Таймкоды отсчитываются отдельно в каждой записи.";
      for(const item of value.questions){
        if(typeof item.question!=="string"||!Array.isArray(item.evidence)||!item.evidence.length)throw new Error("invalid-question");
        const li=document.createElement("li"),question=document.createElement("p"),times=document.createElement("p"),groups=new Map();
        question.textContent=item.question;times.className="mg-lecture-timecodes";
        for(const part of item.evidence){
          if(!Number.isInteger(part.recording)||part.recording<1||!/^\d{2}:\d{2}:\d{2}$/.test(part.start)||!/^\d{2}:\d{2}:\d{2}$/.test(part.end))throw new Error("invalid-evidence");
          if(!groups.has(part.recording))groups.set(part.recording,[]);
          groups.get(part.recording).push(part.start+"–"+part.end);
        }
        times.textContent=Array.from(groups,([recording,ranges])=>"Запись "+recording+": "+ranges.join("; ")).join(" · ");
        li.append(question,times);questions.append(li);
      }
      meeting.append(summary,timeNote,questions);fragment.append(note,heading,links,meeting);body.replaceChildren(fragment);
    }catch{
      const message=document.createElement("p"),retry=document.createElement("button");
      message.setAttribute("role","status");message.textContent="Источники пока не загрузились.";
      retry.type="button";retry.textContent="Повторить загрузку источников";retry.addEventListener("click",()=>loadSources(body));body.replaceChildren(message,retry);
    }finally{body.setAttribute("aria-busy","false");}
  }
  async function loadTranscript(){
    if(transcriptLoaded||transcriptLoading)return;
    transcriptLoading=true;
    const body=transcript.querySelector(".mg-lecture-transcript-body");
    body.setAttribute("aria-busy","true");
    const pending=document.createElement("p");pending.setAttribute("role","status");pending.textContent="Загружаем полный текст лекции…";body.replaceChildren(pending);
    try{
      const response=await fetch(new URL("lecture/transcript-text-v2.json",rootURL),{credentials:"same-origin"});
      if(!response.ok)throw new Error("transcript-unavailable");
      const value=await response.json();
      if(!Array.isArray(value.sections)||!value.sections.length)throw new Error("invalid-transcript");
      const fragment=document.createDocumentFragment();
      for(const item of value.sections){
        if(typeof item.title!=="string"||!item.title.trim()||!Array.isArray(item.paragraphs)||!item.paragraphs.length||item.paragraphs.some(text=>typeof text!=="string"||!text.trim()))throw new Error("invalid-section");
        const section=document.createElement("section"),heading=document.createElement("h3");
        heading.textContent=item.title;section.append(heading);
        for(const text of item.paragraphs){const paragraph=document.createElement("p");paragraph.textContent=text;section.append(paragraph);}
        fragment.append(section);
      }
      const sources=document.createElement("section"),sourcesHeading=document.createElement("h3"),sourcesBody=document.createElement("div");
      sources.className="mg-lecture-sources";sourcesHeading.textContent="Источники и вопросы встречи";sources.append(sourcesHeading,sourcesBody);fragment.append(sources);
      body.replaceChildren(fragment);transcriptLoaded=true;loadSources(sourcesBody);
    }catch{
      const message=document.createElement("p"),retry=document.createElement("button");
      message.setAttribute("role","status");message.textContent="Текст пока не загрузился. Вся лекция доступна в ролике выше.";
      retry.type="button";retry.textContent="Повторить загрузку текста";retry.addEventListener("click",loadTranscript);
      body.replaceChildren(message,retry);
    }finally{transcriptLoading=false;body.setAttribute("aria-busy","false");}
  }
  transcript.addEventListener("toggle",()=>{if(transcript.open)loadTranscript();});
  video.addEventListener("play",()=>{
    document.querySelectorAll("video").forEach(other=>{if(other!==video)other.pause();});
    showStatus("");
  });
  video.addEventListener("timeupdate",updateChapter);
  video.addEventListener("error",()=>showStatus("Ролик не загрузился. Проверьте соединение и обновите страницу."));
  window.addEventListener("park-folder-change",event=>{
    if(event.detail?.folder==="management")loadChapters();
    else video.pause();
  });
  if(document.body.dataset.folder==="management")loadChapters();
})();
