import * as THREE from "three";
import { createNativeMotion } from "./visitor-motion-v43.js?v=43";

// v43: unchanged exhibition meshes, one native mixer, distance-driven gait.
// Navigation footprints below are retained from the measured v42 scene.

const profiles=[
  {id:"emma",model:"woman",speed:1.14,start:0,seed:0x7254a11},
  {id:"ethan",model:"man",speed:1.04,start:3,seed:0x39cb7d2}
];
const stations=[
  {name:"Робот и реактор",position:[-3.55,.45],target:[-3.55,2.55]},
  {name:"Поезд Москва-2024",position:[3.55,.45],target:[3.55,2.55]},
  {name:"Москва-Сити",position:[0,3.62],target:[0,5.48]},
  {name:"Новый жилой микрорайон",position:[-3.35,-1.88],target:[-3.35,-3.55]},
  {name:"Большая спортивная арена",position:[3.35,-1.88],target:[3.35,-3.55]},
  {name:"Видеокуб",position:[-1.96,-.35],target:[0,-.35]}
];

// Bounds measured from the rendered Three.js scene. Each footprint is expanded
// by the visitor capsule radius, so a valid centreline also clears shoulders.
const clearance=.48,obstacles=[
  [-1.22,1.22,-1.56,.86],      // media cube and pedestal
  [-4.28,-2.82,1.14,3.96],    // technology plinth
  [2.85,4.25,1.07,4.03],      // train plinth
  [-4.62,-2.08,-4.37,-2.73],  // residential plinth
  [2.08,4.62,-4.37,-2.73],    // arena plinth
  [-1.92,1.92,4.34,6.62]      // Moscow City plinth
].map(([minX,maxX,minZ,maxZ])=>({minX:minX-clearance,maxX:maxX+clearance,minZ:minZ-clearance,maxZ:maxZ+clearance}));
const nav={minX:-5.18,maxX:5.18,minZ:-8.75,maxZ:8.75,step:.38};
const routeCache=new Map();
const params=new URLSearchParams(location.search),demoPeriod=Math.max(1,Number(params.get("visitorDemoEvery"))||300),demoOnly=params.has("visitorDemoOnly");
const sessionSeed=(Number(params.get("visitorSeed"))||crypto.getRandomValues(new Uint32Array(1))[0])>>>0;
const demoKinds=["wave","talk","clap","think","cheer","shrug"];
const nativeGestures={wave:"Wave",talk:"Talk",clap:"Clap",think:"Think",cheer:"Cheer",shrug:"Shrug"};
const forcedDemo=params.get("visitorDemoAction");
const smooth=THREE.MathUtils.smoothstep,clamp=THREE.MathUtils.clamp,wrap=THREE.MathUtils.euclideanModulo;

