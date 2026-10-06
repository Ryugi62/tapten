// Plain-language reading of a size change. One test is NOT interpreted: on the synthetic benchmark 95 % of single tests
// are within about ±19 points (worst ≈ 39), so a single number is shown neutrally and compared with the person's own
// earlier tests taken the same way (same hand and movement state).
export function sizeText(decrementPct) {
  if (decrementPct === null || decrementPct === undefined || Number.isNaN(decrementPct)) return 'Not enough taps to measure the size change.'
  const v = Math.round(decrementPct)
  if (v <= -3) return `Your taps got about ${-v}% smaller by the end.`
  if (v >= 3) return `Your taps got about ${v}% bigger by the end.`
  return 'Your taps stayed about the same size.'
}

const quart = (xs) => { const s = [...xs].sort((a, b) => a - b), q = (p) => s[Math.round(p * (s.length - 1))]; return [q(0.25), q(0.5), q(0.75)] }

/** Compare with earlier tests of the same hand and state (needs ≥ 3). Uses the person's own spread (IQR, at least
 *  ±20 points — the size of single-test noise) as "usual range", so ordinary noise is not presented as change. */
export function compareWithOwn(decrementPct, earlier) {
  const xs = earlier.map((s) => s.metrics.decrementPct).filter((v) => v !== null && v !== undefined)
  if (decrementPct === null || xs.length < 3) return null
  const [q1, med, q3] = quart(xs)
  // the usual range is never narrower than single-test noise (benchmark 95 % limits ≈ ±19 points)
  const lo = Math.min(q1, med - 20), hi = Math.max(q3, med + 20)
  const where = decrementPct < lo ? 'more shrinking than your usual' : decrementPct > hi ? 'less shrinking than your usual' : 'within your usual range'
  return { n: xs.length, median: med, lo, hi, where }
}
