# TapTen

**A 10-second finger-tapping test, measured privately by any webcam.**
Live: https://ryugi62.github.io/tapten · Built for UnivaBio 2026 (AI for Human Health) · ![tests](https://github.com/Ryugi62/tapten/actions/workflows/check.yml/badge.svg)

People with Parkinson's disease see a neurologist every few months. In between, how their movement changed when medication wore off is reported from memory. At the bedside, clinicians rate finger tapping (MDS-UPDRS Part III, item 3.4: tap the index finger on the thumb 10 times, as fast and as big as possible) and watch whether the taps get **slower and smaller** toward the end. Phone screen-tap tests capture speed but cannot see size. TapTen uses a fixed 10-second window, as many digital tapping tests do, so every test is comparable.

TapTen runs that test from an ordinary webcam, inside the browser tab:

- **Numbers first** — taps in 10 s, taps per second, **size change from the first 3 to the last 3 taps**, size trend per tap, pauses, and a bar for every tap.
- **Quality gate** — no numbers when the hand was lost (> 15 % of frames), the camera was too slow (< 15 fps), the hand was too small, or the test was too short.
- **Built for shaky hands** — starts by itself when the hand is steady (no button), 5-second countdown with beeps, a looping example of the movement.
- **Private motor diary** — tests tagged with the states of a standard home motor diary (on / on with troublesome dyskinesia / off / not sure), "before first dose", minutes since last dose; export and import; a **one-page clinic sheet** with medians per state and a taps-vs-minutes-since-dose chart.
- **No webcam?** "Try a sample recording" runs the whole pipeline on a synthetic-hand clip and shows the **true answer** next to the measured one. Any video file can be analysed too.

> Not a diagnosis, not an MDS-UPDRS score, not a medical device. Normal ranges for this home test are not known. Do not change medication based on it. Accuracy below is measured on a synthetic hand, not on people.

## How it works
- **AI part (not ours):** Google **MediaPipe Hand Landmarker** — pre-trained, Apache-2.0, bundled in `/vendor` — returns 21 3D hand points per frame. We trained no model.
- **Our part:** turning points into clinical measures, and proving how well that works.
  1. **Opening** = 3D distance thumb tip ↔ index tip ÷ wrist ↔ middle-finger knuckle (palm length) — moving closer to the camera does not change it.
  2. Short gaps filled → 3-frame median (removes single-frame glitches when ≥ 22 fps) → 60 ms smoothing → hysteresis peak/trough detection with a threshold of ¼ of the recording's own opening range (min 12 % of palm length); closes faster than 10 Hz merged; swings < 35 % of the median tap dropped.
  3. Metrics `src/domain/metrics.js` · quality gate `src/domain/quality.js` · plain-language bands `src/domain/verdict.js` (only ≤ −25 % is called "clearly smaller", because one test can be off by several points).
- Layers checked by `npm run layers` (and in GitHub Actions): `src/domain` (pure) ← `src/application` ← `src/adapters` (MediaPipe, camera, sound, storage, video file) ← `src/ui`.

## Accuracy — a ground-truth benchmark
We have no patient videos (that needs ethics approval), so we built a benchmark with exact answers: a rigged 3D hand (WebXR generic hand, MIT) is animated with a **known** tap schedule and rendered frame by frame; the frames go through the **same MediaPipe model and the same analysis code** as the app (the camera/video plumbing is bypassed; the full app path was checked separately with a synthetic fake webcam). Tools: `tools/bench.js`, `tools/run-bench.py`; raw results `docs/bench.json`.

| set | clips | exact tap count | within ±1 tap |
|---|---|---|---|
| clean (1.5–4.5 taps/s, shrink 0–60 %, pauses, 3 views, 2 distances) | {{cleanClips}} | {{cleanExact}} | {{cleanWithin1}} |
| degraded (blur, dim light, low contrast, sensor noise; half at 15 fps; up to 0.75 m) | {{hardClips}} | {{hardExact}} | {{hardWithin1}} |
| **held-out** (frozen before running, run once: new seeds, perturbed views, 1–5 taps/s, some degraded / 15 fps) | {{holdoutClips}} | {{holdoutExact}} | {{holdoutWithin1}} |
| of which: 5 Hz finger tremor on top of the taps | {{tremorClips}} | {{tremorExact}} | — |

- **SPEC S1** (exact count on ≥ {{s1Target}} % of clips): {{allExact}}/{{positiveClips}} = {{allExactPct}} % → **{{s1Status}}**. Count error averages {{countMae}} taps.
- **Size change (decrement)** vs truth: bias {{decBias}} points, 95 % limits of agreement ± {{decLoa}} points (Bland–Altman); median absolute error {{decMedianErr}}, worst {{decMaxErr}}.
- Shrinking clips (true ≤ −20 %) read at ≤ −15 %: **{{shrinkingDetected}}** · steady clips (|true| < 5 %) read above −15 %: **{{steadyNotFlagged}}**.
- Pauses: found {{pauseSensitivity}}, false pauses {{pauseFalsePos}}.
- **Quality gate**: refused {{negativeRejected}} negative clips (hand lost 30 %, 8 fps, hand too far); passed {{positivePassed}} normal clips.
- **Absolute tap size depends on viewpoint** — median error per view A/B/C: {{ampA}} % / {{ampB}} % / {{ampC}} %. That is why the app shows size *change* and asks users to compare tests taken the same way.
- Every clip, including the misses: [`docs/bench-table.md`](docs/bench-table.md).

Limits: a synthetic hand has no skin texture, real tremor or real lighting; no person has been measured yet. In video-file mode the first 10 s are analysed at 30 frames per second; the browser cannot reliably report a file's original frame rate, so low-frame-rate files are not refused automatically. Real-world accuracy (and test–retest reliability) needs a study with people — planned, not done.

## Privacy
- `index.html` sets `Content-Security-Policy: connect-src 'self'` — the page can only talk to its own site. Model and WebAssembly engine are bundled; no account; the diary lives in this browser's localStorage (export / import / delete in one click).
- While testing we found that the MediaPipe runtime tries to send a usage log to `odml.pa.googleapis.com`; the CSP blocks it (browser console: *"Connecting to 'https://odml.pa.googleapis.com/v1/log' violates the following Content Security Policy directive"*).
- `tests/privacy.test.mjs` fails the check if code adds XHR/WebSocket/sendBeacon or any fetch other than the bundled sample/benchmark files.

## How TapTen differs from existing work
| | who uses it | where it runs | output | medication context |
|---|---|---|---|---|
| PARK finger-tapping (Islam et al., *npj Digital Medicine* 6:156, 2023; parktest.net) | patients, for research | web, webcam video scored for research | severity score 0–4 | — |
| FastEval Parkinsonism (PMC10853559) · video hand-pose bradykinesia (arXiv 2308.14679) | clinicians / research | server or research code | ratings | — |
| Wearable sensors (e.g. Kinesia) | clinics, trials | dedicated device | motor scores | — |
| **TapTen** | patients and care partners, between visits | **inside the browser, nothing uploaded** | speed, size change, pauses — **no score** | motor-diary state, minutes since dose, clinic sheet |

## Finished vs. planned
- **Finished**: webcam test with auto-start, video-file analysis, quality gate, motor diary with export/import, clinic sheet, {{clips}}-clip benchmark incl. held-out and negative sets, {{tests}} unit tests, mobile layout (390 px).
- **Planned**: measuring real people (healthy volunteers first, test–retest), then a study with people with Parkinson's and their neurologists; both-hand asymmetry; checking that the tracked hand matches the chosen hand.

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
