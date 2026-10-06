// Adapter: MediaPipe Hand Landmarker (Apache-2.0), loaded from this site's own /vendor folder — no third-party requests.
import { HandLandmarker, FilesetResolver } from '../../vendor/mediapipe/vision_bundle.mjs'

const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

export async function createHandTracker({ base = new URL('../../vendor/', import.meta.url).href } = {}) {
  const vision = await FilesetResolver.forVisionTasks(base + 'mediapipe/wasm')
  let lmk = await make()
  async function make() {
    try {
      return await HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: base + 'models/hand_landmarker.task', delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 1 })
    } catch {
      return HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: base + 'models/hand_landmarker.task', delegate: 'CPU' }, runningMode: 'VIDEO', numHands: 1 })
    }
  }
  let lastTs = 0
  return {
    /** → { lm: world landmarks (m) | null, image: normalized image landmarks | null, handScale } */
    detect(source, tsMs) {
      const ts = Math.max(lastTs + 1, Math.round(tsMs)); lastTs = ts
      const r = lmk.detectForVideo(source, ts)
      const w = r.worldLandmarks?.[0], im = r.landmarks?.[0]
      return { lm: w ? w.map((p) => ({ x: p.x, y: p.y, z: p.z })) : null, image: im ?? null, handScale: im ? d2(im[0], im[9]) : undefined }
    },
    async reset() { lmk.close(); lmk = await make(); lastTs = 0 },
  }
}
