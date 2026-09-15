# VIMS / FlowCommand — Debug & Change Report

## 1. Why the vehicle-lookup system was rebuilt (read this first)

The original `backend/services/vahan_scraper.py` + `vahan_fallback.py` and
their frontend mirror in `js/api.js` did two things that are unsafe
regardless of intended use, and were **removed rather than "hardened"**:

1. Attempted to scrape third-party sites (Park+, CarInfo, Acko, Curopin)
   for real vehicle-owner personal data — a ToS/legal/privacy problem.
2. For any plate not found, **fabricated** a plausible owner name,
   insurance policy, FIR number, chassis/engine number, etc. from a hash
   of the plate number, and labeled the invented result
   `CERTIFIED_VAHAN_ARCHIVE` / `CERTIFIED_RTO_REGISTRY` — i.e. presented
   generated fiction as an authentic government record.

Combined with the login system's "Armed Forces Command / Federal
Intelligence / clearance level 5" framing, this shape — realistic fake
official credentials plus fabricated "certified" police/registry
data — is exactly the pattern used to build convincing fake-government
tools, so I replaced it with an honest architecture instead of making it
"more real."

**What's there now:** `backend/services/vehicle_registry.py` + the new
`backend/services/anpr_engine.py`. Demo mode returns a couple of
clearly-fictional sample records (`MH12DM0001`, `DL04DM0002`) and an
honest "not found — demo mode" response for everything else. If you have
a real, authorized registry API, set `OFFICIAL_REGISTRY_API_URL` /
`OFFICIAL_REGISTRY_API_KEY` and wire your provider's field mapping into
`_map_official_response()` — nothing is invented in that path either.

## 2. Critical bug fixed: authentication accepted anything

`backend/routers/auth.py` previously accepted **any non-empty password**
and **any 6-digit string** as OTP, and read the officer's `division` (=
clearance level, up to "Armed Forces Command" / level 5) **directly from
the client's request body**. Anyone could self-assign top clearance with
no real credential check at all.

Fixed: badge_id + password now verify against a server-side
`OFFICER_DIRECTORY`; division/clearance is derived from that directory
record only. OTP verification is left as an explicit, documented stub
(`_verify_otp`) — format-checked but not a real second factor — wire a
real MFA/OTP provider there before using real credentials. Demo login:
badge `TRF0001`, password from `VIMS_DEMO_OFFICER_PASSWORD` env var
(defaults to `demo-pass-change-me` — change this).

## 3. CORS security bug fixed

`allow_origins=["*"]` combined with `allow_credentials=True` in
`backend/main.py` is both a browser-spec violation and a real hole (any
website could ride an authenticated officer's session). Now reads an
explicit allowlist from `VIMS_ALLOWED_ORIGINS` (comma-separated),
defaulting to local dev origins only.

## 4. Real ANPR/OCR added (backend/services/anpr_engine.py)

Classical OpenCV plate localization (bilateral filter → Canny edges →
contour/aspect-ratio filtering) + Tesseract OCR (`pytesseract`), with
every candidate normalized and validated against the real Indian plate
format rules already in `plate_validator.py`. Returns genuine OCR
confidence, not a fabricated number, and is honest when it can't find a
plate rather than guessing. Exposed at `POST /api/anpr/recognize`
(`backend/routers/anpr.py`).

**Requires the system package** `tesseract-ocr` in addition to the
Python packages in `requirements.txt` (`apt-get install tesseract-ocr`).
For production accuracy beyond this classical baseline, swap the
localization step for a trained plate-detector model — the OCR/
validation stages don't need to change.

## 5. Junction Camera Feed panel — replaced fabricated detections with real ones

The "Junction Camera Feed" canvas (`js/command.js`) was drawing **entirely
scripted** bounding boxes (sine/cosine-animated positions, hardcoded
confidence numbers like `0.94`, `0.97`) regardless of what video was
loaded — for the "Pre-Downloaded," local-file, and webcam modes alike.

- **Local file upload / webcam**: now runs real, client-side object
  detection (TensorFlow.js + coco-ssd, loaded from a public CDN) on the
  actual decoded video frames. Boxes, classes, and confidence scores are
  genuine model output. If the model can't load (e.g. no internet access
  to the CDN in your environment), the HUD honestly reports "DETECTION
  UNAVAILABLE" instead of falling back to fabricated boxes.
- **"Scan Entire Video"** (new button): steps through the *entire*
  uploaded file from 0 to its duration at a fixed 0.5s sampling interval
  — not just whatever plays live — running real detection on every
  sampled frame and showing an aggregate results table. This is the fix
  for "make sure it scans the entire video, not just the first few
  frames."
- **"Pre-Downloaded" mode**: there was no real video backing the 4
  scenario names (they were just labels on a random-walk vehicle
  simulator). Rather than fake a camera feed, this is now honestly
  labeled a schematic simulation ("no real camera") with the fabricated
  per-object confidence scores removed — it's still useful for
  demonstrating the adaptive signal-control logic, just no longer
  dressed up as AI-analyzed camera footage.
