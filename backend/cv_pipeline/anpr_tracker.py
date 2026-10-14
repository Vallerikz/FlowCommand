"""
FlowCommand SIH26127 — Multi-condition Indian ANPR and fuzzy trajectory linker.

Handles monsoon glare, motion blur, and low-light plate crops, then links
noisy OCR reads across Pune smart-intersection cameras using Levenshtein
matching plus spatiotemporal velocity feasibility on the road graph.
"""

from __future__ import annotations

import json
import logging
import math
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

logger = logging.getLogger("flowcommand.anpr_tracker")

INDIAN_PLATE_RE = re.compile(r"^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$")
PRIORITY_PREFIXES = ("MH12", "MH14")
CONFUSION_TO_DIGIT = {"O": "0", "Q": "0", "D": "0", "I": "1", "L": "1", "|": "1", "B": "8", "S": "5", "Z": "2", "G": "6"}
CONFUSION_TO_LETTER = {"0": "O", "1": "I", "8": "B", "5": "S", "2": "Z", "6": "G"}
WILDCARD_CHARS = {"_", "?", "*"}

MIN_VELOCITY_KMH = 5.0
MAX_VELOCITY_KMH = 95.0
MAX_EDIT_DISTANCE = 2

MIN_ASPECT_RATIO = 1.8
MAX_ASPECT_RATIO = 6.2
MIN_CANDIDATE_AREA_PX = 800
MAX_CANDIDATES_TO_OCR = 8
OCR_CONFIG = "--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

_DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "pune_intersections.json"
_SIGHTING_LOCK = threading.Lock()
_SIGHTING_LOG: List[Dict[str, Any]] = []
_LAST_TRACK: Dict[Tuple[str, str], Dict[str, Any]] = {}
_GRAPH_CACHE: Optional[Dict[str, Any]] = None

try:
    import pytesseract

    pytesseract.get_tesseract_version()
    _TESSERACT_AVAILABLE = True
except Exception as exc:  # pragma: no cover - environment dependent
    _TESSERACT_AVAILABLE = False
    logger.warning("Tesseract unavailable for ANPR tracker: %s", exc)


# ---------------------------------------------------------------------------
# Registry / road graph
# ---------------------------------------------------------------------------

def _haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    r = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    h = math.sin(dphi / 2.0) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2.0) ** 2
    return 2.0 * r * math.asin(min(1.0, math.sqrt(h)))


def load_intersection_registry(path: Optional[Path] = None) -> Dict[str, Any]:
    """Load the Pune smart-intersection registry (coordinates + road graph)."""
    global _GRAPH_CACHE
    target = Path(path) if path else _DATA_PATH
    if _GRAPH_CACHE is not None and path is None:
        return _GRAPH_CACHE
    if not target.exists():
        logger.warning("Intersection registry missing at %s", target)
        data = {"intersections": [], "road_graph": {"edges": []}}
    else:
        with target.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
    by_id: Dict[str, Dict[str, Any]] = {}
    for item in data.get("intersections", []):
        by_id[str(item["id"])] = item
    adj: Dict[str, List[Tuple[str, float]]] = {k: [] for k in by_id}
    for edge in data.get("road_graph", {}).get("edges", []):
        a, b = str(edge["from"]), str(edge["to"])
        dist = float(edge.get("distance_m") or 0.0)
        if dist <= 0.0 and a in by_id and b in by_id:
            c1, c2 = by_id[a]["coordinates_wgs84"], by_id[b]["coordinates_wgs84"]
            dist = _haversine_m(c1[0], c1[1], c2[0], c2[1]) * 1.35
        adj.setdefault(a, []).append((b, dist))
        if not edge.get("one_way"):
            adj.setdefault(b, []).append((a, dist))
    packed = {"raw": data, "by_id": by_id, "adj": adj}
    if path is None:
        _GRAPH_CACHE = packed
    return packed


