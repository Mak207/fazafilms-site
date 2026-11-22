import pathlib,json,threading,http.server,functools,traceback,time,base64,hashlib,subprocess,shutil,argparse,urllib.parse
# Requires Python3, Playwright, Pillow and ffmpeg. Uses installed browsers only.
from PIL import Image,ImageDraw,ImageFont
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser(description="Capture frozen visitors-v44 renderer at normal scene tempo; not an FPS benchmark.")
parser.add_argument('--repo',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[4])
parser.add_argument('--output',type=pathlib.Path,default=pathlib.Path.cwd()/'v44-final-review')
parser.add_argument('--browser',type=pathlib.Path)
parser.add_argument('--expected-runtime-sha',default='bccc1feea2548202027e98de18c65f8aa5f93acefe704817f742eff724bdfab6')
options=parser.parse_args()
R=options.repo.resolve();P=R.parent;E=R/'review/exhibition-25-years';D=options.output.resolve();D.mkdir(parents=True,exist_ok=True)
assert hashlib.sha256((E/'visitors-v44.js').read_bytes()).hexdigest()==options.expected_runtime_sha
edge=pathlib.Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')
browser_path=options.browser or (edge if edge.exists() else None)
launch_options={'headless':True,'args':['--enable-unsafe-swiftshader']}
if browser_path:launch_options['executable_path']=str(browser_path)
ffmpeg=shutil.which('ffmpeg');assert ffmpeg,'ffmpeg missing'
class QuietHandler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(P)))
thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
url='http://127.0.0.1:'+str(server.server_address[1])+'/' + urllib.parse.quote(R.name) + '/review/exhibition-25-years/?zone=technology&camera=overview&mode=film&visitorQA=1&visitorSeed=20261122&visitorDemoEvery=9999'
report={'started':time.time(),'url':url,'inputSha256':{n:hashlib.sha256((E/n).read_bytes()).hexdigest() for n in ['visitors-v44.js','visitor-motion-v43.js','ready-crowd-v1.js','index.html','exhibition-3d.js']},'pageErrors':[],'frames':{},'snapshots':[],'sections':[],'scope':'Deterministic simulation at60Hz encoded30fps, 1x scene tempo. This is not browser performance/FPS measurement. Geometry and native joint clips unchanged.'}
encoders={};encoder_logs={};windows=[('emma-side','emma','side',13,21),('emma-front','emma','front',13,21),('ethan-side','ethan','side',17,25),('ethan-front','ethan','front',17,25)]
def label(name,text):
 im=Image.new('RGBA',(1280,720),(0,0,0,0));dr=ImageDraw.Draw(im);f=ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf',25);small=ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf',17)
 dr.rectangle((0,0,1280,48),fill=(12,15,17,225));dr.text((20,10),text,font=f,fill=(245,245,241,255))
 dr.rectangle((0,690,1280,720),fill=(12,15,17,205));dr.text((20,696),'v44 · готовый DetourCrowd + исходные клипы · темп 1× · запись симуляции, не тест FPS',font=small,fill=(215,220,220,255))
 path=D/(name+'-label.png');im.save(path);return path
def start_encoder(name,title):
 overlay=label(name,title);log=(D/(name+'-encode.log')).open('wb');encoder_logs[name]=log
 args=[ffmpeg,'-y','-loglevel','error','-f','image2pipe','-framerate','30','-vcodec','mjpeg','-i','pipe:0','-loop','1','-framerate','30','-i',str(overlay),'-filter_complex','[0:v][1:v]overlay=0:0:shortest=1','-an','-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-threads','2','-movflags','+faststart',str(D/(name+'.mp4'))]
 encoders[name]=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=log)
 report['frames'][name]=0
def put(name,data):
 encoders[name].stdin.write(base64.b64decode(data.split(',',1)[1]));report['frames'][name]+=1
