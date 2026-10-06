// Synthetic hand renderer with exact ground truth. The WebXR generic-hand model (MIT, Amazon) has a flat
// joint list (every joint parented to the armature), so finger motion is done here with explicit forward kinematics.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const CHAIN_INDEX = ['index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip']
const CHAIN_THUMB = ['thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip']

export async function createSynthHand(canvas, { width = 640, height = 480, skin = 0xe0ac8a, bg = 0xd8d2c8 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(width, height, false)
  renderer.setClearColor(bg)
  const scene = new THREE.Scene()
  const cam = new THREE.PerspectiveCamera(40, width / height, 0.01, 10)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x887766, 2.2))
  const dl = new THREE.DirectionalLight(0xffffff, 1.5); dl.position.set(0.3, 0.5, 1); scene.add(dl)
  const gltf = await new GLTFLoader().loadAsync('/node_modules/@webxr-input-profiles/assets/dist/profiles/generic-hand/right.glb')
  const root = gltf.scene
  scene.add(root)
  root.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 }); o.frustumCulled = false } })
  const bones = {}; root.traverse((o) => { if (o.isBone) bones[o.name] = o })
  const rest = {}; for (const [n, b] of Object.entries(bones)) rest[n] = { p: b.position.clone(), q: b.quaternion.clone() }
  const box = new THREE.Box3().setFromObject(root); root.position.sub(box.getCenter(new THREE.Vector3()))

  const P = (n) => rest[n].p.clone()
  const lateral = P('pinky-finger-phalanx-proximal').sub(P('index-finger-phalanx-proximal')).normalize()

  function resetPose() { for (const [n, b] of Object.entries(bones)) { b.position.copy(rest[n].p); b.quaternion.copy(rest[n].q) } }
  function rotateChain(names, pivotName, axis, angle) {
    const q = new THREE.Quaternion().setFromAxisAngle(axis, angle)
    const pivot = bones[pivotName].position.clone()
    for (const n of names) {
      const b = bones[n]
      b.position.sub(pivot).applyQuaternion(q).add(pivot)
      b.quaternion.premultiply(q)
    }
  }
  // Pose parameters solved once by calibrate(): index flex (rad at MCP; PIP/DIP get 0.8×/0.6×) and thumb swing.
  const cal = { flexSign: 1, indexFlex: 0.5, thumbAxis: new THREE.Vector3(0, 0, 1), thumbMax: 0.6 }

  function pose(closure) { // closure 0 = rest (open), 1 = tips touching
    resetPose()
    const a = cal.indexFlex * closure * cal.flexSign
    rotateChain(CHAIN_INDEX, 'index-finger-phalanx-proximal', lateral, a)
    rotateChain(CHAIN_INDEX.slice(1), 'index-finger-phalanx-intermediate', lateral, a * 0.8)
    rotateChain(CHAIN_INDEX.slice(2), 'index-finger-phalanx-distal', lateral, a * 0.6)
    rotateChain(['thumb-metacarpal', ...CHAIN_THUMB].slice(1), 'thumb-metacarpal', cal.thumbAxis, cal.thumbMax * closure)
    root.updateMatrixWorld(true)
  }
  const tipDist = () => bones['thumb-tip'].position.distanceTo(bones['index-finger-tip'].position)
  const handScale = () => bones['wrist'].position.distanceTo(bones['middle-finger-phalanx-proximal'].position)
  /** Ground-truth aperture in the same units as the app (3D tip distance ÷ wrist→middle-MCP). */
  const gtAperture = () => tipDist() / handScale()

  function calibrate() {
    // 1) choose flex sign that brings the index tip toward the thumb tip
    let best = null
    for (const sign of [1, -1]) for (let k = 2; k <= 14; k++) {
      cal.flexSign = sign; cal.indexFlex = k * 0.05; cal.thumbMax = 0
      pose(1)
      const d = tipDist()
      if (!best || d < best.d) best = { d, sign, flex: cal.indexFlex }
    }
    cal.flexSign = best.sign; cal.indexFlex = best.flex
    // 2) thumb swing axis toward the flexed index tip, then search the angle that minimises the gap
    pose(1)
    const target = bones['index-finger-tip'].position.clone()
    resetPose()
    const piv = bones['thumb-metacarpal'].position.clone()
    const v1 = bones['thumb-tip'].position.clone().sub(piv), v2 = target.clone().sub(piv)
    cal.thumbAxis = new THREE.Vector3().crossVectors(v1, v2).normalize()
    let bt = null
    for (let k = 0; k <= 60; k++) { cal.thumbMax = k * 0.02; pose(1); const d = tipDist(); if (!bt || d < bt.d) bt = { d, m: cal.thumbMax } }
    cal.thumbMax = bt.m
    pose(1); const closed = gtAperture(); pose(0); const open = gtAperture()
    return { flexSign: cal.flexSign, indexFlex: cal.indexFlex, thumbMax: cal.thumbMax, closedAperture: closed, openAperture: open }
  }

  function setView({ rx = 0, ry = 0, rz = 0, dist = 0.45 } = {}) {
    root.rotation.set(rx, ry, rz)
    cam.position.set(0, 0, dist); cam.lookAt(0, 0, 0)
    root.updateMatrixWorld(true)
  }
  function render() { renderer.render(scene, cam) }
  const setVisible = (v) => { root.visible = v }
  return { calibrate, pose, setView, render, gtAperture, canvas, setVisible }
}

/** Tap schedule → closure(t). amp(t) shrinks linearly by `decrement` over `duration`; optional pause; small rhythm jitter. */
export function schedule({ f = 3, fEnd = null, a0 = 0.9, decrement = 0, duration = 10, pause = null, jitter = 0.03, seed = 1, tremor = 0 }) {
  let s = seed >>> 0; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  // build cycle boundaries with jittered periods
  const cycles = []; let t = 0
  const fAt = (tt) => (fEnd === null ? f : f + (fEnd - f) * Math.min(1, tt / duration)) // optional slowing
  while (t < duration + 1) { const T = (1 / fAt(t)) * (1 + jitter * (r() * 2 - 1)); cycles.push({ start: t, T }); t += T }
  const shift = (tt) => (pause && tt >= pause.at ? (tt >= pause.at + pause.len ? tt - pause.len : null) : tt)
  const ampAt = (tt) => a0 * (1 - decrement * Math.min(1, tt / duration))
  function closure(tt) {
    const u = shift(tt)
    if (u === null) return 1 - ampAt(pause.at) // held open during the pause
    const c = cycles.find((c) => u >= c.start && u < c.start + c.T) ?? cycles[cycles.length - 1]
    const ph = (u - c.start) / c.T // 0 open → 0.5 closed → 1 open
    const base = 1 - ampAt(c.start) * (1 + Math.cos(2 * Math.PI * ph)) / 2
    // optional 5 Hz finger tremor riding on the taps (closure units), clipped to the valid range
    return Math.min(1, Math.max(0, base + tremor * Math.sin(2 * Math.PI * 5 * tt)))
  }
  // ground-truth tap closes inside [0, duration]
  const closes = []
  for (const c of cycles) { const tc = c.start + c.T / 2; const real = pause && tc >= pause.at ? tc + pause.len : tc; if (real <= duration) closes.push({ t: real, amp: ampAt(c.start) }) }
  return { closure, closes }
}