def road_distance_m(junction_a: str, junction_b: str) -> float:
    """Shortest-path road distance in metres between two registry junctions."""
    if junction_a == junction_b:
        return 0.0
    graph = load_intersection_registry()
    adj = graph["adj"]
    if junction_a not in adj or junction_b not in adj:
        by_id = graph["by_id"]
        if junction_a in by_id and junction_b in by_id:
            c1, c2 = by_id[junction_a]["coordinates_wgs84"], by_id[junction_b]["coordinates_wgs84"]
            return _haversine_m(c1[0], c1[1], c2[0], c2[1]) * 1.35
        return float("inf")
    inf = float("inf")
    dist = {node: inf for node in adj}
    dist[junction_a] = 0.0
    visited = set()
    while True:
        u = None
        best = inf
        for node, d in dist.items():
            if node not in visited and d < best:
                u, best = node, d
        if u is None or u == junction_b:
            break
        visited.add(u)
        for v, w in adj.get(u, []):
            nd = dist[u] + w
            if nd < dist.get(v, inf):
                dist[v] = nd
    return dist.get(junction_b, inf)


def shortest_path(junction_a: str, junction_b: str) -> List[str]:
    """Dijkstra node path including endpoints. Empty if unreachable."""
    if junction_a == junction_b:
        return [junction_a]
    graph = load_intersection_registry()
    adj = graph["adj"]
    inf = float("inf")
    dist = {node: inf for node in adj}
    prev: Dict[str, Optional[str]] = {node: None for node in adj}
    dist[junction_a] = 0.0
    visited = set()
    while True:
        u = None
        best = inf
        for node, d in dist.items():
            if node not in visited and d < best:
                u, best = node, d
        if u is None:
            break
        if u == junction_b:
            break
        visited.add(u)
        for v, w in adj.get(u, []):
            nd = dist[u] + w
            if nd < dist.get(v, inf):
                dist[v] = nd
                prev[v] = u
    if dist.get(junction_b, inf) == inf:
        return []
    path = [junction_b]
    cur = junction_b
    while cur != junction_a:
        cur = prev.get(cur)  # type: ignore[assignment]
        if cur is None:
            return []
        path.append(cur)
    path.reverse()
    return path


# ---------------------------------------------------------------------------
# Plate preprocess + OCR
# ---------------------------------------------------------------------------

def preprocess_plate_crop(crop_bgr: Any) -> Any:
    """
    CLAHE + bilateral + unsharp pipeline for Indian monsoon glare, blur, low light.

    CLAHE uses clipLimit=3.0 and tileGridSize=(8, 8) on the L channel.
    """
    import cv2
    import numpy as np

    if crop_bgr is None or not isinstance(crop_bgr, np.ndarray) or crop_bgr.size == 0:
        return crop_bgr
    img = crop_bgr
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    h, w = img.shape[:2]
    if h < 48 or w < 96:
        scale = max(48.0 / max(h, 1), 96.0 / max(w, 1), 1.5)
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)

    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l_ch, a_ch, b_ch = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l_ch = clahe.apply(l_ch)
    img = cv2.cvtColor(cv2.merge((l_ch, a_ch, b_ch)), cv2.COLOR_LAB2BGR)
    img = cv2.bilateralFilter(img, d=9, sigmaColor=75, sigmaSpace=75)
    blur = cv2.GaussianBlur(img, (0, 0), sigmaX=1.4)
    sharp = cv2.addWeighted(img, 1.65, blur, -0.65, 0)
    return np.clip(sharp, 0, 255).astype(np.uint8)


def _strip_plate(raw_text: str) -> str:
    if not raw_text:
        return ""
    return re.sub(r"[^A-Z0-9_?*]", "", str(raw_text).upper())


def _apply_slot_confusion(body: str) -> str:
    """Force letters in RTO/series slots and digits in district/number slots."""
    if len(body) < 7:
        return body
    last4 = body[-4:]
    head = body[:-4]
    if len(head) < 3:
        return body
    letters = 2
    digits = 1 if len(head) in (3, 5) else 2
    series_len = len(head) - letters - digits
    if series_len < 1:
        digits = max(1, len(head) - letters - 1)
        series_len = len(head) - letters - digits
    chars = list(head + last4)
    for i, ch in enumerate(chars):
        if i < letters or (letters + digits <= i < letters + digits + series_len):
            chars[i] = CONFUSION_TO_LETTER.get(ch, ch) if ch.isdigit() else ch
        else:
            chars[i] = CONFUSION_TO_DIGIT.get(ch, ch) if ch.isalpha() else ch
    return "".join(chars)


def _priority_boost(plate: str, base: float) -> float:
    for prefix in PRIORITY_PREFIXES:
        if plate.startswith(prefix):
            return min(1.0, base + 0.08)
    return base


