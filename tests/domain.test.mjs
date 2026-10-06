import test from 'node:test'
import assert from 'node:assert/strict'
import { framesFromAperture, rng, gauss } from './helpers.mjs'
import { analyzeFrames } from '../src/application/analyze.js'
import { aperture, fillGaps } from '../src/domain/signal.js'
import { detectTaps } from '../src/domain/taps.js'
import { computeMetrics } from '../src/domain/metrics.js'
import { assessQuality } from '../src/domain/quality.js'

const sine = (f, A = 0.6, base = 0.05) => (t) => base + A * (1 + Math.cos(2 * Math.PI * f * t)) / 2

test('aperture: thumb-index distance divided by wrist-middle MCP length; null without a hand', () => {
  const lm = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }))
  lm[9] = { x: 0, y: 2, z: 0 }; lm[4] = { x: 1, y: 0, z: 0 }; lm[8] = { x: 1, y: 0, z: 1 }
  assert.equal(aperture(lm), 0.5)
  assert.equal(aperture(null), null)
})

for (const f of [1, 1.5, 2.5, 3.5, 5]) {
  test(`AC-1 clean ${f} Hz tapping → count = round(10f) ± 1, rate within 0.1 Hz`, () => {
    const { metrics } = analyzeFrames(framesFromAperture(sine(f)))
    assert.ok(Math.abs(metrics.taps - Math.round(10 * f)) <= 1, `taps ${metrics.taps}`)
    assert.ok(Math.abs(metrics.rateHz - f) <= 0.1 + 1 / 10, `rate ${metrics.rateHz}`)
  })
}

test('AC-2 amplitude falling linearly by 40 % → decrement in [−48, −32] %', () => {
  const f = 3, A0 = 0.7
  const fn = (t) => 0.05 + A0 * (1 - 0.4 * (t / 10)) * (1 + Math.cos(2 * Math.PI * f * t)) / 2
  const { metrics } = analyzeFrames(framesFromAperture(fn))
  assert.ok(metrics.decrementPct <= -32 && metrics.decrementPct >= -48, `decrement ${metrics.decrementPct}`)
  assert.ok(metrics.slopePctPerTap < 0)
})

test('steady amplitude → decrement near 0 (|d| < 8 %)', () => {
  const { metrics } = analyzeFrames(framesFromAperture(sine(3)))
  assert.ok(Math.abs(metrics.decrementPct) < 8, `decrement ${metrics.decrementPct}`)
})

test('AC-3 one 1.2 s pause inside 3 Hz tapping → 1 hesitation', () => {
  const f = 3
  const fn = (t) => {
    if (t >= 4.5 && t < 5.7) return 0.65 // hand held open (pause)
    const tt = t >= 5.7 ? t - 1.2 : t
    return sine(f)(tt)
  }
  const { metrics } = analyzeFrames(framesFromAperture(fn))
  assert.equal(metrics.hesitations, 1)
})

test('AC-4 30 % of frames without a hand → quality fails with hand-lost', () => {
  const frames = framesFromAperture(sine(3), { dropEvery: 3 })
  const q = assessQuality(frames)
  assert.equal(q.ok, false)
  assert.ok(q.reasons.includes('hand-lost'))
})

test('quality: short, slow or tiny recordings are refused with reasons', () => {
  assert.ok(assessQuality(framesFromAperture(sine(3), { duration: 5 })).reasons.includes('too-short'))
  assert.ok(assessQuality(framesFromAperture(sine(3), { fps: 8 })).reasons.includes('low-fps'))
  const tiny = framesFromAperture(sine(3)).map((f) => ({ ...f, handScale: 0.03 }))
  assert.ok(assessQuality(tiny).reasons.includes('hand-too-small'))
  assert.equal(assessQuality(framesFromAperture(sine(3))).ok, true)
})

test('AC-5 jitter only (σ = 3 % of a typical swing), no tapping → 0 taps', () => {
  const r = rng(7)
  const { metrics } = analyzeFrames(framesFromAperture(() => 0.6 + 0.018 * gauss(r)))
  assert.equal(metrics.taps, 0)
})

test('noisy tapping (σ = 0.02) at 3 Hz still counts 30 ± 1', () => {
  const r = rng(3)
  const { metrics } = analyzeFrames(framesFromAperture((t) => sine(3)(t) + 0.02 * gauss(r)))
  assert.ok(Math.abs(metrics.taps - 30) <= 1, `taps ${metrics.taps}`)
})

test('small tremor riding on big taps is not counted as extra taps', () => {
  const fn = (t) => sine(2)(t) + 0.04 * Math.sin(2 * Math.PI * 9 * t)
  const { metrics } = analyzeFrames(framesFromAperture(fn))
  assert.ok(Math.abs(metrics.taps - 20) <= 1, `taps ${metrics.taps}`)
})

