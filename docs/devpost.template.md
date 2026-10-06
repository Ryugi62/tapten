# Devpost submission — TapTen (UnivaBio 2026)

**Project name:** TapTen
**Tagline (≤200):** A 10-second finger-tapping test for Parkinson's, measured privately by any webcam — speed and the shrinking of taps, kept on your device for your next appointment.
**Links:** Live https://ryugi62.github.io/tapten/ · GitHub https://github.com/Ryugi62/tapten · Video (2–3 min): ⟨YouTube URL⟩
**Built with:** javascript, html5, css3, mediapipe, webassembly, web-audio-api, github-pages, github-actions, node.js, playwright, three.js
**Team:** Taegeol Kim — solo (undergraduate student, Changwon National University, South Korea). Built with AI coding assistance, as the rules encourage.

## Inspiration
People with Parkinson's disease usually see a neurologist every few months. In between, "how did you move when your medication wore off?" is answered from memory.

At the bedside, one of the most informative checks takes seconds: **finger tapping** (MDS-UPDRS Part III, item 3.4). You tap your index finger on your thumb ten times, as fast and as big as you can. The clinician watches whether the taps get **slower** and, especially, **smaller** toward the end — the "decrement".

Phone screen-tap tests can measure speed, but a finger hitting glass cannot show how wide the hand opened. A webcam can. TapTen uses a fixed 10-second window, as many digital tapping tests do, so every test is comparable.

## What it does
- **The test, from any webcam.** Choose the hand and tag the state used in standard home motor diaries: on / on with troublesome dyskinesia / off / not sure, plus "before first dose" and minutes since the last dose. A looping clip shows the movement. The test **starts by itself** once the hand is steady (no clicking with a shaky hand), with a 5-second countdown and beeps.
- **Numbers first.** Taps in 10 s, taps per second, **size change from the first 3 to the last 3 taps**, size trend per tap and pauses, with a bar for every tap. Only a change of −25 % or more is called "clearly smaller", because one test can be off by several points.
- **A quality gate.** No numbers when the hand was lost in more than 15 % of frames, the camera ran under 15 fps, the hand was too small, or the test was too short. It says what to fix.
- **A private motor diary and a clinic sheet.** Tests stay in this browser (export / import / delete). One click prints a one-page sheet with medians per state and a chart of taps per second against minutes since the last dose.
- **No webcam?** "Try a sample recording" runs the whole pipeline on a synthetic-hand clip and shows the **true answer next to the measured one**. Any video file can be analysed too.
- **Safety copy everywhere:** do not change medication based on these numbers; normal ranges for this home test are not known; it cannot tell whether someone has Parkinson's.

## How we built it
- **The AI part (not ours):** Google MediaPipe Hand Landmarker — pre-trained, bundled with the site — gives 21 3D hand points per frame inside the browser tab. We trained no model.
- **Our part:** turning those points into clinical measures, and proving how well that works.
  - **Opening:** 3D distance thumb tip ↔ index tip, divided by palm length (wrist ↔ middle knuckle), so moving closer to the camera doesn't change it.
  - **Taps:** gap fill → 3-frame median (removes single-frame glitches) → 60 ms smoothing → hysteresis peak/trough detection with a threshold of ¼ of the recording's own opening range. Tiny swings and closes faster than 10 Hz are ignored.
- **Code:** plain JavaScript in Clean Architecture layers (`domain` ← `application` ← `adapters` ← `ui`). {{tests}} unit tests and a layer check run in GitHub Actions on every push.

## How accurate is it?
We have no patient videos yet, because collecting them needs ethics approval. Instead we built a **ground-truth benchmark**. A rigged 3D hand is animated with a **known** tap schedule, and the frames go through the **same MediaPipe model and the same analysis code** as the app. Only the camera and video plumbing is bypassed; the full app path was checked separately with a synthetic fake webcam.

| set | clips | exact tap count | within ±1 |
|---|---|---|---|
| clean | {{cleanClips}} | {{cleanExact}} | {{cleanWithin1}} |
| degraded (blur, dim light, noise, half at 15 fps) | {{hardClips}} | {{hardExact}} | {{hardWithin1}} |
| **held-out** (frozen before running, run once; 1–5 taps/s, new viewpoints, some with 5 Hz tremor) | {{holdoutClips}} | {{holdoutExact}} | {{holdoutWithin1}} |

- **Our own target missed or met, stated plainly:** exact count on ≥ 90 % of clips — we got {{allExact}}/{{positiveClips}} ({{allExactPct}} %), **{{s1Status}}**.
- **Size change vs truth:** bias {{decBias}} points, 95 % limits of agreement ±{{decLoa}} points.
- **Pauses:** found {{pauseSensitivity}}, with {{pauseFalsePos}} false pauses.
- **Quality gate:** refused **{{negativeRejected}}** deliberately bad recordings (hand lost 30 %, 8 fps, hand 2.4 m away).
- **Absolute tap size depends on the viewpoint:** median error per view {{ampA}} % / {{ampB}} % / {{ampC}} %. So TapTen leads with size *change* and asks people to compare tests taken the same way.
- Every clip, including the misses: `docs/bench-table.md`.

**Limits, plainly:** a synthetic hand is not a person. It has no skin texture, no real tremor and no real-world lighting. No person — with or without Parkinson's — has been measured yet.

## Privacy
- The page's Content-Security-Policy is `connect-src 'self'`: it can only talk to its own site. The model and engine are bundled, and there is no account.
- **Found while testing:** the MediaPipe runtime tries to send a usage log to `odml.pa.googleapis.com`, and TapTen's policy blocks it. You can see this in the browser console, and a test keeps network code from creeping back in.

## How it differs from existing work
- **PARK web finger-tapping test** (Islam et al., *npj Digital Medicine* 2023) scores severity 0–4 from video for research.
- **FastEval Parkinsonism** (PMC10853559) and video hand-pose bradykinesia work (arXiv 2308.14679) serve clinicians.
- **TapTen** gives **no score**, uploads **nothing**, and adds what a neurologist asks about between visits: the medication state and minutes since the dose, on a one-page sheet.

## Challenges we ran into
- **Slow, noisy taps were double-counted.** At 1.5 taps/s with blur and noise, single-frame glitches looked like extra taps (19 counted vs 14 true in our first degraded run). A 3-frame median, a range-based threshold and a minimum-size rule fixed it. Because we tuned on that set, we then froze a separate **held-out** set and ran it once.
- **Seeking a video handed the tracker stale frames.** We now wait for the new frame to be presented and copy it to a canvas first.
- **The rigged hand model had no bone hierarchy,** so we wrote forward kinematics to make it tap.

## Accomplishments that we're proud of
- An accuracy table with exact answers, a held-out set, negative tests for the quality gate, and our missed target reported as missed.
- The privacy claim is enforced in code, and checking it caught a real outgoing request.

## What we learned
- How clinicians actually rate bradykinesia, and why amplitude decrement and medication timing matter.
- That "it works on my webcam" is not evidence — a benchmark with exact answers, frozen before running, is.

## What's next (planned — not done)
- Measure real people: healthy volunteers first (test–retest, hand-counted slow-motion video).
- Then a study with people with Parkinson's and their neurologists.
- Both-hand asymmetry.
- Checking that the tracked hand matches the chosen hand.

> TapTen is a tracking tool. It is not a diagnosis, not an MDS-UPDRS score, and not a medical device.
