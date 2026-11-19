/* Visibility markers belong to the project. Removing a marker changes the public
   selection through the site's existing authenticated GitHub publishing flow. */
const root = new URL('./', import.meta.url);
const markers = new Map();
const station = new URLSearchParams(location.search).get('scene') || 'glass';
const statusPage = document.createElement('dialog');
statusPage.className = 'material-dialog';
statusPage.innerHTML = '<h2>Снять с публикации?</h2><p class="picked"></p><p>После подтверждения редактором и обновления сайта материал исчезнет с общей страницы. Исходный файл сохранится.</p><div><button type="button">Отмена</button><a target="_blank" rel="noopener">Подтвердить в GitHub ↗</a></div>';
document.body.append(statusPage);
statusPage.querySelector('button').onclick = () => statusPage.close();
function showEditor(key,label) {
  statusPage.querySelector('.picked').textContent = label;
  statusPage.querySelector('a').href = 'https://github.com/Mak207/fazafilms-site/delete/main/golden-ring/published/'+encodeURIComponent(key)+'.txt';
  statusPage.showModal();
}
function track(key,node){
  if(!node)return;
  if(!markers.has(key))markers.set(key,new Set());
  markers.get(key).add(node);
}
function control(key,node,label,host=node){
  track(key,node);
  if(!host)return;
  if(host.matches('a')) {
    const wrap=document.createElement('span');wrap.className='material-link';
    host.before(wrap);wrap.append(host);host=wrap;track(key,wrap);
  }
  host.classList.add('material-frame');
  const button=document.createElement('button');
  button.type='button';button.className='material-remove';button.textContent='×';
  button.title='Снять с публикации · '+label;button.setAttribute('aria-label',button.title);
  button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();showEditor(key,label);});
  host.append(button);
}
const basename=url=>new URL(url, location.href).pathname.split('/').pop();
for(const card of document.querySelectorAll('.experience[data-scene]')){
  const id=card.dataset.scene, title=card.querySelector('h2').textContent;
  control('station-'+id,card,'Интерактив «'+title+'»',card.querySelector('.experience-copy'));
  const cover=card.querySelector('.play-cover'),key='film-'+id;
  control(key,cover,'Ролик «'+title+'»',cover);
  track(key,card.querySelector('.film-link'));
}
for(const link of document.querySelectorAll('a[href*="files/"]')){
  const key='file-'+basename(link.href),card=link.closest('.file-card');
  const label=(card?.querySelector('h2')?.textContent || link.textContent.trim())+' · '+basename(link.href).split('.').pop().toUpperCase();
  control(key,link,label,link);
  if(card && card.querySelectorAll('a').length===1)track(key,card);
}
for(const a of document.querySelectorAll('[data-gallery]')){
  const key='image-'+basename(a.href),host=a.closest('figure,li')||a;
  control(key,host,a.dataset.title,host);
}
for(const b of document.querySelectorAll('.comparison[id]'))control('board-'+b.id,b,b.querySelector('h2')?.textContent || b.id);
for(const s of document.querySelectorAll('#sheets>section[id]')){
  track('station-'+s.id,s);
  for(const f of s.querySelectorAll('figure'))control('drawing-'+f.id,f,s.querySelector('h2').textContent+' · '+f.querySelector('figcaption').textContent);
}
if(document.getElementById('stage')&&document.getElementById('operate')&&!location.search.includes('film=1')){
  const main=document.querySelector('main');
  const notice=document.createElement('p');notice.id='withdrawn-station';notice.textContent='Интерактив снят с общей страницы.';notice.hidden=true;main.after(notice);
  control('station-'+station,main,'Интерактив «'+document.querySelector('#title').textContent+'»',main);
  control('film-'+station,document.querySelector('#film-panel'),'Демонстрация работы прибора');
  const select=document.querySelector('#select');
  for(const opt of select.options)track('station-'+opt.value,opt);
}
const deck=document.querySelector('.presentation:not(.light-study)');
if(deck){control('presentation',deck,'Презентация проекта');track('presentation',document.querySelector('.slide-list'));}
function apply(key,removed){
  for(const node of markers.get(key)){
    const keys=new Set((node.dataset.removedMaterials||'').split(' ').filter(Boolean));
    if(removed)keys.add(key);else keys.delete(key);
    node.dataset.removedMaterials=Array.from(keys).join(' ');
    node.classList.toggle('material-unpublished',keys.size>0);
    if(node.tagName==='OPTION')node.disabled=keys.size>0;
    if(node.tagName==='MAIN'){const n=document.getElementById('withdrawn-station');if(n)n.hidden=!keys.size;}
    if(removed)node.querySelectorAll('video').forEach(v=>v.pause());
  }
}
let refreshing=false;
async function refresh(){
  if(refreshing)return;refreshing=true;
  const keys=Array.from(markers.keys());
  try{
    await Promise.all(Array.from({length:6},async()=>{
      for(let key;(key=keys.shift());){
        try{
          const r=await fetch(new URL('published/'+encodeURIComponent(key)+'.txt',root),{method:'HEAD',cache:'no-cache'});
          if(r.ok||r.status===404||r.status===410)apply(key,!r.ok);
        }catch{}
      }
    }));
  }finally{refreshing=false;}
}
refresh();window.addEventListener('focus',refresh);
window.addEventListener('pageshow',e=>{if(e.persisted)refresh();});
