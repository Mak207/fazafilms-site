"""Record qualified v43 gait evidence from the actual exhibition.

The numeric report supplies the exact freeze and trajectory. Each view is
continuous at 30 fps / fixed 1/60 s simulation; browser segments are stitched
only after their first pose matches the saved trajectory. Background animation
is frozen. The follow camera translates with the actor, with world orientation
fixed. This is not a real-time performance benchmark.
"""
import argparse
import functools
import hashlib
import http.server
import io
import json
import math
from pathlib import Path
import runpy
import shutil
import subprocess
import threading
import time
import traceback

from PIL import Image, ImageStat
from playwright.sync_api import sync_playwright


CAMERA = """o=>{const q=__EXHIBITION_VISITOR_QA__;let p,t;
if(o.actor){const a=q.refs.updateWalkers.describe().find(a=>a.id===o.actor);p=[a.holder.position.x+o.offset[0],o.height,a.holder.position.z+o.offset[1]];t=[a.holder.position.x,.9,a.holder.position.z];}
else{p=o.position;t=o.target;}q.setCamera(p,t,o.fov);q.render();
const rect=q.refs.renderer.domElement.getBoundingClientRect();let label=document.getElementById('__gait_proof_label');if(!label){label=document.createElement('div');label.id='__gait_proof_label';document.body.append(label);}
Object.assign(label.style,{position:'fixed',left:(rect.left+rect.width*.14)+'px',top:(rect.top+14)+'px',maxWidth:(rect.width*.72)+'px',padding:'8px 12px',background:'rgba(12,24,34,.85)',color:'white',font:'14px/1.35 sans-serif',borderRadius:'8px',zIndex:9999,pointerEvents:'none'});
label.textContent=o.label+' · t='+q.time.toFixed(2)+' s';return{position:p,target:t,quaternion:q.refs.camera.quaternion.toArray(),fov:o.fov,time:q.time};}"""

