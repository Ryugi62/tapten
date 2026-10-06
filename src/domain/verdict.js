// Plain-language reading of a size change. One test is NOT interpreted: the synthetic benchmark's 95 % limits are about
// ±17 points and the error depends on hand angle, so a single number is shown neutrally and compared with the
// person's own earlier tests taken the same way (same hand and medication state).
export function sizeText(decrementPct) {
  if (decrementPct === null || decrementPct === undefined || Number.isNaN(decrementPct)) return 'Not enough taps to measure the size change.'
  const v = Math.round(decrementPct)
  return `Tap size changed by ${v > 0 ? '+' : ''}${v}% from the first to the last taps.`
}

/** Compare with earlier tests of the same hand and medication state (needs ≥ 3 earlier tests). */
export function compareWithOwn(decrementPct, earlier) {
  const xs = earlier.map((s) => s.metrics.decrementPct).filter((v) => v !== null && v !== undefined)
  if (decrementPct === null || xs.length < 3) return null
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1
  const med = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
  return { n: xs.length, median: med, diff: decrementPct - med }
}
