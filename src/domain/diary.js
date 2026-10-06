// Diary and clinic sheet — pure data shaping.
import { median } from './signal.js'

// Motor-diary style states (after the Hauser home diary): on, on with troublesome dyskinesia, off, not sure.
export const MED_STATES = ['on', 'on-dyskinesia', 'off', 'unsure']
export const MED_LABEL = { on: 'On', 'on-dyskinesia': 'On, with troublesome dyskinesia', off: 'Off', unsure: 'Not sure' }

export function makeSession({ id, at, hand, medState, minutesSinceDose = null, beforeFirstDose = false, note = '', metrics, quality }) {
  if (!MED_STATES.includes(medState)) throw new Error(`medState must be one of ${MED_STATES.join('/')}`)
  if (!['left', 'right'].includes(hand)) throw new Error('hand must be left or right')
  if (minutesSinceDose !== null && !(Number.isFinite(minutesSinceDose) && minutesSinceDose >= 0 && minutesSinceDose <= 1440)) throw new Error('minutesSinceDose must be 0–1440 or empty')
  return { id, at, hand, medState, minutesSinceDose, beforeFirstDose: !!beforeFirstDose, note: String(note).slice(0, 200), metrics, quality: { detectRate: quality.detectRate, fps: quality.fps } }
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
      groups.push({ hand, medState: med, medLabel: MED_LABEL[med], n: s.length, rateHz: pick('rateHz'), amplitude: pick('amplitude'), decrementPct: pick('decrementPct'), rhythmCv: pick('rhythmCv') })
    }
  }
  return {
    generatedAt: now,
    from: sorted[0]?.at ?? null,
    to: sorted[sorted.length - 1]?.at ?? null,
    total: sorted.length,
    groups,
    rows: sorted.map((x) => ({ at: x.at, hand: x.hand, medState: x.medState, medLabel: MED_LABEL[x.medState], minutesSinceDose: x.minutesSinceDose, beforeFirstDose: !!x.beforeFirstDose, taps: x.metrics.taps, rateHz: round(x.metrics.rateHz), amplitude: round(x.metrics.amplitude), decrementPct: round(x.metrics.decrementPct, 0), hesitations: x.metrics.hesitations, note: x.note })),
    // dose-time points for the sheet's scatter (objective timing, not only the self-rated label)
    doseTime: sorted.filter((x) => x.minutesSinceDose !== null && x.metrics.rateHz !== null).map((x) => ({ minutes: x.minutesSinceDose, rateHz: round(x.metrics.rateHz), medState: x.medState, hand: x.hand })),
    disclaimer: 'Self-recorded home measurements from an ordinary webcam. Not a diagnosis and not an MDS-UPDRS score. Do not change medication based on these numbers — discuss them with your neurologist.',
  }
}
