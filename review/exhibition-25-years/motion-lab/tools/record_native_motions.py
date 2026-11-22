"""Render deterministic animation frames at authored speed and encode a review MP4."""
from pathlib import Path
import argparse,functools,http.server,json,threading,subprocess
from playwright.sync_api import sync_playwright

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--repo',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);a=ap.parse_args();a.output.mkdir(parents=True,exist_ok=True)
 frames=a.output/'native-frames';frames.mkdir(exist_ok=True)
 class Handler(http.server.SimpleHTTPRequestHandler):
  def log_message(self,*args):pass
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(a.repo)));threading.Thread(target=server.serve_forever,daemon=True).start()
 errors=[];fps=24
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True,args=['--enable-unsafe-swiftshader'])
   page=browser.new_page(viewport={'width':1280,'height':720},device_scale_factor=1);page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/review/exhibition-25-years/motion-lab/',wait_until='networkidle');page.wait_for_function('window.motionLab?.isReady() && window.motionExperiments?.isReady()')
   page.evaluate("""async()=>{
    const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');const {MeshoptDecoder}=await import('three/addons/libs/meshopt_decoder.module.js');
    await motionLab.load(['emma-current','ethan-current']);motionLab.pause();motionLab.setLoop(false);
    for(const actor of ['emma','ethan']){const g=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('./assets/'+actor+'-native-motions.glb');motionLab.addClips(actor+'-current',g.animations);}
    const stage=document.getElementById('viewport');Object.assign(stage.style,{position:'fixed',inset:'0',width:'1280px',height:'720px',zIndex:9999,borderRadius:'0'});
    const top=document.createElement('div');top.id='video-top';top.style.cssText='position:absolute;top:20px;left:24px;right:24px;color:#15304c;font:600 22px system-ui;pointer-events:none';top.textContent='Выставочные Emma и Ethan · готовые движения';stage.append(top);
    const bottom=document.createElement('div');bottom.id='video-bottom';bottom.style.cssText='position:absolute;bottom:20px;left:24px;color:#15304c;font:500 20px system-ui;background:#ffffffdc;padding:10px 16px;border-radius:8px;pointer-events:none';stage.append(bottom);
    document.querySelectorAll('.viewport-help,.stage-help,.stage-note').forEach(e=>e.style.display='none');
   }""")
   page.wait_for_timeout(150)
   page.evaluate("""()=>{
    motionLab.setView('front');const r=motionLab.getRuntime('emma-current');r.camera.position.set(0,1.25,4.2);r.camera.lookAt(0,.92,0);r.camera.updateProjectionMatrix();
    if(r.controls){r.controls.target.set(0,.92,0);r.controls.update();}
   }""")
   index=0;segments=[('Idle','Ожидание',4),('Wave','Приветствие',6),('Think','Размышление · фрагмент',5)]
   manifest=[]
   for clip,label,seconds in segments:
    page.evaluate("clip=>{motionLab.setClip('UPF · '+clip);motionLab.seek(0);}",clip)
    start=index
    for frame in range(seconds*fps):
     page.evaluate("data=>{motionLab.seek(data.time);document.getElementById('video-bottom').textContent=data.label+' · 1× · '+data.time.toFixed(2)+' с';}",{'time':frame/fps,'label':label})
     page.screenshot(path=str(frames/f'{index:05d}.png'));index+=1
    manifest.append({'clip':clip,'startFrame':start,'frames':index-start,'speed':1,'source':'baked native clip retargeted to unchanged exhibition mesh'})
    print(json.dumps({'segment':clip,'frames':index}),flush=True)
   browser.close()
 finally:server.shutdown()
 target=a.output/'Avatar_Native_Motions_2026-11-22.mp4'
 command=['ffmpeg','-y','-hide_banner','-loglevel','error','-framerate',str(fps),'-i',str(frames/'%05d.png'),'-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(target)]
 subprocess.run(command,check=True,timeout=90)
 report={'file':str(target),'bytes':target.stat().st_size,'fps':fps,'durationSeconds':index/fps,'segments':manifest,'pageErrors':errors,'renderMode':'deterministic fixed-time frames encoded at authored 1x speed; not a real-time FPS benchmark'}
 (a.output/'native-video.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=True))
 if errors:raise SystemExit(1)

if __name__=='__main__':main()
