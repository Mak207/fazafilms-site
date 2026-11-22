"""Audit complete skinned geometry from recorded browser bone matrices.

Portable CLI form of the executed v44 actual-skin audit. No animation edits,
interpolation, retargeting or IK. See RECORDED-SKIN-AUDIT.md for input boundaries.
"""
from pathlib import Path
import argparse, json, gzip, hashlib, re, time, math
import numpy as np
from recorded_skin_geometry import Model

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument("--trace-dir",type=Path,required=True)
parser.add_argument("--decoded-dir",type=Path,required=True)
parser.add_argument("--layout",type=Path,default=Path(__file__).resolve().parents[2]/"ready-crowd-layout-v1.json")
parser.add_argument("--runtime-sha",required=True)
parser.add_argument("--adapter-sha",required=True)
parser.add_argument("--expected-frames",type=int)
parser.add_argument("--sample-times",type=lambda value:[float(t) for t in value.split(",")],help="Optional bounded utility check; omitted for the full trace audit.")
parser.add_argument("--output",type=Path)
args=parser.parse_args()
O=args.trace_dir.resolve();output=(args.output or O/"actual-skin-envelope-clearance.json").resolve()
if output.exists(): raise FileExistsError(f"Preserve the existing result; choose a new --output: {output}")
manifest=json.loads((O/"continuity-report.json").read_text(encoding="utf-8"))
manifest_text=json.dumps(manifest.get("inputSha256"))
assert len(args.runtime_sha)==64 and args.runtime_sha in manifest_text, "Capture runtime SHA mismatch"
assert len(args.adapter_sha)==64 and args.adapter_sha in manifest_text, "Capture adapter SHA mismatch"
norm=lambda n:re.sub(r"[\s_:]","",n.replace("mixamorig",""))
meta=json.loads((O/'skin-metadata.json').read_text(encoding='utf-8'));layout=json.loads(args.layout.read_text(encoding='utf-8'))
def distances(points):
 b=layout['bounds'];x=points[:,0];z=points[:,2]
 out=np.minimum.reduce([x-b['minX'],b['maxX']-x,z-b['minZ'],b['maxZ']-z])
 for x0,x1,z0,z1 in layout['obstacles']:
  dx=np.maximum.reduce([x0-x,np.zeros_like(x),x-x1]);dz=np.maximum.reduce([z0-z,np.zeros_like(z),z-z1])
  d=np.hypot(dx,dz);inside=(dx==0)&(dz==0)
  d[inside]=-np.minimum.reduce([x[inside]-x0,x1-x[inside],z[inside]-z0,z1-z[inside]])
  out=np.minimum(out,d)
 return out
models={}
for item in meta['metadata']:
 person=item['id'];m=Model(args.decoded_dir/f'{person}-current-decoded.glb');names={norm(n):i for n,i in m.names.items()};order=np.array([names[norm(n)] for n in item['boneNames']])
 for mesh in item['meshes']:
  assert np.max(abs(np.array(mesh['bindMatrix']).reshape(4,4).T-np.eye(4)))<1e-12
  assert mesh['bindMode']=='attached'
  assert np.max(abs(np.array(mesh['matrixWorld']).reshape(4,4).T@np.array(mesh['bindMatrixInverse']).reshape(4,4).T-np.eye(4)))<1e-8
 groups=[];offset=0;shoes=[]
 for p in m.prims:
  names_skin=[m.j['nodes'][int(i)].get('name','').split(':')[-1] for i in p['js']]
  accepted=np.array([n in ['LeftFoot','LeftToeBase','RightFoot','RightToeBase'] for n in names_skin])
  shoe=(accepted[p['ji']]*p['w']).sum(axis=1)>=.25;shoes.extend((np.where(shoe)[0]+offset).tolist())
  for k,joint in enumerate(p['js']):
   weights=np.sum(np.where(p['ji']==k,p['w'],0),axis=1);ids=np.where(weights>0)[0]
   if len(ids):groups.append((int(joint),ids+offset,(p['h'][ids]@p['ib'][k].T)*weights[ids,None]))
  offset+=len(p['h'])
 models[person]={'model':m,'order':order,'groups':groups,'count':offset,'shoes':np.array(shoes,dtype=int)}
