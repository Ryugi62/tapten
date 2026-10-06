# TapTen

**A 10-second finger-tapping test, measured privately by any webcam.**
Live: https://ryugi62.github.io/tapten · Built for UnivaBio 2026 (AI for Human Health) · ![tests](https://github.com/Ryugi62/tapten/actions/workflows/check.yml/badge.svg)

People with Parkinson's disease see a neurologist every few months. In between, how their movement changed when medication wore off is reported from memory. At the bedside, clinicians rate finger tapping (MDS-UPDRS Part III, item 3.4: tap the index finger on the thumb 10 times, as fast and as big as possible) and watch whether the taps get **slower and smaller** toward the end. Phone screen-tap tests capture speed but cannot see how wide the fingers open. TapTen uses a fixed 10-second window, as many digital tapping tests do, so every test is comparable.

TapTen runs that test from an ordinary webcam, inside the browser tab:

- **Numbers first** — taps in 10 s, taps per second, **size change from the first 3 to the last 3 taps**, **speed change** (first 3 vs last 3 gaps), pauses, a bar for every tap; the first-10-tap (clinic-style) size change in Details. One test is described in plain words with its uncertainty; after 3 tests it is placed inside or outside your own usual range (never narrower than ±20 points).
- **Quality gate** — no numbers when the hand was lost (> 15 % of frames), the camera was too slow (< 15 fps), the hand was too small, or the test was too short.
- **No clicking needed** — starts by itself when the hand is in view and still for 2 s (the Start button works whenever the hand is in view), 5-second countdown with beeps, a looping example of the movement.
- **Private motor diary** — tests tagged with states adapted from the Hauser home motor diary (on / on with troublesome dyskinesia / off / not sure), "before first dose", minutes since last dose; export and import; a **one-page clinic sheet** with medians per state and a taps-vs-minutes-since-dose chart.
- **No webcam?** "Try a sample recording" runs the whole pipeline on a synthetic-hand clip and shows the **true answer** next to the measured one. A video file can be analysed too (its original frame rate cannot be checked, so record at 30 fps).

> Not a diagnosis, not an MDS-UPDRS score. A research prototype — not cleared or approved as a medical device. Normal ranges for this home test are not known. Do not change medication based on it. Accuracy below is measured on a synthetic hand, not on people.

## How it works
- **AI part (not ours):** Google **MediaPipe Hand Landmarker** — pre-trained, Apache-2.0, bundled in `/vendor` — returns 21 3D hand points per frame. We trained no model.
- **Our part:** turning points into clinical measures, and proving how well that works.
  1. **Opening** = 3D distance thumb tip ↔ index tip ÷ wrist ↔ middle-finger knuckle (palm length) — moving closer to the camera does not change it.
  2. Short gaps filled → 3-frame median (removes single-frame glitches when ≥ 22 fps) → 60 ms smoothing → hysteresis peak/trough detection with a threshold of ¼ of the recording's own opening range (min 12 % of palm length); closes faster than 10 Hz merged; a tiny swing is dropped only if it also breaks the rhythm (a glitch), so severe small taps are kept.
  3. Metrics `src/domain/metrics.js` · quality gate `src/domain/quality.js` · neutral wording and comparison with your own earlier tests `src/domain/verdict.js`.
- Layers checked by `npm run layers` (and in GitHub Actions): `src/domain` (pure) ← `src/application` ← `src/adapters` (MediaPipe, camera, sound, storage, video file) ← `src/ui`.

## Accuracy — a ground-truth benchmark
We have no patient videos (that needs ethics approval), so we built a benchmark with exact answers: a rigged 3D hand (WebXR generic hand, MIT) is animated with a **known** tap schedule and rendered frame by frame; the frames go through the **same MediaPipe model and the same analysis code** as the app (the camera/video plumbing is bypassed; the full app path was checked separately with a synthetic fake webcam). Tools: `tools/bench.js`, `tools/run-bench.py`; raw results `docs/bench.json`.

| set | clips | exact tap count | within ±1 tap |
|---|---|---|---|
| clean (1.5–4.5 taps/s, shrink 0–60 %, pauses, 3 views, 2 distances) | 24 | 23 | 24 |
| degraded (blur, dim light, low contrast, sensor noise; half at 15 fps; up to 0.75 m) | 12 | 9 | 11 |
| **held-out 1** (in-distribution: new seeds, perturbed views, 1–5 taps/s, some degraded / 15 fps; first run 21/24 on earlier code, same result after later fixes) | 24 | 21 | 23 |
| of which: 5 Hz finger tremor on top of the taps | 4 | 3 | — |
| **held-out 2** (in-distribution, pre-registered in commit `63a4d16` — pushed and CI-run before the first benchmark run: severe 70–90 % decrement, slowing taps, 0.7–0.8 taps/s, small taps from the start) | 20 | 16 | 18 |

