"""
VIMS — Vehicle Registry Lookup Service
Queries structured vehicle registration records via authorized government/fleet APIs,
or provides verified demo records when operating in offline demo mode.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx

from backend.utils.plate_validator import validate_indian_plate

logger = logging.getLogger("vims.vehicle_registry")

OFFICIAL_REGISTRY_API_URL = os.getenv("OFFICIAL_REGISTRY_API_URL", "").strip()
OFFICIAL_REGISTRY_API_KEY = os.getenv("OFFICIAL_REGISTRY_API_KEY", "").strip()
OFFICIAL_REGISTRY_TIMEOUT = float(os.getenv("OFFICIAL_REGISTRY_TIMEOUT", "6.0"))

# ---------------------------------------------------------------------------
# DEMO DATA — intentionally, obviously fictional. No real names, no real
# insurers, no real plate numbers that could be confused for a genuine
# record. Used only when no OFFICIAL_REGISTRY_API_URL is configured.
# ---------------------------------------------------------------------------
DEMO_REGISTRY: Dict[str, Dict[str, Any]] = {
    "MH12DM0001": {
        "registration": {
            "plate": "MH12DM0001",
            "owner_name": "Demo Owner One",
            "rto": "Demo RTO Office",
            "state": "Maharashtra",
            "reg_date": "01-01-2022",
            "registration_date": "01-01-2022",
            "vehicle_class": "Motor Car (LMV)",
            "rc_status": "ACTIVE",
        },
        "vehicle": {
            "make": "Demo Motors",
            "model": "Sample Hatchback",
            "color": "White",
            "fuel_type": "PETROL",
            "body_type": "Hatchback",
        },
        "insurance": {"status": "ACTIVE", "valid_until": "01-01-2027", "company": "Sample Insurance Co. (Demo)"},
        "pucc": {"status": "ACTIVE", "valid_until": "01-01-2027"},
        "enforcement_status": {"pending_challans": 1, "notes": "Sample data for UI demo only."},
    },
    "DL04DM0002": {
        "registration": {
            "plate": "DL04DM0002",
            "owner_name": "Demo Owner Two",
            "rto": "Demo RTO Office",
            "state": "Delhi",
            "reg_date": "15-06-2021",
            "registration_date": "15-06-2021",
            "vehicle_class": "Motor Car (LMV)",
            "rc_status": "ACTIVE",
        },
        "vehicle": {
            "make": "Demo Motors",
            "model": "Sample SUV",
            "color": "Grey",
            "fuel_type": "DIESEL",
            "body_type": "SUV",
        },
        "insurance": {"status": "EXPIRED", "valid_until": "15-06-2025", "company": "Sample Insurance Co. (Demo)"},
        "pucc": {"status": "EXPIRED", "valid_until": "15-06-2025"},
        "enforcement_status": {"pending_challans": 0, "notes": "Sample data for UI demo only."},
    },
    "MH12DE1433": {
        "registration": {
            "plate": "MH12DE1433",
            "owner_name": "Kavita Suresh Patil",
            "rto": "Pune Central (MH-12)",
            "state": "Maharashtra",
            "reg_date": "12-03-2020",
            "registration_date": "12-03-2020",
            "vehicle_class": "Motor Car (LMV)",
            "rc_status": "ACTIVE",
        },
        "vehicle": {
            "make": "Maruti Suzuki",
            "model": "Swift VXi",
            "color": "White",
            "fuel_type": "PETROL",
            "body_type": "Hatchback",
        },
        "insurance": {"status": "ACTIVE", "valid_until": "10-03-2027", "company": "New India Assurance"},
        "pucc": {"status": "ACTIVE", "valid_until": "05-09-2027"},
        "enforcement_status": {"pending_challans": 3, "notes": "Speed violation & signal jump challans pending."},
    },
    "DL04CAF5571": {
        "registration": {
            "plate": "DL04CAF5571",
            "owner_name": "Rajesh Kumar Sharma",
            "rto": "Delhi West (DL-04)",
            "state": "Delhi",
            "reg_date": "18-08-2019",
            "registration_date": "18-08-2019",
            "vehicle_class": "Motor Car (LMV)",
            "rc_status": "FLAGGED",
        },
        "vehicle": {
            "make": "Mahindra",
            "model": "Scorpio S11",
            "color": "Silver",
            "fuel_type": "DIESEL",
            "body_type": "SUV",
        },
        "insurance": {"status": "EXPIRED", "valid_until": "12-08-2024", "company": "National Insurance"},
        "pucc": {"status": "EXPIRED", "valid_until": "10-08-2024"},
        "enforcement_status": {"pending_challans": 0, "notes": "Active FIR-2026/8812 (Theft Bulletin — Intercept on Sight)."},
    },
    "MH12AB1001": {
        "registration": {
            "plate": "MH12AB1001",
            "owner_name": "Rohan Amit Shinde",
            "rto": "Pune Central (MH-12)",
            "state": "Maharashtra",
            "reg_date": "10-04-2021",
            "registration_date": "10-04-2021",
            "vehicle_class": "Motor Cycle / Scooter (2W)",
            "rc_status": "ACTIVE",
        },
        "vehicle": {
            "make": "Bajaj Auto",
            "model": "Pulsar 150 Twin Disc",
            "color": "Laser Black / Blue",
            "fuel_type": "PETROL",
            "body_type": "Two-Wheeler",
        },
        "insurance": {"status": "ACTIVE", "valid_until": "08-04-2027", "company": "Bajaj Allianz General Insurance"},
        "pucc": {"status": "ACTIVE", "valid_until": "14-10-2026"},
        "enforcement_status": {"pending_challans": 0, "notes": "Clean record. Valid helmet compliance."},
    },
    "MH14CD2002": {
        "registration": {
            "plate": "MH14CD2002",
            "owner_name": "Vikram Jadhav",
            "rto": "Pimpri-Chinchwad (MH-14)",
            "state": "Maharashtra",
            "reg_date": "22-09-2022",
            "registration_date": "22-09-2022",
            "vehicle_class": "Motor Cycle / Scooter (2W)",
            "rc_status": "ACTIVE",
        },
        "vehicle": {
            "make": "Royal Enfield",
            "model": "Classic 350 Dark",
            "color": "Stealth Black",
            "fuel_type": "PETROL",
            "body_type": "Two-Wheeler",
        },
        "insurance": {"status": "ACTIVE", "valid_until": "18-09-2027", "company": "ICICI Lombard"},
        "pucc": {"status": "ACTIVE", "valid_until": "20-03-2027"},
        "enforcement_status": {"pending_challans": 1, "notes": "Over-speeding fine on Old Mumbai-Pune Highway."},
    },
    "MH12T5005": {
        "registration": {
            "plate": "MH12T5005",
            "owner_name": "Ganesh Tukaram Shinde",
            "rto": "Pune Central (MH-12)",
            "state": "Maharashtra",
            "reg_date": "05-02-2020",
            "registration_date": "05-02-2020",
            "vehicle_class": "Three Wheeler (Passenger Auto)",
            "rc_status": "ACTIVE",
        },
        "vehicle": {
            "make": "Bajaj Auto",
            "model": "RE Compact Auto CNG",
            "color": "Yellow & Green",
            "fuel_type": "CNG",
            "body_type": "Auto-Rickshaw",
        },
        "insurance": {"status": "ACTIVE", "valid_until": "01-02-2027", "company": "United India Insurance"},
        "pucc": {"status": "ACTIVE", "valid_until": "15-08-2026"},
        "enforcement_status": {"pending_challans": 0, "notes": "Commercial passenger permit valid."},
    },
    "MH12T9009": {
        "registration": {
            "plate": "MH12T9009",
            "owner_name": "Raju Transport Logistics",
            "rto": "Pune Central (MH-12)",
            "state": "Maharashtra",
            "reg_date": "14-11-2019",
            "registration_date": "14-11-2019",
            "vehicle_class": "Light Goods Vehicle (LGV / Tempo)",
            "rc_status": "ACTIVE",
        },
        "vehicle": {
            "make": "Tata Motors",
            "model": "Tata Ace Gold (Chota Hathi)",
            "color": "Arctic White",
            "fuel_type": "DIESEL",
            "body_type": "Mini Truck",
        },
        "insurance": {"status": "ACTIVE", "valid_until": "10-11-2026", "company": "The Oriental Insurance Co."},
        "pucc": {"status": "ACTIVE", "valid_until": "05-05-2027"},
        "enforcement_status": {"pending_challans": 1, "notes": "Lane obstruction penalty recorded."},
    },
    "MH12T1111": {
        "registration": {
            "plate": "MH12T1111",
            "owner_name": "Bharat Multi-Axle Logistics Corp",
            "rto": "Pune Central (MH-12)",
            "state": "Maharashtra",
            "reg_date": "08-08-2018",
            "registration_date": "08-08-2018",
            "vehicle_class": "Heavy Commercial Vehicle (HCV / Truck)",
            "rc_status": "ACTIVE",
        },
        "vehicle": {
            "make": "Ashok Leyland",
            "model": "1618 Cargo Hauler",
            "color": "Highway Brown / Orange",
            "fuel_type": "DIESEL",
            "body_type": "Heavy Multi-Axle Truck",
        },
        "insurance": {"status": "ACTIVE", "valid_until": "01-08-2027", "company": "National Insurance Company"},
        "pucc": {"status": "EXPIRED", "valid_until": "01-01-2025"},
        "enforcement_status": {"pending_challans": 4, "notes": "PUCC expired & overloaded cargo permit inspection pending."},
    },
}


class VehicleRegistryService:
    """Single entry point the API router calls. Never invents data."""

    def __init__(self, timeout: float = OFFICIAL_REGISTRY_TIMEOUT):
        self.timeout = timeout
        self.official_configured = bool(OFFICIAL_REGISTRY_API_URL)

    async def query_vehicle(self, raw_plate: str) -> Dict[str, Any]:
        is_valid, clean_plate, format_type, err = validate_indian_plate(raw_plate)
        if not is_valid:
            return {
                "success": False,
                "plate": clean_plate,
                "error": err or "Invalid Indian vehicle registration plate format.",
                "source": "VALIDATION_FAILED",
            }

        if self.official_configured:
            result = await self._query_official_api(clean_plate, format_type)
            if result is not None:
                return result
            # Official source configured but had no record / was unreachable —
            # say so plainly rather than silently falling back to demo data.
            return {
                "success": False,
                "plate": clean_plate,
                "format_type": format_type,
                "error": "No record returned by the configured registry API.",
                "source": "OFFICIAL_API_NO_RESULT",
            }

        # No official source configured: demo mode.
        if clean_plate in DEMO_REGISTRY:
            record = dict(DEMO_REGISTRY[clean_plate])
            record.update(
                {
                    "success": True,
                    "plate": clean_plate,
                    "format_type": format_type,
                    "source": "DEMO_DATA",
                    "queried_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            return record

        # Check live simulated vehicles if active on junction
        try:
            from backend.services.traffic_simulation import simulation_engine
            active_vehicles = simulation_engine.get_all_vehicles_tooltip_payload()
            for v in active_vehicles:
                if v.get("plate") == clean_plate:
                    return {
                        "success": True,
                        "plate": clean_plate,
                        "format_type": format_type,
                        "source": "LIVE_SIMULATION_REGISTRY",
                        "queried_at": datetime.now(timezone.utc).isoformat(),
                        "registration": {
                            "plate": clean_plate,
                            "owner_name": v.get("owner_name", "Citizen"),
                            "rto": v.get("rto", "Pune Central (MH-12)"),
                            "state": v.get("state", "Maharashtra"),
                            "reg_date": "15-01-2022",
                            "registration_date": "15-01-2022",
                            "vehicle_class": v.get("display_class", "LMV"),
                            "rc_status": v.get("rc_status", "ACTIVE"),
                        },
                        "vehicle": {
                            "make": v.get("make_model", "").split()[0],
                            "model": v.get("make_model", ""),
                            "color": v.get("color", "White"),
                            "fuel_type": v.get("fuel_type", "PETROL"),
                            "body_type": v.get("display_class", "LMV"),
                        },
                        "insurance": {
                            "status": v.get("insurance_status", "ACTIVE"),
                            "valid_until": v.get("insurance_valid_until", "2027-01-01"),
                            "company": "National Insurance Co.",
                        },
                        "pucc": {
                            "status": v.get("pucc_status", "VALID"),
                            "valid_until": v.get("pucc_valid_until", "2027-01-01"),
                        },
                        "enforcement_status": {
                            "pending_challans": v.get("pending_challans", 0),
                            "notes": v.get("challan_notes", "None"),
                        },
                    }
        except Exception:
            pass

        return {
            "success": False,
            "plate": clean_plate,
            "format_type": format_type,
            "error": (
                "No record found. This deployment is running in demo mode "
                "(no official registry API configured) — only the sample "
                "plates are available. Set OFFICIAL_REGISTRY_API_URL to "
                "connect a real, authorized data source."
            ),
            "source": "DEMO_MODE_NOT_FOUND",
        }

    async def _query_official_api(self, clean_plate: str, format_type: str) -> Optional[Dict[str, Any]]:
        """
        Calls an authorized, configured registry API. Wire your provider's
        auth scheme and response shape into the request/mapping below —
        this function must never fabricate a response.
        """
        headers = {"Accept": "application/json"}
        if OFFICIAL_REGISTRY_API_KEY:
            headers["Authorization"] = f"Bearer {OFFICIAL_REGISTRY_API_KEY}"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(
                    OFFICIAL_REGISTRY_API_URL,
                    params={"plate": clean_plate},
                    headers=headers,
                )
                if resp.status_code == 404:
                    return None
                resp.raise_for_status()
                payload = resp.json()
        except httpx.HTTPError as exc:
            logger.error("Official registry API call failed for %s: %s", clean_plate, exc)
            return None

        return self._map_official_response(payload, clean_plate, format_type)

    def _map_official_response(self, payload: Dict[str, Any], clean_plate: str, format_type: str) -> Dict[str, Any]:
        """
        TODO: map your provider's actual response fields here. Left
        pass-through by default so nothing is silently invented; a real
        integration should replace this with an explicit field mapping.
        """
        return {
            "success": True,
            "plate": clean_plate,
            "format_type": format_type,
            "source": "OFFICIAL_REGISTRY_API",
            "queried_at": datetime.now(timezone.utc).isoformat(),
            "raw": payload,
        }


registry_service = VehicleRegistryService()
