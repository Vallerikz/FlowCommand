# FlowCommand / VIMS — Vehicle Intelligence & Movement Tracking System
### Adaptive Traffic Signal Control (ATSC) & Integrated Command and Control Centre (ICCC)
(Prototype)
---

## 1. System Overview

**FlowCommand / VIMS** (Vehicle Intelligence & Movement Tracking System) is a production-grade, state-of-the-art intelligent transportation and police command system built for high-density metropolitan intersections. It combines:

* **Adaptive Traffic Signal Control (ATSC):** Real-time Passenger-Car-Unit (PCU) weighted signal arbitration between perpendicular corridors (North-South and East-West) with strict safety bounds.
* **Automatic Number-Plate Recognition (ANPR):** Multi-stage computer vision pipeline featuring contour-based license plate localization and Tesseract OCR.
* **Vehicle Attribute Verification Engine:** Edge object classification (COCO-SSD) and color extraction cross-referenced against national vehicle registry databases to detect duplicate plates and stolen vehicle clones.
* **Multi-Factor Authentication (MFA) & RBAC:** Authentic Maharashtra Police hierarchy (Director General of Police down to Police Constable), RFC 6238 TOTP (Google/Microsoft Authenticator), and pluggable SMS OTP dispatch.
* **Bilingual GIGW 3.0 Compliance:** Standard English and Hindi interface with accessible semantic HTML, high contrast, and responsive command layouts.

---

## 2. Architecture & Project Layout

```
FlowCommand/
├── backend/
│   ├── main.py                     # FastAPI application entrypoint, CORS & security headers
│   ├── junction_router.py          # ATSC telemetry, regulation overrides, video ingestion
│   ├── traffic_engine.py           # Pure synchronous ATSC state machine (PCU load arbiter)
│   ├── video_engine.py             # Optional OpenCV + YOLOv8 MJPEG corridor streaming daemon
│   ├── requirements.txt            # Python dependencies (FastAPI, SlowAPI, OpenCV, etc.)
│   ├── routers/
│   │   ├── auth.py                 # RBAC directory, RFC 6238 TOTP, SMS dispatch, session tokens
│   │   ├── anpr.py                 # Image (/recognize) and Video (/scan-video) ANPR endpoints
│   │   ├── telemetry.py            # Real-time incident and camera alert WebSockets
│   │   └── vehicle.py              # Plate query and RTSP stream binding configurations
│   ├── services/
│   │   ├── anpr_engine.py          # Classical OpenCV contour filtering + Tesseract OCR
│   │   ├── traffic_modulation.py   # 2D digitalized lane-occupancy grid and signal builder
│   │   ├── vehicle_registry.py     # Registry interface (Official API / Verified Demo Records)
│   │   └── video_ingest.py         # Full-duration MOG2 background-subtraction vehicle density parser
│   └── utils/
│       ├── plate_validator.py      # Standard Indian license plate regex normalizer & validator
│       └── rate_limiter.py         # SlowAPI IP/Session rate-limiting middleware
├── css/
│   └── styles.css                  # Unified design system, glassmorphism HUD, cross-browser CSS
├── js/
│   ├── api.js                      # Centralized API fetch wrapper with quota tracking
│   ├── auth.js                     # Client-side session management & Maharashtra Police ranks
│   ├── citizen.js                  # Citizen portal controller (grievance & status tracking)
│   ├── command.js                  # Police Command Centre controller, live telemetry, ATSC canvas
│   ├── dashboard.js                # ICCC dashboard controller
│   ├── i18n.js                     # Bilingual dictionary (English & Hindi)
│   ├── sanitize.js                 # XSS prevention, safe DOM builder, plate sanitization
│   └── telemetry_socket.js         # WebSocket auto-reconnect stream handler
├── vims-frontend-export/           # Modern TanStack / Vite React frontend component library
├── citizen.html                    # Citizen Services Portal
├── command.html                    # Maharashtra Police Pune Command Centre interface
├── dashboard.html                  # ICCC Command Centre dashboard view
├── index.html                      # Central Command Gateway (Dual Officer/Citizen Login)
├── .env.example                    # Template of all environment variables
└── .gitignore                      # Git ignore rules for Python, Node, media, and secrets
```

---

## 3. Authentication & RBAC

### Maharashtra Police Hierarchy
Access control enforces genuine Maharashtra Police ranks and functional operational units:
* **Police Ranks:** DGP (Director General of Police), CP (Commissioner of Police), Joint CP, Addl. CP, DCP, ACP, PI (Police Inspector), API, PSI, ASI, HC (Head Constable), PC (Police Constable).
* **Operational Branches:** Traffic Branch, Crime Branch / CID, Cyber Crime Police Station, Special Branch, and Law & Order Station Divisions.

