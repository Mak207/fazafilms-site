'use strict';
const viewer=document.getElementById('viewer');
const pic=document.getElementById('viewer-image');
const label=document.getElementById('slide-label');
const thumbs=[...document.querySelectorAll('.slide-open')];
let current=0;
function show(i){current=Math.max(0,Math.min(thumbs.length-1,i));const source=thumbs[current].querySelector('img');pic.src=source.src;pic.alt=source.alt;label.textContent=`${current+1} / ${thumbs.length} — ${source.alt.replace(/^Слайд \d+: /,'')}`;document.getElementById('prev').disabled=current===0;document.getElementById('next').disabled=current===thumbs.length-1;if(!viewer.open)viewer.showModal();}
thumbs.forEach((b,i)=>b.addEventListener('click',()=>show(i)));
document.getElementById('start-show').addEventListener('click',()=>show(0));
document.getElementById('close-show').addEventListener('click',()=>viewer.close());
document.getElementById('prev').addEventListener('click',()=>show(current-1));
document.getElementById('next').addEventListener('click',()=>show(current+1));
document.addEventListener('keydown',e=>{if(!viewer.open)return;if(e.key==='ArrowRight'){e.preventDefault();show(current+1)}if(e.key==='ArrowLeft'){e.preventDefault();show(current-1)}});
document.getElementById('status-filter').addEventListener('change',e=>{document.querySelectorAll('.decision').forEach(x=>x.hidden=!!e.target.value&&x.dataset.status!==e.target.value)});
