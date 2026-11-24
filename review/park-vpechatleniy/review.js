"use strict";
const production=location.hostname==="fazafilms.ru"||location.hostname==="www.fazafilms.ru";
const api=production?"https://panel.fazafilms.ru/park-review/v1/":new URL("/park-review/v1/",location.href).href;
const maxBytes=8*1024*1024;
const fmt=n=>{const t=Math.max(0,Math.floor(n||0));return Math.floor(t/60)+":"+String(t%60).padStart(2,"0")};
const cue=n=>{const tenths=Math.round(Math.max(0,n||0)*10);return fmt(tenths/10)+(tenths%10?","+tenths%10:"")};
function filmTime(clip,seconds){const mark=[...(clip.timeline||[])].reverse().find(s=>s.at<=seconds);return mark?mark.film+seconds-mark.at:Number(clip.start||0)+seconds}
function el(tag,cls="",s=""){const e=document.createElement(tag);e.className=cls;e.textContent=s;return e}
const mediaList=[];
const [folder, editQuery] = location.hash.split("?");
const access = new URLSearchParams(editQuery).get("edit");
if(access){
 sessionStorage.setItem("park-media-editor",access);
 history.replaceState(null,"",location.pathname+location.search+folder);
}
const editorKey=sessionStorage.getItem("park-media-editor");
function envelope(fields, payload){
 const meta=new TextEncoder().encode(JSON.stringify(fields)),length=new ArrayBuffer(4);
 new DataView(length).setUint32(0,meta.length);
 return new Blob([length,meta,payload]);
}
function addThumb(strip, receipt, uploadedKey){
 const storageKey="park-picture:"+receipt;
 let ownKey=uploadedKey;
 try{
   if(ownKey)localStorage.setItem(storageKey,ownKey);
   else ownKey=localStorage.getItem(storageKey);
 }catch{}
 const wrap=el("div","feedback-thumb");
 const a=el("a"),img=el("img");
 a.href=api+"pictures/"+receipt+"/image";a.target="_blank";a.rel="noopener";
 img.src=api+"pictures/"+receipt+"/thumb";img.alt="Открыть картинку из замечания";img.loading="lazy";
 a.append(img);wrap.append(a);strip.append(wrap);
 if(!ownKey&&!editorKey)return;
 const button=el("button","remove-picture","×"),status=el("span","status");
 button.type="button";button.title="Удалить картинку из замечания";button.setAttribute("aria-label",button.title);
 status.setAttribute("role","status");wrap.append(button,status);
 button.onclick=async()=>{
   button.disabled=true;status.textContent="";
   try{
     const response=await fetch(api+"pictures/"+receipt+"/remove",{method:"POST",headers:{Authorization:"Bearer "+(ownKey||editorKey)}});
     if(!response.ok)throw Error((await response.json()).error||"Не удалось удалить картинку.");
     wrap.remove();
     try{localStorage.removeItem(storageKey)}catch{}
   }catch(error){button.disabled=false;status.textContent=error.message==="Failed to fetch"?"Проверьте соединение и повторите.":error.message}
 };
}
function mountEditor(card,clip){
 if(!editorKey)return;
 const bar=el("div","media-tools"),label=el("label","file-label","Добавить файл");
 const input=el("input","file");input.type="file";input.accept="video/mp4,image/jpeg,image/png,image/webp";label.append(input);
 const status=el("span","status");status.setAttribute("role","status");
 const remove=el("button","media-remove","×");remove.type="button";
 remove.title="Убрать «"+clip.title+"»";remove.setAttribute("aria-label",remove.title);
 if(clip.src){card.classList.add("media-card");card.append(remove,status)}else{bar.append(label,status);card.append(bar)}
 async function save(file){
   if(input.disabled)return;
   const kind=file?(/\.mp4$/i.test(file.name)||file.type==="video/mp4"?"video":"image"):"empty";
   const size=file?.size||0;
   if(file&&(!size||size>(kind==="video"?256:16)*1024*1024)){status.textContent="Допустимы MP4 до 256 МБ и изображения до 16 МБ.";return}
   input.disabled=remove.disabled=true;
   const step=640*1024,request_id=crypto.randomUUID(),parts=Math.max(1,Math.ceil(size/step));
   try{
     for(let part=0;part<parts;part++){
       status.textContent=file?"Загрузка "+Math.round(100*part/parts)+"%":"Удаляем…";
       const response=await fetch(api+"slot",{method:"POST",headers:{"Content-Type":"application/octet-stream","Authorization":"Bearer "+editorKey},
         body:envelope({id:clip.id,version:clip.version,request_id,kind,size,part},file?.slice(part*step,(part+1)*step)||new Blob([]))});
       const result=await response.json();if(!response.ok)throw Error(result.error||"Не удалось сохранить файл.");
       if(part===parts-1&&!result.saved)throw Error("Загрузка не завершилась.");
     }
     location.reload();
   }catch(error){status.textContent=error.message;input.disabled=remove.disabled=false;input.value=""}
 }
 input.onchange=()=>{if(input.files[0])save(input.files[0])};
 remove.onclick=()=>{if(confirm("Убрать «"+clip.title+"» со страницы?"))save(null)};
}
function mountForm(card,clip,player){
 const strip=el("div","comment-pictures");for(const id of clip.pictures||[])addThumb(strip,id);card.append(strip);
 const box=document.querySelector("#feedback").content.firstElementChild.cloneNode(true);
 card.append(box);
 const q=c=>box.querySelector("."+c),form=box.querySelector("form");
 let current=0,requestId=null,busy=false;
 const show=(msg,kind="")=>{q("status").textContent=msg;q("status").className="status "+kind};
 const pictureInput=q("picture"),preview=q("picture-preview"),pictures=new Set();
 function discardPicture(item){
   if(!pictures.delete(item))return;
   item.wrap.remove();URL.revokeObjectURL(item.url);
   preview.hidden=!pictures.size;requestId=null;
 }
 pictureInput.onchange=()=>{
   const files=Array.from(pictureInput.files);pictureInput.value="";
   let message="";
   for(const file of files){
     if(pictures.size>=6){message="К замечанию можно прикрепить до 6 картинок.";break}
     if(!file.size||file.size>maxBytes){message="Каждая картинка должна быть до 8 МБ.";continue}
     const wrap=el("div","feedback-thumb"),img=el("img"),button=el("button","remove-picture discard-picture","×");
     const item={file,wrap,key:crypto.randomUUID(),url:URL.createObjectURL(file)};
     pictures.add(item);requestId=null;
     button.type="button";button.title="Убрать "+file.name;button.setAttribute("aria-label",button.title);
     button.onclick=()=>{discardPicture(item);pictureInput.focus();show("")};
     img.onerror=()=>{if(pictures.has(item)){discardPicture(item);show("Не удалось открыть "+file.name+". Выберите JPEG, PNG или WebP.","bad")}};
     img.alt=file.name;img.src=item.url;wrap.append(img,button);preview.append(wrap);preview.hidden=false;
   }
   show(message,message?"bad":"");
 };
 if(!player)q("form-head").hidden=true;
 const capture=()=>{current=Math.round(Math.min(Number(clip.duration||0),Math.max(0,player?.currentTime||0))*1000)/1000;q("clock").textContent=cue(filmTime(clip,current));requestId=null};
 const area=()=>{form.querySelectorAll("button,input,textarea").forEach(i=>i.disabled=busy)};
 box.addEventListener("toggle",()=>{if(box.open&&!q("note").value&&!pictures.size&&!busy){capture();player?.pause()}});
 q("capture").onclick=()=>{player?.pause();capture()};
 form.addEventListener("input",()=>requestId=null);
 form.onsubmit=async e=>{e.preventDefault();if(busy)return;
   const note=q("note").value.trim(),author=q("author").value.trim(),selected=Array.from(pictures);
    if(!note&&!selected.length){show("Добавьте комментарий или картинку.","bad");return}
   busy=true;area();show("Отправляем…");
   if(!requestId)requestId=crypto.randomUUID();
   const meta={id:clip.id,version:clip.version,seconds:current,author,text:note,request_id:requestId,images:selected.map(p=>({size:p.file.size,key:p.key}))};
   try{
      const raw=new Blob(selected.map(p=>p.file)),step=640*1024,total=Math.max(1,Math.ceil(raw.size/step));let saved=null;
     for(let part=0;part<total;part++){
       const response=await fetch(api+"feedback",{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:envelope({...meta,part,total},raw.slice(part*step,(part+1)*step))});
       const result=await response.json();if(!response.ok)throw new Error(result.error||"Не удалось отправить.");
       if(result.receipt){saved=result;break}
     }
     if(!saved||saved.pictures?.length!==selected.length)throw new Error("Не все вложения подтверждены сервером.");
     selected.forEach((item,i)=>{if(saved.pictures[i])addThumb(strip,saved.pictures[i],item.key);discardPicture(item)});
      form.reset();show(player?"Замечание сохранено · "+cue(filmTime(clip,current)):"Замечание сохранено","ok");
   }catch(err){show((err.message==="Failed to fetch"?"Проверьте подключение.":err.message)+" Текст и запись сохранены в форме.","bad")}
   finally{busy=false;area()}
 };
}
function mountApproval(info,clip,photo=false){
 const button=el("button","approve","Утвердить");
 const status=el("span","approval-status");status.setAttribute("role","status");
 button.type="button";button.setAttribute("aria-label","Утвердить — "+clip.title);
 info.append(button,status);
 function render(stamp){
   clip.approved_at=stamp;
   button.textContent=photo?(stamp?"Одобрено · снять":"Одобрить"):(stamp?"Утверждено · снять":"Утвердить");
   button.setAttribute("aria-pressed",String(Boolean(stamp)));
   button.setAttribute("aria-label",(photo?(stamp?"Снять одобрение — ":"Одобрить — "):(stamp?"Снять утверждение — ":"Утвердить — "))+clip.title);
   status.textContent=stamp?new Date(stamp*1000).toLocaleString("ru-RU",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"";
 }
 render(clip.approved_at);
 button.onclick=async()=>{
   button.disabled=true;status.textContent="Сохраняем…";
   try{
     const response=await fetch(api+"approval",{method:"POST",headers:{"Content-Type":"application/json"},
         body:JSON.stringify({id:clip.id,version:clip.version,approved:!clip.approved_at})});
     const result=await response.json();
     if(!response.ok||!("approved_at" in result))throw new Error(result.error||"Не удалось сохранить решение.");
     render(result.approved_at);
   }catch(error){status.textContent=error.message==="Failed to fetch"?"Проверьте соединение и повторите.":error.message}
   finally{button.disabled=false}
 };
}
function makeCard(clip,role){
 if(!clip.src){
   const card=el("article","card"),empty=el("div","take-empty","Свободное окно");
   card.append(empty,el("h3","",clip.title));mountEditor(card,clip);return card;
 }
 if(clip.kind==="image"){
   const card=el("article","card photo-card"),link=el("a","photo-link"),img=el("img");
   link.href=clip.src;link.target="_blank";link.rel="noopener";img.alt=clip.title;img.src=clip.src;img.loading="lazy";
   link.append(img);card.append(link);
   const info=el("div","meta");info.append(el("h2","",clip.title));if(role!=="lead")mountApproval(info,clip,true);
   card.append(info);mountEditor(card,clip);mountForm(card,clip,null);return card;
 }
 const card=el("article","card");const v=el("video","player");v.controls=true;v.playsInline=true;v.preload=role==="lead"&&document.body.dataset.folder==="film"?"metadata":"none";v.setAttribute("aria-label",clip.title+". Просмотр без звука");
 v.defaultMuted=true;v.muted=true;v.volume=0;v.addEventListener("volumechange",()=>{if(!v.muted||v.volume!==0){v.muted=true;v.volume=0}});if(clip.poster)v.poster=clip.poster;v.src=clip.src;card.append(v);
 mediaList.push(v);v.addEventListener("play",()=>mediaList.forEach(o=>{if(o!==v)o.pause()}));
 const info=el("div","meta"),heading=el(role==="clip"?"h3":"h2","",clip.title);
 info.append(heading); if(role==="clip"){info.append(el("span","inpoint",cue(clip.start)+" – "+cue(clip.start+clip.duration)))}
 else {info.append(el("span","pill","Просмотр без звука"),el("span","pill",fmt(clip.duration)))}
 card.append(info);
 const fileUrl=new URL(clip.src,location.href);
 fileUrl.searchParams.set("download","1");
 const download=el("a","download-link","Скачать MP4");
 download.href=fileUrl.href;download.download=fileUrl.pathname.split("/").pop();
 download.setAttribute("aria-label","Скачать MP4 — "+clip.title);info.append(download);
 if(role!=="lead")mountApproval(info,clip);
 if(clip.design){const link=el("a","inpoint","Рассмотреть вагон на нейтральном фоне");link.href=clip.design;link.target="_blank";link.rel="noopener";info.append(link)}
 mountEditor(card,clip);mountForm(card,clip,v);return card;
}
function selectFolder(){
 const hash=location.hash.split("?")[0];
 const active=hash==="#management"?"management":hash==="#photos"?"photos":(!hash||hash==="#tour"?"tour":"film");
 document.body.dataset.folder=active;
 document.getElementById("tour").hidden=active!=="tour";
 document.getElementById("photos").hidden=active!=="photos";
 document.getElementById("management").hidden=active!=="management";
 for(const id of ["film","scenes"])document.getElementById(id).hidden=active!=="film";
 document.getElementById("notice").hidden=active==="tour"||active==="management";
 for(const [id,folder] of [["tour-tab","tour"],["movies-tab","film"],["photos-tab","photos"],["management-tab","management"]]){
   const tab=document.getElementById(id);
   if(active===folder)tab.setAttribute("aria-current","page");else tab.removeAttribute("aria-current");
 }
 const frame=document.getElementById("park-tour");
 const visibility=()=>frame.contentWindow?.postMessage({type:"park-tour-visibility",visible:document.body.dataset.folder==="tour"},location.origin);
 if(active==="tour"&&!frame.getAttribute("src")){
   frame.addEventListener("load",visibility,{once:true});
   frame.src=frame.dataset.src;
 }
 if(frame.getAttribute("src"))visibility();
 if(active!=="film")mediaList.forEach(player=>player.pause());
 window.dispatchEvent(new CustomEvent("park-folder-change",{detail:{folder:active}}));
}
window.addEventListener("hashchange",selectFolder);
selectFolder();
(async()=>{
 try{
   const response=await fetch(api+"manifest",{cache:"no-store"});if(!response.ok)throw new Error();
   const list=await response.json();document.querySelector("#film").append(makeCard(list.lead,"lead"));
   for(const photo of list.photos||[]){
     document.querySelector(".photo-grid").append(makeCard(photo,"photo"));
   }
   const section=document.querySelector("#scenes"), clips=new Map([...list.clips,...list.emptySlots||[]].map(clip=>[clip.id,clip]));
   section.append(el("h2","section-title","Эпизоды по сценарию"));
   const columns=el("div","take-columns");
   columns.append(el("span","","Драфты"),el("span","","Чистовые дубли"));
   section.append(columns);
   const groups=list.scriptSections||[];
   const versions={
     "park-vehicle-exterior":"park-vehicle-exterior-hd",
     "park-vehicle-cabin":"park-vehicle-cabin-hd",
     "park-chersonesus":"park-chersonesus-fullhd"
   };
   const secondary=new Set(Object.values(versions));
   for(const clip of clips.values())if(clip.pairedSlot){versions[clip.id]=clip.pairedSlot;secondary.add(clip.pairedSlot)}
   function appendClip(parent,id,draft=false){
     const clip=clips.get(id);
     if(!clip)return;
     const title=draft&&!clip.title.endsWith(" · Драфт")?clip.title+" · Драфт":clip.title;
     const card=makeCard({...clip,title},"clip");card.id=id;
     const timing=card.querySelector(".inpoint");if(timing)timing.textContent=cue(clip.duration)+" · Без звука";
     parent.append(card);clips.delete(id);
   }
   function place(ids,parent){
     for(const id of ids){
       if(!clips.has(id)||secondary.has(id))continue;
       const row=el("div","take-row"),left=el("div","take-left");
       row.append(left);parent.append(row);
       appendClip(left,id,true);
       const right=versions[id];
       if(clips.has(right))appendClip(row,right);
       else{
         const empty=el("div","take-empty");
         empty.setAttribute("role","img");
         empty.setAttribute("aria-label","Второй вариант пока не опубликован");
         row.append(empty);
       }
     }
   }
   for(const group of groups){
     const block=el("section","script-block");
     block.append(el("h3","script-heading",group.title),el("p","script-time",group.time+" по сценарию"));
     if(group.clips.length)place(group.clips,block);
     else block.append(el("p","script-empty","Отдельный эпизод пока не опубликован."));
     section.append(block);
   }
   if(clips.size)place([...clips.keys()],section);
   document.querySelector("#notice").textContent="";
 }catch(e){document.querySelector("#notice").textContent="Не удалось загрузить видео. Обновите страницу."}
})();