function rng(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function demoForSlot(slot){
  if(forcedDemo&&demoKinds.includes(forcedDemo))return forcedDemo;
  const cycle=Math.floor((slot-1)/demoKinds.length),random=rng(0x45f21a9^cycle^sessionSeed),bag=demoKinds.slice();
  for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
  return bag[(slot-1)%bag.length];
}
function point(index){const [x,z]=stations[index].position;return new THREE.Vector3(x,0,z);}
function viewYaw(index){const s=stations[index];return Math.atan2(s.target[0]-s.position[0],s.target[1]-s.position[1]);}
function angleMix(a,b,t){return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;}

function blocked(x,z){return x<nav.minX||x>nav.maxX||z<nav.minZ||z>nav.maxZ||obstacles.some(o=>x>o.minX&&x<o.maxX&&z>o.minZ&&z<o.maxZ);}
function segmentClear(a,b){const n=Math.max(2,Math.ceil(a.distanceTo(b)/.09));for(let i=0;i<=n;i++){const t=i/n;if(blocked(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t))return false;}return true;}
function navPath(startIndex,goalIndex){
  const cacheKey=Number.isInteger(startIndex)&&Number.isInteger(goalIndex)?`${startIndex}:${goalIndex}`:null;if(cacheKey&&routeCache.has(cacheKey))return routeCache.get(cacheKey).map(p=>p.clone());
  const start=Number.isInteger(startIndex)?point(startIndex):startIndex.clone(),goal=Number.isInteger(goalIndex)?point(goalIndex):goalIndex.clone(),cols=Math.floor((nav.maxX-nav.minX)/nav.step)+1,rows=Math.floor((nav.maxZ-nav.minZ)/nav.step)+1;
  const key=(x,z)=>z*cols+x,position=(x,z)=>new THREE.Vector3(nav.minX+x*nav.step,0,nav.minZ+z*nav.step),valid=(x,z)=>x>=0&&x<cols&&z>=0&&z<rows&&!blocked(position(x,z).x,position(x,z).z);
  function snap(origin){const cx=Math.round((origin.x-nav.minX)/nav.step),cz=Math.round((origin.z-nav.minZ)/nav.step);for(let r=0;r<12;r++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){if(Math.max(Math.abs(dx),Math.abs(dz))!==r)continue;const x=cx+dx,z=cz+dz,p=position(x,z);if(valid(x,z)&&segmentClear(origin,p))return[x,z];}throw new Error("No free navigation cell");}
  const [sx,sz]=snap(start),[gx,gz]=snap(goal),startKey=key(sx,sz),goalKey=key(gx,gz),open=[startKey],cost=new Map([[startKey,0]]),previous=new Map(),cell=new Map([[startKey,[sx,sz]]]);
  while(open.length){let best=0;for(let i=1;i<open.length;i++){const [ax,az]=cell.get(open[i]),[bx,bz]=cell.get(open[best]);if((cost.get(open[i])+Math.hypot(gx-ax,gz-az))<(cost.get(open[best])+Math.hypot(gx-bx,gz-bz)))best=i;}const current=open.splice(best,1)[0];if(current===goalKey)break;const [x,z]=cell.get(current);
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const nx=x+dx,nz=z+dz;if(!valid(nx,nz))continue;if(dx&&dz&&(!valid(x+dx,z)||!valid(x,z+dz)))continue;const next=key(nx,nz),candidate=cost.get(current)+Math.hypot(dx,dz);if(candidate>= (cost.get(next)??Infinity))continue;cost.set(next,candidate);previous.set(next,current);cell.set(next,[nx,nz]);if(!open.includes(next))open.push(next);}
  }
  if(!cost.has(goalKey))throw new Error(`No route ${startIndex} -> ${goalIndex}`);const grid=[];for(let cursor=goalKey;;cursor=previous.get(cursor)){const [x,z]=cell.get(cursor);grid.push(position(x,z));if(cursor===startKey)break;}grid.reverse();const raw=[start,...grid,goal],simple=[raw[0]];for(let i=0;i<raw.length-1;){let j=raw.length-1;while(j>i+1&&!segmentClear(raw[i],raw[j]))j--;simple.push(raw[j]);i=j;}if(cacheKey){routeCache.set(cacheKey,simple.map(p=>p.clone()));routeCache.set(`${goalIndex}:${startIndex}`,simple.slice().reverse().map(p=>p.clone()));}return simple;
}
function roundedPath(points,maxRadius=.34){
  const path=new THREE.CurvePath(),line=(a,b)=>{if(a.distanceToSquared(b)>1e-6)path.add(new THREE.LineCurve3(a.clone(),b.clone()));};let current=points[0].clone();
  for(let i=1;i<points.length-1;i++){const previous=points[i-1],corner=points[i],next=points[i+1],radius=Math.min(maxRadius,corner.distanceTo(previous)*.24,corner.distanceTo(next)*.24);if(radius<=0){line(current,corner);current=corner.clone();continue;}const entry=corner.clone().lerp(previous,radius/corner.distanceTo(previous)),exit=corner.clone().lerp(next,radius/corner.distanceTo(next));line(current,entry);path.add(new THREE.QuadraticBezierCurve3(entry,corner.clone(),exit));current=exit;}
  line(current,points.at(-1));return path;
}
function curveClear(curve,length){const sample=new THREE.Vector3();for(let d=0;d<=length;d+=.055){curve.getPointAt(Math.min(1,d/length),sample);if(blocked(sample.x,sample.z))return false;}return true;}
export function auditVisitorNavigation(){const routes=[];for(let a=0;a<stations.length;a++)for(let b=a+1;b<stations.length;b++){const points=navPath(a,b),curve=roundedPath(points),length=curve.getLength(),clear=curveClear(curve,length);routes.push({from:stations[a].name,to:stations[b].name,points:points.map(p=>[+p.x.toFixed(2),+p.z.toFixed(2)]),length:+length.toFixed(2),clear});}return{capsuleRadius:clearance,routes};}

const ahead = new THREE.Vector3(), behind = new THREE.Vector3();
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const ease = t => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