### Multi-Factor Authentication (MFA)
`backend/routers/auth.py` provides pure standard Python implementations without heavy external dependencies:
* **RFC 6238 TOTP Engine:** Uses standard HMAC-SHA1 with 30-second time steps and $\pm 1$ step drift tolerance. Officers can bind any authenticator app (Google Authenticator, Microsoft Authenticator, 1Password) using a Base32 secret (`VIMS_OFFICER_TOTP_SECRET`).
* **Pluggable SMS Gateway Provider:** Controlled via `VIMS_SMS_PROVIDER`:
  * `demo`: Outputs OTP to server log console (default demo OTP: `123456`).
  * `webhook`: Posts payload `{ "to": "...", "message": "..." }` to custom HTTP gateways.
  * `twilio`: Dispatches messages using Twilio REST API credentials.
  * `fast2sms`: Dispatches quick SMS alerts for Indian mobile numbers.
* **Session Hydration:** Token validation endpoints (`POST & GET /api/auth/validate-token`) allow Single Page Applications (SPA) and client state machines to seamlessly authenticate without redirects.

---

## 4. Adaptive Traffic Signal Control (ATSC)

### PCU Weighting Algorithm
The signal arbiter in `backend/traffic_engine.py` converts raw vehicle counts into Passenger Car Units (PCU) based on Indian road congestion standards:
$$\text{Total PCU} = \sum (\text{Count}_i \times \text{Weight}_i)$$

| Vehicle Classification | PCU Weight | Typical Silhouette |
|---|---|---|
| **Motorcycle / Scooter** | `0.5` | Two-wheeler agile transit |
| **Auto-Rickshaw (3W)** | `0.8` | Three-wheeler intermediate |
| **Standard Passenger Car** | `1.0` | Baseline unit (Sedan / Hatchback) |
| **Light Commercial Vehicle (LCV)** | `1.5` | Delivery vans, small pickups |
| **Heavy Bus / Truck** | `3.0` | Mass transit, multi-axle freight |

### Phase Control & Safety Bounds
* **Corridor Arbitration:** The active corridor holds GREEN as long as its live PCU density exceeds the waiting corridor, bounded by configurable minimum (`MIN_GREEN = 15s`) and maximum (`MAX_GREEN = 60s`) green timers.
* **Deterministic Transitions:** Every phase shift strictly transitions through amber clearance (`AMBER = 4s`) and all-red intersection clearance (`ALL_RED = 2s`) before the next corridor turns green. Clearance intervals cannot be skipped or truncated.
* **Emergency Regulation Overrides:** Command operators can trigger priority waves via `/api/junction/regulation-override`:
  * `FORCE_NS`: Grants priority clearance to North-South corridor.
  * `FORCE_EW`: Grants priority clearance to East-West corridor.
  * `ALL_RED`: Emergency intersection halt (e.g. VIP movement or perimeter lockdown).
  * `RESUME_AUTO`: Returns the intersection to PCU-density adaptive control.

### 2D Digital Traffic Modulation View
`backend/services/traffic_modulation.py` computes an 8-cell-per-lane approach grid directly from the live `AdaptiveJunctionController` state. It exposes `/ws/junction-modulation` and `/api/junction/modulation/state` to drive 2D junction animations without client-side guesswork.

---

## 5. Computer Vision & ANPR Pipeline

### On-Device AI Detection
`command.js` decodes real video keyframes onto off-screen canvases and performs edge inference using TensorFlow.js with COCO-SSD to detect vehicle class silhouettes and sample pixel histograms for exterior color identification.

### Server-Side OCR Engine (`backend/services/anpr_engine.py`)
1. **Candidate Localization:** Grayscale conversion $\to$ Bilateral Filtering $\to$ Canny Edge Detection $\to$ Contour Analysis filtering for Indian license plate aspect ratios ($1.8:1$ to $6.0:1$).
2. **Character Recognition:** Candidate crops are processed via Tesseract OCR (`--psm 7` alphanumeric whitelist).
3. **Format Validation:** Normalized candidates are verified against standard Indian license plate schemas in `backend/utils/plate_validator.py` (Modern, Bharat BH series, Commercial, and Legacy formats).

### Dual Analysis Modes
* **Single Image (`POST /api/anpr/recognize`):** Fast inference on high-resolution snapshots.
* **Full Video Scan (`POST /api/anpr/scan-video`):** Analyzes video files end-to-end, aggregating plate occurrences and calculating cross-frame OCR confidence.
* **Full Traffic Density Ingestion (`POST /api/junction/ingest-video`):** Analyzes videos up to 200MB using MOG2 background subtraction to compute corridor vehicle counts and update the live ATSC controller.

---

## 6. Cross-Browser Compatibility

FlowCommand has been validated and hardened for all major modern browsers:

