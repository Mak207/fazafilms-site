import {createStage} from './apparatus-stage.js';
import {stations} from './apparatus-spec.js';
const $=s=>document.querySelector(s),qs=new URLSearchParams(location.search),film=qs.has('film');
const id=Object.hasOwn(stations,qs.get('scene'))?qs.get('scene'):'glass';
const spec=stations[id],data=window.RingScenes.find(x=>x.id===id),canvas=$('#stage'),range=$('#range');
document.documentElement.classList.toggle('film',film);document.title=data.title+' · Золотое кольцо';
for(const [s,v] of Object.entries({'#title':data.title,'#zone':data.zone,'#aim':data.aim,'#action-title':spec.subject,'#measure':spec.quantity,'#operate':spec.control,'#how':data.apparatus,'#decision':data.decision,'#feedback':data.beats[0]}))$(s).textContent=v;
$('#schema').href='spatial.html?scene='+id+'&view=detail&part=1';
$('#drawing').href='../drawings.html?scene='+id;
const select=$('#select');for(const item of window.RingScenes)select.add(new Option(item.title,item.id,false,item.id===id));
select.onchange=()=>{location.href='apparatus.html?scene='+select.value;};
let stage,view='hall',progress=0,anim=0,audio;
function draw(){if(stage)stage.interactive(view,progress);range.value=Math.round(progress*100);range.setAttribute('aria-valuetext',id==='bells'?Math.ceil(progress*3)+' из трёх голосов':Math.round(progress*100)+' процентов');
  const cue=Math.min(3,Math.ceil(progress*3-.001));$('#feedback').textContent=data.beats[Math.max(0,cue)];}
function active(v){view=v;stage?.resetOrbit();document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===v)));}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{active(b.dataset.view);draw();});
range.oninput=()=>{cancelAnimationFrame(anim);progress=Number(range.value)/100;draw();};
function tone(n){if(!['bells','soundmap'].includes(id))return;try{audio||=new AudioContext();audio.resume();const now=audio.currentTime,f=[196,294,392][n%3];
 for(const [multiple,gain] of [[1,.07],[2.36,.029],[3.18,.017]]){const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=f*multiple;o.connect(g).connect(audio.destination);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(gain,now+.025);g.gain.exponentialRampToValueAtTime(.0001,now+1.9);o.start(now);o.stop(now+2);}}catch{}}
$('#operate').onclick=()=>{cancelAnimationFrame(anim);const from=progress,to=from>=.99?0:Math.min(1,(Math.floor(from*3+.05)+1)/3);if(to>0)tone(Math.round(to*3)-1);
 const start=performance.now(),duration=matchMedia('(prefers-reduced-motion:reduce)').matches?1:760;
 function tick(t){const u=Math.min(1,(t-start)/duration);progress=from+(to-from)*u*u*(3-2*u);draw();if(u<1)anim=requestAnimationFrame(tick);}anim=requestAnimationFrame(tick);};
$('#reset').onclick=()=>{cancelAnimationFrame(anim);progress=0;active('hall');draw();};
let drag;canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);};
canvas.onpointermove=e=>{if(!drag||!stage)return;stage.orbit((drag[0]-e.clientX)*.007,(e.clientY-drag[1])*.006);drag=[e.clientX,e.clientY];};
canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};
canvas.onwheel=e=>{e.preventDefault();stage?.orbit(0,0,Math.exp(e.deltaY*.001));};
const api=window.apparatus={frame:t=>stage.frame(t)};
api.ready=(async()=>{const times=await fetch('films/timings.json').then(r=>r.json());stage=await createStage(canvas,id,times[id],film);$('#loading').hidden=true;api.dimensions=stage.dimensions;api.grip=stage.grip;api.detail=stage.detail;api.mount=stage.mount;api.duration=times[id].duration;if(!film)draw();return true;})();
api.ready.catch(()=>{$('#loading').hidden=false;$('#loading').textContent='Трёхмерный вид не загрузился. Работу прибора можно изучить по схеме ниже.';});
if(!film){new ResizeObserver(()=>{if(stage)draw();}).observe(canvas);}
if(!film)fetch('films/catalog.json').then(r=>r.ok?r.json():{}).then(list=>{if(!list[id])return;
 const movie=$('#movie');movie.src='films/'+id+'.mp4';movie.poster='../media/poster-'+id+'.webp';
 const track=document.createElement('track');Object.assign(track,{kind:'captions',label:'Русский',srclang:'ru',src:'films/'+id+'.vtt'});movie.append(track);$('#film-panel').hidden=false;
 if(location.hash==='#film-panel')$('#film-panel').scrollIntoView();}).catch(()=>{});
