"""
VIMS — Ingested Video Vehicle Tracker
=====================================
Turns an uploaded traffic video into a set of *positioned* vehicles that can be
drawn on the junction minimap.

The existing density analyser (`video_ingest.analyze_video_file`) only reports
aggregate blob counts per corridor. That answers "how busy is it" but not
"where is each vehicle", which is what a minimap needs.

This module adds a real, deterministic tracker:

  1. MOG2 background subtraction to obtain foreground blobs per corridor ROI.
  2. Contour extraction -> bounding box + centroid + area for each blob.
  3. Greedy nearest-neighbour association across consecutive sampled frames to
     link blobs into vehicle *tracks* (one track == one vehicle).
  4. Each track is reduced to a minimap-ready entity: normalised corridor
     position, sub-lane, size class, direction and confidence.

Honesty notes (these are real limitations of a classical CV pipeline, not
placeholders):

  * Classification is a blob-AREA heuristic, not a trained detector. "auto" and
    "lcv" are never claimed.
  * Tracks are built from *sampled* frames, so a fast vehicle can be missed
    between samples. `observations` is reported so the caller can judge.
  * Plate numbers are NEVER invented. A track has no plate until ANPR actually
    reads one; `plate` stays null.

This module performs no network IO and is safe to call from a worker thread.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from backend.services.video_ingest import (
    LARGE_BLOB_AREA_PX,
    MAX_BLOB_AREA_FRACTION,
    MEDIUM_BLOB_AREA_PX,
    MIN_BLOB_AREA_PX,
    MOG2_HISTORY,
    MOG2_VAR_THRESHOLD,
    MOG2_WARMUP_FRAMES,
    _pick_sample_frame_indices,
)

logger = logging.getLogger("vims.video_tracker")

# Tracking tuning.
MAX_TRACK_GAP_FRAMES = 3      # frames a track may go unseen before it is dropped
MAX_ASSOCIATION_DISTANCE = 0.18  # normalised distance for blob-to-track linking
MAX_TRACKS_PER_CORRIDOR = 40  # hard cap so one busy frame can't explode state

# Blob de-fragmentation: pieces of one vehicle sit within this lateral distance
# and this longitudinal gap (pixels), and must not merge into an implausible
# total area.
BLOB_MERGE_LATERAL_PX = 40
BLOB_MERGE_GAP_PX = 26
MAX_MERGED_BLOB_AREA_PX = 20000

# Corridor geometry constants, mirroring traffic_simulation so minimap
# coordinates line up with the simulated fleet.
CORRIDOR_LENGTH_M = 120.0
STOP_LINE_M = 90.0
INTERSECTION_EXIT_M = 120.0

# Corridor longitudinal progress -> minimap normalised position.
# Maps real 0..120 m of corridor onto the 0..1 axis the minimap expects.


def _classify_area(area: float) -> str:
    if area >= LARGE_BLOB_AREA_PX:
        return "large"
    if area >= MEDIUM_BLOB_AREA_PX:
        return "medium"
    return "small"


@dataclass
class Blob:
    """A single foreground detection in one sampled frame, in ROI pixel space."""
    cx: float
    cy: float
    w: float
    h: float
    area: float

    @property
    def size_class(self) -> str:
        return _classify_area(self.area)


@dataclass
class Track:
    """A vehicle linked across consecutive sampled frames."""
    track_id: str
    corridor: str
    size_class: str
    # Running means of the corridor-relative position (0..1 along travel,
    # 0..1 across the road), plus the blob extent.
    pos: float = 0.0
    lateral: float = 0.0
    width: float = 0.0
    length: float = 0.0
    observations: int = 0
    last_frame_index: int = -1
    first_frame_index: int = 0
    # Signed travel along the corridor, used to infer direction of travel.
    travel_delta: float = 0.0
    _prev_pos: float = 0.0

    def update(self, pos: float, lateral: float, width: float, length: float, frame_index: int) -> None:
        # Exponential smoothing keeps the rendered marker stable rather than
        # jittering with every noisy sample.
        alpha = 0.4
        self.pos += (pos - self.pos) * alpha
        self.lateral += (lateral - self.lateral) * alpha
        self.width += (width - self.width) * alpha
        self.length += (length - self.length) * alpha
        self.travel_delta += (pos - self._prev_pos) * alpha
        self._prev_pos = pos
        self.observations += 1
        self.last_frame_index = frame_index

    @property
    def confidence(self) -> float:
        """Higher when a track is both long-lived and well-localised."""
        if self.observations == 0:
            return 0.0
        persistence = min(1.0, self.observations / 5.0)
        size_signal = min(1.0, (self.length * self.width) / 900.0)
        return round(min(1.0, 0.6 * persistence + 0.4 * size_signal), 3)

    def direction(self) -> str:
        """'INBOUND' moves toward the junction, 'OUTBOUND' away from it."""
        return "INBOUND" if self.travel_delta >= 0 else "OUTBOUND"

    def phase(self) -> str:
        """Where the vehicle currently sits relative to the stop line."""
        pos_m = self.pos * CORRIDOR_LENGTH_M
        if pos_m < STOP_LINE_M:
            return "APPROACHING"
        if pos_m < INTERSECTION_EXIT_M:
            return "IN_JUNCTION"
        return "CLEARED"

    def to_minimap_entity(self) -> Dict:
        pos_m = round(self.pos * CORRIDOR_LENGTH_M, 1)
        return {
            "id": self.track_id,
            "corridor": self.corridor,
            # Real corridor position, so the client can apply its own layout.
            "position_m": pos_m,
            "position_norm": round(self.pos, 4),
            "lateral_norm": round(self.lateral, 4),
            "width_m": round(max(0.0, self.width), 2),
            "length_m": round(max(0.0, self.length), 2),
            "size_class": self.size_class,
            "vehicle_type": {
                "small": "two_wheeler",
                "medium": "car",
                "large": "bus_truck",
            }.get(self.size_class, "unknown"),
            "direction": self.direction(),
            "phase": self.phase(),
            "observations": self.observations,
            "confidence": self.confidence,
            # Never fabricated — only populated by a real ANPR read.
            "plate": None,
            "source": "INGESTED_VIDEO_TRACK",
        }


def _extract_blobs(mask: np.ndarray, roi: Optional[np.ndarray] = None) -> List[Blob]:
    """
    Foreground mask -> de-duplicated blob descriptors.

    Blobs covering most of the ROI are rejected: those are un-converged
    background or a global lighting change, not a vehicle.
    """
    kernel = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=2)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    max_area = float(mask.shape[0] * mask.shape[1]) * MAX_BLOB_AREA_FRACTION

    blobs: List[Blob] = []
    for contour in contours:
        area = float(cv2.contourArea(contour))
        if area < MIN_BLOB_AREA_PX or area > max_area:
            continue
        x, y, w, h = cv2.boundingRect(contour)
        if w <= 0 or h <= 0:
            continue
        # Moment-based centroid is more stable than the bbox centre for
        # irregular vehicle shapes.
        m = cv2.moments(contour)
        if m["m00"] > 0:
            cx = m["m10"] / m["m00"]
            cy = m["m01"] / m["m00"]
        else:
            cx, cy = x + w / 2.0, y + h / 2.0
        blobs.append(Blob(cx=cx, cy=cy, w=float(w), h=float(h), area=area))
    return _merge_fragmented_blobs(blobs)


def _merge_fragmented_blobs(blobs: List[Blob]) -> List[Blob]:
    """
    Recombine pieces of a single vehicle that motion noise split apart.

    A vehicle's foreground mask often fragments (shadows, hollow interiors,
    compression artefacts) into two or three nearby blobs with the same lateral
    offset. Counting those as separate vehicles inflates every downstream
    number, so blobs that are close along the corridor and share a lateral
    position are merged into their union box.
    """
    if len(blobs) <= 1:
        return blobs

    remaining = sorted(blobs, key=lambda b: b.cy)
    merged: List[Blob] = []

    for blob in remaining:
        absorbed = False
        for existing in merged:
            # Only merge blobs in the same lateral stripe: a genuinely
            # different vehicle in an adjacent lane must stay separate.
            if abs(existing.cx - blob.cx) > BLOB_MERGE_LATERAL_PX:
                continue
            # Reasonable bumper-to-bumper proximity for one object.
            gap = max(
                abs(existing.cy - blob.cy) - (existing.h + blob.h) / 2.0,
                0.0,
            )
            if gap > BLOB_MERGE_GAP_PX:
                continue
            # Merged area must stay plausible for a single vehicle.
            new_area = existing.area + blob.area
            if new_area > MAX_MERGED_BLOB_AREA_PX:
                continue

            existing.cx = (existing.cx * existing.area + blob.cx * blob.area) / new_area
            existing.cy = (existing.cy * existing.area + blob.cy * blob.area) / new_area
            existing.w = max(existing.w, blob.w)
            existing.h = max(existing.h, blob.h)
            existing.area = new_area
            absorbed = True
            break
        if not absorbed:
            merged.append(blob)

    return merged


def _blobs_to_positions(
    blobs: List[Blob], corridor: str, width: int, height: int
) -> List[Tuple[float, float, float, float]]:
    """
    Convert ROI pixel blobs into (pos, lateral, length_m, width_m) tuples.

    NS corridor: vehicles travel north->south, so vertical position is the
    longitudinal axis and horizontal position is lateral.
    EW corridor: vehicles travel west->east, so horizontal is longitudinal and
    vertical is lateral.
    """
    out: List[Tuple[float, float, float, float]] = []
    for b in blobs:
        if corridor == "NS":
            # NS travels north->south: vertical is longitudinal.
            pos_px, lat_px = b.cy, b.cx
            length_px, width_px = b.h, b.w
            along_px, across_px = max(1.0, height), max(1.0, width)
        else:
            # EW travels west->east: horizontal is longitudinal.
            pos_px, lat_px = b.cx, b.cy
            length_px, width_px = b.w, b.h
            along_px, across_px = max(1.0, width), max(1.0, height)

        pos = max(0.0, min(1.0, pos_px / along_px))
        # Lateral is a 0..1 position ACROSS the corridor half, centred on the
        # road. Multiplying by 2.0 (as this once did) pushed every vehicle to
        # or past 1.0 and destroyed the distinction between lanes.
        lat = max(0.0, min(1.0, lat_px / across_px))

        # Pixel extent -> a plausible metric extent. The corridor half is
        # treated as spanning the reference corridor length.
        meters_per_px = CORRIDOR_LENGTH_M / along_px
        length_m = max(0.6, min(12.0, length_px * meters_per_px))
        width_m = max(0.5, min(4.0, width_px * meters_per_px))
        out.append((pos, lat, length_m, width_m))
    return out


def track_corridor(
    corridor: str,
    per_frame_positions: List[List[Tuple[float, float, float, float]]],
    frame_indices: List[int],
) -> List[Track]:
    """
    Greedy nearest-neighbour association of per-frame detections into tracks.

    For each frame, every unassociated detection is matched to the nearest
    existing track within MAX_ASSOCIATION_DISTANCE; matches update the track's
    smoothed position, and leftovers spawn new tracks. Tracks not seen for
    MAX_TRACK_GAP_FRAMES are retired.
    """
    active: List[Track] = []
    finished: List[Track] = []
    next_id = 1

    # Map each active track to the sample step it was last observed on.
    # Gap comparison must be in sample steps, not raw video frame numbers,
    # because frame_indices are sampled (e.g. 0, 10, 20...), which would
    # immediately exceed MAX_TRACK_GAP_FRAMES (3) on the very next sample.
    last_observed_step: Dict[str, int] = {}

    for step, (frame_pos, frame_index) in enumerate(zip(per_frame_positions, frame_indices)):
        # Retire tracks that have gone unseen for more than MAX_TRACK_GAP_FRAMES sample steps.
        still_active: List[Track] = []
        for t in active:
            unseen_steps = step - last_observed_step.get(t.track_id, step)
            if unseen_steps > MAX_TRACK_GAP_FRAMES:
                finished.append(t)
            else:
                still_active.append(t)
        active = still_active

        used_track_idx: set = set()
        detections = list(frame_pos)

        for det_index, (pos, lat, length_m, width_m) in enumerate(detections):
            best_idx, best_dist = -1, MAX_ASSOCIATION_DISTANCE
            for idx, t in enumerate(active):
                if idx in used_track_idx:
                    continue
                dist = abs(t.pos - pos) + abs(t.lateral - lat) * 0.5
                if dist < best_dist:
                    best_dist = dist
                    best_idx = idx

            if best_idx >= 0:
                matched_track = active[best_idx]
                matched_track.update(pos, lat, width_m, length_m, frame_index)
                last_observed_step[matched_track.track_id] = step
                used_track_idx.add(best_idx)
            else:
                if len(active) >= MAX_TRACKS_PER_CORRIDOR:
                    continue
                track = Track(
                    track_id=f"TRK-{corridor}-{next_id:04d}",
                    corridor=corridor,
                    size_class="medium",
                    pos=pos,
                    lateral=lat,
                    width=width_m,
                    length=length_m,
                    observations=1,
                    first_frame_index=frame_index,
                    last_frame_index=frame_index,
                    _prev_pos=pos,
                )
                last_observed_step[track.track_id] = step
                next_id += 1
                active.append(track)

    finished.extend(active)
    return finished


def analyze_video_vehicles(file_path: str, max_tracks: int = 60) -> Dict:
    """
    Full-file pass producing positioned vehicles for the minimap.

    Mirrors the sampling strategy in `video_ingest.analyze_video_file` so the
    two analyses of the same file cover the same window of the timeline.
    """
    from backend.services.video_ingest import _reset_subtractor  # noqa: F401  (kept for symmetry)

    cap = cv2.VideoCapture(file_path)
    if not cap.isOpened():
        cap.release()
        return {
            "success": False,
            "error": "Could not open the uploaded file as a video.",
            "source": "DECODE_FAILED",
            "vehicles": [],
        }

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    sample_indices = _pick_sample_frame_indices(total_frames, 300)
    sample_set = set(sample_indices)

    per_corridor: Dict[str, List[List[Tuple[float, float, float, float]]]] = {"NS": [], "EW": []}
    # Frame indices that actually produced detections, parallel to the
    # per_corridor lists — the tracker associates across these, so the two must
    # stay aligned.
    used_frame_indices: List[int] = []
    frames_read = 0
    size_votes: Dict[str, List[str]] = {"NS": [], "EW": []}

    subtractor_ns = cv2.createBackgroundSubtractorMOG2(
        history=MOG2_HISTORY, varThreshold=MOG2_VAR_THRESHOLD, detectShadows=False
    )
    subtractor_ew = cv2.createBackgroundSubtractorMOG2(
        history=MOG2_HISTORY, varThreshold=MOG2_VAR_THRESHOLD, detectShadows=False
    )

    try:
        # Decode SEQUENTIALLY, not by seeking: MOG2 needs temporally adjacent
        # frames to converge. Seeking makes every sampled frame the model's
        # first frame, so 100% of pixels read as foreground and the whole frame
        # collapses into one blob.
        for idx in range(total_frames):
            ok, frame = cap.read()
            if not ok or frame is None:
                break

            is_warmup = idx < MOG2_WARMUP_FRAMES
            is_sample = idx in sample_set

            # Feed all contiguous warmup frames to MOG2 to converge the background model.
            # After warmup, process only the sampled frames to bound runtime.
            if not is_warmup and not is_sample:
                continue
            frames_read += 1

            height, width = frame.shape[:2]
            mid_x = width // 2
            rois = (("NS", frame[:, :mid_x], subtractor_ns), ("EW", frame[:, mid_x:], subtractor_ew))

            frame_blobs: Dict[str, List[Blob]] = {}
            for corridor, roi, subtractor in rois:
                if roi.size == 0:
                    frame_blobs[corridor] = []
                    continue
                mask = subtractor.apply(roi)
                if is_warmup:
                    # Still training; emit no detections for this frame.
                    frame_blobs[corridor] = []
                    continue
                blobs = _extract_blobs(mask, roi)
                frame_blobs[corridor] = blobs
                size_votes[corridor].extend(b.size_class for b in blobs)

            if not is_warmup:
                used_frame_indices.append(idx)
                for corridor in ("NS", "EW"):
                    roi_width = (mid_x if corridor == "NS" else width - mid_x) or 1
                    roi_height = height or 1
                    per_corridor[corridor].append(
                        _blobs_to_positions(frame_blobs[corridor], corridor, roi_width, roi_height)
                    )
    finally:
        cap.release()

    vehicles: List[Dict] = []
    for corridor in ("NS", "EW"):
        # `used_frame_indices` — not `sample_indices` — keeps the detection
        # lists and their frame indices aligned: warm-up frames contribute an
        # empty detection list but no timestamp.
        tracks = track_corridor(corridor, per_corridor[corridor], used_frame_indices)
        # Prefer tracks seen on more than one frame; a single-frame detection is
        # usually a shadow or a momentary lighting artefact.
        tracks = [t for t in tracks if t.observations >= 2]
        # Assign the dominant size class observed in this corridor.
        if size_votes[corridor]:
            dominant = max(set(size_votes[corridor]), key=size_votes[corridor].count)
            for t in tracks:
                t.size_class = dominant
        tracks.sort(key=lambda t: (t.corridor, t.pos))
        for t in tracks:
            vehicles.append(t.to_minimap_entity())
            if len(vehicles) >= max_tracks:
                break

    ns_count = sum(1 for v in vehicles if v["corridor"] == "NS")
    ew_count = sum(1 for v in vehicles if v["corridor"] == "EW")

    return {
        "success": True,
        "source": "INGESTED_VIDEO_TRACKING",
        "frames_in_file": total_frames,
        "frames_sampled": frames_read,
        "fps_reported": round(fps, 2) if fps else None,
        "duration_sec": round(total_frames / fps, 2) if fps > 0 and total_frames else None,
        "total_tracks": len(vehicles),
        "tracks_ns": ns_count,
        "tracks_ew": ew_count,
        "vehicles": vehicles,
        "limitations": (
            "Vehicle positions come from classical MOG2 background subtraction "
            "with greedy multi-frame association — not a trained object "
            "tracker. Class is a blob-area heuristic, so 'auto' and 'lcv' are "
            "never asserted, and a fast vehicle can be missed between sampled "
            "frames. Plate numbers are null because no OCR was run here."
        ),
    }
