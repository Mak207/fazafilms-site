"""Headless real-model contact A/B. Does not edit exhibition/index/main JS."""
from pathlib import Path
import argparse
import functools
import hashlib
import http.server
import json
import threading
import traceback
from playwright.sync_api import sync_playwright


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True, type=Path)
    parser.add_argument('--evidence', required=True, type=Path)
    parser.add_argument('--seconds', type=float, default=8)
    parser.add_argument('--fps', type=int, default=60)
    args = parser.parse_args()
    args.evidence.mkdir(parents=True, exist_ok=True)
    lab = args.repo / 'review/exhibition-25-years/motion-lab'
    watched = [lab / 'index.html', lab / 'motion-lab.js']
    unchanged_before = {p.name: digest(p) for p in watched}
    report = {'scope': 'Same current geometry and same root-motion-derived Walk: A raw, B ready FootIK, C whole-root Y lift control.',
              'seconds_per_actor': args.seconds, 'fps': args.fps,
              'errors': [], 'console': [], 'trials': {}, 'screenshots': [],
              'provenance': {}, 'validation': {}, 'httpFailures': []}
    for rel in ['contact-experiment.js', 'contact-manifest.json', 'contact-bench.html',
                'foot-ik-experiment.js', 'vendor/foot-ik.mjs',
                'assets/emma-native-motions.glb', 'assets/ethan-native-motions.glb',
                '../assets/models/visitors/walking-woman.glb', '../assets/models/visitors/walking-man.glb']:
        p = lab / rel
        report['provenance'][rel] = {'sha256': digest(p), 'bytes': p.stat().st_size}

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *unused):
            pass

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(args.repo)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/review/exhibition-25-years/motion-lab/contact-bench.html'
    report['url'] = url
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
                headless=True, args=['--enable-unsafe-swiftshader'])
            page = browser.new_page(viewport={'width': 1600, 'height': 1120}, device_scale_factor=1)
            page.on('pageerror', lambda e: report['errors'].append(str(e)))
            page.on('console', lambda message: report['console'].append({'type': message.type, 'text': message.text})
                    if message.type in ('error', 'warning') else None)
            page.on('response', lambda response: report['httpFailures'].append({'status': response.status, 'url': response.url})
                    if response.status >= 400 else None)
            page.goto(url, wait_until='networkidle', timeout=60000)
            page.wait_for_function('window.contactBench?.isReady || window.contactBench?.errors?.length', timeout=90000)
            initial = page.evaluate('({ready:contactBench.isReady,errors:contactBench.errors,lab:motionLab.errors})')
            report['validation']['initial'] = initial
            if not initial['ready']:
                raise RuntimeError(f'Contact initialization failed: {initial}')
            candidates = []
            for actor in ('emma', 'ethan'):
                page.evaluate('actor => contactBench.setup(actor)', actor)
                seam = page.evaluate('contactBench.seamCheck()')
                seam_file = args.evidence / f'{actor}-seam-check.json'
                seam_file.write_text(json.dumps(seam, ensure_ascii=False, indent=2), encoding='utf-8')
                print(json.dumps({'actor': actor, 'seamBeforeTrial': {k: v for k, v in seam.items() if k != 'bones'}}, ensure_ascii=False), flush=True)
                trial = page.evaluate('args => contactBench.run(args.seconds,1/args.fps)',
                                      {'seconds': args.seconds, 'fps': args.fps})
                target = args.evidence / f'{actor}-contact-trial.json'
                target.write_text(json.dumps(trial, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
                report['trials'][actor] = {'file': str(target), 'metadata': trial['metadata'], 'summary': trial['summary'],
                                          'seamCheck': {k: v for k, v in seam.items() if k != 'bones'}, 'seamFile': str(seam_file)}
                summary = trial['summary']
                if summary['frames'] != round(args.seconds * args.fps):
                    raise AssertionError(f'{actor}: wrong frame count')
                if summary['preIKParityMaxM'] > 1e-5:
                    raise AssertionError(f'{actor}: A/B pre-IK poses differ')
                if summary['errors'] or summary['labErrors']:
                    raise AssertionError(f'{actor}: runtime errors')
                if summary['validation']['rootSpeedMaxErrorMps'] > 1e-6:
                    raise AssertionError(f'{actor}: physical root speed is wrong')
                if not summary['validation']['continuousAcrossClipWrap']:
                    raise AssertionError(f'{actor}: FootIK state reset during the continuous trial')
                if summary['CControl']['capExceededFrames']:
                    raise AssertionError(f'{actor}: C lift exceeds the fixed 20mm cap')
                if summary['CControl']['maxFullWeightedShoePenetrationM'] > .002:
                    raise AssertionError(f'{actor}: C full weighted shoe still penetrates more than 2mm')
                if summary['CControl']['maxXZChangeM'] > 2e-7 or summary['CControl']['maxBoneLocalTransformDelta'] > 1e-12:
                    raise AssertionError(f'{actor}: C changed XZ or joint local transforms')
                candidates.append({'actor': actor, **summary['imageSelection']['best']})
                candidates.append({'actor': actor, **summary['imageSelection']['worst']})
                print(json.dumps({'actor': actor, 'trial': str(target), 'frames': summary['frames'],
                                  'preIKParityMaxM': summary['preIKParityMaxM'], 'validation': summary['validation'],
                                  'CControl': summary['CControl'],
                                  'fullWeightedShoeResults': {branch:{side:result['fullWeightedShoe'] for side,result in sides.items()} for branch,sides in summary['results'].items()}}, ensure_ascii=False), flush=True)
            selected = [('best', min(candidates, key=lambda item: item['score'])),
                        ('worst', max(candidates, key=lambda item: item['score']))]
            for label, candidate in selected:
                page.evaluate('actor => contactBench.setup(actor)', candidate['actor'])
                snapshot = page.evaluate('index => contactBench.frame(index)', candidate['frame'])
                page.evaluate("contactBench.setView('three-quarter')")
                page.wait_for_timeout(150)
                png = args.evidence / f'contact-{label}.png'
                page.screenshot(path=str(png), full_page=True)
                snapshot_path = args.evidence / f'contact-{label}-frame.json'
                snapshot_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding='utf-8')
                report['screenshots'].append({'label': label, **candidate, 'png': str(png), 'snapshot': str(snapshot_path)})
            report['validation']['finalLabErrors'] = page.evaluate('motionLab.errors')
            report['validation']['finalContactErrors'] = page.evaluate('contactBench.errors')
            browser.close()
    except Exception as exc:
        report['exception'] = str(exc)
        report['traceback'] = traceback.format_exc()
    finally:
        server.shutdown()
        unchanged_after = {p.name: digest(p) for p in watched}
        report['validation']['indexAndMainUntouched'] = unchanged_before == unchanged_after
        report['validation']['indexAndMainHashesBefore'] = unchanged_before
        report['validation']['indexAndMainHashesAfter'] = unchanged_after
        summary_path = args.evidence / 'summary.json'
        summary_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'summary': str(summary_path), 'exception': report.get('exception'),
                      'errors': report['errors'], 'console': report['console'][-12:],
                      'screenshots': report['screenshots']}, ensure_ascii=False), flush=True)
    if report.get('exception') or report['errors'] or not report['validation']['indexAndMainUntouched']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
