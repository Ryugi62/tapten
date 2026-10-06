// SVG chart builders (UI layer). Return strings; no DOM access.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** Aperture waveform with tap closes marked and the amplitude trend line. */
export function waveformSvg(series, taps, { w = 440, h = 170 } = {}) {
  const pts = series.filter((p) => p.a !== null)
  if (!pts.length) return ''
  const T = Math.max(10, pts[pts.length - 1].t)
  const maxA = Math.max(1.2, ...pts.map((p) => p.a))
  const pad = { l: 40, r: 10, t: 12, b: 26 }
  const x = (t) => pad.l + (t / T) * (w - pad.l - pad.r)
  const y = (a) => pad.t + (1 - a / maxA) * (h - pad.t - pad.b)
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.a).toFixed(1)}`).join('')
  const peaks = taps.map((t) => `<circle cx="${x(t.tOpen).toFixed(1)}" cy="${y(t.peak).toFixed(1)}" r="3" fill="var(--brand)"/>`).join('')
  const closes = taps.map((t) => `<line x1="${x(t.tClose).toFixed(1)}" x2="${x(t.tClose).toFixed(1)}" y1="${h - pad.b}" y2="${h - pad.b + 6}" stroke="var(--sub)"/>`).join('')
  const ticks = [0, 2, 4, 6, 8, 10].map((s) => `<text x="${x(s)}" y="${h - 6}" font-size="16" text-anchor="middle" fill="var(--sub)">${s}s</text>`).join('')
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Finger opening over 10 seconds; dots mark the top of each tap">
  <line x1="${pad.l}" x2="${w - pad.r}" y1="${h - pad.b}" y2="${h - pad.b}" stroke="var(--line)"/>
  <text x="4" y="${pad.t + 8}" font-size="16" fill="var(--sub)">open</text><text x="4" y="${h - pad.b}" font-size="16" fill="var(--sub)">closed</text>
  <path d="${d}" fill="none" stroke="var(--fg)" stroke-width="1.6"/>${peaks}${closes}${ticks}</svg>`
}

/** Bar per tap (amplitude), showing decrement at a glance. */
export function tapBarsSvg(taps, { w = 440, h = 110 } = {}) {
  if (!taps.length) return ''
  const maxA = Math.max(...taps.map((t) => t.amplitude)) * 1.1
  const pad = { l: 8, r: 8, t: 8, b: 20 }
  const bw = (w - pad.l - pad.r) / taps.length
  const bars = taps.map((t, i) => {
    const bh = (t.amplitude / maxA) * (h - pad.t - pad.b)
    return `<rect x="${(pad.l + i * bw + bw * 0.15).toFixed(1)}" y="${(h - pad.b - bh).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="var(--brand)" opacity="${0.45 + 0.55 * (i / Math.max(1, taps.length - 1))}"/>`
  }).join('')
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Size of each tap from first to last">${bars}
  <text x="${pad.l}" y="${h - 4}" font-size="16" fill="var(--sub)">first tap</text><text x="${w - pad.r}" y="${h - 4}" font-size="16" text-anchor="end" fill="var(--sub)">last tap</text></svg>`
}

const MED_COLOR = { on: 'var(--on)', 'on-dyskinesia': 'var(--dysk)', off: 'var(--off)', unsure: 'var(--unsure)' }
// Shape as well as colour, so the chart works without colour vision: ● on, ◆ dyskinesia, ▲ off, ■ not sure.
function mark(cx, cy, med, r = 5.5) {
  const c = MED_COLOR[med] ?? 'var(--unsure)'
  if (med === 'off') return `<path d="M${cx},${cy - r * 1.15}L${cx + r},${cy + r * 0.85}L${cx - r},${cy + r * 0.85}Z" fill="${c}"/>`
  if (med === 'unsure') return `<rect x="${cx - r * 0.85}" y="${cy - r * 0.85}" width="${r * 1.7}" height="${r * 1.7}" fill="${c}"/>`
  if (med === 'on-dyskinesia') return `<path d="M${cx},${cy - r * 1.2}L${cx + r * 1.1},${cy}L${cx},${cy + r * 1.2}L${cx - r * 1.1},${cy}Z" fill="${c}"/>`
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/>`
}

