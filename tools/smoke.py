# E2E smoke: real page, real tracker, sample video → result screen; also camera path with a fake webcam (y4m).
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import asyncio, subprocess, sys, json, os
from playwright.async_api import async_playwright
SHOTS = os.path.join(ROOT, 'docs', 'shots')
async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', '4404', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    reqs = []
    try:
        async with async_playwright() as p:
            args = [*(os.environ.get('GLARGS','--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader').split()), '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
            if len(sys.argv) > 1: args.append(f'--use-file-for-fake-video-capture={sys.argv[1]}')
            b = await p.chromium.launch(args=args)
            for w, h in [(390, 844), (1280, 800)]:
                ctx = await b.new_context(viewport={'width': w, 'height': h}, permissions=['camera'])
                pg = await ctx.new_page()
                pg.on('console', lambda m: print('LOG', m.type, m.text[:200]) if m.type in ('error', 'warning') else None)
                pg.on('pageerror', lambda e: print('PAGEERR', str(e)[:300]))
                pg.on('request', lambda r: reqs.append(r.url))
                await pg.goto('http://127.0.0.1:4404/index.html')
                await pg.screenshot(path=f'{SHOTS}/home-{w}.png', full_page=True)
                if w == 1280:
                    await pg.goto('http://127.0.0.1:4404/index.html#sample')
                    await pg.wait_for_selector('.big', timeout=240000)
                    print('RESULT', (await pg.inner_text('main'))[:400].replace('\n', ' | '))
                    await pg.screenshot(path=f'{SHOTS}/result-{w}.png', full_page=True)
                    await pg.wait_for_timeout(300)
                    await pg.evaluate('localStorage.clear()'); await pg.goto('http://127.0.0.1:4404/index.html#home'); await pg.goto('http://127.0.0.1:4404/index.html#diary'); await pg.wait_for_timeout(300); await pg.click('#demo'); await pg.wait_for_timeout(500)
                    await pg.screenshot(path=f'{SHOTS}/diary-{w}.png', full_page=True)
                    await pg.goto('http://127.0.0.1:4404/index.html#sheet'); await pg.wait_for_timeout(500)
                    await pg.pdf(path=f'{SHOTS}/clinic-sheet.pdf', format='A4', print_background=True)
                    await pg.goto('http://127.0.0.1:4404/index.html#about'); await pg.wait_for_timeout(800)
                    await pg.screenshot(path=f'{SHOTS}/about-{w}.png', full_page=True)
                if w == 390 and len(sys.argv) > 1:
                    await pg.goto('http://127.0.0.1:4404/index.html#hand')
                    await pg.screenshot(path=f'{SHOTS}/step-hand-{w}.png')
                    await pg.click('[data-hand=right]'); await pg.click('[data-go=med]')
                    await pg.click('[data-med=unsure]'); await pg.screenshot(path=f'{SHOTS}/step-med-{w}.png'); await pg.click('[data-go=camera]')
                    await pg.wait_for_selector('#go:not([disabled])', timeout=120000)
                    await pg.screenshot(path=f'{SHOTS}/camera-ready-{w}.png')
                    await pg.wait_for_timeout(9000)  # auto-start: steady 2 s → 5 s countdown → recording
                    await pg.screenshot(path=f'{SHOTS}/camera-recording-{w}.png')
                    await pg.wait_for_selector('.big, .nobox', timeout=60000)
                    print('CAMERA', (await pg.inner_text('main'))[:300].replace('\n', ' | '))
                    await pg.screenshot(path=f'{SHOTS}/camera-result-{w}.png', full_page=True)
                await ctx.close()
            await b.close()
    finally:
        srv.terminate()
    hosts = sorted(set(u.split('/')[2] for u in reqs if u.startswith('http')))
    print('HOSTS', hosts, 'requests', len(reqs))
asyncio.run(main())
