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
  const ticks = [0, 2, 4, 6, 8, 10].map((s) => `<text x="${x(s)}" y="${h - 6}" font-size="11" text-anchor="middle" fill="var(--muted)">${s}s</text>`).join('')
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Finger opening over 10 seconds; dots mark the top of each tap">
  <line x1="${pad.l}" x2="${w - pad.r}" y1="${h - pad.b}" y2="${h - pad.b}" stroke="var(--line)"/>
  <text x="4" y="${pad.t + 8}" font-size="11" fill="var(--muted)">open</text><text x="4" y="${h - pad.b}" font-size="11" fill="var(--muted)">closed</text>
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
  <text x="${pad.l}" y="${h - 4}" font-size="11" fill="var(--muted)">first tap</text><text x="${w - pad.r}" y="${h - 4}" font-size="11" text-anchor="end" fill="var(--muted)">last tap</text></svg>`
}

const MED_COLOR = { on: 'var(--on)', off: 'var(--off)', unsure: 'var(--unsure)' }

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
  const dots = s.map((x0) => `<circle cx="${x(Date.parse(x0.at)).toFixed(1)}" cy="${y(x0.metrics[key]).toFixed(1)}" r="5" fill="${MED_COLOR[x0.medState]}"><title>${esc(x0.at.slice(0, 16).replace('T', ' '))} · ${esc(x0.medState)} · ${esc(fmt(x0.metrics[key]))}</title></circle>`).join('')
  const day = (t) => new Date(t).toISOString().slice(5, 10)
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)} over time, colored by medication state">
  <text x="4" y="${y(hi - padv) + 4}" font-size="11" fill="var(--muted)">${esc(fmt(hi - padv))}</text>
  <text x="4" y="${y(lo + padv) + 4}" font-size="11" fill="var(--muted)">${esc(fmt(lo + padv))}</text>
  <line x1="${pad.l}" x2="${w - pad.r}" y1="${h - pad.b}" y2="${h - pad.b}" stroke="var(--line)"/>
  <text x="${pad.l}" y="${h - 6}" font-size="11" fill="var(--muted)">${day(t0)}</text><text x="${w - pad.r}" y="${h - 6}" font-size="11" text-anchor="end" fill="var(--muted)">${day(t1)}</text>
  ${dots}</svg>`
}

export function medLegend() {
  return `<div class="legend"><span><i class="dot" style="background:var(--on)"></i>Medication working (on)</span><span><i class="dot" style="background:var(--off)"></i>Wearing off (off)</span><span><i class="dot" style="background:var(--unsure)"></i>Not sure</span></div>`
}
export { esc }
