"""
VIMS — Adaptive Junction Telemetry Router
==========================================
Exposes /ws/junction-telemetry: a 1 Hz WebSocket broadcast of the live
AdaptiveJunctionController state (active corridor, light state, elapsed
time in state, and per-corridor PCU load).

A background asyncio task simulates a YOLO-based vehicle detector feeding
fluctuating per-class vehicle counts into the controller, so the endpoint
is fully exercisable without a real camera/inference pipeline attached.
"""

from __future__ import annotations

import asyncio
import json
import os
import random
import time
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Response, UploadFile, File, HTTPException, status
from fastapi.responses import StreamingResponse

from backend.traffic_engine import (
    AdaptiveJunctionController,
    Corridor,
    VehicleCounts,
)
from backend.services.traffic_modulation import build_modulation_view
from backend.services.video_ingest import analyze_video_file, save_upload_capped, MAX_UPLOAD_BYTES
from backend.services.traffic_simulation import simulation_engine

router = APIRouter(tags=["Adaptive Junction Control"])

# ── Shared controller instance (single junction)
controller = AdaptiveJunctionController(initial_active=Corridor.NS)
controller.set_simulation_engine(simulation_engine)

# ── Camera Feed Input & Regulation State
_feed_state = {
    "source_type": "pre_downloaded",  # "pre_downloaded", "local_file", "mjpeg", "webcam"
    "source_name": "Pune JM Road Chowk (Pre-Downloaded Edge Footage)",
    "stream_url": "/api/junction/video-feed",
    "regulation_mode": "ADAPTIVE",  # "ADAPTIVE", "MANUAL_NS", "MANUAL_EW", "ALL_RED"
    "last_external_update": 0.0,
    "status": "OPERATIONAL",
}

# ── Connection registry for the telemetry broadcast
_active_connections: List[WebSocket] = []
_broadcast_lock = asyncio.Lock()

# Separate registry for the new Traffic Modulation 2D view WebSocket, kept
# independent from `_active_connections` above so the existing telemetry
# payload/consumers are completely untouched.
_modulation_connections: List[WebSocket] = []
_modulation_broadcast_lock = asyncio.Lock()
_modulation_broadcast_task: "asyncio.Task | None" = None

# Background task handles, tracked so they are started exactly once and can
# be cancelled cleanly on shutdown.
_simulator_task: asyncio.Task | None = None
_broadcast_task: asyncio.Task | None = None

# Simulated YOLO detector feed

async def _simulate_yolo_detection_feed() -> None:
    """
    Background task synchronizing the dynamic Indian vehicle simulation with
    the adaptive junction controller. Runs indefinitely at ~1 Hz until cancelled.
    """
    baseline = {
        Corridor.NS: {"motorcycle": 8, "auto": 3, "car": 10, "lcv": 2, "bus_truck": 1},
        Corridor.EW: {"motorcycle": 5, "auto": 2, "car": 6, "lcv": 1, "bus_truck": 0},
    }

    try:
        while True:
            if controller._simulation_engine is not None:
                # Fluctuate target vehicle arrival rate to simulate peak/non-peak surges
                controller._simulation_engine.target_count = random.randint(10, 16)
            else:
                for corridor, classes in baseline.items():
                    for cls_name in classes:
                        delta = random.randint(-2, 3)
                        classes[cls_name] = max(0, min(40, classes[cls_name] + delta))

                    counts = VehicleCounts(
                        motorcycle=classes["motorcycle"],
                        auto=classes["auto"],
                        car=classes["car"],
                        lcv=classes["lcv"],
                        bus_truck=classes["bus_truck"],
                    )
                    controller.update_detection(corridor, counts)

            await asyncio.sleep(1.0)
    except asyncio.CancelledError:
        # Clean shutdown — no cleanup required beyond letting the task end.
        raise

# 1 Hz broadcast loop

async def _broadcast_loop() -> None:
    """
    Advances the controller state machine and pushes the resulting snapshot
    to every connected WebSocket client, once per second.
    """
    try:
        while True:
            snapshot = controller.tick()
            payload = snapshot.to_payload()
            message = json.dumps(payload)

            async with _broadcast_lock:
                stale: List[WebSocket] = []
                for ws in _active_connections:
                    try:
                        await ws.send_text(message)
                    except Exception:
                        stale.append(ws)
                for ws in stale:
                    if ws in _active_connections:
                        _active_connections.remove(ws)

            await asyncio.sleep(1.0)
    except asyncio.CancelledError:
        raise

