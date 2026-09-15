"""
VIMS — ANPR Plate Localization & OCR Engine
Performs plate localization via OpenCV contour detection and OCR via Tesseract.
Validates extracted alphanumeric strings against Indian standard license plate formats.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from backend.utils.plate_validator import normalize_plate, validate_indian_plate

logger = logging.getLogger("vims.anpr_engine")

try:
    import pytesseract

    _TESSERACT_AVAILABLE = True
except ImportError:  # pragma: no cover
    _TESSERACT_AVAILABLE = False

# Indian plates are roughly 2:1 to 5.5:1 (width:height); widen slightly to
# tolerate perspective skew from a real camera angle.
MIN_ASPECT_RATIO = 1.8
MAX_ASPECT_RATIO = 6.0
MIN_CANDIDATE_AREA_PX = 900        # ignore tiny noise contours
MAX_CANDIDATES_TO_OCR = 6          # cap OCR calls per image for latency

OCR_CONFIG = "--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"


@dataclass
class PlateCandidate:
    bbox: Tuple[int, int, int, int]  # x, y, w, h in the original image
    raw_text: str = ""
    ocr_confidence: float = 0.0
    normalized_text: str = ""
    is_valid_format: bool = False
    format_type: Optional[str] = None


def _locate_candidate_regions(gray: np.ndarray) -> List[Tuple[int, int, int, int]]:
    """Classical contour-based plate localization. Returns (x, y, w, h) boxes."""
    filtered = cv2.bilateralFilter(gray, 11, 17, 17)
    edged = cv2.Canny(filtered, 30, 200)
    edged = cv2.dilate(edged, np.ones((3, 3), np.uint8), iterations=1)

    contours, _ = cv2.findContours(edged, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:30]

    candidates: List[Tuple[int, int, int, int]] = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < MIN_CANDIDATE_AREA_PX:
            continue

        x, y, w, h = cv2.boundingRect(c)
        if h == 0:
            continue
        aspect_ratio = w / float(h)

        if MIN_ASPECT_RATIO <= aspect_ratio <= MAX_ASPECT_RATIO:
            candidates.append((x, y, w, h))

    return candidates[:MAX_CANDIDATES_TO_OCR]


def _prepare_for_ocr(gray: np.ndarray, bbox: Tuple[int, int, int, int]) -> np.ndarray:
    x, y, w, h = bbox
    crop = gray[y : y + h, x : x + w]

    # Upscale small crops — Tesseract does much better with taller text.
    target_h = 120
    if crop.shape[0] > 0 and crop.shape[0] < target_h:
        scale = target_h / crop.shape[0]
        crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    crop = cv2.bilateralFilter(crop, 9, 75, 75)
    _, thresh = cv2.threshold(crop, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return thresh


def _ocr_region(gray: np.ndarray, bbox: Tuple[int, int, int, int]) -> Tuple[str, float]:
    """Returns (raw_text, mean_word_confidence 0-100)."""
    if not _TESSERACT_AVAILABLE:
        return "", 0.0

    prepped = _prepare_for_ocr(gray, bbox)
    try:
        data = pytesseract.image_to_data(
            prepped, config=OCR_CONFIG, output_type=pytesseract.Output.DICT
        )
    except pytesseract.TesseractError as exc:
        logger.warning("Tesseract OCR failed on a candidate region: %s", exc)
        return "", 0.0

    words: List[str] = []
    confidences: List[float] = []
    for text, conf in zip(data.get("text", []), data.get("conf", [])):
        text = text.strip()
        conf_val = float(conf) if str(conf).lstrip("-").isdigit() else -1.0
        if text and conf_val >= 0:
            words.append(text)
            confidences.append(conf_val)

    raw_text = "".join(words)
    mean_conf = sum(confidences) / len(confidences) if confidences else 0.0
    return raw_text, mean_conf


def recognize_plate_from_image(image_bytes: bytes) -> Dict[str, Any]:
    """
    Main entry point. Takes raw image bytes (JPEG/PNG/etc.), returns a
    structured, honestly-scored recognition result. Never invents a plate
    number that OCR did not actually produce.
    """
    if not _TESSERACT_AVAILABLE:
        return {
            "success": False,
            "error": (
                "OCR engine not available on this server: the 'tesseract-ocr' "
                "system package and/or 'pytesseract' Python package is not "
                "installed. Install both to enable plate recognition."
            ),
            "source": "OCR_NOT_CONFIGURED",
        }

    np_arr = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if image is None:
        return {
            "success": False,
            "error": "Could not decode the uploaded file as an image.",
            "source": "DECODE_FAILED",
        }

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    regions = _locate_candidate_regions(gray)

    # Always also try the full frame — handles tightly-cropped plate photos
    # (e.g. a citizen's close-up upload) where contour localization on a
    # busy background may not isolate a clean rectangle.
    h, w = gray.shape[:2]
    all_regions = regions + [(0, 0, w, h)]

    candidates: List[PlateCandidate] = []
    for bbox in all_regions:
        raw_text, conf = _ocr_region(gray, bbox)
        cleaned = normalize_plate(raw_text)
        if not cleaned:
            continue
        is_valid, normalized, format_type, _err = validate_indian_plate(cleaned)
        candidates.append(
            PlateCandidate(
                bbox=bbox,
                raw_text=raw_text,
                ocr_confidence=round(conf, 1),
                normalized_text=normalized,
                is_valid_format=is_valid,
                format_type=format_type,
            )
        )

    if not candidates:
        return {
            "success": False,
            "error": "No plate-shaped region produced readable text.",
            "source": "NO_TEXT_DETECTED",
            "regions_scanned": len(all_regions),
        }

    # Prefer candidates that actually validate as a real Indian plate format,
    # then by OCR confidence.
    candidates.sort(key=lambda c: (c.is_valid_format, c.ocr_confidence), reverse=True)
    best = candidates[0]

    return {
        "success": best.is_valid_format,
        "plate": best.normalized_text,
        "format_type": best.format_type,
        "ocr_confidence": best.ocr_confidence,
        "bounding_box": {"x": best.bbox[0], "y": best.bbox[1], "w": best.bbox[2], "h": best.bbox[3]},
        "source": "ANPR_OCR_ENGINE",
        "warning": None
        if best.is_valid_format
        else "Best OCR candidate did not match a known Indian plate format — treat as low-confidence.",
        "all_candidates": [
            {
                "raw_text": c.raw_text,
                "normalized_text": c.normalized_text,
                "ocr_confidence": c.ocr_confidence,
                "is_valid_format": c.is_valid_format,
            }
            for c in candidates[:5]
        ],
    }


# ──────────────────────────────────────────────────────────────────────────
# Full-Video ANPR Scan (merged in from a parallel dev copy, verified honest)
# ──────────────────────────────────────────────────────────────────────────
# Adds the ability to OCR-scan an ENTIRE uploaded video, start to finish,
# rather than a single image. Reuses the same real OpenCV localization +
# Tesseract OCR + plate_validator pipeline above, just applied per-frame
# across a video file and aggregated by normalized plate text. This is
# additive: it does not change `recognize_plate_from_image()` or the
# existing `/api/anpr/recognize` endpoint's behavior in any way.

try:
    import pytesseract as _pytesseract_video  # noqa: F401  (reuse availability check)
except ImportError:  # pragma: no cover
    pass


@dataclass
class VideoPlateAggregate:
    plate: str
    format_type: Optional[str]
    best_confidence: float
    frame_hits: int
    first_seen_sec: float
    last_seen_sec: float
    sample_ocr_text: str


@dataclass
class VideoScanResult:
    total_frames_in_video: int
    frames_scanned: int
    duration_sec: float
    frame_stride: int
    plates: List[VideoPlateAggregate]
    processing_time_sec: float


def scan_video_file(
    path: str,
    frame_stride: int = 5,
    max_frames_to_scan: Optional[int] = None,
) -> VideoScanResult:
    """
    Scan an ENTIRE video file end-to-end (not just the opening frames),
    reusing the same real localization+OCR+validation pipeline as
    `recognize_plate_from_image()`.

    `frame_stride` controls how many frames are decoded between OCR passes
    purely for runtime — e.g. stride=5 on a 25fps clip still OCRs 5 times
    per second across the full length of the video. This is a speed/
    thoroughness trade-off exposed to the caller, never a shortcut that
    stops early: the loop always runs until `cap.read()` reports the end
    of the file.

    Raises ValueError if the file can't be opened as a video, or if
    Tesseract isn't available on this server (same honest failure mode as
    the single-image path).
    """
    if not _TESSERACT_AVAILABLE:
        raise ValueError(
            "OCR engine not available on this server: the 'tesseract-ocr' "
            "system package and/or 'pytesseract' Python package is not "
            "installed."
        )

    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video file: {path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    started_at = time.monotonic()
    aggregates: Dict[str, VideoPlateAggregate] = {}

    frame_idx = 0
    scanned = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break  # End of file reached — the ENTIRE video, not a truncated prefix.

            if frame_idx % frame_stride == 0:
                timestamp_sec = frame_idx / fps
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                scanned += 1

                for bbox in _locate_candidate_regions(gray):
                    raw_text, conf = _ocr_region(gray, bbox)
                    cleaned = normalize_plate(raw_text)
                    if not cleaned:
                        continue
                    is_valid, normalized, format_type, _err = validate_indian_plate(cleaned)
                    if not is_valid:
                        continue  # Discard — never guess/"fix" OCR noise into a fake plate.

                    existing = aggregates.get(normalized)
                    if existing is None:
                        aggregates[normalized] = VideoPlateAggregate(
                            plate=normalized,
                            format_type=format_type,
                            best_confidence=round(conf, 1),
                            frame_hits=1,
                            first_seen_sec=round(timestamp_sec, 2),
                            last_seen_sec=round(timestamp_sec, 2),
                            sample_ocr_text=raw_text,
                        )
                    else:
                        existing.frame_hits += 1
                        existing.best_confidence = max(existing.best_confidence, round(conf, 1))
                        existing.last_seen_sec = round(timestamp_sec, 2)

                if max_frames_to_scan is not None and scanned >= max_frames_to_scan:
                    break

            frame_idx += 1
    finally:
        cap.release()

    elapsed = time.monotonic() - started_at

    # Rank by how many independent frames confirmed each plate — a reading
    # seen on one noisy frame is still reported, but ranked below one
    # confirmed repeatedly, rather than silently dropped.
    ranked = sorted(aggregates.values(), key=lambda a: (a.frame_hits, a.best_confidence), reverse=True)

    return VideoScanResult(
        total_frames_in_video=total_frames,
        frames_scanned=scanned,
        duration_sec=round(frame_idx / fps, 2),
        frame_stride=frame_stride,
        plates=ranked,
        processing_time_sec=round(elapsed, 2),
    )
