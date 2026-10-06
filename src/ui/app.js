// UI layer: screens and wiring. Domain logic lives in src/domain, use cases in src/application.
import { analyzeFrames } from '../application/analyze.js'
import { createDiaryService } from '../application/diaryService.js'
import { REASON_TEXT } from '../domain/quality.js'
import { localStore } from '../adapters/localStore.js'
import { startCamera } from '../adapters/camera.js'
import { framesFromVideo } from '../adapters/videoFile.js'
import { waveformSvg, tapBarsSvg, trendSvg, medLegend, esc } from './charts.js'

const app = document.getElementById('app')
const diary = createDiaryService(localStore())
const state = { hand: null, medState: null, minutesSinceDose: null, result: null, source: 'camera', fileName: null }
let stopCamera = null
let trackerPromise = null
const tracker = () => (trackerPromise ??= import('../adapters/handTracker.js').then((m) => m.createHandTracker()))

const pct = (v) => (v === null ? '—' : `${v > 0 ? '+' : ''}${Math.round(v)}%`)
const fixed = (v, d = 1) => (v === null || v === undefined ? '—' : Number(v).toFixed(d))

function cta(html) { return `<div class="cta"><div class="inner">${html}</div></div>` }
function steps(n, of) { return `<div class="steps" aria-label="Step ${n} of ${of}">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>` }
function show(html) { cleanup(); app.innerHTML = html; app.focus(); window.scrollTo(0, 0) }
function cleanup() { if (stopCamera) { stopCamera(); stopCamera = null } cancelAnimationFrame(rafId) }
let rafId = 0

