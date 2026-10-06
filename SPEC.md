# SPEC — TapTen (UnivaBio 2026)

## §0 Purpose
A browser page that runs a 10-second finger-tapping test — modelled on MDS-UPDRS Part III item 3.4 (tap index finger on thumb 10 times, as quickly and as big as possible), but with a fixed 10-second window so tests are comparable — from an ordinary webcam, measures **speed, size, rhythm and decrement** (the "sequence effect" that screen-tap tests cannot see), and keeps a private on-device diary tagged with medication state, printable as a one-page clinic sheet.
It is a **tracking tool for people already diagnosed** — not a diagnosis, not a severity score.

## §1 Success criteria (numbers)
- S1 Synthetic ground-truth benchmark (rendered 3D hand, known tap schedule, ≥24 clips over speed 1–5 Hz, amplitude, decrement 0–60 %, 3 viewpoints, 2 distances): tap-count exact match ≥ 90 % of clips, count MAE ≤ 0.5, decrement error ≤ 10 percentage points (median), rate error ≤ 0.2 Hz (median). Reported as measured, whatever the result.
- S2 Quality gate refuses a test (with a reason) when hand detection < 85 % of frames, effective fps < 15, hand too small, or duration < 9 s.
- S3 Zero network requests carrying video/landmarks: only static same-origin assets are fetched (enforced by CSP `connect-src 'self'`, checked by a test).
- S4 Unit tests for every domain function; layer check passes (domain imports nothing from adapters/ui).
- S5 One-page clinic sheet renders on A4/Letter from the diary.

## §2 Non-goals
Diagnosis, UPDRS severity score, model training, cloud accounts, clinical validation claims (we have no patient data; stated in the README and the video).

## §3 Ubiquitous language (code names match)
| Term | Code | Meaning |
|---|---|---|
| frame | `Frame` | `{t (s), lm: 21×{x,y,z} world landmarks (m) or null}` |
| aperture | `aperture()` | 3D distance thumb tip (4) ↔ index tip (8) ÷ hand scale (wrist 0 ↔ middle MCP 9). Unitless. |
| tap | `Tap` | one open→close cycle: `{tClose, amplitude (peak−trough aperture), interval}` |
| decrement | `decrementPct` | % change of amplitude from the first 3 taps to the last 3 taps (negative = getting smaller) |
| rhythm CV | `rhythmCv` | coefficient of variation of inter-tap intervals |
| hesitation | `hesitations` | intervals > 2 × median interval |
| quality gate | `assessQuality()` | pass/fail + reasons |
| session | `Session` | one finished test + med state (`on`/`off`/`unsure`) + hand (`left`/`right`) + note |
| diary | `Diary` | list of sessions on this device |
| clinic sheet | `buildClinicSheet()` | printable summary model |

## §4 Model
`Frame[] → apertureSeries → smooth → detectTaps → computeMetrics`, `Frame[] + meta → assessQuality`. Sessions persist via a `SessionStore` port (localStorage adapter; in-memory fake in tests).

## §5 Use cases
- UC-1 Run a test from the webcam (setup guide → 3-2-1 → 10 s → result).
- UC-2 Analyse an uploaded video file (same pipeline; for accessibility and validation).
- UC-3 Save to diary with medication state; see trend.
- UC-4 Print the clinic sheet.
- UC-5 Export / delete all data (JSON download, wipe).

## §6 Acceptance criteria (Given/When/Then)
- AC-1 Given a clean sinusoidal aperture at f Hz for 10 s, when detecting taps, then count = round(10·f) ± 1 and rate within 0.1 Hz.
- AC-2 Given amplitudes falling linearly by 40 %, then `decrementPct` ∈ [−48, −32].
- AC-3 Given one pause of 1.2 s inside 3 Hz tapping, then `hesitations` = 1.
- AC-4 Given 30 % frames without a hand, then quality gate fails with reason `hand-lost`.
- AC-5 Given small jitter (noise σ = 3 % of amplitude) and no tapping, then 0 taps.
- AC-6 Given a diary of on/off sessions, the clinic sheet groups by med state and shows median rate/amplitude/decrement per group and the date range.
- AC-7 `index.html` CSP contains `connect-src 'self'`; no source file calls `fetch`/`XMLHttpRequest`/`WebSocket`/`sendBeacon` outside the model loader.
- AC-8 Synthetic benchmark script prints the S1 table from real MediaPipe runs.

## §7 Layers
`src/domain/` (pure) ← `src/application/` ← `src/adapters/` (MediaPipe, camera, localStorage) ← `src/ui/`. `scripts/check-layers.mjs` enforces.

## UI acceptance (원칙-디자인 10)
One primary action per screen · plain words (no jargon without a one-line explanation) · large tap targets ≥ 44 px · readable at 390 px and 1280 px · contrast AA · status always visible (hand found / not found) · errors say what to do next · privacy promise on the first screen · "not a diagnosis" on result and sheet · keyboard reachable.
