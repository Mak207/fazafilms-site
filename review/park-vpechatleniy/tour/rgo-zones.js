/** RGO proposal layer. Building and exhibit transforms are never changed. */
const COLORS={media:0xffbd66,interactive:0x68b7ff,navigation:0xff91b6,special:0xc4a0ff};
const nf=(n,d=0)=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('ru-RU',{maximumFractionDigits:d}):'не определено';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const btn=(text,cls='rgo-button')=>{const n=el('button',cls,text);n.type='button';return n;};
const displayName=hall=>hall.displayName||hall.title;
const finite=v=>typeof v==='number'&&Number.isFinite(v);

export async function createRgoZones({THREE,scene,canvas,camera,panel,onNavigate,onOverview,requestRender,getExhibitRoot=()=>null,getExistingObstacles=()=>[],dataUrl=new URL('./rgo-data.json',import.meta.url)}){
  const response=await fetch(dataUrl,{credentials:'same-origin'});if(!response.ok)throw new Error(`РГО: HTTP ${response.status}`);
  const data=await response.json();
  if(!Array.isArray(data.halls)||data.halls.length!==9||!Array.isArray(data.surfaces)||data.surfaces.length!==26||new Set(data.surfaces.map(s=>s.id)).size!==26)throw new Error('РГО: неполная программа.');
  if(data.surfaces.some(s=>!s.position?.every(finite)||!s.rotation?.every(finite)||![s.widthM,s.heightM,s.bottomHeightM].every(finite)))throw new Error('РГО: некорректные координаты экранов.');
  const abort=new AbortController(),listen=(n,t,fn)=>n.addEventListener(t,fn,{signal:abort.signal});
  const root=new THREE.Group();root.name='RGO_project_screen_layer';root.userData.projectProposal=true;scene.add(root);
  const surfaces=new Map(),halls=new Map(),hitObjects=[],disposables=new Set(),ghosts=new Map();
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  let activeHall=null,selectedSurface=null,visible=true,activeView=false,showLabels=true,showReserves=false,destroyed=false,pointerDown=null,lastHover=null,layoutChanged=false;
  function obstacleSignature(){return JSON.stringify(getExistingObstacles().map(p=>({id:p.id,shape:p.shape,centerXZ:p.centerXZ,halfSizeXZ:p.halfSizeXZ,rotationY:p.rotationY,minY:p.minY,maxY:p.maxY,radius:p.radius,start:p.start,end:p.end})).sort((a,b)=>String(a.id).localeCompare(String(b.id))));}
  const initialObstacleSignature=obstacleSignature();
  const content=panel.querySelector('.rgo-content');content.replaceChildren();
  const intro=el('p','rgo-intro','9 залов · 1120 м² по программе. Положение — рабочая привязка плана к DWG; стены залов не объявлены утверждёнными.');
  const legend=el('div','rgo-legend');legend.setAttribute('aria-label','Обозначения проектного слоя');
  for(const [key,label,glyph]of [['media','LED-полотно','Л'],['interactive','Интерактив','И'],['navigation','Навигация','Н'],['special','Спецсистема','◇']]){const item=el('span','rgo-legend-item');item.append(el('i',`rgo-glyph rgo-glyph-${key}`,glyph),el('span','',label));legend.append(item);}
  const summary=el('p','rgo-total',`${nf(data.totals.local.surfaceCount)} LED-полотен · ${nf(data.totals.local.cabinetCount)} кабинетов · ${nf(data.totals.local.areaM2,2)} м² изображения`);
  const overview=btn('Вся Аллея РГО','rgo-overview');overview.dataset.rgoZone='all';
  const zoneList=el('nav','rgo-zone-list');zoneList.setAttribute('aria-label','Последовательные залы РГО');
  const zoneButtons=new Map();
  for(const hall of data.halls){const b=btn('','rgo-zone-button');b.dataset.rgoZone=hall.sourceNumber;b.setAttribute('aria-pressed','false');b.append(el('strong','',hall.sourceNumber),el('span','',displayName(hall)));b.title=`${displayName(hall)} · ${hall.programAreaM2} м² по программе`;listen(b,'click',()=>selectHall(hall.id));zoneButtons.set(hall.id,b);zoneList.append(b);}
  const controls=el('details','panel-details rgo-options'),cs=el('summary','','Слои и источник');controls.append(cs,intro);
  function checkbox(text,value,change){const label=el('label','rgo-check'),input=el('input');input.type='checkbox';input.checked=value;listen(input,'change',()=>change(input.checked));label.append(input,el('span','',text));controls.append(label);return input;}
  const visibleInput=checkbox('Экраны РГО',true,value=>setVisible(value));
  checkbox('Номера залов',true,value=>{showLabels=value;syncVisibility();});
  checkbox('Сценарные резервы перед экранами',false,value=>{showReserves=value;syncVisibility();});
  controls.append(el('p','panel-note','LED — с отдельными органами управления. Сенсорность полотен не заявлена. Проекции и голографические эффекты показаны маркерами без выдуманных габаритов.'));
  const sourceLink=el('a','rgo-source','Исходный план · слайд 2');sourceLink.href=new URL('./rgo-source-plan.jpg',import.meta.url).href;sourceLink.target='_blank';sourceLink.rel='noopener';controls.append(sourceLink);
  const back=btn('Вернуться к парку','rgo-button rgo-back');listen(back,'click',()=>{deactivate();onOverview?.();});
  const inspector=el('section','rgo-inspector');inspector.setAttribute('aria-live','polite');
  const notice=el('p','rgo-limit','Проектный вариант. 25 новых полотен + 1 из общего фонда навигации. Это не прибавление 26 экранов к общей ведомости Парка.');
  const simulationNote=el('p','rgo-limit','Симуляция посетителей использует прежнюю схему Парка; маршрут РГО ещё не проверен.');
  content.append(summary,legend,overview,zoneList,inspector,controls,notice,simulationNote,back);
  const tooltip=el('div','rgo-tooltip');tooltip.hidden=true;tooltip.setAttribute('role','status');canvas.parentElement.append(tooltip);
  const infoRow=(dl,k,v)=>dl.append(el('dt','',k),el('dd','',v));
  const track=(value)=>{disposables.add(value);return value;};
  const material=(options)=>track(new THREE.MeshBasicMaterial(options));
  const lineMaterial=(options)=>track(new THREE.LineBasicMaterial(options));

  function makeLabel(text,color='#ebf3e6'){
    const c=document.createElement('canvas');c.width=768;c.height=128;const ctx=c.getContext('2d');
    ctx.fillStyle='#12231ee8';ctx.fillRect(0,0,c.width,c.height);ctx.strokeStyle=color;ctx.lineWidth=5;ctx.strokeRect(3,3,c.width-6,c.height-6);
    ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 50px Arial';ctx.fillText(text,384,66,738);
    const texture=track(new THREE.CanvasTexture(c));texture.colorSpace=THREE.SRGBColorSpace;
    const mat=track(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,depthTest:false}));const sprite=new THREE.Sprite(mat);sprite.scale.set(6,1,1);sprite.renderOrder=10;return sprite;
  }
  function makeTypeGlyph(category){
    const c=document.createElement('canvas');c.width=128;c.height=128;const ctx=c.getContext('2d');
    ctx.fillStyle='#'+(COLORS[category]||COLORS.media).toString(16);ctx.beginPath();
    if(category==='interactive')ctx.arc(64,64,56,0,Math.PI*2);
    else if(category==='navigation'){ctx.moveTo(32,8);ctx.lineTo(96,8);ctx.lineTo(120,64);ctx.lineTo(96,120);ctx.lineTo(32,120);ctx.lineTo(8,64);ctx.closePath();}
    else ctx.rect(8,18,112,92);
    ctx.fill();ctx.fillStyle='#12231e';ctx.font='700 70px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(category==='interactive'?'И':category==='navigation'?'Н':'Л',64,67);
    const texture=track(new THREE.CanvasTexture(c));texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(track(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,depthTest:false})));sprite.scale.set(.48,.48,1);sprite.renderOrder=9;return sprite;
  }
  function polygonMesh(geo,y,color){
    const ring=geo.coordinates[0],shape=new THREE.Shape();ring.forEach((p,i)=>i?shape.lineTo(p[0],-p[1]):shape.moveTo(p[0],-p[1]));
    const mesh=new THREE.Mesh(track(new THREE.ShapeGeometry(shape)),material({color,transparent:true,opacity:.12,side:THREE.DoubleSide,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.y=y;return mesh;
  }
  for(const hall of data.halls){
    const group=new THREE.Group();group.name=hall.id;root.add(group);
    const marker=new THREE.Mesh(track(new THREE.RingGeometry(.42,.65,32)),material({color:0xd8edc3,side:THREE.DoubleSide,transparent:true,opacity:.95}));marker.rotation.x=-Math.PI/2;marker.position.set(hall.position[0],hall.position[1]+.045,hall.position[2]);marker.userData.rgoHall=hall.id;group.add(marker);hitObjects.push(marker);
    const label=makeLabel(`${hall.sourceNumber} · ${displayName(hall)}`);label.position.set(hall.position[0],hall.position[1]+.85,hall.position[2]);group.add(label);
    const record={data:hall,group,marker,label,special:null};halls.set(hall.id,record);
    if(hall.specialSystems?.length){
      const special=new THREE.Mesh(track(new THREE.OctahedronGeometry(.32)),material({color:COLORS.special,wireframe:true}));special.position.set(hall.position[0]+.9,hall.position[1]+.65,hall.position[2]);special.userData.rgoHall=hall.id;special.userData.rgoSpecial=true;group.add(special);hitObjects.push(special);record.special=special;
    }
  }
  for(const s of data.surfaces){
    const holder=new THREE.Group();holder.name=s.id;holder.position.fromArray(s.position);holder.rotation.y=s.rotationY;holder.userData.rgoSurface=s.id;
    const color=COLORS[s.category]||COLORS.media;
    const body=new THREE.Mesh(track(new THREE.BoxGeometry(s.widthM,s.heightM,.084)),material({color:0x17242d}));body.position.y=s.bottomHeightM+s.heightM/2;
    const screen=new THREE.Mesh(track(new THREE.PlaneGeometry(s.widthM,s.heightM)),material({color,side:THREE.FrontSide,toneMapped:false}));screen.position.set(0,body.position.y,.044);screen.userData.rgoSurface=s.id;
    const grid=[];for(let c=1;c<s.cabinetColumns;c++){const x=-s.widthM/2+c*.608;grid.push(x,-s.heightM/2,.046,x,s.heightM/2,.046);}for(let r=1;r<s.cabinetRows;r++){const y=-s.heightM/2+r*.342;grid.push(-s.widthM/2,y,.046,s.widthM/2,y,.046);}
    const gridGeo=track(new THREE.BufferGeometry());gridGeo.setAttribute('position',new THREE.Float32BufferAttribute(grid,3));const cabinetGrid=new THREE.LineSegments(gridGeo,lineMaterial({color:0x10202c,transparent:true,opacity:.42}));cabinetGrid.position.y=body.position.y;
    const supportGeo=track(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-s.widthM*.28,0,0),new THREE.Vector3(-s.widthM*.28,s.bottomHeightM,0),new THREE.Vector3(s.widthM*.28,0,0),new THREE.Vector3(s.widthM*.28,s.bottomHeightM,0)]));
    const supports=new THREE.LineSegments(supportGeo,lineMaterial({color:0x8e9c92,transparent:true,opacity:.6}));supports.name='symbolic_unverified_support';
    const glyph=makeTypeGlyph(s.category);glyph.position.set(0,s.bottomHeightM+s.heightM+.35,0);glyph.userData.rgoSurface=s.id;
    holder.add(body,screen,cabinetGrid,supports,glyph);root.add(holder);hitObjects.push(body,screen,glyph);body.userData.rgoSurface=s.id;
    const reserve=polygonMesh(s.workingReserveXZ,7.225,color);root.add(reserve);
    surfaces.set(s.id,{data:s,holder,body,screen,cabinetGrid,supports,glyph,reserve});
  }
  function restoreGhosts(){
    for(const [mesh,original]of ghosts){const old=Array.isArray(mesh.material)?mesh.material:[mesh.material];mesh.material=original;old.forEach(m=>m.dispose());}ghosts.clear();
  }
  function ghostConflicts(ids){
    restoreGhosts();if(!activeView||!visible)return;
    for(const id of ids){const object=getExhibitRoot(id);object?.traverse(mesh=>{if(!mesh.isMesh||ghosts.has(mesh))return;const original=mesh.material;ghosts.set(mesh,original);const make=m=>{const clone=m.clone();clone.transparent=true;clone.opacity=.18;clone.depthWrite=false;return clone;};mesh.material=Array.isArray(original)?original.map(make):make(original);});}
  }
  function syncVisibility(){
    root.visible=visible;
    for(const [id,h]of halls){h.label.visible=showLabels;h.label.material.opacity=(!activeHall||id===activeHall)?1:.8;h.marker.material.color.setHex(activeHall===id?0xffffff:0xd8edc3);}
    for(const s of surfaces.values()){
      const selected=!activeHall||s.data.hallId===activeHall;for(const mesh of [s.body,s.screen]){mesh.material.transparent=!selected;mesh.material.opacity=selected?1:.23;mesh.material.depthWrite=selected;}
      s.cabinetGrid.material.opacity=selected ? .42 : .12;s.supports.material.opacity=selected ? .6 : .15;s.glyph.material.opacity=selected?1:.35;s.reserve.visible=showReserves&&selected;
    }
    for(const [id,b]of zoneButtons)b.setAttribute('aria-pressed',String(id===activeHall));overview.setAttribute('aria-pressed',String(activeHall===null&&activeView));
    requestRender();
  }
  function currentConflicts(hall){return [...new Set(hall?hall.existingConflictIds||[]:data.halls.flatMap(h=>h.existingConflictIds||[]))];}
  function renderInspector(){
    inspector.replaceChildren();
    if(layoutChanged)inspector.append(el('p','rgo-conflict','Расстановка существующих объектов изменена. Привязка и исходные флаги соседства РГО не пересчитаны; размещение экранов требует новой проверки.'));
    const hall=activeHall?halls.get(activeHall)?.data:null;
    if(!hall){inspector.append(el('h3','','Аллея РГО · проектный слой'),el('p','','Выберите зал 00–08. Кнопки перемещают камеру к его экранам; исходные объекты остаются на местах.'));
      inspector.append(el('p','rgo-conflict','Залы 03–04 пересекаются с текущим ледоколом O12-1; зона 05 соседствует с ним. Зоны 06–07 пересекаются или соседствуют с МС-21, O05-1. В обзоре оба экспоната полупрозрачны; их координаты сохранены. Совмещение программы и маршрута требует согласования.'));return;}
    inspector.append(el('h3','',`${hall.sourceNumber} · ${displayName(hall)}`));
    const dl=el('dl','rgo-facts');infoRow(dl,'Исходное название',hall.sourceTitle||hall.title);infoRow(dl,'Площадь по программе',`${nf(hall.programAreaM2)} м² · слайд ${hall.sourceSlide}`);infoRow(dl,'LED в этом варианте',`${hall.surfaces.length} полотен`);infoRow(dl,'Цель в 3D, X / Y / Z',hall.position.map(v=>nf(v,2)).join(' / ')+' м');inspector.append(dl);
    if(hall.conflictNote)inspector.append(el('p','rgo-conflict',hall.conflictNote));
    inspector.append(el('p','rgo-main-exhibit',`Главный экспонат программы: ${hall.mainExhibit}. Его новая 3D-модель в этом слое не создаётся.`));
    if(!hall.surfaces.length)inspector.append(el('p','rgo-zero','В этом зале LED не добавлен. Специальные системы и их оборудование требуют отдельного решения; ноль LED не означает отсутствие медиа.'));
    const list=el('div','rgo-surface-list');for(const s of hall.surfaces){const b=btn(`${s.id} · ${s.label}`,'rgo-surface-button');b.setAttribute('aria-pressed',String(selectedSurface===s.id));listen(b,'click',()=>selectSurface(s.id));list.append(b);}inspector.append(list);
    const s=selectedSurface?surfaces.get(selectedSurface)?.data:null;
    if(s&&s.hallId===hall.id){
      const card=el('div','rgo-surface-card'),d=el('dl','rgo-facts');card.append(el('h4','',s.label));
      infoRow(d,'ID',s.id);infoRow(d,'LED-полотно',`${nf(s.widthM,3)} × ${nf(s.heightM,3)} м`);infoRow(d,'Сборка',`${s.cabinetColumns} × ${s.cabinetRows} = ${s.cabinetCount} кабинетов`);
      infoRow(d,'Разрешение',`${nf(s.pixelWidth)} × ${nf(s.pixelHeight)} пикселей`);infoRow(d,'Координаты основания',s.position.map(v=>nf(v,2)).join(' / ')+' м');infoRow(d,'Низ изображения',`${nf(s.bottomHeightM,2)} м над полом · проектное значение`);
      infoRow(d,'Масса кабинетов',`${nf(s.cabinetMassKg,1)} кг · без креплений`);infoRow(d,'Предел LED по серии',`${nf(s.publishedSeriesMaximumW/1000,2)} кВт · не вся система`);card.append(d,el('p','',s.purpose));
      if(s.sharedBaseNavigation)card.append(el('p','rgo-shared','Одна поверхность зарезервирована из базового фонда 12 навигационных. Физический ID общего оборудования ещё не установлен; повторно к Парку не прибавляется.'));
      if(s.category==='interactive'||s.sharedBaseNavigation)card.append(el('p','rgo-note','Предусмотрены отдельные органы управления. LED-сборка сама по себе не сенсорная.'));
      card.append(el('p','rgo-note','Опора показана условно. Крепления, сервис, питание и итоговая установка не утверждены.'));inspector.append(card);
    }
    if(hall.specialSystems?.length){const special=el('details','panel-details');special.append(el('summary','','Проекции и специальные системы'));for(const item of hall.specialSystems)special.append(el('p','panel-note',item.description));inspector.append(special);}
    inspector.append(el('p','rgo-note',hall.geometryNote));
  }
  function cameraRequest(hall,selected){
    const p=selected?.position||hall?.position;
    const box=new THREE.Box3();
    if(selected){box.setFromObject(surfaces.get(selected.id).holder);box.expandByScalar(1.4);}
    else if(hall){box.set(new THREE.Vector3(p[0]-4,7.2,p[2]-4),new THREE.Vector3(p[0]+4,10.2,p[2]+4));for(const s of hall.surfaces)box.union(new THREE.Box3().setFromObject(surfaces.get(s.id).holder));box.expandByScalar(1.0);}
    else{for(const h of data.halls)box.expandByPoint(new THREE.Vector3(...h.position));for(const s of surfaces.values())box.union(new THREE.Box3().setFromObject(s.holder));box.expandByScalar(3);}
    const first=selected||hall?.surfaces.find(s=>s.category!=='interactive')||hall?.surfaces[0];
    let direction;if(first){const [nx,nz]=first.faceNormalXZ;direction=new THREE.Vector3(nx*1.5+.12,.95,nz*1.5+.12);}else direction=new THREE.Vector3(-1.3,1.55,1.2);
    onNavigate({box,direction,label:hall?`РГО · ${hall.sourceNumber} · ${displayName(hall)}`:'Аллея РГО · все 9 залов',hallId:hall?.id||null,surfaceId:selected?.id||null,conflictIds:currentConflicts(hall)});
  }
  function setLink(value){const url=new URL(location.href);url.searchParams.set('rgo',value);history.replaceState(null,'',url);}
  function selectHall(id,{navigate=true,writeUrl=true}={}){
    const hall=halls.get(id)?.data;if(!hall)return false;activeHall=id;selectedSurface=null;activeView=true;visible=true;visibleInput.checked=true;
    ghostConflicts(currentConflicts(hall));syncVisibility();renderInspector();if(writeUrl)setLink(hall.sourceNumber);if(navigate)cameraRequest(hall);return true;
  }
  function selectSurface(id){const s=surfaces.get(id)?.data;if(!s)return false;activeHall=s.hallId;selectedSurface=id;activeView=true;visible=true;visibleInput.checked=true;ghostConflicts(currentConflicts(halls.get(activeHall).data));syncVisibility();renderInspector();setLink(halls.get(activeHall).data.sourceNumber);cameraRequest(halls.get(activeHall).data,s);return true;}
  function showOverview({navigate=true,writeUrl=true}={}){activeHall=null;selectedSurface=null;activeView=true;visible=true;visibleInput.checked=true;ghostConflicts(currentConflicts(null));syncVisibility();renderInspector();if(writeUrl)setLink('all');if(navigate)cameraRequest(null);}
  function deactivate(){activeView=false;visible=false;visibleInput.checked=false;restoreGhosts();tooltip.hidden=true;syncVisibility();}
  function setVisible(value){visible=Boolean(value);visibleInput.checked=visible;if(!visible)restoreGhosts();else if(activeView)ghostConflicts(activeHall?currentConflicts(halls.get(activeHall).data):currentConflicts(null));syncVisibility();}
  listen(overview,'click',()=>showOverview());
  function hit(event){if(!visible)return null;const r=canvas.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2);raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects(hitObjects,false).find(x=>x.object.visible)?.object||null;}
  listen(canvas,'pointerdown',event=>{pointerDown={x:event.clientX,y:event.clientY};});
  listen(canvas,'pointerup',event=>{if(!pointerDown||Math.hypot(event.clientX-pointerDown.x,event.clientY-pointerDown.y)>5){pointerDown=null;return;}pointerDown=null;const object=hit(event);if(object?.userData.rgoSurface)selectSurface(object.userData.rgoSurface);else if(object?.userData.rgoHall)selectHall(object.userData.rgoHall);});
  listen(canvas,'pointermove',event=>{
    if(event.buttons||event.pointerType==='touch'){tooltip.hidden=true;return;}const object=hit(event),id=object?.userData.rgoSurface||object?.userData.rgoHall;
    if(!id){tooltip.hidden=true;lastHover=null;return;}if(id===lastHover)return;lastHover=id;
    const s=surfaces.get(id)?.data,h=halls.get(id)?.data;tooltip.textContent=s?`${s.id} · ${s.label} · ${nf(s.widthM,3)} × ${nf(s.heightM,3)} м. Нажмите для размеров.`:`${h.sourceNumber} · ${h.title}. ${object.userData.rgoSpecial?'Специальная система: оборудование уточняется.':'Нажмите для перехода.'}`;tooltip.hidden=false;
  });
  listen(canvas,'pointerleave',()=>{tooltip.hidden=true;lastHover=null;});listen(document,'keydown',event=>{if(event.key==='Escape')tooltip.hidden=true;});
  root.updateMatrixWorld(true);syncVisibility();renderInspector();
  return {data,group:root,selectHall,selectSurface,showOverview,deactivate,setVisible,
    getCollisionObstacles(){return data.surfaces.map(s=>({id:s.id,kind:'rgo-screen-proposal',shape:'obb',centerXZ:[s.position[0],s.position[2]],halfSizeXZ:[s.widthM/2,.084/2],rotationY:s.rotationY,minY:s.position[1]+s.bottomHeightM,maxY:s.position[1]+s.bottomHeightM+s.heightM}));},
    getState(){return{ready:true,activeView,visible,activeHall,selectedSurface,surfaceCount:surfaces.size,hallCount:halls.size,ghostedMeshes:ghosts.size,programAreaM2:1120,coordinateStatus:data.placement.registration.status,conflictIds:activeHall?currentConflicts(halls.get(activeHall).data):currentConflicts(null),layoutChanged};},
    refresh(){layoutChanged=obstacleSignature()!==initialObstacleSignature;if(activeView)ghostConflicts(activeHall?currentConflicts(halls.get(activeHall).data):currentConflicts(null));renderInspector();requestRender();},
    dispose(){if(destroyed)return;destroyed=true;abort.abort();restoreGhosts();root.removeFromParent();disposables.forEach(x=>x.dispose());tooltip.remove();content.replaceChildren();},
  };
}