summary={'emma':{},'ethan':{}}
for person in summary:summary[person]={'vertices':models[person]['count'],'shoeVertices':len(models[person]['shoes']),'maxRadius':0,'minVertexStaticClearance':1e9,'minCircleStaticClearanceBound':1e9,'minShoeY':1e9,'maxShoeY':-1e9,'maxShoeVsRuntimeMinimumError':0,'maxYawRateDegreesPerSecond':0,'maxYawRateUnder015mpsDegreesPerSecond':0,'maxNonAuthoredYawRateDegreesPerSecond':0,'nonAuthoredYawLimitViolations':0,'movingIdleFrames':0,'movingIdleDistanceApprox':0,'states':{},'maxRadiusWitness':None,'minStaticWitness':None,'lowSpeedYawWitness':None}
previous={};rows=[];min_pair_bound=1e9;pair_witness=None;frames=0;records_read=0;started=time.monotonic()
with gzip.open(O/'frames.ndjson.gz','rt',encoding='utf-8') as f:
 for line in f:
  frame=json.loads(line);t=frame['time'];actors=[];metrics={};records_read+=1
  if args.sample_times and not any(abs(t-value)<=1e-7 for value in args.sample_times):
   previous.clear();continue
  for actor in frame['actors']:
   person=actor['id'];data=models[person];m=data['model'];aff=np.array(actor['boneWorldAffine'],float);assert aff.shape==(len(data['order']),12)
   world=np.broadcast_to(np.eye(4),(m.n,4,4)).copy();world[data['order'],:3,:]=aff.reshape(-1,4,3).transpose(0,2,1)
   v=np.zeros((data['count'],3))
   for joint,ids,local in data['groups']:v[ids]+=local@world[joint,:3,:].T
   center=np.array(actor['holder']['position']);radii=np.linalg.norm(v[:,[0,2]]-center[[0,2]],axis=1);idx=int(radii.argmax());radius=float(radii[idx]);vertex_clear=distances(v);vc=float(vertex_clear.min());center_clear=float(distances(center.reshape(1,3))[0]);circle_bound=center_clear-radius
   shoe=float(v[data['shoes'],1].min());runtime=actor['pose']['correctedShoeMinimumY'];error=abs(shoe-runtime)
   q=actor['holder']['quaternion'];yaw=2*math.atan2(q[1],q[3]);yawrate=0
   if person in previous:
    pt,pyaw,pstate=previous[person];yawrate=abs(math.atan2(math.sin(yaw-pyaw),math.cos(yaw-pyaw))/(t-pt))*180/math.pi
   oldstate=previous.get(person,(None,None,None))[2]
   previous[person]=(t,yaw,actor['state']);s=summary[person];s['states'][actor['state']]=s['states'].get(actor['state'],0)+1
   if radius>s['maxRadius']:s['maxRadius']=radius;s['maxRadiusWitness']={'time':t,'state':actor['state'],'phase':actor['phase'],'walkWeight':actor['pose']['walk']['weight'],'vertexIndex':idx,'vertex':v[idx].tolist(),'holder':center.tolist()}
   if vc<s['minVertexStaticClearance']:s['minVertexStaticClearance']=vc;s['minStaticWitness']={'time':t,'state':actor['state'],'vertexIndex':int(vertex_clear.argmin()),'vertex':v[int(vertex_clear.argmin())].tolist(),'holder':center.tolist()}
   s['minCircleStaticClearanceBound']=min(s['minCircleStaticClearanceBound'],circle_bound);s['minShoeY']=min(s['minShoeY'],shoe);s['maxShoeY']=max(s['maxShoeY'],shoe);s['maxShoeVsRuntimeMinimumError']=max(s['maxShoeVsRuntimeMinimumError'],error);s['maxYawRateDegreesPerSecond']=max(s['maxYawRateDegreesPerSecond'],yawrate)
   if actor['state']!='turn' and oldstate!='turn':
    s['maxNonAuthoredYawRateDegreesPerSecond']=max(s['maxNonAuthoredYawRateDegreesPerSecond'],yawrate)
    if yawrate>2.4*180/math.pi+1e-3:s['nonAuthoredYawLimitViolations']+=1
   if actor['state'] not in ['turn','demo'] and actor['world']['actualSpeed']>.02 and actor['pose']['walk']['weight']<1e-8:
    s['movingIdleFrames']+=1;s['movingIdleDistanceApprox']+=actor['world']['actualSpeed']/60
   if actor['world']['actualSpeed']<.15 and yawrate>s['maxYawRateUnder015mpsDegreesPerSecond']:
    s['maxYawRateUnder015mpsDegreesPerSecond']=yawrate;s['lowSpeedYawWitness']={'time':t,'state':actor['state'],'actualSpeed':actor['world']['actualSpeed'],'walkWeight':actor['pose']['walk']['weight'],'phase':actor['phase'],'holder':center.tolist(),'yawRateDegreesPerSecond':yawrate}
   metrics[person]={'radius':radius,'vertexStaticClearance':vc,'circleStaticLowerBound':circle_bound,'shoeY':shoe,'runtimeShoeError':error,'speed':actor['world']['actualSpeed'],'yawRateDeg':yawrate,'state':actor['state']}
   actors.append((person,center,radius))
  d=float(np.linalg.norm(actors[0][1][[0,2]]-actors[1][1][[0,2]]));bound=d-actors[0][2]-actors[1][2]
  if bound<min_pair_bound:min_pair_bound=bound;pair_witness={'time':t,'centerDistance':d,'radii':[actors[0][2],actors[1][2]],'states':[frame['actors'][0]['state'],frame['actors'][1]['state']]}
  rows.append({'time':t,'actors':metrics,'pairCircleLowerBound':bound});frames+=1
