"""
VIMS — Vehicle Intelligence & Movement Tracking System
FastAPI Backend Application Entry Point
"""

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
import time
from backend.utils.rate_limiter import limiter, rate_limit_exceeded_handler
from backend.routers import vehicle, auth, telemetry
from backend import junction_router

app = FastAPI(
    title="VIMS — Vehicle Intelligence & Movement Tracking System",
    description="Integrated Command and Control Centre (ICCC) Vehicle Registry & ANPR Verification API",
    version="1.0.0"
)

# ── Attach Rate Limiter ──
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# ── CORS Middleware ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Security Headers Middleware (Audit 1.3 & 5.3) ──
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# ── Healthcheck & System Time Synchronization (Audit 2.4) ──
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
    now_epoch = time.time()
    return {
        "epoch": now_epoch,
        "ist_offset_seconds": 19800,  # UTC + 5:30
        "server_time_iso": time.strftime("%Y-%m-%dT%H:%M:%S+05:30", time.localtime(now_epoch + 19800))
    }


# ── Include Routers ──
app.include_router(auth.router)
app.include_router(telemetry.router)
app.include_router(vehicle.router)
app.include_router(junction_router.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
