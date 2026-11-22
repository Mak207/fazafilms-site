"""Geometry-only reader extracted unchanged from native_cpu_audit.py.

Used by audit_recorded_skin.py. Requires NumPy only; never evaluates animation.
The source reader SHA was 372505237ed002845efa253f4cfccff097bb52fedca4ddc374345e2fd6da6dd5.
"""
from pathlib import Path
import json, struct
import numpy as np

DT={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}
NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def glb(path):
 b=path.read_bytes();off=12;j=None;data=None
 while off<len(b):
  n,t=struct.unpack_from('<II',b,off);v=b[off+8:off+8+n];off+=8+n
  if t==0x4e4f534a:j=json.loads(v)
  if t==0x004e4942:data=v
 return j,data
def accessor(j,b,k):
 a=j['accessors'][k];assert 'sparse' not in a
 v=j['bufferViews'][a['bufferView']];assert not v.get('extensions',{}).get('EXT_meshopt_compression')
 dt=np.dtype(DT[a['componentType']]);n=NC[a['type']]
 r=np.ndarray((a['count'],n),dtype=dt,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',n*dt.itemsize),dt.itemsize)).astype(float)
 if a.get('normalized') and a['componentType']!=5126:
  info=np.iinfo(dt);r=np.maximum(r/info.max,-1) if info.min<0 else r/info.max
 return r
class Model:
 def __init__(self,path):
  self.path=path;self.j,self.b=glb(path);j=self.j;b=self.b;ns=j['nodes'];self.n=len(ns)
  self.parent={v:i for i,n in enumerate(ns) for v in n.get('children',[])}
  self.names={n.get('name',str(i)):i for i,n in enumerate(ns)}
  self.bones={n.split(':')[-1]:i for n,i in self.names.items()}
  self.tr=np.array([n.get('translation',[0,0,0]) for n in ns],float)
  self.q=np.array([n.get('rotation',[0,0,0,1]) for n in ns],float)
  self.sc=np.array([n.get('scale',[1,1,1]) for n in ns],float)
  self.order=[]
  def visit(i):
   self.order.append(i)
   for c in ns[i].get('children',[]):visit(c)
  for i in range(self.n):
   if i not in self.parent:visit(i)
  self.fixed={i:np.array(n['matrix']).reshape(4,4).T for i,n in enumerate(ns) if 'matrix'in n}
  self.anims={}
  for an in j.get('animations',[]):
   channels=[]
   for ch in an['channels']:
    sam=an['samplers'][ch['sampler']];tar=ch['target']
    if tar['path']=='weights':continue
    ts=accessor(j,b,sam['input']).ravel();values=accessor(j,b,sam['output'])
    channels.append((tar['node'],tar['path'],ts,values,sam.get('interpolation','LINEAR')))
   self.anims[an['name']]=(max(v[2][-1] for v in channels),channels)
  self.prims=[];self.stats=[]
  for ni,n in enumerate(ns):
   if 'mesh'not in n:continue
   skin=j['skins'][n['skin']] if 'skin'in n else None
   js=np.array(skin['joints']) if skin else None
   ib=accessor(j,b,skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1) if skin else None
   for pi,p in enumerate(j['meshes'][n['mesh']]['primitives']):
    at=p['attributes'];pos=accessor(j,b,at['POSITION']);h=np.concatenate([pos,np.ones((len(pos),1))],axis=1)
    weights=accessor(j,b,at['WEIGHTS_0']) if 'WEIGHTS_0'in at else None
    ji=accessor(j,b,at['JOINTS_0']).astype(int) if 'JOINTS_0'in at else None
    names=[j['nodes'][k].get('name','').split(':')[-1] for k in js] if skin else []
    side_masks={}
    if skin:
     for side in ['Left','Right']:
      include=np.array([name in [side+'Foot',side+'ToeBase'] for name in names])
      side_masks[side]=(include[ji]*weights).sum(axis=1)>=.25
    self.prims.append(dict(name=n.get('name',str(ni)),node=ni,h=h,js=js,ib=ib,w=weights,ji=ji,side_masks=side_masks))
    self.stats.append(dict(name=n.get('name'),vertices=len(pos),triangles=int(j['accessors'][p['indices']]['count']/3) if 'indices'in p else len(pos)//3,weightSumMaxError=float(abs(weights.sum(axis=1)-1).max()) if skin else 0,minWeight=float(weights.min()) if skin else None,invalidJoints=int(((ji<0)|(ji>=len(js))).sum()) if skin else None))