def _candidate_plates(cleaned: str) -> List[str]:
    variants = {cleaned, _apply_slot_confusion(cleaned)}
    if cleaned.startswith("MH") and len(cleaned) >= 4:
        district = list(cleaned[2:4])
        for i, ch in enumerate(district):
            district[i] = CONFUSION_TO_DIGIT.get(ch, ch)
        mutated = cleaned[:2] + "".join(district) + cleaned[4:]
        variants.add(mutated)
        variants.add(_apply_slot_confusion(mutated))
        # Prefer Pune / PCMC districts when the tens digit is confusable.
        if mutated[2:4] not in ("12", "14"):
            for pref in ("12", "14"):
                variants.add("MH" + pref + cleaned[4:])
                variants.add(_apply_slot_confusion("MH" + pref + cleaned[4:]))
    return [v for v in variants if v]


def normalize_indian_plate(raw_text: str) -> Tuple[str, float]:
    """
    Enforce standard Indian RTO regex with OCR confusion correction.

    Prioritises MH12 (Pune RTO) and MH14 (PCMC) prefixes.
    Returns (normalised_plate, confidence in [0, 1]).
    """
    cleaned = _strip_plate(raw_text)
    if not cleaned:
        return "", 0.0
    if INDIAN_PLATE_RE.match(cleaned):
        conf = 0.97 if cleaned.startswith(PRIORITY_PREFIXES) else 0.90
        return cleaned, conf

    best_plate = cleaned
    best_conf = 0.0
    for cand in _candidate_plates(cleaned):
        if INDIAN_PLATE_RE.match(cand):
            edits = levenshtein(cleaned.replace("_", ""), cand)
            conf = max(0.35, 0.93 - 0.12 * edits)
            conf = _priority_boost(cand, conf)
            score = conf + (0.05 if cand.startswith(PRIORITY_PREFIXES) else 0.0)
            if score > best_conf:
                best_plate, best_conf = cand, conf
    if best_conf > 0.0:
        return best_plate, round(min(1.0, best_conf), 4)

    slotted = _apply_slot_confusion(cleaned)
    if INDIAN_PLATE_RE.match(slotted):
        return slotted, _priority_boost(slotted, 0.62)
    return cleaned, 0.15 if any(ch in WILDCARD_CHARS for ch in cleaned) else 0.05


def levenshtein(a: str, b: str) -> int:
    """Classic Levenshtein edit distance; wildcards match any single character."""
    s, t = (a or "").upper(), (b or "").upper()
    if s == t:
        return 0
    if not s:
        return len(t)
    if not t:
        return len(s)
    prev = list(range(len(t) + 1))
    for i, ca in enumerate(s, start=1):
        cur = [i]
        for j, cb in enumerate(t, start=1):
            cost = 0 if ca == cb or ca in WILDCARD_CHARS or cb in WILDCARD_CHARS else 1
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost))
        prev = cur
    return prev[-1]


# ---------------------------------------------------------------------------
# Frame ANPR
# ---------------------------------------------------------------------------

def _locate_plate_regions(gray: Any) -> List[Tuple[int, int, int, int]]:
    import cv2

    filtered = cv2.bilateralFilter(gray, 11, 17, 17)
    edged = cv2.Canny(filtered, 30, 200)
    edged = cv2.dilate(edged, np.ones((3, 3), np.uint8), iterations=1)
    contours, _ = cv2.findContours(edged, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:40]
    boxes: List[Tuple[int, int, int, int]] = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < MIN_CANDIDATE_AREA_PX:
            continue
        x, y, w, h = cv2.boundingRect(contour)
        if h <= 0:
            continue
        aspect = w / float(h)
        if MIN_ASPECT_RATIO <= aspect <= MAX_ASPECT_RATIO:
            boxes.append((x, y, w, h))
    return boxes[:MAX_CANDIDATES_TO_OCR]


