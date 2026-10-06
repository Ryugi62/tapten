# Demo video recorder: neural TTS narration per scene (edge-tts) + Playwright recording of the real app
# (headless Chromium, Metal GPU, fake webcam fed by the synthetic 3D-hand y4m) → ffmpeg mux to H.264/AAC mp4.
# Usage: python3 tools/record-demo.py <fakecam.y4m> <out.mp4>
import asyncio, json, os, re, subprocess, sys, time
from playwright.async_api import async_playwright

FF = os.path.expanduser('~/Library/Python/3.9/lib/python/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1')
CAM, OUT = sys.argv[1], sys.argv[2]
WORK = os.path.join(os.path.dirname(os.path.abspath(OUT)), 'work-demo')
os.makedirs(WORK, exist_ok=True)
APP = 'http://127.0.0.1:4410/index.html'
SL = 'http://127.0.0.1:4410/docs/video/slides.html'

SCENES = [
    ('title', "TapTen. The ten-second finger-tapping test, measured privately by any webcam."),
    ('problem', "People with Parkinson's see their neurologist every few months. In between, how they moved when the medication wore off is answered from memory. At the bedside, doctors use a ten-second finger-tapping test and watch whether the taps get slower, and especially smaller. A phone screen-tap test can measure speed, but it cannot see size."),
    ('home', "TapTen runs that test from an ordinary webcam. The hand tracker runs inside the browser tab, so the video never leaves the device, and there is no account."),
    ('steps', "You pick the hand, and tag how your medication feels right now: working, wearing off, or not sure."),
    ('camera', "For this video, the camera input is a synthetic 3D hand, the same one we use for testing, so no real person is filmed. When the badge turns green, a three-second countdown starts, then ten seconds of tapping. The orange line is the thumb-to-index opening we measure."),
    ('result', "The result puts the number first: taps in ten seconds. Then the size change from the first three to the last three taps. Here the taps clearly shrank. The bars show every single tap. If the hand was lost or the camera was too slow, a quality check refuses to give numbers."),
    ('diary', "Saved tests build a private diary. With clearly labelled example data, you can see what a patient would bring to the clinic: on and off periods separate in speed and in size change."),
    ('sheet', "One click turns the diary into a one-page clinic sheet to print or save as a PDF."),
    ('accuracy', "How accurate is it? We have no patient videos, so we built a ground-truth benchmark: a 3D hand animated with a known tap schedule, rendered, and run through the same tracker and code. The table in the repository shows every clip, including the ones we got wrong."),
    ('privacy', "Privacy is enforced in code. The page's security policy only allows connections to its own site. While testing, we found the tracking library tries to send a usage log to a Google server. TapTen's policy blocks it."),
    ('scope', "What is finished: the webcam test, video analysis, quality gate, diary, clinic sheet, and the benchmark. What is planned: a study with real patients and clinicians. TapTen is a tracking tool, not a diagnosis."),
    ('end', "TapTen. Ten seconds a day, for a clearer picture at the clinic."),
]

def dur(f):
    p = subprocess.run([FF, '-hide_banner', '-i', f], capture_output=True, text=True)
    m = re.search(r'Duration: (\d+):(\d+):([\d.]+)', p.stderr)
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])

# 1) narration
secs = {}
for sid, text in SCENES:
    mp3 = os.path.join(WORK, f'{sid}.mp3')
    subprocess.run(['uvx', '--from', 'edge-tts', 'edge-tts', '--voice', 'en-US-AndrewMultilingualNeural', '--rate=+6%', '--text', text, '--write-media', mp3], check=True, capture_output=True)
    secs[sid] = dur(mp3)
print('narration total', round(sum(secs.values()), 1), 's')

CAP_JS = """(t)=>{let c=document.getElementById('cd-cap');if(!c){c=document.createElement('div');c.id='cd-cap';c.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:99999;background:rgba(10,14,20,.86);color:#fff;padding:10px 60px 12px;font:600 22px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;text-align:center;pointer-events:none';document.body.appendChild(c)}c.textContent=t}"""
BADGE_JS = """(t)=>{let c=document.getElementById('cd-badge');if(!c){c=document.createElement('div');c.id='cd-badge';c.style.cssText='position:fixed;right:16px;top:64px;z-index:99999;background:#ffb020;color:#111;padding:6px 12px;border-radius:10px;font:700 16px/1.3 -apple-system,sans-serif;pointer-events:none';document.body.appendChild(c)}c.textContent=t}"""

