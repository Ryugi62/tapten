// Adapter: webcam stream.
export async function startCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: 'user' }, audio: false })
  video.srcObject = stream
  await video.play()
  return () => stream.getTracks().forEach((t) => t.stop())
}
