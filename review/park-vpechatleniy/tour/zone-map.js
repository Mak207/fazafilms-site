import * as THREE from 'three';

/** Primary drawing contours; the source records keep their own level and precision. */
export async function createZoneMap({scene,onFocus,getNavigation=()=>null,requestRender=()=>{}}){
  const [response,colorResponse]=await Promise.all([fetch('assets/zones/source-zones.json',{cache:'no-store'}),fetch('assets/zones/floor-colors.json?v=park-floor-colors-20261125',{cache:'no-store'})]);
  if(!response.ok||!colorResponse.ok)throw new Error('Не загружена карта зон.');
  const [data,colorData]=await Promise.all([response.json(),colorResponse.json()]);
  if(colorData.rgo?.halls?.length!==9)throw new Error('Не загружены цвета девяти залов РГО.');
  const group=new THREE.Group();group.name='Зоны по исходным схемам';scene.add(group);
  const abort=new AbortController(),colorPolygons=new Map(colorData.zones.map(z=>[z.id,z.polygons])),hallEntries=new Map();
  const entries=new Map(),regions=new Map(),buttons=document.getElementById('zone-map-buttons');buttons.replaceChildren();
  const checkbox=document.getElementById('zone-boundaries'),levelSelect=document.getElementById('zone-map-level');
  let selected=null,visible=true,level='both',floorColors=new URL(location.href).searchParams.get('floorColors')==='1';
  function label(title,color,compact=false){
    const canvas=document.createElement('canvas');canvas.width=compact?256:768;canvas.height=compact?128:160;const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
    c.fillStyle='#10251fec';c.beginPath();c.roundRect(3,3,w-6,h-6,24);c.fill();c.strokeStyle=color;c.lineWidth=6;c.stroke();
    c.fillStyle='#fff8e8';c.font=`600 ${compact?76:43}px Arial,sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(title,w/2,h/2,w-24);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));sprite.scale.set(...(compact?[1.8,.9,1]:[10.2,2.125,1]));sprite.renderOrder=7;return sprite;
  }
  function floorSurface(rings,color,y){
    const shape=new THREE.Shape(rings[0].map(([x,z])=>new THREE.Vector2(x,-z)));
    for(const ring of rings.slice(1))shape.holes.push(new THREE.Path(ring.map(([x,z])=>new THREE.Vector2(x,-z))));
    const plane=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.44,depthTest:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
    plane.rotation.x=-Math.PI/2;plane.position.y=y;plane.renderOrder=3;plane.userData.visualOnly=true;return plane;
  }
  const ordered=data.zones.slice().sort((a,b)=>(a.regionId==='rgo'?-2:a.regionId==='rgo-museum'?-1:a.sourceNumber||20)-(b.regionId==='rgo'?-2:b.regionId==='rgo-museum'?-1:b.sourceNumber||20));
  for(const [index,zone] of ordered.entries()){
    if(!Array.isArray(zone.polygons)||!zone.polygons.length)continue;
    const root=new THREE.Group();root.name=zone.title;root.userData.zoneId=zone.id;group.add(root);
    const color=zone.color||'#ceaa63',bounds=new THREE.Box3(),surfaces=[],outlines=[];
    for(const rings of colorPolygons.get(zone.id)||zone.polygons.map(p=>[p])){const plane=floorSurface(rings,color,zone.floorY+.085+index*.0004);root.add(plane);surfaces.push(plane);}
    for(const polygon of zone.polygons){
      if(polygon.length<3)continue;
      const points=polygon.map(([x,z])=>new THREE.Vector3(x,zone.floorY+.1,z));points.forEach(p=>bounds.expandByPoint(p));
      const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,transparent:true,opacity:.95,depthWrite:false}));line.renderOrder=4;root.add(line);outlines.push(line);
    }
    if(bounds.isEmpty()){root.removeFromParent();continue;}
    const center=bounds.getCenter(new THREE.Vector3()),where=zone.labelXZ||[center.x,center.z];
    const sign=label(zone.abbreviation||zone.title,color);sign.position.set(where[0],zone.floorY+1.65,where[1]);root.add(sign);
    const entry={...zone,root,bounds,surfaces,outlines,sign};entries.set(zone.id,entry);
    const regionId=zone.regionId||zone.id;
    if(!regions.has(regionId))regions.set(regionId,{id:regionId,title:zone.title,color,entries:[],button:null});
    regions.get(regionId).entries.push(entry);
  }
  const hallLegend=document.getElementById('rgo-floor-legend');hallLegend?.replaceChildren();
  for(const hall of colorData.rgo.halls){
    const root=new THREE.Group();root.name='Цвет зала РГО '+hall.id;root.userData.visualOnly=true;group.add(root);
    const surfaces=hall.polygonsWorldXZ.map(p=>floorSurface([p],hall.color,colorData.rgo.floorY+.105));surfaces.forEach(p=>root.add(p));
    const where=hall.sourceLabelWorldXZ,sign=label(hall.id,hall.color,true);sign.position.set(where[0],colorData.rgo.floorY+.55,where[1]);root.add(sign);
    hallEntries.set(hall.id,{...hall,root,surfaces,sign});
    if(hallLegend){const row=document.createElement('span');row.className='floor-hall-legend-item';row.style.setProperty('--hall-color',hall.color);row.textContent=hall.id+' · '+hall.name;hallLegend.append(row);}
  }
  if(data.workingDetailedRgo){
    const detail=data.workingDetailedRgo;
    for(const polygon of detail.polygons){
      const points=polygon.map(([x,z])=>new THREE.Vector3(x,detail.floorY+.14,z));points.push(points[0].clone());
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color:0xf5e7bd,dashSize:.5,gapSize:.3,transparent:true,opacity:.85,depthWrite:false}));
      line.name='Аллея РГО · отдельная версия018';line.computeLineDistances();line.renderOrder=5;line.userData.detailedRgo=true;group.add(line);
    }
  }
  for(const region of regions.values()){
    const button=document.createElement('button');button.type='button';button.className='zone-map-button';button.dataset.mapZone=region.id;
    button.style.setProperty('--zone-color',region.color);button.textContent=region.title;button.setAttribute('aria-pressed','false');
    button.onclick=()=>focus(region.id);buttons.append(button);region.button=button;
  }
  const displayed=entry=>level==='both'||entry.floorId===level;
  function refresh(){
    group.visible=visible||floorColors;checkbox.checked=visible;levelSelect.value=level;
    for(const child of group.children)if(child.userData.detailedRgo)child.visible=visible&&level!=='upper';
    for(const region of regions.values()){
      const active=region.id===selected;region.button.setAttribute('aria-pressed',String(active));
      region.button.disabled=!region.entries.some(displayed);
      for(const entry of region.entries){entry.root.visible=displayed(entry);entry.sign.visible=visible;entry.outlines.forEach(line=>{line.visible=visible;});for(const surface of entry.surfaces){surface.visible=floorColors;surface.material.opacity=selected?(active?.58:.28):.44;}}
    }
    const navigation=getNavigation(),activeHall=navigation?.selectedRegion==='rgo'?navigation.activeHall:null;
    for(const hall of hallEntries.values()){hall.root.visible=floorColors&&level!=='upper';hall.sign.material.opacity=(activeHall&&activeHall!==hall.id)? .65 : 1;for(const surface of hall.surfaces)surface.material.opacity=activeHall?(activeHall===hall.id? .66 : .36):.52;}
    document.documentElement.dataset.floorColors=String(floorColors);
    for(const button of document.querySelectorAll('[data-floor-colors-toggle]')){button.disabled=false;button.setAttribute('aria-pressed',String(floorColors));button.title=floorColors?'Скрыть цветовую разметку пола':'Раскрасить зоны на полу разными цветами';}
    for(const input of document.querySelectorAll('#rgo-hall-select,#exhibition-hall-select')){const hall=hallEntries.get(activeHall||input.value);input.classList.toggle('has-floor-color',floorColors&&Boolean(hall));if(hall)input.style.setProperty('--hall-color',hall.color);}
    const legend=document.getElementById('floor-color-details');if(legend)legend.hidden=!floorColors;
    requestRender();
  }
  function setFloorColors(value,{writeUrl=true}={}){floorColors=Boolean(value);if(writeUrl){const url=new URL(location.href);if(floorColors)url.searchParams.set('floorColors','1');else url.searchParams.delete('floorColors');history.replaceState(null,'',url);}refresh();}
  function setVisible(value){visible=Boolean(value);refresh();}
  function setLevel(value){level=['main','upper','both'].includes(value)?value:'both';refresh();if(selected)focus(selected);}
  function focus(id){
    const exact=entries.get(id),region=regions.get(exact?.regionId||id);if(!region)return false;
    if(exact)level=exact.floorId;
    const shown=region.entries.filter(displayed);if(!shown.length)return false;
    selected=region.id;visible=true;refresh();
    const bounds=new THREE.Box3();shown.forEach(entry=>bounds.union(entry.bounds));
    const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),span=Math.max(size.x,size.z,16);
    onFocus(new THREE.Vector3(center.x+span*.45,Math.max(...shown.map(z=>z.floorY))+span*.9,center.z+span*.62),center,region.title,region.id);
    const floors=shown.length>1?'Основной уровень и антресоль':shown[0].floorId==='upper'?'Антресоль':'Основной уровень';
    document.getElementById('zone-map-current').textContent=region.title+' · '+floors;
    requestRender();return true;
  }
  checkbox.addEventListener('change',()=>setVisible(checkbox.checked),{signal:abort.signal});levelSelect.addEventListener('change',()=>setLevel(levelSelect.value),{signal:abort.signal});
  const colorButton=document.querySelector('#zone-map-panel [data-floor-colors-toggle]');
  colorButton?.addEventListener('click',()=>setFloorColors(!floorColors),{signal:abort.signal});
  document.addEventListener('park-floor-colors-toggle',()=>setFloorColors(!floorColors),{signal:abort.signal});
  document.addEventListener('park-navigation-change',()=>{if(getNavigation()?.selectedRegion==='rgo'&&level==='upper')level='main';refresh();},{signal:abort.signal});
  document.getElementById('zones-toggle').disabled=false;
  document.getElementById('zones-toggle').addEventListener('click',()=>{if(!document.getElementById('zone-map-panel').hidden)setVisible(true);},{signal:abort.signal});
  refresh();
  return {group,data,focus,setVisible,setLevel,setFloorColors,getState:()=>({ready:true,visible,floorColors,selected,level,regionCount:regions.size,coloredHallCount:hallEntries.size,
    zones:[...entries.values()].map(z=>({id:z.id,regionId:z.regionId,title:z.title,floorY:z.floorY,polygonCount:z.polygons.length,source:z.source,status:z.status,rasterBoundaryToleranceMetres:z.rasterBoundaryToleranceMetres}))}),
    dispose(){abort.abort();buttons.replaceChildren();hallLegend?.replaceChildren();group.removeFromParent();group.traverse(node=>{node.geometry?.dispose();for(const m of Array.isArray(node.material)?node.material:[node.material]){m?.map?.dispose();m?.dispose();}});}};
}