async def main():
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', '4410', '--bind', '127.0.0.1'], cwd='/Users/ryugi62/dev/univabio', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    starts = {}
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-video-capture={CAM}'])
            ctx = await b.new_context(viewport={'width': 1280, 'height': 720}, permissions=['camera'], record_video_dir=WORK, record_video_size={'width': 1280, 'height': 720})
            t0 = time.time()
            pg = await ctx.new_page()
            pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
            async def cap(sid, text): starts[sid] = time.time() - t0; await pg.evaluate(CAP_JS, text)
            async def hold(sid, extra=0.0):
                left = secs[sid] + 0.5 + extra - (time.time() - t0 - starts[sid])
                if left > 0: await asyncio.sleep(left)
            text = dict(SCENES)
            for sid in ('title', 'problem'):
                await pg.goto(f'{SL}#{sid}'); await pg.wait_for_timeout(300); await cap(sid, text[sid]); await hold(sid)
            await pg.goto(APP); await pg.evaluate("localStorage.clear()"); await pg.goto(APP + '#home'); await pg.wait_for_timeout(400)
            await cap('home', text['home']); await hold('home')
            await pg.goto(APP + '#hand'); await pg.wait_for_timeout(300); await cap('steps', text['steps'])
            await pg.wait_for_timeout(1500); await pg.click('[data-hand=right]'); await pg.wait_for_timeout(900); await pg.click('[data-go=med]')
            await pg.wait_for_timeout(1500); await pg.click('[data-med=off]'); await pg.wait_for_timeout(900)
            await hold('steps', -0.5)
            await pg.click('[data-go=camera]')
            await cap('camera', text['camera']); await pg.evaluate(BADGE_JS, 'Camera input: synthetic 3D hand (no real person)')
            await pg.wait_for_selector('#go:not([disabled])', timeout=60000)
            await pg.wait_for_timeout(1200)
            await pg.click('#go')
            await pg.wait_for_selector('.big, .nobox', timeout=60000)
            await pg.wait_for_timeout(300)
            await cap('result', text['result'])
            await pg.evaluate("window.scrollTo({top:0})")
            await pg.wait_for_timeout(int(secs['result'] * 450)); await pg.evaluate("window.scrollTo({top:520,behavior:'smooth'})")
            await hold('result')
            await pg.click('#save'); await pg.wait_for_timeout(400)
            # example data, clearly labelled, then the sheet
            await pg.evaluate("(()=>{const k='tapten.sessions.v1';localStorage.setItem(k,'[]')})()")
            await pg.goto(APP + '#home'); await pg.goto(APP + '#diary'); await pg.wait_for_timeout(400); await pg.click('#demo'); await pg.wait_for_timeout(500)
            await cap('diary', text['diary']); await pg.evaluate(BADGE_JS, 'Example data (fictional)')
            await pg.wait_for_timeout(int(secs['diary'] * 500)); await pg.evaluate("window.scrollTo({top:420,behavior:'smooth'})"); await hold('diary')
            await pg.goto(APP + '#sheet'); await pg.wait_for_timeout(400); await cap('sheet', text['sheet']); await pg.evaluate(BADGE_JS, 'Example data (fictional)'); await hold('sheet')
            for sid in ('accuracy', 'privacy', 'scope', 'end'):
                await pg.goto(f'{SL}#{sid}'); await pg.wait_for_timeout(500); await cap(sid, text[sid]); await hold(sid)
            await pg.wait_for_timeout(600)
            total = time.time() - t0
            raw = await pg.video.path()
            await ctx.close(); await b.close()
    finally:
        srv.terminate()
    json.dump({'starts': starts, 'secs': secs, 'total': total}, open(os.path.join(WORK, 'timeline.json'), 'w'), indent=1)
    # 2) audio track: each narration placed at its scene start
    inputs, filt = [], []
    for i, (sid, _) in enumerate(SCENES):
        inputs += ['-i', os.path.join(WORK, f'{sid}.mp3')]
        filt.append(f'[{i + 1}:a]adelay={int(starts[sid] * 1000)}|{int(starts[sid] * 1000)}[a{i}]')
    mix = ''.join(f'[a{i}]' for i in range(len(SCENES))) + f'amix=inputs={len(SCENES)}:normalize=0[aout]'
    subprocess.run([FF, '-y', '-loglevel', 'error', '-i', raw, *inputs, '-filter_complex', ';'.join(filt + [mix]), '-map', '0:v', '-map', '[aout]',
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-preset', 'medium', '-c:a', 'aac', '-b:a', '160k', '-shortest', OUT], check=True)
    print('wrote', OUT, round(dur(OUT), 1), 's')

asyncio.run(main())
