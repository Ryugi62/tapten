import asyncio, json, math, subprocess, sys, time
from playwright.async_api import async_playwright
async def main():
    srv=subprocess.Popen([sys.executable,'-m','http.server','4401','--bind','127.0.0.1'],cwd='/Users/ryugi62/dev/univabio',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        async with async_playwright() as p:
            b=await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            pg=await b.new_page(); pg.on('console',lambda m: print('LOG',m.text) if 'rror' in m.text else None)
            await pg.goto('http://127.0.0.1:4401/tools/synth-probe.html')
            await pg.wait_for_function('window.ready===true',timeout=60000)
            for rx in [0,-1.57,1.57]:
              for ry in [0,1.57,3.14,-1.57]:
                for rz in [0,1.57,3.14]:
                    r=await pg.evaluate(f'window.probe({rx},{ry},{rz})')
                    if r['n']: print(rx,ry,rz,r['score'])
            await pg.screenshot(path='/private/tmp/claude-501/-Users-ryugi62-jarvis/bd1ba76e-6919-4de1-afa2-fdc0248e8dd6/scratchpad/probe.png')
            await b.close()
    finally: srv.terminate()
asyncio.run(main())
