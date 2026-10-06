import test from 'node:test'
import assert from 'node:assert/strict'
import { sizeVerdict } from '../src/domain/verdict.js'

test('size verdict bands sit outside the benchmark error: only ≤ −25 % is "clearly smaller"', () => {
  assert.equal(sizeVerdict(-40).level, 'clear')
  assert.equal(sizeVerdict(-25).level, 'clear')
  assert.equal(sizeVerdict(-18).level, 'possible')
  assert.equal(sizeVerdict(-10).level, 'none')
  assert.equal(sizeVerdict(17).level, 'none')
  assert.equal(sizeVerdict(null).level, 'unknown')
  assert.match(sizeVerdict(-18).text, /may have/)
})