def _ensure_background_tasks_running() -> None:
    """Lazily start the simulator and broadcast loops on first connection."""
    global _simulator_task, _broadcast_task
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.get_event_loop()

    if _simulator_task is None or _simulator_task.done():
        _simulator_task = loop.create_task(_simulate_yolo_detection_feed())

    if _broadcast_task is None or _broadcast_task.done():
        _broadcast_task = loop.create_task(_broadcast_loop())

# WebSocket endpoint

@router.websocket("/ws/junction-telemetry")
async def junction_telemetry_endpoint(websocket: WebSocket):
    """
    Real-time push stream of the adaptive junction controller's state at 1 Hz.

    Payload shape (see JunctionSnapshot.to_payload):
        {
            "active_corridor": "NS" | "EW",
            "light_state": "GREEN" | "AMBER" | "ALL_RED",
            "elapsed_in_state_sec": float,
            "min_green_remaining_sec": float,
            "pcu": {"NS": float, "EW": float},
            "vehicle_counts": {"NS": {...}, "EW": {...}},
            "vehicle_totals": {"NS": int, "EW": int},
            "cycle_count": int,
            "server_epoch": float,
            "constraints": {"min_green_sec", "max_green_sec", "amber_sec", "all_red_sec"}
        }
    """
    await websocket.accept()

    async with _broadcast_lock:
        _active_connections.append(websocket)

    _ensure_background_tasks_running()

    try:
        # Send an immediate snapshot on connect so the client doesn't wait
        # up to a full second for the first frame.
        await websocket.send_text(json.dumps(controller.tick().to_payload()))

        # Keep the connection open; the broadcast loop pushes frames.
        # We still listen for client pings/messages to detect disconnects
        # promptly rather than relying solely on failed sends.
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        async with _broadcast_lock:
            if websocket in _active_connections:
                _active_connections.remove(websocket)

# Convenience REST endpoint (non-WebSocket clients / debugging)

@router.get("/api/junction/state")
async def get_junction_state():
    """One-shot snapshot of the junction controller state over plain HTTP."""
    snapshot = controller.tick()
    return snapshot.to_payload()

@router.get("/api/junction/minimap")
@router.get("/api/junction/lanes")
async def get_junction_minimap():
    """
    Dedicated telemetry endpoint for the Single Junction Minimap with 2 perpendicular lanes.
    Returns junction geometry, lane definitions, real-time signal colors, queues, vehicle counts,
    and individual vehicle entities with hover tooltip details and coordinates.
    """
    snapshot = controller.tick()
    payload = snapshot.to_payload()
    return {
        "status": "ONLINE",
        "junction": payload.get("junction"),
        "lanes": payload.get("lanes"),
        "active_corridor": payload.get("active_corridor"),
        "light_state": payload.get("light_state"),
        "sub_phase": payload.get("sub_phase"),
        "arrow_l": payload.get("arrow_l"),
        "arrow_r": payload.get("arrow_r"),
        "time_in_phase_sec": payload.get("time_in_phase_sec"),
        "min_green_remaining_sec": payload.get("min_green_remaining_sec"),
        "total_pcu": payload.get("total_pcu"),
        "total_vehicle_count": payload.get("total_vehicle_count"),
        "cycle_count": payload.get("cycle_count"),
        "server_epoch": payload.get("server_epoch"),
        "regulation_mode": _feed_state.get("regulation_mode", "ADAPTIVE"),
        "vehicles": payload.get("vehicles", []),
        "active_vehicles": payload.get("vehicles", []),
        "overtaking_vehicles_count": payload.get("overtaking_vehicles_count", 0),
        "lane_sharing_vehicles_count": payload.get("lane_sharing_vehicles_count", 0),
        "turning_vehicles_count": payload.get("turning_vehicles_count", 0),
        "blinker_active_count": payload.get("blinker_active_count", 0),
        "turn_left_count": sum(1 for v in payload.get("vehicles", []) if str(v.get("turn_blinker")).lower() == "left" or str(v.get("turn_intent")).lower() in ("turn_left", "left")),
        "turn_right_count": sum(1 for v in payload.get("vehicles", []) if str(v.get("turn_blinker")).lower() == "right" or str(v.get("turn_intent")).lower() in ("turn_right", "right", "u_turn", "uturn")),
        "straight_count": sum(1 for v in payload.get("vehicles", []) if (v.get("turn_blinker") is None or v.get("turn_blinker") == "NONE") and str(v.get("turn_intent")).lower() in ("straight", "none")),
        "capacity_per_lane": 2,
    }

