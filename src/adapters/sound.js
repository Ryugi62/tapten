// Adapter: short beeps with the Web Audio API (generated locally — no files, no network).
let ctx = null
export function beep(freq = 660, seconds = 0.12) {
  try {
    ctx ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)()
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.frequency.value = freq; g.gain.value = 0.12
    o.connect(g).connect(ctx.destination)
    o.start(); o.stop(ctx.currentTime + seconds)
  } catch { /* audio unavailable: silent */ }
}
