"""
FlowCommand SIH26127 — Gods Eye View Telemetry, CCTV Pack & ANPR Trajectory API.
================================================================================
Orchestrates WebSocket and REST endpoints for Pune City 3D spatial integration:
- WS  /ws/pune-telemetry: 2 Hz junction Webster state broadcast
- GET /api/cctv/pune-pack: Server-registered intersection CCTV camera pack
- GET /api/anpr/trajectory/{plate_query}: Fuzzy spatio-temporal trajectory GeoJSON
- POST /api/junction/override: Signal phase manual override
- GET  /api/corridor/congestion/{corridor_name}: Corridor-level PCU/congestion report
- POST /api/corridor/green-corridor/activate: Emergency route preemption
- POST /api/corridor/green-corridor/deactivate: Restore normal operation
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import random
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field

from backend.cv_pipeline.anpr_tracker import (
    get_sighting_log,
    load_intersection_registry,
    process_frame_anpr,
    reconstruct_trajectory,
)
from backend.optimizer.signal_controller import (
    compute_congestion_score,
    compute_junction_state,
    compute_pcu_load,
)

logger = logging.getLogger("flowcommand.api")

api_router = APIRouter(tags=["Gods Eye View — Pune Telemetry & Space"])

_DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "pune_intersections.json"

# In-memory registry cache
_REGISTRY_DATA: Optional[Dict[str, Any]] = None

# Active overrides: junction_id -> { phase, expire_timestamp }
_SIGNAL_OVERRIDES: Dict[str, Dict[str, Any]] = {}

# Active Green Corridor: { from_junction, to_junction, route, active, activated_at }
_ACTIVE_GREEN_CORRIDOR: Optional[Dict[str, Any]] = None


def _get_registry() -> Dict[str, Any]:
    global _REGISTRY_DATA
    if _REGISTRY_DATA is None:
        if _DATA_PATH.exists():
            with _DATA_PATH.open("r", encoding="utf-8") as f:
                _REGISTRY_DATA = json.load(f)
        else:
            _REGISTRY_DATA = {"intersections": [], "road_graph": {"edges": []}}
    return _REGISTRY_DATA


class SignalOverrideRequest(BaseModel):
    junction_id: str = Field(..., description="Target junction identifier")
    phase: str = Field(..., description="Signal phase: NS, EW, or PREEMPT_EMERGENCY")
    duration_sec: int = Field(30, ge=15, le=90, description="Override duration in seconds")


class GreenCorridorRequest(BaseModel):
    from_junction: str = Field(..., description="Starting intersection ID")
    to_junction: str = Field(..., description="Destination intersection ID")


# ---------------------------------------------------------------------------
# 1. WS /ws/pune-telemetry (2 Hz junction state broadcast)
# ---------------------------------------------------------------------------

@api_router.websocket("/ws/pune-telemetry")
async def ws_pune_telemetry(websocket: WebSocket) -> None:
    """
    Broadcasts real-time Pune junction state payloads at 2 Hz (every 500 ms).
    Evaluates Webster delay-minimising splits, PCU weighting, and active overrides.
    """
    await websocket.accept()
    logger.info("Client connected to /ws/pune-telemetry from %s", websocket.client)

    try:
        registry = _get_registry()
        intersections = registry.get("intersections", [])

        # Persistent baseline state for smoother simulation
        junction_sim_state: Dict[str, Dict[str, Any]] = {}
        for j in intersections:
            jid = j["id"]
            junction_sim_state[jid] = {
                "base_2w": random.randint(14, 28),
                "base_car": random.randint(8, 18),
                "base_bus": random.randint(1, 3),
                "base_3w": random.randint(3, 8),
                "base_truck": random.randint(0, 2),
                "queue_m": random.uniform(25.0, 65.0),
                "wait_s": random.uniform(15.0, 45.0),
            }

        while True:
            now_utc = datetime.now(timezone.utc)
            now_iso = now_utc.isoformat()
            now_epoch = now_utc.timestamp()

            # Clean expired overrides
            expired_keys = [
                k for k, v in _SIGNAL_OVERRIDES.items() if v.get("expire_timestamp", 0) <= now_epoch
            ]
            for k in expired_keys:
                _SIGNAL_OVERRIDES.pop(k, None)

            junction_payloads: List[Dict[str, Any]] = []

            for item in intersections:
                jid = item["id"]
                name = item.get("name", jid)
                coords = item.get("coordinates_wgs84", [73.8567, 18.5204, 560.0])

                sim = junction_sim_state.get(jid, {})
                # Random drift per tick
                counts = {
                    "2W": max(2, int(sim.get("base_2w", 18) + random.randint(-4, 4))),
                    "Car": max(1, int(sim.get("base_car", 12) + random.randint(-3, 3))),
                    "Bus": max(0, int(sim.get("base_bus", 2) + random.randint(-1, 1))),
                    "3W": max(0, int(sim.get("base_3w", 5) + random.randint(-2, 2))),
                    "Truck": max(0, int(sim.get("base_truck", 1) + random.randint(-1, 1))),
                }

                # Check if this junction is on an active green corridor
                is_corridor_preempted = False
                if _ACTIVE_GREEN_CORRIDOR and _ACTIVE_GREEN_CORRIDOR.get("active"):
                    corridor_route = _ACTIVE_GREEN_CORRIDOR.get("route", [])
                    if jid in corridor_route:
                        is_corridor_preempted = True

                # Check manual override
                active_override = _SIGNAL_OVERRIDES.get(jid)

                queue_m = round(max(5.0, sim.get("queue_m", 30.0) + random.uniform(-4.0, 4.0)), 1)
                wait_s = round(max(5.0, sim.get("wait_s", 25.0) + random.uniform(-3.0, 3.0)), 1)
                sim["queue_m"] = queue_m
                sim["wait_s"] = wait_s

                # Compute junction state using Grok's Webster optimizer
                state = compute_junction_state(
                    junction_id=jid,
                    vehicle_counts=counts,
                    queue_length_m=queue_m,
                    avg_wait_s=wait_s,
                    feed_status="LIVE",
                )

                if is_corridor_preempted:
                    state["active_phase"] = "PREEMPT_EMERGENCY"
                    state["recommended_green_sec"] = 90
                    state["ai_boost_sec"] = 15
                elif active_override:
                    state["active_phase"] = active_override["phase"]
                    state["recommended_green_sec"] = active_override.get("duration_sec", 45)
                    state["ai_boost_sec"] = 0

                # Optional ANPR frame processing hook
                anpr_hits = process_frame_anpr(None, jid, now_iso)

                j_data = {
                    "junction_id": jid,
                    "name": name,
                    "coordinates_wgs84": coords,
                    "congestion_score": state["congestion_score"],
                    "active_phase": state["active_phase"],
                    "recommended_green_sec": state["recommended_green_sec"],
                    "ai_boost_sec": state["ai_boost_sec"],
                    "iot_actuation_ack": state["iot_actuation_ack"],
                    "fallback_mode": state["fallback_mode"],
                    "vehicle_counts": counts,
                    "queue_length_m": queue_m,
                    "avg_wait_s": wait_s,
                }
                if anpr_hits:
                    j_data["anpr_hits"] = anpr_hits

                junction_payloads.append(j_data)

            payload = {
                "timestamp": now_iso,
                "city": "Pune",
                "problem_code": "SIH26127",
                "rate_hz": 2.0,
                "junctions": junction_payloads,
            }

            await websocket.send_text(json.dumps(payload))
            await asyncio.sleep(0.5)

    except WebSocketDisconnect:
        logger.info("Client disconnected from /ws/pune-telemetry")
    except Exception as exc:
        logger.warning("Error in /ws/pune-telemetry: %s", exc)


# ---------------------------------------------------------------------------
# 2. GET /api/cctv/pune-pack (Server-registered CCTV cameras)
# ---------------------------------------------------------------------------

@api_router.get("/api/cctv/pune-pack")
async def get_cctv_pune_pack() -> Dict[str, Any]:
    """
    Returns server-registered CCTV cameras from the Pune smart intersection registry.
    Strictly server-registered metadata with calibrated poses and 3D WGS84 positions.
    """
    registry = _get_registry()
    cameras: List[Dict[str, Any]] = []

    for item in registry.get("intersections", []):
        jid = item["id"]
        jname = item.get("name", jid)
        jcoords = item.get("coordinates_wgs84", [73.8567, 18.5204, 560.0])

        for cam in item.get("cameras", []):
            pose = dict(cam.get("pose", {}))
            cam_coords = list(jcoords)
            # Apply height offset from pose
            if len(cam_coords) > 2 and "height_m" in pose:
                cam_coords[2] = round(float(cam_coords[2]) + float(pose["height_m"]), 2)

            cameras.append({
                "id": cam["id"],
                "junction_id": jid,
                "junction_name": jname,
                "approach": cam.get("approach", "ALL"),
                "pose": pose,
                "role": cam.get("role", "ANPR"),
                "coordinates_wgs84": cam_coords,
                "feed_url": f"/api/cctv/stream/{cam['id']}",
                "status": "ONLINE",
            })

    return {
        "status": "OK",
        "city": "Pune",
        "total_cameras": len(cameras),
        "cameras": cameras,
    }


# ---------------------------------------------------------------------------
# 3. GET /api/anpr/trajectory/{plate_query}
# ---------------------------------------------------------------------------

@api_router.get("/api/anpr/trajectory/{plate_query}")
async def get_anpr_trajectory(plate_query: str) -> Dict[str, Any]:
    """
    Reconstructs fuzzy spatio-temporal vehicle trajectory across Pune smart intersections.
    Returns GeoJSON FeatureCollection with confirmed sightings and interpolated road segments.
    """
    clean_query = plate_query.strip().upper()
    if not clean_query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Plate query must not be empty.",
        )

    try:
        fc = reconstruct_trajectory(clean_query)
        # If no sightings exist in real-time memory yet, seed mock trajectory for Pune demo
        if not fc.get("features"):
            _seed_demo_trajectory(clean_query)
            fc = reconstruct_trajectory(clean_query)
        return fc
    except Exception as exc:
        logger.error("Failed to reconstruct trajectory for %s: %s", clean_query, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Trajectory reconstruction failed: {str(exc)}",
        )


def _seed_demo_trajectory(plate: str) -> None:
    """Seeds historical sightings for demonstration if no live sightings exist."""
    from backend.cv_pipeline.anpr_tracker import record_sighting

    sightings = [
        ("hinjewadi_shivaji_chowk", "2026-10-14T17:00:00Z", 36.0, [420, 310, 612, 368], "Car"),
        ("university_chowk", "2026-10-14T17:18:00Z", 42.0, [380, 290, 590, 350], "Car"),
        ("sancheti_chowk", "2026-10-14T17:25:00Z", 28.0, [410, 305, 605, 362], "Car"),
        ("deccan_gymkhana", "2026-10-14T17:32:00Z", 24.0, [400, 300, 600, 360], "Car"),
    ]
    for jid, ts, spd, bbox, vcls in sightings:
        record_sighting(
            plate_raw=plate,
            plate_matched=plate,
            junction_id=jid,
            timestamp=ts,
            ocr_confidence=0.94,
            vehicle_class=vcls,
            speed_kmh=spd,
            bbox=bbox,
            edit_distance=0,
        )


# ---------------------------------------------------------------------------
# 4. Voice Tool API Endpoints (Signal Override, Green Corridor, Reports)
# ---------------------------------------------------------------------------

@api_router.post("/api/junction/override")
async def override_junction_signal(req: SignalOverrideRequest) -> Dict[str, Any]:
    """Manually overrides a junction traffic signal phase for a set duration."""
    now_epoch = datetime.now(timezone.utc).timestamp()
    expire_epoch = now_epoch + req.duration_sec

    _SIGNAL_OVERRIDES[req.junction_id] = {
        "phase": req.phase,
        "duration_sec": req.duration_sec,
        "expire_timestamp": expire_epoch,
        "set_at": now_epoch,
    }
    logger.info("Signal override set: %s -> %s for %ds", req.junction_id, req.phase, req.duration_sec)

    return {
        "status": "OVERRIDE_ACTIVE",
        "junction_id": req.junction_id,
        "phase": req.phase,
        "duration_sec": req.duration_sec,
        "expires_in_sec": req.duration_sec,
    }


@api_router.post("/api/corridor/green-corridor/activate")
async def activate_green_corridor(req: GreenCorridorRequest) -> Dict[str, Any]:
    """Activates an emergency green corridor between two Pune intersections."""
    global _ACTIVE_GREEN_CORRIDOR
    from backend.cv_pipeline.anpr_tracker import shortest_path

    route = shortest_path(req.from_junction, req.to_junction)
    if not route:
        route = [req.from_junction, req.to_junction]

    _ACTIVE_GREEN_CORRIDOR = {
        "from_junction": req.from_junction,
        "to_junction": req.to_junction,
        "route": route,
        "active": True,
        "activated_at": datetime.now(timezone.utc).isoformat(),
    }
    logger.info("Green corridor activated: %s -> %s via %s", req.from_junction, req.to_junction, route)

    return {
        "status": "GREEN_CORRIDOR_ACTIVE",
        "from_junction": req.from_junction,
        "to_junction": req.to_junction,
        "route": route,
        "preempted_junctions": route,
    }


@api_router.post("/api/corridor/green-corridor/deactivate")
async def deactivate_green_corridor() -> Dict[str, Any]:
    """Deactivates any active emergency green corridor."""
    global _ACTIVE_GREEN_CORRIDOR
    prev = _ACTIVE_GREEN_CORRIDOR
    _ACTIVE_GREEN_CORRIDOR = None
    logger.info("Green corridor deactivated")

    return {
        "status": "DEACTIVATED",
        "previous_corridor": prev,
    }


@api_router.get("/api/corridor/congestion/{corridor_name}")
async def get_corridor_congestion_report(corridor_name: str) -> Dict[str, Any]:
    """Generates a congestion summary report for a named Pune corridor."""
    name_clean = corridor_name.strip().lower()
    registry = _get_registry()

    # Map corridor name to junctions
    corridor_map = {
        "fc road": ["university_chowk", "sancheti_chowk", "deccan_gymkhana"],
        "fergusson college road": ["university_chowk", "sancheti_chowk", "deccan_gymkhana"],
        "karve road": ["chandni_chowk", "nal_stop_chowk", "deccan_gymkhana"],
        "satara road": ["swargate_jedhe_chowk", "katraj_naka"],
        "ganeshkhind": ["hinjewadi_shivaji_chowk", "university_chowk", "sancheti_chowk"],
        "hinjewadi": ["hinjewadi_shivaji_chowk", "chandni_chowk"],
    }

    junction_ids = corridor_map.get(name_clean)
    if not junction_ids:
        # Fallback: search junction road names
        matched = []
        for j in registry.get("intersections", []):
            roads = [r.lower() for r in j.get("roads", [])]
            if any(name_clean in r for r in roads):
                matched.append(j["id"])
        junction_ids = matched or ["university_chowk", "sancheti_chowk", "deccan_gymkhana"]

    junction_reports = []
    total_pcu = 0.0
    scores = []

    for jid in junction_ids:
        # Sample realistic PCU
        counts = {"2W": random.randint(15, 30), "Car": random.randint(10, 20), "Bus": 2}
        pcu, _ = compute_pcu_load(counts)
        score = compute_congestion_score(pcu, queue_length_m=45.0, avg_wait_s=30.0)
        total_pcu += pcu
        scores.append(score)
        junction_reports.append({
            "junction_id": jid,
            "pcu_load": pcu,
            "congestion_score": score,
            "status": "CONGESTED" if score > 0.6 else "MODERATE" if score > 0.35 else "CLEAR",
        })

    avg_score = round(sum(scores) / max(len(scores), 1), 3)

    return {
        "corridor": corridor_name,
        "average_congestion_score": avg_score,
        "overall_status": "HEAVY CONGESTION" if avg_score > 0.6 else "MODERATE FLOW" if avg_score > 0.35 else "CLEAR FLOW",
        "total_pcu_load": round(total_pcu, 1),
        "monitored_junctions": junction_reports,
    }
