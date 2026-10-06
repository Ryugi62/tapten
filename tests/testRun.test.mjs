import test from 'node:test'
import assert from 'node:assert/strict'
import { createTestRun } from '../src/application/testRun.js'

// frame clock starting far from zero (like camera mediaTime after the page has been open a while)
const frames = (from, ms, every = 33) => Array.from({ length: Math.ceil(ms / every) }, (_, i) => from + i * every)

test('manual start: countdown lasts 5 s ± one frame on the frame clock, then 10 s recording', () => {
  const r = createTestRun({ autoStart: false })
  let t = 987654
  for (const now of frames(t, 500)) r.step(now, { visible: true, still: false })
  t += 500
  r.start()
  let countEnd = null, recEnd = null
  for (const now of frames(t, 16000)) { const s = r.step(now, { visible: true, still: false }); if (s.phase === 'rec' && countEnd === null) countEnd = now; if (s.phase === 'done' && recEnd === null) recEnd = now }
  assert.ok(Math.abs((countEnd - t) / 1000 - 5) <= 0.05, `countdown ${(countEnd - t) / 1000}`)
  assert.ok(Math.abs((recEnd - countEnd) / 1000 - 10) <= 0.05, `record ${(recEnd - countEnd) / 1000}`)
})

test('auto-start only after the hand is visible AND still for 2 s; movement resets the timer', () => {
  const r = createTestRun()
  let t = 0
  for (const now of frames(t, 1500)) r.step(now, { visible: true, still: true })
  t += 1500
  r.step(t, { visible: true, still: false }) // moved
  for (const now of frames(t + 33, 1900)) assert.equal(r.step(now, { visible: true, still: true }).phase, 'aim')
  for (const now of frames(t + 2000, 300)) r.step(now, { visible: true, still: true })
  assert.equal(r.phase, 'count')
})
