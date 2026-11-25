/** One navigation panel for the physical exhibition. It never creates a duplicate LED layer. */
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const option=(value,text)=>{const n=el('option','',text);n.value=value;return n;};
export async function createRgoZones({THREE,scene,panel,controller,getExhibitionController=()=>controller,onOverview,requestRender=()=>{}}){
  const system=getExhibitionController();if(!system?.getNavigation)throw new Error('Не готова единая навигация экспозиции.');
  const abort=new AbortController(),content=panel.querySelector('.rgo-content');content.replaceChildren();
  const group=new THREE.Group();group.name='Единая навигация · без дублирующих экранов';scene.add(group);
  let activeView=false,visible=false,selectedRegion='rgo',activeHall='00',selectedObject='',selectedSurface='';
  const floorButton=el('button','floor-colors-button','Цвета зон на полу');floorButton.type='button';floorButton.dataset.floorColorsToggle='';floorButton.setAttribute('aria-pressed',document.documentElement.dataset.floorColors||'false');floorButton.title='Включить или скрыть цветовую разметку пола';content.append(floorButton);
  floorButton.addEventListener('click',()=>document.dispatchEvent(new CustomEvent('park-floor-colors-toggle')),{signal:abort.signal});
  function field(id,title){const label=el('label','exhibition-select-label'),span=el('span','',title),select=el('select');select.id=id;select.setAttribute('aria-label',title);label.append(span,select);content.append(label);return {label,select};}
  const region=field('exhibition-region-select','Зона'),hall=field('exhibition-hall-select','Зал РГО'),object=field('exhibition-object-select','Экспонат в зоне'),media=field('exhibition-media-select','Экран или интерактив');
  const info=el('p','rgo-selection-info');info.setAttribute('aria-live','polite');content.append(info);
  const actions=el('div','exhibition-panel-actions');
  const play=el('button','','Пуск / пауза'),next=el('button','','Следующая сцена'),edit=el('button','','Изменить мышью');for(const b of[play,next,edit]){b.type='button';actions.append(b);}content.append(actions);
  const details=el('details','panel-details');details.append(el('summary','','Состав и исходный план'));
  const summary=el('p','panel-note');details.append(summary);
  const source=el('a','rgo-source','План Аллеи РГО');source.href=new URL('./rgo-source-plan.jpg',import.meta.url).href;source.target='_blank';source.rel='noopener';details.append(source);
  details.append(el('p','panel-note','Размеры и число LED-кабинетов сохранены по программе. Положение оборудования согласовано с текущими стенами галереи и геометрией здания. На экранах воспроизводятся тематические анимации.'));content.append(details);
  function refresh(){
    const nav=system.getNavigation();selectedRegion=nav.selectedRegion||selectedRegion;activeHall=nav.activeHall||activeHall;selectedObject=nav.selectedObject||'';selectedSurface=nav.selectedMedia||'';
    region.select.replaceChildren();for(const item of nav.regions)region.select.append(option(item.id,item.name));region.select.value=selectedRegion;
    hall.label.hidden=selectedRegion!=='rgo';hall.select.replaceChildren();for(const h of nav.halls)hall.select.append(option(h.id,h.id+' · '+h.name));hall.select.value=activeHall;
    const section=selectedRegion==='rgo'?nav.halls.find(h=>h.id===activeHall):nav.regions.find(r=>r.id===selectedRegion);
    object.select.replaceChildren(option('','Вся зона / зал'));for(const item of section?.objects||[])object.select.append(option(item.id,item.name));object.select.value=selectedObject;object.label.hidden=!section?.objects.length;
    let equipment=section?.equipment||[];if(selectedObject&&selectedRegion!=='rgo'){const linked=equipment.filter(e=>(e.anchorIds||[e.anchorId]).includes(selectedObject));if(linked.length)equipment=linked;}
    media.select.replaceChildren(option('','Выберите экран или интерактив'));for(const item of equipment)media.select.append(option(item.id,item.name));media.select.value=selectedSurface;media.label.hidden=!equipment.length;
    const selected=system.media.records.get(selectedSurface);
    info.textContent=selected?selected.width.toFixed(2)+' × '+selected.height.toFixed(2)+' м'+(selected.cabinetCount?' · '+selected.cabinetColumns+' × '+selected.cabinetRows+' кабинетов':'')+' · '+(selected.media.getState().playing?'контент воспроизводится':'пауза'):'Экспонаты: '+(section?.objects.length||0)+' · Экраны и интерактивы: '+equipment.length;
    play.hidden=next.hidden=!selected;edit.hidden=!(selected||selectedObject);
    const rgoItems=system.equipment.getItems({regionId:'rgo'});summary.textContent=rgoItems.filter(e=>e.cabinetCount).length+' LED-полотен РГО · '+rgoItems.reduce((n,e)=>n+e.cabinetCount,0)+' кабинетов · 9 залов. Общая экспозиция: '+system.equipment.records.size+' самостоятельных медиаустановок.';
  }
  function selectHall(id,{navigate=true}={}){const number=String(id).replace(/^RGO-/,'');if(!/^0[0-8]$/.test(number))return false;selectedRegion='rgo';activeHall=number;if(navigate)system.focus('rgo-'+number);else system.rgo.setHall(number);activeView=true;visible=true;refresh();return true;}
  function selectSurface(id){if(!system.focusEquipment(id))return false;activeView=true;visible=true;refresh();return true;}
  function showOverview({navigate=true}={}){selectedRegion='rgo';if(navigate)system.focus('rgo',{inside:false});activeView=true;visible=true;refresh();return true;}
  function deactivate(){activeView=false;visible=false;}
  function setVisible(value){visible=Boolean(value);if(visible)refresh();}
  region.select.addEventListener('change',()=>{system.focusRegion(region.select.value);activeView=true;refresh();},{signal:abort.signal});
  hall.select.addEventListener('change',()=>selectHall(hall.select.value),{signal:abort.signal});
  object.select.addEventListener('change',()=>{system.focusObject(object.select.value);activeView=true;refresh();},{signal:abort.signal});
  media.select.addEventListener('change',()=>{if(media.select.value)selectSurface(media.select.value);},{signal:abort.signal});
  play.onclick=()=>{system.media.interact(selectedSurface,'toggle');refresh();};next.onclick=()=>{system.media.interact(selectedSurface,'next');refresh();};
  edit.onclick=()=>{const record=system.media.records.get(selectedSurface),item=system.getNavigation().regions.flatMap(r=>r.objects).find(i=>i.id===selectedObject),instanceId=record?.instanceId||item?.instanceId||selectedObject;if(instanceId)document.dispatchEvent(new CustomEvent('park-edit-instance',{detail:{instanceId}}));};
  document.addEventListener('park-navigation-change',refresh,{signal:abort.signal});
  const title=document.getElementById('rgo-title');if(title)title.textContent='Зоны и экспонаты';const toggle=document.querySelector('#rgo-toggle span');if(toggle)toggle.textContent='Навигация';
  refresh();return {group,selectHall,selectSurface,showOverview,deactivate,setVisible,refresh,
    getCollisionObstacles:()=>[],
    getState:()=>({ready:true,activeView,visible,activeHall:'RGO-'+activeHall,selectedSurface,selectedRegion,surfaceCount:system.equipment.getItems({regionId:'rgo'}).filter(e=>e.cabinetCount).length,hallCount:9,ghostedMeshes:0,duplicateLayer:false,allEquipmentCount:system.equipment.records.size,coordinateStatus:'placed-against-current-gallery-and-CAD',conflictIds:[],layoutChanged:false}),
    dispose(){abort.abort();group.removeFromParent();content.replaceChildren();},
  };
}
