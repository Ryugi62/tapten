// Quality gate: refuse to report numbers that the recording cannot support.
import { median } from './signal.js'

export const QUALITY_RULES = { minDetectRate: 0.85, minFps: 15, minHandScale: 0.06, minDuration: 9 }

/**
 * frames: Frame[] with optional f.handScale (image-space wrist→middle-MCP length, 0..1 of frame width).
 * Returns { ok, reasons[], detectRate, fps, duration }.
 */
export function assessQuality(frames, rules = QUALITY_RULES) {
  const reasons = []
  const duration = frames.length > 1 ? frames[frames.length - 1].t - frames[0].t : 0
  const fps = duration > 0 ? (frames.length - 1) / duration : 0
  const detected = frames.filter((f) => f.lm)
  const detectRate = frames.length ? detected.length / frames.length : 0
  const scales = detected.map((f) => f.handScale).filter((s) => typeof s === 'number')
  const handScale = scales.length ? median(scales) : null
  if (duration < rules.minDuration) reasons.push('too-short')
  if (fps < rules.minFps) reasons.push('low-fps')
  if (detectRate < rules.minDetectRate) reasons.push('hand-lost')
  if (handScale !== null && handScale < rules.minHandScale) reasons.push('hand-too-small')
  return { ok: reasons.length === 0, reasons, detectRate, fps, duration, handScale }
}

export const REASON_TEXT = {
  'too-short': 'The recording was shorter than 9 seconds. Keep tapping until the timer ends.',
  'low-fps': 'Too few frames per second were processed (this computer or camera may be slow). Close other apps and tabs, plug in the laptop, and try again in good light.',
  'hand-lost': 'Your hand left the camera view too often. Keep thumb and index finger inside the box.',
  'hand-too-small': 'Your hand is too far from the camera. Move it closer until it fills the box.',
}
