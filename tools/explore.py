import asyncio, json, subprocess, sys
from playwright.async_api import async_playwright
JS = sys.argv[1]
async def main():
    srv=subprocess.Popen([sys.executable,'-m','http.server','4401','--bind','127.0.0.1'],cwd='/Users/ryugi62/dev/univabio',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        async with async_playwright() as p:
            b=await p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            pg=await b.new_page(viewport={'width':640,'height':480})
            await pg.goto('http://127.0.0.1:4401/tools/synth.html')
            await pg.wait_for_function('window.ready===true',timeout=60000)
            r=await pg.evaluate(JS)
            print(json.dumps(r,indent=0)[:4000])
            if len(sys.argv)>2: await pg.screenshot(path=sys.argv[2])
            await b.close()
    finally: srv.terminate()
asyncio.run(main())
