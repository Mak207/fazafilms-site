// Actual authored GLB root trajectories + a moving DetourCrowd peer.
// Usage: node motion-lab/tools/verify-authored-root-crowd.mjs [--output report.json]
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createReadyCrowd } from '../../ready-crowd-v1.js';
const e=new URL('../../',import.meta.url);
const navMeshBytes=fs.readFileSync(new URL('ready-crowd-navmesh-v1.bin',e));
const layout=JSON.parse(fs.readFileSync(new URL('ready-crowd-layout-v1.json',e)));
const dt=1/60,dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const rawClearance=p=>Math.min(p.x-layout.bounds.minX,layout.bounds.maxX-p.x,p.z-layout.bounds.minZ,layout.bounds.maxZ-p.z,
 ...layout.obstacles.map(o=>Math.hypot(Math.max(o[0]-p.x,0,p.x-o[1]),Math.max(o[2]-p.z,0,p.z-o[3]))));
function readTurns(person){
 const bytes=fs.readFileSync(new URL('assets/models/visitors/motions/'+person+'-native-turns.glb',e));
 const jsonSize=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonSize)),binOffset=20+jsonSize+8;
 const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
 function accessor(index){
  const a=json.accessors[index],view=json.bufferViews[a.bufferView],width=widths[a.type];
  if(a.componentType!==5126||a.sparse)throw Error('Expected baked float accessor');
  const values=[];for(let i=0;i<a.count;i++)for(let j=0;j<width;j++)values.push(bytes.readFloatLE(binOffset+(view.byteOffset||0)+(a.byteOffset||0)+i*(view.byteStride||width*4)+j*4));
  return values;
 }
 return {sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
  clips:json.animations.map(animation=>{
   const channel=animation.channels.find(c=>c.target.path==='translation'&&/hips/i.test(json.nodes[c.target.node].name));
   const sampler=animation.samplers[channel.sampler];
   if(sampler.interpolation&&sampler.interpolation!=='LINEAR')throw Error('Expected LINEAR authored root');
   const times=accessor(sampler.input),values=accessor(sampler.output),duration=times.at(-1);
   const at=time=>{
    let a=0;while(a+1<times.length&&times[a+1]<time)a++;
    const b=Math.min(a+1,times.length-1),t=a===b?0:Math.max(0,Math.min(1,(time-times[a])/(times[b]-times[a])));
    return {x:values[a*3]+(values[b*3]-values[a*3])*t-values[0],z:values[a*3+2]+(values[b*3+2]-values[a*3+2])*t-values[2]};
   };
   return {name:animation.name,duration,at};
  })
 };
}
const sources={emma:readTurns('emma'),ethan:readTurns('ethan')};
const results=[];
async function simulate(person,clip,walkerStart,{holdWalkerUntil=0,suffix=''}={}){
 const origin={x:0,z:-6},yaw=.4;
 const targetAt=t=>{const p=clip.at(t);return{x:origin.x+p.x*Math.cos(yaw)+p.z*Math.sin(yaw),z:origin.z+p.z*Math.cos(yaw)-p.x*Math.sin(yaw)};};
 const world=await createReadyCrowd({layout,navMeshBytes,agents:[
 {id:'turner',position:origin,maxSpeed:1.04},{id:'walker',position:walkerStart,maxSpeed:1.14}
 ]});
 const path=world.queryPath(walkerStart,{x:3,z:-6.2});
 if(!path.success)throw Error('No upstream path');
 let walkerIssued=false;
 if(holdWalkerUntil===0){world.moveTo('walker',{x:3,z:-6.2});walkerIssued=true;}
 let phase=0,accepted=0,rejected=0,commitRejected=0,notPreserved=0,minCenters=Infinity,minStatic=Infinity,
 maxDeviation=0,maxEngineVelocityAfterRoot=0,maxObservedVelocity=0,maxAcceptedStep=0;
 const traces=[],reasons={};
 let completed=false,time=0;
 for(let tick=0;tick<1800;tick++){
  if(!walkerIssued&&tick*dt>=holdWalkerUntil){world.moveTo('walker',{x:3,z:-6.2});walkerIssued=true;}
  const previousPhase=phase,next=Math.min(clip.duration,phase+dt);
  let queued;
  if(phase<clip.duration-1e-8){
   queued=world.queueRootMotion('turner',targetAt(next));
   if(!queued.accepted){rejected++;reasons[queued.reason]=(reasons[queued.reason]||0)+1;}
   else {accepted++;maxAcceptedStep=Math.max(maxAcceptedStep,queued.stepDistance);}
  }
  const frame=world.update(dt),turner=frame.agents.find(a=>a.id==='turner'),walker=frame.agents.find(a=>a.id==='walker');
  const event=queued?.accepted?frame.rootMotionEvents.find(ev=>ev.sequence===queued.sequence):null;
  if(event?.status==='applied'){
   maxDeviation=Math.max(maxDeviation,event.positionDeviation);
   if(event.authoredTrajectoryPreserved)phase=next;else notPreserved++;
   maxEngineVelocityAfterRoot=Math.max(maxEngineVelocityAfterRoot,turner.speed);
   maxObservedVelocity=Math.max(maxObservedVelocity,turner.actualSpeed);
   if(dist(event.actualPosition,turner.position)>1e-9)throw Error('Snapshot is not post-Crowd authoritative position');
  }else if(queued?.accepted)commitRejected++;
  if(queued&&!queued.accepted&&phase!==previousPhase)throw Error('Blocked source phase advanced');
  minCenters=Math.min(minCenters,dist(turner.position,walker.position));
  minStatic=Math.min(minStatic,...frame.agents.map(a=>rawClearance(a.position)));
  if(tick%6===0)traces.push({t:tick*dt,phase,queued:queued?.accepted,event:event?.status,positions:frame.agents.map(a=>a.position)});
  time=(tick+1)*dt;
  if(phase>=clip.duration-1e-8&&walker.arrived){completed=true;break;}
 }
 const beforeReset=world.snapshot();
 const totalTurnDistance=world.get('turner').distanceTravelled;
 const reset=world.reset();
 const resetPass=reset.totalFixedSteps===0&&reset.simulationTime===0&&reset.pendingRootMotion.length===0&&reset.rootMotionEvents.length===0&&reset.agents.every(a=>a.distanceTravelled===0&&a.actualSpeed===0&&a.speed===0)&&dist(reset.agents[0].position,origin)<1e-5;
 const result={person,clip:clip.name,suffix,clipDuration:clip.duration,seconds:time,completed,phase,accepted,rejected,pausedSeconds:rejected*dt,commitRejected,reasons,notPreserved,
 minCenters,minStatic,maxDeviation,maxAcceptedStep,maxEngineVelocityAfterRoot,maxObservedVelocity,totalTurnDistance,resetPass,
 sourceSha256:sources[person].sha256,pass:completed&&minCenters>=1.4-.005&&minStatic>=.7-.005&&notPreserved===0&&commitRejected===0&&resetPass};
 // Per-tick traces stay in memory; the compact report is enough for the regression gate.
 world.destroy();return result;
}
for(const person of ['emma','ethan'])for(const clip of sources[person].clips)results.push(await simulate(person,clip,[-1.85,-6.2]));
const pauseClip=sources.emma.clips.find(c=>c.name.endsWith('TurnLeft180'));
const first=pauseClip.at(dt), firstWorld={x:first.x*Math.cos(.4)+first.z*Math.sin(.4),z:first.z*Math.cos(.4)-first.x*Math.sin(.4)};
const length=Math.hypot(firstWorld.x,firstWorld.z);
if(length<1e-6)throw Error('Pause case requires a nonzero first authored root step');
const closeStart=[firstWorld.x/length*1.4001,-6+firstWorld.z/length*1.4001];
results.push(await simulate('emma',pauseClip,closeStart,{holdWalkerUntil:.5,suffix:'-blocked-resume'}));
// Rejection guard and station-claim lifecycle are exercised without changing any navigation positions manually.
const world=await createReadyCrowd({layout,navMeshBytes,agents:[{id:'a',position:[-3,-6]},{id:'b',position:[-1.58,-6]}]});
const oversize=world.queueRootMotion('a',[-2.8,-6]);
const pair=world.queueRootMotion('a',[-2.96,-6]);
const unchanged=world.get('a').position;
world.update(dt);
const rejectedStayed=dist(unchanged,world.get('a').position)<1e-9;
const reset=world.reset([{id:'a',position:layout.stations[0].position,station:0},{id:'b',position:[3,-6]}]);
const reserve=world.reserveStation('a',2),afterReserve=world.snapshot();
const start=world.get('a').position;
world.moveTo('a',{x:start.x+.2,z:start.z-.2});
for(let i=0;i<300;i++)world.update(dt);
const afterWaypoint=world.get('a'),claims=world.snapshot().stationClaims;
world.stop('a');
const afterStop=world.get('a');
const path=world.queryPath(world.get('a').position,layout.stations[2].position);
const badPath=world.queryPath([1000,1000],[0,0]);
const safeguards={
 oversize,pair,rejectedStayed,reserve,intermediateArrival:afterWaypoint.arrived,
 currentStationPreserved:afterWaypoint.currentStation===0&&claims[0]==='a',
 reservationPreserved:afterWaypoint.reservedStation===2&&claims[2]==='a'&&afterStop.reservedStation===2,
 pathSuccess:path.success,pathCorners:path.path.length,badPathRejected:!badPath.success,
 pass:!oversize.accepted&&oversize.reason==='root-step-too-large'&&!pair.accepted&&pair.reason==='agent-clearance'&&rejectedStayed&&reserve.accepted&&afterWaypoint.arrived&&afterWaypoint.currentStation===0&&claims[0]==='a'&&claims[2]==='a'&&afterStop.reservedStation===2&&path.success&&!badPath.success
};
world.destroy();
const report={dt,note:'Actual authored Hips XZ paths, supplied before the only shared Detour tick. Pure native turns fit current .68m skin guard; this proof checks navigation, not rendering or arbitrary blends.',results,safeguards,blockedPhaseResumePass:results.at(-1).rejected>0&&results.at(-1).completed,pass:results.every(r=>r.pass)&&results.at(-1).rejected>0&&safeguards.pass};
const outputIndex=process.argv.indexOf('--output');
if(outputIndex>=0){if(!process.argv[outputIndex+1])throw Error('--output requires a path');fs.writeFileSync(process.argv[outputIndex+1],JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
if(!report.pass)process.exitCode=1;

