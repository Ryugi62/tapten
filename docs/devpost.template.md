# Devpost submission — TapTen (UnivaBio 2026)

**Project name:** TapTen
**Tagline (≤200):** A 10-second finger-tapping test for people living with Parkinson's, measured privately by any webcam — speed and the shrinking of taps, kept on your device for your next appointment.
**Links:** Live https://ryugi62.github.io/tapten/ · GitHub https://github.com/Ryugi62/tapten · Video (2–3 min): ⟨YouTube URL⟩
**Built with:** javascript, html5, css3, mediapipe, webassembly, web-audio-api, github-pages, github-actions, node.js, playwright, three.js
**Team:** Taegeol Kim — solo (undergraduate student, Changwon National University, South Korea). Built with AI coding assistance, as the rules encourage.

## Inspiration
People with Parkinson's disease usually see a neurologist every few months. In between, "how did you move when your medication wore off?" is answered from memory.

At the bedside, one of the most informative checks takes seconds: **finger tapping** (MDS-UPDRS Part III, item 3.4). You tap your index finger on your thumb ten times, as fast and as big as you can. The clinician watches whether the taps get **slower** and, especially, **smaller** toward the end — the "decrement".

Phone screen-tap tests can measure speed, but a finger hitting glass cannot show how wide the fingers open. A webcam can. TapTen uses a fixed 10-second window, as many digital tapping tests do, so every test is comparable.

## What it does
- **The test, from any webcam.** Choose the hand and tag how you move right now (adapted from the Hauser home motor diary: on / on with troublesome dyskinesia / off / not sure), plus "before first dose" and time since the last levodopa dose (one-tap chips). A looping clip shows the movement. The test **starts by itself** once the hand is in view and held still for 2 seconds — no clicking with a shaky hand — with a 5-second countdown and beeps.
- **Numbers first.** Taps in 10 s, taps per second, **size change from the first 3 to the last 3 taps**, **speed change** (first vs last gaps) and pauses, with a bar for every tap; the clinic-style first-10-tap size change is in Details.
- **No over-interpretation.** On our benchmark 95 % of single tests are within ±{{decLoa}} points (worst {{decMaxErr}}), so a single result is described in plain words without judgement, and size is hidden when the camera runs below 24 fps. After 3 tests with the same hand and medication state, TapTen compares each new test with **your own usual**.
- **A quality gate.** No numbers when the hand was lost in more than 15 % of frames, the camera ran under 15 fps, the hand was too small, or the test was too short. It says what to fix.
- **A private motor diary and a clinic sheet.** Tests stay in this browser (export / import / delete). One click prints a one-page sheet with medians per state and a chart of taps per second against minutes since the last dose.
- **No webcam?** "Try a sample recording" runs the whole pipeline on a synthetic-hand clip and shows the **true answer next to the measured one**. A video file can be analysed too (its original frame rate cannot be checked, so record at 30 fps).
- **Safety copy everywhere:** do not change medication based on these numbers; normal ranges for this home test are not known; it cannot tell whether someone has Parkinson's.

## How we built it
- **The AI part (not ours):** Google MediaPipe Hand Landmarker — pre-trained, bundled with the site — gives 21 3D hand points per frame inside the browser tab. We trained no model.
- **Our part:** turning those points into clinical measures, and proving how well that works.
  - **Opening:** 3D distance thumb tip ↔ index tip, divided by palm length (wrist ↔ middle knuckle), so moving closer to the camera doesn't change it.
  - **Taps:** gap fill → 3-frame median (removes single-frame glitches) → 60 ms smoothing → hysteresis peak/trough detection with a threshold of ¼ of the recording's own opening range. Tiny off-rhythm glitches and closes faster than 10 Hz are ignored; small in-rhythm taps are kept; a partial first tap (recording started mid-close) is dropped.
- **Timing:** tap intervals use the camera frame's own timestamp (`requestVideoFrameCallback`), not the render time.
- **Code:** plain JavaScript in Clean Architecture layers (`domain` ← `application` ← `adapters` ← `ui`). {{tests}} unit tests and a layer check run in GitHub Actions on every push.

## How accurate is it?
We have no patient videos yet, because collecting them needs ethics approval. Instead we built a **ground-truth benchmark**. A rigged 3D hand is animated with a **known** tap schedule, and the frames go through the **same MediaPipe model and the same analysis code** as the app. Only the camera and video plumbing is bypassed; the full app path was checked separately with a synthetic fake webcam.