def _ocr_crop(crop_bgr: Any) -> Tuple[str, float]:
    import cv2

    if not _TESSERACT_AVAILABLE:
        return "", 0.0
    enhanced = preprocess_plate_crop(crop_bgr)
    gray = cv2.cvtColor(enhanced, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    try:
        data = pytesseract.image_to_data(
            thresh, config=OCR_CONFIG, output_type=pytesseract.Output.DICT
        )
    except Exception as exc:  # pragma: no cover
        logger.warning("OCR failed: %s", exc)
        return "", 0.0
    words: List[str] = []
    confs: List[float] = []
    for text, conf in zip(data.get("text", []), data.get("conf", [])):
        text = str(text).strip()
        try:
            conf_val = float(conf)
        except (TypeError, ValueError):
            conf_val = -1.0
        if text and conf_val >= 0:
            words.append(text)
            confs.append(conf_val)
    raw = "".join(words)
    mean_conf = (sum(confs) / len(confs) / 100.0) if confs else 0.0
    return raw, float(mean_conf)


def _classify_vehicle(w: int, h: int, frame_h: int) -> str:
    area = w * h
    rel = area / max(float(frame_h * frame_h), 1.0)
    aspect = w / float(max(h, 1))
    if rel > 0.12:
        return "Bus" if aspect > 1.6 else "Truck"
    if rel > 0.045 and aspect < 1.35:
        return "3W"
    if rel < 0.012 or (aspect > 2.4 and h < frame_h * 0.12):
        return "2W"
    return "Car"


def _parse_timestamp(timestamp: str) -> datetime:
    raw = (timestamp or "").strip()
    if not raw:
        return datetime.now(timezone.utc)
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        try:
            dt = datetime.strptime(raw, "%Y-%m-%dT%H:%M:%S")
        except ValueError:
            return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _estimate_speed(
    junction_id: str,
    plate: str,
    bbox: Sequence[int],
    timestamp: str,
) -> float:
    key = (junction_id, plate)
    x1, y1, x2, y2 = [int(v) for v in bbox]
    cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
    width_px = max(x2 - x1, 1)
    metres_per_px = 0.52 / float(width_px)  # Indian passenger-car plate ~520 mm
    t = _parse_timestamp(timestamp)
    with _SIGHTING_LOCK:
        prev = _LAST_TRACK.get(key)
        _LAST_TRACK[key] = {"cx": cx, "cy": cy, "t": t}
    if not prev:
        return 0.0
    dt = (t - prev["t"]).total_seconds()
    if dt <= 0.05:
        return 0.0
    dist_m = math.hypot(cx - prev["cx"], cy - prev["cy"]) * metres_per_px
    kmh = (dist_m / dt) * 3.6
    return round(float(min(max(kmh, 0.0), 140.0)), 2)


def record_sighting(
    plate_raw: str,
    plate_matched: str,
    junction_id: str,
    timestamp: str,
    ocr_confidence: float,
    vehicle_class: str = "Car",
    speed_kmh: float = 0.0,
    bbox: Optional[List[int]] = None,
    edit_distance: int = 0,
) -> Dict[str, Any]:
    """Append a camera sighting used later by reconstruct_trajectory()."""
    graph = load_intersection_registry()
    node = graph["by_id"].get(junction_id, {})
    coords = list(node.get("coordinates_wgs84") or [0.0, 0.0, 0.0])
    rec = {
        "plate_raw": plate_raw,
        "plate_matched": plate_matched,
        "junction_id": junction_id,
        "timestamp": timestamp,
        "ocr_confidence": float(ocr_confidence),
        "vehicle_class": vehicle_class,
        "speed_kmh": float(speed_kmh),
        "bbox": bbox or [0, 0, 0, 0],
        "edit_distance": int(edit_distance),
        "coordinates_wgs84": coords,
        "name": node.get("name", junction_id),
    }
    with _SIGHTING_LOCK:
        _SIGHTING_LOG.append(rec)
    return rec


def reset_sighting_log() -> None:
    with _SIGHTING_LOCK:
        _SIGHTING_LOG.clear()
        _LAST_TRACK.clear()


def get_sighting_log() -> List[Dict[str, Any]]:
    with _SIGHTING_LOCK:
        return list(_SIGHTING_LOG)


def process_frame_anpr(frame: Any, junction_id: str, timestamp: str) -> List[Dict[str, Any]]:
    """
    Localise plates, OCR them, normalise to Indian RTO format, and log sightings.

    Returns a list of dicts:
      plate_raw, plate_matched, edit_distance, ocr_confidence,
      vehicle_class, speed_kmh, bbox [x1, y1, x2, y2]
    """
    import cv2
    import numpy as np

    if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0:
        return []
    img = frame
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(gray)
    regions = _locate_plate_regions(gray)
    h, w = img.shape[:2]
    results: List[Dict[str, Any]] = []
    for x, y, bw, bh in regions:
        x1, y1 = max(0, x), max(0, y)
        x2, y2 = min(w, x + bw), min(h, y + bh)
        crop = img[y1:y2, x1:x2]
        raw, ocr_conf = _ocr_crop(crop)
        if not raw:
            continue
        matched, norm_conf = normalize_indian_plate(raw)
        cleaned = _strip_plate(raw)
        dist = levenshtein(cleaned, matched) if matched else len(cleaned)
        conf = round(max(0.0, min(1.0, 0.55 * ocr_conf + 0.45 * norm_conf)), 4)
        vclass = _classify_vehicle(bw, bh, h)
        bbox = [int(x1), int(y1), int(x2), int(y2)]
        speed = _estimate_speed(junction_id, matched or cleaned, bbox, timestamp)
        rec = {
            "plate_raw": raw,
            "plate_matched": matched,
            "edit_distance": int(dist),
            "ocr_confidence": conf,
            "vehicle_class": vclass,
            "speed_kmh": speed,
            "bbox": bbox,
        }
        results.append(rec)
        record_sighting(
            plate_raw=raw,
            plate_matched=matched,
            junction_id=junction_id,
            timestamp=timestamp,
            ocr_confidence=conf,
            vehicle_class=vclass,
            speed_kmh=speed,
            bbox=bbox,
            edit_distance=int(dist),
        )
    return results


# ---------------------------------------------------------------------------
# Trajectory reconstruction
# ---------------------------------------------------------------------------

def velocity_kmh(junction_a: str, junction_b: str, t_a: datetime, t_b: datetime) -> float:
    dt_h = abs((t_b - t_a).total_seconds()) / 3600.0
    if dt_h <= 1e-9:
        return float("inf")
    dist_km = road_distance_m(junction_a, junction_b) / 1000.0
    if not math.isfinite(dist_km):
        return float("inf")
    return dist_km / dt_h


def is_velocity_feasible(
    junction_a: str,
    junction_b: str,
    timestamp_a: str,
    timestamp_b: str,
    vmin: float = MIN_VELOCITY_KMH,
    vmax: float = MAX_VELOCITY_KMH,
) -> bool:
    """True iff implied road speed v_ij = d_road / dt is inside [vmin, vmax] km/h."""
    if junction_a == junction_b:
        return True
    t0, t1 = _parse_timestamp(timestamp_a), _parse_timestamp(timestamp_b)
    speed = velocity_kmh(junction_a, junction_b, t0, t1)
    return vmin <= speed <= vmax


def _lerp_coord(c0: Sequence[float], c1: Sequence[float], u: float) -> List[float]:
    return [
        float(c0[0]) + (float(c1[0]) - float(c0[0])) * u,
        float(c0[1]) + (float(c1[1]) - float(c0[1])) * u,
        float(c0[2] if len(c0) > 2 else 0.0)
        + (float(c1[2] if len(c1) > 2 else 0.0) - float(c0[2] if len(c0) > 2 else 0.0)) * u,
    ]


def reconstruct_trajectory(plate_query: str) -> Dict[str, Any]:
    """
    Match historical sightings with edit distance <= 2 and feasible velocity.

    Returns a GeoJSON FeatureCollection of Point (camera sightings) and
    LineString features tagged confirmed vs interpolated.
    """
    query, _ = normalize_indian_plate(plate_query)
    query_cmp = query or _strip_plate(plate_query)
    with _SIGHTING_LOCK:
        pool = list(_SIGHTING_LOG)
    matched: List[Dict[str, Any]] = []
    for rec in pool:
        cand = rec.get("plate_matched") or rec.get("plate_raw") or ""
        raw = rec.get("plate_raw") or ""
        d = min(levenshtein(query_cmp, str(cand)), levenshtein(query_cmp, _strip_plate(str(raw))))
        if d <= MAX_EDIT_DISTANCE:
            item = dict(rec)
            item["query_edit_distance"] = d
            matched.append(item)
    matched.sort(key=lambda r: _parse_timestamp(str(r.get("timestamp", ""))))

    features: List[Dict[str, Any]] = []
    for rec in matched:
        coords = list(rec.get("coordinates_wgs84") or [0.0, 0.0, 0.0])
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": coords},
                "properties": {
                    "feature_kind": "camera_sighting",
                    "junction_id": rec.get("junction_id"),
                    "name": rec.get("name"),
                    "plate_raw": rec.get("plate_raw"),
                    "plate_matched": rec.get("plate_matched"),
                    "ocr_confidence": rec.get("ocr_confidence"),
                    "timestamp": rec.get("timestamp"),
                    "edit_distance": rec.get("query_edit_distance", rec.get("edit_distance", 0)),
                    "vehicle_class": rec.get("vehicle_class"),
                    "speed_kmh": rec.get("speed_kmh"),
                },
            }
        )

    graph = load_intersection_registry()
    by_id = graph["by_id"]
    confirmed_hops = 0
    interpolated_hops = 0
    for i in range(len(matched) - 1):
        a, b = matched[i], matched[i + 1]
        ja, jb = str(a["junction_id"]), str(b["junction_id"])
        if ja == jb:
            continue
        if not is_velocity_feasible(ja, jb, str(a["timestamp"]), str(b["timestamp"])):
            continue
        path = shortest_path(ja, jb)
        if len(path) < 2:
            path = [ja, jb]
        t0 = _parse_timestamp(str(a["timestamp"]))
        t1 = _parse_timestamp(str(b["timestamp"]))
        span = max((t1 - t0).total_seconds(), 1.0)
        # Cumulative road lengths along path for interpolation knots.
        seg_d = [road_distance_m(path[k], path[k + 1]) for k in range(len(path) - 1)]
        total_d = sum(seg_d) or 1.0
        cum = 0.0
        for k, (u, v) in enumerate(zip(path[:-1], path[1:])):
            c_u = list(by_id.get(u, {}).get("coordinates_wgs84") or a.get("coordinates_wgs84"))
            c_v = list(by_id.get(v, {}).get("coordinates_wgs84") or b.get("coordinates_wgs84"))
            is_direct_observed = (u == ja and v == jb) or (len(path) == 2)
            segment_type = "confirmed" if is_direct_observed else "interpolated"
            if segment_type == "confirmed":
                confirmed_hops += 1
            else:
                interpolated_hops += 1
            t_start = (t0.timestamp() + span * (cum / total_d))
            cum += seg_d[k]
            t_end = (t0.timestamp() + span * (cum / total_d))
            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": [c_u, c_v]},
                    "properties": {
                        "feature_kind": "trajectory_segment",
                        "segment_type": segment_type,
                        "from_junction": u,
                        "to_junction": v,
                        "distance_m": round(seg_d[k], 1),
                        "v_kmh": round(
                            velocity_kmh(
                                ja,
                                jb,
                                t0,
                                t1,
                            ),
                            2,
                        ),
                        "t_start": datetime.fromtimestamp(t_start, tz=timezone.utc).isoformat(),
                        "t_end": datetime.fromtimestamp(t_end, tz=timezone.utc).isoformat(),
                        "plate_query": query_cmp,
                    },
                }
            )
            if segment_type == "interpolated" and v != jb:
                u_frac = cum / total_d
                features.append(
                    {
                        "type": "Feature",
                        "geometry": {"type": "Point", "coordinates": c_v},
                        "properties": {
                            "feature_kind": "interpolated_fix",
                            "junction_id": v,
                            "name": by_id.get(v, {}).get("name", v),
                            "ocr_confidence": None,
                            "timestamp": datetime.fromtimestamp(
                                t0.timestamp() + span * u_frac, tz=timezone.utc
                            ).isoformat(),
                            "segment_type": "interpolated",
                            "plate_query": query_cmp,
                        },
                    }
                )

    return {
        "type": "FeatureCollection",
        "properties": {
            "plate_query": plate_query,
            "plate_normalized": query_cmp,
            "sightings": len(matched),
            "confirmed_segments": confirmed_hops,
            "interpolated_segments": interpolated_hops,
            "max_edit_distance": MAX_EDIT_DISTANCE,
            "velocity_band_kmh": [MIN_VELOCITY_KMH, MAX_VELOCITY_KMH],
        },
        "features": features,
    }


__all__ = [
    "INDIAN_PLATE_RE",
    "MAX_EDIT_DISTANCE",
    "MAX_VELOCITY_KMH",
    "MIN_VELOCITY_KMH",
    "get_sighting_log",
    "is_velocity_feasible",
    "levenshtein",
    "load_intersection_registry",
    "normalize_indian_plate",
    "preprocess_plate_crop",
    "process_frame_anpr",
    "record_sighting",
    "reconstruct_trajectory",
    "reset_sighting_log",
    "road_distance_m",
    "shortest_path",
    "velocity_kmh",
]
