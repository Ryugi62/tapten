# Render the synthetic hand to an image sequence and encode it (webm for the in-app sample, y4m for a fake webcam).
# Usage: python3 tools/make-video.py <out-basename> <f> <decrement> <seconds> [rx ry rz dist] [--y4m]
import asyncio, base64, os, subprocess, sys, json
from playwright.async_api import async_playwright
FF = os.path.expanduser('~/Library/Python/3.9/lib/python/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1')
out, f, dec, secs = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
view = dict(zip(['rx', 'ry', 'rz', 'dist'], map(float, sys.argv[5:9]))) if len(sys.argv) > 8 and not sys.argv[5].startswith('--') else {'rx': -1.57, 'ry': -1.57, 'rz': 1.57, 'dist': 0.45}
y4m = '--y4m' in sys.argv
async def main():
    tmp = f'/private/tmp/claude-501/-Users-ryugi62-jarvis/bd1ba76e-6919-4de1-afa2-fdc0248e8dd6/scratchpad/frames-{os.path.basename(out)}'
    os.makedirs(tmp, exist_ok=True)
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', '4403', '--bind', '127.0.0.1'], cwd='/Users/ryugi62/dev/univabio', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            pg = await b.new_page(viewport={'width': 640, 'height': 480})
            await pg.goto('http://127.0.0.1:4403/tools/synth.html')
            await pg.wait_for_function('window.ready===true', timeout=90000)
            n = int(secs * 30) + 1
            for i in range(n):
                data = await pg.evaluate('([i,f,dec,v,secs])=>{const h=window.hand; if(i===0){h.setView(v); window._s=window.schedule({f,a0:0.9,decrement:dec,duration:secs,jitter:0.04,seed:5});} h.pose(window._s.closure(i/30)); h.render(); return h.canvas.toDataURL("image/png")}', [i, f, dec, view, secs])
                open(f'{tmp}/{i:05d}.png', 'wb').write(base64.b64decode(data.split(',')[1]))
            await b.close()
    finally:
        srv.terminate()
    if y4m:
        subprocess.run([FF, '-y', '-loglevel', 'error', '-framerate', '30', '-i', f'{tmp}/%05d.png', '-pix_fmt', 'yuv420p', out + '.y4m'], check=True)
    else:
        subprocess.run([FF, '-y', '-loglevel', 'error', '-framerate', '30', '-i', f'{tmp}/%05d.png', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-pix_fmt', 'yuv420p', out + '.webm'], check=True)
    print('ok', out)
asyncio.run(main())