- **SPEC S1** (exact count on ≥ 90 % of clips): 69/80 = 86.3 % → **not met**. Misses: 15-fps degraded clips, tiny fast late taps in severe decrement, tremor on top of taps. Count error averages 0.25 taps.
- **Size change (decrement)** vs truth: bias 0.1 points, 95 % limits of agreement ± 19.4 points (Bland–Altman); median absolute error 6.3, worst 38.9. By viewpoint A/B/C the bias is 2.5 / 0 / -2.3 points, but single-clip errors are wide — so **a single test is never interpreted**: the app shows the number and compares it with the person's own earlier tests taken the same way.
- **Proportional bias:** error vs true size change has slope -0.12, i.e. severe shrinking tends to be under-read.
- **Severe decrement** (true ≤ −60 %, held-out 2): median error 9.3 points over 6 clips. At 3 taps/s with an 80 % shrink, the very smallest late taps were still missed (k03: 25/30, k04: 27/30) — a known limit, listed below.
- **Slowing** (rate falling across the 10 s): flagged as ≥ 10 % slower in 6/6 clips; median speed-change error 1.9 points.
- Shrinking clips (true ≤ −15 %) read at ≤ −15 %: **51/53** · steady clips (|true| < 5 %) read above −15 %: **26/27**.
- Pauses: found 9/10, false pauses 3/70.
- **Quality gate**: refused 6/6 negative clips (hand lost 30 %, 8 fps, hand too far); passed 80/80 normal clips.
- **Absolute tap size depends on viewpoint** — median error per view A/B/C: 0.8 % / -28.3 % / -32.8 %. That is why the app shows size *change* and asks users to compare tests taken the same way.
- Every clip, including the misses: [`docs/bench-table.md`](docs/bench-table.md).

Limits: size change is hidden below 24 fps; speed and size interact (fast early taps are slightly smoothed, which can hide up to ~10 points of shrinking); very small, fast late taps (≥ 3 taps/s with ≥ 80 % shrink) can be missed; one degraded small-tap clip (k20) read −2 % instead of −41 %. A synthetic hand has no skin texture, real tremor or real lighting; no person has been measured yet. In video-file mode the first 10 s are analysed at 30 frames per second; the browser cannot reliably report a file's original frame rate, so low-frame-rate files are not refused automatically. Real-world accuracy (and test–retest reliability) needs a study with people — planned, not done.

## Privacy
- `index.html` sets `Content-Security-Policy: connect-src 'self'` — the page can only talk to its own site. Model and WebAssembly engine are bundled; no account; the diary lives in this browser's localStorage (export / import / delete in one click).
- While testing we found that the MediaPipe runtime tries to send a usage log to `odml.pa.googleapis.com`; the CSP blocks it (browser console: *"Connecting to 'https://odml.pa.googleapis.com/v1/log' violates the following Content Security Policy directive"*).
- `tests/privacy.test.mjs` fails the check if code adds XHR/WebSocket/sendBeacon or any fetch other than the bundled sample/benchmark files.

## How TapTen differs from existing work
| | who uses it | where it runs | output | medication context |
|---|---|---|---|---|
| PARK finger-tapping (Islam et al., *npj Digital Medicine* 6:156, 2023; parktest.net) | patients, for research | web, webcam video scored for research | severity score 0–4 | — |
| FastEval Parkinsonism (PMC10853559) · video hand-pose bradykinesia (arXiv 2308.14679) | clinicians / research | server or research code | ratings | — |
| VisionMD (npj Parkinson's Disease 2025, open source) | clinicians, researchers | local desktop software for recorded videos | kinematic measures | — |
| Wearable sensors (e.g. Kinesia) | clinics, trials | dedicated device | motor scores | — |
| **TapTen** | patients and care partners, between visits | **inside the browser, nothing uploaded** | speed, size change, pauses — **no score** | motor-diary state, minutes since dose, clinic sheet |

## Finished vs. planned
- **Finished**: webcam test with auto-start, video-file analysis, quality gate, motor diary with export/import, clinic sheet, 86-clip benchmark incl. held-out and negative sets, 36 unit tests, mobile layout (390 px).
- **Planned**: measuring real people (healthy volunteers first, test–retest), then a study with people with Parkinson's and their neurologists; both-hand asymmetry; an offline cache for the 19 MB tracker; a left/right hand check (the tracker's label is computed, but the warning stays off until it is verified on real hands).

## Run locally
```
npm install                       # only needed for the benchmark tools
npm run check                     # unit tests + layer check (same as CI)
npm run serve                     # http://127.0.0.1:4321
pip install -r tools/requirements.txt && python -m playwright install chromium
npm run bench                     # re-run the synthetic benchmark (headless Chromium)
```

## Credits & licenses
TapTen — MIT. MediaPipe Tasks Vision & Hand Landmarker model — Apache-2.0. three.js — MIT, WebXR Input Profiles generic hand — MIT (benchmark tools only). Built by Taegeol Kim with AI coding assistance during UnivaBio (Oct 2026).
