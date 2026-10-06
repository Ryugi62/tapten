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
    remove(id) { store.save(store.load().filter((s) => s.id !== id)) },
    wipe() { store.save([]) },
    exportJson: () => JSON.stringify({ app: 'TapTen', version: 1, sessions: store.load() }, null, 2),
    sheet: () => buildClinicSheet(store.load(), { now: clock() }),
  }
}

export function memoryStore(initial = []) {
  let data = [...initial]
  return { load: () => [...data], save: (v) => { data = [...v] } }
}
