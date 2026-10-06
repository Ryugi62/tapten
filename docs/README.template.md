# TapTen

**The 10-second finger-tapping test, measured privately by any webcam.**
Live: https://ryugi62.github.io/tapten · Built for UnivaBio 2026 (AI for Human Health).

People with Parkinson's disease see a neurologist every few months. In between, how their movement changed when medication wore off is reported from memory. At the bedside, clinicians rate the finger-tapping test (MDS-UPDRS Part III, item 3.4): tap the index finger on the thumb, as fast and as big as possible, for 10 seconds — and watch whether the taps get **slower and smaller** toward the end. Phone screen-tap tests capture speed but cannot see size.

TapTen runs that test from an ordinary webcam, inside the browser tab:

- **Numbers first** — taps in 10 s, taps per second, typical opening (% of hand length), **size change from the first 3 to the last 3 taps**, rhythm unevenness, pauses, and a bar for every tap.
- **Quality gate** — no numbers when the hand was lost (< 85 % of frames), the camera was too slow (< 15 fps), the hand was too small, or the test was too short.
- **Private diary** tagged with medication state (on / wearing off / not sure) and a **one-page clinic sheet** to print or save as PDF.
- **Video-file mode** and a **sample recording** (synthetic hand) for anyone without a webcam.

> Not a diagnosis, not an MDS-UPDRS score, not a medical device. Accuracy below is measured on a synthetic hand, not on patients.

## How it works
1. Google **MediaPipe Hand Landmarker** (pre-trained, Apache-2.0, bundled in `/vendor`) returns 21 3D hand points per frame.
2. **Opening** = 3D distance thumb tip ↔ index tip ÷ wrist ↔ middle-finger knuckle — moving closer to the camera does not change it.
3. Short gaps filled → 3-frame median (removes single-frame glitches when ≥ 22 fps) → 60 ms smoothing → hysteresis peak/trough detection with a threshold of ¼ of the recording's own opening range (min 12 % of hand length), closes faster than 10 Hz merged, swings < 35 % of the median tap dropped.
4. Metrics: `src/domain/metrics.js`. Quality gate: `src/domain/quality.js`.

Layers (checked by `npm run layers`): `src/domain` (pure) ← `src/application` ← `src/adapters` (MediaPipe, camera, localStorage, video file) ← `src/ui`.

## Accuracy — a ground-truth benchmark
We have no patient videos (that needs ethics approval), so we built a benchmark with exact answers: a rigged 3D hand (WebXR generic hand, MIT) is animated with a **known** tap schedule, rendered, and passed through the **same MediaPipe tracker and the same app code** (`tools/bench.js`, `tools/run-bench.py`, results in `docs/bench.json`).

| set | clips | exact tap count | within ±1 tap |
|---|---|---|---|
| clean (1.5–4.5 taps/s, shrink 0–60 %, pauses, 3 views, 2 distances) | {{cleanClips}} | {{cleanExact}} | {{cleanWithin1}} |
| degraded (blur, dim light, low contrast, sensor noise; half at 15 fps; up to 0.75 m) | {{hardClips}} | {{hardExact}} | {{hardWithin1}} |

- Size-change (decrement) error: median **{{decMedianErr}} points**, worst {{decMaxErr}} points.
- Shrinking clips (true ≤ −20 %) flagged at ≤ −15 %: **{{shrinkingDetected}}** · steady clips not flagged: **{{steadyNotFlagged}}** · pauses detected correctly: {{hesitationAgree}}/{{clips}}.
- Every clip, including the misses: [`docs/bench-table.md`](docs/bench-table.md).

Limits: a synthetic hand has no skin texture, tremor, or real lighting; real-world accuracy needs a clinical study (planned, not done).

## Privacy
- `index.html` sets `Content-Security-Policy: connect-src 'self'` — the page can only talk to its own site. Model and WebAssembly engine are bundled; no account; the diary lives in this browser's localStorage (export / delete in one click).
- While testing we found that the MediaPipe runtime tries to send a usage log to `odml.pa.googleapis.com`; the CSP blocks it (browser console: *"Connecting to 'https://odml.pa.googleapis.com/v1/log' violates the following Content Security Policy directive"*).
- `tests/privacy.test.mjs` fails the build if code adds XHR/WebSocket/sendBeacon or any fetch other than the bundled sample files.

## Finished vs. planned
- **Finished**: webcam test, video-file analysis, quality gate, diary + on/off tags, clinic sheet, 36-clip benchmark, {{tests}} unit tests, mobile layout (390 px).
- **Planned**: validation with patients and clinicians; both hands in one session; tremor and rest measures.

## Run locally
```
npm install          # only needed for the benchmark tools
npm run check        # unit tests + layer check
npm run serve        # http://127.0.0.1:4321
npm run bench        # re-run the synthetic benchmark (headless Chromium)
```

## Related work
Video-based finger-tapping quantification exists in research and clinician tools (e.g. FastEval Parkinsonism, PMC10853559; video hand-pose bradykinesia assessment, arXiv 2308.14679). TapTen's difference is the setting: a patient-held, on-device diary with medication tags, made for the time between appointments.

## Credits & licenses
TapTen — MIT. MediaPipe Tasks Vision & Hand Landmarker model — Apache-2.0. three.js — MIT, WebXR Input Profiles generic hand — MIT (benchmark tools only). Built by Taegeol Kim with AI coding assistance during UnivaBio (Oct 2026).
