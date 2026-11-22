import pathlib,json,threading,http.server,functools,traceback,time,hashlib,argparse,urllib.parse
# Requires Python3 and Playwright; only installed browsers are used.
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser(description="Exact visitors-v44 fixed60Hz FSM120 continuation; no full skin or video export.")
parser.add_argument('--repo',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[4])
parser.add_argument('--output',type=pathlib.Path,default=pathlib.Path.cwd()/'v44-fsm-results')
parser.add_argument('--browser',type=pathlib.Path)
parser.add_argument('--expected-runtime-sha',default='bccc1feea2548202027e98de18c65f8aa5f93acefe704817f742eff724bdfab6')
options=parser.parse_args()
R=options.repo.resolve();P=R.parent;E=R/'review/exhibition-25-years';D=options.output.resolve();D.mkdir(parents=True,exist_ok=True)
assert hashlib.sha256((E/'visitors-v44.js').read_bytes()).hexdigest()==options.expected_runtime_sha
edge=pathlib.Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')
browser_path=options.browser or (edge if edge.exists() else None)
launch_options={'headless':True,'args':['--enable-unsafe-swiftshader']}
if browser_path:launch_options['executable_path']=str(browser_path)
class QuietHandler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(P)))
thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
url='http://127.0.0.1:'+str(server.server_address[1])+'/' + urllib.parse.quote(R.name) + '/review/exhibition-25-years/?zone=technology&camera=overview&mode=film&visitorQA=1&visitorSeed=20261122&visitorDemoEvery=9999'
r={'started':time.time(),'url':url,'inputSha256':{n:hashlib.sha256((E/n).read_bytes()).hexdigest() for n in ['visitors-v44.js','visitor-motion-v43.js','ready-crowd-v1.js']},'pageErrors':[],'snapshots':[],'events':[],'scope':'Exact visitors-v44 FSM 120s continuation, no per-frame skin export or video.'}
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(**launch_options)
  try:
   page=browser.new_page(viewport={'width':1280,'height':720},device_scale_factor=1)
   page.on('pageerror',lambda e:r['pageErrors'].append(str(e)))
   page.goto(url,wait_until='domcontentloaded',timeout=25000)
   page.wait_for_function('Boolean(window.__EXHIBITION_VISITOR_QA__)',timeout=20000)
   page.evaluate('async()=>{const q=__EXHIBITION_VISITOR_QA__;await q.ready();q.pause();q.refs.renderer.setAnimationLoop(null);q.reset();window.__FSM_PREV__=q.snapshot();}')
   for batch in range(24):
    result=page.evaluate("""()=>{
     const q=__EXHIBITION_VISITOR_QA__,events=[],checkpoints=[];let s;
     for(let i=0;i<300;i++){
      q.step(1/60,{render:false});s=q.snapshot();
      for(let j=0;j<s.actors.length;j++){const a=s.actors[j],old=__FSM_PREV__.actors[j];if(a.state!==old.state||a.completedJourneys!==old.completedJourneys)events.push({time:s.time,id:a.id,from:old.state,to:a.state,completedJourneys:a.completedJourneys,nav:a.navigation,world:a.world});}
      if([20,90,96.2,100,110,120].some(t=>Math.abs(s.time-t)<1e-6))checkpoints.push(s);
      window.__FSM_PREV__=s;if(s.errors.length)break;
     }
     return{snapshot:s,events,checkpoints};
    }""")
    r['events'].extend(result['events']);r['snapshots'].extend(result['checkpoints']);r['final']=result['snapshot']
    print(json.dumps({'time':r['final']['time'],'states':[(a['id'],a['state'],a['completedJourneys']) for a in r['final']['actors']],'errors':r['final']['errors'],'yieldReplans':r['final']['diagnostics']['yieldReplans'],'occupiedExitCandidates':r['final']['diagnostics']['occupiedExitCandidates'],'recentHistoryFallbacks':r['final']['diagnostics']['recentHistoryFallbacks'],'egressGrants':r['final']['diagnostics']['egressGrants']}),flush=True)
    if r['final']['errors']:break
  finally:browser.close()
except Exception as e:r['error']=str(e);r['traceback']=traceback.format_exc();print(r['traceback'],flush=True)
finally:
 server.shutdown();server.server_close();thread.join(timeout=3)
 r['finished']=time.time();r['browserClosed']=True;r['ownedServerClosed']=True
 (D/'continuation-report.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf8')
 print(json.dumps({'wallSeconds':r['finished']-r['started'],'pageErrors':r['pageErrors'],'error':r.get('error'),'browserClosed':True,'ownedServerClosed':True}),flush=True)