function headingAt(curve, length, distance) {
  curve.getPointAt(clamp((distance + .14) / length, 0, 1), ahead);
  curve.getPointAt(clamp((distance - .14) / length, 0, 1), behind);
  return Math.atan2(ahead.x - behind.x, ahead.z - behind.z);
}

// Arc-length speed profile: slow down before a bend, then accelerate out of it.
// Forward/backward passes guarantee a continuous speed and a zero-speed arrival.
function travelPlan(curve, cruiseSpeed) {
  const length = curve.getLength(), count = Math.max(2, Math.ceil(length / .045));
  const distances = Array.from({ length: count + 1 }, (_, i) => length * i / count);
  const headings = distances.map(distance => headingAt(curve, length, distance));
  const speeds = distances.map((distance, i) => {
    if (i === 0 || i === count) return 0;
    const curvature = Math.abs(angleDelta(headings[i - 1], headings[i + 1])) / (distances[i + 1] - distances[i - 1]);
    return Math.min(cruiseSpeed, curvature > .0001 ? 1.8 / curvature : cruiseSpeed,
      curvature > .0001 ? Math.sqrt(1.15 / curvature) : cruiseSpeed);
  });
  const acceleration = 1.55, deceleration = 1.65;
  for (let i = 1; i <= count; i++) speeds[i] = Math.min(speeds[i], Math.sqrt(speeds[i - 1] ** 2 + 2 * acceleration * (distances[i] - distances[i - 1])));
  for (let i = count - 1; i >= 0; i--) speeds[i] = Math.min(speeds[i], Math.sqrt(speeds[i + 1] ** 2 + 2 * deceleration * (distances[i + 1] - distances[i])));
  const times = [0];
  for (let i = 1; i <= count; i++) times.push(times[i - 1] + 2 * (distances[i] - distances[i - 1]) / (speeds[i - 1] + speeds[i]));
  return { curve, length, cruiseSpeed, distances, speeds, times, duration: times[count] };
}

function travelAt(plan, time) {
  if (time >= plan.duration) return { distance: plan.length, speed: 0, done: true };
  if (time <= 0) return { distance: 0, speed: 0, done: false };
  let low = 0, high = plan.times.length - 1;
  while (high - low > 1) { const mid = (low + high) >>> 1; if (plan.times[mid] <= time) low = mid; else high = mid; }
  const dt = time - plan.times[low], duration = plan.times[high] - plan.times[low];
  const acceleration = (plan.speeds[high] - plan.speeds[low]) / duration;
  return { distance: plan.distances[low] + plan.speeds[low] * dt + .5 * acceleration * dt * dt,
    speed: plan.speeds[low] + acceleration * dt, done: false };
}

const turnBlend = .18;
const facingVector = yaw => new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));

function turnWorldPoint(origin, yaw, local) {
  const cosine = Math.cos(yaw), sine = Math.sin(yaw);
  return new THREE.Vector3(origin.x + local.x * cosine + local.z * sine, 0,
    origin.z - local.x * sine + local.z * cosine);
}

function turnPathClear(turn, origin, yaw) {
  let previous = origin;
  for (const sample of turn.path) {
    const current = turnWorldPoint(origin, yaw, sample);
    if (!segmentClear(previous, current)) return false;
    previous = current;
  }
  return true;
}

function orientedPlan(actor, origin, yaw, destination) {
  // The authored turn's real endpoint is authoritative. A straight lead-out
  // continues its actual facing; the station lead-in already faces the exhibit.
  // No residual yaw is hidden in a stationary blend or snapped at arrival.
  const goal = point(destination), lead = .65;
  const exit = origin.clone().addScaledVector(facingVector(yaw + actor.motion.forwardYaw), lead);
  const entry = goal.clone().addScaledVector(facingVector(viewYaw(destination) + actor.motion.forwardYaw), -lead);
  if (!segmentClear(origin, exit) || !segmentClear(entry, goal)) return null;
  let middle;
  try { middle = navPath(exit, entry); } catch { return null; }
  const points = [origin.clone(), ...middle, goal];
  for (const radius of [.34, .22, .10]) {
    const curve = roundedPath(points, radius), length = curve.getLength();
    if (length > .1 && curveClear(curve, length)) return travelPlan(curve, actor.profile.speed);
  }
  return null;
}

function poseNumbers(bone) {
  return { name: bone.name, position: bone.position.toArray(), quaternion: bone.quaternion.toArray(), scale: bone.scale.toArray() };
}

