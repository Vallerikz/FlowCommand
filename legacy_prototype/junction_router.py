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
import random
import time
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Response
from fastapi.responses import StreamingResponse

from backend.traffic_engine import (
    AdaptiveJunctionController,
    Corridor,
    VehicleCounts,
)

router = APIRouter(tags=["Adaptive Junction Control"])

# ── Shared controller instance (single junction) ────────────────────────
controller = AdaptiveJunctionController(initial_active=Corridor.NS)

# ── Camera Feed Input & Regulation State ────────────────────────────────
_feed_state = {
    "source_type": "pre_downloaded",  # "pre_downloaded", "local_file", "mjpeg", "webcam"
    "source_name": "Pune JM Road Chowk (Pre-Downloaded Edge Footage)",
    "stream_url": "/api/junction/video-feed",
    "regulation_mode": "ADAPTIVE",  # "ADAPTIVE", "MANUAL_NS", "MANUAL_EW", "ALL_RED"
    "last_external_update": 0.0,
    "status": "OPERATIONAL",
}

# ── Connection registry for the telemetry broadcast ─────────────────────
_active_connections: List[WebSocket] = []
_broadcast_lock = asyncio.Lock()

# Background task handles, tracked so they are started exactly once and can
# be cancelled cleanly on shutdown.
_simulator_task: asyncio.Task | None = None
_broadcast_task: asyncio.Task | None = None


# ──────────────────────────────────────────────────────────────────────────
# Simulated YOLO detector feed
# ──────────────────────────────────────────────────────────────────────────

async def _simulate_yolo_detection_feed() -> None:
    """
    Background task producing fluctuating, semi-realistic per-class vehicle
    counts for both corridors, mimicking a live YOLO detector's rolling
    per-second counts. Runs indefinitely at ~1 Hz until cancelled.
    """
    # Baseline occupancy per corridor per vehicle class — a random walk is
    # applied on top of these each tick to simulate arrival/departure noise.
    baseline = {
        Corridor.NS: {"motorcycle": 8, "auto": 3, "car": 10, "lcv": 2, "bus_truck": 1},
        Corridor.EW: {"motorcycle": 5, "auto": 2, "car": 6, "lcv": 1, "bus_truck": 0},
    }

    try:
        while True:
            for corridor, classes in baseline.items():
                # Random walk each class count within sane, non-negative bounds.
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


# ──────────────────────────────────────────────────────────────────────────
# 1 Hz broadcast loop
# ──────────────────────────────────────────────────────────────────────────

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


# ──────────────────────────────────────────────────────────────────────────
# WebSocket endpoint
# ──────────────────────────────────────────────────────────────────────────

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


# ──────────────────────────────────────────────────────────────────────────
# Convenience REST endpoint (non-WebSocket clients / debugging)
# ──────────────────────────────────────────────────────────────────────────

@router.get("/api/junction/state")
async def get_junction_state():
    """One-shot snapshot of the junction controller state over plain HTTP."""
    snapshot = controller.tick()
    return snapshot.to_payload()


@router.get("/api/junction/constraints")
async def get_junction_constraints():
    """Static safety constraint values enforced by the controller."""
    return {
        "min_green_sec": controller.min_green,
        "max_green_sec": controller.max_green,
        "amber_sec": controller.amber_time,
        "all_red_sec": controller.all_red_time,
        "pcu_weights": {
            "motorcycle": 0.5,
            "auto": 0.8,
            "car": 1.0,
            "lcv": 1.5,
            "bus_truck": 3.0,
        },
    }


# ──────────────────────────────────────────────────────────────────────────
# Camera Feed Input & Traffic Regulation Endpoints
# ──────────────────────────────────────────────────────────────────────────

class FeedInputPayload(BaseModel):
    source_type: str = Field("pre_downloaded", description="Feed type: pre_downloaded, local_file, mjpeg_stream, webcam")
    source_name: str = Field("Pune JM Road Chowk (Pre-Downloaded)", description="Display label or file name")
    stream_url: Optional[str] = Field(None, description="Stream URI if remote stream")
    corridor: Optional[str] = Field("ALL", description="Target corridor or ALL")


class RegulationOverridePayload(BaseModel):
    action: str = Field(..., description="Action: FORCE_NS, FORCE_EW, ALL_RED, RESUME_AUTO")
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
    action = payload.action.upper()
    _feed_state["last_external_update"] = time.time()

    if action == "FORCE_NS":
        controller.force_corridor_green(Corridor.NS)
        _feed_state["regulation_mode"] = "MANUAL_NS"
    elif action == "FORCE_EW":
        controller.force_corridor_green(Corridor.EW)
        _feed_state["regulation_mode"] = "MANUAL_EW"
    elif action == "ALL_RED":
        controller.force_all_red()
        _feed_state["regulation_mode"] = "ALL_RED"
    elif action == "RESUME_AUTO":
        _feed_state["regulation_mode"] = "ADAPTIVE"
    else:
        return {"status": "ERROR", "message": f"Unknown action: {payload.action}"}

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
