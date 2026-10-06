// docs/bench.json → docs/bench-summary.json + a markdown table on stdout (numbers are reported as measured).
import { readFileSync, writeFileSync } from 'node:fs'
const b = JSON.parse(readFileSync('docs/bench.json', 'utf8'))
const med = (xs) => { const s = [...xs].sort((a, c) => a - c), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const rows = b.clips.map((c) => ({ id: c.spec.id, f: c.spec.f, dec: c.spec.decrement, view: JSON.stringify(c.spec.view), dist: c.spec.dist, pause: !!c.spec.pause,
  gtTaps: c.gt.taps, estTaps: c.est.taps, gtRate: c.gt.rateHz, estRate: c.est.rateHz, gtDec: c.gt.decrementPct, estDec: c.est.decrementPct, gtHes: c.gt.hesitations, estHes: c.est.hesitations, q: c.quality.ok, detect: c.quality.detectRate }))
const countErr = rows.map((r) => Math.abs(r.estTaps - r.gtTaps))
const decErr = rows.map((r) => Math.abs(r.estDec - r.gtDec))
const rateErr = rows.map((r) => Math.abs(r.estRate - r.gtRate))
const big = rows.filter((r) => r.gtDec <= -20), flat = rows.filter((r) => Math.abs(r.gtDec) < 5)
const s = {
  generated: b.generated.slice(0, 10), clips: rows.length, speeds: `${Math.min(...rows.map((r) => r.f))}–${Math.max(...rows.map((r) => r.f))} taps/s`,
  countExact: countErr.filter((e) => e === 0).length, countMae: +(countErr.reduce((a, c) => a + c, 0) / rows.length).toFixed(2),
  decMedianErr: +med(decErr).toFixed(1), decMaxErr: +Math.max(...decErr).toFixed(1), rateMedianErr: +med(rateErr).toFixed(2),
  hesitationAgree: rows.filter((r) => r.gtHes === r.estHes).length, qualityPass: rows.filter((r) => r.q).length,
  shrinkingDetected: `${big.filter((r) => r.estDec <= -15).length}/${big.length}`, steadyNotFlagged: `${flat.filter((r) => r.estDec > -15).length}/${flat.length}`,
  detectMin: +Math.min(...rows.map((r) => r.detect)).toFixed(3),
  cleanClips: rows.filter((r) => r.id.startsWith('c')).length, cleanExact: rows.filter((r) => r.id.startsWith('c') && r.estTaps === r.gtTaps).length,
  hardClips: rows.filter((r) => r.id.startsWith('d')).length, hardExact: rows.filter((r) => r.id.startsWith('d') && r.estTaps === r.gtTaps).length,
  cleanWithin1: rows.filter((r) => r.id.startsWith('c') && Math.abs(r.estTaps - r.gtTaps) <= 1).length,
  hardWithin1: rows.filter((r) => r.id.startsWith('d') && Math.abs(r.estTaps - r.gtTaps) <= 1).length,
}
writeFileSync('docs/bench-summary.json', JSON.stringify(s, null, 1))
// README from template (numbers are never typed by hand)
import { execSync } from 'node:child_process'
const tests = Number((execSync('node --test tests/*.test.mjs 2>&1').toString().match(/ℹ pass (\d+)/) ?? [])[1] ?? 0)
let readme = readFileSync('docs/README.template.md', 'utf8')
for (const [k, v] of Object.entries({ ...s, tests })) readme = readme.replaceAll(`{{${k}}}`, String(v))
writeFileSync('README.md', readme)
console.log(JSON.stringify(s))
console.log('| clip | taps/s | true shrink | view | dist | pause | true taps | measured | true size Δ | measured Δ | hesitations true/meas |')
console.log('|---|---|---|---|---|---|---|---|---|---|---|')
for (const r of rows) console.log(`| ${r.id} | ${r.f} | ${r.dec * 100}% | ${r.view.replace(/"/g, '')} | ${r.dist} m | ${r.pause ? 'yes' : ''} | ${r.gtTaps} | ${r.estTaps} | ${Math.round(r.gtDec)}% | ${Math.round(r.estDec)}% | ${r.gtHes}/${r.estHes} |`)
