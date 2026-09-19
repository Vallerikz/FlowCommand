"""
VIMS — Vehicle Intelligence & Movement Tracking System
FastAPI Backend Application Entry Point
"""

import os
import time
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from backend.utils.rate_limiter import limiter, rate_limit_exceeded_handler
from backend.routers import vehicle, auth, telemetry, anpr
from backend import junction_router

app = FastAPI(
    title="VIMS — Vehicle Intelligence & Movement Tracking System",
    description="Integrated Command and Control Centre (ICCC) Vehicle Registry & ANPR Verification API",
    version="1.0.0"
)

# ── Attach Rate Limiter ──
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# CORS Middleware
_allowed_origins = [
    o.strip()
    for o in os.getenv(
        "VIMS_ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080",
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# Healthcheck & System Time Synchronization
@app.get("/health", tags=["System"])
@app.get("/api/health", tags=["System"])
async def health_check():
    return {
        "status": "ONLINE",
        "node": "VIMS_ICCC_CORE_NODE_01",
        "service": "Vehicle Intelligence & Movement Tracking System",
        "version": "1.0.0"
    }

@app.get("/api/system/time", tags=["System"])
async def get_system_time():
    """
    Returns server epoch and IST ISO timestamp for clock drift correction.
    """
    IST = timezone(timedelta(hours=5, minutes=30))
    now_utc = datetime.now(timezone.utc)
    now_ist = now_utc.astimezone(IST)
    return {
        "epoch": now_utc.timestamp(),
        "ist_offset_seconds": 19800,  # UTC + 5:30
        "server_time_iso": now_ist.strftime("%Y-%m-%dT%H:%M:%S+05:30")
    }

# ── Include Routers ──
app.include_router(auth.router)
app.include_router(telemetry.router)
app.include_router(vehicle.router)
app.include_router(anpr.router)
app.include_router(junction_router.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
