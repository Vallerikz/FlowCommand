"""
VIMS — Server-Side Authentication & Division Access Control Router
Validates credentials against a server-side officer directory and assigns
clearance levels 1-5 based on that directory record — never from
client-supplied fields.

Includes:
  * RFC 6238 TOTP generator and validator (Google/Microsoft Authenticator compliant)
  * Pluggable SMS/Webhook provider (Demo, Webhook, Fast2SMS, Twilio)
  * POST /api/auth/send-otp endpoint for on-demand OTP dispatch
  * Session token validation (/api/auth/validate-token) for SPA hydration
  * Multi-format login support (badge ID only for officers, mobile or email for citizens)
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import secrets
import struct
import time
from typing import Annotated, Any, Dict, Literal, Optional, Union

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Discriminator, Field, Tag

logger = logging.getLogger("vims.auth")
router = APIRouter(prefix="/api/auth", tags=["Authentication & RBAC"])

# RFC 6238 TOTP Generator and Verifier (Zero Dependency)

def generate_totp(secret: str, time_step: int = 30, digits: int = 6, t: Optional[float] = None) -> str:
    """Generate RFC 6238 Time-Based One-Time Password using HMAC-SHA1."""
    if t is None:
        t = time.time()
    counter = int(t // time_step)
    clean_secret = secret.upper().replace(" ", "").replace("-", "")
    missing_padding = len(clean_secret) % 8
    if missing_padding != 0:
        clean_secret += "=" * (8 - missing_padding)
    try:
        key = base64.b32decode(clean_secret, casefold=True)
    except Exception:
        key = clean_secret.encode("utf-8")

    msg = struct.pack(">Q", counter)
    h = hmac.new(key, msg, hashlib.sha1).digest()
    offset = h[-1] & 0x0F
    code = (struct.unpack(">I", h[offset : offset + 4])[0] & 0x7FFFFFFF) % (10**digits)
    return str(code).zfill(digits)


def verify_totp(otp: str, secret: str, window: int = 1, time_step: int = 30, digits: int = 6) -> bool:
    """Verify an RFC 6238 TOTP code within +/- window steps (default: 30s drift)."""
    if not otp or len(otp) != digits or not otp.isdigit():
        return False
    now = time.time()
    for step_offset in range(-window, window + 1):
        test_time = now + (step_offset * time_step)
        expected = generate_totp(secret, time_step=time_step, digits=digits, t=test_time)
        if hmac.compare_digest(otp, expected):
            return True
    return False


# SMS / OTP Dispatch — now uses centralized SMSService
from backend.services.sms_service import SMSService

# In-memory store for OTPs dispatched via SMS/email: identifier -> {"otp": ..., "expires_at": ...}
OTP_STORE: Dict[str, Dict[str, Any]] = {}
OTP_TTL_SECONDS = int(os.getenv("VIMS_OTP_TTL_SECONDS", "600"))  # 10 min
ALLOW_DEMO_OTP = os.getenv("VIMS_ALLOW_DEMO_OTP", "true").lower() in ("true", "1", "yes")
DEMO_OTP = os.getenv("VIMS_DEMO_OTP", "123456").strip()

# OTP resend cooldown per identifier (seconds)
OTP_RESEND_COOLDOWN = int(os.getenv("VIMS_OTP_RESEND_COOLDOWN", "60"))
OTP_LAST_SENT: Dict[str, float] = {}  # identifier -> last_sent_timestamp

# Brute-Force Protection
MAX_LOGIN_ATTEMPTS = int(os.getenv("VIMS_MAX_LOGIN_ATTEMPTS", "5"))
LOCKOUT_DURATION_SECONDS = int(os.getenv("VIMS_LOCKOUT_DURATION", "900"))  # 15 minutes

# Tracks failed login attempts: identifier -> {"count": int, "first_failure": float, "locked_until": float}
LOGIN_ATTEMPTS: Dict[str, Dict[str, Any]] = {}


def _check_brute_force(identifier: str) -> Optional[str]:
    """Check if identifier is locked out due to brute-force protection.
    Returns error message if locked, None if allowed."""
    record = LOGIN_ATTEMPTS.get(identifier)
    if not record:
        return None

    now = time.time()

    # Check if lockout is active
    if record.get("locked_until", 0) > now:
        remaining = int(record["locked_until"] - now)
        minutes = remaining // 60
        seconds = remaining % 60
        logger.warning(f"[VIMS AUTH] Brute-force lockout active for {identifier}. {remaining}s remaining.")
        return f"Account temporarily locked due to {MAX_LOGIN_ATTEMPTS} failed attempts. Try again in {minutes}m {seconds}s."

    # If lockout has expired, reset
    if record.get("locked_until", 0) > 0 and record["locked_until"] <= now:
        LOGIN_ATTEMPTS.pop(identifier, None)
        return None

    return None


def _record_failed_login(identifier: str) -> None:
    """Record a failed login attempt and trigger lockout if threshold reached."""
    now = time.time()

    if identifier not in LOGIN_ATTEMPTS:
        LOGIN_ATTEMPTS[identifier] = {"count": 0, "first_failure": now, "locked_until": 0}

    record = LOGIN_ATTEMPTS[identifier]

    # Reset if first failure was more than lockout duration ago
    if now - record["first_failure"] > LOCKOUT_DURATION_SECONDS:
        record["count"] = 0
        record["first_failure"] = now

    record["count"] += 1
    logger.warning(f"[VIMS AUTH] Failed login attempt {record['count']}/{MAX_LOGIN_ATTEMPTS} for {identifier}")

    if record["count"] >= MAX_LOGIN_ATTEMPTS:
        record["locked_until"] = now + LOCKOUT_DURATION_SECONDS
        logger.error(f"[VIMS AUTH] Brute-force lockout triggered for {identifier}. Locked for {LOCKOUT_DURATION_SECONDS}s.")


def _clear_failed_logins(identifier: str) -> None:
    """Clear failed login records after successful authentication."""
    LOGIN_ATTEMPTS.pop(identifier, None)


def _verify_otp(identifier: str, otp: str, user_record: Optional[Dict[str, Any]] = None) -> bool:
    """
    Verifies the supplied 6-digit OTP against:
      1. Fixed demo OTP if ALLOW_DEMO_OTP is enabled (default: '123456').
      2. Dynamic SMS OTP cache (OTP_STORE) dispatched via /api/auth/send-otp.
      3. RFC 6238 TOTP authenticator token (user-specific or default secret).
    """
    if not otp or len(otp) != 6 or not otp.isdigit():
        return False

    # 1. Demo OTP check
    if ALLOW_DEMO_OTP and otp == DEMO_OTP:
        return True

    # 2. Check dynamic dispatched OTP
    clean_id = identifier.strip().lower()
    stored = OTP_STORE.get(clean_id)
    if stored:
        if time.time() <= stored["expires_at"] and hmac.compare_digest(otp, stored["otp"]):
            del OTP_STORE[clean_id]  # Consume once
            return True

    # 3. Check RFC 6238 TOTP
    secret = (user_record.get("totp_secret") if user_record else None) or os.getenv(
        "VIMS_OFFICER_TOTP_SECRET", "JBSWY3DPEHPK3PXP"
    )
    if verify_totp(otp, secret):
        return True

    return False


# RBAC Directory & Sessions

DIVISION_RANKS = {
    "ARMED_FORCES": {"name": "Armed Forces Command", "rank": 1, "clearance": 5, "prefix": "DEF"},
    "FEDERAL_INTEL": {"name": "Federal Intelligence & NIA", "rank": 2, "clearance": 4, "prefix": "FED"},
    "FORENSIC_CYBER": {"name": "Cyber & Forensic Intelligence", "rank": 3, "clearance": 3, "prefix": "FOR"},
    "STATE_POLICE": {"name": "State Police Crime Branch", "rank": 4, "clearance": 2, "prefix": "POL"},
    "TRAFFIC_ENFORCE": {"name": "Traffic & Transport Enforcement", "rank": 5, "clearance": 1, "prefix": "TRF"},
}


def _hash_demo_password(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


OFFICER_DIRECTORY: Dict[str, Dict[str, Any]] = {
    "TRF0001": {
        "email": "demo.officer@example.gov.in",
        "division": "TRAFFIC_ENFORCE",
        "password_hash": _hash_demo_password(os.getenv("VIMS_DEMO_OFFICER_PASSWORD", "demo-pass-change-me")),
        "totp_secret": os.getenv("VIMS_OFFICER_TOTP_SECRET", "JBSWY3DPEHPK3PXP"),
    },
    "MH-PI-4501": {
        "email": "arjun.deshmukh@mahapolice.gov.in",
        "division": "TRAFFIC_ENFORCE",
        "password_hash": _hash_demo_password("admin123"),
        "totp_secret": "JBSWY3DPEHPK3PXP",
    },
}

ACTIVE_SESSIONS: Dict[str, Dict[str, Any]] = {}


# Payload Schemas

class SendOtpPayload(BaseModel):
    identifier: str = Field(..., min_length=3, description="Mobile number, email address, or Badge ID")
    channel: Literal["sms", "email", "totp"] = "sms"


class OfficerLoginPayload(BaseModel):
    role: Literal["law"] = "law"
    badge_id: str = Field(..., min_length=1, description="Officer badge ID")
    password: str = Field(..., min_length=1, description="Account passcode")
    otp: str = Field(..., min_length=6, max_length=6, description="6-digit MFA OTP")
    email: Optional[str] = Field(None, description="Official email address (optional if registered in directory)")


class CitizenLoginPayload(BaseModel):
    role: Literal["citizen"] = "citizen"
    otp: str = Field(..., min_length=6, max_length=6, description="6-digit OTP")
    mobile: Optional[str] = Field(None, description="Mobile phone number")
    email: Optional[str] = Field(None, description="Citizen email address")


LoginPayload = Annotated[
    Union[
        Annotated[OfficerLoginPayload, Tag("law")],
        Annotated[CitizenLoginPayload, Tag("citizen")],
    ],
    Discriminator("role"),
]


# Router Endpoints

@router.post("/send-otp")
async def send_otp(payload: SendOtpPayload):
    """
    Generate and dispatch a 6-digit OTP via the configured SMS provider.
    Includes resend cooldown (60s) and rate limiting per identifier.
    In demo mode, prints the OTP to the console log and accepts '123456'.
    """
    identifier = payload.identifier.strip()
    if not identifier:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Identifier is required.")

    clean_id = identifier.lower()

    # Resend cooldown check
    last_sent = OTP_LAST_SENT.get(clean_id, 0)
    if time.time() - last_sent < OTP_RESEND_COOLDOWN:
        remaining = int(OTP_RESEND_COOLDOWN - (time.time() - last_sent))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {remaining} seconds before requesting another OTP.",
        )

    # SMS rate limit check
    remaining_quota = SMSService.get_rate_remaining(clean_id)
    if remaining_quota <= 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="SMS rate limit exceeded. Please try again later.",
        )

    code = str(secrets.randbelow(900000) + 100000)
    OTP_STORE[clean_id] = {
        "otp": code,
        "expires_at": time.time() + OTP_TTL_SECONDS,
    }
    OTP_LAST_SENT[clean_id] = time.time()

    message = f"[VIMS Security] Your verification token is {code}. Valid for {OTP_TTL_SECONDS // 60} minutes."
    result = await SMSService.send_sms(identifier, message)

    return {
        "success": result["success"],
        "message": f"OTP dispatched to {identifier}.",
        "expires_in_seconds": OTP_TTL_SECONDS,
        "sms_provider": result.get("provider", "unknown"),
        "remaining_quota": remaining_quota - 1,
        "demo_hint": "Use '123456' or the dispatched OTP code." if ALLOW_DEMO_OTP else None,
    }


@router.post("/login")
async def login(payload: LoginPayload):
    """
    Authenticate a Law Enforcement officer or Citizen user.
    Officer division/clearance is derived server-side from directory records.
    Includes brute-force protection: 5 failed attempts = 15 min lockout.
    """
    if isinstance(payload, OfficerLoginPayload):
        badge_id = payload.badge_id.strip().upper()
        password = payload.password
        otp = payload.otp.strip()

        # Brute-force check
        lockout_msg = _check_brute_force(badge_id)
        if lockout_msg:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=lockout_msg)

        officer = OFFICER_DIRECTORY.get(badge_id)
        if not officer:
            _record_failed_login(badge_id)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid badge ID.")

        email = (payload.email or officer["email"]).strip()
        if officer["email"].lower() != email.lower():
            _record_failed_login(badge_id)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid badge ID or email.")

        if _hash_demo_password(password) != officer["password_hash"]:
            _record_failed_login(badge_id)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

        if not _verify_otp(badge_id, otp, officer):
            _record_failed_login(badge_id)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Multi-Factor Authentication Token / OTP."
            )

        # Successful auth — clear failed attempts
        _clear_failed_logins(badge_id)

        division_key = officer["division"]
        div_info = DIVISION_RANKS.get(division_key, DIVISION_RANKS["TRAFFIC_ENFORCE"])

        token = f"vims_sec_{secrets.token_hex(24)}"
        session_data = {
            "token": token,
            "role": "law",
            "name": f"Officer {badge_id}",
            "email": email,
            "badge_id": badge_id,
            "badgeId": badge_id,
            "division": division_key,
            "division_name": div_info["name"],
            "divisionName": div_info["name"],
            "constitutionalRank": div_info["rank"],
            "clearance": str(div_info["clearance"]),
            "clearanceLevel": div_info["clearance"],
            "expiresAt": time.time() + (8 * 3600),
        }
        ACTIVE_SESSIONS[token] = session_data
        logger.info(f"[VIMS AUTH] Officer {badge_id} authenticated successfully.")

        return {"success": True, "token": token, "user": session_data}

    else:
        identifier = (payload.mobile or payload.email or "").strip()
        otp = payload.otp.strip()

        if not identifier:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Mobile number or email is required."
            )

        # Brute-force check for citizen login
        lockout_msg = _check_brute_force(identifier)
        if lockout_msg:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=lockout_msg)

        if not _verify_otp(identifier, otp):
            _record_failed_login(identifier)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid 6-digit verification OTP."
            )

        # Successful auth — clear failed attempts
        _clear_failed_logins(identifier)

        token = f"vims_cit_{secrets.token_hex(24)}"
        if len(identifier) >= 10 and identifier.isdigit():
            masked = f"{identifier[:2]}{'•' * (len(identifier) - 6)}{identifier[-4:]}"
        elif "@" in identifier:
            parts = identifier.split("@")
            masked = f"{parts[0][:2]}•••@{parts[1]}"
        else:
            masked = "••••"

        session_data = {
            "token": token,
            "role": "citizen",
            "name": f"Citizen ({masked})",
            "mobile": payload.mobile,
            "email": payload.email,
            "clearance": "0",
            "clearanceLevel": 0,
            "expiresAt": time.time() + (8 * 3600),
        }
        ACTIVE_SESSIONS[token] = session_data
        logger.info(f"[VIMS AUTH] Citizen {masked} authenticated successfully.")

        return {"success": True, "token": token, "user": session_data}


@router.post("/validate-token")
@router.get("/validate-token")
async def validate_token(authorization: Optional[str] = Header(None)):
    """Validates session token for SPA hydration (React / TanStack Router)."""
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization Header")

    token = authorization.replace("Bearer ", "").strip()
    session = ACTIVE_SESSIONS.get(token)

    if not session or time.time() > session["expiresAt"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired or invalid")

    return {"success": True, "valid": True, "user": session}


@router.get("/session")
async def get_session(authorization: Optional[str] = Header(None)):
    """Validate active session token and return user clearance."""
    return await validate_token(authorization)


@router.post("/logout")
async def logout(authorization: Optional[str] = Header(None)):
    """Invalidate active session token."""
    if authorization:
        token = authorization.replace("Bearer ", "").strip()
        ACTIVE_SESSIONS.pop(token, None)
    return {"success": True, "message": "Session invalidated"}