- **Remote MJPEG stream mode** was already genuine — it displays
  `backend/video_engine.py`'s real YOLOv8 detection output — untouched.

## 6. Update: dashboard.js ANPR pipeline is now real (previously listed as remaining work)

Two separate bugs were found and fixed here:

**a) The feature was completely dead in the live app.** `dashboard.html`
has the full upload-zone/pipeline markup, but never included a `<script
src="js/dashboard.js">` tag, and `dashboard.js` had no
`DOMContentLoaded` listener calling `DASHBOARD.init()` (unlike
`command.js`, which self-registers one at the bottom of the file). So
the drag-drop zone and "Run Pipeline" button had **zero event listeners
attached** — clicking them did nothing. Both are now fixed: the script
tag was added, and a matching self-init call was appended to
`dashboard.js`.

**b) `executeVideoPipeline()` was entirely scripted theater.** It used
`setTimeout` delays with hardcoded "frame" placeholders, a fixed
"97.4% confidence" YOLO result, a plate chosen from two hardcoded values
based on the filename or a coin flip (`Math.random() < 0.5`), then a
real backend lookup for that *fabricated* plate, followed by a
comparison that manufactured a "cloned plate suspect" verdict with
"Dispatch Field Interception Unit" / "Escalate to State Hotlist" action
buttons.

Rewritten to be real end-to-end:
- **Stage 1** — decodes real frames from the uploaded file. For a video,
  it seeks across the *entire* duration (up to 8 evenly-spaced real
  timestamps, not just the first few seconds) and captures genuine
  canvas frames; thumbnails shown are real `canvas.toDataURL()` output,
  not placeholder boxes.
- **Stage 2** — runs the same real TensorFlow.js/coco-ssd model used in
  the Junction Camera panel on each real frame to find an actual
  car/truck/bus/motorcycle detection, then computes a genuinely
  pixel-averaged dominant color from that real bounding-box region
  (mapped to the nearest of a 7-color palette — coarse, but real, and
  labeled as such). If the model can't load or finds nothing, it says
  so instead of inventing a result.
- **Stage 3** — sends each real frame to the actual backend
  `/api/anpr/recognize` OCR endpoint and keeps the best genuinely-valid
  result. If OCR can't read a plate from any frame, the pipeline stops
  and reports that honestly rather than guessing a plate number.
- **Stage 4** — looks up the plate OCR *actually found* (not a
  pre-selected one) via the same honest `vehicle_registry` service used
  elsewhere, with correct source labels (`OFFICIAL_REGISTRY_API`,
  `DEMO_DATA`, etc. — the UI previously checked for a `VAHAN_LIVE` value
  that no longer exists anywhere in the backend).
- **Stage 5** — only compares real detected class/color against the
  registry record when both actually exist; if the plate has no
  registry match, or no vehicle was visually detected, it says so
  instead of forcing a verdict. On a genuine discrepancy, it's labeled
  a low-confidence heuristic recommending human review — the automated
  "dispatch field unit" / "escalate to hotlist" buttons (which triggered
  no real backend action anyway) were replaced with a single honest
  "Flag for Manual Review" button that's explicit about doing nothing
  more than a local note.

This closes out the item listed as "known remaining issue" in the
previous version of this report.

## 7. Structural cleanup

The project had two parallel, same-named app implementations: an older
one at the repo root (`main.py`, `server.py`, `traffic_engine.py`,
`junction_router.py`) and the actively-developed one in `backend/`.
Running the wrong entrypoint would load different, inconsistent code.
Moved the root-level files into `legacy_prototype/` (kept for reference,
not imported by anything) — `backend/` is the single canonical app now.

## 8. Dependency changes

`requirements.txt` (root and `backend/`): removed `beautifulsoup4` (only
used by the deleted scraper), added `opencv-python-headless`,
`pytesseract`, `numpy` for the real ANPR engine. **System dependency**:
install `tesseract-ocr` via your package manager.

## 9. Suggested next steps for a genuinely "government-professional" build

- Wire `dashboard.js`'s upload flow to the real ANPR/registry endpoints
  (see §6).
- Replace the in-memory session store with Redis/DB-backed sessions —
  it's currently lost on every server restart and not shared across
  worker processes.
- Swap the demo SHA-256 password hashing for bcrypt/argon2 with per-user
  salts before any real credentials are used.
- If you have an authorized vehicle-registry data source, wire it into
  `vehicle_registry.py`'s `_map_official_response()`.
- Consider a trained plate-detector model in `anpr_engine.py` for
  production-grade localization accuracy.

## 10. New: "Traffic Modulation" backend support (no frontend touched)