* **Google Chrome & Chromium-based Browsers (Brave, Edge, Opera):** Full support for hardware-accelerated WebGL canvas rendering, WebSocket streams, and camera video decode.
* **Mozilla Firefox:** Verified CSS grid layouts, SVG telemetry dials, and strict CSP headers.
* **Apple Safari (WebKit):** Vendor-prefixed `-webkit-backdrop-filter: blur(4px);` included on HUD overlays, ensuring crisp glassmorphism rendering on macOS and iOS.
* **Content Security Policy (CSP):** Built-in CSP whitelists standard CDNs (`cdn.jsdelivr.net`, Google Fonts, TensorFlow Hub) and local WebSocket ports (`ws://localhost:8000`, `ws://127.0.0.1:8000`) with zero unsafe-eval requirements.

---

## 7. Quick Start & Installation

### Prerequisites
* Python 3.9+ installed
* Tesseract OCR installed on the system:
  * **Ubuntu / Debian:** `sudo apt-get update && sudo apt-get install -y tesseract-ocr`
  * **macOS:** `brew install tesseract`
  * **Windows:** Install via [UB-Mannheim Tesseract installer](https://github.com/UB-Mannheim/tesseract/wiki) and ensure `tesseract.exe` is added to PATH.

### 1. Setup Backend
```bash
# Clone the repository
git clone https://github.com/<your-username>/FlowCommand.git
cd FlowCommand

# Create and activate a virtual environment
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Configure environment variables
cp .env.example .env
```

### 2. Start the FastAPI Server
```bash
python -m backend.main
# Or using uvicorn directly:
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```
API Documentation will be available at:
* Swagger UI: `http://localhost:8000/docs`
* ReDoc: `http://localhost:8000/redoc`

### 3. Launch Frontend
Serve the root directory using any local HTTP static server:
```bash
# Using Python
python -m http.server 3000

# Or using Node http-server
npx http-server -p 3000
```
Open `http://localhost:3000/index.html` in your browser.

---

## 8. Key API Endpoints

| Category | Method | Path | Description |
|---|---|---|---|
| **System** | `GET` | `/health` | Node health probe and service status |
| **System** | `GET` | `/api/system/time` | Epoch & IST ISO timestamp for drift-free clock sync |
| **Auth** | `POST` | `/api/auth/send-otp` | Dispatch 6-digit verification code via SMS/Webhook |
| **Auth** | `POST` | `/api/auth/login` | Authenticate Police Officer or Citizen user |
| **Auth** | `GET` | `/api/auth/validate-token` | Validate active session token for SPA hydration |
| **ATSC** | `GET` | `/api/junction/state` | Snapshot of signal controller and corridor PCU |
| **ATSC** | `WS` | `/ws/junction-telemetry` | 1 Hz real-time signal and density broadcast |
| **ATSC** | `GET` | `/api/junction/modulation/state` | Snapshot of 2D lane occupancy and signal light state |
| **ATSC** | `WS` | `/ws/junction-modulation` | 1 Hz live 2D grid modulation broadcast |
| **ATSC** | `POST` | `/api/junction/regulation-override` | Override controls (`FORCE_NS`, `FORCE_EW`, `ALL_RED`, `RESUME_AUTO`) |
| **ATSC** | `POST` | `/api/junction/ingest-video` | Full video density analysis (feeds live controller) |
| **ANPR** | `POST` | `/api/anpr/recognize` | Plate localization and OCR on an uploaded image |
| **ANPR** | `POST` | `/api/anpr/scan-video` | End-to-end plate localization across full video |
| **Registry** | `POST` | `/api/vehicle/lookup` | Indian license plate registry cross-reference |
| **Telemetry** | `WS` | `/ws/telemetry` | Surveillance alerts & violation broadcast |

---

## 9. Pre-Push Checklist for GitHub (Private Repo)

Before committing and pushing this repository to your private GitHub:

1. **Secrets Isolation:** Confirm `.env` is NOT tracked by git. (The `.gitignore` strictly protects `.env` while tracking `.env.example`).
2. **Clean Artifacts:** Verify that no local `.venv/`, `__pycache__/`, temporary uploaded media (`*.mp4`, `*.avi`), or test logs exist in git staging.
3. **Verified Demo Credentials:**
   * **Officer Login:** Badge `MH-PI-4501` or `TRF0001`, Password `admin123` (or `VIMS_DEMO_OFFICER_PASSWORD`), OTP `123456`.
   * **Citizen Login:** Mobile `9876543210`, OTP `123456`.
   * **Demo Test Plates:** `MH12DE1433`, `DL04CAF5571`, `MH12DM0001`.
4. **Git Initialization:**
   ```bash
   git init
   git add .
   git commit -m "feat: initial release of FlowCommand VIMS ATSC and Command Centre"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-private-repo>.git
   git push -u origin main
   ```
