"""
server.py
=========
FastAPI application exposing the Adaptive Traffic Signal Control (ATSC)
engine over a real-time telemetry WebSocket.

Endpoints
---------
  GET  /health                      basic liveness probe
  WS   /ws/junction-telemetry        1 Hz broadcast of controller state

Vehicle arrivals
-----------------
A background thread decodes a local .mp4 with OpenCV, runs a lightweight
MOG2 background-subtraction detector over two fixed ROIs (left half of the
frame = NS corridor, right half = EW corridor), and turns detected motion
blobs into per-class vehicle counts (bucketed by blob area) that are fed
into `AdaptiveJunctionController.update_detection()`. This intentionally
avoids a heavyweight object-detection model dependency — for production use
swap `_classify_blob_area()` / the whole detector for a proper YOLO (or
similar) pipeline without touching the controller or the WebSocket layer.

If no usable video file is found (or OpenCV fails to open it), the server
falls back to a synthetic random-walk arrival generator so the endpoint is
still fully exercisable in an environment with no camera footage attached.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import threading
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Dict, List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from traffic_engine import (
    AdaptiveJunctionController,
    Corridor,
    VehicleCounts,
)

try:
    import cv2  # opencv-python-headless
    import numpy as np
    _CV2_AVAILABLE = True
except ImportError:  # pragma: no cover - environment without OpenCV installed
    _CV2_AVAILABLE = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("atsc.server")

# ── Configuration ────────────────────────────────────────────────────────

VIDEO_PATH = os.getenv("ATSC_VIDEO_PATH", "traffic_footage.mp4")
DETECTION_HZ = 5.0                 # frame-sampling rate for the CV pipeline
BROADCAST_HZ = 1.0                 # required telemetry cadence
MIN_BLOB_AREA_PX = 350              # ignore noise smaller than this
LARGE_BLOB_AREA_PX = 9000           # blobs above this classify as bus/truck
MEDIUM_BLOB_AREA_PX = 2500          # blobs above this classify as car/LCV


# ─────────────────────────────────────────────────────────────────────────
# Shared, thread-safe arrival state
# ─────────────────────────────────────────────────────────────────────────

@dataclass
class _RawBlobCounts:
    small: int = 0    # -> two-wheeler / auto-rickshaw
    medium: int = 0   # -> car
    large: int = 0    # -> LCV / bus / truck


class ArrivalState:
    """Latest per-corridor blob counts, written by the CV thread, read by asyncio."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counts: Dict[Corridor, _RawBlobCounts] = {
            Corridor.NS: _RawBlobCounts(),
            Corridor.EW: _RawBlobCounts(),
        }
        self.source: str = "uninitialized"

    def update(self, corridor: Corridor, small: int, medium: int, large: int) -> None:
        with self._lock:
            self._counts[corridor] = _RawBlobCounts(small, medium, large)

    def snapshot(self) -> Dict[Corridor, _RawBlobCounts]:
        with self._lock:
            return dict(self._counts)


arrival_state = ArrivalState()


# ─────────────────────────────────────────────────────────────────────────
# OpenCV vehicle-arrival detector (runs in a dedicated thread)
# ─────────────────────────────────────────────────────────────────────────

def _classify_blob_area(area: float) -> str:
    if area >= LARGE_BLOB_AREA_PX:
        return "large"
    if area >= MEDIUM_BLOB_AREA_PX:
        return "medium"
    return "small"


