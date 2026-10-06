// Tap detection on an aperture series: a tap is an opening peak followed by a closing trough
// whose drop exceeds a prominence threshold relative to the typical swing of this recording.
import { median } from './signal.js'

/** Local extrema with hysteresis (a turn is accepted only after moving ≥ delta). */
export function extrema(series, delta) {
  const pts = series.filter((p) => p.a !== null)
  const out = []
  if (pts.length < 3) return out
  let mode = 0 // 0 unknown, 1 looking for max, -1 looking for min
  let hi = pts[0], lo = pts[0]
  for (const p of pts) {
    if (p.a > hi.a) hi = p
    if (p.a < lo.a) lo = p
    if (mode >= 0 && p.a < hi.a - delta) { if (mode === 1 || mode === 0) out.push({ kind: 'max', ...hi }); mode = -1; lo = p }
    else if (mode <= 0 && p.a > lo.a + delta) { if (mode === -1 || mode === 0) out.push({ kind: 'min', ...lo }); mode = 1; hi = p }
  }
  // close the last pending extremum: a trough at the very end is accepted only if the fingers had started
  // to reopen (≥ half the threshold) — otherwise the recording cut the tap in half.
  const end = pts[pts.length - 1]
  if (mode === -1 && end.a - lo.a >= delta / 2) out.push({ kind: 'min', ...lo })
  if (mode === 1) out.push({ kind: 'max', ...hi })
  // collapse duplicates of the same kind (keep the more extreme)
  const merged = []
  for (const e of out) {
    const last = merged[merged.length - 1]
    if (last && last.kind === e.kind) {
      if ((e.kind === 'max' && e.a > last.a) || (e.kind === 'min' && e.a < last.a)) merged[merged.length - 1] = e
    } else merged.push(e)
  }
  return merged
}

const quantile = (xs, q) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))] }

/**
 * Detect taps. The swing threshold is relative to this recording's own opening range (5th–95th percentile),
 * so sensor noise on a slow, flat stretch is ignored while small-but-real taps late in a shrinking series are kept.
 * Closes faster than `minInterval` (physiologically implausible, > 10 Hz) are merged.
 * Returns Tap[] = {tOpen, tClose, peak, trough, amplitude, interval}.
 */
export function detectTaps(series, { minAbsSwing = 0.12, relSwing = 0.25, minInterval = 0.1 } = {}) {
  const vals = series.filter((p) => p.a !== null).map((p) => p.a)
  if (vals.length < 3) return []
  const delta = Math.max(minAbsSwing, relSwing * (quantile(vals, 0.95) - quantile(vals, 0.05)))
  const ex = extrema(series, delta)
  const taps = []
  for (let i = 1; i < ex.length; i++) {
    if (ex[i - 1].kind === 'max' && ex[i].kind === 'min') {
      const amp = ex[i - 1].a - ex[i].a
      if (amp < delta) continue
      const prev = taps[taps.length - 1]
      if (prev && ex[i].t - prev.tClose < minInterval) continue
      taps.push({ tOpen: ex[i - 1].t, tClose: ex[i].t, peak: ex[i - 1].a, trough: ex[i].a, amplitude: amp })
    }
  }
  // A real tap is never tiny next to its neighbours in the same 10 s: drop swings below 35 % of the median tap
  // (catches glitch bumps inside a closed or open hold; a 60 % decrement still keeps the last taps at ≈ 57 % of median).
  if (taps.length >= 5) {
    const m = median(taps.map((t) => t.amplitude))
    for (let i = taps.length - 1; i >= 0; i--) if (taps[i].amplitude < 0.35 * m) taps.splice(i, 1)
  }
  for (let i = 0; i < taps.length; i++) taps[i].interval = i === 0 ? null : taps[i].tClose - taps[i - 1].tClose
  return taps
}
