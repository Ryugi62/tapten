import test from 'node:test'
import assert from 'node:assert/strict'
import { createDiaryService, memoryStore } from '../src/application/diaryService.js'

const m = (rate, amp, dec) => ({ taps: Math.round(rate * 10), rateHz: rate, amplitude: amp, amplitudeCv: 0.1, rhythmCv: 0.1, decrementPct: dec, slopePctPerTap: -1, hesitations: 0 })
const q = { detectRate: 0.98, fps: 30 }

test('AC-6 clinic sheet groups by hand × med state with medians and date range', () => {
  let i = 0
  const days = ['2026-10-01T09:00:00Z', '2026-10-01T14:00:00Z', '2026-10-02T09:00:00Z', '2026-10-02T14:00:00Z', '2026-10-03T09:00:00Z']
  const svc = createDiaryService(memoryStore(), { newId: () => `s${i}`, clock: () => days[i++] ?? '2026-10-04T00:00:00Z' })
  svc.add({ hand: 'right', medState: 'off', metrics: m(2.0, 0.5, -40), quality: q })
  svc.add({ hand: 'right', medState: 'on', metrics: m(3.5, 0.9, -5), quality: q })
  svc.add({ hand: 'right', medState: 'off', metrics: m(2.2, 0.55, -30), quality: q })
  svc.add({ hand: 'right', medState: 'on', metrics: m(3.3, 0.85, -9), quality: q })
  svc.add({ hand: 'left', medState: 'unsure', metrics: m(3.0, 0.8, -10), quality: q })
  const sheet = svc.sheet()
  assert.equal(sheet.total, 5)
  assert.equal(sheet.from, days[0])
  assert.equal(sheet.to, days[4])
  const off = sheet.groups.find((g) => g.hand === 'right' && g.medState === 'off')
  const on = sheet.groups.find((g) => g.hand === 'right' && g.medState === 'on')
  assert.equal(off.n, 2); assert.equal(off.rateHz, 2.1); assert.equal(off.decrementPct, -35)
  assert.equal(on.rateHz, 3.4)
  assert.match(sheet.disclaimer, /Not a diagnosis/)
})

test('diary rejects unknown med state / hand; wipe and export work', () => {
  const svc = createDiaryService(memoryStore())
  assert.throws(() => svc.add({ hand: 'right', medState: 'maybe', metrics: m(3, 1, 0), quality: q }))
  assert.throws(() => svc.add({ hand: 'both', medState: 'on', metrics: m(3, 1, 0), quality: q }))
  svc.add({ hand: 'left', medState: 'on', metrics: m(3, 1, 0), quality: q, note: 'x'.repeat(500) })
  assert.equal(svc.list()[0].note.length, 200)
  assert.equal(JSON.parse(svc.exportJson()).sessions.length, 1)
  svc.wipe(); assert.equal(svc.list().length, 0)
})

test('motor-diary states include on-with-dyskinesia; sheet carries dose timing and the medication warning', () => {
  const svc = createDiaryService(memoryStore())
  svc.add({ hand: 'right', medState: 'on-dyskinesia', minutesSinceDose: 90, metrics: m(3.0, 0.8, -5), quality: q })
  svc.add({ hand: 'right', medState: 'off', minutesSinceDose: 300, beforeFirstDose: true, metrics: m(2.0, 0.5, -40), quality: q })
  assert.throws(() => svc.add({ hand: 'right', medState: 'on', minutesSinceDose: -5, metrics: m(3, 1, 0), quality: q }))
  const sheet = svc.sheet()
  assert.deepEqual(sheet.doseTime.map((d) => d.minutes), [90, 300])
  assert.equal(sheet.rows[1].beforeFirstDose, true)
  assert.match(sheet.groups.find((g) => g.medState === 'on-dyskinesia').medLabel, /dyskinesia/)
  assert.match(sheet.disclaimer, /Do not change medication/)
})

test('export → import round-trips sessions, skips duplicates, rejects foreign files', () => {
  const a = createDiaryService(memoryStore())
  a.add({ hand: 'left', medState: 'on', metrics: m(3, 1, 0), quality: q })
  const json = a.exportJson()
  const b = createDiaryService(memoryStore())
  assert.equal(b.importJson(json), 1)
  assert.equal(b.importJson(json), 0)
  assert.throws(() => b.importJson('{"foo":1}'))
  assert.equal(b.list()[0].hand, 'left')
})
