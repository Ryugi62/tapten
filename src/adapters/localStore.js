// Adapter: SessionStore on localStorage (this device only). Falls back to memory if storage is blocked.
const KEY = 'tapten.sessions.v1'
export function localStore(storage = globalThis.localStorage) {
  let mem = []
  return {
    load() { try { return JSON.parse(storage.getItem(KEY) ?? '[]') } catch { return [...mem] } },
    save(v) { mem = [...v]; try { storage.setItem(KEY, JSON.stringify(v)) } catch { /* private mode: memory only */ } },
  }
}
