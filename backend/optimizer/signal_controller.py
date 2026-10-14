"""
FlowCommand SIH26127 — Dynamic congestion scorer and Webster signal optimizer.

Indian mixed-traffic PCU weights, composite congestion in [0, 1], and
modified Webster delay-minimising green splits bounded to [15 s, 90 s].
Stale camera feeds fall back to Pune time-of-day baseline splits.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Dict, Mapping, Optional, Tuple

# IRC / MoRTH mixed-traffic PCU equivalence used for Pune ATSC.
PCU_WEIGHTS: Dict[str, float] = {
    "2w": 0.5,
    "2W": 0.5,
    "two_wheeler": 0.5,
    "motorcycle": 0.5,
    "bike": 0.5,
    "3w": 1.0,
    "3W": 1.0,
    "auto": 1.0,
    "three_wheeler": 1.0,
    "rickshaw": 1.0,
    "car": 1.0,
    "Car": 1.0,
    "suv": 1.0,
    "lcv": 1.0,
    "van": 1.0,
    "bus": 3.0,
    "pmpml": 3.0,
    "pmpml_bus": 3.0,
    "truck": 3.0,
    "Bus": 3.0,
    "Truck": 3.0,
    "emergency": 0.0,  # counted via priority override, not density
    "ambulance": 0.0,
}

MIN_GREEN_SEC = 15
MAX_GREEN_SEC = 90
LOST_TIME_PER_PHASE_SEC = 6.0  # amber 4 s + all-red 2 s
DEFAULT_PHASES = ("NS", "EW")
SATURATION_FLOW_PCU_PER_HOUR = 1650.0  # Indian mixed-traffic through lane
JUNCTION_PCU_CAPACITY = 80.0
QUEUE_REF_M = 180.0
WAIT_REF_S = 120.0

# Historical Pune TOD baselines: hour -> (major_green_s, minor_green_s, major_phase)
# Calibrated to typical PMC / PCMC ATCS splits on Ganeshkhind, Karve, FC Road.
PUNE_TOD_BASELINE: Dict[int, Tuple[int, int, str]] = {}
for _h in range(24):
    if 0 <= _h < 6:
        PUNE_TOD_BASELINE[_h] = (22, 18, "NS")
    elif 6 <= _h < 8:
        PUNE_TOD_BASELINE[_h] = (38, 28, "NS")
    elif 8 <= _h < 11:
        PUNE_TOD_BASELINE[_h] = (56, 34, "NS")  # morning office inward
    elif 11 <= _h < 13:
        PUNE_TOD_BASELINE[_h] = (40, 32, "NS")
    elif 13 <= _h < 16:
        PUNE_TOD_BASELINE[_h] = (36, 30, "EW")
    elif 16 <= _h < 18:
        PUNE_TOD_BASELINE[_h] = (48, 36, "EW")
    elif 18 <= _h < 21:
        PUNE_TOD_BASELINE[_h] = (62, 38, "EW")  # evening peak purge
    else:
        PUNE_TOD_BASELINE[_h] = (28, 22, "NS")

# Junction-specific evening major axis (corridor that carries the peak).
JUNCTION_MAJOR_PHASE: Dict[str, str] = {
    "university_chowk": "NS",          # Ganeshkhind / University inbound
    "swargate_jedhe_chowk": "NS",      # Satara Road
    "nal_stop_chowk": "EW",            # Karve Road
    "chandni_chowk": "NS",             # Mumbai-Bangalore / NH48
    "katraj_naka": "NS",               # Satara / NH48
    "hinjewadi_shivaji_chowk": "EW",   # Hinjewadi Phase 1 spine
    "deccan_gymkhana": "NS",           # FC Road
    "sancheti_chowk": "NS",            # FC / JM Road
}


def _alias_count(vehicle_counts: Mapping[str, Any], *keys: str) -> float:
    total = 0.0
    lower_map = {str(k).lower(): v for k, v in vehicle_counts.items()}
    for key in keys:
        val = vehicle_counts.get(key)
        if val is None:
            val = lower_map.get(key.lower())
        if val is None:
            continue
        if isinstance(val, Mapping):
            total += _alias_count(val, *keys)
        else:
            try:
                total += float(val)
            except (TypeError, ValueError):
                continue
    return total


def extract_phase_counts(vehicle_counts: Mapping[str, Any]) -> Dict[str, Dict[str, float]]:
    """
    Accept either a flat city-wide tally or nested {NS: {...}, EW: {...}} maps.
    """
    nested_keys = [k for k in vehicle_counts.keys() if str(k).upper() in ("NS", "EW", "N", "S", "E", "W")]
    if nested_keys and all(isinstance(vehicle_counts[k], Mapping) for k in nested_keys):
        phases: Dict[str, Dict[str, float]] = {"NS": {}, "EW": {}}
        for key in nested_keys:
            bucket = "NS" if str(key).upper() in ("NS", "N", "S") else "EW"
            src = vehicle_counts[key]
            for ck, cv in src.items():
                try:
                    phases[bucket][ck] = phases[bucket].get(ck, 0.0) + float(cv)
                except (TypeError, ValueError):
                    continue
        return phases
    return {"ALL": dict(vehicle_counts)}


def compute_pcu_load(vehicle_counts: Mapping[str, Any]) -> Tuple[float, int]:
    """Return (weighted PCU, emergency vehicle count). Emergency is a priority override."""
    pcu = 0.0
    emergency = 0
    if not vehicle_counts:
        return 0.0, 0
    # Unwrap nested phase maps.
    stack = [vehicle_counts]
    while stack:
        cur = stack.pop()
        for key, val in cur.items():
            if isinstance(val, Mapping):
                stack.append(val)
                continue
            lk = str(key).lower()
            try:
                n = float(val)
            except (TypeError, ValueError):
                continue
            if lk in ("emergency", "ambulance", "fire", "police"):
                emergency += int(n)
                continue
            weight = PCU_WEIGHTS.get(key, PCU_WEIGHTS.get(lk))
            if weight is None:
                # Unknown class treated as a passenger car.
                weight = 1.0
            pcu += n * float(weight)
    return round(pcu, 3), emergency


def compute_congestion_score(
    pcu_load: float,
    queue_length_m: float,
    avg_wait_s: float,
    capacity_pcu: float = JUNCTION_PCU_CAPACITY,
) -> float:
    """
    Composite congestion in [0, 1] from PCU density, queue length, and wait time.
    """
    density = min(1.0, max(0.0, pcu_load / max(capacity_pcu, 1e-6)))
    queue = min(1.0, max(0.0, float(queue_length_m) / QUEUE_REF_M))
    wait = min(1.0, max(0.0, float(avg_wait_s) / WAIT_REF_S))
    score = 0.45 * density + 0.35 * queue + 0.20 * wait
    return round(float(min(1.0, max(0.0, score))), 4)


def _flow_ratio(pcu_load: float, cycle_guess_s: float = 90.0) -> float:
    """y_i = q_i / s_i with q estimated from snapshot PCU over a guessed cycle."""
    q_per_hour = pcu_load * (3600.0 / max(cycle_guess_s, 1.0))
    y = q_per_hour / SATURATION_FLOW_PCU_PER_HOUR
    return min(0.92, max(0.02, y))


def webster_green_seconds(
    phase_pcu: Mapping[str, float],
    congestion_score: float,
    emergency: bool = False,
) -> Tuple[str, int, int]:
    """
    Modified Webster delay minimisation.

    C0 = (1.5 L + 5) / (1 - Y),  g_i = (y_i / Y) * (C - L),
    then clamp each green to [min_green, max_green] and add an AI boost
    proportional to residual congestion.
    """
    phases = list(phase_pcu.keys()) or ["NS"]
    n_phases = max(len(phases), 1)
    lost = n_phases * LOST_TIME_PER_PHASE_SEC
    y_map = {p: _flow_ratio(max(0.0, float(phase_pcu[p]))) for p in phases}
    y_sum = sum(y_map.values())
    y_sum = min(0.93, max(y_sum, 0.05))
    c0 = (1.5 * lost + 5.0) / max(1e-6, (1.0 - y_sum))
    cycle = min(180.0, max(lost + n_phases * MIN_GREEN_SEC, c0))
    effective = max(cycle - lost, n_phases * MIN_GREEN_SEC)
    greens = {p: (y_map[p] / y_sum) * effective for p in phases}
    active = max(phases, key=lambda p: (greens[p], p))
    raw = greens[active]
    boost = 0
    if congestion_score >= 0.55:
        boost = int(round(8.0 + 22.0 * (congestion_score - 0.55) / 0.45))
    if emergency:
        rec = MAX_GREEN_SEC
        boost = max(boost, 15)
        active = "PREEMPT_EMERGENCY"
    else:
        rec = int(round(raw + boost))
        rec = int(min(MAX_GREEN_SEC, max(MIN_GREEN_SEC, rec)))
        # Keep boost from pushing past the statutory max.
        overflow = max(0, int(round(raw)) + boost - MAX_GREEN_SEC)
        boost = max(0, boost - overflow)
    return str(active), int(rec), int(boost)


def _tod_baseline(junction_id: str, now: Optional[datetime] = None) -> Dict[str, Any]:
    clock = now or datetime.now()
    if clock.tzinfo is None:
        # Pune is IST (UTC+5:30); naive timestamps are treated as local civil time.
        pass
    else:
        clock = clock.astimezone(timezone.utc).replace(tzinfo=None)
        # Convert UTC -> IST for hour bucket.
        ist_seconds = (clock.hour * 3600 + clock.minute * 60 + clock.second) + int(5.5 * 3600)
        hour = (ist_seconds // 3600) % 24
        clock = clock.replace(hour=hour)
    hour = clock.hour
    major_g, minor_g, default_phase = PUNE_TOD_BASELINE[hour]
    phase = JUNCTION_MAJOR_PHASE.get(junction_id, default_phase)
    # Evening peak on University / Nal Stop uses the longer EW Karve / SB split.
    if junction_id == "nal_stop_chowk" and 17 <= hour <= 21:
        phase = "EW"
        major_g = 64
    if junction_id == "university_chowk" and 8 <= hour <= 11:
        phase = "NS"
        major_g = 58
    green = int(min(MAX_GREEN_SEC, max(MIN_GREEN_SEC, major_g)))
    return {
        "congestion_score": 0.42 if 8 <= hour <= 11 or 17 <= hour <= 21 else 0.22,
        "active_phase": phase,
        "recommended_green_sec": green,
        "ai_boost_sec": 0,
        "iot_actuation_ack": False,
        "fallback_mode": True,
        "minor_green_sec": int(min(MAX_GREEN_SEC, max(MIN_GREEN_SEC, minor_g))),
        "baseline_hour_ist": hour,
        "source": "pune_tod_baseline",
    }


def compute_junction_state(
    junction_id: str,
    vehicle_counts: dict,
    queue_length_m: float,
    avg_wait_s: float,
    feed_status: str = "LIVE",
) -> dict:
    """
    Export junction actuation recommendation.

    Returns:
      congestion_score, active_phase, recommended_green_sec, ai_boost_sec,
      iot_actuation_ack, fallback_mode
    """
    status = str(feed_status or "").strip().upper()
    if status != "LIVE":
        baseline = _tod_baseline(junction_id)
        pcu, emergency = compute_pcu_load(vehicle_counts or {})
        # Even in fallback, surface a congestion reading from last known counts
        # so the command wall still has a number — actuation stays historical.
        score = compute_congestion_score(pcu, queue_length_m, avg_wait_s)
        baseline["congestion_score"] = score
        if emergency:
            baseline["active_phase"] = "PREEMPT_EMERGENCY"
            baseline["recommended_green_sec"] = MAX_GREEN_SEC
        return {
            "congestion_score": float(baseline["congestion_score"]),
            "active_phase": str(baseline["active_phase"]),
            "recommended_green_sec": int(baseline["recommended_green_sec"]),
            "ai_boost_sec": 0,
            "iot_actuation_ack": False,
            "fallback_mode": True,
        }

    phases = extract_phase_counts(vehicle_counts or {})
    phase_pcu: Dict[str, float] = {}
    emergency_total = 0
    for phase, counts in phases.items():
        pcu, emg = compute_pcu_load(counts)
        phase_pcu[phase] = pcu
        emergency_total += emg
    total_pcu = sum(phase_pcu.values())
    score = compute_congestion_score(total_pcu, queue_length_m, avg_wait_s)
    if "ALL" in phase_pcu and len(phase_pcu) == 1:
        # Split a flat tally 60/40 toward the historically major approach.
        major = JUNCTION_MAJOR_PHASE.get(junction_id, "NS")
        minor = "EW" if major == "NS" else "NS"
        phase_pcu = {major: total_pcu * 0.62, minor: total_pcu * 0.38}
    active, green, boost = webster_green_seconds(
        phase_pcu, score, emergency=emergency_total > 0
    )
    return {
        "congestion_score": float(score),
        "active_phase": str(active),
        "recommended_green_sec": int(green),
        "ai_boost_sec": int(boost),
        "iot_actuation_ack": True,
        "fallback_mode": False,
    }


__all__ = [
    "JUNCTION_PCU_CAPACITY",
    "MAX_GREEN_SEC",
    "MIN_GREEN_SEC",
    "PCU_WEIGHTS",
    "PUNE_TOD_BASELINE",
    "compute_congestion_score",
    "compute_junction_state",
    "compute_pcu_load",
    "webster_green_seconds",
]
