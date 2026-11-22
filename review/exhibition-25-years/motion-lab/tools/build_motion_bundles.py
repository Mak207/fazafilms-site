"""Bake UPF clips to compact, mesh-free GLBs and compare decoded playback."""
from pathlib import Path
import argparse,base64,functools,http.server,json,threading,subprocess,hashlib
from playwright.sync_api import sync_playwright

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--repo',type=Path,required=True); ap.add_argument('--data',type=Path,required=True); ap.add_argument('--gltfpack',required=True)
    a=ap.parse_args(); lab=a.repo/'review/exhibition-25-years/motion-lab'; evidence=a.data/'evidence/bundles'; evidence.mkdir(parents=True,exist_ok=True)
    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*args): pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(a.repo)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    result={'errors':[],'actors':{}}
    try:
      with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True,args=['--enable-unsafe-swiftshader'])
        page=browser.new_page(viewport={'width':1440,'height':1000}); page.on('pageerror',lambda e:result['errors'].append(str(e)))
        page.goto(f'http://127.0.0.1:{server.server_port}/review/exhibition-25-years/motion-lab/',wait_until='networkidle')
        page.wait_for_function('window.motionLab?.isReady()')
        result['retarget']=page.evaluate("async()=>await (await import('./retarget-experiment.js')).installRetargetedClips(motionLab)")
        for actor in ('emma','ethan'):
          exported=page.evaluate("async actor=>await (await import('./export-motion-library.js')).exportMotionLibrary(motionLab,actor+'-current')",actor)
          raw=evidence/f'{actor}-motions-raw.glb'; raw.write_bytes(base64.b64decode(exported.pop('base64')))
          target=lab/'assets'/f'{actor}-native-motions.glb'
          cmd=[a.gltfpack,'-i',str(raw),'-o',str(target),'-c','-kn','-noq','-af','0','-ar','16','-at','24','-as','24']
          pack=subprocess.run(cmd,capture_output=True,text=True,timeout=90)
          if pack.returncode: raise RuntimeError(pack.stdout+pack.stderr)
          validation=page.evaluate("""async actor=>{
            const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
            const {MeshoptDecoder}=await import('three/addons/libs/meshopt_decoder.module.js');
            const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('./assets/'+actor+'-native-motions.glb?qa='+Date.now());
            const id=actor+'-current';
            const packed=gltf.animations.map(c=>{const x=c.clone();x.name=x.name.replace('UPF · ','');return x;});
            motionLab.addClips(id,packed,{prefix:'Baked · '});
            let maxPositionM=0,maxAngleRad=0,finite=true,poses=0;
            const details=[];
            const normQ=q=>{const n=Math.hypot(...q);return q.map(x=>x/n);};
            for(const original of gltf.animations){
              const name=original.name.replace('UPF · ','');
              let clipPosition=0,clipAngle=0;
              for(let i=0;i<=20;i++){
                motionLab.setClip('UPF · '+name,[id]);motionLab.setPhase(i/20,[id]);
                const before=motionLab.snapshot({ids:[id]}).models[0].bones;
                motionLab.setClip('Baked · '+name,[id]);motionLab.setPhase(i/20,[id]);
                const after=motionLab.snapshot({ids:[id]}).models[0].bones;
                for(let b=0;b<before.length;b++){
                  if(before[b].name!==after[b].name)throw Error('Bone identity changed');
                  const distance=Math.hypot(...before[b].actorWorld.map((v,j)=>v-after[b].actorWorld[j]));
                  const qa=normQ(before[b].quaternionWorld),qb=normQ(after[b].quaternionWorld);
                  const angle=2*Math.acos(Math.min(1,Math.abs(qa.reduce((s,v,j)=>s+v*qb[j],0))));
                  finite&&=Number.isFinite(distance)&&Number.isFinite(angle);
                  clipPosition=Math.max(clipPosition,distance);clipAngle=Math.max(clipAngle,angle);
                }
                poses++;
              }
              maxPositionM=Math.max(maxPositionM,clipPosition);maxAngleRad=Math.max(maxAngleRad,clipAngle);
              details.push({name,maxPositionM:clipPosition,maxAngleRad:clipAngle,tracks:original.tracks.length});
            }
            let meshCount=0;gltf.scene.traverse(o=>{if(o.isMesh)meshCount++;});
            return {clips:gltf.animations.length,meshCount,finite,poses,maxPositionM,maxAngleRad,details,errors:motionLab.errors};
          }""",actor)
          result['actors'][actor]={'export':exported,'compressedBytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'argv':cmd,'validation':validation}
        page.evaluate("async()=>{await motionLab.load(['emma-current','ethan-current']);motionLab.setClip('Baked · Wave');motionLab.setPhase(.4);motionLab.setView('front');}")
        page.screenshot(path=str(evidence/'baked-wave-current-models.png'),full_page=True)
        browser.close()
    finally: server.shutdown()
    (evidence/'motion-bundle-validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    summary={actor:{'bytes':x['compressedBytes'],**{k:v for k,v in x['validation'].items() if k!='details'}}for actor,x in result['actors'].items()}
    print(json.dumps({'actors':summary,'errors':result['errors']},ensure_ascii=True))
    if result['errors'] or any(not x['validation']['finite'] or x['validation']['maxPositionM']>.002 or x['validation']['clips']!=13 or x['validation']['meshCount']!=0 for x in result['actors'].values()): raise SystemExit(1)

if __name__=='__main__':main()
