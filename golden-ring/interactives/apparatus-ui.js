import {createStage} from './apparatus-stage.js';
import {stations} from './apparatus-spec.js';
import {bellConsole} from './bell-console.js';
import {views,viewNumber,framePath} from './river-media.js';
import {fairVisit} from './fair-visit.js';
const $=s=>document.querySelector(s),qs=new URLSearchParams(location.search),film=qs.has('film');
const id=Object.hasOwn(stations,qs.get('scene'))?qs.get('scene'):'glass';
const spec=stations[id],data=window.RingScenes.find(x=>x.id===id),canvas=$('#stage'),range=$('#range');
document.documentElement.classList.toggle('film',film);document.title=data.title+' · Золотое кольцо';
for(const [s,v] of Object.entries({'#title':data.title,'#zone':data.zone,'#aim':data.aim,'#action-title':spec.subject,'#measure':spec.quantity,'#operate':spec.control,'#how':data.apparatus,'#decision':data.decision,'#feedback':data.beats[0]}))$(s).textContent=v;
$('#drawing').href='../drawings.html?scene='+id;
$('#schema').href='../drawings.html?scene='+id+'&sheet=2';
$('#schema').textContent='Разрез и детали →';
if(id==='shadow'){
  $('#schema').href='../drawings.html?scene=shadow&sheet=2';
  $('#schema').textContent='Разрез каретки и датчика →';
  $('#drawing').textContent='Габариты и сборка →';
  $('#fair-origin').hidden=false;
}
const select=$('#select');for(const item of window.RingScenes)select.add(new Option(item.title,item.id,false,item.id===id));
select.onchange=()=>{location.href='apparatus.html?scene='+select.value;};
let stage,view='hall',progress=0,anim=0,audio,fair;
let bells,windowIndex=0,windowTimer=0,windowPaused=false;
function draw(){if(bells){bells.render();return;}if(id==='regional')setWindow();if(id==='soundmap'&&!film){const i=progress<=0?0:Math.min(3,Math.ceil(progress*3-.00001));$('#full-volga').src='art/volga-map/'+i+'.webp';options.querySelectorAll('button').forEach((b,j)=>b.setAttribute('aria-pressed',String(i===j)));}if(fair){fair.render();return;}if(stage)stage.interactive(view,progress,id==='regional'?windowIndex*5:0);range.value=Math.round(progress*100);range.setAttribute('aria-valuetext',id==='bells'?Math.ceil(progress*3)+' из трёх голосов':Math.round(progress*100)+' процентов');
  const cue=Math.min(3,Math.ceil(progress*3-.001));$('#feedback').textContent=data.beats[Math.max(0,cue)];}
function active(v){view=v;stage?.resetOrbit();document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===v)));}
const options=$('#exhibit-controls');
function setWindow(){
  if(film||id!=='regional')return;
  options.querySelector('[data-caption]').textContent=Array.from({length:3},(_,i)=>views[viewNumber(windowIndex,i)]).join(' · ');
  options.querySelector('[data-next]').disabled=progress<.99;options.querySelector('[data-pause]').disabled=progress<.99;
  if(progress<.99||windowPaused){clearInterval(windowTimer);windowTimer=0;}
  else if(!windowTimer)windowTimer=setInterval(()=>{if(!document.hidden){windowIndex=(windowIndex+1)%24;draw();}},5000);
}
if(!film&&id==='regional'){
  options.hidden=false;options.innerHTML='<h2>У окна</h2><p>Проведите ладонью по стеклу. В открытых окнах сменяются 24 пейзажа. Можно задержать понравившийся вид.</p><p data-caption></p><button data-next>Следующие виды</button> <button data-pause aria-pressed="false">Остановить смену</button>';
  options.querySelector('[data-next]').onclick=()=>{windowIndex=(windowIndex+1)%24;draw();};
  options.querySelector('[data-pause]').onclick=e=>{windowPaused=!windowPaused;e.target.setAttribute('aria-pressed',String(windowPaused));e.target.textContent=windowPaused?'Продолжить смену':'Остановить смену';draw();};
}
if(!film&&id==='soundmap'){
  options.hidden=false;options.innerHTML='<h2>От истока до Каспия</h2><div class="buttons"></div><figure><img id="full-volga" width="1536" height="664" src="art/volga-map/0.webp" alt="Карта Волги от Волговерховья до Каспийского моря, масштабная линейка 200 км"><figcaption>Русло и притоки — Natural Earth. Длина реки — 3 530 км.</figcaption></figure>';
  ['Вся река','Верховья','Среднее течение','Низовья'].forEach((name,i)=>{const b=document.createElement('button');b.textContent=name;b.onclick=()=>{progress=i/3;active('result');draw();if(i)tone(i-1);else riverSound?.pause();};options.querySelector('.buttons').append(b);});
}
if(!film&&id==='bells'){
  options.hidden=false;bells=bellConsole(options,state=>{progress=state.participants.filter(Boolean).length/3;range.value=Math.round(progress*100);range.setAttribute('aria-valuetext',state.participants.filter(Boolean).length+' из трёх голосов');stage?.interactive(view,progress,0,state);},$('#feedback'));
}
if(id==='shadow'&&!film){
  fair=fairVisit({paint:(p,t)=>stage?.interactive(view,p,t),selectView:active,
    setPosition:p=>{progress=p;range.value=Math.round(p*100);range.setAttribute('aria-valuetext',Math.round(p*623)+' мм из 623');},
    setAction:s=>{$('#operate').textContent=s;},feedback:$('#feedback'),beats:data.beats,soundButton:$('#fair-audio')});
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{fair?.manualView();active(b.dataset.view);draw();});
range.oninput=()=>{cancelAnimationFrame(anim);progress=Number(range.value)/100;if(bells)bells.setCount(Math.round(progress*3));else if(fair)fair.seek(progress);else draw();};
let riverSound;
function tone(n){
  if(id!=='soundmap')return;
  riverSound?.pause();riverSound=new Audio('art/volga-map/'+(n+1)+'.mp3');riverSound.volume=.72;riverSound.play().catch(()=>{});
}
$('#operate').onclick=()=>{if(bells){bells.next();return;}if(fair){fair.move();return;}cancelAnimationFrame(anim);const from=progress,to=from>=.99?0:id==='regional'?1:Math.min(1,(Math.floor(from*3+.05)+1)/3);if(to>0)tone(Math.round(to*3)-1);
 const start=performance.now(),duration=matchMedia('(prefers-reduced-motion:reduce)').matches?1:760;
 function tick(t){const u=Math.min(1,(t-start)/duration);progress=from+(to-from)*u*u*(3-2*u);draw();if(u<1)anim=requestAnimationFrame(tick);}anim=requestAnimationFrame(tick);};
