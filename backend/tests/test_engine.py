"""
FlowCommand SIH26127 — unit tests for ANPR normalisation, fuzzy trajectory
linking, velocity feasibility, and stale-feed signal fallback.
"""

from __future__ import annotations

import pytest

from backend.cv_pipeline.anpr_tracker import (
    MAX_VELOCITY_KMH,
    MIN_VELOCITY_KMH,
    is_velocity_feasible,
    levenshtein,
    normalize_indian_plate,
    preprocess_plate_crop,
    record_sighting,
    reconstruct_trajectory,
    reset_sighting_log,
    road_distance_m,
)
from backend.optimizer.signal_controller import (
    MAX_GREEN_SEC,
    MIN_GREEN_SEC,
    compute_junction_state,
    compute_pcu_load,
)


def test_normalize_standard_mh12_pune_plate():
    plate, conf = normalize_indian_plate("mh 12-de 1433")
    assert plate == "MH12DE1433"
    assert conf >= 0.9


def test_normalize_mh14_pcmc_priority_prefix():
    plate, conf = normalize_indian_plate("MH14AB9911")
    assert plate == "MH14AB9911"
    assert conf >= 0.9


def test_normalize_character_confusion_digit_slot():
    # B/8 and O/0 and S/5 in the numeric serial.
    plate, conf = normalize_indian_plate("MH12DE14B3")
    assert plate == "MH12DE1483"
    assert conf >= 0.5
    plate_o, _ = normalize_indian_plate("MH12DE14O3")
    assert plate_o == "MH12DE1403"
    plate_s, _ = normalize_indian_plate("MH12DE14S3")
    assert plate_s == "MH12DE1453"


def test_normalize_character_confusion_letter_and_district():
    # 0/O in series letters; Z/2 in Pune district code prefers MH12.
    plate, conf = normalize_indian_plate("MH120E1433")
    assert plate == "MH12OE1433"
    assert conf >= 0.5
    district, dconf = normalize_indian_plate("MH1ZDE1433")
    assert district == "MH12DE1433"
    assert dconf >= 0.5


def test_levenshtein_partial_university_read():
    assert levenshtein("MH12DE143_", "MH12DE1433") == 0  # wildcard slot
    assert levenshtein("MH12DE1433", "MH12DE1433") == 0
    assert levenshtein("MH12DE1433", "MH12DE1438") == 1
    assert levenshtein("MH12DE1433", "MH14DE1433") == 1
    assert levenshtein("MH12DE1433", "MH12DE9999") == 4


def test_preprocess_plate_crop_clahe_shape():
    np = pytest.importorskip("numpy")
    pytest.importorskip("cv2")
    rng = np.random.default_rng(42)
    crop = rng.integers(0, 255, size=(40, 120, 3), dtype=np.uint8)
    out = preprocess_plate_crop(crop)
    assert out.ndim == 3
    assert out.shape[2] == 3
    assert out.dtype == np.uint8
    # Upscales tiny monsoon-blurred crops for OCR.
    assert out.shape[0] >= 48
    assert out.shape[1] >= 96


def test_velocity_band_constants():
    assert MIN_VELOCITY_KMH == 5.0
    assert MAX_VELOCITY_KMH == 95.0


def test_velocity_feasibility_accepts_pune_arterial_pace():
    # Hinjewadi -> University Chowk is 15.2 km along Baner/Aundh/Ganeshkhind.
    assert road_distance_m("hinjewadi_shivaji_chowk", "university_chowk") == 15200
    ok = is_velocity_feasible(
        "hinjewadi_shivaji_chowk",
        "university_chowk",
        "2026-10-14T17:00:00+05:30",
        "2026-10-14T17:25:00+05:30",
    )
    assert ok is True


def test_velocity_feasibility_rejects_teleport():
    # 15.2 km in 45 seconds is ~1 200 km/h — not a Pune arterial.
    ok = is_velocity_feasible(
        "hinjewadi_shivaji_chowk",
        "university_chowk",
        "2026-10-14T17:00:00+05:30",
        "2026-10-14T17:00:45+05:30",
    )
    assert ok is False


def test_reconstruct_trajectory_fuzzy_match_and_geojson():
    reset_sighting_log()
    record_sighting(
        plate_raw="MH12DE1433",
        plate_matched="MH12DE1433",
        junction_id="hinjewadi_shivaji_chowk",
        timestamp="2026-10-14T17:00:00+05:30",
        ocr_confidence=0.96,
        speed_kmh=38.0,
    )
    record_sighting(
        plate_raw="MH12DE143_",
        plate_matched="MH12DE143_",
        junction_id="university_chowk",
        timestamp="2026-10-14T17:24:00+05:30",
        ocr_confidence=0.41,
        speed_kmh=29.0,
    )
    record_sighting(
        plate_raw="MH12DE1433",
        plate_matched="MH12DE1433",
        junction_id="sancheti_chowk",
        timestamp="2026-10-14T17:32:00+05:30",
        ocr_confidence=0.94,
        speed_kmh=24.0,
    )
    record_sighting(
        plate_raw="MH12DE1433",
        plate_matched="MH12DE1433",
        junction_id="deccan_gymkhana",
        timestamp="2026-10-14T17:38:00+05:30",
        ocr_confidence=0.95,
        speed_kmh=22.0,
    )
    geo = reconstruct_trajectory("MH12DE1433")
    assert geo["type"] == "FeatureCollection"
    kinds = [f["geometry"]["type"] for f in geo["features"]]
    assert kinds.count("Point") >= 4
    assert "LineString" in kinds
    seg_types = {
        f["properties"].get("segment_type")
        for f in geo["features"]
        if f["geometry"]["type"] == "LineString"
    }
    assert "confirmed" in seg_types
    # Occluded University read is linked via edit distance <= 2.
    plates = {
        f["properties"].get("plate_raw")
        for f in geo["features"]
        if f["properties"].get("feature_kind") == "camera_sighting"
    }
    assert "MH12DE143_" in plates
    for feat in geo["features"]:
        if feat["properties"].get("feature_kind") == "camera_sighting":
            assert "ocr_confidence" in feat["properties"]
            assert "timestamp" in feat["properties"]


