'use strict';
const panels=[...document.querySelectorAll('.panel')];
const aliases={deck:'materials',R01:'approved',R02:'approved'};
function route(focus=false){
  let hash='';try{hash=decodeURIComponent(location.hash.slice(1))}catch{}
  const target=document.getElementById(hash);
  const section=panels.find(p=>p.id===hash)?.id || aliases[hash] || target?.closest('.panel')?.id || 'overview';
  panels.forEach(p=>p.hidden=p.id!==section);
  document.querySelectorAll('[data-nav]').forEach(a=>{if(a.dataset.nav===section)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  document.title=document.querySelector('[data-nav="'+section+'"]').textContent+' — Золотое кольцо · ФАЗА';
  if(target?.matches('details'))target.open=true;
  if(focus){document.getElementById(section+'-title').focus({preventScroll:true});window.scrollTo(0,0);if(target&&target.id!==section)target.scrollIntoView({block:'start'})}
}
window.addEventListener('hashchange',()=>route(true));route();
const ownerFilter=document.getElementById('owner-filter');
function filterDecisions(){let count=0;document.querySelectorAll('.decision').forEach(d=>{d.hidden=!!ownerFilter.value&&d.dataset.owner!==ownerFilter.value&&!(d.dataset.owner==='Оба'&&ownerFilter.value!=='Команда');if(!d.hidden)count++});document.getElementById('result-count').textContent='Вопросов: '+count+' из 10'}
ownerFilter.addEventListener('change',filterDecisions);filterDecisions();
const viewer=document.getElementById('viewer');
const pic=document.getElementById('viewer-image');
const label=document.getElementById('slide-label');
const thumbs=[...document.querySelectorAll('.slide-open')];
let current=0,opener=null;
function show(i){
 current=Math.max(0,Math.min(thumbs.length-1,i));const source=thumbs[current].querySelector('img');pic.src=source.src;pic.alt=source.alt;
 label.textContent=(current+1)+' / '+thumbs.length+' — '+source.alt.replace(/^Слайд \d+: /,'');
 document.getElementById('prev').disabled=current===0;document.getElementById('next').disabled=current===thumbs.length-1;
 if(!viewer.open){opener=document.activeElement;viewer.showModal()}
}
thumbs.forEach((b,i)=>b.addEventListener('click',()=>show(i)));
document.getElementById('start-show').addEventListener('click',()=>show(0));
document.getElementById('close-show').addEventListener('click',()=>viewer.close());
viewer.addEventListener('close',()=>opener?.focus());
document.getElementById('prev').addEventListener('click',()=>show(current-1));
document.getElementById('next').addEventListener('click',()=>show(current+1));
document.addEventListener('keydown',e=>{if(!viewer.open)return;if(e.key==='ArrowRight'){e.preventDefault();show(current+1)}if(e.key==='ArrowLeft'){e.preventDefault();show(current-1)}});