const screens = {
  home() {
    const n = diary.list().length
    show(`<section class="stack">
      <div><h1>The 10-second finger-tapping test, measured by your webcam.</h1>
      <p class="sub">Tap your index finger on your thumb, as fast and as big as you can, for 10 seconds. TapTen counts the taps and shows whether they get <b>smaller</b> or <b>slower</b> along the way — the change your neurologist looks for, and the part a phone-screen tap test cannot see.</p></div>
      <div class="card"><b>🔒 Your video never leaves this device.</b><p class="small">The hand tracker runs inside this browser tab. Nothing is uploaded, there is no account, and your diary is stored only on this device.</p></div>
      <div class="card warnbox"><b>A tracking tool, not a diagnosis.</b><p class="small">For people already living with Parkinson's (or their care partners) who want a record to bring to the clinic. It does not give an MDS-UPDRS score.</p></div>
      <div class="row"><button class="link" data-go="diary">My diary (${n} test${n === 1 ? '' : 's'})</button><button class="link" data-go="file">Analyse a video file</button><button class="link" data-go="sample">Try a sample recording</button><button class="link" data-go="about">How it works · accuracy</button></div>
    </section>${cta('<button class="primary" data-go="hand">Start a test</button>')}`)
  },

  hand() {
    show(`${steps(1, 3)}<h1>Which hand are you testing?</h1><p class="sub">Test one hand at a time. Your doctor usually checks both.</p>
      <div class="choices">${['right', 'left'].map((h) => `<button class="choice" data-hand="${h}" aria-pressed="${state.hand === h}">${h === 'right' ? 'Right hand' : 'Left hand'}</button>`).join('')}</div>
      ${cta(`<button class="primary" data-go="med" ${state.hand ? '' : 'disabled'}>Next</button>`)}`)
  },

  med() {
    const opts = [['on', 'Medication is working', 'Feeling “on”'], ['off', 'Medication is wearing off', 'Feeling “off”, or before the first dose'], ['unsure', 'Not sure', 'That is fine — it still helps']]
    show(`${steps(2, 3)}<h1>How is your medication right now?</h1><p class="sub">Tagging tests this way lets you compare “on” and “off” times later.</p>
      <div class="choices">${opts.map(([v, t, s]) => `<button class="choice" data-med="${v}" aria-pressed="${state.medState === v}"><span>${t}<small>${s}</small></span></button>`).join('')}</div>
      <p class="row"><label for="mins" class="sub">Minutes since last dose (optional)</label><input id="mins" type="number" min="0" max="1440" inputmode="numeric" value="${state.minutesSinceDose ?? ''}"></p>
      ${cta(`<button class="primary" data-go="camera" ${state.medState ? '' : 'disabled'}>Next</button>`)}`)
  },

  async camera() {
    state.source = 'camera'
    show(`${steps(3, 3)}<h1>Show your ${state.hand} hand inside the box</h1>
      <p class="sub">Sit about an arm's length from the camera, palm turned slightly toward it, thumb and index finger clearly visible. Good light helps.</p>
      <div class="stage"><video id="v" playsinline muted></video><canvas id="ov"></canvas><div class="guide"></div><div class="chip" id="chip">Starting camera…</div><div class="timer" id="timer"></div></div>
      <p class="small" id="hint">When the badge turns green, press Start. You will get a 3-second countdown, then tap for 10 seconds.</p>
      ${cta('<button class="primary" id="go" disabled>Start 10-second test</button>')}`)
    const video = document.getElementById('v'), ov = document.getElementById('ov'), chip = document.getElementById('chip'), go = document.getElementById('go'), timer = document.getElementById('timer')
    let tr
    try {
      ;[tr, stopCamera] = await Promise.all([tracker(), startCamera(video)])
    } catch (e) {
      chip.textContent = 'Camera unavailable'
      document.getElementById('hint').innerHTML = `We could not open a camera (${esc(e.message || e.name)}). Allow camera access in your browser, or <button class="link" data-go="file">analyse a video file instead</button>.`
      return
    }
    ov.width = video.videoWidth; ov.height = video.videoHeight
    const g = ov.getContext('2d')
    const recent = []
    let phase = 'aim', t0 = 0, frames = []
    const loop = () => {
      if (!stopCamera) return
      const now = performance.now()
      const r = tr.detect(video, now)
      drawHand(g, ov, r.image)
      recent.push(r.lm && r.handScale >= 0.06 ? 1 : 0); if (recent.length > 30) recent.shift()
      const steady = recent.length >= 20 && recent.reduce((a, b) => a + b, 0) / recent.length >= 0.8
      if (phase === 'aim') {
        chip.className = 'chip' + (steady ? ' ok' : ''); chip.textContent = steady ? 'Hand found ✓' : r.lm ? 'Move your hand closer' : 'Show your hand'
        go.disabled = !steady
      } else if (phase === 'count') {
        const left = 3 - (now - t0) / 1000
        timer.textContent = left > 0 ? Math.ceil(left) : ''
        chip.textContent = 'Get ready…'
        if (left <= 0) { phase = 'rec'; t0 = now; frames = [] }
      } else if (phase === 'rec') {
        const t = (now - t0) / 1000
        frames.push({ t, lm: r.lm, handScale: r.handScale })
        timer.textContent = Math.max(0, 10 - t).toFixed(0)
        chip.className = 'chip ok'; chip.textContent = 'Tap fast and big!'
        if (t >= 10) { phase = 'done'; finish(frames) ; return }
      }
      rafId = video.requestVideoFrameCallback ? (video.requestVideoFrameCallback(loop), 0) : requestAnimationFrame(loop)
    }
    go.onclick = () => { phase = 'count'; t0 = performance.now(); go.disabled = true; go.textContent = 'Recording…' }
    loop()
  },

  file() {
    state.source = 'file'
    show(`<h1>Analyse a video file</h1><p class="sub">Choose a short video (10–12 s) of the finger-tapping test. It is read inside this tab and never uploaded.</p>
      <div class="card"><input type="file" id="f" accept="video/*" aria-label="Choose a video"></div>
      <div class="stage file" hidden id="st"><video id="v" playsinline muted></video><canvas id="ov"></canvas><div class="chip" id="chip"></div></div>
      ${cta('<button class="primary" data-go="home">Back</button>')}`)
    document.getElementById('f').onchange = (e) => { const file = e.target.files[0]; if (file) analyseFile(URL.createObjectURL(file), file.name) }
  },

  sample() {
    state.source = 'file'; state.hand ??= 'right'; state.medState ??= 'unsure'
    show(`<h1>Sample recording</h1><p class="sub">A <b>synthetic 3D hand</b> (no real person) tapping at about 3 taps per second while the taps shrink — the same file our accuracy test uses. Watch TapTen measure it.</p>
      <div class="stage file" id="st"><video id="v" playsinline muted></video><canvas id="ov"></canvas><div class="chip" id="chip"></div></div>`)
    // Load as a blob so seeking works on any static host (some servers ignore HTTP Range requests).
    fetch('docs/sample-synthetic.webm').then((r) => r.blob()).then((b) => analyseFile(URL.createObjectURL(b), 'sample-synthetic.webm', true))
      .catch(() => { document.getElementById('chip').textContent = 'Sample unavailable offline' })
  },

  result() {
    const r = state.result
    if (!r) return screens.home()
    const { quality: q, metrics: m, taps, series } = r
    if (!q.ok) {
      show(`<h1>We couldn't measure this one</h1>
        <div class="card nobox">${q.reasons.map((x) => `<p>${esc(REASON_TEXT[x] ?? x)}</p>`).join('')}</div>
        <p class="small">Hand found in ${Math.round(q.detectRate * 100)}% of frames · ${fixed(q.fps, 0)} frames per second · ${fixed(q.duration, 1)} s</p>
        ${cta(`<button class="primary" data-go="${state.source === 'camera' ? 'camera' : 'file'}">Try again</button>`)}`)
      return
    }
    const dec = m.decrementPct
    const decText = dec === null ? 'Not enough taps to judge the size change.' : dec <= -20 ? `Taps got clearly smaller toward the end (${pct(dec)}).` : dec <= -8 ? `Taps got a little smaller toward the end (${pct(dec)}).` : `Tap size stayed about the same (${pct(dec)}).`
    show(`<section class="stack">
      <div><p class="sub">${state.hand === 'left' ? 'Left' : 'Right'} hand · ${state.medState === 'on' ? 'medication on' : state.medState === 'off' ? 'medication off' : 'medication not sure'}</p>
      <div class="big">${m.taps}<small>taps in 10 s</small></div><p class="verdict">${esc(decText)}</p></div>
      <div class="grid2">
        <div class="stat"><b>${fixed(m.rateHz, 1)}</b><span>taps per second</span></div>
        <div class="stat"><b>${m.amplitude === null ? '—' : Math.round(m.amplitude * 100) + '%'}</b><span>typical opening, as % of hand length</span></div>
        <div class="stat"><b>${pct(dec)}</b><span>size change, first 3 → last 3 taps</span></div>
        <div class="stat"><b>${m.hesitations}</b><span>pauses (gaps over twice the usual)</span></div>
      </div>
      <div class="card"><b>Size of each tap</b>${tapBarsSvg(taps)}</div>
      <div class="card"><b>Finger opening over 10 seconds</b>${waveformSvg(series, taps)}</div>
      <details><summary>Details and how this was measured</summary>
        <table><tbody>
        <tr><th>Rhythm unevenness (CV of gaps)</th><td>${fixed(m.rhythmCv, 2)}</td></tr>
        <tr><th>Size unevenness (CV of sizes)</th><td>${fixed(m.amplitudeCv, 2)}</td></tr>
        <tr><th>Size trend per tap</th><td>${fixed(m.slopePctPerTap, 1)}%</td></tr>
        <tr><th>Hand found</th><td>${Math.round(q.detectRate * 100)}% of frames</td></tr>
        <tr><th>Frame rate</th><td>${fixed(q.fps, 0)} fps</td></tr></tbody></table>
        <p class="small">Opening = 3D distance between thumb tip and index tip divided by the wrist-to-knuckle length, so moving closer to the camera does not change it. A tap is counted when the fingers close by at least a quarter of this recording's own opening range (and at least 12% of hand length), so tremor and camera noise are not counted. Not a diagnosis.</p>
      </details>
    </section>${cta(`<button class="primary" id="save">Save to my diary</button><button class="secondary" data-go="${state.source === 'camera' ? 'camera' : 'home'}">${state.source === 'camera' ? 'Retake' : 'Done'}</button>`)}`)
    document.getElementById('save').onclick = () => {
      diary.add({ hand: state.hand ?? 'right', medState: state.medState ?? 'unsure', minutesSinceDose: state.minutesSinceDose, metrics: m, quality: q, note: state.source === 'file' ? `video: ${state.fileName}` : '' })
      go('diary')
    }
  },

  diary() {
    const s = diary.list()
    show(`<h1>My diary</h1><p class="sub">${s.length} test${s.length === 1 ? '' : 's'} on this device. Colors show medication state.</p>
      ${s.length ? `${medLegend()}
      <div class="card"><b>Taps per second</b>${trendSvg(s, 'rateHz', { label: 'Taps per second', fmt: (v) => v.toFixed(1) })}</div>
      <div class="card"><b>Size change, first → last taps (%)</b>${trendSvg(s, 'decrementPct', { label: 'Size change', fmt: (v) => Math.round(v) + '%' })}</div>
      <div class="card"><b>Typical opening (% of hand length)</b>${trendSvg(s, 'amplitude', { label: 'Opening', fmt: (v) => Math.round(v * 100) + '%' })}</div>
      <details><summary>All tests</summary><table><thead><tr><th>When</th><th>Hand</th><th>Med</th><th>Taps</th><th>Size Δ</th><th></th></tr></thead><tbody>
      ${[...s].reverse().map((x) => `<tr><td>${esc(x.at.slice(0, 16).replace('T', ' '))}</td><td>${x.hand[0].toUpperCase()}</td><td>${x.medState}</td><td>${x.metrics.taps}</td><td>${pct(x.metrics.decrementPct)}</td><td><button class="link" data-del="${x.id}" aria-label="Delete this test">Delete</button></td></tr>`).join('')}
      </tbody></table></details>
      <div class="row noprint"><button class="secondary" id="exp">Export my data (JSON)</button>${s.some((x) => x.note === 'example') ? '<button class="secondary" id="unex">Remove example data</button>' : ''}<button class="secondary" id="wipe">Delete everything</button></div>`
      : `<div class="card"><p>No tests yet. Take your first 10-second test, or load an example diary to see what the clinic sheet looks like.</p><button class="secondary" id="demo">Load example diary</button></div>`}
      ${cta(s.length ? '<button class="primary" data-go="sheet">Make my clinic sheet</button><button class="secondary" data-go="hand">New test</button>' : '<button class="primary" data-go="hand">Start a test</button>')}`)
    document.getElementById('exp')?.addEventListener('click', () => download('tapten-diary.json', diary.exportJson()))
    document.getElementById('wipe')?.addEventListener('click', () => { if (confirm('Delete all tests on this device? This cannot be undone.')) { diary.wipe(); go('diary') } })
    document.getElementById('demo')?.addEventListener('click', loadExampleDiary)
    document.getElementById('unex')?.addEventListener('click', () => { s.filter((x) => x.note === 'example').forEach((x) => diary.remove(x.id)); go('diary') })
    app.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { diary.remove(b.dataset.del); go('diary') }))
  },

  sheet() {
    const sh = diary.sheet(), s = diary.list()
    const isExample = s.some((x) => x.note === 'example')
    show(`<article class="sheet card"><h1 style="margin-top:0">Finger-tapping home record</h1>
      <p class="small">${esc((sh.from ?? '').slice(0, 10))} to ${esc((sh.to ?? '').slice(0, 10))} · ${sh.total} tests · printed ${esc(sh.generatedAt.slice(0, 10))}${isExample ? ' · <b>EXAMPLE DATA</b>' : ''}</p>
      <table><thead><tr><th>Hand</th><th>Medication</th><th>Tests</th><th>Taps/s</th><th>Opening</th><th>Size change</th><th>Rhythm CV</th></tr></thead><tbody>
      ${sh.groups.map((g) => `<tr><td>${g.hand}</td><td>${g.medState}</td><td>${g.n}</td><td>${fixed(g.rateHz, 1)}</td><td>${g.amplitude === null ? '—' : Math.round(g.amplitude * 100) + '%'}</td><td>${pct(g.decrementPct)}</td><td>${fixed(g.rhythmCv, 2)}</td></tr>`).join('')}
      </tbody></table><p class="small">Medians per group. Size change = mean size of the last 3 taps vs the first 3 taps in a 10-second test.</p>
      ${medLegend()}${trendSvg(s, 'rateHz', { label: 'Taps per second', h: 140 })}${trendSvg(s, 'decrementPct', { label: 'Size change', h: 140, fmt: (v) => Math.round(v) + '%' })}
      <p class="small"><b>${esc(sh.disclaimer)}</b> Recorded with TapTen (open source). Method: MediaPipe hand landmarks, thumb–index 3D distance ÷ wrist–knuckle length.</p></article>
      ${cta('<button class="primary" id="print">Print or save as PDF</button><button class="secondary" data-go="diary">Back</button>')}`)
    document.getElementById('print').onclick = () => window.print()
  },

  async about() {
    let b = null
    try { b = await (await fetch('docs/bench-summary.json')).json() } catch { /* offline */ }
    show(`<h1>How it works</h1>
      <p>1. A hand-landmark model (Google MediaPipe, open source) finds 21 points on your hand in each camera frame — inside this browser tab.</p>
      <p>2. TapTen tracks the <b>opening</b>: the 3D distance between thumb tip and index tip divided by the length from wrist to middle knuckle, so it does not change when you move closer or farther.</p>
      <p>3. Each close of the fingers is a tap. From the taps we compute speed, size, rhythm, pauses and the <b>size change from the first to the last taps</b> — the “decrement” that clinicians look for when they rate this test.</p>
      <p>4. A quality check refuses to give numbers when the hand was lost too often, the camera was too slow, or the hand was too small.</p>
      <h2>How accurate is it?</h2>
      ${b ? `<p>We do not have patient videos (collecting them needs ethics approval), so we built a <b>ground-truth benchmark</b> instead: a 3D hand model is animated with a known tap schedule (speed ${b.speeds}, size shrinking 0–60%, 3 camera angles, several distances, pauses, plus a degraded set with blur, dim light, sensor noise and 15 fps), rendered to video, and run through the <b>same real tracker and code</b> you use.</p>
      <div class="grid2"><div class="stat"><b>${b.countExact}/${b.clips}</b><span>clips with the exact tap count</span></div><div class="stat"><b>${b.countMae}</b><span>average tap-count error</span></div>
      <div class="stat"><b>${b.decMedianErr} pts</b><span>median error in size change</span></div><div class="stat"><b>${b.shrinkingDetected}</b><span>shrinking-tap clips flagged (≤ −15%)</span></div></div>
      <p class="small">Generated ${esc(b.generated)}. Full table: docs/bench.json in the repository. Limits: a synthetic hand is not a real patient; real-world accuracy still needs a clinical study.</p>` : '<p class="small">Benchmark summary unavailable offline.</p>'}
      <h2>What it is not</h2><p>Not a diagnosis, not an MDS-UPDRS score, not a medical device. It is a private record you can bring to your appointments.</p>
      ${cta('<button class="primary" data-go="hand">Start a test</button>')}`)
  },
}