Confirmed the real traffic-control feature is still there and working:
`backend/traffic_engine.py`'s `AdaptiveJunctionController` (a genuine
PCU-weighted, density-adaptive signal state machine) plus
`backend/junction_router.py`'s `/api/junction/regulation-override` and
the live `/ws/junction-telemetry` WebSocket — this is what the frontend's
"Traffic Regulation Actuation" buttons already call.

Added backend-only support for a future "Traffic Modulation" tab, per
request — **no HTML/JS/CSS file was modified or created**:

- `backend/services/traffic_modulation.py` (new): pure function
  `build_modulation_view(snapshot)` that derives a simplified,
  digitalized 2D view from the real, live controller snapshot — a
  small lane-occupancy grid (8 cells/lane, fill count computed
  deterministically from the real live vehicle totals, not random or
  animated) plus a per-arm (N/S/E/W) signal color derived from the real
  active corridor + light state.
- `backend/junction_router.py` (extended, existing endpoints
  untouched): added `GET /api/junction/modulation/state` (one-shot
  fetch) and `WS /ws/junction-modulation` (1 Hz push, separate
  connection registry from the existing telemetry socket so nothing
  already consuming `/ws/junction-telemetry` is affected).

Payload shape is documented in the new WebSocket endpoint's docstring in
`junction_router.py`. Whoever builds the frontend "Traffic Modulation"
tab can render the grid arrays + arm colors directly — every number in
the payload traces back to the same real controller state (and, once a
real camera feed posts to `/api/junction/update-counts`, real detection
counts) already driving the existing signal-control logic.

## 11. New: full-video ingestion (200MB cap), wired into the 2D grid — backend only

- `backend/services/video_ingest.py` (new): streams an uploaded video to
  disk with a hard, streaming-enforced 200MB cap (never buffers the
  whole file in memory), then analyzes the **entire duration** — frames
  are sampled evenly from first to last (up to 300 samples, so even a
  long/large file finishes in bounded time while still genuinely
  covering the full timeline, not just the start) — using real MOG2
  background-subtraction blob detection split across the same NS/EW
  left-right ROI convention used elsewhere in this project. Returns real
  per-corridor vehicle counts. Documented honestly: this blob-size
  heuristic can't distinguish "auto" from "car" or "lcv" from other
  classes by silhouette alone, so those are always reported as 0 rather
  than guessed — a real trained detector (`video_engine.py`'s YOLOv8
  pipeline) would be needed for finer classification, but that requires
  the `ultralytics` package and downloading model weights at runtime,
  neither of which is currently wired up.
- `POST /api/junction/ingest-video` (new, in `junction_router.py`):
  accepts the upload, runs the analysis, and — this is the "transcribed
  into the 2D graph style" part — immediately pushes the real resulting
  counts into the same live `AdaptiveJunctionController` that already
  powers the Traffic Modulation grid and telemetry socket, then returns
  the resulting `modulation_view` (the exact 2D grid + signal payload
  from §10) in the response and broadcasts it to any connected
  `/ws/junction-modulation` / `/ws/junction-telemetry` clients. So a
  video uploaded through this endpoint shows up in the existing 2D grid
  view immediately, with no frontend file touched.

No existing endpoint or frontend file was modified to add this.

---

## 11. Merge Session — Parallel Copy Reconciliation (Sept 13, 2026)

A second copy of this project (`FlowCommand - Copy` from a different
archive, internally referred to during this session as "the new upload")
was reviewed against this one and reconciled as follows.

**Verified and merged in:**
- `POST /api/anpr/scan-video` — full-video ANPR OCR scan (real OpenCV
  localization + Tesseract OCR, same engine as `/recognize`, applied frame
  by frame across an entire uploaded video and aggregated by plate with
  frame-hit counts and confidence). Added to `anpr_engine.py` and
  `anpr.py` additively; `/api/anpr/recognize` and its function are
  unchanged.

**Reviewed and deliberately NOT merged:**
- `vahan_fallback.py` — a fallback vehicle-record generator that produces
  a full synthetic owner/vehicle/insurance record for *any* plate,
  deterministically derived from a hash of the plate string and tagged
  `"data_mode": "DEMO"`. Despite the honest labeling, this is structurally
  the same category of thing flagged in §2.1/§8.1 above (realistic-looking
  personal-style records generated on demand). This build keeps the
  existing, more conservative design: a small fixed set of obviously
  fictional sample plates plus an honest "not found" for everything else.
- A second, independently-written pass at the CORS/auth/vehicle-registry
  fixes (functionally equivalent to what's already in this codebase —
  same bugs, same category of fix, different code). Not merged since it
  would just replace working, already-verified code with an alternate
  implementation of the same fix, with no functional gain.
- Stray top-level duplicate files (`main.py`, `traffic_engine.py`,
  `junction_router.py`, `server.py` sitting outside `backend/`) and an
  `ultralytics` requirements-file entry that isn't wired into any code
  path in that copy — treated as leftover clutter, not features.

**Not touched:** all frontend files, per the standing project requirement.
