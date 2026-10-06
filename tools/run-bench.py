# Usage: python3 tools/run-bench.py [N]  → docs/bench.json (real MediaPipe on rendered frames, headless Chromium + SwiftShader)
import asyncio, json, os, subprocess, sys, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
N = int(sys.argv[1]) if len(sys.argv) > 1 else 999
async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', '4402', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            pg = await b.new_page(viewport={'width': 640, 'height': 480})
            await pg.goto('http://127.0.0.1:4402/tools/synth.html')
            await pg.wait_for_function('window.ready===true && !!window.runOne', timeout=90000)
            specs = (await pg.evaluate('window.clipSpecs()'))[:N]
            out = {'generated': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'calibration': await pg.evaluate('window.cal'), 'clips': []}
            for s in specs:
                t0 = time.time()
                r = await pg.evaluate('(s)=>window.runOne(s)', s)
                out['clips'].append(r)
                print(s['id'], 'f', s['f'], 'dec', s['decrement'], 'gt', r['gt']['taps'], 'est', r['est']['taps'], 'gtDec', round(r['gt']['decrementPct'] or 0), 'estDec', r['est']['decrementPct'] and round(r['est']['decrementPct']), 'q', r['quality']['ok'], f'{time.time()-t0:.0f}s', flush=True)
            await b.close()
        json.dump(out, open(os.path.join(ROOT, 'docs', 'bench.json'), 'w'), indent=1)
    finally:
        srv.terminate()
asyncio.run(main())
