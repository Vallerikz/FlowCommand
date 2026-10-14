"""
VIMS — API Rate Limiter
Configures SlowAPI per-IP rate limiting to protect VAHAN backend queries.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request
from fastapi.responses import JSONResponse

limiter = Limiter(key_func=get_remote_address, default_limits=["10/minute"])

def rate_limit_exceeded_handler(request: Request, exc):
    """
    Custom 429 response matching VIMS API error schema.
    """
    return JSONResponse(
        status_code=429,
        content={
            "error": "RATE_LIMIT_EXCEEDED",
            "message": "Maximum 10 lookups per minute. Retry after cooldown period.",
            "detail": str(exc),
            "status": 429
        }
    )