test('fillGaps bridges ≤150 ms gaps only', () => {
  const s = [{ t: 0, a: 0 }, { t: 0.05, a: null }, { t: 0.1, a: 1 }, { t: 0.2, a: null }, { t: 0.3, a: null }, { t: 0.4, a: null }, { t: 0.5, a: 1 }]
  const g = fillGaps(s)
  assert.equal(g[1].a, 0.5)
  assert.equal(g[4].a, null)
})

test('computeMetrics with < 4 taps returns nulls (no fake precision)', () => {
  const m = computeMetrics([{ amplitude: 1, interval: null }, { amplitude: 1, interval: 0.3 }], 10)
  assert.equal(m.amplitude, null)
  assert.equal(m.decrementPct, null)
})

test('detectTaps on an empty / flat series returns []', () => {
  assert.equal(detectTaps([]).length, 0)
  assert.equal(detectTaps(Array.from({ length: 50 }, (_, i) => ({ t: i / 30, a: 0.5 }))).length, 0)
})

test('a tap cut in half by the end of the recording is not counted', () => {
  // 1.5 Hz: full closes at 0.33, 1.0, …, 9.0; at t=9.5 the fingers are only half-way closed
  const { metrics, taps } = analyzeFrames(framesFromAperture(sine(1.5), { duration: 10 }), { span: [0, 9.5] })
  assert.equal(metrics.taps, 14)
  assert.ok(taps[taps.length - 1].tClose < 9.1)
})

test('single-frame glitch spikes inside the closed hold are not counted (slow 1.5 Hz taps)', () => {
  const r = rng(11)
  const fn = (t) => {
    const base = sine(1.5)(t)
    const closedHold = base < 0.2
    return base + (closedHold && r() < 0.12 ? 0.25 : 0) + 0.015 * gauss(r)
  }
  const { metrics } = analyzeFrames(framesFromAperture(fn))
  assert.ok(Math.abs(metrics.taps - 15) <= 1, `taps ${metrics.taps}`)
})

test('a strong 60 % decrement keeps its small late taps', () => {
  const fn = (t) => 0.05 + 0.8 * (1 - 0.6 * (t / 10)) * (1 + Math.cos(2 * Math.PI * 3 * t)) / 2
  const { metrics } = analyzeFrames(framesFromAperture(fn))
  assert.ok(Math.abs(metrics.taps - 30) <= 1, `taps ${metrics.taps}`)
})

test('severe 85 % decrement: the tiny late taps are KEPT (they keep the rhythm)', () => {
  const fn = (t) => 0.05 + 0.9 * (1 - 0.85 * (t / 10)) * (1 + Math.cos(2 * Math.PI * 2 * t)) / 2
  const { metrics } = analyzeFrames(framesFromAperture(fn))
  assert.ok(Math.abs(metrics.taps - 20) <= 1, `taps ${metrics.taps}`)
  assert.ok(metrics.decrementPct < -60, `decrement ${metrics.decrementPct}`)
})

test('slowing taps (3 → 1.5 taps/s) give a negative speed change; steady taps ≈ 0', () => {
  // phase with linearly falling frequency: f(t) = 3 − 0.15 t
  const slow = (t) => 0.05 + 0.6 * (1 + Math.cos(2 * Math.PI * (3 * t - 0.075 * t * t))) / 2
  const a = analyzeFrames(framesFromAperture(slow)).metrics
  assert.ok(a.speedChangePct < -25, `speed ${a.speedChangePct}`)
  const b = analyzeFrames(framesFromAperture(sine(3))).metrics
  assert.ok(Math.abs(b.speedChangePct) < 8, `speed ${b.speedChangePct}`)
})

test('decrement over the first 10 taps is reported alongside the 10-second figure', () => {
  const fn = (t) => 0.05 + 0.8 * (1 - 0.4 * (t / 10)) * (1 + Math.cos(2 * Math.PI * 3 * t)) / 2
  const { metrics } = analyzeFrames(framesFromAperture(fn))
  assert.ok(metrics.decrement10Pct < -5 && metrics.decrement10Pct > metrics.decrementPct, `${metrics.decrement10Pct} vs ${metrics.decrementPct}`)
})

test('hand side: majority of confident tracker labels; null when too few', () => {
  const fr = framesFromAperture(sine(3)).map((f, i) => ({ ...f, side: i % 10 === 0 ? 'right' : 'left' }))
  const r = analyzeFrames(fr)
  assert.equal(r.side.label, 'left'); assert.ok(r.side.share > 0.85)
  assert.equal(analyzeFrames(framesFromAperture(sine(3))).side, null)
})

test('a partial first tap (recording started mid-closing) is not counted as a small first tap', () => {
  // start at phase 0.35 of a 3 Hz cycle: fingers already half closed
  const fn = (t) => sine(3)(t + 0.25 / 3) // starts a quarter-cycle in: fingers already half closed
  const { taps, metrics } = analyzeFrames(framesFromAperture(fn))
  const amps = taps.map((t) => t.amplitude)
  assert.ok(amps[0] > 0.8 * amps[2], `first ${amps[0]} vs ${amps[2]}`)
  assert.ok(Math.abs(metrics.decrementPct) < 8, `decrement ${metrics.decrementPct}`)
})