export function addWalkers(scene, loader, contactMaterial) {
  const actors = [], errors = [];
  let simulationTime = 0, previousInput = null, paused = false, ready = false;

  function resetActor(actor) {
    actor.random = rng(actor.profile.seed ^ sessionSeed);
    actor.totalDistance = 0; actor.walkDistance = 0; actor.turnDistance = 0;
    actor.distance = 0; actor.speed = 0; actor.yawRate = 0; actor.idleTime = 0;
    actor.plan = null;
    actor.holder.position.copy(point(actor.profile.start));
    actor.holder.rotation.y = viewYaw(actor.profile.start);
    actor.behavior = { phase: "observe", time: actor.index * 1.7, current: actor.profile.start,
      destination: null, recent: [actor.profile.start], pause: 4.8 + actor.random() * 4,
      lastDemoSlot: 0, stationName: stations[actor.profile.start].name };
    actor.motion.reset();
    updateMetadata(actor);
  }

  function chooseStation(actor) {
    const banned = new Set(actor.behavior.recent.slice(-2));
    // A station has one visitor reservation, including an approaching visitor.
    const reserved = new Set(actors.filter(other => other !== actor).flatMap(other => [other.behavior.current, other.behavior.destination]).filter(Number.isInteger));
    let choices = stations.map((_, i) => i).filter(i => i !== actor.behavior.current && !banned.has(i) && !reserved.has(i));
    if (!choices.length) choices = stations.map((_, i) => i).filter(i => i !== actor.behavior.current && !reserved.has(i));
    return choices[Math.floor(actor.random() * choices.length)];
  }

  function beginJourney(actor) {
    const b = actor.behavior, destination = chooseStation(actor);
    if (!Number.isInteger(destination)) { b.time = 0; b.pause = 1; return; }
    const origin = actor.holder.position.clone(), yaw = actor.holder.rotation.y;
    const candidates = [];
    for (const turn of [null, ...actor.motion.turns.values()]) {
      if (turn && !turnPathClear(turn, origin, yaw)) continue;
      const end = turn ? turn.at(turn.duration) : { x: 0, z: 0, yaw: 0 };
      const endpoint = turnWorldPoint(origin, yaw, end), endYaw = yaw + end.yaw;
      const plan = orientedPlan(actor, endpoint, endYaw, destination);
      if (plan) candidates.push({ turn, plan, endpoint, endYaw, cost: plan.duration + (turn ? turn.duration + 2 * turnBlend : 0) });
    }
    candidates.sort((a, b) => a.cost - b.cost);
    const choice = candidates[0];
    if (!choice) { b.time = 0; b.pause = 1.5; b.navigationRetry = (b.navigationRetry || 0) + 1; return; }
    actor.plan = choice.plan;
    actor.distance = 0;
    Object.assign(b, { destination, stationName: stations[destination].name });
    if (choice.turn) {
      actor.motion.activateTurn(choice.turn.name);
      Object.assign(b, { phase: "turn", time: 0, turnOrigin: origin, turnStart: yaw, turnDelta: choice.turn.angle,
        turnDuration: choice.turn.duration + 2 * turnBlend, turnAfter: "walk", turnName: choice.turn.name,
        turnEndpoint: choice.endpoint, turnEndYaw: choice.endYaw });
    } else Object.assign(b, { phase: "walk", time: 0, turnName: null });
    actor.speed = 0;
  }

  function arrive(actor) {
    const b = actor.behavior;
    b.current = b.destination; b.destination = null;
    b.recent = [...b.recent, b.current].slice(-3);
    b.stationName = stations[b.current].name;
    actor.speed = 0;
    actor.motion.activateTurn(null);
    Object.assign(b, { phase: "observe", time: 0, pause: 5 + actor.random() * 6, turnAfter: null, turnName: null });
  }

  function beginDemo(actor, slot) {
    const kind = demoForSlot(slot), clip = actor.motion.activateGesture(nativeGestures[kind]);
    if (!clip) return;
    Object.assign(actor.behavior, { phase: "demo", time: 0, demoKind: kind, demoDuration: clip.duration,
      demoClip: clip.name, lastDemoSlot: slot, demoCount: (actor.behavior.demoCount || 0) + 1 });
  }

  function updateMetadata(actor) {
    const b = actor.behavior;
    Object.assign(actor.holder.userData, { visitorVersion: 43, visitorId: actor.id, visitorState: b.phase,
      visitorStation: b.stationName, nativeStride: actor.motion.stride, walkPhase: actor.motion.snapshot()?.phase || 0,
      demoKind: b.demoKind || "", demoCount: b.demoCount || 0, demoTime: b.phase === "demo" ? b.time : 0,
      demoDuration: b.demoDuration || 0, demoClip: b.demoClip || "" });
    actor.holder.updateWorldMatrix(true, true);
    for (const { bone, contact } of actor.feet) {
      bone.getWorldPosition(contact.position); actor.holder.worldToLocal(contact.position);
      contact.material.opacity = .85 * (1 - smooth(contact.position.y, .095, .24));
      contact.position.y = .011; contact.position.z += .045;
    }
  }

  function advanceActor(actor, delta) {
    const b = actor.behavior, previousYaw = actor.holder.rotation.y;
    b.time += delta; actor.idleTime += delta;
    const slot = Math.floor(simulationTime / demoPeriod), assigned = slot > 0 && (slot - 1) % profiles.length === actor.index;
    if (b.phase === "observe" && assigned && slot > b.lastDemoSlot) beginDemo(actor, slot);
    if (!demoOnly && b.phase === "observe" && b.time >= b.pause) beginJourney(actor);

    let walkWeight = 0, gestureWeight = 0, turnTime = 0, turnWeight = 0;
    if (b.phase === "walk") {
      const motion = travelAt(actor.plan, b.time), previousDistance = actor.distance;
      actor.distance = motion.distance;
      const distance = Math.max(0, actor.distance - previousDistance);
      actor.totalDistance += distance; actor.walkDistance += distance;
      actor.speed = motion.speed;
      actor.plan.curve.getPointAt(actor.distance / actor.plan.length, actor.holder.position);
      // No delayed yaw filter: the body follows the same local path tangent used
      // to limit speed. Native forward direction is accounted for once.
      actor.holder.rotation.y = headingAt(actor.plan.curve, actor.plan.length, actor.distance) - actor.motion.forwardYaw;
      walkWeight = ease(actor.speed / actor.profile.speed);
      if (motion.done) arrive(actor);
    } else if (b.phase === "turn") {
      const turn = actor.motion.turns.get(b.turnName), previousPosition = actor.holder.position.clone();
      turnTime = clamp(b.time - turnBlend, 0, turn.duration);
      turnWeight = ease(b.time / turnBlend) * ease((b.turnDuration - b.time) / turnBlend);
      const root = turn.at(turnTime);
      actor.holder.position.copy(turnWorldPoint(b.turnOrigin, b.turnStart, root));
      actor.holder.rotation.y = b.turnStart + root.yaw;
      const distance = previousPosition.distanceTo(actor.holder.position);
      actor.totalDistance += distance; actor.turnDistance += distance;
      actor.speed = distance / delta;
      if (b.time >= b.turnDuration) {
        // Replan from the actual rendered endpoint, never from the old station.
        const plan = orientedPlan(actor, actor.holder.position, actor.holder.rotation.y, b.destination);
        if (!plan) throw new Error(`Turn endpoint lost navigation clearance: ${actor.id}`);
        actor.plan = plan; actor.distance = 0; actor.motion.activateTurn(null); turnWeight = 0;
        Object.assign(b, { phase: "walk", time: 0 });
      }
    } else if (b.phase === "demo") {
      actor.speed = 0;
      gestureWeight = ease(b.time / .24) * ease((b.demoDuration - b.time) / .24);
      if (b.time >= b.demoDuration) { actor.motion.activateGesture(null); Object.assign(b, { phase: "observe", time: 0, pause: 3.8 + actor.random() * 2 }); gestureWeight = 0; }
    } else actor.speed = 0;

    actor.yawRate = delta > 0 ? angleDelta(previousYaw, actor.holder.rotation.y) / delta : 0;
    actor.poseRequest = { walkDistance: actor.walkDistance, walkWeight, idleTime: actor.idleTime,
      gestureTime: b.time, gestureWeight, turnTime, turnWeight };
  }

  function advance(delta) {
    if (!ready || delta <= 0) return;
    // A bounded internal step also keeps a slow rendering frame from skipping a
    // visible start/stop transition. Absolute input time never drives a mixer.
    const count = Math.max(1, Math.ceil(delta / (1 / 30))), step = delta / count;
    for (let i = 0; i < count; i++) { simulationTime += step; for (const actor of actors) advanceActor(actor, step); }
    // Skinning and the floor check run only for the rendered pose, not for every
    // navigation substep on a low-FPS device. No elapsed movement time is lost.
    for (const actor of actors) {
      actor.motion.evaluate({ ...actor.poseRequest, delta });
      updateMetadata(actor);
    }
  }

  const update = time => {
    if (!Number.isFinite(time)) return;
    const delta = previousInput === null ? 0 : time - previousInput;
    previousInput = time;
    if (!paused && delta >= 0 && delta < 1) advance(delta);
  };
  update.isReady = () => ready;
  update.setPaused = value => { paused = Boolean(value); return paused; };
  update.step = delta => {
    if (!Number.isFinite(delta) || delta <= 0 || delta > .1) throw new Error("Visitor fixed step must be in (0, .1]");
    advance(delta); return update.snapshot();
  };
  update.reset = () => {
    simulationTime = 0; previousInput = null;
    for (const actor of actors) resetActor(actor);
    return update.snapshot();
  };
  update.actors = () => actors.slice();
  update.describe = update.actors;
  update.snapshot = ({ includeBones = false } = {}) => ({
    version: 43, ready, paused, time: simulationTime, errors: errors.slice(),
    actors: actors.map(actor => ({ id: actor.id, model: actor.model, state: actor.behavior.phase,
      turnAfter: actor.behavior.turnAfter || null, currentStation: actor.behavior.current,
      destinationStation: actor.behavior.destination, station: actor.behavior.stationName,
      phase: actor.motion.snapshot()?.phase || 0, ...actor.motion.snapshot(),
      stride: actor.motion.stride, nativeForwardYaw: actor.motion.forwardYaw, sourceSpeed: actor.motion.sourceSpeed,
      distance: actor.distance, totalDistance: actor.totalDistance, phaseDistance: actor.walkDistance,
      turnPhaseDistance: actor.turnDistance, routeLength: actor.plan?.length || 0,
      speed: actor.speed, cruiseSpeed: actor.profile.speed, yaw: actor.holder.rotation.y, yawRate: actor.yawRate,
      holder: { position: actor.holder.position.toArray(), quaternion: actor.holder.quaternion.toArray() },
      root: { position: actor.rig.position.toArray(), quaternion: actor.rig.quaternion.toArray(), scale: actor.rig.scale.toArray() },
      weightedShoeVertexCount: actor.motion.weightedShoeVertexCount,
      navigation: { yawWarp: 0, arrivalYawError: actor.behavior.phase === "observe" ? angleDelta(actor.holder.rotation.y, viewYaw(actor.behavior.current)) : null,
        turnName: actor.behavior.turnName || null, turnEndpoint: actor.behavior.turnEndpoint?.toArray() || null,
        approachLead: .65, retries: actor.behavior.navigationRetry || 0 },
      ...(includeBones ? { bones: Object.values(actor.bones).map(poseNumbers) } : {}) })),
  });

  update.ready = Promise.all(profiles.map(async (profile, index) => {
    const [model, bundle, turns] = await Promise.all([
      loader.loadAsync(new URL(`./assets/models/visitors/walking-${profile.model}.glb?v=43`, import.meta.url).href),
      loader.loadAsync(new URL(`./assets/models/visitors/motions/${profile.id}-native-motions.glb?v=43`, import.meta.url).href),
      loader.loadAsync(new URL(`./assets/models/visitors/motions/${profile.id}-native-turns.glb?v=43`, import.meta.url).href),
    ]);
    const rig = model.scene, holder = new THREE.Group(), grounding = new THREE.Group();
    holder.name = `visitor-${profile.model}`; grounding.name = `visitor-${profile.id}-floor-offset`;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(.76, .56), contactMaterial.clone());
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .009;
    grounding.add(rig); holder.add(shadow, grounding);
    const motion = createNativeMotion(rig, [...bundle.animations, ...turns.animations], grounding);
    const feet = ["Left", "Right"].map(side => {
      const contact = new THREE.Mesh(new THREE.PlaneGeometry(.18, .31), contactMaterial.clone());
      contact.rotation.x = -Math.PI / 2; holder.add(contact);
      return { side, bone: motion.bones[`${side}Foot`], contact };
    });
    const actor = { id: profile.id, model: profile.model, profile, index, holder, grounding, rig,
      bones: motion.bones, mixer: motion.mixer, motion, actions: motion.actions, feet, shadow };
    resetActor(actor); actors.push(actor); actors.sort((a, b) => a.index - b.index); scene.add(holder);
  })).then(() => { ready = true; return update.snapshot(); });
  update.ready.catch(error => { errors.push(String(error)); console.error("[visitors-v43] Native motion loading failed", error); });
  return update;
}
