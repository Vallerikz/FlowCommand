"""
VIMS — Video Ingestion & Traffic Density Analysis Service
Processes uploaded traffic video keyframes using MOG2 background subtraction
to compute corridor vehicle counts and PCU density estimates.
"""

from __future__ import annotations

import logging
import os
import tempfile
from dataclasses import dataclass, field
from typing import Dict, Optional

import cv2
import numpy as np

logger = logging.getLogger("vims.video_ingest")

MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB hard cap, per requirements
MIN_BLOB_AREA_PX = 220
MEDIUM_BLOB_AREA_PX = 900
LARGE_BLOB_AREA_PX = 2600
# Cap the number of frames actually processed so a full pass over even a
# 200MB / long-duration file completes in bounded time, while still
# genuinely covering the full timeline (see _pick_sample_frame_indices).
MAX_FRAMES_TO_PROCESS = 300

# MOG2 model parameters. `history` is how many recent frames the mixture
# tracks, so convergence needs on the order of `history` frames. Warm-up must
# be generous relative to it: detecting too early yields a mask that splits
# each vehicle into separate edge strips (and briefly reports the whole frame
# as foreground), which inflates every downstream count.
MOG2_HISTORY = 50
MOG2_VAR_THRESHOLD = 40
MOG2_WARMUP_FRAMES = 60

# A vehicle blob should never cover most of the corridor ROI. Anything above
# this fraction of the ROI is un-converged background or a global lighting
# change, not a vehicle.
MAX_BLOB_AREA_FRACTION = 0.30


def _max_plausible_blob_area(roi: np.ndarray) -> float:
    """Upper bound for a single vehicle blob within this ROI, in pixels."""
    return float(roi.shape[0] * roi.shape[1]) * MAX_BLOB_AREA_FRACTION


@dataclass
class CorridorTally:
    small: int = 0   # ~ motorcycle-sized blobs
    medium: int = 0  # ~ car-sized blobs
    large: int = 0   # ~ bus/truck-sized blobs

    def as_vehicle_counts(self) -> Dict[str, int]:
        return {
            "motorcycle": self.small,
            "auto": 0,       # not distinguishable from blob size alone — honestly 0, not guessed
            "car": self.medium,
            "lcv": 0,        # same limitation as above
            "bus_truck": self.large,
        }

def _classify_blob_area(area: float) -> str:
    if area >= LARGE_BLOB_AREA_PX:
        return "large"
    if area >= MEDIUM_BLOB_AREA_PX:
        return "medium"
    return "small"


def _reset_subtractor(subtractor) -> None:
    """
    Discard the learned background model, across OpenCV versions.

    MOG2's Python binding exposes the reset as `reset()` in some builds and
    only `clear()` in others (notably OpenCV 5.x, where `reset()` is gone).
    Calling `.reset()` blindly raises AttributeError and aborts the whole
    video analysis, so probe for it and fall back.
    """
    reset = getattr(subtractor, "reset", None)
    if callable(reset):
        reset()
        return
    clear = getattr(subtractor, "clear", None)
    if callable(clear):
        clear()
        return
    # Last resort: rebuild via the stored params is not reachable here, and a
    # subtractor without either method would be an OpenCV build we cannot use.
    raise RuntimeError(
        "Background subtractor supports neither reset() nor clear(); "
        "cannot clear its background model."
    )

def _pick_sample_frame_indices(total_frames: int, max_samples: int) -> list:
    """
    Evenly-spaced frame indices covering the ENTIRE file from first frame
    to last — this is what makes the analysis a full-video pass rather
    than only looking at the start, while keeping runtime bounded for
    large files.
    """
    if total_frames <= 0:
        return [0]
    count = min(max_samples, total_frames)
    if count <= 1:
        return [0]
    return sorted(set(int(round(i * (total_frames - 1) / (count - 1))) for i in range(count)))

