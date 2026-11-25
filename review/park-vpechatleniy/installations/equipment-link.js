import {normalizeState,getInstances} from './equipment-model.js?v=equipment-3d-20261125';
import {layoutEquipment,checkEquipmentPosition,loadEquipmentGeometry} from './equipment-map.js?v=equipment-3d-20261125';
import {equipmentVariant,readEquipmentVariant,createEquipmentChannel,consumeEquipmentShare} from './equipment-state.js?v=equipment-3d-20261125';

/** The 3D view consumes exactly the same layout solver and saved variant as the plan. */
export function createEquipmentSceneLink({data,geometry,storage,windowObject=globalThis.window,locationObject=windowObject?.location,
  onSnapshot=()=>({ok:true}),onPreview=()=>{},onPreviewEnd=()=>{},onFocus=()=>{},onError=()=>{}}) {
  let safeStorage=storage; if(safeStorage===undefined){try{safeStorage=windowObject?.localStorage;}catch{safeStorage=null;}}
  const restored=readEquipmentVariant(data,{storage:safeStorage,locationObject});
  let variant=restored.variant,state=normalizeState(data,variant.state),report=null,disposed=false,channel=null;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const snapshot=()=>({data,state:clone(state),report});
  function calculate(next){
    const checked=normalizeState(data,next),layout=layoutEquipment(getInstances(data,checked),geometry,{data,positions:checked.positions,previousPositions:report?.positions||{}});
    const positions={...checked.positions};
    for(const item of layout.placed)if(!item.seedPosition||checked.positions[item.id])positions[item.id]={...item.position};
    return {state:normalizeState(data,{...checked,positions}),report:layout};
  }
  function apply(nextVariant,{publish=false}={}){
    if(disposed)return {ok:false,error:'Расстановка закрыта.'};
    const previous={variant,state,report},next=calculate(nextVariant.state);
    const result=onSnapshot({data,...next})||{ok:true};
    if(result.ok===false){
      const message=result.error||result.errors?.map(e=>e.error||e.message||e).join('; ')||'Положение оборудования не удалось применить в 3D.';
      onError(message);channel?.notify(message);
      if(previous.report)channel?.publish(equipmentVariant(data,previous.state,previous.variant),{force:true});
      return {ok:false,error:message};
    }
    state=next.state;report=next.report;variant=equipmentVariant(data,state,nextVariant);
    if(publish)channel?.publish(variant);
    return {ok:true,placed:report.placedCount,unplaced:report.unplacedCount};
  }
  function validateMove(id,position){
    const item=report?.placed.find(item=>item.id===id);
    if(!item)return {ok:false,error:'Оборудование не найдено на плане.'};
    if(position?.floorId && position.floorId!==item.floorId)return {ok:false,error:'Оборудование должно оставаться на своём уровне.'};
    if(![position?.x,position?.z,position?.yaw].every(Number.isFinite))return {ok:false,error:'Не удалось определить положение оборудования.'};
    const checked=checkEquipmentPosition(item,position,geometry,report.placed,data);
    return checked.valid?{ok:true}:{ok:false,error:checked.reason};
  }
  channel=createEquipmentChannel({data,variant,storage:safeStorage,windowObject,
    onVariant(next){apply(next);},
    onPreview(id,position){if(validateMove(id,position).ok)onPreview(id,position);},
    onPreviewEnd,
    onFocus,
    onStorageError(){onError('Браузер не сохранил расстановку. Сохраните вариант ссылкой из расчёта инсталляций.');}
  });
  const initial=apply(variant);
  const validShared=restored.shared&&restored.restored;
  // An opening iframe is a reader. It must request the current parent variant
  // before becoming an author, even when browser storage is unavailable.
  if(initial.ok && validShared)channel.publish(variant,{force:true});
  if(initial.ok&&validShared)consumeEquipmentShare(windowObject,locationObject);
  channel.request();
  if(locationObject?.href){const id=new URL(locationObject.href).searchParams.get('equipmentFocus');if(id)onFocus({id});}
  return {
    getSnapshot:snapshot,getVariant:()=>clone(variant),validateMove,
    move(id,position){
      const valid=validateMove(id,position);if(!valid.ok)return valid;
      return apply(equipmentVariant(data,{...state,positions:{...state.positions,[id]:position}},variant),{publish:true});
    },
    cancelPreview(id){onPreviewEnd(id,{committed:false});},
    dispose(){if(disposed)return;disposed=true;channel.dispose();onPreviewEnd(null,{committed:false});}
  };
}

export async function loadEquipmentSceneLink(options={}){
  const response=await fetch(new URL('./equipment-data.json?v=equipment-3d-20261125',import.meta.url));
  if(!response.ok)throw Error('Не удалось загрузить оборудование для 3D.');
  const [data,geometry]=await Promise.all([response.json(),loadEquipmentGeometry()]);
  return createEquipmentSceneLink({...options,data,geometry});
}
