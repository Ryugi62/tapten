// Adapter: step through a video file frame by frame (seek-based, deterministic) and run the tracker.
// After each seek we wait for the new frame to be presented, copy it to a canvas, and track the canvas —
// passing the <video> element straight after `seeked` can hand the tracker a stale frame.
const presented = (video) => new Promise((res) => {
  let done = false
  const finish = () => { if (!done) { done = true; res() } }
  if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(finish)
  setTimeout(finish, 400)
})

export async function framesFromVideo(video, tracker, { fps = 30, maxSeconds = 12, onProgress = () => {} } = {}) {
  await new Promise((res, rej) => { if (video.readyState >= 1) res(); else { video.onloadedmetadata = res; video.onerror = () => rej(new Error('This video could not be opened.')) } })
  const dur = Math.min(video.duration, maxSeconds)
  const cv = document.createElement('canvas'); cv.width = video.videoWidth; cv.height = video.videoHeight
  const g = cv.getContext('2d', { willReadFrequently: true })
  const frames = []
  await tracker.reset()
  for (let i = 0; i * (1 / fps) <= dur; i++) {
    const t = i / fps
    const shown = presented(video)
    video.currentTime = t
    await new Promise((res) => { video.onseeked = res })
    await shown
    g.drawImage(video, 0, 0, cv.width, cv.height)
    const r = tracker.detect(cv, t * 1000)
    frames.push({ t, lm: r.lm, handScale: r.handScale, image: r.image })
    if (i % 10 === 0) onProgress(t / dur)
  }
  return frames
}
