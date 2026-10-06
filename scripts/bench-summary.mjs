// docs/bench.json → docs/bench-summary.json + docs/bench-table.md + README.md (numbers are never typed by hand).
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const b = JSON.parse(readFileSync('docs/bench.json', 'utf8'))
const med = (xs) => { const s = [...xs].sort((a, c) => a - c), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const mean = (xs) => xs.reduce((a, c) => a + c, 0) / xs.length
const sd = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, c) => a + (c - m) ** 2, 0) / (xs.length - 1)) }
const r1 = (x) => Math.round(x * 10) / 10
const viewName = (v) => ['A', 'B', 'C'][[{ rx: 1.57, ry: 0, rz: 1.57 }, { rx: 0, ry: -1.57, rz: 0 }, { rx: -1.57, ry: -1.57, rz: 1.57 }].findIndex((w) => Math.abs(w.rx - v.rx) < 0.3 && Math.abs(w.ry - v.ry) < 0.3 && Math.abs(w.rz - v.rz) < 0.3)] ?? '?'

const rows = b.clips.map((c) => ({
  id: c.spec.id, set: c.spec.id[0], f: c.spec.f, dec: c.spec.decrement, view: viewName(c.spec.view), dist: c.spec.dist, pause: !!c.spec.pause, fps: c.spec.fps ?? 30,
  degrade: !!c.spec.degrade, tremor: !!c.spec.tremor, drop: c.spec.dropRate ?? 0, expectReject: !!c.spec.expectReject,
  gtTaps: c.gt.taps, estTaps: c.est.taps, gtRate: c.gt.rateHz, estRate: c.est.rateHz, gtDec: c.gt.decrementPct, estDec: c.est.decrementPct,
  gtAmp: c.gt.amplitude, estAmp: c.est.amplitude, gtSpeed: c.gt.speedChangePct ?? null, estSpeed: c.est.speedChangePct ?? null, fEnd: c.spec.fEnd ?? null, a0: c.spec.a0 ?? 0.9, gtHes: c.gt.hesitations, estHes: c.est.hesitations, q: c.quality.ok, reasons: c.quality.reasons,
}))
const pos = rows.filter((r) => !r.expectReject)
const of = (set) => pos.filter((r) => r.set === set)
const exact = (rs) => rs.filter((r) => r.estTaps === r.gtTaps).length
const within1 = (rs) => rs.filter((r) => Math.abs(r.estTaps - r.gtTaps) <= 1).length
const withDec = pos.filter((r) => r.estDec !== null && r.gtDec !== null)
const diffs = withDec.map((r) => r.estDec - r.gtDec)
const ampErrByView = Object.fromEntries(['A', 'B', 'C'].map((v) => [v, r1(100 * med(pos.filter((r) => r.view === v && r.estAmp && r.gtAmp).map((r) => r.estAmp / r.gtAmp - 1)))]))
const big = withDec.filter((r) => r.gtDec <= -15), flat = withDec.filter((r) => Math.abs(r.gtDec) < 5)
const severe = of('k').filter((r) => r.gtDec !== null && r.gtDec <= -60 && r.estDec !== null)
const slowing = pos.filter((r) => r.fEnd !== null && r.estSpeed !== null && r.gtSpeed !== null)
const biasByView = Object.fromEntries(['A', 'B', 'C'].map((v) => { const d = withDec.filter((r) => r.view === v).map((r) => r.estDec - r.gtDec); return [v, d.length ? r1(mean(d)) : null] }))
const paused = pos.filter((r) => r.gtHes > 0), notPaused = pos.filter((r) => r.gtHes === 0)
const neg = rows.filter((r) => r.expectReject)
const allExact = exact(pos)

