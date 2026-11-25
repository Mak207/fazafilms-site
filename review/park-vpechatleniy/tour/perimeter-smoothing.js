import * as THREE from 'three';

const wrap = (v, length) => ((v % length) + length) % length;
const smootherstep = t => t * t * t * (10 + t * (-15 + 6 * t));

/** A periodic C2 cubic B-spline, fitted to the CAD-checked perimeter corridor.
 * Gaussian fairing removes sudden curvature reversals. Exact station centres and
 * their immediate straight docking approach are protected before spline fitting.
 * The resulting centreline, not a lagged vehicle heading, drives the wagon and rail.
 */
export function smoothPerimeterRoute(base, input = {}) {
  const sigma = input.smoothingSigma ?? 2.8;
  if (!Number.isFinite(sigma) || sigma <= 0 || sigma > 4) throw new RangeError('Монорельс: степень сглаживания должна быть больше 0 и не больше 4 м.');
  const count = Math.ceil(base.length / .10), sourceStep = base.length / count;
  const source = Array.from({ length: count }, (_, i) => base.sampleDistance(i * sourceStep).position.toArray());
  const radius = Math.ceil(4 * sigma / sourceStep), weights = [];
  let weightSum = 0;
  for (let j = -radius; j <= radius; j++) { const w = Math.exp(-.5 * (j * sourceStep / sigma) ** 2); weights.push(w); weightSum += w; }
  let maxOffset = 0;
  const points = source.map((point, i) => {
    const d = i * sourceStep;
    let mix = 1;
    for (const station of base.stations) {
      const delta = Math.abs(d - station.distance), nearest = Math.min(delta, base.length - delta);
      const protectedHalfLength = 1.5;
      mix = Math.min(mix, smootherstep(Math.max(0, Math.min(1, (nearest - protectedHalfLength) / 4))));
    }
    const filtered = [0, 0, 0];
    for (let j = -radius; j <= radius; j++) {
      const p = source[wrap(i + j, count)], w = weights[j + radius] / weightSum;
      for (let k = 0; k < 3; k++) filtered[k] += w * p[k];
    }
    const result = point.map((v, k) => v + mix * (filtered[k] - v));
    maxOffset = Math.max(maxOffset, Math.hypot(...result.map((v, k) => v - point[k])));
    return result;
  });

  function evaluate(parameter) {
    const p = wrap(parameter, count), i = Math.floor(p), t = p - i, t2 = t * t, t3 = t2 * t;
    const b = [(1-3*t+3*t2-t3)/6, (4-6*t2+3*t3)/6, (1+3*t+3*t2-3*t3)/6, t3/6];
    const db = [-.5*(1-t)*(1-t), 1.5*t2-2*t, -.5*(3*t2-2*t-1), .5*t2];
    const ddb = [1-t, 3*t-2, 1-3*t, t];
    const position = [0,0,0], velocity = [0,0,0], acceleration = [0,0,0];
    for (let j=0;j<4;j++) {
      const q = points[wrap(i+j-1,count)];
      for (let k=0;k<3;k++) { position[k]+=b[j]*q[k]; velocity[k]+=db[j]*q[k]; acceleration[k]+=ddb[j]*q[k]; }
    }
    return { position, velocity, acceleration };
  }

  // Horizontal chainage matches the existing route's distance/grade convention.
  const divisions = count * 4, lengths = new Float64Array(divisions + 1);
  let previous = evaluate(0).position;
  for (let i=1;i<=divisions;i++) {
    const p=evaluate(i/4).position;
    lengths[i]=lengths[i-1]+Math.hypot(p[0]-previous[0],p[2]-previous[2]); previous=p;
  }
  const total = lengths[divisions];
  function sourceToDistance(distance) {
    const index=wrap(distance,base.length)/sourceStep*4, lo=Math.floor(index), u=index-lo;
    return lengths[lo]+u*(lengths[lo+1]-lengths[lo]);
  }
  function sampleDistance(distance, target) {
    if(!Number.isFinite(distance)) throw new TypeError('Монорельс: distance должен быть конечным числом.');
    const d=wrap(distance,total); let lo=0,hi=divisions;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(lengths[mid]<=d)lo=mid;else hi=mid;}
    const span=lengths[hi]-lengths[lo], parameter=(lo+(span?(d-lengths[lo])/span:0))/4;
    const q=evaluate(parameter),v=q.velocity,a=q.acceleration,horizontal=Math.hypot(v[0],v[2]);
    const result=target||{position:new THREE.Vector3(),tangent:new THREE.Vector3()};
    result.position.set(...q.position); result.tangent.set(...v).normalize();
    result.distance=d;result.phase=d/total;result.grade=v[1]/horizontal;
    result.heading=Math.atan2(v[0],v[2]);
    result.curvature=(v[0]*a[2]-v[2]*a[0])/(horizontal**3);
    result.sourceDistance=wrap(parameter*sourceStep,base.length);
    return result;
  }
  const stations=Object.freeze(base.stations.map(s=>Object.freeze({...s,distance:sourceToDistance(s.distance)})));
  const supportAnchors=Object.freeze(base.supportAnchors.map(record=>{
    const distance=sourceToDistance(record.distance),p=sampleDistance(distance).position;
    return Object.freeze({...record,distance,x:p.x,z:p.z,railY:p.y,beamBottom:p.y-.78,gap:p.y-.78-record.floorY,columnHeight:p.y-.78-record.floorY-record.footHeight-record.capHeight});
  }));
  return Object.freeze({
    ...base, length:total, sampleDistance, stations, station:stations[0],
    segments:Object.freeze([Object.freeze({type:'periodic-c2-spline',start:0,end:total,length:total})]),
    supportAnchors,supportDistances:Object.freeze(supportAnchors.map(p=>p.distance)),
    profileRamps:Object.freeze(base.profileRamps.map(([start,end,a,b])=>Object.freeze([sourceToDistance(start),sourceToDistance(end),a,b]))),
    rgoCanopyClearances:Object.freeze(supportAnchors.filter(p=>p.rgoCanopyConflicts?.length).map(p=>Object.freeze({x:p.x,z:p.z,radius:.44,minY:11.1,maxY:11.5}))),
    smoothing:Object.freeze({method:'periodic C2 cubic B-spline with Gaussian fairing',sigma,sourceLength:base.length,maxControlPointOffset:maxOffset,stationProtectedHalfLengths:base.stations.map(s=>({id:s.id,metres:1.5}))}),
    getPointAt(phase,target=new THREE.Vector3()){return target.copy(sampleDistance(phase*total).position);},
    getTangentAt(phase,target=new THREE.Vector3()){return target.copy(sampleDistance(phase*total).tangent);},
  });
}
