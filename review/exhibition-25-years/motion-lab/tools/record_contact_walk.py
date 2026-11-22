"""Record the actual A/B/C contact experiment at physical time, 30 fps."""
from pathlib import Path
import argparse,functools,http.server,json,threading,subprocess
from playwright.sync_api import sync_playwright

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--repo',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);a=ap.parse_args();a.output.mkdir(parents=True,exist_ok=True)
 frames=a.output/'contact-frames';frames.mkdir(exist_ok=True)
 class Handler(http.server.SimpleHTTPRequestHandler):
  def log_message(self,*args):pass
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(a.repo)));threading.Thread(target=server.serve_forever,daemon=True).start()
 errors=[];fps=30;segments=[];index=0
 try:
  with sync_playwright() as p:
   browser=p.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True,args=['--enable-unsafe-swiftshader'])
   page=browser.new_page(viewport={'width':1920,'height':1080},device_scale_factor=1);page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/review/exhibition-25-years/motion-lab/contact-bench.html',wait_until='networkidle');page.wait_for_function('window.contactBench?.isReady',timeout=90000)
   page.evaluate("""()=>{
    contactBench.pause();motionLab.pause();
    const stage=document.getElementById('viewport');Object.assign(stage.style,{position:'fixed',inset:'0',width:'1920px',height:'1080px',zIndex:9999,borderRadius:'0'});
    const top=document.createElement('div');top.id='contact-video-top';top.style.cssText='position:absolute;top:30px;left:36px;right:36px;color:#15304c;font:600 30px system-ui;pointer-events:none';stage.append(top);
    const bottom=document.createElement('div');bottom.id='contact-video-bottom';bottom.style.cssText='position:absolute;bottom:28px;left:36px;color:#15304c;font:500 25px system-ui;background:#ffffffee;padding:12px 18px;border-radius:8px;pointer-events:none';stage.append(bottom);
    document.querySelectorAll('.stage-note').forEach(e=>e.style.display='none');
   }""")
   page.wait_for_timeout(150)
   for actor in ('emma','ethan'):
    page.evaluate("""async actor=>{
     const old=motionLab.getRuntime(motionLab.activeIds[0]);old.camera.fov=40;old.camera.updateProjectionMatrix();
     await contactBench.setup(actor);contactBench.setView('three-quarter');contactBench.reset();motionLab.setDisplay({soles:false,grid:true});
     const r=motionLab.getRuntime(actor+'-raw');r.camera.fov=24;r.camera.updateProjectionMatrix();
     document.getElementById('contact-video-top').textContent='Контакт стоп · '+(actor==='emma'?'Emma · 0,90 м/с':'Ethan · 0,84 м/с');
    }""",actor)
    start=index
    for frame in range(8*fps):
     page.evaluate("""()=>{
      contactBench.step(1/60,{record:false});contactBench.step(1/60,{record:false});
      const s=contactBench.snapshot();document.getElementById('contact-video-bottom').textContent='A: исходный клип   ·   B: FootIK   ·   C: поправка высоты по обуви   |   '+s.time.toFixed(2)+' с';
     }""")
     page.screenshot(path=str(frames/f'{index:05d}.png'));index+=1
    segments.append({'actor':actor,'startFrame':start,'frames':index-start,'physicalSpeedMps':.9 if actor=='emma' else .84,'physicsStepSeconds':1/60})
    print(json.dumps({'actor':actor,'frames':index}),flush=True)
   errors+=page.evaluate('contactBench.errors.concat(motionLab.errors.map(x=>x.message))')
   browser.close()
 finally:server.shutdown()
 target=a.output/'Avatar_Walk_ABC_2026-11-22.mp4'
 subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-framerate',str(fps),'-i',str(frames/'%05d.png'),'-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(target)],check=True,timeout=120)
 report={'file':str(target),'bytes':target.stat().st_size,'fps':fps,'durationSeconds':index/fps,'segments':segments,'pageErrors':errors,'renderMode':'Deterministic 1/60 physics, two steps per 30 fps video frame; physical speed retained; not a real-time FPS benchmark.'}
 (a.output/'contact-video.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=True))
 if errors:raise SystemExit(1)

if __name__=='__main__':main()
