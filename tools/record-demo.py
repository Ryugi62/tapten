# Demo video recorder: neural TTS narration per scene (edge-tts) + Playwright recording of the real app
# (headless Chromium, Metal GPU, fake webcam fed by the synthetic 3D-hand y4m) → ffmpeg mux to H.264/AAC mp4.
# Usage: python3 tools/record-demo.py <fakecam.y4m> <out.mp4>
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
import asyncio, json, os, re, subprocess, sys, time
from playwright.async_api import async_playwright

FF = os.environ.get('FFMPEG', 'ffmpeg')
CAM, OUT = sys.argv[1], sys.argv[2]
SHORT = sys.argv[3] if len(sys.argv) > 3 else None  # a ~5 s clip used to show the quality gate refusing
WORK = os.path.join(os.path.dirname(os.path.abspath(OUT)), 'work-demo')
os.makedirs(WORK, exist_ok=True)
APP = 'http://127.0.0.1:4410/index.html'
SL = 'http://127.0.0.1:4410/docs/video/slides.html'

SCENES = [
    ('problem', "Between neurology visits, people with Parkinson's describe their bad hours from memory. Doctors watch ten finger taps get slower and smaller. A webcam can measure that at home."),
    ('steps', "TapTen runs privately in the browser. Pick the hand, then how you move right now and the time since your last dose, each with a single tap."),
    ('camera', "In this video the camera sees a synthetic 3D hand, so no real person is filmed. When the hand is in view and still, the test starts by itself, with beeps: five seconds to get ready, then ten seconds of tapping."),
    ('result', "Numbers first: taps in ten seconds, how much smaller they got, and the speed change, in plain words. One test can be off, so after three tests TapTen compares each new one with your own usual range."),
    ('gate', "If a recording cannot support numbers, the quality gate refuses it and says what to fix. Here, a five-second clip is too short."),
    ('sample', "No webcam? The sample runs the same pipeline on a synthetic clip with a known answer, so you can check the measurement yourself."),
    ('diary', "Tests build a private diary. This is clearly labelled example data: taps per second against time since the last dose."),
    ('sheet', "One click makes a one-page clinic sheet. It never tells anyone to change medication."),
    ('accuracy', "We have no patient videos yet, so we built a benchmark with exact answers, including two held-out sets frozen before running, one with severe and slowing cases. Every clip, including the misses, is in the repository."),
    ('privacy', "The page may only talk to its own site. We found the tracking library tries to send a usage log to Google; TapTen's policy blocks it."),
    ('scope', "Next: measuring real people, first healthy volunteers, then a study with patients and their neurologists. TapTen is a tracking tool, not a diagnosis."),
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
    cuts = []  # (from, to) seconds of dead waiting to remove from the final video
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
            LIFT = "(()=>{if(document.getElementById('cd-lift'))return;const st=document.createElement('style');st.id='cd-lift';st.textContent='main{zoom:1.25;padding-bottom:0!important}.cta{position:static!important;background:none!important;padding:8px 0 120px!important}';document.head.appendChild(st)})()"
            async def app(hash):
                await pg.goto(APP + '#home'); await pg.goto(APP + '#' + hash); await pg.evaluate(LIFT)
                await pg.evaluate("document.getElementById('cd-badge')?.remove()")
            await pg.goto(f'{SL}#problem'); await pg.wait_for_timeout(300); await cap('problem', text['problem']); await hold('problem')
            await pg.goto(APP); await pg.evaluate("localStorage.clear()"); await app('hand'); await cap('steps', text['steps'])
            await pg.wait_for_timeout(1500); await pg.click('[data-hand=right]'); await pg.wait_for_timeout(300); await pg.evaluate(LIFT)
            await pg.wait_for_timeout(1500); await pg.click('[data-med=unsure]'); await pg.evaluate(LIFT); await pg.wait_for_timeout(900); await pg.click('[data-mins="120"]'); await pg.evaluate(LIFT)
            await hold('steps', -1.0)
            await pg.click('[data-go=camera]'); await pg.evaluate(LIFT)
            await cap('camera', text['camera']); await pg.evaluate(BADGE_JS, 'Camera input: synthetic 3D hand (no real person)')
            await pg.wait_for_selector('.big, .nobox', timeout=90000)
            await pg.evaluate(LIFT); await pg.wait_for_timeout(300); await hold('camera')
            await cap('result', text['result'])
            await pg.wait_for_timeout(int(secs['result'] * 500)); await pg.evaluate("window.scrollTo({top:560,behavior:'smooth'})")
            await hold('result')
            await app('file'); await pg.wait_for_timeout(300)
            c0 = time.time() - t0 + 1.0
            await pg.set_input_files('#f', SHORT); await pg.wait_for_selector('.nobox', timeout=60000); await pg.evaluate(LIFT)
            await pg.wait_for_timeout(2500)
            cuts.append((c0, time.time() - t0 - 0.3))
            await cap('gate', text['gate']); await hold('gate', 1.0)
            await app('sample'); await pg.wait_for_timeout(1500)
            c0 = time.time() - t0
            await pg.wait_for_selector('.truth', timeout=120000); await pg.evaluate(LIFT); await pg.evaluate("document.querySelector('.truth').scrollIntoView({block:'center'})")
            await pg.wait_for_timeout(4500)  # the screencast stalls while the tracker replays; let it catch up inside the cut
            cuts.append((c0, time.time() - t0 - 0.3))
            await cap('sample', text['sample']); await hold('sample', 1.5)
            await pg.evaluate("localStorage.clear()"); await app('diary'); await pg.wait_for_timeout(400); await pg.click('#demo'); await pg.wait_for_timeout(600); await pg.evaluate(LIFT)
            await cap('diary', text['diary']); await pg.evaluate("window.scrollTo({top:900,behavior:'smooth'})"); await hold('diary')
            await app('sheet'); await pg.wait_for_timeout(400); await cap('sheet', text['sheet']); await pg.wait_for_timeout(int(secs['sheet'] * 500)); await pg.evaluate("window.scrollTo({top:500,behavior:'smooth'})"); await hold('sheet')
            for sid in ('accuracy', 'privacy', 'scope', 'end'):
                await pg.goto(f'{SL}#{sid}'); await pg.wait_for_timeout(500); await cap(sid, text[sid]); await hold(sid)
            await pg.wait_for_timeout(600)
            total = time.time() - t0
            raw = await pg.video.path()
            await ctx.close(); await b.close()
    finally:
        srv.terminate()
    json.dump({'starts': starts, 'secs': secs, 'total': total, 'cuts': cuts}, open(os.path.join(WORK, 'timeline.json'), 'w'), indent=1)
    # 1b) remove dead waiting (analysis progress bars); shift narration starts accordingly
    def shifted(t):
        return t - sum(max(0.0, min(t, b) - a) for a, b in cuts)
    if cuts:
        # keep-segments via trim+concat (preserves the screencast's variable frame timing; select+setpts would not)
        keep, prev = [], 0.0
        for a, b in sorted(cuts):
            keep.append((prev, a)); prev = b
        keep.append((prev, None))
        # the screencast is variable-frame-rate (frames only on change): make it constant-rate first so static
        # stretches keep their real length, then cut
        parts = [f'[0:v]fps=25,split={len(keep)}' + ''.join(f'[c{i}]' for i in range(len(keep)))]
        for i, (a, b) in enumerate(keep):
            rng = f'start={a:.3f}' + (f':end={b:.3f}' if b is not None else '')
            parts.append(f'[c{i}]trim={rng},setpts=PTS-STARTPTS[v{i}]')
        fc = ';'.join(parts) + ';' + ''.join(f'[v{i}]' for i in range(len(keep))) + f'concat=n={len(keep)}:v=1:a=0[vout]'
        trimmed = os.path.join(WORK, 'trimmed.webm')
        subprocess.run([FF, '-y', '-loglevel', 'error', '-i', raw, '-filter_complex', fc, '-map', '[vout]', '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '24', '-row-mt', '1', trimmed], check=True)
        raw = trimmed
        starts = {k: shifted(v) for k, v in starts.items()}
        total = shifted(total)
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