assert rows, 'No frames selected'
if args.expected_frames is not None:
 assert records_read==args.expected_frames, f'Expected {args.expected_frames} trace records, got {records_read}'
out={'method':'Full LBS from actual recorded world bone matrices (rounded to 1e-7), current model POSITION/JOINTS/WEIGHTS/IBM. Metadata verified attached mode, bindMatrix identity and meshWorld*bindMatrixInverse identity. Weighted shoe min cross-checked to the renderer runtime for every frame. Static distances use the 2D footprint of layout AABBs conservatively at all heights. Positive center-clearance minus actual radius proves the whole projected skin and its triangles clear those AABBs; vertex clearance is reported separately. Positive pair centerDistance-rA-rB proves skin disjointness by enclosing circles at each captured frame; no between-frame collision claim.','frames':frames,'traceRecords':records_read,'sampleTimes':args.sample_times,'duration':rows[-1]['time']-rows[0]['time'],'inputs':{'framesSha256':hashlib.sha256((O/'frames.ndjson.gz').read_bytes()).hexdigest(),'metadataSha256':hashlib.sha256((O/'skin-metadata.json').read_bytes()).hexdigest(),'continuityReportSha256':hashlib.sha256((O/'continuity-report.json').read_bytes()).hexdigest()},'summary':summary,'minimumPairCircleLowerBound':min_pair_bound,'pairWitness':pair_witness,'elapsedSeconds':time.monotonic()-started,'perFrame':rows}
out['captureInputManifest']=manifest.get('inputSha256')
out['geometrySha256']={person:hashlib.sha256((args.decoded_dir/f'{person}-current-decoded.glb').read_bytes()).hexdigest() for person in models}
out['layoutSha256']=hashlib.sha256(args.layout.read_bytes()).hexdigest()
out['auditorSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
out['geometryReaderSha256']=hashlib.sha256(Path(__file__).with_name('recorded_skin_geometry.py').read_bytes()).hexdigest()
output.write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in out.items() if k!='perFrame'},ensure_ascii=True),flush=True);print('DONE',flush=True)
