// Plain-language reading of a size change, with bands set OUTSIDE the measured error.
// Benchmark (docs/bench-summary.json): median error ≈ 5 points, steady clips read between −18 % and +17 %.
// So only changes beyond ±25 % are called clear; −15…−25 % is "possibly smaller"; anything else is "no clear change".
export const SIZE_BANDS = { clear: -25, possible: -15 }

export function sizeVerdict(decrementPct) {
  if (decrementPct === null || decrementPct === undefined || Number.isNaN(decrementPct)) return { level: 'unknown', text: 'Not enough taps to judge the size change.' }
  const v = Math.round(decrementPct)
  if (decrementPct <= SIZE_BANDS.clear) return { level: 'clear', text: `Taps got clearly smaller toward the end (${v}%).` }
  if (decrementPct <= SIZE_BANDS.possible) return { level: 'possible', text: `Taps may have got smaller toward the end (${v}%) — within the range where one test can be off.` }
  return { level: 'none', text: `No clear change in tap size (${v > 0 ? '+' : ''}${v}%).` }
}
