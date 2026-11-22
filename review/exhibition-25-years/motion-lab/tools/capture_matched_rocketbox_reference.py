import pathlib,json,threading,http.server,functools,time,base64,hashlib,subprocess,shutil,argparse,urllib.parse,traceback,math
from PIL import Image,ImageDraw,ImageFont
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser(description='Capture isolated common-reference source sequence, not production/Crowd.')
parser.add_argument('--repo',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[4])
parser.add_argument('--output',type=pathlib.Path,required=True)
opt=parser.parse_args();R=opt.repo.resolve();E=R/'review/exhibition-25-years';D=opt.output.resolve();D.mkdir(parents=True,exist_ok=True)
S=E/'motion-lab/prototypes/matched-rocketbox'
frozen='bccc1feea2548202027e98de18c65f8aa5f93acefe704817f742eff724bdfab6'
assert hashlib.sha256((E/'visitors-v44.js').read_bytes()).hexdigest()==frozen
assert hashlib.sha256((S/'replay.mjs').read_bytes()).hexdigest()=='f28f22b0f58cc54be4c63faf357385b7ed0ede642a9eee8682bbd16649969eca'
ffmpeg=shutil.which('ffmpeg');assert ffmpeg
class Handler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(R)))
threading.Thread(target=server.serve_forever,daemon=True).start()
url='http://127.0.0.1:'+str(server.server_address[1])+'/review/exhibition-25-years/motion-lab/prototypes/matched-rocketbox/replay.html'
report={'scope':'Isolated source-only Idle(last1s)-Start-Walk x2-Stop-Idle(first1s), 1x simulation time, 30fps renderer export; not production or performance test. No blend, no Crowd, no IK, no per-frame floor correction. Camera follows hips XZ; grid stationary. Female authored 13.835mm seam is preserved.',
 'inputSha256':{},'sourcePlayerSha256':'f28f22b0f58cc54be4c63faf357385b7ed0ede642a9eee8682bbd16649969eca','frozenV44Sha256':frozen,'sections':[],'errors':[]}
for f in [S/'replay.html',S/'replay.mjs',*sorted((S/'outputs').glob('*.glb')),*sorted(S.glob('*manifest.json'))]:
 report['inputSha256'][str(f.relative_to(E))]=hashlib.sha256(f.read_bytes()).hexdigest()
