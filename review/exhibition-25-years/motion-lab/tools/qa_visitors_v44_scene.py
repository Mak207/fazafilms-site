import pathlib,json,threading,http.server,functools,traceback,time,gzip,base64,hashlib,argparse,urllib.parse
# Requires Python 3 and Playwright; no browser installation is performed by this probe.
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser(description="Deterministic actual-scene v44 continuity and independent native-mixer probe.")
parser.add_argument('--repo',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[4])
parser.add_argument('--output',type=pathlib.Path,default=pathlib.Path.cwd()/'v44-scene-gate-output')
parser.add_argument('--browser',type=pathlib.Path,help="Installed Chromium/Edge executable; otherwise uses installed Windows Edge or Playwright Chromium")
parser.add_argument('--seconds',type=int,choices=[60,90,120],default=90)
parser.add_argument('--seed',type=int,default=20261122)
options=parser.parse_args()
R=options.repo.resolve();P=R.parent;D=options.output.resolve();D.mkdir(parents=True,exist_ok=True)
edge=pathlib.Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')
browser_path=options.browser or (edge if edge.exists() else None)
launch_options={'headless':True,'args':['--enable-unsafe-swiftshader']}
if browser_path:launch_options['executable_path']=str(browser_path)
class QuietHandler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(P)))
thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
url='http://127.0.0.1:'+str(server.server_address[1])+'/' + urllib.parse.quote(R.name) + '/review/exhibition-25-years/?zone=technology&camera=overview&mode=film&visitorQA=1&visitorSeed='+str(options.seed)+'&visitorDemoEvery=9999'
report={'url':url,'started':time.time(),'pageErrors':[],'requestFailed':[],'batches':[],'scope':str(options.seconds)+' simulated seconds at fixed60Hz, fresh-GLTF independent mixer comparison; diagnostic camera is not artistic acceptance; no performance claim.'}
E=R/'review/exhibition-25-years'
report['inputSha256']={n:hashlib.sha256((E/n).read_bytes()).hexdigest() for n in ['visitors-v44.js','visitor-motion-v43.js','ready-crowd-v1.js','index.html','exhibition-3d.js']}
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(**launch_options)
  try:
   page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
   page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
   page.on('requestfailed',lambda q:report['requestFailed'].append({'url':q.url,'failure':q.failure}))
   page.goto(url,wait_until='domcontentloaded',timeout=25000)
   page.wait_for_function('Boolean(window.__EXHIBITION_VISITOR_QA__)',timeout=20000)
   page.evaluate('async()=>{await Promise.race([__EXHIBITION_VISITOR_QA__.ready(),new Promise((_,r)=>setTimeout(()=>r(new Error("visitor ready timeout")),30000))]);return true;}')
   meta=page.evaluate("""async()=>{
    const q=window.__EXHIBITION_VISITOR_QA__,THREE=q.refs.THREE;
    const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
    const {MeshoptDecoder}=await import('three/addons/libs/meshopt_decoder.module.js');
    const sourceLoader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    q.pause();q.refs.renderer.setAnimationLoop(null);q.reset();
    q.setCamera([0,8.4,12.5],[0,1.1,-1.2],44);
    const actors=q.refs.updateWalkers.describe();
    const references=await Promise.all(actors.map(async actor=>{
      const original=await sourceLoader.loadAsync(new URL('./assets/models/visitors/walking-'+actor.model+'.glb?v=43',location.href).href);
      const rig=original.scene,mixer=new THREE.AnimationMixer(rig),bones={};
      rig.traverse(node=>{if(node.isBone)bones[node.name]=node;});
      return{rig,mixer,bones,actions:new Map()};
    }));
    const affine=[0,1,2,4,5,6,8,9,10,12,13,14],round=x=>Math.round(x*1e7)/1e7;
    const metadata=actors.map(actor=>{
      const meshes=[];actor.rig.traverse(mesh=>{if(mesh.isSkinnedMesh)meshes.push({name:mesh.name,vertexCount:mesh.geometry.getAttribute('position').count,bindMode:mesh.bindMode,bindMatrix:mesh.bindMatrix.toArray(),bindMatrixInverse:mesh.bindMatrixInverse.toArray(),matrixWorld:mesh.matrixWorld.toArray(),boneNames:mesh.skeleton.bones.map(b=>b.name)});});
      return{id:actor.id,model:actor.model,boneNames:Object.values(actor.bones).map(b=>b.name),meshes};
    });
    const totals={maxBoneQuaternionRadians:0,maxBonePositionDelta:0,maxWorldJump:0,maxWalkPhaseDistanceError:0,maxRootPoseAdvanceWithoutApplication:0};
    let previous=q.snapshot();const events=[];
    function capture(){
      const snapshot=q.snapshot(),rows=[];
      const changed=snapshot.actors.filter((a,i)=>a.state!==previous.actors[i].state);
      for(const a of changed){const old=previous.actors.find(b=>b.id===a.id);if((old.state==='turn'&&['walk','yield'].includes(a.state))||(old.state==='yield'&&a.state!=='yield')||(old.state==='walk'&&['observe','waiting','yield','failed'].includes(a.state))){q.render();events.push({time:snapshot.time,id:a.id,from:old.state,to:a.state,image:q.refs.renderer.domElement.toDataURL('image/png')});}}
      actors.forEach((actor,index)=>{
        const ref=references[index];
        for(const action of ref.actions.values())action.setEffectiveWeight(0);
        for(const action of Object.values(actor.motion.actions).filter(Boolean)){
          const clip=action.getClip();let other=ref.actions.get(clip.uuid);
          if(!other){other=ref.mixer.clipAction(clip);other.setLoop(THREE.LoopOnce,1);other.clampWhenFinished=true;other.paused=true;other.enabled=true;other.play();ref.actions.set(clip.uuid,other);}
          other.enabled=action.enabled;other.paused=true;other.time=action.time;other.setEffectiveWeight(action.getEffectiveWeight());
        }
        ref.mixer.update(0);actor.holder.updateWorldMatrix(true,true);actor.holder.updateMatrixWorld(true);
        let maxQ=0,maxP=0;
        for(const bone of Object.values(actor.bones)){
          const expected=ref.bones[bone.name];if(!expected)throw new Error('Reference missing '+bone.name);
          maxQ=Math.max(maxQ,bone.quaternion.clone().normalize().angleTo(expected.quaternion.clone().normalize()));maxP=Math.max(maxP,bone.position.distanceTo(expected.position));
        }
        totals.maxBoneQuaternionRadians=Math.max(totals.maxBoneQuaternionRadians,maxQ);
        totals.maxBonePositionDelta=Math.max(totals.maxBonePositionDelta,maxP);
        const old=previous.actors[index],now=snapshot.actors[index];
        totals.maxWorldJump=Math.max(totals.maxWorldJump,Math.hypot(now.holder.position[0]-old.holder.position[0],now.holder.position[2]-old.holder.position[2]));
        const expectedPhase=((actor.walkDistance/actor.motion.stride)%1+1)%1;
        totals.maxWalkPhaseDistanceError=Math.max(totals.maxWalkPhaseDistanceError,Math.abs(expectedPhase-(actor.motion.snapshot()?.phase||0)));
        rows.push({id:actor.id,state:now.state,phase:now.phase,world:now.world,holder:now.holder,root:now.root,groundingY:actor.grounding.position.y,
          boneQuaternionError:maxQ,bonePositionError:maxP,
          boneWorldAffine:Object.values(actor.bones).map(b=>affine.map(i=>round(b.matrixWorld.elements[i]))),
          pose:actor.motion.snapshot(),turnElapsed:actor.behavior.turnElapsed||0,walkDistance:actor.walkDistance,completedJourneys:actor.behavior.completedJourneys});
      });
      previous=snapshot;
      return{time:snapshot.time,actors:rows,diagnostics:snapshot.diagnostics,errors:snapshot.errors};
    }
    window.__V44_TEST__={q,actors,references,totals,capture,metadata,events};
    return{metadata,initial:capture(),snapshot:q.snapshot()};
   }""")
   (D/'skin-metadata.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
   data=page.evaluate('()=>{const q=__V44_TEST__.q;q.render();return q.refs.renderer.domElement.toDataURL("image/png");}')
   (D/'initial-render.png').write_bytes(base64.b64decode(data.split(',',1)[1]))
   with gzip.open(D/'frames.ndjson.gz','wt',encoding='utf-8') as out:
    out.write(json.dumps(meta['initial'],ensure_ascii=False)+'\n')
    for batch in range(options.seconds//3):
     result=page.evaluate("""()=>{
       const test=window.__V44_TEST__,frames=[];
       for(let i=0;i<180;i++){test.q.step(1/60,{render:false});const f=test.capture();frames.push(f);if(f.errors.length)break;}
       return{frames,events:test.events.splice(0),snapshot:test.q.snapshot(),totals:test.totals};
     }""")
     for event in result.pop('events'):
      event_image=event.pop('image');name='event-'+str(round(event['time']*60)).zfill(5)+'-'+event['id']+'-'+event['from']+'-'+event['to']+'.png'
      (D/name).write_bytes(base64.b64decode(event_image.split(',',1)[1]));event['image']=name
      report.setdefault('events',[]).append(event)
     for frame in result.pop('frames'):out.write(json.dumps(frame,ensure_ascii=False,separators=(',',':'))+'\n')
     report['batches'].append(result)
     print(json.dumps({'time':result['snapshot']['time'],'states':[(a['id'],a['state'],a['completedJourneys']) for a in result['snapshot']['actors']],'errors':result['snapshot']['errors'],'maxFacingLagSeconds':result['snapshot']['diagnostics']['maximumFacingVelocityLagSeconds'],'totals':result['totals']}),flush=True)
     if result['snapshot']['errors']:break
   final=page.evaluate('()=>({snapshot:__V44_TEST__.q.snapshot(),totals:__V44_TEST__.totals})')
   report['final']=final
   data=page.evaluate('()=>{const q=__V44_TEST__.q;q.render();return q.refs.renderer.domElement.toDataURL("image/png");}')
   (D/'final-render.png').write_bytes(base64.b64decode(data.split(',',1)[1]))
  finally:browser.close()
except Exception as e:report['error']=str(e);report['traceback']=traceback.format_exc();print(report['traceback'],flush=True)
finally:
 server.shutdown();server.server_close();thread.join(timeout=3)
 report['finished']=time.time();report['browserClosed']=True;report['ownedServerClosed']=True
 (D/'continuity-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'seconds':report['finished']-report['started'],'pageErrors':report['pageErrors'],'error':report.get('error'),'browserClosed':True,'ownedServerClosed':True}),flush=True)
