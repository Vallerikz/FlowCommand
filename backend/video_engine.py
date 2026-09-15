"""
VIMS — ATSC Edge Video Engine
OpenCV + Ultralytics YOLO decode/detect pipeline for junction corridor video streams.
Feeds live PCU tallies into AdaptiveJunctionController and produces annotated MJPEG frames.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np
from ultralytics import YOLO

from backend.traffic_engine import AdaptiveJunctionController, Corridor, VehicleCounts

logger = logging.getLogger("vims.video_engine")

# Configuration
PROJECT_ROOT = Path(__file__).resolve().parent.parent
ASSET_DIR = PROJECT_ROOT / "assets" / "video"

NS_VIDEO_PATH = os.getenv("NS_VIDEO_PATH", str(ASSET_DIR / "traffic_ns.mp4"))
EW_VIDEO_PATH = os.getenv("EW_VIDEO_PATH", str(ASSET_DIR / "traffic_ew.mp4"))
YOLO_MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "yolov8n.pt")

# Run detection on every Nth decoded frame. At a typical 25-30 FPS source
# this lands inference around 8-10 FPS, which is the CPU/edge budget target.
DETECTION_FRAME_STRIDE = 3

# COCO class ids -> VIMS vehicle categories (per spec: motorcycle=3, car=2,
# bus=5, truck=7). Bus and truck are both IRC PCU-weight 3.0 and collapse
# onto the shared `bus_truck` field of VehicleCounts.
COCO_CLASS_TO_CATEGORY: Dict[int, str] = {
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
}

# IRC (Indian Roads Congress) PCU equivalence used for the video pipeline.
IRC_PCU_WEIGHTS: Dict[str, float] = {
    "motorcycle": 0.5,
    "car": 1.0,
    "bus": 3.0,
    "truck": 3.0,
}

DETECTION_CONFIDENCE_THRESHOLD = 0.35
JPEG_QUALITY = 80

BOX_COLOR = (0, 210, 255)      # amber-ish BGR for bounding boxes
ROI_COLOR = (60, 220, 60)      # green BGR for ROI outline
TEXT_COLOR = (255, 255, 255)
OVERLAY_BG = (20, 20, 20)


# ──────────────────────────────────────────────────────────────────────────
# Small geometry / drawing helpers
# ──────────────────────────────────────────────────────────────────────────

def _left_half_polygon(width: int, height: int) -> np.ndarray:
    return np.array([[0, 0], [width // 2, 0], [width // 2, height], [0, height]], dtype=np.int32)


def _right_half_polygon(width: int, height: int) -> np.ndarray:
    return np.array([[width // 2, 0], [width, 0], [width, height], [width // 2, height]], dtype=np.int32)


def _full_frame_polygon(width: int, height: int) -> np.ndarray:
    return np.array([[0, 0], [width, 0], [width, height], [0, height]], dtype=np.int32)


def _box_center(x1: float, y1: float, x2: float, y2: float) -> Tuple[float, float]:
    return (x1 + x2) / 2.0, (y1 + y2) / 2.0


def _center_inside_polygon(center: Tuple[float, float], polygon: np.ndarray) -> bool:
    return cv2.pointPolygonTest(polygon, center, False) >= 0


# ──────────────────────────────────────────────────────────────────────────
# Data model
# ──────────────────────────────────────────────────────────────────────────

@dataclass
class Detection:
    category: str
    confidence: float
    x1: float
    y1: float
    x2: float
    y2: float


@dataclass
class CorridorFrameState:
    """Thread-safe holder for the latest annotated frame + PCU tally for one corridor."""
    lock: threading.Lock = field(default_factory=threading.Lock)
    jpeg_bytes: Optional[bytes] = None
    vehicle_counts: VehicleCounts = field(default_factory=VehicleCounts)
    last_updated_epoch: float = 0.0
    frames_decoded: int = 0
    detections_run: int = 0
    source_ready: bool = False

    def update(self, jpeg_bytes: bytes, counts: VehicleCounts) -> None:
        with self.lock:
            self.jpeg_bytes = jpeg_bytes
            self.vehicle_counts = counts
            self.last_updated_epoch = time.time()
            self.source_ready = True

    def latest_jpeg(self) -> Optional[bytes]:
        with self.lock:
            return self.jpeg_bytes


# ──────────────────────────────────────────────────────────────────────────
# Shared YOLO inference wrapper (thread-safe: one model, serialized calls)
# ──────────────────────────────────────────────────────────────────────────

class _SharedYoloModel:
    """
    Ultralytics YOLO objects are not guaranteed safe for truly concurrent
    `.predict()` calls from multiple threads. Rather than loading one model
    per corridor (2x memory on edge hardware), we load it once and serialize
    inference calls behind a lock — CPU inference is the bottleneck either
    way, so this costs no real throughput versus per-thread models.
    """

    def __init__(self, model_path: str):
        logger.info("Loading YOLOv8 model from %s", model_path)
        self._model = YOLO(model_path)
        self._lock = threading.Lock()

    def infer(self, frame: np.ndarray) -> List[Detection]:
        with self._lock:
            results = self._model.predict(
                source=frame,
                classes=list(COCO_CLASS_TO_CATEGORY.keys()),
                conf=DETECTION_CONFIDENCE_THRESHOLD,
                verbose=False,
            )

        detections: List[Detection] = []
        if not results:
            return detections

        result = results[0]
        boxes = getattr(result, "boxes", None)
        if boxes is None:
            return detections

        for box in boxes:
            cls_id = int(box.cls[0].item())
            category = COCO_CLASS_TO_CATEGORY.get(cls_id)
            if category is None:
                continue
            conf = float(box.conf[0].item())
            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
            detections.append(Detection(category=category, confidence=conf, x1=x1, y1=y1, x2=x2, y2=y2))

        return detections


# ──────────────────────────────────────────────────────────────────────────
# Per-corridor ROI view (drives detection -> PCU -> drawing for one corridor)
# ──────────────────────────────────────────────────────────────────────────

class _CorridorView:
    """
    Binds one corridor (NS or EW) to a polygon ROI within a frame stream,
    holding its own rolling detection cache and shared output state.
    """

    def __init__(self, corridor: Corridor, label: str, state: CorridorFrameState):
        self.corridor = corridor
        self.label = label
        self.state = state
        self.polygon: Optional[np.ndarray] = None
        self._last_detections: List[Detection] = []

    def ensure_polygon(self, polygon: np.ndarray) -> None:
        if self.polygon is None:
            self.polygon = polygon

    def filter_and_cache(self, all_detections: List[Detection]) -> List[Detection]:
        assert self.polygon is not None, "ROI polygon must be set before filtering detections"
        in_roi = [
            d for d in all_detections
            if _center_inside_polygon(_box_center(d.x1, d.y1, d.x2, d.y2), self.polygon)
        ]
        self._last_detections = in_roi
        return in_roi

    def cached_detections(self) -> List[Detection]:
        return self._last_detections

    def counts_from(self, detections: List[Detection]) -> VehicleCounts:
        tally = {"motorcycle": 0, "car": 0, "bus_truck": 0}
        for d in detections:
            if d.category == "motorcycle":
                tally["motorcycle"] += 1
            elif d.category == "car":
                tally["car"] += 1
            elif d.category in ("bus", "truck"):
                tally["bus_truck"] += 1
        return VehicleCounts(
            motorcycle=tally["motorcycle"],
            auto=0,
            car=tally["car"],
            lcv=0,
            bus_truck=tally["bus_truck"],
        )

    def pcu_of(self, detections: List[Detection]) -> float:
        total = 0.0
        for d in detections:
            total += IRC_PCU_WEIGHTS.get(d.category, 0.0)
        return total


def _draw_annotations(
    frame: np.ndarray,
    views: List[_CorridorView],
    detections_by_view: Dict[str, List[Detection]],
) -> np.ndarray:
    """Draw ROI polygons, bounding boxes, and a PCU readout panel onto the frame (in place)."""
    annotated = frame

    for view in views:
        if view.polygon is not None:
            cv2.polylines(annotated, [view.polygon], isClosed=True, color=ROI_COLOR, thickness=2)
            top_left = tuple(view.polygon[0])
            cv2.putText(
                annotated, f"{view.label} ROI", (int(top_left[0]) + 8, int(top_left[1]) + 24),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, ROI_COLOR, 2, cv2.LINE_AA,
            )

        dets = detections_by_view.get(view.label, [])
        pcu = view.pcu_of(dets)

        for d in dets:
            p1 = (int(d.x1), int(d.y1))
            p2 = (int(d.x2), int(d.y2))
            cv2.rectangle(annotated, p1, p2, BOX_COLOR, 2)
            tag = f"{d.category} {d.confidence:.2f}"
            cv2.putText(annotated, tag, (p1[0], max(0, p1[1] - 6)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, BOX_COLOR, 1, cv2.LINE_AA)

        # PCU readout panel, offset per-corridor so NS/EW don't overlap in split mode.
        panel_y = 30 if view.label == "NS" else 60
        panel_text = f"{view.label} PCU: {pcu:.1f}  (veh: {len(dets)})"
        (tw, th), _ = cv2.getTextSize(panel_text, cv2.FONT_HERSHEY_SIMPLEX, 0.65, 2)
        cv2.rectangle(annotated, (5, panel_y - th - 6), (10 + tw, panel_y + 6), OVERLAY_BG, -1)
        cv2.putText(annotated, panel_text, (8, panel_y), cv2.FONT_HERSHEY_SIMPLEX, 0.65, TEXT_COLOR, 2, cv2.LINE_AA)

    return annotated


# ──────────────────────────────────────────────────────────────────────────
# Corridor worker thread — owns a capture, decodes, detects, annotates
# ──────────────────────────────────────────────────────────────────────────

class CorridorWorker(threading.Thread):
    """
    Owns exactly one `cv2.VideoCapture`. Feeds one or two `_CorridorView`s
    (two only in single-video split-ROI mode) from the frames it decodes.
    """

    def __init__(
        self,
        name: str,
        video_path: str,
        model: _SharedYoloModel,
        controller: AdaptiveJunctionController,
        views: List[_CorridorView],
        polygon_builder,
    ):
        super().__init__(name=f"CorridorWorker-{name}", daemon=True)
        self.video_path = video_path
        self.model = model
        self.controller = controller
        self.views = views
        self.polygon_builder = polygon_builder  # fn(width, height) -> {label: polygon}

        self._stop_event = threading.Event()
        self._capture: Optional[cv2.VideoCapture] = None
        self._frame_index = 0

    def stop(self) -> None:
        self._stop_event.set()

    def run(self) -> None:
        self._capture = cv2.VideoCapture(self.video_path)
        if not self._capture.isOpened():
            logger.error("Could not open video source: %s", self.video_path)
            for view in self.views:
                view.state.source_ready = False
            return

        fps = self._capture.get(cv2.CAP_PROP_FPS) or 25.0
        frame_interval = 1.0 / fps if fps > 0 else 1.0 / 25.0
        polygons_initialized = False

        try:
            while not self._stop_event.is_set():
                loop_start = time.monotonic()

                ok, frame = self._capture.read()
                if not ok or frame is None:
                    # End of file (or transient decode failure) — loop the clip.
                    self._capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ok, frame = self._capture.read()
                    if not ok or frame is None:
                        logger.warning("Unable to read from %s even after loop reset; retrying.", self.video_path)
                        time.sleep(0.5)
                        continue

                height, width = frame.shape[:2]
                if not polygons_initialized:
                    polygons = self.polygon_builder(width, height)
                    for view in self.views:
                        view.ensure_polygon(polygons[view.label])
                    polygons_initialized = True

                self._frame_index += 1
                run_detection = (self._frame_index % DETECTION_FRAME_STRIDE == 0)

                detections_by_view: Dict[str, List[Detection]] = {}
                if run_detection:
                    all_detections = self.model.infer(frame)
                    for view in self.views:
                        detections_by_view[view.label] = view.filter_and_cache(all_detections)
                        view.state.detections_run += 1
                else:
                    for view in self.views:
                        detections_by_view[view.label] = view.cached_detections()

                annotated = _draw_annotations(frame, self.views, detections_by_view)

                ok_enc, buffer = cv2.imencode(
                    ".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY]
                )
                jpeg_bytes = buffer.tobytes() if ok_enc else None

                for view in self.views:
                    counts = view.counts_from(detections_by_view[view.label])
                    # Feed the ATSC controller regardless of encode success —
                    # PCU telemetry must keep flowing even if a JPEG frame drops.
                    self.controller.update_detection(view.corridor, counts)
                    view.state.frames_decoded += 1
                    if jpeg_bytes is not None:
                        view.state.update(jpeg_bytes, counts)

                # Pace decoding roughly to source FPS so we don't spin the CPU
                # decoding a 30fps clip at 300fps for no benefit.
                elapsed = time.monotonic() - loop_start
                sleep_for = frame_interval - elapsed
                if sleep_for > 0:
                    time.sleep(sleep_for)
        finally:
            if self._capture is not None:
                self._capture.release()
            logger.info("Released video capture for %s", self.video_path)


# ──────────────────────────────────────────────────────────────────────────
# Public engine facade
# ──────────────────────────────────────────────────────────────────────────

class VideoEngine:
    """
    Owns the corridor worker thread(s), the shared YOLO model, and the
    per-corridor output state consumed by the MJPEG streaming endpoints.

    Usage:
        engine = VideoEngine(controller)
        engine.start()
        ...
        engine.stop()   # on FastAPI shutdown — releases all captures cleanly
    """

    def __init__(
        self,
        controller: AdaptiveJunctionController,
        ns_video_path: str = NS_VIDEO_PATH,
        ew_video_path: str = EW_VIDEO_PATH,
        model_path: str = YOLO_MODEL_PATH,
    ):
        self.controller = controller
        self.ns_video_path = ns_video_path
        self.ew_video_path = ew_video_path

        self.ns_state = CorridorFrameState()
        self.ew_state = CorridorFrameState()

        self._model: Optional[_SharedYoloModel] = None
        self._model_path = model_path
        self._workers: List[CorridorWorker] = []
        self._started = False

    # ── Lifecycle ────────────────────────────────────────────────────

    def start(self) -> None:
        if self._started:
            return

        self._model = _SharedYoloModel(self._model_path)

        ns_exists = os.path.isfile(self.ns_video_path)
        ew_exists = os.path.isfile(self.ew_video_path)

        ns_view = _CorridorView(Corridor.NS, "NS", self.ns_state)
        ew_view = _CorridorView(Corridor.EW, "EW", self.ew_state)

        if ns_exists and ew_exists and os.path.abspath(self.ns_video_path) != os.path.abspath(self.ew_video_path):
            logger.info("Dual-video mode: NS=%s EW=%s", self.ns_video_path, self.ew_video_path)
            self._workers = [
                CorridorWorker(
                    "NS", self.ns_video_path, self._model, self.controller, [ns_view],
                    polygon_builder=lambda w, h: {"NS": _full_frame_polygon(w, h)},
                ),
                CorridorWorker(
                    "EW", self.ew_video_path, self._model, self.controller, [ew_view],
                    polygon_builder=lambda w, h: {"EW": _full_frame_polygon(w, h)},
                ),
            ]
        else:
            # Single-source split-ROI mode: prefer NS path, fall back to EW path.
            source_path = self.ns_video_path if ns_exists else self.ew_video_path
            if not os.path.isfile(source_path):
                logger.error(
                    "No video source found at NS=%s or EW=%s — video engine will not start. "
                    "Place traffic_ns.mp4/traffic_ew.mp4 under %s or set NS_VIDEO_PATH/EW_VIDEO_PATH.",
                    self.ns_video_path, self.ew_video_path, ASSET_DIR,
                )
                return

            logger.info("Single-video split-ROI mode: source=%s", source_path)
            self._workers = [
                CorridorWorker(
                    "SPLIT", source_path, self._model, self.controller, [ns_view, ew_view],
                    polygon_builder=lambda w, h: {
                        "NS": _left_half_polygon(w, h),
                        "EW": _right_half_polygon(w, h),
                    },
                ),
            ]

        for worker in self._workers:
            worker.start()

        self._started = True

    def stop(self) -> None:
        for worker in self._workers:
            worker.stop()
        for worker in self._workers:
            worker.join(timeout=5.0)
        self._workers = []
        self._started = False
        logger.info("Video engine stopped; all capture threads released.")

    # ── Frame access for streaming endpoints ───────────────────────────

    def latest_jpeg(self, corridor: Corridor) -> Optional[bytes]:
        state = self.ns_state if corridor == Corridor.NS else self.ew_state
        return state.latest_jpeg()

    def is_ready(self, corridor: Corridor) -> bool:
        state = self.ns_state if corridor == Corridor.NS else self.ew_state
        return state.source_ready