@router.get("/api/junction/vehicles")
async def get_junction_vehicles(
    corridor: Optional[str] = None,
    lane_id: Optional[str] = None,
    is_overtaking: Optional[bool] = None,
    turn_intent: Optional[str] = None,
    turn_blinker: Optional[str] = None,
    blinker: Optional[str] = None,
    is_turning: Optional[bool] = None,
):
    """
    Returns active simulated vehicles with rich Indian road details,
    dynamic overtaking status, U-turns, inter-corridor turns, blinker indicator states,
    2-vehicles-per-lane occupancy, and minimap hover tooltip data.
    """
    snapshot = controller.tick()
    vehicles = snapshot.vehicles
    if corridor:
        c_upper = corridor.strip().upper()
        vehicles = [v for v in vehicles if v.get("corridor") == c_upper]
    if lane_id:
        vehicles = [v for v in vehicles if v.get("lane_id") == lane_id]
    if is_overtaking is not None:
        vehicles = [v for v in vehicles if v.get("is_overtaking") == is_overtaking]
    if turn_intent:
        t_lower = turn_intent.strip().lower()
        vehicles = [v for v in vehicles if str(v.get("turn_intent", "")).lower() == t_lower]
    if turn_blinker:
        tb_lower = turn_blinker.strip().lower()
        vehicles = [v for v in vehicles if str(v.get("turn_blinker", "")).lower() == tb_lower]
    if blinker:
        b_upper = blinker.strip().upper()
        vehicles = [v for v in vehicles if str(v.get("blinker", "")).upper() == b_upper]
    if is_turning is not None:
        vehicles = [v for v in vehicles if v.get("is_turning") == is_turning]

    return {
        "total_vehicles": len(vehicles),
        "overtaking_count": sum(1 for v in vehicles if v.get("is_overtaking")),
        "lane_sharing_count": sum(1 for v in vehicles if v.get("lane_sharing")),
        "turning_count": sum(1 for v in vehicles if v.get("is_turning")),
        "blinker_active_count": sum(1 for v in vehicles if v.get("blinker") in ("LEFT", "RIGHT")),
        "turn_left_count": sum(1 for v in vehicles if str(v.get("turn_blinker")).lower() == "left" or str(v.get("turn_intent")).lower() in ("turn_left", "left")),
        "turn_right_count": sum(1 for v in vehicles if str(v.get("turn_blinker")).lower() == "right" or str(v.get("turn_intent")).lower() in ("turn_right", "right", "u_turn", "uturn")),
        "straight_count": sum(1 for v in vehicles if (v.get("turn_blinker") is None or v.get("turn_blinker") == "NONE") and str(v.get("turn_intent")).lower() in ("straight", "none")),
        "capacity_per_lane": 2,
        "vehicles": vehicles,
    }

@router.get("/api/junction/vehicle/{vehicle_identifier}")
async def get_vehicle_tooltip_detail(vehicle_identifier: str):
    """
    Fetch rich hover tooltip metadata for a specific vehicle by ID (e.g. VEH-NS-1042)
    or Indian registration plate (e.g. MH12DE1433).
    """
    snapshot = controller.tick()
    clean_id = vehicle_identifier.strip().upper()
    found = None
    for v in snapshot.vehicles:
        if v.get("id", "").upper() == clean_id or v.get("plate", "").upper() == clean_id:
            found = v
            break

    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle '{vehicle_identifier}' not currently active on junction corridors.",
        )

    return {
        "status": "ACTIVE",
        "vehicle": found,
        "tooltip": found.get("tooltip_lines", []),
    }

