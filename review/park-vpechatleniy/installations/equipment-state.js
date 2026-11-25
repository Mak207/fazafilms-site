import {createDefaultState, normalizeState, getInstances} from './equipment-model.js?v=equipment-3d-20261125';

export const EQUIPMENT_SCHEMA = 'faza.park.equipment-plan.v1';
export const EQUIPMENT_STORAGE_KEY = EQUIPMENT_SCHEMA;
const CHANNEL = 'faza.park.equipment-plan.live.v1';
const MESSAGE = 'faza.park.equipment-message.v1';
const clone = value => JSON.parse(JSON.stringify(value));
const finite = value => typeof value === 'number' && Number.isFinite(value);

export function encodeEquipmentVariant(value) {
  return btoa(Array.from(new TextEncoder().encode(JSON.stringify(value)), c=>String.fromCharCode(c)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function decodeEquipmentVariant(value) {
  if(!value || value.length>150000) throw Error('Слишком длинная ссылка.');
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));
}
export function equipmentVariant(data,state,ui={}) {
  const next=normalizeState(data,state),baseline=createDefaultState(data);
  return {schema:EQUIPMENT_SCHEMA,state:{quantities:Object.fromEntries(data.groups.filter(g=>next.quantities[g.id]!==baseline.quantities[g.id]).map(g=>[g.id,next.quantities[g.id]])),positions:next.positions},
    scope:{regionId:ui.scope?.regionId||null,hallId:ui.scope?.hallId||null,floorId:null},mapFloor:ui.mapFloor==='upper'?'upper':'main',exhibitId:ui.exhibitId||''};
}
function normalizedVariant(data,raw) {
  if(raw?.schema!==EQUIPMENT_SCHEMA || !raw.state || typeof raw.state!=='object') return null;
  const variant=equipmentVariant(data,raw.state,raw);
  if(!data.regions.some(r=>r.id===variant.scope.regionId)) variant.scope.regionId=null;
  if(!data.halls.some(h=>h.id===variant.scope.hallId && h.regionId===variant.scope.regionId)) variant.scope.hallId=null;
  if(!data.groups.some(g=>g.exhibitId===variant.exhibitId)) variant.exhibitId='';
  if(finite(raw._sync?.revision) && typeof raw._sync?.sender==='string') variant._sync={revision:raw._sync.revision,sender:raw._sync.sender.slice(0,100)};
  return variant;
}
export function readEquipmentVariant(data,{storage,locationObject,initialState}={}) {
  let shared=false,error=false,raw=null;
  try {
    const query=locationObject?.href && new URL(locationObject.href).searchParams.get('equipmentPlan');
    if(query){shared=true;raw=decodeEquipmentVariant(query);}
    else if(!initialState){const saved=storage?.getItem(EQUIPMENT_STORAGE_KEY);if(saved)raw=JSON.parse(saved);}
  } catch {error=true;}
  const restored=normalizedVariant(data,raw);
  return {variant:restored||equipmentVariant(data,initialState||createDefaultState(data),{scope:{regionId:'rgo'}}),shared,error:error||Boolean(raw&&!restored),restored:Boolean(restored)};
}
/** A share link is an import. Reload and quality switches must retain later edits. */
export function consumeEquipmentShare(windowObject,locationObject=windowObject?.location){
  try{
    const url=new URL(locationObject.href);if(!url.searchParams.has('equipmentPlan'))return false;
    url.searchParams.delete('equipmentPlan');windowObject.history.replaceState(windowObject.history.state,'',url.href);return true;
  }catch{return false;}
}
function compare(a,b) {
  const difference=(a?._sync?.revision||0)-(b?._sync?.revision||0);
  return difference || String(a?._sync?.sender||'').localeCompare(String(b?._sync?.sender||''));
}

/** Same-origin live transport. Only committed variants are written to storage. */
export function createEquipmentChannel({data,variant,storage,windowObject=globalThis.window,onVariant=()=>{},onPreview=()=>{},onPreviewEnd=()=>{},onFocus=()=>{},onStatus=()=>{},onStorageError=()=>{}}) {
  const win=windowObject,origin=win?.location?.origin;
  const sender=win?.crypto?.randomUUID?.()||`equipment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let current=normalizedVariant(data,variant)||equipmentVariant(data,createDefaultState(data)),disposed=false,sequence=0,channel=null,focus=null;
  const seen=new Set(),listeners=[],previewSequences=new Map(),focusSequences=new Map();
  const listen=(target,type,fn)=>{target?.addEventListener?.(type,fn);listeners.push(()=>target?.removeEventListener?.(type,fn));};
  try {if(typeof win?.BroadcastChannel==='function') channel=new win.BroadcastChannel(CHANNEL);} catch {}
  const fingerprint=value=>{const {_sync,...plain}=value;return JSON.stringify(plain);};
  function save(){try{storage?.setItem(EQUIPMENT_STORAGE_KEY,JSON.stringify(current));}catch{onStorageError();}}
  function peers(){const out=new Set();try{if(win.parent && win.parent!==win)out.add(win.parent);}catch{}try{if(win.opener&&!win.opener.closed)out.add(win.opener);}catch{}for(const frame of win?.document?.querySelectorAll?.('iframe')||[])if(frame.contentWindow)out.add(frame.contentWindow);return out;}
  function post(message,target){try{if(origin&&origin!=='null')target.postMessage(message,origin);}catch{}}
  function envelope(kind,payload={}){return {protocol:MESSAGE,kind,sender,sequence:++sequence,...payload};}
  function send(kind,payload={}){
    if(disposed)return;const message=envelope(kind,payload);
    try{channel?.postMessage(message);}catch{}
    for(const peer of peers())post(message,peer);
    try{win?.dispatchEvent(new win.CustomEvent(CHANNEL,{detail:message}));}catch{}
  }
  function accept(raw,source='remote'){
    const next=normalizedVariant(data,raw);if(!next||compare(next,current)<0)return false;
    if(compare(next,current)===0&&fingerprint(next)===fingerprint(current))return false;
    // A window with no edits must never replace an already committed variant.
    if(!next._sync && current._sync)return false;
    current=next;save();onPreviewEnd(null,{committed:true});onVariant(clone(next),{source});return true;
  }
  function validPosition(id,position){
    const instance=getInstances(data,current.state).find(i=>i.id===id);
    if(!instance||!position||!finite(position.x)||!finite(position.z)||!finite(position.yaw))return null;
    return {x:position.x,z:position.z,yaw:position.yaw,y:finite(position.y)?position.y:instance.floorId==='upper'?13.2:7.2,floorId:instance.floorId};
  }
  function receive(message,source){
    if(disposed||message?.protocol!==MESSAGE||message.sender===sender||typeof message.sender!=='string'||!finite(message.sequence))return;
    const key=message.sender+':'+message.sequence;if(seen.has(key))return;seen.add(key);if(seen.size>300)seen.delete(seen.values().next().value);
    if(message.kind==='request'){
      const response=envelope('variant',{variant:current});
      if(source){post(response,source);if(focus)post(envelope('focus',{focus}),source);}else{send('variant',{variant:current});if(focus)send('focus',{focus});}
    }else if(message.kind==='variant'){
      if(accept(message.variant))previewSequences.set(message.sender,Math.max(message.sequence,previewSequences.get(message.sender)||0));
    }
    else if(message.kind==='preview'){
      if(message.sequence<=(previewSequences.get(message.sender)||0))return;previewSequences.set(message.sender,message.sequence);
      if(compare(message.base,current)<0)return;
      const position=validPosition(message.id,message.position);if(position)onPreview(message.id,position);
    }else if(message.kind==='preview-end'){
      if(message.sequence<=(previewSequences.get(message.sender)||0))return;previewSequences.set(message.sender,message.sequence);
      onPreviewEnd(typeof message.id==='string'?message.id:null,{committed:Boolean(message.committed)});
    }
    else if(message.kind==='focus' && message.focus && typeof message.focus==='object'){
      if(message.sequence<=(focusSequences.get(message.sender)||0))return;focusSequences.set(message.sender,message.sequence);onFocus(clone(message.focus));
    }
    else if(message.kind==='status' && typeof message.text==='string')onStatus(message.text.slice(0,500));
  }
  listen(win,'message',event=>{if(event.origin===origin && event.source && peers().has(event.source))receive(event.data,event.source);});
  listen(win,CHANNEL,event=>receive(event.detail));
  listen(win,'storage',event=>{if(event.key===EQUIPMENT_STORAGE_KEY && event.newValue){try{accept(JSON.parse(event.newValue),'storage');}catch{}}});
  if(channel)channel.onmessage=event=>receive(event.data);
  return {
    getVariant:()=>clone(current),
    publish(value,{force=false}={}){
      const next=normalizedVariant(data,value);if(!next)return false;
      if(!force&&fingerprint(next)===fingerprint(current))return false;
      current={...next,_sync:{revision:Math.max(Date.now(),(current._sync?.revision||0)+1),sender}};save();send('variant',{variant:current});return true;
    },
    preview(id,position){const checked=validPosition(id,position);if(checked)send('preview',{id,position:checked,base:{_sync:current._sync}});},
    endPreview(id,{committed=false}={}){send('preview-end',{id,committed});},
    focus(value){focus=clone(value);send('focus',{focus});},
    notify(text){send('status',{text:String(text).slice(0,500)});},
    request(){send('request');},
    dispose(){if(disposed)return;disposed=true;listeners.forEach(fn=>fn());if(channel){channel.onmessage=null;channel.close();}}
  };
}