def test_reconstruct_interpolates_skipped_camera():
    reset_sighting_log()
    record_sighting(
        plate_raw="MH12DE1433",
        plate_matched="MH12DE1433",
        junction_id="hinjewadi_shivaji_chowk",
        timestamp="2026-10-14T17:00:00+05:30",
        ocr_confidence=0.93,
    )
    record_sighting(
        plate_raw="MH12DE1433",
        plate_matched="MH12DE1433",
        junction_id="sancheti_chowk",
        timestamp="2026-10-14T17:40:00+05:30",
        ocr_confidence=0.91,
    )
    geo = reconstruct_trajectory("MH12DE1433")
    seg_types = [
        f["properties"].get("segment_type")
        for f in geo["features"]
        if f["geometry"]["type"] == "LineString"
    ]
    assert "interpolated" in seg_types
    assert geo["properties"]["interpolated_segments"] >= 1


def test_reconstruct_drops_infeasible_velocity_edge():
    reset_sighting_log()
    record_sighting(
        plate_raw="MH12DE1433",
        plate_matched="MH12DE1433",
        junction_id="hinjewadi_shivaji_chowk",
        timestamp="2026-10-14T17:00:00+05:30",
        ocr_confidence=0.9,
    )
    record_sighting(
        plate_raw="MH12DE1433",
        plate_matched="MH12DE1433",
        junction_id="katraj_naka",
        timestamp="2026-10-14T17:00:20+05:30",
        ocr_confidence=0.9,
    )
    geo = reconstruct_trajectory("MH12DE1433")
    lines = [f for f in geo["features"] if f["geometry"]["type"] == "LineString"]
    assert lines == []
    assert geo["properties"]["sightings"] == 2


def test_pcu_indian_mixed_traffic_weights():
    pcu, emg = compute_pcu_load({"2W": 10, "auto": 4, "car": 6, "pmpml_bus": 2, "truck": 1, "emergency": 1})
    # 10*0.5 + 4*1.0 + 6*1.0 + 2*3.0 + 1*3.0 = 5+4+6+6+3 = 24
    assert abs(pcu - 24.0) < 1e-6
    assert emg == 1


def test_fallback_signal_timing_when_feed_stale():
    counts = {"2W": 20, "car": 15, "bus": 3}
    live = compute_junction_state(
        "university_chowk", counts, queue_length_m=90.0, avg_wait_s=55.0, feed_status="LIVE"
    )
    stale = compute_junction_state(
        "university_chowk", counts, queue_length_m=90.0, avg_wait_s=55.0, feed_status="STALE"
    )
    assert live["fallback_mode"] is False
    assert live["iot_actuation_ack"] is True
    assert MIN_GREEN_SEC <= live["recommended_green_sec"] <= MAX_GREEN_SEC
    assert stale["fallback_mode"] is True
    assert stale["iot_actuation_ack"] is False
    assert stale["ai_boost_sec"] == 0
    assert MIN_GREEN_SEC <= stale["recommended_green_sec"] <= MAX_GREEN_SEC
    offline = compute_junction_state(
        "nal_stop_chowk", counts, queue_length_m=40.0, avg_wait_s=20.0, feed_status="OFFLINE"
    )
    assert offline["fallback_mode"] is True


def test_webster_green_bounds_and_emergency_override():
    busy = compute_junction_state(
        "university_chowk",
        {"NS": {"car": 40, "2W": 30, "bus": 6}, "EW": {"car": 8, "2W": 10}},
        queue_length_m=140.0,
        avg_wait_s=80.0,
        feed_status="LIVE",
    )
    assert MIN_GREEN_SEC <= busy["recommended_green_sec"] <= MAX_GREEN_SEC
    assert 0.0 <= busy["congestion_score"] <= 1.0
    emg = compute_junction_state(
        "nal_stop_chowk",
        {"car": 10, "emergency": 1},
        queue_length_m=20.0,
        avg_wait_s=8.0,
        feed_status="LIVE",
    )
    assert emg["active_phase"] == "PREEMPT_EMERGENCY"
    assert emg["recommended_green_sec"] == MAX_GREEN_SEC
