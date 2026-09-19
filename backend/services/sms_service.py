"""
VIMS — Centralized SMS Delivery Service
Supports: Demo (console), Webhook, Fast2SMS, Twilio, MSG91
Includes retry logic, delivery tracking, and rate limiting per recipient.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict, Optional

logger = logging.getLogger("vims.sms")

# Configuration from environment
SMS_PROVIDER = os.getenv("VIMS_SMS_PROVIDER", "demo").lower()
SMS_API_URL = os.getenv("VIMS_SMS_API_URL", "").strip()
SMS_API_KEY = os.getenv("VIMS_SMS_API_KEY", "").strip()
SMS_SENDER_ID = os.getenv("VIMS_SMS_SENDER_ID", "VIMSIN").strip()

# MSG91 specific
MSG91_AUTH_KEY = os.getenv("VIMS_MSG91_AUTH_KEY", "").strip()
MSG91_TEMPLATE_ID = os.getenv("VIMS_MSG91_TEMPLATE_ID", "").strip()
MSG91_SENDER_ID = os.getenv("VIMS_MSG91_SENDER_ID", "VIMSIN").strip()

# Rate limiting: max messages per recipient per hour
MAX_SMS_PER_RECIPIENT_PER_HOUR = int(os.getenv("VIMS_MAX_SMS_PER_HOUR", "5"))

# Delivery tracking (in-memory)
_delivery_log: Dict[str, list] = {}  # recipient -> [{timestamp, status, provider}]
_rate_tracker: Dict[str, list] = {}  # recipient -> [timestamps]


class SMSService:
    """Centralized SMS delivery service with multi-provider support."""

    @staticmethod
    def _normalize_phone(phone: str) -> str:
        """Normalize Indian phone number: strip +91, spaces, dashes."""
        clean = phone.strip().replace(" ", "").replace("-", "")
        if clean.startswith("+91"):
            clean = clean[3:]
        elif clean.startswith("91") and len(clean) == 12:
            clean = clean[2:]
        return clean

    @staticmethod
    def _check_rate_limit(recipient: str) -> bool:
        """Check if recipient has exceeded SMS rate limit."""
        now = time.time()
        one_hour_ago = now - 3600

        if recipient not in _rate_tracker:
            _rate_tracker[recipient] = []

        # Prune old entries
        _rate_tracker[recipient] = [
            ts for ts in _rate_tracker[recipient] if ts > one_hour_ago
        ]

        return len(_rate_tracker[recipient]) < MAX_SMS_PER_RECIPIENT_PER_HOUR

    @staticmethod
    def _record_send(recipient: str, status: str, provider: str) -> None:
        """Record SMS delivery attempt for audit trail."""
        now = time.time()

        if recipient not in _rate_tracker:
            _rate_tracker[recipient] = []
        _rate_tracker[recipient].append(now)

        if recipient not in _delivery_log:
            _delivery_log[recipient] = []
        _delivery_log[recipient].append({
            "timestamp": now,
            "status": status,
            "provider": provider,
        })

        # Keep only last 50 entries per recipient
        if len(_delivery_log[recipient]) > 50:
            _delivery_log[recipient] = _delivery_log[recipient][-50:]

    @staticmethod
    async def send_sms(
        recipient: str,
        message: str,
        provider_override: Optional[str] = None,
        max_retries: int = 2,
    ) -> Dict[str, Any]:
        """
        Send SMS via configured provider with retry logic.

        Returns:
            {"success": bool, "provider": str, "message": str}
        """
        phone = SMSService._normalize_phone(recipient)
        provider = provider_override or SMS_PROVIDER

        # Rate limit check
        if not SMSService._check_rate_limit(phone):
            logger.warning(f"[VIMS SMS] Rate limit exceeded for {phone}")
            return {
                "success": False,
                "provider": provider,
                "message": f"Rate limit exceeded. Max {MAX_SMS_PER_RECIPIENT_PER_HOUR} SMS per hour.",
            }

        last_error = ""
        for attempt in range(1, max_retries + 1):
            try:
                result = await SMSService._dispatch(phone, message, provider)
                if result:
                    SMSService._record_send(phone, "delivered", provider)
                    logger.info(f"[VIMS SMS] Sent via {provider} to {phone} (attempt {attempt})")
                    return {"success": True, "provider": provider, "message": "SMS dispatched successfully."}
                else:
                    last_error = f"Provider {provider} returned failure"
                    logger.warning(f"[VIMS SMS] Attempt {attempt} failed via {provider} to {phone}")
            except Exception as err:
                last_error = str(err)
                logger.error(f"[VIMS SMS] Attempt {attempt} error via {provider}: {err}")

            # Exponential backoff: 0.5s, 1s
            if attempt < max_retries:
                import asyncio
                await asyncio.sleep(0.5 * attempt)

        SMSService._record_send(phone, "failed", provider)
        return {"success": False, "provider": provider, "message": f"SMS delivery failed after {max_retries} attempts: {last_error}"}

    @staticmethod
    async def _dispatch(phone: str, message: str, provider: str) -> bool:
        """Dispatch SMS via specific provider."""

        if provider == "demo":
            logger.info(f"[VIMS SMS DEMO] To: +91{phone} | Message: {message}")
            return True

        if not SMS_API_URL and provider not in ("demo", "msg91"):
            logger.warning(f"[VIMS SMS] Provider '{provider}' selected but SMS_API_URL unset; falling back to demo log.")
            logger.info(f"[VIMS SMS FALLBACK] To: +91{phone} | Message: {message}")
            return True

        try:
            import httpx

            async with httpx.AsyncClient(timeout=8.0) as client:

                if provider == "webhook":
                    resp = await client.post(
                        SMS_API_URL,
                        json={"to": f"+91{phone}", "message": message},
                        headers={"Authorization": f"Bearer {SMS_API_KEY}"} if SMS_API_KEY else {},
                    )
                    return resp.is_success

                elif provider == "fast2sms":
                    resp = await client.post(
                        "https://www.fast2sms.com/dev/bulkV2",
                        data={
                            "authorization": SMS_API_KEY,
                            "route": "q",
                            "message": message,
                            "numbers": phone,
                            "flash": "0",
                        },
                    )
                    return resp.is_success

                elif provider == "twilio":
                    resp = await client.post(
                        SMS_API_URL,
                        data={
                            "To": f"+91{phone}",
                            "Body": message,
                            "From": SMS_SENDER_ID,
                        },
                        auth=("api", SMS_API_KEY),
                    )
                    return resp.is_success

                elif provider == "msg91":
                    if not MSG91_AUTH_KEY:
                        logger.warning("[VIMS SMS] MSG91 auth key not configured")
                        return False

                    url = "https://control.msg91.com/api/v5/flow/"
                    payload = {
                        "template_id": MSG91_TEMPLATE_ID,
                        "sender": MSG91_SENDER_ID,
                        "short_url": "0",
                        "mobiles": f"91{phone}",
                        "otp": message.split()[-1] if message else "",
                    }
                    headers = {
                        "authkey": MSG91_AUTH_KEY,
                        "Content-Type": "application/json",
                    }
                    resp = await client.post(url, json=payload, headers=headers)
                    return resp.is_success

                else:
                    logger.warning(f"[VIMS SMS] Unknown provider: {provider}")
                    # Fallback to demo
                    logger.info(f"[VIMS SMS UNKNOWN-FALLBACK] To: +91{phone} | Message: {message}")
                    return True

        except ImportError:
            logger.error("[VIMS SMS] httpx not installed. Run: pip install httpx")
            return False
        except Exception as err:
            logger.error(f"[VIMS SMS] Dispatch error: {err}")
            raise

    @staticmethod
    def get_delivery_log(recipient: str) -> list:
        """Get delivery history for a recipient (audit trail)."""
        phone = SMSService._normalize_phone(recipient)
        return _delivery_log.get(phone, [])

    @staticmethod
    def get_rate_remaining(recipient: str) -> int:
        """Get remaining SMS quota for recipient this hour."""
        phone = SMSService._normalize_phone(recipient)
        now = time.time()
        one_hour_ago = now - 3600

        if phone not in _rate_tracker:
            return MAX_SMS_PER_RECIPIENT_PER_HOUR

        recent = [ts for ts in _rate_tracker[phone] if ts > one_hour_ago]
        return max(0, MAX_SMS_PER_RECIPIENT_PER_HOUR - len(recent))