@router.get("/api/junction/constraints")
async def get_junction_constraints():
    """Static safety constraint values enforced by the controller."""
    return {
        "min_green_sec": controller.min_green,
        "max_green_sec": controller.max_green,
        "amber_sec": controller.amber_time,
        "all_red_sec": controller.all_red_time,
        "turn_arrow_sec": controller.turn_arrow_time,
        "turn_amber_sec": controller.turn_amber_time,
        "pcu_weights": {
            "motorcycle": 0.5,
            "auto": 0.8,
            "car": 1.0,
            "lcv": 1.5,
            "bus_truck": 3.0,
        },
    }

# Camera Feed Input & Traffic Regulation Endpoints

class FeedInputPayload(BaseModel):
    source_type: str = Field("pre_downloaded", description="Feed type: pre_downloaded, local_file, mjpeg_stream, webcam")
    source_name: str = Field("Pune JM Road Chowk (Pre-Downloaded)", description="Display label or file name")
    stream_url: Optional[str] = Field(None, description="Stream URI if remote stream")
    corridor: Optional[str] = Field("ALL", description="Target corridor or ALL")

class RegulationOverridePayload(BaseModel):
    action: Optional[str] = Field(None, description="Action: FORCE_NS, FORCE_EW, ALL_RED, RESUME_AUTO")
    command: Optional[str] = Field(None, description="Alternative alias for action from frontend clients")
    reason: Optional[str] = Field("Manual Operator Command", description="Reason for override")

class VehicleCountPayload(BaseModel):
    corridor: str = Field(..., description="Corridor: NS or EW")
    motorcycle: int = 0
    auto: int = 0
    car: int = 0
    lcv: int = 0
    bus_truck: int = 0

@router.get("/api/junction/feed-status")
async def get_feed_status():
    """Return active camera feed configuration and regulation status."""
    return {
        **_feed_state,
        "active_corridor": controller.active_corridor.value,
        "light_state": controller.light_state.value,
        "cycle_count": controller.cycle_count,
    }

@router.post("/api/junction/feed-input")
async def set_feed_input(payload: FeedInputPayload):
    """
    Switch or configure the camera feed input source for traffic regulation.
    Supports pre_downloaded local video, local user upload, remote MJPEG/RTSP stream, and device webcam.
    """
    _feed_state["source_type"] = payload.source_type
    _feed_state["source_name"] = payload.source_name
    if payload.stream_url:
        _feed_state["stream_url"] = payload.stream_url
    _feed_state["last_external_update"] = time.time()

    # Broadcast notification to connected clients
    message = json.dumps({
        "type": "FEED_INPUT_CHANGED",
        "feed": _feed_state,
        "timestamp": time.time(),
    })
    async with _broadcast_lock:
        for ws in _active_connections:
            try:
                await ws.send_text(message)
            except Exception:
                pass

    return {"status": "SUCCESS", "feed": _feed_state}

@router.post("/api/junction/regulation-override")
async def regulation_override(payload: RegulationOverridePayload):
    """
    Manual and emergency traffic regulation override:
    - FORCE_NS: Force North-South Green (Priority / VIP)
    - FORCE_EW: Force East-West Green (Priority / VIP)
    - ALL_RED: Emergency All-Red clearance hold
    - RESUME_AUTO: Return to adaptive ATSC density control
    """
    action = (payload.action or payload.command or "").strip().upper()
    if not action:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Action or command is required.")

    _feed_state["last_external_update"] = time.time()

    if action in ("FORCE_NS", "FORCE_LANE_1", "LANE_1", "STOP_LANE_2", "STOP_EW"):
        controller.force_corridor_green(Corridor.NS)
        _feed_state["regulation_mode"] = "MANUAL_NS"
    elif action in ("FORCE_EW", "FORCE_LANE_2", "LANE_2", "STOP_LANE_1", "STOP_NS"):
        controller.force_corridor_green(Corridor.EW)
        _feed_state["regulation_mode"] = "MANUAL_EW"
    elif action == "ALL_RED":
        controller.force_all_red()
        _feed_state["regulation_mode"] = "ALL_RED"
    elif action == "RESUME_AUTO":
        _feed_state["regulation_mode"] = "ADAPTIVE"
    else:
        return {"status": "ERROR", "success": False, "message": f"Unknown action: {action}"}

    snapshot = controller.tick()
    # Immediate broadcast of new light state
    message = json.dumps(snapshot.to_payload())
    async with _broadcast_lock:
        for ws in _active_connections:
            try:
                await ws.send_text(message)
            except Exception:
                pass

    return {
        "status": "SUCCESS",
        "success": True,
        "message": f"Server accepted {action}.",
        "action": action,
        "regulation_mode": _feed_state["regulation_mode"],
        "snapshot": snapshot.to_payload(),
    }

