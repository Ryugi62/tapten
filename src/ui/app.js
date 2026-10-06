// UI layer: screens and wiring. Domain logic lives in src/domain, use cases in src/application.
import { analyzeFrames } from '../application/analyze.js'
import { createDiaryService } from '../application/diaryService.js'
import { REASON_TEXT } from '../domain/quality.js'
import { MED_LABEL } from '../domain/diary.js'
import { sizeVerdict } from '../domain/verdict.js'
import { localStore } from '../adapters/localStore.js'
import { startCamera } from '../adapters/camera.js'
import { framesFromVideo } from '../adapters/videoFile.js'
import { beep } from '../adapters/sound.js'
import { waveformSvg, tapBarsSvg, trendSvg, doseScatterSvg, medLegend, esc } from './charts.js'

const app = document.getElementById('app')
const store = localStore()
const diary = createDiaryService(store)
const state = { hand: null, medState: null, minutesSinceDose: null, beforeFirstDose: false, result: null, source: 'camera', fileName: null, sample: false, autoStart: true }
let session = 0 // increments on every screen change; async work checks it before touching the camera or DOM
let stopCamera = null
let trackerPromise = null
const tracker = () => (trackerPromise ??= import('../adapters/handTracker.js').then((m) => m.createHandTracker()))

const pct = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${Math.round(v)}%`)
const fixed = (v, d = 1) => (v === null || v === undefined ? '—' : Number(v).toFixed(d))
const SAFETY = 'Do not change your medication based on these numbers — bring them to your neurologist. If you suddenly get worse, contact your care team.'
const UNKNOWN_NORMS = 'Normal ranges for this home test are not known yet, and it cannot tell whether someone has Parkinson\'s.'

function cta(html) { return `<div class="cta"><div class="inner">${html}</div></div>` }
function steps(n, of) { return `<div class="steps" aria-label="Step ${n} of ${of}">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>` }
function show(html) { cleanup(); session++; app.innerHTML = html; app.focus(); window.scrollTo(0, 0); return session }
function cleanup() { if (stopCamera) { stopCamera(); stopCamera = null } }
const hasExample = () => diary.list().some((x) => x.note === 'example')

const screens = {
  home() {
    const n = diary.list().length
    show(`<section class="stack">
      <div><h1>A 10-second finger-tapping test, measured by your webcam.</h1>
      <p class="sub">Tap your index finger on your thumb, as fast and as big as you can, for 10 seconds. TapTen counts the taps and shows whether they get <b>smaller</b> or <b>slower</b> along the way — the change neurologists look for in the clinic version of this test (10 taps), and the part a phone-screen tap test cannot see. TapTen uses a fixed 10-second window so every test is comparable.</p></div>
      <div class="links"><button class="link" data-go="sample">▶ Try a sample recording (no webcam needed)</button><button class="link" data-go="file">Analyse a video file</button><button class="link" data-go="diary">My diary (${n} test${n === 1 ? '' : 's'})</button><button class="link" data-go="about">How it works · accuracy</button></div>
      <div class="card"><b>🔒 Your video never leaves this device.</b><p class="small">The hand tracker runs inside this browser tab. Nothing is uploaded, there is no account, and your diary is stored only in this browser on this device — use “Export” to keep a copy.</p></div>
      <div class="card warnbox"><b>A tracking tool, not a diagnosis.</b><p class="small">For people already living with Parkinson's (or their care partners) who want a record to bring to the clinic. It does not give an MDS-UPDRS score. ${UNKNOWN_NORMS}</p></div>
    </section>${cta('<button class="primary" data-go="camera-start">Start a test</button>')}`)
  },

  hand() {
    show(`${steps(1, 3)}<h1>Which hand are you testing?</h1><p class="sub">Test one hand at a time. Your doctor usually checks both.</p>
      <div class="choices">${['right', 'left'].map((h) => `<button class="choice" data-hand="${h}" aria-pressed="${state.hand === h}">${h === 'right' ? 'Right hand' : 'Left hand'}</button>`).join('')}</div>
      ${cta(`<button class="primary" data-go="med" ${state.hand ? '' : 'disabled'}>Next</button>`)}`)
  },

  med() {
    const opts = [['on', 'On', 'Medication is working, moving fairly well'], ['on-dyskinesia', 'On, with troublesome dyskinesia', 'Working, but with unwanted, bothersome movements'], ['off', 'Off', 'Medication has worn off, or not taken yet'], ['unsure', 'Not sure', 'That is fine — it still helps']]
    show(`${steps(2, 3)}<h1>How is your medication right now?</h1><p class="sub">These are the states of a standard home motor diary. Tagging tests this way lets you compare them later.</p>
      <div class="choices">${opts.map(([v, t, s]) => `<button class="choice" data-med="${v}" aria-pressed="${state.medState === v}"><span>${t}<small>${s}</small></span></button>`).join('')}</div>
      <label class="check"><input type="checkbox" id="first" ${state.beforeFirstDose ? 'checked' : ''}> Before my first dose today</label>
      <p class="row"><label for="mins" class="sub">Minutes since last dose (optional)</label><input id="mins" type="number" min="0" max="1440" inputmode="numeric" value="${state.minutesSinceDose ?? ''}"></p>
      ${cta(`<button class="primary" data-go="${state.source === 'file' ? 'file' : 'camera'}" ${state.medState ? '' : 'disabled'}>Next</button>`)}`)
  },

  async camera() {
    state.source = 'camera'; state.sample = false
    const my = show(`${steps(3, 3)}<h1>Show your ${state.hand ?? 'right'} hand inside the box</h1>
      <div class="howto"><video src="docs/sample-synthetic.webm" autoplay loop muted playsinline aria-label="Example of the tapping movement"></video><p class="note">Tap index finger on thumb — <b>fast and as wide open as you can</b>, for 10 seconds. Sit about an arm's length away, palm turned slightly toward the camera, in good light.</p></div>
      <div class="stage"><video id="v" playsinline muted></video><canvas id="ov"></canvas><div class="guide"></div><div class="chip" id="chip">Starting camera…</div><div class="timer" id="timer"></div></div>
      <label class="check"><input type="checkbox" id="auto" ${state.autoStart ? 'checked' : ''}> Start by itself when my hand is steady (no button needed)</label>
      <p class="small" id="hint">You will hear a beep at the start and at the end.</p>
      ${cta('<button class="primary" id="go" disabled>Start 10-second test</button>')}`)
    const video = document.getElementById('v'), ov = document.getElementById('ov'), chip = document.getElementById('chip'), go = document.getElementById('go'), timer = document.getElementById('timer')
    document.getElementById('auto').onchange = (e) => { state.autoStart = e.target.checked }
    let tr, stop
    try {
      ;[tr, stop] = await Promise.all([tracker(), startCamera(video)])
    } catch (e) {
      if (my !== session) return
      chip.textContent = 'Camera unavailable'
      document.getElementById('hint').innerHTML = `We could not open a camera (${esc(e.message || e.name)}). Allow camera access in your browser, or <button class="link" data-go="file">analyse a video file instead</button>.`
      return
    }
    if (my !== session) { stop(); return } // user left while the camera was starting
    stopCamera = stop
    ov.width = video.videoWidth; ov.height = video.videoHeight
    const g = ov.getContext('2d')
    const recent = []
    let phase = 'aim', t0 = 0, steadySince = 0, frames = [], lastBeep = 0
    const COUNT = 5
    const startCount = () => { phase = 'count'; t0 = performance.now(); go.disabled = true; go.textContent = 'Get ready…' }
    const loop = () => {
      if (my !== session || !stopCamera) return
      const now = performance.now()
      const r = tr.detect(video, now)
      drawHand(g, ov, r.image)
      recent.push(r.lm && r.handScale >= 0.06 ? 1 : 0); if (recent.length > 30) recent.shift()
      const steady = recent.length >= 20 && recent.reduce((a, b) => a + b, 0) / recent.length >= 0.8
      if (phase === 'aim') {
        chip.className = 'chip' + (steady ? ' ok' : ''); chip.textContent = steady ? 'Hand found ✓' : r.lm ? 'Move your hand closer' : 'Show your hand'
        go.disabled = !steady
        steadySince = steady ? steadySince || now : 0
        if (state.autoStart && steady && now - steadySince > 2000) startCount()
      } else if (phase === 'count') {
        const left = COUNT - (now - t0) / 1000
        const sec = Math.ceil(left)
        timer.textContent = left > 0 ? sec : ''
        if (left > 0 && sec !== lastBeep) { lastBeep = sec; beep(sec === 1 ? 660 : 440, 0.08) }
        chip.textContent = 'Get ready…'
        if (left <= 0) { phase = 'rec'; t0 = now; frames = []; go.textContent = 'Recording…'; beep(880, 0.25) }
      } else if (phase === 'rec') {
        const t = (now - t0) / 1000
        frames.push({ t, lm: r.lm, handScale: r.handScale })
        timer.textContent = Math.max(0, 10 - t).toFixed(0)
        chip.className = 'chip ok'; chip.textContent = 'Tap fast and big!'
        if (t >= 10) { phase = 'done'; beep(880, 0.4); finish(frames); return }
      }
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(loop); else requestAnimationFrame(loop)
    }
    go.onclick = startCount
    loop()
  },

  file() {
    state.source = 'file'; state.sample = false
    show(`${steps(3, 3)}<h1>Analyse a video file</h1><p class="sub">Choose a short video (10–12 s) of the finger-tapping test, recorded at 30 frames per second or more. The first 10 seconds are analysed. It is read inside this tab and never uploaded.</p>
      <div class="card"><input type="file" id="f" accept="video/*" aria-label="Choose a video"></div>
      <div class="stage file" hidden id="st"><video id="v" playsinline muted></video><canvas id="ov"></canvas><div class="chip" id="chip"></div></div>
      ${cta('<button class="secondary" data-go="home">Back</button>')}`)
    document.getElementById('f').onchange = (e) => { const file = e.target.files[0]; if (file) analyseFile(URL.createObjectURL(file), file.name) }
  },

  sample() {
    state.source = 'file'; state.sample = true; state.hand = 'right'; state.medState = 'unsure'
    show(`<h1>Sample recording</h1><p class="sub">A <b>synthetic 3D hand</b> (no real person) tapping about 3 times per second while the taps shrink. We know the true answer for this clip, so you can compare it with what TapTen measures.</p>
      <div class="stage file" id="st"><video id="v" playsinline muted></video><canvas id="ov"></canvas><div class="chip" id="chip"></div></div>`)
    // Loaded as a blob so seeking works on any static host (some servers ignore HTTP Range requests).
    fetch('docs/sample-synthetic.webm').then((r) => r.blob()).then((b) => analyseFile(URL.createObjectURL(b), 'sample-synthetic.webm', true))
      .catch(() => { const c = document.getElementById('chip'); if (c) c.textContent = 'Sample unavailable offline' })
  },

  async result() {
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
    const v = sizeVerdict(m.decrementPct)
    const other = state.hand === 'left' ? 'right' : 'left'
    const my = show(`<section class="stack">
      <div><p class="sub">${state.hand === 'left' ? 'Left' : 'Right'} hand · ${esc(MED_LABEL[state.medState] ?? 'Not sure')}${state.sample ? ' · <span class="badge">SAMPLE — synthetic hand</span>' : ''}</p>
      <div class="big">${m.taps}<small>taps in 10 s</small></div><p class="verdict">${esc(v.text)}</p></div>
      <div id="truth"></div>
      <div class="grid2">
        <div class="stat"><b>${fixed(m.rateHz, 1)}</b><span>taps per second</span></div>
        <div class="stat"><b>${pct(m.decrementPct)}</b><span>size change, first 3 → last 3 taps</span></div>
        <div class="stat"><b>${fixed(m.slopePctPerTap, 1)}%</b><span>size trend per tap (all taps)</span></div>
        <div class="stat"><b>${m.hesitations}</b><span>pauses (gaps over twice the usual)</span></div>
      </div>
      <div class="card"><b>Size of each tap</b>${tapBarsSvg(taps)}</div>
      <div class="card"><b>Finger opening over 10 seconds</b>${waveformSvg(series, taps)}</div>
      <div class="card warnbox"><p class="small"><b>${esc(SAFETY)}</b> ${esc(UNKNOWN_NORMS)} One test can be off by about ±6 points in size change; look at several tests.</p></div>
      <details><summary>Details and how this was measured</summary>
        <table><tbody>
        <tr><th>Typical tap size (swing, % of palm length)</th><td>${m.amplitude === null ? '—' : Math.round(m.amplitude * 100) + '%'} <span class="note">— depends on hand angle; compare tests taken the same way</span></td></tr>
        <tr><th>Rhythm unevenness (spread of gaps)</th><td>${fixed(m.rhythmCv, 2)}</td></tr>
        <tr><th>Size unevenness (spread of sizes)</th><td>${fixed(m.amplitudeCv, 2)}</td></tr>
        <tr><th>Hand found</th><td>${Math.round(q.detectRate * 100)}% of frames</td></tr>
        <tr><th>Frame rate</th><td>${fixed(q.fps, 0)} fps</td></tr></tbody></table>
        <p class="small">Opening = 3D distance between thumb tip and index tip divided by the wrist-to-middle-knuckle (palm) length, so moving closer to the camera does not change it. A tap is counted when the fingers close by at least a quarter of this recording's own opening range (and at least 12% of palm length); single-frame glitches and tiny swings are ignored. Not a diagnosis.</p>
      </details>
    </section>${cta(state.sample
      ? '<button class="primary" data-go="camera-start">Try it with your own hand</button><button class="secondary" data-go="home">Done</button>'
      : `<button class="primary" id="save">Save to my diary</button><button class="secondary" id="other">Save and test my ${other} hand</button>`)}`)
    if (state.sample) {
      try {
        const t = await (await fetch('docs/sample-truth.json')).json()
        if (my === session) document.getElementById('truth').innerHTML = `<div class="card truth"><b>True answer for this clip:</b> ${t.taps} taps · size change ${pct(t.decrementPct)}<br><span class="note">Measured above: ${m.taps} taps · ${pct(m.decrementPct)}. Sample results are not saved to your diary.</span></div>`
      } catch { /* offline */ }
      return
    }
    const save = () => diary.add({ hand: state.hand ?? 'right', medState: state.medState ?? 'unsure', minutesSinceDose: state.minutesSinceDose, beforeFirstDose: state.beforeFirstDose, metrics: m, quality: q, note: state.source === 'file' ? `video: ${state.fileName}` : '' })
    document.getElementById('save').onclick = () => { save(); go('diary') }
    document.getElementById('other').onclick = () => { save(); state.hand = other; go(state.source === 'file' ? 'file' : 'camera') }
  },

  diary() {
    const s = diary.list()
    show(`<h1>My diary ${hasExample() ? '<span class="badge">EXAMPLE DATA — fictional</span>' : ''}</h1><p class="sub">${s.length} test${s.length === 1 ? '' : 's'} in this browser. Shapes and colours show the medication state.</p>
      ${s.length ? `${medLegend()}
      <div class="card"><b>Taps per second</b>${trendSvg(s, 'rateHz', { label: 'Taps per second', fmt: (v) => v.toFixed(1) })}</div>
      <div class="card"><b>Size change, first → last taps (%)</b>${trendSvg(s, 'decrementPct', { label: 'Size change', fmt: (v) => Math.round(v) + '%' })}</div>
      <div class="card"><b>Taps per second by minutes since last dose</b>${doseScatterSvg(diary.sheet().doseTime) || '<p class="note">Add “minutes since last dose” to see this chart.</p>'}</div>
      <details><summary>All tests</summary><table><thead><tr><th>When</th><th>Hand</th><th>Medication</th><th>Min. since dose</th><th>Taps</th><th>Size Δ</th><th></th></tr></thead><tbody>
      ${[...s].reverse().map((x) => `<tr><td>${esc(x.at.slice(0, 16).replace('T', ' '))}</td><td>${x.hand === 'left' ? 'Left' : 'Right'}</td><td>${esc(MED_LABEL[x.medState] ?? x.medState)}${x.beforeFirstDose ? ' (before 1st dose)' : ''}</td><td>${x.minutesSinceDose ?? '—'}</td><td>${x.metrics.taps}</td><td>${pct(x.metrics.decrementPct)}</td><td><button class="link" data-del="${x.id}" aria-label="Delete this test">Delete</button></td></tr>`).join('')}
      </tbody></table></details>
      <div class="row noprint"><button class="secondary" id="exp">Export my data</button><label class="secondary" style="display:inline-flex;align-items:center;cursor:pointer">Import data<input type="file" id="imp" accept="application/json" hidden></label>${hasExample() ? '<button class="secondary" id="unex">Remove example data</button>' : ''}<button class="secondary" id="wipe">Delete everything</button></div>`
      : `<div class="card"><p>No tests yet. Take your first 10-second test, or load an example diary (fictional data) to see what the clinic sheet looks like.</p><div class="row"><button class="secondary" id="demo">Load example diary</button><label class="secondary" style="display:inline-flex;align-items:center;cursor:pointer">Import data<input type="file" id="imp" accept="application/json" hidden></label></div></div>`}
      ${cta(s.length ? '<button class="primary" data-go="sheet">Make my clinic sheet</button><button class="secondary" data-go="camera-start">New test</button>' : '<button class="primary" data-go="camera-start">Start a test</button>')}`)
    document.getElementById('exp')?.addEventListener('click', () => download('tapten-diary.json', diary.exportJson()))
    document.getElementById('wipe')?.addEventListener('click', () => { if (confirm('Delete all tests in this browser? This cannot be undone.')) { diary.wipe(); go('diary', true) } })
    document.getElementById('demo')?.addEventListener('click', () => { loadExampleDiary(); go('diary', true) })
    document.getElementById('unex')?.addEventListener('click', () => { s.filter((x) => x.note === 'example').forEach((x) => diary.remove(x.id)); go('diary', true) })
    document.getElementById('imp')?.addEventListener('change', async (e) => {
      try { const n = diary.importJson(await e.target.files[0].text()); alert(`Imported ${n} test(s).`) } catch (err) { alert(`Could not import: ${err.message}`) }
      go('diary', true)
    })
    app.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { diary.remove(b.dataset.del); go('diary', true) }))
  },

  sheet() {
    const sh = diary.sheet(), s = diary.list()
    let name = ''; try { name = localStorage.getItem('tapten.name') ?? '' } catch { /* blocked */ }
    show(`<article class="sheet card"><h1 style="margin-top:0">Finger-tapping home record ${hasExample() ? '<span class="badge">EXAMPLE DATA</span>' : ''}</h1>
      <p class="row noprint"><label for="nm" class="sub">Name on the sheet (optional, kept in this browser)</label><input id="nm" value="${esc(name)}" style="font-size:16px;padding:8px 10px;border-radius:10px;border:1px solid var(--line)"></p>
      <p><b id="nmv">${esc(name)}</b></p>
      <p class="small">${esc((sh.from ?? '').slice(0, 10))} to ${esc((sh.to ?? '').slice(0, 10))} · ${sh.total} tests · printed ${esc(sh.generatedAt.slice(0, 10))}</p>
      <table><thead><tr><th>Hand</th><th>Medication</th><th>Tests</th><th>Taps/s</th><th>Size change</th><th>Rhythm unevenness*</th></tr></thead><tbody>
      ${sh.groups.map((g) => `<tr><td>${g.hand === 'left' ? 'Left' : 'Right'}</td><td>${esc(g.medLabel)}</td><td>${g.n}</td><td>${fixed(g.rateHz, 1)}</td><td>${pct(g.decrementPct)}</td><td>${fixed(g.rhythmCv, 2)}</td></tr>`).join('')}
      </tbody></table><p class="small">Medians per group. Size change = mean size of the last 3 taps vs the first 3 taps in a 10-second test (one test can be off by about ±6 points). *Rhythm unevenness = how much the gaps between taps vary (standard deviation ÷ mean); 0 is perfectly even.</p>
      ${medLegend()}${trendSvg(s, 'rateHz', { label: 'Taps per second', h: 120 })}${doseScatterSvg(sh.doseTime, { h: 130 })}
      <table><thead><tr><th>Date · time</th><th>Hand</th><th>Medication</th><th>Min. since dose</th><th>Taps/s</th><th>Size Δ</th></tr></thead><tbody>
      ${sh.rows.slice(-12).map((x) => `<tr><td>${esc(x.at.slice(0, 16).replace('T', ' '))}</td><td>${x.hand === 'left' ? 'L' : 'R'}</td><td>${esc(x.medLabel)}${x.beforeFirstDose ? ' · before 1st dose' : ''}</td><td>${x.minutesSinceDose ?? '—'}</td><td>${fixed(x.rateHz, 1)}</td><td>${pct(x.decrementPct)}</td></tr>`).join('')}
      </tbody></table><p class="small">Last ${Math.min(12, sh.rows.length)} tests shown.</p>
      <p class="small"><b>${esc(sh.disclaimer)}</b> Recorded with TapTen (open source). Method: MediaPipe hand landmarks, thumb–index 3D distance ÷ palm length.</p></article>
      ${cta('<button class="primary" id="print">Print or save as PDF</button><button class="secondary" data-go="diary">Back</button>')}`)
    document.getElementById('print').onclick = () => window.print()
    document.getElementById('nm').oninput = (e) => { document.getElementById('nmv').textContent = e.target.value; try { localStorage.setItem('tapten.name', e.target.value) } catch { /* blocked */ } }
  },

  async about() {
    const my = show(`<h1>How it works</h1><div id="ab"><p class="small">Loading…</p></div>${cta('<button class="primary" data-go="camera-start">Start a test</button>')}`)
    let b = null
    try { b = await (await fetch('docs/bench-summary.json')).json() } catch { /* offline */ }
    if (my !== session) return
    document.getElementById('ab').innerHTML = `
      <p>1. <b>AI part:</b> a pre-trained hand-landmark model (Google MediaPipe, open source) finds 21 points on your hand in each camera frame — inside this browser tab. We did not train any model.</p>
      <p>2. <b>Our part:</b> turning those points into the measures clinicians look at. The <b>opening</b> is the 3D distance between thumb tip and index tip divided by palm length, so it does not change when you move closer or farther. Each close of the fingers is a tap; from the taps we compute speed, size, rhythm, pauses and the <b>size change from the first to the last taps</b>.</p>
      <p>3. A quality check refuses to give numbers when the hand was lost too often, the camera was too slow, or the hand was too small.</p>
      <h2>How accurate is it?</h2>
      ${b ? `<p>We do not have patient videos (collecting them needs ethics approval), so we built a <b>ground-truth benchmark</b>: a 3D hand model is animated with a known tap schedule (speed ${b.speeds}, size shrinking 0–60%, several viewpoints and distances, pauses, plus a degraded set with blur, dim light, sensor noise and 15 fps). The frames go through the <b>same model and the same analysis code</b> as the app (the camera/video plumbing is bypassed).</p>
      <div class="grid2"><div class="stat"><b>${b.cleanExact}/${b.cleanClips}</b><span>clean clips: exact tap count</span></div><div class="stat"><b>${b.hardExact}/${b.hardClips}</b><span>degraded clips: exact (${b.hardWithin1}/${b.hardClips} within ±1)</span></div>
      <div class="stat"><b>${b.decBias > 0 ? '+' : ''}${b.decBias} ± ${b.decLoa}</b><span>size-change bias ± 95% limits (points)</span></div><div class="stat"><b>${b.holdoutExact}/${b.holdoutClips}</b><span>held-out clips (never used for tuning): exact</span></div></div>
      <p class="small">Generated ${esc(b.generated)}. Every clip, including the misses: docs/bench-table.md in the repository. Limits: a synthetic hand is not a real patient — no skin texture, tremor or real lighting. Real-world accuracy still needs a study with people.</p>` : '<p class="small">Benchmark summary unavailable offline.</p>'}
      <h2>What it is not</h2><p>Not a diagnosis, not an MDS-UPDRS score, not a medical device. ${esc(UNKNOWN_NORMS)}</p>`
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

async function analyseFile(url, name, replay = false) {
  const my = session
  state.fileName = name
  const st = document.getElementById('st'), video = document.getElementById('v'), ov = document.getElementById('ov'), chip = document.getElementById('chip')
  st.hidden = false
  video.src = url
  chip.textContent = 'Loading hand tracker…'
  const tr = await tracker()
  await new Promise((res) => (video.readyState >= 1 ? res() : (video.onloadedmetadata = res)))
  if (my !== session) return
  ov.width = video.videoWidth; ov.height = video.videoHeight
  const g = ov.getContext('2d')
  chip.textContent = 'Reading frames… 0%'
  let frames
  try {
    frames = await framesFromVideo(video, tr, { onProgress: (p) => { chip.textContent = `Reading frames… ${Math.round(p * 100)}%` } })
  } catch (e) { chip.textContent = e.message; return }
  if (my !== session) return
  if (replay) { // replay the tracked landmarks on top of the video so the viewer sees what was measured
    for (const f of frames) { if (my !== session) return; video.currentTime = f.t; await new Promise((r) => (video.onseeked = r)); drawHand(g, ov, f.image); await new Promise((r) => setTimeout(r, 12)) }
  }
  finish(frames.map(({ t, lm, handScale }) => ({ t, lm, handScale })))
}

function finish(frames) { state.result = analyzeFrames(frames); go('result') }

function download(name, text) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function loadExampleDiary() {
  // Clearly labelled FICTIONAL data with realistic overlap between states, so visitors can see the diary and sheet.
  let s = 7; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const n = () => (r() + r() + r() - 1.5) * 1.15
  const base = Date.now() - 13 * 864e5
  const plan = [[7, 'off', 600, true], [10, 'on', 90, false], [14, 'unsure', 210, false], [18, 'on', 60, false]]
  for (let d = 0; d < 14; d++) {
    for (const [hour, med1, mins, first] of plan) {
      const med0 = med1 === 'unsure' && d % 2 ? 'off' : med1 // afternoon wearing-off on alternate days
      const med = med0 === 'on' && r() < 0.15 ? 'on-dyskinesia' : med0
      const off = med === 'off', uns = med === 'unsure'
      const rate = (off ? 2.4 : uns ? 2.8 : 3.0) + 0.35 * n()
      const dec = (off ? -24 : uns ? -16 : -10) + 9 * n()
      const metrics = { taps: Math.round(rate * 10), rateHz: rate, amplitude: (off ? 0.6 : 0.75) + 0.08 * n(), amplitudeCv: off ? 0.22 : 0.13, rhythmCv: (off ? 0.18 : 0.11) + 0.03 * n(), decrementPct: dec, slopePctPerTap: dec / 30, hesitations: off && r() < 0.4 ? 1 : 0 }
      diary.addAt(new Date(base + d * 864e5 + hour * 36e5).toISOString(), { hand: 'right', medState: med, minutesSinceDose: first ? null : mins + Math.round(20 * n()), beforeFirstDose: first, metrics, quality: { detectRate: 0.99, fps: 30 }, note: 'example' })
    }
  }
}

function go(name, force = false) {
  if (name === 'camera-start') { state.source = 'camera'; name = 'hand' }
  if (location.hash.slice(1) === name) return route()
  location.hash = name
}
function route() { const name = location.hash.slice(1) || 'home'; (screens[name] ?? screens.home)() }

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-go],[data-hand],[data-med]')
  if (!t) return
  if (t.dataset.hand) { state.hand = t.dataset.hand; return screens.hand() }
  if (t.dataset.med) { readMedInputs(); state.medState = t.dataset.med; return screens.med() }
  if (t.dataset.go === 'file' && location.hash !== '#med') { state.source = 'file'; state.medState = null; return go('hand') }
  if (t.dataset.go === 'camera' || t.dataset.go === 'file') readMedInputs()
  if (t.dataset.go) go(t.dataset.go)
})
function readMedInputs() {
  const mins = document.getElementById('mins'), first = document.getElementById('first')
  if (mins) { const v = mins.value.trim(); const n = Number(v); state.minutesSinceDose = v === '' || !Number.isFinite(n) || n < 0 || n > 1440 ? null : Math.round(n) }
  if (first) state.beforeFirstDose = first.checked
}
document.addEventListener('change', (e) => { if (e.target.id === 'mins' || e.target.id === 'first') readMedInputs() })
window.addEventListener('hashchange', route)
route()