def finish_encoders():
 for name,proc in encoders.items():
  if proc.stdin and not proc.stdin.closed:proc.stdin.close()
 for name,proc in encoders.items():
  try:code=proc.wait(timeout=25)
  except subprocess.TimeoutExpired:proc.terminate();code=proc.wait(timeout=5)
  encoder_logs[name].close()
  report.setdefault('encoderResults',{})[name]={'exitCode':code,'frames':report['frames'][name]}
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(**launch_options)
  try:
   page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
   page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
   page.goto(url,wait_until='domcontentloaded',timeout=25000)
   page.wait_for_function('Boolean(window.__EXHIBITION_VISITOR_QA__)',timeout=20000)
   page.evaluate('async()=>{await Promise.race([__EXHIBITION_VISITOR_QA__.ready(),new Promise((_,r)=>setTimeout(()=>r(new Error("ready timeout")),30000))]);}')
   try:page.wait_for_load_state('networkidle',timeout=15000);report['networkIdleBeforeCapture']=True
   except Exception:report['networkIdleBeforeCapture']=False
   initial=page.evaluate("""()=>{
    const q=__EXHIBITION_VISITOR_QA__;q.pause();q.refs.renderer.setAnimationLoop(null);q.reset();
    q.refs.renderer.setPixelRatio(1);q.refs.renderer.setSize(1280,720,false);q.refs.camera.aspect=1280/720;q.refs.camera.updateProjectionMatrix();
    const overview=[[-5.7,3.2,6.8],[0,.9,-.8],55];
    function setCamera(v){q.setCamera(v[0],v[1],v[2]);q.refs.camera.aspect=1280/720;q.refs.camera.updateProjectionMatrix();}
    function closeCamera(id,view){
     const a=q.refs.updateWalkers.describe().find(a=>a.id===id),pos=a.holder.position,THREE=q.refs.THREE;
     const f=new THREE.Vector3(0,0,1).applyQuaternion(a.holder.quaternion),d=view==='front'?f:new THREE.Vector3(f.z,0,-f.x);
     if(view==='side'&&d.x>0)d.multiplyScalar(-1);
     return[[pos.x+d.x*3.15,1.6,pos.z+d.z*3.15],[pos.x,.92,pos.z],39];
    }
    window.__RENDER_REVIEW__={q,overview,setCamera,closeCamera};setCamera(overview);q.render();
    return{image:q.refs.renderer.domElement.toDataURL('image/jpeg',.94),snapshot:q.snapshot(),overview};
   }""")
   (D/'initial-render.jpg').write_bytes(base64.b64decode(initial.pop('image').split(',',1)[1]))
   report['initial']=initial;report['cameraConfig']={'overview':initial['overview'],'geometryHidden':False}
   print(json.dumps({'captureStarted':True,'runtimeSha256':options.expected_runtime_sha,'output':str(D)}),flush=True)
   start_encoder('overview','Общий вид · 1× · 120 с непрерывно')
   for name,id,view,start,end in windows:start_encoder(name,('Посетительница' if id=='emma' else 'Посетитель')+' · '+('сбоку' if view=='side' else 'спереди')+' · 1× · время сцены '+str(start)+'–'+str(end)+' с')
   for frame in range(3600):
    t=(frame+1)/30
    active=[(name,id,view) for name,id,view,start,end in windows if start<t<=end]
    result=page.evaluate("""args=>{
     const r=__RENDER_REVIEW__,q=r.q;q.step(1/60,{render:false});q.step(1/60,{render:false});
     r.setCamera(r.overview);q.render();const images={overview:q.refs.renderer.domElement.toDataURL('image/jpeg',.94)};
     for(const [name,id,view] of args.active){r.setCamera(r.closeCamera(id,view));q.render();images[name]=q.refs.renderer.domElement.toDataURL('image/jpeg',.94);}
     const s=q.snapshot();return{time:s.time,images,snapshot:args.checkpoint||s.errors.length?s:null,errors:s.errors,states:s.actors.map(a=>[a.id,a.state,a.completedJourneys])};
    }""",{'active':active,'checkpoint':(frame+1)%150==0})
    for name,data in result['images'].items():put(name,data)
    if result['snapshot']:
     report['snapshots'].append(result['snapshot'])
     print(json.dumps({'time':result['time'],'states':result['states'],'errors':result['errors'],'renderedFrames':frame+1}),flush=True)
    if (frame+1) in [1,420,424,535,555,620,745,1800,2700,3090,3300,3600]:
     for name,data in result['images'].items():(D/('frame-'+str(frame+1).zfill(5)+'-'+name+'.jpg')).write_bytes(base64.b64decode(data.split(',',1)[1]))
    if result['errors'] or any(a[1]=='failed' for a in result['states']):
     report['failureAt']=result['time'];report['failureSnapshot']=result['snapshot'] or page.evaluate('()=>__RENDER_REVIEW__.q.snapshot()');break
   report['final']=page.evaluate('()=>__RENDER_REVIEW__.q.snapshot()')
  finally:browser.close()
except Exception as e:report['error']=str(e);report['traceback']=traceback.format_exc();print(report['traceback'],flush=True)
finally:
 finish_encoders();server.shutdown();server.server_close();thread.join(timeout=3)
 report['finished']=time.time();report['browserClosed']=True;report['ownedServerClosed']=True
 for n,count in report['frames'].items():
  f=D/(n+'.mp4')
  if f.exists():report.setdefault('media',{})[n]={'path':str(f),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'seconds':count/30,'fps':30}
 if not report.get('error') and not report.get('failureAt') and report['frames'].get('overview')==3600 and all(v['exitCode']==0 for v in report.get('encoderResults',{}).values()):
  order=['overview']+[w[0] for w in windows]
  concat=D/'sections-concat.txt';concat.write_text(''.join("file '"+n+".mp4'\n" for n in order),encoding='utf8')
  final_path=D/'avatar-v44-review-bccc-120s-and-close.mp4'
  subprocess.run([ffmpeg,'-y','-loglevel','error','-f','concat','-safe','0','-i',str(concat),'-c','copy','-movflags','+faststart',str(final_path)],check=True,timeout=60)
  offset=0
  for name in order:
   duration=report['frames'][name]/30
   scene=[0,120] if name=='overview' else list(next(w[3:5] for w in windows if w[0]==name))
   report['sections'].append({'name':name,'videoStart':offset,'videoEnd':offset+duration,'sceneTime':scene,'tempo':1,'continuous':True})
   offset+=duration
  report['finalMedia']={'path':str(final_path),'bytes':final_path.stat().st_size,'sha256':hashlib.sha256(final_path.read_bytes()).hexdigest(),'seconds':offset,'fps':30}
 (D/'render-review-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
 print(json.dumps({'seconds':report['finished']-report['started'],'failureAt':report.get('failureAt'),'error':report.get('error'),'pageErrors':report['pageErrors'],'media':report.get('media'),'finalMedia':report.get('finalMedia'),'browserClosed':True,'ownedServerClosed':True}),flush=True)