@router.post("/api/junction/update-counts")
async def update_vehicle_counts(payload: VehicleCountPayload):
    """
    Directly inject vehicle detection counts from video ingestion pipeline into ATSC regulation.
    """
    corridor_key = Corridor.NS if payload.corridor.upper() == "NS" else Corridor.EW
    counts = VehicleCounts(
        motorcycle=payload.motorcycle,
        auto=payload.auto,
        car=payload.car,
        lcv=payload.lcv,
        bus_truck=payload.bus_truck,
    )
    controller.update_detection(corridor_key, counts)
    _feed_state["last_external_update"] = time.time()
    return {
        "status": "SUCCESS",
        "corridor": corridor_key.value,
        "pcu_total": counts.pcu_total(),
    }

# Minimal fallback JPEG frame (1x1 gray pixel)
_FALLBACK_JPEG = bytes.fromhex(
    "ffd8ffe000104a46494600010101004800480000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffda0008010100003f007f00ffd9"
)

@router.get("/api/junction/video-feed")
async def junction_video_feed():
    """
    MJPEG stream endpoint for live junction camera.
    Returns continuous multipart/x-mixed-replace stream.
    """
    async def frame_generator():
        try:
            while True:
                frame_data = _FALLBACK_JPEG
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: " + str(len(frame_data)).encode() + b"\r\n\r\n"
                    + frame_data
                    + b"\r\n"
                )
                await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            pass

    return StreamingResponse(
        frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

# Traffic Modulation — simplified 2D grid + per-arm signal view
# Backend-only addition to support a future "Traffic Modulation" frontend
# tab: a digitalized/simplified 2D lane-occupancy grid and per-arm (N/S/
# E/W) signal colors, derived from the SAME real controller state as the
# existing telemetry endpoints above — see backend/services/
# traffic_modulation.py for how the grid is computed. No existing
# endpoint, payload shape, or frontend file was modified to add this.

async def _modulation_broadcast_loop() -> None:
    """
    Independent 1 Hz broadcast loop for the modulation view. Calls
    `controller.tick()` directly — this is safe to do from multiple
    independent loops because `AdaptiveJunctionController.tick()` is
    elapsed-time-based, not tick-count-based (see its docstring in
    traffic_engine.py: "safe to call at any cadence"), so this loop and
    the existing telemetry loop simply each advance/read the same real
    state machine on their own 1 Hz cadence without conflicting.
    """
    try:
        while True:
            snapshot = controller.tick()
            payload = build_modulation_view(snapshot)
            message = json.dumps(payload)

            async with _modulation_broadcast_lock:
                stale: List[WebSocket] = []
                for ws in _modulation_connections:
                    try:
                        await ws.send_text(message)
                    except Exception:
                        stale.append(ws)
                for ws in stale:
                    if ws in _modulation_connections:
                        _modulation_connections.remove(ws)

            await asyncio.sleep(1.0)
    except asyncio.CancelledError:
        raise

def _ensure_modulation_task_running() -> None:
    global _modulation_broadcast_task
    _ensure_background_tasks_running()  # ensures the shared controller has live data
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.get_event_loop()

    if _modulation_broadcast_task is None or _modulation_broadcast_task.done():
        _modulation_broadcast_task = loop.create_task(_modulation_broadcast_loop())

@router.get("/api/junction/modulation/state")
async def get_modulation_state():
    """
    One-shot fetch of the simplified 2D Traffic Modulation view (lane
    occupancy grid + per-arm signal colors), computed from the real,
    live controller state — same source of truth as /api/junction/state.
    """
    snapshot = controller.tick()
    return build_modulation_view(snapshot)

@router.websocket("/ws/junction-modulation")
async def junction_modulation_endpoint(websocket: WebSocket):
    """
    Real-time 1 Hz push of the Traffic Modulation 2D view. Separate
    channel from /ws/junction-telemetry so existing telemetry consumers
    are unaffected; a future "Traffic Modulation" frontend tab can
    connect here directly.

    Payload shape (see traffic_modulation.build_modulation_view):
        {
            "grid": {
                "cells_per_lane": int,
                "corridors": {
                    "NS": {"northbound_lane": [0|1,...], "southbound_lane": [...],
                           "real_vehicle_total": int, "real_pcu_total": float},
                    "EW": {"eastbound_lane": [...], "westbound_lane": [...],
                           "real_vehicle_total": int, "real_pcu_total": float}
                }
            },
            "signals": {
                "arms": {"N": "GREEN"|"AMBER"|"RED", "S": ..., "E": ..., "W": ...},
                "active_corridor": "NS"|"EW",
                "light_state": "GREEN"|"AMBER"|"ALL_RED",
                "elapsed_in_state_sec": float,
                "min_green_remaining_sec": float
            },
            "cycle_count": int,
            "server_epoch": float,
            "note": str
        }
    """
    await websocket.accept()

    async with _modulation_broadcast_lock:
        _modulation_connections.append(websocket)

    _ensure_modulation_task_running()

    try:
        snapshot = controller.tick()
        await websocket.send_text(json.dumps(build_modulation_view(snapshot)))

        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        async with _modulation_broadcast_lock:
            if websocket in _modulation_connections:
                _modulation_connections.remove(websocket)

# Full Video Ingestion (analyzes uploaded file up to 200MB)
ALLOWED_VIDEO_CONTENT_TYPES = {
    "video/mp4", "video/webm", "video/x-m4v", "video/quicktime", "video/x-matroska",
}

@router.post("/api/junction/ingest-video")
async def ingest_video(file: UploadFile = File(...)):
    """
    Uploads and FULLY analyzes a traffic video (hard cap: 200MB), sampling
    frames evenly across the entire duration (not just the start) via
    real MOG2 background-subtraction vehicle counting. The resulting real
    per-corridor counts are immediately pushed into the live
    AdaptiveJunctionController via `update_detection()` — the same call
    `/api/junction/update-counts` makes — so the existing Traffic
    Modulation 2D grid and telemetry socket reflect the ingested video's
    real content right away.

    Returns the raw analysis result AND the resulting modulation view
    (grid + signal state) computed from the now-updated real controller
    state, so a caller gets the "2D graph style" representation of the
    video in the same response.
    """
    if file.content_type and file.content_type not in ALLOWED_VIDEO_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported content type '{file.content_type}'. Upload an MP4/WebM/MOV/MKV video.",
        )

    temp_path = await save_upload_capped(file, MAX_UPLOAD_BYTES)
    if temp_path is None:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Video exceeds the {MAX_UPLOAD_BYTES // (1024*1024)} MB upload limit.",
        )

    try:
        result = analyze_video_file(temp_path)
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)

    if not result.get("success"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=result.get("error", "Video analysis failed."))

    # Push the real, just-computed counts into the live controller for
    # both corridors, exactly as a real camera pipeline would.
    ns_counts = result["counts"]["NS"]
    ew_counts = result["counts"]["EW"]
    controller.update_detection(Corridor.NS, VehicleCounts(**ns_counts))
    controller.update_detection(Corridor.EW, VehicleCounts(**ew_counts))
    _feed_state["last_external_update"] = time.time()
    _feed_state["source_type"] = "ingested_video_full_analysis"
    _feed_state["source_name"] = file.filename or "uploaded_video"

    snapshot = controller.tick()
    modulation_view = build_modulation_view(snapshot)

    # Broadcast the update to any connected telemetry/modulation clients
    # immediately, same as the existing update-counts endpoint does.
    telemetry_message = json.dumps(snapshot.to_payload())
    modulation_message = json.dumps(modulation_view)
    async with _broadcast_lock:
        for ws in _active_connections:
            try:
                await ws.send_text(telemetry_message)
            except Exception:
                pass
    async with _modulation_broadcast_lock:
        for ws in _modulation_connections:
            try:
                await ws.send_text(modulation_message)
            except Exception:
                pass

    return {
        "status": "SUCCESS",
        "analysis": result,
        "controller_snapshot": snapshot.to_payload(),
        "modulation_view": modulation_view,
    }