| set | clips | exact tap count | within ±1 |
|---|---|---|---|
| clean | {{cleanClips}} | {{cleanExact}} | {{cleanWithin1}} |
| degraded (blur, dim light, noise, half at 15 fps) | {{hardClips}} | {{hardExact}} | {{hardWithin1}} |
| **held-out 1** (in-distribution; 1–5 taps/s, new viewpoints, some with 5 Hz tremor; first run 21/24 on earlier code) | {{holdoutClips}} | {{holdoutExact}} | {{holdoutWithin1}} |
| **held-out 2** (pre-registered in its own commit before running: severe 70–90 % decrement, slowing, < 1 tap/s, small taps) | {{holdout2Clips}} | {{holdout2Exact}} | {{holdout2Within1}} |

- **Our own target missed or met, stated plainly:** exact count on ≥ 90 % of clips — we got {{allExact}}/{{positiveClips}} ({{allExactPct}} %), **{{s1Status}}**. The misses come from three causes: 15-fps degraded clips, tiny fast late taps in severe decrement, and tremor on top of taps.
- **Size change vs truth:** bias {{decBias}} points, 95 % limits of agreement ±{{decLoa}} points; single-clip errors are wide (worst {{decMaxErr}} points), which is why single tests aren't interpreted.
- **Proportional bias:** error vs true size change has slope {{decPropSlope}} — severe shrinking tends to be under-read.
- **Severe decrement** (true ≤ −60 %): median error {{severeDecMedianErr}} points. The very smallest late taps at 3 taps/s with an 80 % shrink were still missed (25/30 and 27/30) — reported as a limit, not hidden.
- **Slowing:** flagged in {{slowingDetected}} slowing clips (median error {{slowingSpeedMedianErr}} points).
- **Pauses:** found {{pauseSensitivity}}, with {{pauseFalsePos}} false pauses.
- **Quality gate:** refused **{{negativeRejected}}** deliberately bad recordings (hand lost 30 %, 8 fps, hand 2.4 m away).
- **Absolute tap size depends on the viewpoint:** median error per view {{ampA}} % / {{ampB}} % / {{ampC}} %. So TapTen leads with size *change* and asks people to compare tests taken the same way.
- Every clip, including the misses: `docs/bench-table.md`.

**Limits, plainly:** a synthetic hand is not a person. It has no skin texture, no real tremor and no real-world lighting. No person — with or without Parkinson's — has been measured yet.

## Privacy
- The page's Content-Security-Policy is `connect-src 'self'`: it can only talk to its own site. The model and engine are bundled, and there is no account.
- **Found while testing:** the MediaPipe runtime tries to send a usage log to `odml.pa.googleapis.com`, and TapTen's policy blocks it. You can see this in the browser console, and a test keeps network code from creeping back in.

## How it differs from existing work
- **PARK web finger-tapping test** (Islam et al., *npj Digital Medicine* 2023) scores severity 0–4 from webcam video for research.
- **VisionMD** (npj Parkinson's Disease 2025) is open-source desktop software that analyses recorded videos locally for clinicians and researchers.
- **FastEval Parkinsonism** (PMC10853559) and video hand-pose bradykinesia work (arXiv 2308.14679) serve clinicians.
- **TapTen's difference** is four things: **nothing is uploaded**, **no score**, a **live quality gate**, and **medication timing** (movement state + time since dose) on a one-page sheet for the clinic.

## Challenges we ran into
- **Slow, noisy taps were double-counted.** At 1.5 taps/s with blur and noise, single-frame glitches looked like extra taps (19 counted vs 14 true in our first degraded run). A 3-frame median and a range-based threshold fixed it. Because we tuned on that set, we added **held-out** sets; the second was pre-registered in its own commit before it was ever run. They come from the same generator, so they test over-tuning, not real-world shift.
- **Our first glitch filter would have hidden severe disease.** Reviewers pointed out that dropping "tiny" taps also drops the tiny late taps of a severe decrement — exactly the clinical signal. The filter now drops a tiny swing only if it also breaks the rhythm, and we pre-registered a second held-out set of severe cases in a separate commit before running it.
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
- An offline cache for the 19 MB tracker download.
- A left/right hand check (computed already; the warning stays off until verified on real hands).

> TapTen is a tracking tool and a research prototype. It is not a diagnosis, not an MDS-UPDRS score, and not cleared or approved as a medical device.