function drawHand(g, cv, lm) {
  g.clearRect(0, 0, cv.width, cv.height)
  if (!lm) return
  const P = (i) => [lm[i].x * cv.width, lm[i].y * cv.height]
  g.lineWidth = Math.max(3, cv.width / 220); g.strokeStyle = 'rgba(49,130,246,.9)'; g.fillStyle = '#fff'
  for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 13], [13, 17], [0, 17]]) { g.beginPath(); g.moveTo(...P(a)); g.lineTo(...P(b)); g.stroke() }
  g.strokeStyle = '#ffb020'; g.lineWidth *= 1.6; g.beginPath(); g.moveTo(...P(4)); g.lineTo(...P(8)); g.stroke()
  for (const i of [4, 8]) { g.beginPath(); g.arc(...P(i), g.lineWidth * 1.4, 0, 7); g.fill() }
}

async function analyseFile(url, name, autoplay = false) {
  state.fileName = name
  const st = document.getElementById('st'), video = document.getElementById('v'), ov = document.getElementById('ov'), chip = document.getElementById('chip')
  st.hidden = false
  video.src = url
  chip.textContent = 'Loading hand tracker…'
  const tr = await tracker()
  await new Promise((res) => (video.readyState >= 1 ? res() : (video.onloadedmetadata = res)))
  ov.width = video.videoWidth; ov.height = video.videoHeight
  const g = ov.getContext('2d')
  chip.textContent = 'Reading frames… 0%'
  let frames
  try {
    frames = await framesFromVideo(video, tr, { onProgress: (p) => { chip.textContent = `Reading frames… ${Math.round(p * 100)}%` } })
  } catch (e) { chip.textContent = e.message; return }
  if (autoplay) { // replay the tracked landmarks on top of the video so the viewer sees what was measured
    for (const f of frames) { video.currentTime = f.t; await new Promise((r) => (video.onseeked = r)); drawHand(g, ov, f.image); await new Promise((r) => setTimeout(r, 12)) }
  }
  finish(frames.map(({ t, lm, handScale }) => ({ t, lm, handScale })))
}

