import test from 'node:test'
import assert from 'node:assert/strict'
import { sizeText, compareWithOwn } from '../src/domain/verdict.js'

test('a single test is described in plain words, without judgement', () => {
  assert.equal(sizeText(-40), 'Your taps got about 40% smaller by the end.')
  assert.equal(sizeText(1), 'Your taps stayed about the same size.')
  assert.equal(sizeText(12), 'Your taps got about 12% bigger by the end.')
  assert.doesNotMatch(sizeText(-40), /clearly|abnormal|worse/)
  assert.match(sizeText(null), /Not enough/)
})

test('comparison with own earlier tests needs ≥ 3 and uses a usual range at least as wide as single-test noise (±20)', () => {
  const s = (d) => ({ metrics: { decrementPct: d } })
  assert.equal(compareWithOwn(-30, [s(-10), s(-12)]), null)
  const ok = compareWithOwn(-28, [s(-10), s(-12), s(-14)])
  assert.equal(ok.where, 'within your usual range')
  assert.equal(compareWithOwn(-40, [s(-10), s(-12), s(-14)]).where, 'more shrinking than your usual')
  assert.equal(compareWithOwn(-28, [s(-10), s(-12), s(-14)]).lo, -32)
})
