// Use case: save / list / export / wipe sessions through a SessionStore port {load(): Session[], save(Session[]): void}.
import { makeSession, buildClinicSheet } from '../domain/diary.js'

export function createDiaryService(store, { newId = () => Math.random().toString(36).slice(2, 10), clock = () => new Date().toISOString() } = {}) {
  return {
    list: () => store.load(),
    add(input) {
      const s = makeSession({ id: newId(), at: clock(), ...input })
      store.save([...store.load(), s])
      return s
    },
    /** Same as add() but with an explicit timestamp (example data, imports). */
    addAt(at, input) {
      const s = makeSession({ id: newId(), at, ...input })
      store.save([...store.load(), s])
      return s
    },
    /** Import a file produced by exportJson(); validates every session, skips ids already present. Returns count added. */
    importJson(text) {
      const data = JSON.parse(text)
      if (data?.app !== 'TapTen' || !Array.isArray(data.sessions)) throw new Error('not a TapTen export')
      const have = new Set(store.load().map((x) => x.id))
      const fresh = data.sessions.filter((x) => !have.has(x.id)).map((x) => makeSession(x))
      store.save([...store.load(), ...fresh])
      return fresh.length
    },
    remove(id) { store.save(store.load().filter((s) => s.id !== id)) },
    wipe() { store.save([]) },
    exportJson: () => JSON.stringify({ app: 'TapTen', version: 1, sessions: store.load() }, null, 2),
    sheet: () => buildClinicSheet(store.load(), { now: clock() }),
    sheetOf: (sessions) => buildClinicSheet(sessions, { now: clock() }),
  }
}

export function memoryStore(initial = []) {
  let data = [...initial]
  return { load: () => [...data], save: (v) => { data = [...v] } }
}
