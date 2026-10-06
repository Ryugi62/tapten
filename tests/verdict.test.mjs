import test from 'node:test'
import assert from 'node:assert/strict'
import { sizeText, compareWithOwn } from '../src/domain/verdict.js'

test('a single test is described neutrally (no "clearly smaller")', () => {
  assert.equal(sizeText(-40), 'Tap size changed by -40% from the first to the last taps.')
  assert.doesNotMatch(sizeText(-40), /clearly|abnormal|worse/)
  assert.match(sizeText(null), /Not enough/)
})

test('comparison with own earlier tests needs at least 3 of them', () => {
  const s = (d) => ({ metrics: { decrementPct: d } })
  assert.equal(compareWithOwn(-30, [s(-10), s(-12)]), null)
  const c = compareWithOwn(-30, [s(-10), s(-12), s(-14)])
  assert.equal(c.n, 3); assert.equal(c.median, -12); assert.equal(c.diff, -18)
})
