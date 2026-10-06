// Synthetic landmark frames with a known aperture trajectory (thumb tip moves, scale fixed = 1).
export function framesFromAperture(fn, { fps = 30, duration = 10, dropEvery = 0 } = {}) {
  const frames = []
  for (let i = 0; i <= fps * duration; i++) {
    const t = i / fps
    const a = fn(t)
    const lm = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }))
    lm[0] = { x: 0, y: 0, z: 0 }; lm[9] = { x: 0, y: 1, z: 0 } // scale 1
    lm[8] = { x: 0.5, y: 1.2, z: 0 }; lm[4] = { x: 0.5 + a, y: 1.2, z: 0 }
    const lost = dropEvery && i % dropEvery === 0
    frames.push({ t, lm: lost ? null : lm, handScale: 0.2 })
  }
  return frames
}
// Deterministic PRNG for noise.
export function rng(seed = 1) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32) }
export function gauss(r) { const u = Math.max(r(), 1e-12), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