font=ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf',22);small=ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf',17)
encoder=None;log=None;offset=0;contact_frames=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True,args=['--enable-unsafe-swiftshader'])
  try:
   page=browser.new_page(viewport={'width':1280,'height':720},device_scale_factor=1)
   page.on('pageerror',lambda e:report['errors'].append(str(e)))
   page.goto(url,wait_until='domcontentloaded',timeout=20000)
   page.wait_for_function('Boolean(window.__MATCHED_REPLAY)',timeout=15000)
   page.evaluate('async()=>await Promise.race([__MATCHED_REPLAY.ready,new Promise((_,r)=>setTimeout(()=>r(Error("ready timeout")),25000))])')
   print(json.dumps({'ready':True,'output':str(D)}),flush=True)
   for person,view in [('emma','side'),('emma','front'),('ethan','side'),('ethan','front')]:
    info=page.evaluate('async ({person,view})=>{const a=__MATCHED_REPLAY;const info=await a.setPerson(person);a.setView(view);return info}',{'person':person,'view':view})
    n=math.ceil(info['duration']*30);name=person+'-'+view
    section={'name':name,'videoStart':offset,'videoEnd':offset+n/30,'frames':n,'source':info};report['sections'].append(section)
    label=Image.new('RGBA',(1280,720),(0,0,0,0));dr=ImageDraw.Draw(label)
    dr.rectangle((0,0,1280,48),fill=(15,24,28,238))
    dr.text((20,11),('Emma' if person=='emma' else 'Ethan')+' · '+('сбоку' if view=='side' else 'спереди')+' · готовые Idle → Start → Walk ×2 → Stop → Idle · 1×',font=font,fill=(245,246,241,255))
    dr.rectangle((0,665,1280,720),fill=(15,24,28,225))
    dr.text((20,671),'Исходные ключи и движение корня · без Crowd, смешивания и коррекции стоп',font=small,fill=(235,238,238,255))
    dr.text((20,696),'Отдельный reference; '+('исходный шов правой ноги 13.835 мм сохранён' if person=='emma' else 'не подключён к публичной сцене'),font=small,fill=(225,232,232,255))
    labelpath=D/(name+'-label.png');label.save(labelpath)
    log=(D/(name+'-encode.log')).open('wb')
    encoder=subprocess.Popen([ffmpeg,'-y','-loglevel','error','-f','image2pipe','-framerate','30','-vcodec','mjpeg','-i','pipe:0','-loop','1','-framerate','30','-i',str(labelpath),'-filter_complex','[0:v][1:v]overlay=0:0:shortest=1','-an','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-threads','2','-movflags','+faststart',str(D/(name+'.mp4'))],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=log)
    sample_indices={0,30,36,45,60,75,90,n-1}
    for f in range(n):
     t=min(f/30,info['duration'])
     result=page.evaluate('t=>{const a=__MATCHED_REPLAY,s=a.seekTime(t);return {state:s,image:a.canvas.toDataURL("image/jpeg",.94)}}',t)
     data=base64.b64decode(result['image'].split(',',1)[1]);encoder.stdin.write(data)
     if f in sample_indices:
      imagepath=D/(name+'-f'+str(f).zfill(4)+'.jpg');imagepath.write_bytes(data)
      report.setdefault('samples',[]).append({'path':str(imagepath),'state':result['state']})
     if f==0:print(json.dumps({'section':name,'frames':n,'sourceDuration':info['duration'],'floorY':info['floorY']}),flush=True)
    encoder.stdin.close();code=encoder.wait(timeout=20);log.close();encoder=None;log=None;assert code==0
    offset+=n/30
    print(json.dumps({'sectionFinished':name,'seconds':offset}),flush=True)
  finally:browser.close()
 concat=D/'concat.txt';concat.write_text(''.join("file '"+x['name']+".mp4'\n" for x in report['sections']),encoding='utf-8')
 final=D/'matched-rocketbox-source-reference.mp4'
 subprocess.run([ffmpeg,'-y','-loglevel','error','-f','concat','-safe','0','-i',str(concat),'-c','copy','-movflags','+faststart',str(final)],check=True,timeout=30)
 report['video']={'path':str(final),'bytes':final.stat().st_size,'sha256':hashlib.sha256(final.read_bytes()).hexdigest(),'durationSeconds':offset,'fps':30}
 report['probe']=json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=codec_name,width,height,r_frame_rate,nb_read_frames:format=duration,size','-of','json',str(final)],timeout=20))
 # Review sampled Start/Walk/Stop boundaries at full-body scale, not a substitute for contact metrics.
 tiles=[]
 for person,view in [('emma','side'),('emma','front'),('ethan','side'),('ethan','front')]:
  for f in [30,45,60,90]:
   im=Image.open(D/(person+'-'+view+'-f'+str(f).zfill(4)+'.jpg')).resize((400,225))
   dr=ImageDraw.Draw(im);dr.rectangle((0,0,400,25),fill='#17272c');dr.text((5,3),person+' '+view+' t='+str(f/30),font=small,fill='white');tiles.append(im)
 sheet=Image.new('RGB',(1600,900),'white')
 for i,im in enumerate(tiles):sheet.paste(im,((i%4)*400,(i//4)*225))
 sheet.save(D/'source-sequence-contact-sheet.jpg',quality=94)
 report['status']='captured';print(json.dumps({'completed':report['video'],'errors':report['errors']}),flush=True)
except Exception:
 report['status']='failed';report['exception']=traceback.format_exc();print(report['exception'],flush=True)
finally:
 if encoder:
  try:encoder.stdin.close();encoder.wait(timeout=10)
  except Exception:encoder.terminate()
 if log and not log.closed:log.close()
 server.shutdown();server.server_close()
 report['ownedProcessesClosed']=True;report['frozenV44Sha256After']=hashlib.sha256((E/'visitors-v44.js').read_bytes()).hexdigest()
 (D/'reference-capture-manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