def analyze_video_file(file_path: str) -> Dict:
    """
    Runs the full-file analysis described in the module docstring and
    returns real aggregate per-corridor vehicle counts plus metadata
    about how much of the file was actually covered.
    """
    cap = cv2.VideoCapture(file_path)
    if not cap.isOpened():
        cap.release()
        return {
            "success": False,
            "error": "Could not open the uploaded file as a video (unsupported codec or corrupt file).",
            "source": "DECODE_FAILED",
        }

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    duration_sec = (total_frames / fps) if fps > 0 and total_frames > 0 else None

    sample_indices = _pick_sample_frame_indices(total_frames, MAX_FRAMES_TO_PROCESS)
    sample_set = set(sample_indices)

    bg_subtractor_ns = cv2.createBackgroundSubtractorMOG2(
        history=MOG2_HISTORY, varThreshold=MOG2_VAR_THRESHOLD, detectShadows=False
    )
    bg_subtractor_ew = cv2.createBackgroundSubtractorMOG2(
        history=MOG2_HISTORY, varThreshold=MOG2_VAR_THRESHOLD, detectShadows=False
    )

    tally = {"NS": CorridorTally(), "EW": CorridorTally()}
    frames_actually_read = 0
    # A MOG2 model needs a few frames to learn the background before its mask
    # means anything; detections taken before that are just "everything".
    warmup_frames = MOG2_WARMUP_FRAMES
    detected_frames = 0

    try:
        # Decode SEQUENTIALLY rather than seeking to the sampled indices.
        # MOG2 is a running-background algorithm: frames must be temporally
        # adjacent for the model to converge. Seeking makes every sampled
        # frame the model's *first* frame, which classifies 100% of pixels as
        # foreground and turns the whole frame into one giant blob.
        for idx in range(total_frames):
            ok, frame = cap.read()
            if not ok or frame is None:
                break

            is_warmup = idx < warmup_frames
            is_sample = idx in sample_set

            # Feed all contiguous warmup frames to MOG2 to converge the background model.
            # After warmup, process only the sampled frames to bound runtime.
            if not is_warmup and not is_sample:
                continue

            frames_actually_read += 1
            if not is_warmup:
                detected_frames += 1

            height, width = frame.shape[:2]
            mid_x = width // 2
            rois = (("NS", frame[:, :mid_x], bg_subtractor_ns), ("EW", frame[:, mid_x:], bg_subtractor_ew))

            for corridor, roi, subtractor in rois:
                mask = subtractor.apply(roi)
                if is_warmup:
                    # Still training the background model — nothing to detect yet.
                    continue
                mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
                mask = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=2)
                contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

                for contour in contours:
                    area = cv2.contourArea(contour)
                    # Reject blobs that cover most of the corridor: that is
                    # un-converged background, not a vehicle.
                    if area < MIN_BLOB_AREA_PX or area > _max_plausible_blob_area(roi):
                        continue
                    size_class = _classify_blob_area(area)
                    if size_class == "small":
                        tally[corridor].small += 1
                    elif size_class == "medium":
                        tally[corridor].medium += 1
                    else:
                        tally[corridor].large += 1
    finally:
        cap.release()

    return {
        "success": True,
        "source": "FULL_VIDEO_MOG2_ANALYSIS",
        "frames_in_file": total_frames,
        "frames_sampled": frames_actually_read,
        "fps_reported": round(fps, 2) if fps else None,
        "duration_sec": round(duration_sec, 2) if duration_sec else None,
        "coverage": "full_duration_evenly_sampled",
        "mog2_warmup_frames": MOG2_WARMUP_FRAMES,
        "frames_after_warmup": detected_frames,
        "counts": {
            "NS": tally["NS"].as_vehicle_counts(),
            "EW": tally["EW"].as_vehicle_counts(),
        },
        "limitations": (
            "Vehicle class is a coarse blob-size heuristic (motion-based "
            "background subtraction), not a trained object detector — "
            "'auto' and 'lcv' are always reported as 0 by this method. "
            "Counts are per-sampled-frame detections (density), not "
            "unique-vehicle tracking."
        ),
    }

async def save_upload_capped(file, max_bytes: int = MAX_UPLOAD_BYTES) -> Optional[str]:
    """
    Streams an UploadFile to a temp file, enforcing `max_bytes` without
    ever loading the whole thing into memory at once. Returns the temp
    path, or None if the size cap was exceeded (caller must still delete
    the partial temp file, which this function does before returning).
    """
    fd, path = tempfile.mkstemp(suffix=".mp4")
    total = 0
    exceeded = False
    try:
        with os.fdopen(fd, "wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    exceeded = True
                    break
                out.write(chunk)
        # `with` block has now closed the fd cleanly before we unlink.
        if exceeded:
            os.unlink(path)
            return None
        return path
    except Exception:
        # Ensure fd is closed (fdopen may not have been reached) before
        # attempting to unlink — required on Windows.
        try:
            os.close(fd)
        except OSError:
            pass
        if os.path.exists(path):
            os.unlink(path)
        raise
