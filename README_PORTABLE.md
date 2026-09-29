# FlowCommand — Portable Quick-Start Guide

> **For SIH judges and evaluators.** No manual setup required.

---

## How to Launch

1. **Double-click `start.bat`** (or `run_silent.vbs` for a no-console launch).
2. Wait approximately 30-60 seconds on first run — it downloads a portable Python runtime and installs dependencies automatically.
3. Your default browser will open to `http://localhost:3000/index.html`.

That's it. No Python, Node.js, or any other toolchain needs to be pre-installed.

---

## What Happens Behind the Scenes

| Step | Action |
|------|--------|
| 1 | Checks for a local `python/` directory. If missing, downloads Python 3.11.9 embedded (~25 MB). |
| 2 | Creates a virtual environment and installs `requirements.txt` dependencies via pip. |
| 3 | Starts the **backend** (FastAPI/Uvicorn) on port `8000`. |
| 4 | Starts the **frontend** (Python HTTP server) on port `3000`. |
| 5 | Opens the browser automatically. |

---

## Demo Credentials

| Role | Login | Password / OTP |
|------|-------|-----------------|
| Officer | Badge: `MH-PI-4501` | Password: `admin123`, OTP: `123456` |
| Citizen | Mobile: `9876543210` | OTP: `123456` |

---

## Test Plates (Offline Fallback)

These plates return full vehicle data even without a live backend:

| Plate | Owner | Vehicle |
|-------|-------|---------|
| `MH12DE1433` | Kavita Suresh Patil | Maruti Swift VXi |
| `DL04CAF5571` | Rajesh Kumar Sharma | Mahindra Scorpio S11 |
| `MH14EU4092` | Sneha Pramod Kulkarni | Hyundai Creta SX (O) |
| `22BH1234A` | Amitesh Ranjan | Honda Activa 6G DLX |
| `MH12AB1001` | Rohan Amit Shinde | Bajaj Pulsar 150 |
| `MH14CD2002` | Vikram Jadhav | Royal Enfield Classic 350 |

---

## Stopping the Application

Close the `start.bat` terminal window, or press `Ctrl+C` inside it.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Port 8000/3000 already in use | Close the existing process or change ports in `start.bat`. |
| Download fails | Check internet connection. The Python download requires HTTPS access to `python.org`. |
| Browser doesn't open | Manually navigate to `http://localhost:3000/index.html`. |