HEALTH = """()=>({lost:__EXHIBITION_VISITOR_QA__.refs.renderer.getContext().isContextLost(),events:window.__QA_WEBGL_EVENTS__})"""


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def image_variance(data):
    im = Image.open(io.BytesIO(data)).convert('RGB')
    w, h = im.size
    crop = im.crop((w//10, h//10, 9*w//10, 9*h//10))
    score = sum(ImageStat.Stat(crop).stddev)/3
    if score < 8:
        raise RuntimeError(f'Near-blank capture: central RGB stddev={score:.3f}')
    return {'width':w,'height':h,'centralRgbStddev':score}


def compare_pose(actual, expected):
    errors=[]
    for row in actual['actors']:
        wanted=next(x for x in expected['actors'] if x['id']==row['id'])
        if row['state'] != wanted['state']:
            raise RuntimeError(f"State continuity mismatch: {row['id']}")
        errors.append(math.dist(row['holderPosition'],wanted['holderPosition']))
        for side in ('Left','Right'):
            for bone in ('hip','knee','foot','toe'):
                errors.append(math.dist(row['feet'][side][bone],wanted['feet'][side][bone]))
        for action in ('walk','idle'):
            errors.append(abs(row[action]['time']-wanted[action]['time']))
    result=max(errors,default=0)
    if result>1e-7:
        raise RuntimeError(f'Segment trajectory continuity mismatch {result}')
    return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo',type=Path,required=True)
    parser.add_argument('--reference-report',type=Path,required=True)
    parser.add_argument('--evidence',type=Path,required=True)
    args=parser.parse_args()
    args.evidence.mkdir(parents=True,exist_ok=True)
    repo=args.repo.resolve();exhibit=repo/'review/exhibition-25-years'
    reference=json.loads(args.reference_report.read_text('utf-8'))
    samples=json.loads((args.reference_report.parent/'desktop-samples.json').read_text('utf-8'))
    expected_hashes=reference['sourceHashes']
    assert all(sha(exhibit/name)==value for name,value in expected_hashes.items()),'Source freeze changed'
    probe=runpy.run_path(str(Path(__file__).with_name('qa_integrated_gait.py')))['INSTALL_PROBE']
    ffmpeg=shutil.which('ffmpeg')
    if not ffmpeg:raise RuntimeError('ffmpeg is required')
    report={'scope':'Actual exhibition, ordinary production asset URLs','fps':30,'fixedStepSeconds':1/60,
      'seed':reference['seed'],'backgroundAnimationFrozen':True,'realTimePerformanceClaim':False,
      'coverage':'Overview excerpt and one continuous complete turn/walk/stop journey for each actor; gesture demos disabled',
      'sourceHashes':expected_hashes,'recorderSha256':sha(Path(__file__)),
      'probeSha256':sha(Path(__file__).with_name('qa_integrated_gait.py')),
      'referenceReport':'../final-freeze-45s-valid/integrated-gait-report.json',
      'numericalAcceptance':'Qualified: bounded residual penetration <1.6 mm in four Emma frames; strict zero-cap gate remains failed',
      'segments':[],'mobileCaptures':[],'errors':[]}
    views=[{'id':'overview','actor':None,'label':'Обзор · реальная выставка','start':334,'end':694,
      'position':[0,4.85,16],'target':[0,1.08,.9],'fov':42,'cameraMode':'Original desktop overview, fixed world position and direction'}]
    for actor,offset,height,fov in [('emma',[0,-1.5],1.9,65),('ethan',[-2,0],1.9,55)]:
        events=reference['viewports']['desktop']['summary'][actor]['events']
        turn=next(x for x in events if x['state']=='turn')
        walk=next(x for x in events if x['state']=='walk' and x['frame']>turn['frame'])
        stop=next(x for x in events if x['state']=='observe' and x['frame']>walk['frame'])
        start=max(0,(turn['frame']-30)//2*2);end=math.ceil((stop['frame']+60)/2)*2
        views.append({'id':actor,'actor':actor,'label':actor.title()+' · поворот → ходьба → остановка','start':start,'end':end,
          'offset':offset,'height':height,'fov':fov,'cameraMode':'Camera position follows holder; viewing direction fixed in world coordinates'})
    report['views']=views
    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*unused):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(repo)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    url=f'http://127.0.0.1:{server.server_port}/review/exhibition-25-years/?visitorQA=1&visitorSeed={reference["seed"]}&visitorDemoEvery=9999'

    def init_page(browser,viewport):
        page=browser.new_page(viewport=viewport,device_scale_factor=1)
        errors=[];messages=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:messages.append({'type':m.type,'text':m.text}) if m.type in ('error','warning') else None)
        page.goto(url,wait_until='domcontentloaded',timeout=90000)
        page.wait_for_function('window.__EXHIBITION_VISITOR_QA__',timeout=90000)
        page.evaluate('__EXHIBITION_VISITOR_QA__.ready()')
        page.evaluate("""()=>{const q=__EXHIBITION_VISITOR_QA__;q.pause();q.refs.renderer.setAnimationLoop(null);window.__QA_WEBGL_EVENTS__=[];for(const n of ['webglcontextlost','webglcontextrestored'])q.refs.renderer.domElement.addEventListener(n,()=>__QA_WEBGL_EVENTS__.push(n));}""")
        page.locator('#exhibitionCanvas').scroll_into_view_if_needed()
        metadata=page.evaluate(probe)
        return page,errors,messages,metadata

    def capture(page,view):
        camera=page.evaluate(CAMERA,view)
        health=page.evaluate(HEALTH)
        if health['lost'] or health['events']:raise RuntimeError('WebGL context loss; stop recorder')
        data=page.locator('#exhibitionCanvas').screenshot(type='png')
        return data,camera,image_variance(data)

    try:
        with sync_playwright() as pw:
            for view in views:
                for start in range(view['start'],view['end'],240):
                    end=min(start+240,view['end'])
                    assert all(sha(exhibit/n)==v for n,v in expected_hashes.items()),'Source freeze changed during recording'
                    browser=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True,args=['--enable-unsafe-swiftshader'])
                    entry={'view':view['id'],'startFrame':start,'endFrameExclusive':end,'physicalDurationSeconds':(end-start)/60,'frameCount':0}
                    started=time.monotonic();proc=None
                    try:
                        page,errors,messages,metadata=init_page(browser,{'width':1440,'height':1000})
                        actual=page.evaluate('n=>__INTEGRATED_GAIT_PROBE__.replay(n)',start)
                        entry['firstPoseMaxDifferenceFromReference']=compare_pose(actual,samples[start])
                        first,camera,variance=capture(page,view)
                        prefix=f'{view["id"]}-{start:04d}-{end:04d}'
                        (args.evidence/(prefix+'-first.png')).write_bytes(first)
                        entry.update({'firstImage':prefix+'-first.png','firstCamera':camera,'firstImageQuality':variance})
                        target=args.evidence/(prefix+'.mp4')
                        command=[ffmpeg,'-y','-loglevel','error','-f','image2pipe','-vcodec','png','-framerate','30','-i','-','-an','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','-crf','21','-movflags','+faststart',str(target)]
                        proc=subprocess.Popen(command,stdin=subprocess.PIPE,stderr=subprocess.PIPE)
                        first_quaternion=camera['quaternion'];max_orientation_delta=0;minimum_variance=variance['centralRgbStddev']
                        for frame in range(start,end,2):
                            if frame==start:data=first
                            else:
                                page.evaluate('()=>{const q=__EXHIBITION_VISITOR_QA__;q.step(1/60,{render:false});q.step(1/60,{render:false});}')
                                data,camera,quality=capture(page,view)
                                minimum_variance=min(minimum_variance,quality['centralRgbStddev'])
                                dot=abs(sum(a*b for a,b in zip(first_quaternion,camera['quaternion'])))
                                max_orientation_delta=max(max_orientation_delta,2*math.acos(min(1,dot)))
                            proc.stdin.write(data);entry['frameCount']+=1
                            if frame==start+((end-start)//4)*2:
                                name=prefix+'-middle.png';(args.evidence/name).write_bytes(data);entry['middleImage']=name
                        proc.stdin.close();stderr=proc.stderr.read().decode('utf-8',errors='replace');code=proc.wait()
                        if code:raise RuntimeError(stderr)
                        (args.evidence/(prefix+'-last.png')).write_bytes(data)
                        entry.update({'lastImage':prefix+'-last.png','lastCamera':camera,'maxCameraOrientationChangeDegrees':math.degrees(max_orientation_delta),'minimumCentralRgbStddev':minimum_variance,
                          'video':target.name,'bytes':target.stat().st_size,'sha256':sha(target),'pageErrors':errors,'console':messages,'webglHealth':page.evaluate(HEALTH)})
                        if errors or entry['webglHealth']['lost'] or entry['webglHealth']['events']:raise RuntimeError('Invalid rendered segment')
                    finally:
                        if proc and proc.poll() is None:proc.kill()
                        browser.close()
                    entry['wallSeconds']=round(time.monotonic()-started,2);report['segments'].append(entry)
                    (args.evidence/'recording-progress.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
                    print(json.dumps({'segment':entry['video'],'frames':entry['frameCount'],'wallSeconds':entry['wallSeconds'],'poseError':entry['firstPoseMaxDifferenceFromReference'],'context':'healthy'},ensure_ascii=False),flush=True)
            # Actual 390 px UI and a close 3D view; no extra 45-second run.
            browser=pw.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True,args=['--enable-unsafe-swiftshader'])
            try:
                page,errors,messages,metadata=init_page(browser,{'width':390,'height':844})
                actual=page.evaluate('n=>__INTEGRATED_GAIT_PROBE__.replay(n)',600)
                pose_error=compare_pose(actual,samples[600])
                mobile_views=[{'id':'mobile-overview','actor':None,'label':'390 px · обзор','position':[0,4.55,17],'target':[0,1,1.2],'fov':42},
                  {'id':'mobile-ethan','actor':'ethan','label':'390 px · Ethan','offset':[-2,0],'height':1.9,'fov':55}]
                for view in mobile_views:
                    data,camera,quality=capture(page,view);name=view['id']+'.png';(args.evidence/name).write_bytes(data)
                    ui=page.screenshot();ui_name=view['id']+'-ui.png';(args.evidence/ui_name).write_bytes(ui)
                    report['mobileCaptures'].append({'file':name,'uiFile':ui_name,'viewport':{'width':390,'height':844},'camera':camera,'imageQuality':quality,'poseDifference':pose_error,'health':page.evaluate(HEALTH)})
                report['mobileErrors']=errors;report['mobileConsole']=messages
            finally:browser.close()
        concat=args.evidence/'segments.txt'
        concat.write_text(''.join("file '"+s['video']+"'\n" for s in report['segments']),encoding='utf-8')
        final=args.evidence/'exhibition-v43-gait-proof.mp4'
        subprocess.run([ffmpeg,'-y','-loglevel','error','-f','concat','-safe','0','-i',str(concat),'-c','copy','-movflags','+faststart',str(final)],check=True)
        report['finalVideo']={'file':final.name,'bytes':final.stat().st_size,'sha256':sha(final),'fps':30,'frames':sum(s['frameCount'] for s in report['segments']),'durationSeconds':sum(s['frameCount'] for s in report['segments'])/30}
        report['sourceHashesAfter']={n:sha(exhibit/n) for n in expected_hashes}
        report['sourcesUnchanged']=report['sourceHashesAfter']==expected_hashes
        report['success']=report['sourcesUnchanged'] and not report.get('mobileErrors')
    except Exception as exc:
        report['success']=False;report['errors'].append(str(exc));report['traceback']=traceback.format_exc();print(report['traceback'],flush=True)
    finally:
        server.shutdown();(args.evidence/'video-proof-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'success':report.get('success'),'finalVideo':report.get('finalVideo'),'report':str(args.evidence/'video-proof-report.json'),'errors':report['errors']},ensure_ascii=False),flush=True)
    raise SystemExit(0 if report.get('success') else 1)


if __name__=='__main__':
    main()
