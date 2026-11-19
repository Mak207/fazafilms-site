const sheets = document.getElementById('sheets');
for (const item of window.RingScenes) {
  const section = document.createElement('section');
  section.id = item.id;
  const heading = document.createElement('h2');
  heading.textContent = item.title;
  const link = document.createElement('a');
  link.href = 'interactives/apparatus.html?scene=' + item.id;
  link.textContent = 'Посмотреть в 3D →';
  const head = document.createElement('div');
  head.className = 'station-head'; head.append(heading,link);
  const pair = document.createElement('div');
  pair.className = 'pair';
  for (const [i, caption] of ['Габариты и сборка','Разрез и детали'].entries()) {
    const prefix = 'media/drawings/'+item.id+'-'+(i+1);
    const figure = document.createElement('figure');
    figure.id = item.id+'-'+(i+1);
    const title = document.createElement('figcaption'); title.textContent = caption;
    const zoom = document.createElement('a');
    zoom.href = prefix+'-full.webp'; zoom.target = '_blank'; zoom.rel = 'noopener';
    const img = document.createElement('img');
    Object.assign(img,{src:prefix+'.webp',width:1430,height:1011,loading:'lazy',alt:item.title+' — '+caption+'. Увеличить лист'});
    zoom.append(img); figure.append(title,zoom); pair.append(figure);
  }
  section.append(head,pair); sheets.append(section);
}
const query = new URLSearchParams(location.search);
const initial = document.getElementById((query.get('scene')||'')+'-'+(query.get('sheet')==='2'?'2':'1'));
if(initial) requestAnimationFrame(()=>initial.scrollIntoView({block:'start'}));
