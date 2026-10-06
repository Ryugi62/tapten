import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

test('AC-7 CSP allows network connections only to this site', () => {
  const html = readFileSync('index.html', 'utf8')
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1]
  assert.match(csp, /connect-src 'self'/)
  assert.match(csp, /default-src 'self'/)
  assert.doesNotMatch(csp, /https?:/)
})

test('AC-7 app code never sends data: no XHR/WebSocket/sendBeacon; fetch only for bundled sample files', () => {
  const files = ['src/domain', 'src/application', 'src/adapters', 'src/ui'].flatMap((d) => readdirSync(d).map((f) => join(d, f)))
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    assert.doesNotMatch(src, /XMLHttpRequest|WebSocket|sendBeacon|EventSource/, f)
    for (const m of src.matchAll(/fetch\(([^)]*)\)/g)) assert.match(m[1], /^'docs\/(sample-synthetic\.webm|sample-truth\.json|bench-summary\.json)'$/, `${f}: ${m[0]}`)
  }
})

test('model and wasm are bundled in /vendor (no third-party CDN at runtime)', () => {
  assert.ok(readdirSync('vendor/models').includes('hand_landmarker.task'))
  assert.ok(readdirSync('vendor/mediapipe/wasm').some((f) => f.endsWith('.wasm')))
  const html = readFileSync('index.html', 'utf8')
  assert.doesNotMatch(html, /<script[^>]+src="https?:/)
})