const s = {
  generated: b.generated.slice(0, 10), clips: rows.length, positiveClips: pos.length,
  speeds: `${Math.min(...pos.map((r) => r.f))}–${Math.max(...pos.map((r) => r.f))} taps/s`,
  cleanClips: of('c').length, cleanExact: exact(of('c')), cleanWithin1: within1(of('c')),
  hardClips: of('d').length, hardExact: exact(of('d')), hardWithin1: within1(of('d')),
  holdout2Clips: of('k').length, holdout2Exact: exact(of('k')), holdout2Within1: within1(of('k')),
  severeClips: severe.length, severeDecMedianErr: severe.length ? r1(med(severe.map((r) => Math.abs(r.estDec - r.gtDec)))) : null,
  slowingClips: slowing.length, slowingDetected: `${slowing.filter((r) => r.estSpeed <= -10).length}/${slowing.length}`, slowingSpeedMedianErr: slowing.length ? r1(med(slowing.map((r) => Math.abs(r.estSpeed - r.gtSpeed)))) : null,
  decBiasByView: biasByView,
  holdoutClips: of('h').length, holdoutExact: exact(of('h')), holdoutWithin1: within1(of('h')),
  tremorClips: of('h').filter((r) => r.tremor).length, tremorExact: exact(of('h').filter((r) => r.tremor)),
  allExact, allExactPct: r1((100 * allExact) / pos.length), s1Target: 90, s1Pass: (100 * allExact) / pos.length >= 90,
  countMae: Math.round((pos.reduce((a, r) => a + Math.abs(r.estTaps - r.gtTaps), 0) / pos.length) * 100) / 100,
  decMedianErr: r1(med(diffs.map(Math.abs))), decMaxErr: r1(Math.max(...diffs.map(Math.abs))),
  decBias: r1(mean(diffs)), decLoa: r1(1.96 * sd(diffs)),
  ampErrByView, rateMedianErr: Math.round(med(pos.map((r) => Math.abs(r.estRate - r.gtRate))) * 100) / 100,
  shrinkingDetected: `${big.filter((r) => r.estDec <= -15).length}/${big.length}`, steadyNotFlagged: `${flat.filter((r) => r.estDec > -15).length}/${flat.length}`,
  pauseSensitivity: `${paused.filter((r) => r.estHes > 0).length}/${paused.length}`, pauseFalsePos: `${notPaused.filter((r) => r.estHes > 0).length}/${notPaused.length}`,
  negativeRejected: `${neg.filter((r) => !r.q).length}/${neg.length}`, positivePassed: `${pos.filter((r) => r.q).length}/${pos.length}`,
}
writeFileSync('docs/bench-summary.json', JSON.stringify(s, null, 1))

const sign = (x) => (x === null || x === undefined ? '—' : `${x > 0 ? '+' : ''}${Math.round(x)}%`)
let t = `# TapTen synthetic benchmark — every clip\n\nGenerated by \`node scripts/bench-summary.mjs\` from \`docs/bench.json\` (real MediaPipe Hand Landmarker on rendered frames, the app's own analysis code).\n\n`
t += `Sets: **c** clean · **d** degraded (blur, dim light, low contrast, sensor noise) · **h** held-out 1 (frozen, perturbed viewpoints, 1–5 taps/s; h21–h24 add a 5 Hz finger tremor) · **k** held-out 2 (pre-registered in commit 63a4d16 before running: severe 70–90 % decrement, slowing taps, < 1 tap/s, small taps from the start) · **n** negative (should be refused: hand lost 30 % of frames, 8 fps, hand 2.4 m away).\nNote: after round-2 review the glitch filter was changed (rhythm-aware, so severe small taps are kept); ALL sets below were re-run on that code. Held-out 1 was first run on the previous code (21/24 exact).\nViews A/B/C are three hand orientations (±0.25 rad jitter in h).\n\n`
t += `| clip | taps/s | true shrink | view | dist | fps | extra | true taps | measured | true size Δ | measured Δ | pauses true/meas | quality |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`
for (const r of rows) t += `| ${r.id} | ${r.f}${r.fEnd ? '→' + r.fEnd : ''}${r.a0 !== 0.9 ? ' (small)' : ''} | ${Math.round(r.dec * 100)}% | ${r.view} | ${r.dist} m | ${r.fps} | ${[r.degrade && 'degraded', r.pause && 'pause', r.tremor && 'tremor', r.drop && `hand lost ${r.drop * 100}%`].filter(Boolean).join(', ')} | ${r.gtTaps} | ${r.estTaps} | ${sign(r.gtDec)} | ${sign(r.estDec)} | ${r.gtHes}/${r.estHes} | ${r.q ? 'pass' : 'refused: ' + r.reasons.join(', ')} |\n`
writeFileSync('docs/bench-table.md', t)

const tests = Number((execSync('node --test tests/*.test.mjs 2>&1').toString().match(/ℹ pass (\d+)/) ?? [])[1] ?? 0)
let readme = readFileSync('docs/README.template.md', 'utf8')
const flat2 = { ...s, tests, ampA: ampErrByView.A, ampB: ampErrByView.B, ampC: ampErrByView.C, biasA: biasByView.A, biasB: biasByView.B, biasC: biasByView.C, s1Status: s.s1Pass ? 'met' : 'not met' }
for (const [k, v] of Object.entries(flat2)) readme = readme.replaceAll(`{{${k}}}`, String(v))
writeFileSync('README.md', readme)
let dp = readFileSync('docs/devpost.template.md', 'utf8')
for (const [k, v] of Object.entries(flat2)) dp = dp.replaceAll(`{{${k}}}`, String(v))
writeFileSync('docs/devpost.md', dp)
console.log(JSON.stringify(s))
