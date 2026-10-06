import { mean, median, sd } from './signal.js'

const linSlope = (ys) => {
  const n = ys.length, xs = ys.map((_, i) => i)
  const mx = mean(xs), my = mean(ys)
  let num = 0, den = 0
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2 }
  return den ? num / den : 0
}

/**
 * Metrics for one test. duration = analysed window length (s).
 * - rateHz: taps per second over the window
 * - amplitude: median tap amplitude (aperture units = fraction of hand length)
 * - amplitudeCv, rhythmCv: variability of size / of inter-tap interval
 * - decrementPct: mean(last 3 amplitudes) vs mean(first 3), in % (negative = shrinking)
 * - slopePctPerTap: linear trend of amplitude per tap relative to the first-3 mean
 * - hesitations: intervals longer than 2 × median interval
 * - decrement10Pct: size change within the first 10 taps · speedChangePct: rate over last 3 vs first 3 gaps
 */
export function computeMetrics(taps, duration) {
  const n = taps.length
  const empty = { taps: n, rateHz: n / duration, amplitude: null, amplitudeCv: null, rhythmCv: null, decrementPct: null, decrement10Pct: null, speedChangePct: null, slopePctPerTap: null, hesitations: 0, ignored: taps.ignored ?? 0 }
  if (n < 4) return empty
  const amps = taps.map((t) => t.amplitude)
  const ints = taps.slice(1).map((t) => t.interval)
  const first = mean(amps.slice(0, 3)), last = mean(amps.slice(-3))
  const medInt = median(ints)
  return {
    taps: n,
    rateHz: n / duration,
    amplitude: median(amps),
    amplitudeCv: sd(amps) / mean(amps),
    rhythmCv: sd(ints) / mean(ints),
    decrementPct: ((last - first) / first) * 100,
    // clinic-style: the first 10 taps only (taps 8–10 vs 1–3), comparable across tapping speeds
    decrement10Pct: n >= 10 ? ((mean(amps.slice(7, 10)) - first) / first) * 100 : null,
    // slowing: tap rate over the last 3 gaps vs the first 3 gaps (negative = slower)
    speedChangePct: ints.length >= 6 ? ((mean(ints.slice(0, 3)) / mean(ints.slice(-3)) - 1) * 100) : null,
    ignored: taps.ignored ?? 0,
    slopePctPerTap: (linSlope(amps) / first) * 100,
    hesitations: ints.filter((x) => x > 2 * medInt).length,
  }
}