/** Diary trend: one metric over time, points colored by medication state. */
export function trendSvg(sessions, key, { w = 440, h = 140, label = '', fmt = (v) => v.toFixed(1) } = {}) {
  const s = sessions.filter((x) => x.metrics[key] !== null && x.metrics[key] !== undefined).sort((a, b) => a.at.localeCompare(b.at))
  if (s.length < 1) return ''
  const t0 = Date.parse(s[0].at), t1 = Math.max(t0 + 864e5, Date.parse(s[s.length - 1].at))
  const vals = s.map((x) => x.metrics[key])
  let lo = Math.min(...vals), hi = Math.max(...vals); if (hi - lo < 1e-6) { lo -= 1; hi += 1 }
  const padv = (hi - lo) * 0.15; lo -= padv; hi += padv
  const pad = { l: 44, r: 12, t: 14, b: 24 }
  const x = (t) => pad.l + ((t - t0) / (t1 - t0)) * (w - pad.l - pad.r)
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b)
  const dots = s.map((x0) => `<g><title>${esc(x0.at.slice(0, 16).replace('T', ' '))} · ${esc(x0.medState)} · ${esc(fmt(x0.metrics[key]))}</title>${mark(+x(Date.parse(x0.at)).toFixed(1), +y(x0.metrics[key]).toFixed(1), x0.medState)}</g>`).join('')
  const day = (t) => new Date(t).toISOString().slice(5, 10)
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)} over time, colored by medication state">
  <text x="4" y="${y(hi - padv) + 4}" font-size="16" fill="var(--sub)">${esc(fmt(hi - padv))}</text>
  <text x="4" y="${y(lo + padv) + 4}" font-size="16" fill="var(--sub)">${esc(fmt(lo + padv))}</text>
  <line x1="${pad.l}" x2="${w - pad.r}" y1="${h - pad.b}" y2="${h - pad.b}" stroke="var(--line)"/>
  <text x="${pad.l}" y="${h - 6}" font-size="16" fill="var(--sub)">${day(t0)}</text><text x="${w - pad.r}" y="${h - 6}" font-size="16" text-anchor="end" fill="var(--sub)">${day(t1)}</text>
  ${dots}</svg>`
}

const LEG = [['on', 'On'], ['on-dyskinesia', 'On, troublesome dyskinesia'], ['off', 'Off'], ['unsure', 'Not sure']]
export function medLegend() {
  return `<div class="legend">${LEG.map(([k, t]) => `<span><svg width="14" height="14" viewBox="0 0 14 14" style="display:inline;vertical-align:middle;width:14px">${mark(7, 7, k, 5)}</svg> ${t}</span>`).join('')}</div>`
}

/** Taps per second against minutes since the last dose — objective timing, not only the self-rated label. */
export function doseScatterSvg(points, { w = 440, h = 150 } = {}) {
  if (points.length < 2) return ''
  const maxM = Math.max(240, ...points.map((p) => p.minutes)), rs = points.map((p) => p.rateHz)
  let lo = Math.min(...rs), hi = Math.max(...rs); if (hi - lo < 0.5) { lo -= 0.25; hi += 0.25 }
  const pad = { l: 34, r: 10, t: 10, b: 28 }
  const x = (m) => pad.l + (m / maxM) * (w - pad.l - pad.r), y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b)
  const ticks = [0, 60, 120, 180, 240, 300, 360, 480, 600].filter((m) => m <= maxM).map((m) => `<text x="${x(m)}" y="${h - 12}" font-size="15" text-anchor="middle" fill="var(--sub)">${m}</text>`).join('')
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Taps per second by minutes since last dose">
  <text x="2" y="${y(hi) + 4}" font-size="15" fill="var(--sub)">${hi.toFixed(1)}</text><text x="2" y="${y(lo) + 4}" font-size="15" fill="var(--sub)">${lo.toFixed(1)}</text>
  <line x1="${pad.l}" x2="${w - pad.r}" y1="${h - pad.b}" y2="${h - pad.b}" stroke="var(--line)"/>${ticks}<text x="${w - pad.r}" y="${h - 1}" font-size="15" text-anchor="end" fill="var(--sub)">minutes since last dose</text>
  ${points.map((p) => mark(+x(p.minutes).toFixed(1), +y(p.rateHz).toFixed(1), p.medState, 4.5)).join('')}</svg>`
}
export { esc }
