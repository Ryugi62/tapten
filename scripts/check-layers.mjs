// Clean Architecture guard: domain imports nothing outside domain; application imports only domain;
// adapters never import ui. Exit 1 on violation.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const rules = { domain: ['domain'], application: ['domain', 'application'], adapters: ['domain', 'application', 'adapters', 'vendor'] }
let bad = 0
for (const [layer, allowed] of Object.entries(rules)) {
  for (const f of readdirSync(join('src', layer))) {
    const src = readFileSync(join('src', layer, f), 'utf8')
    for (const m of src.matchAll(/(?:import|from)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const target = m[1].match(/(?:\.\.\/)+(?:\.\.\/)?(?:src\/)?(\w+)\//)?.[1] ?? (m[1].startsWith('./') ? layer : 'external')
      if (!allowed.includes(target)) { console.error(`✖ src/${layer}/${f} imports ${m[1]} (${target} not allowed in ${layer})`); bad++ }
    }
    if (layer !== 'adapters' && /\b(document|window|localStorage|navigator|fetch)\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))) { console.error(`✖ src/${layer}/${f} touches browser I/O`); bad++ }
  }
}
console.log(bad ? `${bad} layer violation(s)` : 'layers ok')
process.exit(bad ? 1 : 0)