$('#reset').onclick=()=>{riverSound?.pause();cancelAnimationFrame(anim);progress=0;windowIndex=0;active('hall');if(bells)bells.reset();else if(fair)fair.reset();else draw();};
let drag;canvas.onpointerdown=e=>{fair?.manualView();drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);};
canvas.onpointermove=e=>{if(!drag||!stage)return;stage.orbit((drag[0]-e.clientX)*.007,(e.clientY-drag[1])*.006);drag=[e.clientX,e.clientY];};
canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};
canvas.onwheel=e=>{e.preventDefault();stage?.orbit(0,0,Math.exp(e.deltaY*.001));};
const api=window.apparatus={marks:()=>stage.marks(),ground:()=>stage.ground(),plate:(...args)=>stage.plate(...args),cinema:(...args)=>stage.cinema(...args),contacts:()=>stage.contacts(),frame:t=>stage.frame(t),still:(v,p=.7,seconds=0)=>{if(['hall','user','detail','result','top'].includes(v))stage.interactive(v,p,seconds);},showBells:state=>{if(id==='bells'&&stage)stage.interactive('hall',state.participants.filter(Boolean).length/3,0,state);}};
api.ready=(async()=>{const times=await fetch('films/timings.json').then(r=>r.json());stage=await createStage(canvas,id,times[id],film);$('#loading').hidden=true;api.dimensions=stage.dimensions;api.grip=stage.grip;api.detail=stage.detail;api.mount=stage.mount;api.duration=times[id].duration;if(!film){const firstView=qs.get('view')||(qs.get('shot')==='action'?'user':'hall');if(['hall','user','detail','result','top'].includes(firstView))active(firstView);draw();}return true;})();
api.ready.catch(()=>{$('#loading').hidden=false;$('#loading').textContent='Трёхмерный вид не загрузился. Работу прибора можно изучить по схеме ниже.';});
if(!film){new ResizeObserver(()=>{if(stage)draw();}).observe(canvas);}
if(!film)fetch('films/catalog.json?v=visitor-performance').then(r=>r.ok?r.json():{}).then(list=>{const take=list[id];if(!take)return;
 const movie=$('#movie');movie.onloadedmetadata=()=>{$('#draft-size').textContent=movie.videoWidth+' × '+movie.videoHeight;};
 movie.addEventListener('play',()=>fair?.pauseSound());
 const rev=take.revision?'?v='+take.revision:'';movie.src='films/'+id+'.mp4'+rev;movie.poster='../media/poster-'+(id==='shadow'?'fair':id)+'.webp'+rev;
 $('#take-status').textContent=take.performance?'':'Драфт';
 const track=document.createElement('track');Object.assign(track,{kind:'captions',label:'Русский',srclang:'ru',src:'films/'+id+'.vtt'+rev});movie.append(track);$('#film-panel').hidden=false;
 if(location.hash==='#film-panel')$('#film-panel').scrollIntoView();}).catch(()=>{});
