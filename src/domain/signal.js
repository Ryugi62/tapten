// Pure signal functions. No DOM, no I/O.
// Landmark indices (MediaPipe hand): 0 wrist, 4 thumb tip, 8 index tip, 9 middle-finger MCP.
export const WRIST = 0, THUMB_TIP = 4, INDEX_TIP = 8, MIDDLE_MCP = 9

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0))

/** Unitless aperture: thumb-tip↔index-tip distance divided by hand scale (wrist↔middle MCP). null if no hand. */
export function aperture(lm) {
  if (!lm || lm.length < 21) return null
  const scale = dist(lm[WRIST], lm[MIDDLE_MCP])
  if (!(scale > 0)) return null
  return dist(lm[THUMB_TIP], lm[INDEX_TIP]) / scale
}

/** Frame[] → {t, a}[] with a=null where the hand was lost. */
export function apertureSeries(frames) {
  return frames.map((f) => ({ t: f.t, a: aperture(f.lm) }))
}

/** Fill short gaps (≤ maxGap s) by linear interpolation; longer gaps stay null. */
export function fillGaps(series, maxGap = 0.15) {
  const out = series.map((p) => ({ ...p }))
  let i = 0
  while (i < out.length) {
    if (out[i].a !== null) { i++; continue }
    let j = i
    while (j < out.length && out[j].a === null) j++
    const prev = out[i - 1], next = out[j]
    if (prev && next && next.t - prev.t <= maxGap + 1e-9) {
      for (let k = i; k < j; k++) {
        const w = (out[k].t - prev.t) / (next.t - prev.t)
        out[k].a = prev.a + w * (next.a - prev.a)
      }
    }
    i = j
  }
  return out
}

/** 3-sample running median — removes single-frame landmark glitches. Applied only when frames are dense
 * (median spacing ≤ 45 ms, i.e. ≥ ~22 fps) so that fast taps at low frame rates are not flattened. */
export function despike(series) {
  const dts = []
  for (let i = 1; i < series.length; i++) dts.push(series[i].t - series[i - 1].t)
  if (!dts.length || median(dts) > 0.045) return series.map((p) => ({ ...p }))
  return series.map((p, i) => {
    const a = series[i - 1]?.a, b = p.a, c = series[i + 1]?.a
    if (b === null || a === null || a === undefined || c === null || c === undefined) return { ...p }
    return { t: p.t, a: Math.max(Math.min(a, b), Math.min(Math.max(a, b), c)) }
  })
}

/** Centered moving average over a time window (s); nulls are skipped. */
export function smooth(series, span = 0.06) {
  const half = span / 2
  return series.map((p, i) => {
    if (p.a === null) return { ...p }
    let s = 0, n = 0
    for (let k = i; k >= 0 && p.t - series[k].t <= half; k--) if (series[k].a !== null) { s += series[k].a; n++ }
    for (let k = i + 1; k < series.length && series[k].t - p.t <= half; k++) if (series[k].a !== null) { s += series[k].a; n++ }
    return { t: p.t, a: s / n }
  })
}

export const median = (xs) => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
export const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
export const sd = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)) }
