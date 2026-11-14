"use strict";
const production=location.hostname==="fazafilms.ru"||location.hostname==="www.fazafilms.ru";
const api=production?"https://panel.fazafilms.ru/park-review/v1/":new URL("/park-review/v1/",location.href).href;
const maxBytes=8*1024*1024;
const fmt=n=>{const t=Math.max(0,Math.floor(n||0));return Math.floor(t/60)+":"+String(t%60).padStart(2,"0")};
const cue=n=>{const tenths=Math.round(Math.max(0,n||0)*10);return fmt(tenths/10)+(tenths%10?","+tenths%10:"")};
function filmTime(clip,seconds){const mark=[...(clip.timeline||[])].reverse().find(s=>s.at<=seconds);return mark?mark.film+seconds-mark.at:Number(clip.start||0)+seconds}
function el(tag,cls="",s=""){const e=document.createElement(tag);e.className=cls;e.textContent=s;return e}
let active=null;
const mediaList=[];
function mountForm(card,clip,player){
 const box=document.querySelector("#feedback").content.firstElementChild.cloneNode(true);
 card.append(box);
 const q=c=>box.querySelector("."+c),form=box.querySelector("form");
 let current=0,blob=null,url=null,recording=null,stream=null,timer=null,started=0,requestId=null,busy=false;const parts=[];
 const show=(msg,kind="")=>{q("status").textContent=msg;q("status").className="status "+kind};
 const capture=()=>{current=Math.round(Math.min(Number(clip.duration),Math.max(0,player.currentTime||0))*1000)/1000;q("clock").textContent=cue(filmTime(clip,current));requestId=null};
 const audio=b=>{if(url)URL.revokeObjectURL(url);url=null;blob=b;requestId=null;q("voice").removeAttribute("src");
     if(b){url=URL.createObjectURL(b);q("voice").src=url}q("voice-preview").hidden=!b};
 const area=()=>{form.querySelectorAll("button,input,textarea").forEach(i=>i.disabled=busy);if(recording?.state==="recording"){q("send").disabled=true;q("file").disabled=true}};
 function cleanup(){clearInterval(timer);stream?.getTracks().forEach(t=>t.stop());stream=null;recording=null;active=null;
   q("record").classList.remove("active");q("record").textContent="Записать голос";q("timer").textContent="";area()}
 function end(){if(recording&&recording.state==="recording")recording.stop()}
 box.addEventListener("toggle",()=>{if(box.open&&!q("note").value&&!blob&&!busy){capture();player.pause()}});
 q("capture").onclick=()=>{player.pause();capture()};
 form.addEventListener("input",()=>requestId=null);
 q("discard").onclick=()=>{audio(null);q("file").value="";show("")};
 q("file").onchange=()=>{const f=q("file").files[0];if(!f)return;
    if(f.size>maxBytes||!f.size){q("file").value="";show("Выберите аудиофайл до 8 МБ.","bad");return}
    audio(f);show("Запись можно прослушать перед отправкой.")};
 q("record").onclick=async()=>{
   if(recording?.state==="recording"){end();return}
   if(active&&active!==box){show("Сначала остановите другую запись.","bad");return}
   if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){show("Выберите готовый аудиофайл — запись с микрофона в этом браузере недоступна.","bad");return}
   if(active===box)return;
   active=box;q("record").disabled=true;show("Разрешите доступ к микрофону.");
   try{
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mime=["audio/webm;codecs=opus","audio/mp4","audio/ogg;codecs=opus","audio/webm"].find(v=>MediaRecorder.isTypeSupported(v));
      recording=new MediaRecorder(stream,mime?{mimeType:mime}:{});parts.length=0;
      let bytes=0,failed=false;recording.ondataavailable=e=>{if(e.data.size){parts.push(e.data);bytes+=e.data.size;if(bytes>maxBytes)end()}};
      recording.onerror=()=>{failed=true;show("Микрофон прервал запись. Вы можете выбрать аудиофайл.","bad");end();cleanup()};
      recording.onstop=()=>{const b=new Blob(parts,{type:mime||parts[0]?.type||"audio/webm"});cleanup();
        if(failed)return;if(!b.size||b.size>maxBytes){show("Запись пуста или больше 8 МБ.","bad");return}
        audio(b);show("Прослушайте запись или отправьте её.")};
      for(const v of mediaList)v.pause();q("voice").pause();player.pause();
      started=Date.now();recording.start(800);q("record").classList.add("active");q("record").textContent="Остановить запись";area();show("");
      timer=setInterval(()=>{const t=(Date.now()-started)/1000;q("timer").textContent=fmt(t)+" / 3:00";if(t>=180)end()},250)
   }catch(e){cleanup();show("Микрофон недоступен. Разрешите запись в браузере или выберите аудиофайл.","bad")}
 };
 form.onsubmit=async e=>{e.preventDefault();if(busy||recording?.state==="recording")return;
   const note=q("note").value.trim(),author=q("author").value.trim();if(!note&&!blob){show("Введите замечание или добавьте запись.","bad");return}
   busy=true;area();show("Отправляем…");
   if(!requestId)requestId=crypto.randomUUID();
   const meta={id:clip.id,version:clip.version,seconds:current,author,text:note,request_id:requestId};
   try{
     const raw=blob||new Blob([]),step=640*1024,total=Math.max(1,Math.ceil(raw.size/step));let receipt=false;
     for(let part=0;part<total;part++){
       const fields=new TextEncoder().encode(JSON.stringify({...meta,part,total}));const length=new ArrayBuffer(4);new DataView(length).setUint32(0,fields.length);
       const response=await fetch(api+"feedback",{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:new Blob([length,fields,raw.slice(part*step,(part+1)*step)])});
       const result=await response.json();if(!response.ok)throw new Error(result.error||"Не удалось отправить.");
       if(result.receipt){receipt=true;break}
     }
     if(!receipt)throw new Error("Не все части записи сохранены.");
     form.reset();audio(null);show("Замечание сохранено · "+cue(filmTime(clip,current)),"ok");
   }catch(err){show((err.message==="Failed to fetch"?"Проверьте подключение.":err.message)+" Текст и запись сохранены в форме.","bad")}
   finally{busy=false;area()}
 };
 window.addEventListener("pagehide",()=>{end();stream?.getTracks().forEach(t=>t.stop())},{once:true});
}
function makeCard(clip,role){
 const card=el("article","card");const v=el("video","player");v.controls=true;v.playsInline=true;v.preload=role==="lead"?"metadata":"none";v.setAttribute("aria-label",clip.title);
 if(role==="lead"){v.defaultMuted=true;v.muted=true}if(clip.poster)v.poster=clip.poster;v.src=clip.src;card.append(v);
 mediaList.push(v);v.addEventListener("play",()=>mediaList.forEach(o=>{if(o!==v)o.pause()}));
 const info=el("div","meta"),heading=el(role==="clip"?"h3":"h2","",clip.title);
 info.append(heading); if(role==="clip"){info.append(el("span","inpoint",cue(clip.start)+" – "+cue(clip.start+clip.duration)))}
 else {info.append(el("span","pill",role==="lead"?"Без звука":"Со звуком"),el("span","pill",fmt(clip.duration)))}
 card.append(info);
 const fileUrl=new URL(clip.src,location.href);
 fileUrl.searchParams.set("download","1");
 const download=el("a","download-link","Скачать MP4");
 download.href=fileUrl.href;download.download=fileUrl.pathname.split("/").pop();
 download.setAttribute("aria-label","Скачать MP4 — "+clip.title);info.append(download);
 if(clip.design){const link=el("a","inpoint","Рассмотреть вагон на нейтральном фоне");link.href=clip.design;link.target="_blank";link.rel="noopener";info.append(link)}
 mountForm(card,clip,v);return card;
}
(async()=>{
 try{
   const response=await fetch(api+"manifest",{cache:"no-store"});if(!response.ok)throw new Error();
   const list=await response.json();document.querySelector("#film").append(makeCard(list.lead,"lead"));
   document.querySelector("#animatic").append(makeCard(list.animatic,"animatic"));
   const section=document.querySelector("#scenes"),grid=el("div","grid");section.append(el("h2","section-title","Сцены фильма"),grid);
   const additions=list.clips.filter(c=>c.collection==="exhibits");
   if(additions.length){
     const section=document.querySelector("#new-shots"),grid=el("div","grid");
     section.hidden=false;section.append(el("h2","section-title","Новые вагоны и экспозиции"),grid);
     additions.sort((a,b)=>a.order-b.order).forEach(c=>{const card=makeCard(c,"clip");card.id=c.id;card.querySelector(".inpoint").textContent=cue(c.duration)+" · Со звуком";grid.append(card)});
   }
   list.clips.filter(c=>c.collection!=="exhibits").sort((a,b)=>a.start-b.start).forEach(c=>grid.append(makeCard(c,"clip")));document.querySelector("#notice").textContent="";
 }catch(e){document.querySelector("#notice").textContent="Не удалось загрузить видео. Обновите страницу."}
})();
