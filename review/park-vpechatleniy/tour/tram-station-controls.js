/** Four source-platform cards. Camera ownership stays with the existing viewer. */
export function createTramStationControls({container,getSystem,getPassengerVehicle=()=>-1,onFocus,onBoard,onDisembark}={}){
  if(!container||typeof getSystem!=='function')throw new TypeError('Монорельс: нужен контейнер и getSystem.');
  const root=document.createElement('section');root.className='tram-stations';root.setAttribute('aria-label','Площадки монорельса');
  const style=document.createElement('style');style.textContent=`
    .tram-stations{display:grid;gap:10px;color:inherit;font:inherit}.tram-stations header{display:flex;justify-content:space-between;gap:8px;align-items:center}.tram-stations h3{font-size:14px;line-height:1.3;font-weight:600;margin:0}.tram-stations .ts-summary{font-size:11px;opacity:.78}.tram-stations .ts-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.tram-stations .ts-card{border:1px solid #bfd0d830;border-radius:9px;padding:9px;background:#16293650;display:grid;gap:7px;min-width:0}.tram-stations .ts-card[data-active="true"]{border-color:#6cc5d3;background:#23636a38}.tram-stations .ts-card[data-available="false"]{opacity:.76}.tram-stations button{font:inherit;color:inherit;border:1px solid #9bb5c14d;border-radius:7px;padding:8px 9px;min-height:38px;background:#172e3c;cursor:pointer}.tram-stations button:hover:enabled{border-color:#8bced9}.tram-stations button:focus-visible{outline:2px solid #89dfeb;outline-offset:2px}.tram-stations button:disabled{opacity:.45;cursor:default}.tram-stations .ts-focus{text-align:left;font-size:12px;line-height:1.35}.tram-stations .ts-status{font-size:11px;line-height:1.4;min-height:2.7em;margin:0}.tram-stations .ts-board{font-size:12px;background:#215967}.tram-stations .ts-exit{width:100%;background:#344555}.tram-stations .ts-detail{font-size:11px;line-height:1.5;opacity:.8;margin:0}
  `;root.append(style);
  const header=document.createElement('header'),title=document.createElement('h3'),summary=document.createElement('span');title.textContent='Площадки монорельса';summary.className='ts-summary';summary.textContent='3 остановки · кольцо';header.append(title,summary);root.append(header);
  const grid=document.createElement('div');grid.className='ts-grid';root.append(grid);
  const exit=document.createElement('button');exit.type='button';exit.className='ts-exit';exit.textContent='Выйти на ближайшей станции';exit.disabled=true;root.append(exit);
  const detail=document.createElement('p');detail.className='ts-detail';detail.textContent='Выберите площадку для обзора. Посадка открывается после остановки вагона.';root.append(detail);container.append(root);
  let cards=[],built=false,performingExit=false;
  function focusStation(id){const system=getSystem(),pose=system?.getStationPose(id);if(pose){detail.textContent=pose.station.available?'Площадка '+pose.station.number+' · посадка и высадка.':'Площадка 4: свободного прохода к вагону пока нет. Посадка здесь закрыта.';onFocus?.(pose);return true;}return false;}
  function build(system){
    if(!system||built)return;built=true;
    for(const candidate of system.getStationCandidates()){
      const card=document.createElement('article');card.className='ts-card';card.dataset.stationId=candidate.id;card.dataset.available=String(candidate.available);card.dataset.active='false';
      const focus=document.createElement('button');focus.type='button';focus.className='ts-focus';focus.textContent=candidate.number+'. '+candidate.label;focus.onclick=()=>focusStation(candidate.id);
      const status=document.createElement('p');status.className='ts-status';status.setAttribute('role','status');
      const board=document.createElement('button');board.type='button';board.className='ts-board';board.textContent='Сесть в вагон';board.disabled=true;
      board.onclick=()=>{const state=getSystem()?.getState();if(state?.activeStationId===candidate.id&&state.canBoard&&state.boardingVehicle!==null)onBoard?.(state.boardingVehicle,candidate.id);};
      card.append(focus,status,board);grid.append(card);cards.push({candidate,card,status,board});
    }
  }
  exit.onclick=()=>{const system=getSystem(),index=getPassengerVehicle();if(system&&Number.isInteger(index)&&index>=0){system.requestDisembark(index);update(system.getState());}};
  function update(state){
    const system=getSystem();if(!system)return;build(system);state=state||system.getState();
    const passenger=getPassengerVehicle();
    for(const item of cards){
      const selected=state.activeStationId===item.candidate.id,st=state.stations.find(s=>s.id===item.candidate.id);item.card.dataset.active=String(selected);
      if(!item.candidate.available)item.status.textContent='Нет прохода к вагону. Остановка закрыта.';
      else if(selected){const phase={opening:'Открываем переход',alighting:'Высадка',boarding:'Посадка',closing:'Закрываем переход'}[state.dwellPhase]||'Остановка';item.status.textContent='Вагон '+(state.boardingVehicle+1)+' · '+phase.toLowerCase()+' · '+Math.ceil(state.dwellRemaining)+' с';}
      else item.status.textContent='Ожидаем вагон';
      item.board.hidden=!item.candidate.available;item.board.disabled=!(selected&&state.canBoard&&passenger<0&&st?.boardingOpen);
    }
    const requested=state.disembarkRequest;
    exit.disabled=passenger<0||Boolean(requested);exit.textContent=requested?'Высадка запрошена · ждём остановку':'Выйти на ближайшей станции';
    if(requested?.status==='ready'&&!performingExit&&passenger===requested.vehicleIndex){
      performingExit=true;const pose=system.completeDisembark();if(pose){detail.textContent='Высадка на площадку '+pose.stationNumber;onDisembark?.(pose);}performingExit=false;
    }
  }
  build(getSystem());
  return {root,update,focusStation,getMenuItems:()=>getSystem()?.getStationCandidates().map(s=>({value:'station:'+s.id,label:'Площадка '+s.number+' · '+s.label,available:s.available}))||[],dispose(){root.remove();cards=[];}};
}
