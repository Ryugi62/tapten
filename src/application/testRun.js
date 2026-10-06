// Use case: the live test's phases as a pure state machine on ONE clock (the camera frame timestamps).
// aim → (start: button, or hand visible+still for 2 s with auto-start) → count (5 s) → rec (10 s) → done.
export const RUN = { countdown: 5, record: 10, autoStillMs: 2000 }

export function createTestRun({ autoStart = true } = {}) {
  let phase = 'aim', t0 = 0, stillSince = 0, last = 0
  return {
    get phase() { return phase },
    /** Feed one frame. Returns { phase, left (s, for count/rec), recT (s since recording start) }. */
    step(nowMs, { visible, still }) {
      last = nowMs
      if (phase === 'aim') {
        stillSince = visible && still ? stillSince || nowMs : 0
        if (autoStart && stillSince && nowMs - stillSince >= RUN.autoStillMs) { phase = 'count'; t0 = nowMs }
        return { phase }
      }
      if (phase === 'count') {
        const left = RUN.countdown - (nowMs - t0) / 1000
        if (left <= 0) { phase = 'rec'; t0 = nowMs; return { phase, recT: 0 } }
        return { phase, left }
      }
      if (phase === 'rec') {
        const recT = (nowMs - t0) / 1000
        if (recT >= RUN.record) { phase = 'done'; return { phase, recT } }
        return { phase, recT, left: RUN.record - recT }
      }
      return { phase }
    },
    /** Manual start (button): uses the same clock as the frames. */
    start() { if (phase === 'aim') { phase = 'count'; t0 = last } },
    setAuto(v) { autoStart = v },
  }
}