function finish(frames) { state.result = analyzeFrames(frames); window.__taptenLast = { n: frames.length, found: frames.filter((f) => f.lm).length, a: state.result.series.filter((_, i) => i % 15 === 0).map((p) => p.a && +p.a.toFixed(3)) }; go("result") }

function download(name, text) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function loadExampleDiary() {
  // Clearly labelled fictional data so visitors can see the diary and clinic sheet without recording.
  const base = Date.now() - 13 * 864e5
  let k = 0
  for (let d = 0; d < 14; d++) {
    for (const [hour, med] of [[8, 'off'], [11, 'on'], [17, d % 3 ? 'on' : 'unsure']]) {
      const off = med === 'off'
      const m = { taps: off ? 21 + (d % 3) : 31 + (d % 4), rateHz: off ? 2.1 + 0.05 * (d % 3) : 3.1 + 0.07 * (d % 4), amplitude: off ? 0.52 + 0.02 * (d % 2) : 0.78 + 0.03 * (d % 3), amplitudeCv: off ? 0.24 : 0.11, rhythmCv: off ? 0.21 : 0.09, decrementPct: off ? -38 + 3 * (d % 4) : -9 + 2 * (d % 3), slopePctPerTap: off ? -1.8 : -0.3, hesitations: off ? d % 2 : 0 }
      const at = new Date(base + d * 864e5 + hour * 36e5).toISOString()
      const store = localStore(); const all = store.load()
      all.push({ id: `ex${k++}`, at, hand: 'right', medState: med, minutesSinceDose: off ? 300 : 60, note: 'example', metrics: m, quality: { detectRate: 0.99, fps: 30 } })
      store.save(all)
    }
  }
  go('diary')
}

function go(name) { location.hash = name; route() }
function route() { const name = location.hash.slice(1) || 'home'; (screens[name] ?? screens.home)() }

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-go],[data-hand],[data-med]')
  if (!t) return
  if (t.dataset.hand) { state.hand = t.dataset.hand; return screens.hand() }
  if (t.dataset.med) { const mins = document.getElementById('mins')?.value; state.minutesSinceDose = mins === '' || mins === undefined ? null : Number(mins); state.medState = t.dataset.med; return screens.med() }
  if (t.dataset.go) go(t.dataset.go)
})
document.addEventListener('change', (e) => { if (e.target.id === 'mins') state.minutesSinceDose = e.target.value === '' ? null : Number(e.target.value) })
window.addEventListener('hashchange', route)
route()
