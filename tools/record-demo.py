# Demo video recorder: neural TTS narration per scene (edge-tts) + Playwright recording of the real app
# (headless Chromium, Metal GPU, fake webcam fed by the synthetic 3D-hand y4m) → ffmpeg mux to H.264/AAC mp4.
# Usage: python3 tools/record-demo.py <fakecam.y4m> <out.mp4>
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import asyncio, json, os, re, subprocess, sys, time
from playwright.async_api import async_playwright

FF = os.environ.get('FFMPEG', 'ffmpeg')
CAM, OUT = sys.argv[1], sys.argv[2]
WORK = os.path.join(os.path.dirname(os.path.abspath(OUT)), 'work-demo')
os.makedirs(WORK, exist_ok=True)
APP = 'http://127.0.0.1:4410/index.html'
SL = 'http://127.0.0.1:4410/docs/video/slides.html'

SCENES = [
    ('hook', "This is TapTen: ten seconds of finger tapping, measured by an ordinary webcam, privately, inside the browser. In this video the camera sees a synthetic 3D hand, so no real person is filmed. The test starts by itself once the hand is steady, with beeps, so nobody has to click with a shaky hand."),
    ('result', "The number comes first: taps in ten seconds. Then the size change from the first three to the last three taps. Here the taps clearly shrank, the sign neurologists look for. Every bar is one tap."),
    ('problem', "Why it matters. People with Parkinson's see their neurologist every few months, and in between, how they moved when the medication wore off is answered from memory. At the bedside, doctors ask for ten fast, big finger taps and watch whether they get slower, and especially smaller. A phone screen-tap test can measure speed, but it cannot see size. TapTen uses a fixed ten-second window, so every test is comparable."),
    ('steps', "Each test is tagged with the states of a standard home motor diary, plus minutes since the last dose."),
    ('diary', "Tests build a private diary in the browser. This is clearly labelled example data, to show what a patient could bring to the clinic: taps per second against minutes since the last dose."),
    ('sheet', "One click turns the diary into a one-page clinic sheet. It never tells anyone to change medication."),
    ('accuracy', "How accurate is it? We have no patient videos yet, so we built a ground-truth benchmark: a 3D hand animated with known tap schedules, run through the same model and analysis code. A held-out set was frozen first and run once, and the quality gate refused every bad recording. Every clip, including the misses, is in the repository."),
    ('privacy', "Privacy is enforced in code. The page may only talk to its own site. While testing, we found the tracking library tries to send a usage log to a Google server, and TapTen's policy blocks it."),
    ('scope', "Finished: the webcam test, video analysis, quality gate, motor diary, clinic sheet, and the benchmark. Planned: measuring real people, first healthy volunteers, then a study with patients and their neurologists. TapTen is a tracking tool, not a diagnosis."),
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
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', '4410', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
            LIFT = "(()=>{const st=document.createElement('style');st.textContent='.cta{bottom:86px!important;background:none!important}main{padding-bottom:300px!important}';document.head.appendChild(st)})()"
            await pg.goto(APP); await pg.evaluate("localStorage.clear()"); await pg.goto(APP + '#hand'); await pg.evaluate(LIFT)
            await cap('hook', text['hook'])
            await pg.click('[data-hand=right]'); await pg.wait_for_timeout(400); await pg.click('[data-go=med]'); await pg.wait_for_timeout(400)
            await pg.click('[data-med=unsure]'); await pg.wait_for_timeout(400); await pg.click('[data-go=camera]')
            await pg.evaluate(BADGE_JS, 'Camera input: synthetic 3D hand (no real person)')
            await pg.wait_for_selector('.big, .nobox', timeout=90000)
            await pg.wait_for_timeout(300); await hold('hook')
            await cap('result', text['result'])
            await pg.wait_for_timeout(int(secs['result'] * 450)); await pg.evaluate("window.scrollTo({top:430,behavior:'smooth'})")
            await hold('result')
            await pg.goto(f'{SL}#problem'); await pg.wait_for_timeout(300); await cap('problem', text['problem']); await hold('problem')
            await pg.goto(APP + '#home'); await pg.goto(APP + '#med'); await pg.evaluate(LIFT); await pg.wait_for_timeout(300); await cap('steps', text['steps']); await hold('steps')
            await pg.evaluate("localStorage.clear()"); await pg.goto(APP + '#home'); await pg.goto(APP + '#diary'); await pg.evaluate(LIFT); await pg.wait_for_timeout(400); await pg.click('#demo'); await pg.wait_for_timeout(600)
            await cap('diary', text['diary']); await pg.evaluate("window.scrollTo({top:560,behavior:'smooth'})"); await hold('diary')
            await pg.goto(APP + '#sheet'); await pg.evaluate(LIFT); await pg.wait_for_timeout(400); await cap('sheet', text['sheet']); await pg.wait_for_timeout(int(secs['sheet'] * 500)); await pg.evaluate("window.scrollTo({top:380,behavior:'smooth'})"); await hold('sheet')
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
    mix = ''.join(f'[a{i}]' for i in range(len(SCENES))) + f'amix=inputs={len(SCENES)}:normalize=0:duration=longest,apad=whole_dur={total:.2f}[aout]'
    subprocess.run([FF, '-y', '-loglevel', 'error', '-i', raw, *inputs, '-filter_complex', ';'.join(filt + [mix]), '-map', '0:v', '-map', '[aout]',
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-preset', 'medium', '-c:a', 'aac', '-b:a', '160k', OUT], check=True)
    print('wrote', OUT, round(dur(OUT), 1), 's')

asyncio.run(main())
