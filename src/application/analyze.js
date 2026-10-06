// Use case: frames → quality + metrics (+ series for plotting). Pure orchestration of domain functions.
import { apertureSeries, fillGaps, despike, smooth } from '../domain/signal.js'
import { detectTaps } from '../domain/taps.js'
import { computeMetrics } from '../domain/metrics.js'
import { assessQuality } from '../domain/quality.js'

export function analyzeFrames(frames, { span = [0, 10] } = {}) {
  const t0 = frames.length ? frames[0].t : 0
  const rel = frames.map((f) => ({ ...f, t: f.t - t0 })).filter((f) => f.t >= span[0] - 1e-9 && f.t <= span[1] + 1e-9)
  const quality = assessQuality(rel)
  const series = smooth(despike(fillGaps(apertureSeries(rel))))
  const taps = detectTaps(series)
  const duration = rel.length > 1 ? rel[rel.length - 1].t - rel[0].t : 0
  const metrics = computeMetrics(taps, Math.max(duration, 1e-6))
  return { quality, metrics, taps, series }
}
