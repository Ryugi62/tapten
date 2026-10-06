// Diary and clinic sheet — pure data shaping.
import { median } from './signal.js'

export const MED_STATES = ['on', 'off', 'unsure']

export function makeSession({ id, at, hand, medState, minutesSinceDose = null, note = '', metrics, quality }) {
  if (!MED_STATES.includes(medState)) throw new Error(`medState must be one of ${MED_STATES.join('/')}`)
  if (!['left', 'right'].includes(hand)) throw new Error('hand must be left or right')
  return { id, at, hand, medState, minutesSinceDose, note: String(note).slice(0, 200), metrics, quality: { detectRate: quality.detectRate, fps: quality.fps } }
}

const round = (x, d = 2) => (x === null || x === undefined || Number.isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d)

/** Group sessions by hand × med state with medians; plus a chronological list. */
export function buildClinicSheet(sessions, { now = new Date().toISOString() } = {}) {
  const sorted = [...sessions].sort((a, b) => a.at.localeCompare(b.at))
  const groups = []
  for (const hand of ['right', 'left']) {
    for (const med of MED_STATES) {
      const s = sorted.filter((x) => x.hand === hand && x.medState === med && x.metrics.amplitude !== null)
      if (!s.length) continue
      const pick = (k) => round(median(s.map((x) => x.metrics[k]).filter((v) => v !== null)), k === 'decrementPct' ? 0 : 2)
      groups.push({ hand, medState: med, n: s.length, rateHz: pick('rateHz'), amplitude: pick('amplitude'), decrementPct: pick('decrementPct'), rhythmCv: pick('rhythmCv') })
    }
  }
  return {
    generatedAt: now,
    from: sorted[0]?.at ?? null,
    to: sorted[sorted.length - 1]?.at ?? null,
    total: sorted.length,
    groups,
    rows: sorted.map((x) => ({ at: x.at, hand: x.hand, medState: x.medState, minutesSinceDose: x.minutesSinceDose, taps: x.metrics.taps, rateHz: round(x.metrics.rateHz), amplitude: round(x.metrics.amplitude), decrementPct: round(x.metrics.decrementPct, 0), hesitations: x.metrics.hesitations, note: x.note })),
    disclaimer: 'Self-recorded home measurements from an ordinary webcam. Not a diagnosis and not an MDS-UPDRS score.',
  }
}
