// UI layer: screens and wiring. Domain logic lives in src/domain, use cases in src/application.
import { analyzeFrames } from '../application/analyze.js'
import { createDiaryService } from '../application/diaryService.js'
import { createTestRun } from '../application/testRun.js'
import { REASON_TEXT } from '../domain/quality.js'
import { MED_LABEL } from '../domain/diary.js'
import { sizeText, compareWithOwn } from '../domain/verdict.js'
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

const pad2 = (n) => String(n).padStart(2, '0')
/** Local date-time for display (stored values are ISO/UTC). */
const fmtWhen = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` }
const fmtDay = (iso) => (iso ? fmtWhen(iso).slice(0, 10) : '')
let benchPromise = null
const bench = () => (benchPromise ??= fetch('docs/bench-summary.json').then((r) => r.json()).catch(() => null))
const errorLine = (b) => (b ? `On our synthetic-hand benchmark a single test's size change is typically within ±${Math.round(b.decMedianErr)} points, and 95% of tests are within ±${Math.round(b.decLoa)} points; accuracy on real hands is not yet known.` : 'Accuracy on real hands is not yet known.')
const pct = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${Math.round(v)}%`)
const fixed = (v, d = 1) => (v === null || v === undefined ? '—' : Number(v).toFixed(d))
const SAFETY = 'Do not change your medication based on these numbers — bring them to your neurologist. This test does not detect stroke: if you notice sudden new weakness or numbness on one side, a drooping face or trouble speaking, call emergency services.'
const UNKNOWN_NORMS = 'Normal ranges for this home test are not known yet, and it cannot tell whether someone has Parkinson\'s.'

function cta(html) { return `<div class="cta"><div class="inner">${html}</div></div>` }
function steps(n, of) { return `<div class="steps" aria-label="Step ${n} of ${of}">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>` }
function show(html, keepScroll = false) { cleanup(); session++; const y = window.scrollY; app.innerHTML = html; if (keepScroll) window.scrollTo(0, y); else { app.focus(); window.scrollTo(0, 0) } return session }
function cleanup() { if (stopCamera) { stopCamera(); stopCamera = null } }
const hasExample = () => diary.list().some((x) => x.note === 'example')
const onlyExample = () => { const l = diary.list(); return l.length > 0 && l.every((x) => x.note === 'example') }

const screens = {
  home() {
    const n = diary.list().length
    show(`<section class="stack">
      <div><h1>A 10-second finger-tapping test, measured by your webcam.</h1><p class="sub" style="margin:0 0 8px">For people living with Parkinson's — a private record to bring to your neurologist.</p>
      <div class="howto"><video src="docs/sample-synthetic.webm" autoplay loop muted playsinline aria-label="The tapping movement"></video><p class="note">Tap your index finger on your thumb, fast and as wide as you can, for 10 seconds. TapTen shows whether the taps get <b>smaller</b> or <b>slower</b> — and keeps the record on your device for your next appointment.</p></div></div>
      <div class="links"><button class="secondary" data-go="sample" style="justify-self:start">▶ Try a sample recording (no webcam needed)</button><button class="link" data-go="file">Analyse a video file</button><button class="link" data-go="diary">My diary (${n} test${n === 1 ? '' : 's'})</button><button class="link" data-go="about">How it works · accuracy</button></div>
      <div class="card"><b>🔒 Your video never leaves this device.</b><p class="small">The hand tracker runs inside this browser tab. Nothing is uploaded, there is no account, and your diary is stored only in this browser on this device — use “Export” to keep a copy.</p></div>
      <div class="card warnbox"><b>A tracking tool, not a diagnosis.</b><p class="small">For people already living with Parkinson's (or their care partners) who want a record to bring to the clinic. It does not give an MDS-UPDRS score and is a research prototype, not a cleared or approved medical device. ${UNKNOWN_NORMS}</p></div>
    </section>${cta('<button class="primary" data-go="camera-start">Start a test</button>')}`)
  },

  hand() {
    show(`${steps(1, 3)}<h1>Which hand are you testing?</h1><p class="sub">Test one hand at a time. Your doctor usually checks both.</p>
      <div class="choices">${['right', 'left'].map((h) => `<button class="choice" data-hand="${h}" aria-pressed="${state.hand === h}">${h === 'right' ? 'Right hand' : 'Left hand'}</button>`).join('')}</div>
      <p class="small">Tap your choice — the next step opens by itself.</p>`)
  },

  med(keepScroll = false) {
    const opts = [['on', 'On', 'Moving well — no extra movements, or ones that do not bother you'], ['on-dyskinesia', 'On, with troublesome dyskinesia', 'Moving, but with unwanted, bothersome extra movements'], ['off', 'Off', 'Slow, stiff or hard to move'], ['unsure', 'Not sure', 'That is fine — it still helps']]
    show(`${steps(2, 3)}<h1>How is your movement right now?</h1><p class="sub">Tagging tests this way lets you compare them later.</p>
      <div class="choices">${opts.map(([v, t, s]) => `<button class="choice" data-med="${v}" aria-pressed="${state.medState === v}"><span>${t}<small>${s}</small></span></button>`).join('')}</div>
      <label class="check"><input type="checkbox" id="first" ${state.beforeFirstDose ? 'checked' : ''}> Before my first dose today</label>
      <p class="sub" style="margin-top:12px">Time since your last dose of Parkinson's medicine (optional)</p>
      <div class="row" role="group" aria-label="Time since last dose">${[[30, '30 min'], [60, '1 h'], [120, '2 h'], [180, '3 h'], [240, '4 h'], [360, '6 h']].map(([v, t]) => `<button class="secondary chipbtn" data-mins="${v}" aria-pressed="${state.minutesSinceDose === v}" ${state.beforeFirstDose ? 'disabled' : ''}>${t}</button>`).join('')}</div>
      <p class="row"><label for="mins" class="note">or minutes</label><input id="mins" type="number" min="0" max="1440" inputmode="numeric" value="${state.minutesSinceDose ?? ''}" ${state.beforeFirstDose ? 'disabled' : ''}></p>
      <p class="note">States adapted from the Hauser home motor diary. “Off” describes how you move, not whether you took a dose — that is the checkbox above.</p>
      ${cta(`<button class="primary" data-go="${state.source === 'file' ? 'file' : 'camera'}" ${state.medState ? '' : 'disabled'}>Next</button>`)}`, keepScroll)
  },

  async camera() {
    state.source = 'camera'; state.sample = false
    const my = show(`${steps(3, 3)}<h1>Show your ${state.hand ?? 'right'} hand inside the box</h1>
      <div class="howto"><video src="docs/sample-synthetic.webm" autoplay loop muted playsinline aria-label="Example of the tapping movement"></video><p class="note">Tap index finger on thumb — <b>fast and as wide open as you can</b>, for 10 seconds. Stand the laptop or phone up (lean a phone against a cup), sit about an arm's length away, palm turned slightly toward the camera, in good light.</p></div>
      <div class="stage"><video id="v" playsinline muted></video><canvas id="ov"></canvas><div class="guide"></div><div class="chip" id="chip">Starting camera…</div><div class="timer" id="timer"></div></div>
      <label class="check"><input type="checkbox" id="auto" ${state.autoStart ? 'checked' : ''}> Start by itself when my hand is in view and held still for 2 seconds (no button needed)</label>
      <p class="small" id="hint">You will hear a beep at the start and at the end.</p>
      ${cta('<button class="primary" id="go" disabled>Start 10-second test</button>')}`)
    const video = document.getElementById('v'), ov = document.getElementById('ov'), chip = document.getElementById('chip'), go = document.getElementById('go'), timer = document.getElementById('timer')
    let tr, stop
    chip.textContent = 'Loading hand tracker (≈19 MB, first time only)…'
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
    const recent = [], wrist = []
    const run = createTestRun({ autoStart: state.autoStart })
    document.getElementById('auto').onchange = (e) => { state.autoStart = e.target.checked; run.setAuto(e.target.checked) }
    let frames = [], lastBeep = 0
    go.onclick = () => { run.start(); go.disabled = true; go.textContent = 'Get ready…' }
    const loop = (_, meta) => {
      if (my !== session || !stopCamera) return
      // ONE clock: the camera frame's own timestamp when the browser provides it
      const now = meta?.mediaTime !== undefined ? meta.mediaTime * 1000 : performance.now()
      const r = tr.detect(video, now)
      drawHand(g, ov, r.image)
      recent.push(r.lm && r.handScale >= 0.06 ? 1 : 0); if (recent.length > 30) recent.shift()
      if (r.image) { wrist.push([r.image[0].x, r.image[0].y]); if (wrist.length > 30) wrist.shift() } else wrist.length = 0
      const spread = wrist.length >= 15 ? Math.max(...[0, 1].map((k) => { const xs = wrist.map((w) => w[k]); return Math.max(...xs) - Math.min(...xs) })) : 1
      const visible = recent.length >= 20 && recent.reduce((a, b) => a + b, 0) / recent.length >= 0.8
      const still = spread < 0.06
      const st = run.step(now, { visible, still })
      if (st.phase === 'aim') {
        chip.className = 'chip' + (visible && still ? ' ok' : ''); chip.textContent = visible && still ? 'Hand found ✓ — hold still' : visible ? 'Hold your hand still' : r.lm ? 'Move your hand closer' : 'Show your hand'
        go.disabled = !visible // the button only needs the hand in view; stillness is only for auto-start
      } else if (st.phase === 'count') {
        go.disabled = true; go.textContent = 'Get ready…'
        const sec = Math.ceil(st.left)
        timer.textContent = sec
        if (sec !== lastBeep) { lastBeep = sec; beep(sec === 1 ? 660 : 440, 0.08) }
        chip.textContent = 'Get ready…'
      } else if (st.phase === 'rec') {
        if (st.recT === 0) { frames = []; beep(880, 0.25); go.textContent = 'Recording…' }
        frames.push({ t: st.recT, lm: r.lm, handScale: r.handScale, side: r.side })
        timer.textContent = Math.max(0, st.left ?? 0).toFixed(0)
        chip.className = 'chip ok'; chip.textContent = 'Tap fast and big!'
      } else if (st.phase === 'done') {
        beep(880, 0.4); finish(frames); return
      }
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(loop); else requestAnimationFrame(() => loop())
    }
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
    const other = state.hand === 'left' ? 'right' : 'left'
    const earlier = state.sample ? [] : diary.list().filter((x) => x.note !== 'example' && x.hand === state.hand && x.medState === state.medState)
    const lowFps = q.fps < 24 // size swings are clipped at low frame rates (benchmark: 15-fps clips misread size by up to ±18 points)
    const cmp = lowFps ? null : compareWithOwn(m.decrementPct, earlier)
    const speed = m.speedChangePct === null ? '—' : m.speedChangePct <= -10 ? `${Math.round(-m.speedChangePct)}% slower` : m.speedChangePct >= 10 ? `${Math.round(m.speedChangePct)}% faster` : 'about the same'
    // Hand-side warning is OFF until verified on real hands (MediaPipe's label convention for un-mirrored webcam
    // frames is only checked on our synthetic right hand); the label is still computed and kept for later.
    const sideWarn = false
    const my = show(`<section class="stack">
      <div><p class="sub">${state.hand === 'left' ? 'Left' : 'Right'} hand · ${esc(MED_LABEL[state.medState] ?? 'Not sure')}${state.sample ? ' · <span class="badge">SAMPLE — synthetic hand</span>' : ''}</p>
      <div class="big">${m.taps}<small>taps in 10 s</small></div><p class="verdict">${lowFps ? 'Tap count and speed are shown; size is not reliable at this camera speed.' : esc(sizeText(m.decrementPct))}</p>${lowFps ? '' : '<p class="note">A single reading can be off by about ±19 points, and strong shrinking tends to be under-read.</p>'}
      <p class="small" ${state.sample ? 'hidden' : ''}>${cmp ? `Compared with your ${cmp.n} earlier tests (same hand and state): <b>${cmp.where}</b> (your usual: ${pct(cmp.lo)} to ${pct(cmp.hi)}).` : 'After 3 tests with the same hand and state, TapTen compares new tests with your own usual range.'}</p></div>
      ${sideWarn ? `<div class="card warnbox"><b>This looks like your ${r.side.label} hand.</b><p class="small">You chose your ${state.hand} hand. If you tapped with the ${r.side.label} hand, switch the label before saving.</p><button class="secondary" id="swap">Label it as ${r.side.label} hand</button></div>` : ''}
      <div id="truth"></div>
      <div class="grid2">
        <div class="stat"><b>${fixed(m.rateHz, 1)}</b><span>taps per second</span></div>
        <div class="stat"><b>${lowFps ? '—' : pct(m.decrementPct)}</b><span>size change over 10 s (first 3 → last 3 taps)</span></div>
        <div class="stat"><b style="font-size:22px">${speed}</b><span>speed, first 3 → last 3 gaps</span></div>
        <div class="stat"><b>${m.hesitations}</b><span>pauses (gaps over twice the usual)</span></div>
      </div>
      <div class="card"><b>Size of each tap</b>${tapBarsSvg(taps)}</div>
      <div class="card"><b>Finger opening over 10 seconds</b>${waveformSvg(series, taps)}</div>
      <div class="card warnbox"><p class="small"><b>${esc(SAFETY)}</b> ${esc(UNKNOWN_NORMS)} <span id="err">Accuracy on real hands is not yet known.</span></p></div>
      <details><summary>Details and how this was measured</summary>
        <table><tbody>
        <tr><th>Size change within the first 10 taps (closer to the clinic's 10-tap rating)</th><td>${lowFps ? '—' : pct(m.decrement10Pct)}</td></tr>
        <tr><th>Size trend per tap (all taps)</th><td>${fixed(m.slopePctPerTap, 1)}%</td></tr>
        <tr><th>Typical tap size (swing, % of palm length)</th><td>${m.amplitude === null ? '—' : Math.round(m.amplitude * 100) + '%'} <span class="note">— depends on hand angle; compare tests taken the same way</span></td></tr>
        <tr><th>Rhythm unevenness (spread of gaps)</th><td>${fixed(m.rhythmCv, 2)}</td></tr>
        <tr><th>Size unevenness (spread of sizes)</th><td>${fixed(m.amplitudeCv, 2)}</td></tr>
        <tr><th>Tiny off-rhythm movements not counted</th><td>${m.ignored ?? 0}</td></tr>
        <tr><th>Hand found</th><td>${Math.round(q.detectRate * 100)}% of frames</td></tr>
        <tr><th>Frame rate</th><td>${fixed(q.fps, 0)} fps</td></tr></tbody></table>
        <p class="small">Opening = 3D distance between thumb tip and index tip divided by the wrist-to-middle-knuckle (palm) length, so moving closer to the camera does not change it. A tap is counted when the fingers close by at least a quarter of this recording's own opening range (and at least 12% of palm length). Tiny movements that break the rhythm (single-frame glitches) are not counted; small taps that keep the rhythm are kept. Not a diagnosis.</p>
      </details>
    </section>${cta(state.sample
      ? '<button class="primary" data-go="camera-start">Try it with your own hand</button><button class="secondary" data-go="home">Done</button>'
      : `<button class="primary" id="save">Save to my diary</button><button class="secondary" id="other">Save and test my ${other} hand</button>`)}`)
    bench().then((b) => { const e = document.getElementById('err'); if (my === session && e) e.textContent = errorLine(b) })
    if (state.sample) {
      try {
        const t = await (await fetch('docs/sample-truth.json')).json()
        if (my === session) document.getElementById('truth').innerHTML = `<div class="card truth"><b>True answer for this clip:</b> ${t.taps} taps · size change ${pct(t.decrementPct)}<br><span class="note">Measured above: ${m.taps} taps · ${pct(m.decrementPct)}. Sample results are not saved to your diary.</span></div>`
      } catch { /* offline */ }
      return
    }
    document.getElementById('swap')?.addEventListener('click', () => { state.hand = r.side.label; screens.result() })
    // size is not stored when the camera ran below 24 fps (not reliable), so it never enters trends, medians or comparisons
    const stored = lowFps ? { ...m, decrementPct: null, decrement10Pct: null, slopePctPerTap: null, amplitude: null } : m
    const save = () => diary.add({ hand: state.hand ?? 'right', medState: state.medState ?? 'unsure', minutesSinceDose: state.beforeFirstDose ? null : state.minutesSinceDose, beforeFirstDose: state.beforeFirstDose, metrics: stored, quality: q, note: state.source === 'file' ? `video file (frame rate not verified): ${state.fileName}` : '' })
    document.getElementById('save').onclick = () => { save(); go('diary') }
    document.getElementById('other').onclick = () => { save(); state.hand = other; go(state.source === 'file' ? 'file' : 'camera') }
  },

  diary() {
    const s = diary.list()
    show(`<h1>My diary ${hasExample() ? '<span class="badge">EXAMPLE DATA — fictional</span>' : ''}</h1><p class="sub">${s.length} test${s.length === 1 ? '' : 's'} in this browser. Shapes and colours show the movement state.${hasExample() ? ' Example data is invented to show the layout — whether real tests separate like this is not yet known.' : ''}</p><p class="note">On a shared computer, export and then delete your data when you are done.</p>
      ${s.length ? `${medLegend()}
      <div class="card"><b>Taps per second</b>${trendSvg(s, 'rateHz', { label: 'Taps per second', fmt: (v) => v.toFixed(1) })}</div>
      <div class="card"><b>Size change, first → last taps (%)</b>${trendSvg(s, 'decrementPct', { label: 'Size change', fmt: (v) => Math.round(v) + '%' })}</div>
      <div class="card"><b>Taps per second by minutes since last dose</b>${doseScatterSvg(diary.sheet().doseTime) || '<p class="note">Add “minutes since last dose” to see this chart.</p>'}</div>
      <details><summary>All tests</summary><table><thead><tr><th>When</th><th>Hand</th><th>Medication</th><th>Min. since dose</th><th>Taps</th><th>Size Δ</th><th></th></tr></thead><tbody>
      ${[...s].reverse().map((x) => `<tr><td>${esc(fmtWhen(x.at))}</td><td>${x.hand === 'left' ? 'Left' : 'Right'}</td><td>${esc(MED_LABEL[x.medState] ?? x.medState)}${x.beforeFirstDose ? ' (before 1st dose)' : ''}</td><td>${x.minutesSinceDose ?? '—'}</td><td>${x.metrics.taps}</td><td>${pct(x.metrics.decrementPct)}</td><td><button class="link" data-del="${x.id}" aria-label="Delete this test">Delete</button></td></tr>`).join('')}
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
    const real = diary.list().filter((x) => x.note !== 'example')
    const s = real.length ? real : diary.list() // never mix fictional example data into a real record
    const sh = diary.sheetOf(s)
    let name = ''; try { name = localStorage.getItem('tapten.name') ?? '' } catch { /* blocked */ }
    show(`<article class="sheet card"><h1 style="margin-top:0">Finger-tapping home record ${onlyExample() ? '<span class="badge">EXAMPLE DATA</span>' : ''}</h1>
      <p class="row noprint"><label for="nm" class="sub">Name on the sheet (optional, kept in this browser)</label><input id="nm" value="${esc(name)}" style="font-size:16px;padding:8px 10px;border-radius:10px;border:1px solid var(--line)"></p>
      <p><b id="nmv">${esc(name)}</b></p>
      <p class="small">${esc(fmtDay(sh.from))} to ${esc(fmtDay(sh.to))} · ${sh.total} tests · printed ${esc(fmtDay(sh.generatedAt))}</p>
      <table><thead><tr><th>Hand</th><th>Medication</th><th>Tests</th><th>Taps/s</th><th>Size change</th><th>Rhythm unevenness*</th></tr></thead><tbody>
      ${sh.groups.map((g) => `<tr><td>${g.hand === 'left' ? 'Left' : 'Right'}</td><td>${esc(g.medLabel)}${g.medState === 'on-dyskinesia' ? ' †' : ''}</td><td>${g.n}${g.n < 5 ? ' (few)' : ''}</td><td>${fixed(g.rateHz, 1)}</td><td>${pct(g.decrementPct)}</td><td>${fixed(g.rhythmCv, 2)}</td></tr>`).join('')}
      </tbody></table><p class="small">Medians per group. Size change = mean size of the last 3 taps vs the first 3 taps in a 10-second test; strong shrinking tends to be under-read. *Rhythm unevenness = how much the gaps between taps vary (standard deviation ÷ mean); 0 is perfectly even. “(few)” = fewer than 5 tests: treat the median with caution. † Dyskinesia can disturb the measurement.</p><p class="small" id="err2"></p>
      ${medLegend()}<p class="small" style="margin:8px 0 0"><b>Taps per second, by date</b></p>${trendSvg(s, 'rateHz', { label: 'Taps per second', h: 110 })}<p class="small" style="margin:8px 0 0"><b>Taps per second, by minutes since last dose</b></p>${doseScatterSvg(sh.doseTime, { h: 120 })}
      <table><thead><tr><th>Date · time</th><th>Hand</th><th>Medication</th><th>Min. since dose</th><th>Taps/s</th><th>Size Δ</th></tr></thead><tbody>
      ${sh.rows.slice(-8).map((x) => `<tr><td>${esc(fmtWhen(x.at))}</td><td>${x.hand === 'left' ? 'L' : 'R'}</td><td>${esc(x.medLabel)}${x.beforeFirstDose ? ' · before 1st dose' : ''}</td><td>${x.minutesSinceDose === null ? '—' : x.minutesSinceDose >= 360 ? '6 h+' : x.minutesSinceDose}</td><td>${fixed(x.rateHz, 1)}</td><td>${pct(x.decrementPct)}</td></tr>`).join('')}
      </tbody></table><p class="small">Last ${Math.min(8, sh.rows.length)} tests shown; times are local.</p>
      <p class="small"><b>${esc(sh.disclaimer)}</b> Recorded with TapTen (open source). Method: MediaPipe hand landmarks, thumb–index 3D distance ÷ palm length.</p></article>
      ${cta('<button class="primary" id="print">Print or save as PDF</button><button class="secondary" data-go="diary">Back</button>')}`)
    bench().then((b) => { const e = document.getElementById('err2'); if (e) e.textContent = errorLine(b) })
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
      ${b ? `<p>We do not have patient videos (collecting them needs ethics approval), so we built a <b>ground-truth benchmark</b>: a 3D hand model is animated with a known tap schedule (speed ${b.speeds}, size shrinking 0–90%, slowing, several viewpoints and distances, pauses, tremor, plus a degraded set with blur, dim light, sensor noise and 15 fps). Two held-out sets were frozen before running; the second (severe, slowing, very slow taps) was pre-registered in its own commit. The frames go through the <b>same model and the same analysis code</b> as the app (the camera/video plumbing is bypassed).</p>
      <div class="grid2"><div class="stat"><b>${b.cleanExact}/${b.cleanClips}</b><span>clean clips: exact tap count</span></div><div class="stat"><b>${b.holdout2Exact}/${b.holdout2Clips}</b><span>held-out 2 (severe, slowing, &lt;1 tap/s): exact (${b.holdout2Within1} within ±1)</span></div>
      <div class="stat"><b>${b.decBias > 0 ? '+' : ''}${b.decBias} ± ${b.decLoa}</b><span>size-change bias ± 95% limits (points)</span></div><div class="stat"><b>${b.holdoutExact}/${b.holdoutClips}</b><span>held-out 1: exact tap count</span></div></div>
      <p class="small">Our own target (exact count on ≥ 90% of clips): ${b.allExact}/${b.positiveClips} = ${b.allExactPct}% — ${b.s1Pass ? 'met' : 'not met'}. Degraded clips: ${b.hardExact}/${b.hardClips} exact. The quality gate refused ${b.negativeRejected} deliberately bad recordings.</p>
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
  finish(frames.map(({ t, lm, handScale, side }) => ({ t, lm, handScale, side })))
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
  const mid = new Date(); mid.setHours(0, 0, 0, 0)
  const base = mid.getTime() - 14 * 864e5 // local midnight two weeks ago → last example day is yesterday
  const plan = [[7, 'off', 600, true], [10, 'on', 90, false], [14, 'unsure', 210, false], [18, 'on', 60, false]]
  for (let d = 0; d < 14; d++) {
    for (const [hour, med1, mins, first] of plan) {
      const med0 = med1 === 'unsure' && d % 2 ? 'off' : med1 // afternoon wearing-off on alternate days
      const med = med0 === 'on' && r() < 0.15 ? 'on-dyskinesia' : med0
      const off = med === 'off', uns = med === 'unsure'
      const rate = (off ? 2.4 : uns ? 2.8 : 3.0) + 0.35 * n()
      const dec = (off ? -24 : uns ? -16 : -10) + 9 * n()
      const metrics = { taps: Math.round(rate * 10), rateHz: rate, amplitude: (off ? 0.6 : 0.75) + 0.08 * n(), amplitudeCv: off ? 0.22 : 0.13, rhythmCv: (off ? 0.18 : 0.11) + 0.03 * n(), decrementPct: dec, slopePctPerTap: dec / 30, hesitations: off && r() < 0.4 ? 1 : 0 }
      diary.addAt(new Date(new Date(base).setDate(new Date(base).getDate() + d) + hour * 36e5).toISOString(), { hand: 'right', medState: med, minutesSinceDose: first ? null : mins + Math.round(20 * n()), beforeFirstDose: first, metrics, quality: { detectRate: 0.99, fps: 30 }, note: 'example' })
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
  const c = e.target.closest('[data-mins]')
  if (c) { state.minutesSinceDose = Number(c.dataset.mins); return screens.med(true) }
  const t = e.target.closest('[data-go],[data-hand],[data-med]')
  if (!t) return
  if (t.dataset.hand) { state.hand = t.dataset.hand; return go('med') }
  if (t.dataset.med) { readMedInputs(); state.medState = t.dataset.med; return screens.med(true) }
  if (t.dataset.go === 'file' && location.hash !== '#med') { state.source = 'file'; state.medState = null; return go('hand') }
  if (t.dataset.go === 'camera' || t.dataset.go === 'file') readMedInputs()
  if (t.dataset.go) go(t.dataset.go)
})
function readMedInputs() {
  const mins = document.getElementById('mins'), first = document.getElementById('first')
  if (mins) { const v = mins.value.trim(); const n = Number(v); state.minutesSinceDose = v === '' || !Number.isFinite(n) || n < 0 || n > 1440 ? null : Math.round(n) }
  if (first) state.beforeFirstDose = first.checked
}
document.addEventListener('change', (e) => {
  if (e.target.id === 'mins' || e.target.id === 'first') readMedInputs()
  if (e.target.id === 'first') { if (state.beforeFirstDose) state.minutesSinceDose = null; screens.med(true) }
})
window.addEventListener('hashchange', route)
route()
