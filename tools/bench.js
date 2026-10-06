// Synthetic ground-truth benchmark: rendered hand → real MediaPipe Hand Landmarker → the app's own analyzeFrames().
import { analyzeFrames } from '/src/application/analyze.js'
import { computeMetrics } from '/src/domain/metrics.js'

const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const handSpan = (a, b, w, h) => Math.hypot(a.x - b.x, (a.y - b.y) * (h / w))

export function clipSpecs() {
  const views = [{ rx: 1.57, ry: 0, rz: 1.57 }, { rx: 0, ry: -1.57, rz: 0 }, { rx: -1.57, ry: -1.57, rz: 1.57 }]
  const fs = [1.5, 2.5, 3.5, 4.5], decs = [0, 0.3, 0.6]
  const clean = Array.from({ length: 24 }, (_, i) => ({
    id: `c${String(i + 1).padStart(2, '0')}`, f: fs[i % 4], decrement: decs[i % 3], view: views[Math.floor(i / 4) % 3],
    dist: i < 12 ? 0.45 : 0.6, pause: i % 5 === 0 ? { at: 4, len: 1.2 } : null, seed: i + 1, fps: 30, degrade: false,
  }))
  // Degraded set: blur + dim light + low contrast + sensor noise; half at 15 fps; some farther away.
  const hard = Array.from({ length: 12 }, (_, i) => ({
    id: `d${String(i + 1).padStart(2, '0')}`, f: fs[i % 4], decrement: decs[(i + 1) % 3], view: views[i % 3],
    dist: i % 4 === 3 ? 0.75 : 0.5, pause: i % 6 === 0 ? { at: 5, len: 1.0 } : null, seed: 100 + i, fps: i % 2 ? 15 : 30, degrade: true,
  }))
  // HOLD-OUT set: written after the algorithm was frozen (2026-10-06 15:0x) and run once. New seeds, perturbed
  // viewpoints, the SPEC's full 1–5 taps/s range, and 4 clips with a 5 Hz finger tremor on top of the taps.
  const jitterView = (v, k) => ({ rx: v.rx + 0.25 * Math.sin(k * 1.7), ry: v.ry + 0.25 * Math.cos(k * 2.3), rz: v.rz + 0.2 * Math.sin(k * 0.9) })
  const hf = [1.0, 1.5, 2.5, 3.5, 4.5, 5.0]
  const hold = Array.from({ length: 24 }, (_, i) => ({
    id: `h${String(i + 1).padStart(2, '0')}`, f: hf[i % 6], decrement: [0, 0.2, 0.45][i % 3], view: jitterView(views[i % 3], i + 1),
    dist: [0.45, 0.55, 0.65][i % 3], pause: i % 7 === 3 ? { at: 3.5, len: 1.1 } : null, seed: 500 + i, fps: i % 4 === 3 ? 15 : 30, degrade: i % 5 === 2,
    tremor: i >= 20 ? 0.08 : 0,
  }))
  // NEGATIVE set: the quality gate should refuse these (hand lost 30 %, 8 fps, hand far away).
  const neg = [
    { id: 'n01', f: 3, decrement: 0.2, view: views[0], dist: 0.45, seed: 900, fps: 30, dropRate: 0.3 },
    { id: 'n02', f: 2, decrement: 0, view: views[1], dist: 0.45, seed: 901, fps: 30, dropRate: 0.3 },
    { id: 'n03', f: 3, decrement: 0.2, view: views[2], dist: 0.45, seed: 902, fps: 8 },
    { id: 'n04', f: 2, decrement: 0, view: views[0], dist: 0.45, seed: 903, fps: 8 },
    { id: 'n05', f: 3, decrement: 0.2, view: views[1], dist: 2.4, seed: 904, fps: 30 },
    { id: 'n06', f: 2, decrement: 0, view: views[2], dist: 2.4, seed: 905, fps: 30 },
  ].map((c) => ({ pause: null, degrade: false, tremor: 0, dropRate: 0, ...c, expectReject: true }))
  return [...clean, ...hard, ...hold, ...neg]
}

function degrader(src) {
  const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height
  const g = cv.getContext('2d', { willReadFrequently: true })
  let s = 12345; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  return () => {
    g.filter = 'blur(1.2px) brightness(0.5) contrast(0.75)'
    g.drawImage(src, 0, 0)
    g.filter = 'none'
    const im = g.getImageData(0, 0, cv.width, cv.height), d = im.data
    for (let i = 0; i < d.length; i += 4) { const n = (r() + r() + r() - 1.5) * 24; d[i] += n; d[i + 1] += n; d[i + 2] += n }
    g.putImageData(im, 0, 0)
    return cv
  }
}

export async function runClip(hand, schedule, makeLandmarker, spec, { duration = 10, onFrame = null } = {}) {
  const fps = spec.fps ?? 30
  const lmk = await makeLandmarker('VIDEO')
  const degrade = spec.degrade ? degrader(hand.canvas) : null
  hand.setView({ ...spec.view, dist: spec.dist })
  const sch = schedule({ f: spec.f, a0: 0.9, decrement: spec.decrement, duration, pause: spec.pause, jitter: 0.04, seed: spec.seed, tremor: spec.tremor ?? 0 })
  let ds = spec.seed * 7919 >>> 0; const dr = () => ((ds = (ds * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const frames = []
  for (let i = 0; i <= fps * duration; i++) {
    const t = i / fps
    hand.setVisible(!(spec.dropRate && dr() < spec.dropRate)); hand.pose(sch.closure(t)); hand.render(); hand.setVisible(true)
    const r = lmk.detectForVideo(degrade ? degrade() : hand.canvas, Math.round(t * 1000) + 1)
    const w = r.worldLandmarks?.[0], im = r.landmarks?.[0]
    frames.push({ t, lm: w ? w.map((p) => ({ x: p.x, y: p.y, z: p.z })) : null, handScale: im ? handSpan(im[0], im[9], hand.canvas.width, hand.canvas.height) : undefined })
    if (onFrame) await onFrame(i)
  }
  lmk.close()
  const est = analyzeFrames(frames)
  // ground truth from the 3D model itself
  const gtTaps = sch.closes.map((c) => { hand.pose(1 - c.amp); const open = hand.gtAperture(); hand.pose(1); const closed = hand.gtAperture(); return { tClose: c.t, amplitude: open - closed } })
  gtTaps.forEach((t, k) => { t.interval = k ? t.tClose - gtTaps[k - 1].tClose : null })
  const gt = computeMetrics(gtTaps, duration)
  return { spec, gt, est: est.metrics, quality: est.quality, debug: { series: est.series.map((p) => p.a && +p.a.toFixed(2)), est: est.taps.map((t) => [+t.tClose.toFixed(2), +t.amplitude.toFixed(3)]), gt: gtTaps.map((t) => [+t.tClose.toFixed(2), +t.amplitude.toFixed(3)]) } }
}
