"""Run the real GLB/Three.js lab in headless Edge; evidence stays outside git."""
from pathlib import Path
import argparse
import functools
import http.server
import json
import threading
import traceback
from playwright.sync_api import sync_playwright

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', required=True, type=Path)
    parser.add_argument('--evidence', required=True, type=Path)
    parser.add_argument('--scenario', default='basic')
    args = parser.parse_args()
    args.evidence.mkdir(parents=True, exist_ok=True)
    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args): pass
    handler = functools.partial(Handler, directory=str(args.repo))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/review/exhibition-25-years/motion-lab/'
    report = {'scenario': args.scenario, 'url': url, 'errors': [], 'console': [], 'checks': {}}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', headless=True, args=['--enable-unsafe-swiftshader'])
            page = browser.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
            page.on('pageerror', lambda err: report['errors'].append(str(err)))
            page.on('console', lambda msg: report['console'].append({'type': msg.type, 'text': msg.text}) if msg.type in ('error', 'warning') else None)
            page.goto(url, wait_until='networkidle', timeout=60000)
            page.wait_for_function('window.motionLab?.isReady()', timeout=90000)
            report['checks']['initial'] = page.evaluate('motionLab.snapshot({allBones:false})')
            page.evaluate("motionLab.setClip('Idle'); motionLab.seek(1); motionLab.setView('front')")
            page.screenshot(path=str(args.evidence/'01-native-idle.png'), full_page=True)
            page.evaluate("motionLab.setClip('Wave'); motionLab.setPhase(0.45); motionLab.setView('front')")
            page.screenshot(path=str(args.evidence/'02-native-wave.png'), full_page=True)
            report['checks']['nativeWave'] = page.evaluate('motionLab.snapshot()')
            report['checks']['retarget'] = page.evaluate("""async () => {
                const module = await import('./retarget-experiment.js');
                return await module.installRetargetedClips(motionLab);
            }""")
            for actor in ('emma', 'ethan'):
                page.evaluate("""async actor => {
                    await motionLab.load([actor+'-source',actor+'-current']);
                    motionLab.setClip({[actor+'-source']:'Wave',[actor+'-current']:'UPF · Wave'});
                    motionLab.setPhase(.45); motionLab.setView('front');
                }""", actor)
                page.screenshot(path=str(args.evidence/f'03-{actor}-retarget-wave.png'), full_page=True)
                report['checks'][actor+'Wave'] = page.evaluate('motionLab.snapshot()')
                # Sample the complete clips at normalised phases for finite transforms and leg-length stability.
                report['checks'][actor+'Samples'] = page.evaluate("""() => {
                    const rows=[];
                    for (const clip of ['Idle','Wave','Walk']) {
                        const ids=motionLab.activeIds;
                        motionLab.setClip({[ids[0]]:clip,[ids[1]]:'UPF · '+clip});
                        for(let frame=0;frame<=60;frame++) {
                            motionLab.setPhase(frame/60);
                            rows.push({clip,frame,snapshot:motionLab.snapshot({allBones:false})});
                        }
                    }
                    return rows;
                }""")
            page.set_viewport_size({'width':390,'height':844})
            page.evaluate("motionLab.setClip({'ethan-source':'Wave','ethan-current':'UPF · Wave'}); motionLab.setPhase(.45); motionLab.setView('front')")
            page.screenshot(path=str(args.evidence/'04-mobile-390.png'), full_page=True)
            report['checks']['mobile'] = page.evaluate('({viewport:innerWidth,scroll:document.documentElement.scrollWidth,errors:motionLab.errors})')
            report['checks']['finalErrors'] = page.evaluate('motionLab.errors')
            browser.close()
    except Exception as exc:
        report['exception'] = str(exc)
        report['traceback'] = traceback.format_exc()
    finally:
        server.shutdown()
    target=args.evidence/f'qa-{args.scenario}.json'
    target.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'report':str(target),'exception':report.get('exception'),'errors':report['errors'],'checks':list(report['checks']),'console':report['console'][-12:]},ensure_ascii=False))
    if report.get('exception') or report['errors']: raise SystemExit(1)

if __name__=='__main__': main()
