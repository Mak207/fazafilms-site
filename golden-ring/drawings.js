const byId=id=>document.getElementById(id);const select=byId('station');let sheet=1;
for(const item of window.RingScenes)select.add(new Option(item.title,item.id));
function update(){const item=window.RingScenes.find(s=>s.id===select.value);const file='media/drawings/'+item.id+'-'+sheet+'.webp';byId('sheet').src=file;byId('sheet').alt=item.title+' — '+(sheet===1?'габариты и сборка':'разрез и детали');byId('zoom').href=file.replace('.webp','-full.webp');byId('zoom').setAttribute('aria-label','Увеличить чертёж — '+item.title);
byId('decision').textContent=item.decision;byId('model').href='interactives/apparatus.html?scene='+item.id;
document.querySelectorAll('[data-sheet]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.sheet)===sheet)));history.replaceState(null,'','?scene='+item.id+'&sheet='+sheet);}
const q=new URLSearchParams(location.search);if(window.RingScenes.some(s=>s.id===q.get('scene')))select.value=q.get('scene');sheet=q.get('sheet')==='2'?2:1;
select.addEventListener('change',update);document.querySelectorAll('[data-sheet]').forEach(b=>b.onclick=()=>{sheet=Number(b.dataset.sheet);update();});update();