def _run_opencv_arrival_detector(video_path: str, stop_event: threading.Event) -> None:
    """
    Blocking OpenCV loop — MUST run in its own thread, never on the asyncio
    event loop. Streams a local .mp4, loops it on EOF, and periodically
    updates `arrival_state` with per-corridor blob counts split left/right.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        logger.warning(
            "OpenCV could not open video source '%s' — arrival detector thread exiting; "
            "falling back to the synthetic simulator.",
            video_path,
        )
        arrival_state.source = "unavailable"
        return

    arrival_state.source = f"opencv:{video_path}"
    logger.info("ATSC arrival detector attached to video source '%s'.", video_path)

    bg_subtractor = cv2.createBackgroundSubtractorMOG2(
        history=250, varThreshold=40, detectShadows=False
    )
    frame_interval = 1.0 / DETECTION_HZ
    next_sample_at = time.monotonic()

    try:
        while not stop_event.is_set():
            ok, frame = cap.read()
            if not ok:
                # Loop the clip so the demo runs indefinitely.
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue

            now = time.monotonic()
            if now < next_sample_at:
                continue
            next_sample_at = now + frame_interval

            height, width = frame.shape[:2]
            mid_x = width // 2
            ns_roi = frame[:, :mid_x]   # left half of frame  -> NS corridor
            ew_roi = frame[:, mid_x:]   # right half of frame -> EW corridor

            for corridor, roi in ((Corridor.NS, ns_roi), (Corridor.EW, ew_roi)):
                mask = bg_subtractor.apply(roi)
                mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
                mask = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=2)

                contours, _ = cv2.findContours(
                    mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
                )

                bucket = {"small": 0, "medium": 0, "large": 0}
                for contour in contours:
                    area = cv2.contourArea(contour)
                    if area < MIN_BLOB_AREA_PX:
                        continue
                    bucket[_classify_blob_area(area)] += 1

                arrival_state.update(
                    corridor, bucket["small"], bucket["medium"], bucket["large"]
                )
    except Exception:  # pragma: no cover - defensive: never crash the process
        logger.exception("ATSC arrival detector thread crashed; telemetry will freeze.")
    finally:
        cap.release()
        logger.info("ATSC arrival detector thread stopped.")


# ─────────────────────────────────────────────────────────────────────────
# Synthetic fallback arrival generator (pure asyncio, no OpenCV/video needed)
# ─────────────────────────────────────────────────────────────────────────

async def _run_synthetic_arrival_generator(stop_event: threading.Event) -> None:
    arrival_state.source = "synthetic"
    logger.info("No usable video source — using synthetic arrival generator.")
    baseline = {
        Corridor.NS: {"small": 6, "medium": 8, "large": 1},
        Corridor.EW: {"small": 4, "medium": 5, "large": 0},
    }
    rng = random.Random()
    try:
        while not stop_event.is_set():
            for corridor, buckets in baseline.items():
                for key in buckets:
                    delta = rng.randint(-2, 3)
                    buckets[key] = max(0, min(25, buckets[key] + delta))
                arrival_state.update(
                    corridor, buckets["small"], buckets["medium"], buckets["large"]
                )
            await asyncio.sleep(1.0 / DETECTION_HZ)
    except asyncio.CancelledError:
        raise


# ─────────────────────────────────────────────────────────────────────────
# Bridge: blob counts -> controller.update_detection()
# ─────────────────────────────────────────────────────────────────────────

def _blob_counts_to_vehicle_counts(buckets: _RawBlobCounts) -> VehicleCounts:
    """
    Split each size bucket across the corresponding PCU vehicle classes.
    Purely heuristic (area-based), intended as a stand-in for a real
    classifier; swap for actual per-class YOLO output in production.
    """
    return VehicleCounts(
        two_wheeler=int(round(buckets.small * 0.6)),
        auto_rickshaw=int(round(buckets.small * 0.4)),
        car=buckets.medium,
        lcv=int(round(buckets.large * 0.3)),
        bus_truck=int(round(buckets.large * 0.7)),
    )


async def _feed_controller_from_arrivals(
    controller: AdaptiveJunctionController, stop_event: threading.Event
) -> None:
    """Periodically pushes the latest detected arrivals into the controller."""
    try:
        while not stop_event.is_set():
            snapshot = arrival_state.snapshot()
            for corridor, buckets in snapshot.items():
                controller.update_detection(corridor, _blob_counts_to_vehicle_counts(buckets))
            await asyncio.sleep(1.0 / DETECTION_HZ)
    except asyncio.CancelledError:
        raise


# ─────────────────────────────────────────────────────────────────────────
# WebSocket connection registry + 1 Hz broadcast loop
# ─────────────────────────────────────────────────────────────────────────

controller = AdaptiveJunctionController(initial_active=Corridor.NS)

_active_connections: List[WebSocket] = []
_connections_lock = asyncio.Lock()


async def _broadcast_loop(stop_event: threading.Event) -> None:
    try:
        while not stop_event.is_set():
            snapshot = controller.tick()
            message = json.dumps(snapshot.to_payload())

            async with _connections_lock:
                stale: List[WebSocket] = []
                for ws in _active_connections:
                    try:
                        await ws.send_text(message)
                    except Exception:
                        stale.append(ws)
                for ws in stale:
                    _active_connections.remove(ws)

            await asyncio.sleep(1.0 / BROADCAST_HZ)
    except asyncio.CancelledError:
        raise


# ─────────────────────────────────────────────────────────────────────────
# App lifecycle — start/stop background work cleanly
# ─────────────────────────────────────────────────────────────────────────

_cv_thread: Optional[threading.Thread] = None
_cv_stop_event = threading.Event()
_background_tasks: List[asyncio.Task] = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _cv_thread

    use_opencv = _CV2_AVAILABLE and os.path.isfile(VIDEO_PATH)
    if _CV2_AVAILABLE and not os.path.isfile(VIDEO_PATH):
        logger.warning(
            "ATSC_VIDEO_PATH '%s' not found — falling back to the synthetic "
            "arrival generator. Set the ATSC_VIDEO_PATH env var to a real "
            ".mp4 to exercise the OpenCV pipeline.",
            VIDEO_PATH,
        )
    elif not _CV2_AVAILABLE:
        logger.warning("OpenCV not installed — falling back to the synthetic arrival generator.")

    if use_opencv:
        _cv_thread = threading.Thread(
            target=_run_opencv_arrival_detector,
            args=(VIDEO_PATH, _cv_stop_event),
            daemon=True,
            name="atsc-opencv-detector",
        )
        _cv_thread.start()
    else:
        _background_tasks.append(
            asyncio.create_task(_run_synthetic_arrival_generator(_cv_stop_event))
        )

    _background_tasks.append(
        asyncio.create_task(_feed_controller_from_arrivals(controller, _cv_stop_event))
    )
    _background_tasks.append(asyncio.create_task(_broadcast_loop(_cv_stop_event)))

    logger.info("ATSC background tasks started (arrival source=%s).", arrival_state.source or "pending")

    try:
        yield
    finally:
        _cv_stop_event.set()
        for task in _background_tasks:
            task.cancel()
        await asyncio.gather(*_background_tasks, return_exceptions=True)
        if _cv_thread is not None:
            _cv_thread.join(timeout=5.0)
        logger.info("ATSC background tasks stopped cleanly.")


app = FastAPI(
    title="Adaptive Traffic Signal Control (ATSC)",
    description="IRC 93:1985-compliant density-adaptive junction controller with live telemetry.",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health", tags=["System"])
async def health_check():
    return {
        "status": "ONLINE",
        "service": "Adaptive Traffic Signal Control",
        "arrival_source": arrival_state.source,
        "active_corridor": controller.active_corridor.value,
        "signal_state": controller.signal_state.value,
    }


@app.websocket("/ws/junction-telemetry")
async def junction_telemetry(websocket: WebSocket) -> None:
    """
    Streams the ATSC controller state once per second as JSON with keys:
    active_corridor, signal_state, elapsed_time, ns_pcu, ew_pcu, phase_status.
    """
    await websocket.accept()
    async with _connections_lock:
        _active_connections.append(websocket)
    logger.info("Telemetry client connected (%d active).", len(_active_connections))

    try:
        # Send an immediate snapshot on connect so the client doesn't wait
        # up to 1s for its first update.
        await websocket.send_text(json.dumps(controller.tick().to_payload()))
        while True:
            # This endpoint is broadcast-only; we still need to await
            # something so a client disconnect is detected promptly.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Telemetry WebSocket connection ended unexpectedly.")
    finally:
        async with _connections_lock:
            if websocket in _active_connections:
                _active_connections.remove(websocket)
        logger.info("Telemetry client disconnected (%d active).", len(_active_connections))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)
