import * as THREE from 'three';

export async function createZoneMap({scene,onFocus,requestRender=()=>{}}){
  const response=await fetch('assets/zones/source-zones.json',{cache:'no-store'});if(!response.ok)throw new Error('Не загружена карта зон.');
  const data=await response.json(),group=new THREE.Group();group.name='Зоны по исходной схеме';scene.add(group);
  const entries=new Map(),buttons=document.getElementById('zone-map-buttons'),checkbox=document.getElementById('zone-boundaries');
  let selected=null,visible=true;
  function label(title,color){
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=160;const c=canvas.getContext('2d');
    c.fillStyle='#10251fec';c.beginPath();c.roundRect(3,3,762,154,24);c.fill();c.strokeStyle=color;c.lineWidth=6;c.stroke();
    c.fillStyle='#fff8e8';c.font='600 43px Arial,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(title,384,80,705);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));sprite.scale.set(10.2,2.125,1);sprite.renderOrder=7;return sprite;
  }
  for(const [index,zone] of data.zones.entries()){
    const root=new THREE.Group();root.name=zone.title;root.userData.zoneId=zone.id;group.add(root);
    const color=zone.color||'#ceaa63',bounds=new THREE.Box3();
    for(const polygon of zone.polygons){
      const shape=new THREE.Shape(polygon.map(([x,z])=>new THREE.Vector2(x,-z)));
      const plane=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.15,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1}));
      plane.rotation.x=-Math.PI/2;plane.position.y=zone.floorY+.085+index*.0004;plane.renderOrder=3;root.add(plane);
      const points=polygon.map(([x,z])=>new THREE.Vector3(x,zone.floorY+.1,z));points.forEach(p=>bounds.expandByPoint(p));
      const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,transparent:true,opacity:.95,depthWrite:false}));line.renderOrder=4;root.add(line);
    }
    const center=bounds.getCenter(new THREE.Vector3()),where=zone.labelXZ||[center.x,center.z];
    const sign=label(zone.title,color);sign.position.set(where[0],zone.floorY+1.7,where[1]);root.add(sign);
    const button=document.createElement('button');button.type='button';button.className='zone-map-button';button.dataset.mapZone=zone.id;button.style.setProperty('--zone-color',color);button.textContent=zone.title;button.onclick=()=>focus(zone.id);buttons.append(button);
    entries.set(zone.id,{...zone,root,bounds,button});
  }
  function setVisible(value){visible=Boolean(value);group.visible=visible;checkbox.checked=visible;requestRender();}
  function focus(id){
    const zone=entries.get(id);if(!zone)return false;selected=id;setVisible(true);
    for(const entry of entries.values()){entry.button.setAttribute('aria-pressed',String(entry.id===id));entry.root.traverse(node=>{if(node.isMesh)node.material.opacity=entry.id===id?.29:.09;});}
    const size=zone.bounds.getSize(new THREE.Vector3()),center=zone.bounds.getCenter(new THREE.Vector3()),span=Math.max(size.x,size.z,16);
    onFocus(new THREE.Vector3(center.x+span*.45,zone.floorY+span*.9,center.z+span*.62),center,zone.title);
    document.getElementById('zone-map-current').textContent=zone.title;requestRender();return true;
  }
  checkbox.onchange=()=>setVisible(checkbox.checked);
  document.getElementById('zones-toggle').disabled=false;
  document.getElementById('zones-toggle').addEventListener('click',()=>{if(!document.getElementById('zone-map-panel').hidden)setVisible(true);});
  return {group,data,focus,setVisible,getState:()=>({ready:true,visible,selected,zones:[...entries.values()].map(z=>({id:z.id,title:z.title,floorY:z.floorY,polygonCount:z.polygons.length,source:z.source,status:z.status}))})};
}
