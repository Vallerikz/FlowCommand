"""
VIMS — Traffic Modulation 2D View Builder
Generates 2D lane occupancy grids and directional signal states directly
from AdaptiveJunctionController snapshot state.
"""

from __future__ import annotations

from typing import Dict, List

from backend.traffic_engine import Corridor, LightState, JunctionSnapshot

# Simplified grid dimensions: each corridor is modeled as two approach
# lanes (one per direction of travel) of a fixed number of cells counting
# down to the stop line. This is a deliberate simplification for a
# "digitalized/simplified" view, not a claim of physical lane geometry.
CELLS_PER_LANE = 8
# How many real vehicles (PCU-weighted) a single grid cell represents.
# Tuned so the grid fills up over the same rough vehicle-count range the
# signal controller itself treats as busy (see traffic_engine.py's
# MAX_GREEN_SECONDS / baseline detector counts).
VEHICLES_PER_CELL = 2.5

def _lane_fill(vehicle_total: int) -> int:
    """
    Deterministic, real-data-driven fill count for one lane's cells.
    Not random, not animated — a direct function of the actual reported
    vehicle total for that corridor.
    """
    filled = round(vehicle_total / VEHICLES_PER_CELL)
    return max(0, min(CELLS_PER_LANE, filled))

def _arm_light_colors(active_corridor: Corridor, light_state: LightState) -> Dict[str, str]:
    """
    Maps the real 2-corridor controller state onto the 4 physical
    junction arms (N, S, E, W). NS and EW each move together (this is a
    2-phase controller, not independent per-arm signals), which mirrors
    how `traffic_engine.py` actually models the junction.
    """
    if light_state == LightState.ALL_RED:
        return {"N": "RED", "S": "RED", "E": "RED", "W": "RED"}

    if active_corridor == Corridor.NS:
        active_color = light_state.value  # GREEN or AMBER
        return {"N": active_color, "S": active_color, "E": "RED", "W": "RED"}
    else:
        active_color = light_state.value
        return {"N": "RED", "S": "RED", "E": active_color, "W": active_color}

def build_modulation_view(snapshot: JunctionSnapshot) -> Dict:
    """
    Builds the full simplified 2D modulation payload from a real
    JunctionSnapshot. Every number here traces back to either the live
    controller state machine or the live per-corridor vehicle totals —
    nothing is fabricated or randomly generated in this function.
    """
    ns_total = snapshot.ns_vehicle_total
    ew_total = snapshot.ew_vehicle_total

    # Split each corridor's real total evenly across its two direction
    # lanes (we only have a combined per-corridor count, not a
    # per-direction breakdown, so this is an even split of real data,
    # not an invented asymmetry).
    ns_lane_fill = _lane_fill(ns_total // 2)
    ew_lane_fill = _lane_fill(ew_total // 2)

    arm_colors = _arm_light_colors(snapshot.active_corridor, snapshot.light_state)

    def lane_cells(fill: int) -> List[int]:
        # 1 = occupied cell (closest to stop line first), 0 = empty.
        # Index 0 is nearest the stop line.
        return [1 if i < fill else 0 for i in range(CELLS_PER_LANE)]

    ns_vehicles = [v for v in snapshot.vehicles if v.get("corridor") == "NS"]
    ew_vehicles = [v for v in snapshot.vehicles if v.get("corridor") == "EW"]

    return {
        "grid": {
            "geometry": "2_perpendicular_lanes",
            "cells_per_lane": CELLS_PER_LANE,
            "capacity_per_lane": 2,
            "sub_lanes": 2,
            "corridors": {
                "NS": {
                    "lanes": [lane_cells(ns_lane_fill), lane_cells(ns_lane_fill)],
                    "northbound_lane": lane_cells(ns_lane_fill),
                    "southbound_lane": lane_cells(ns_lane_fill),
                    "vehicle_count": ns_total,
                    "real_vehicle_total": ns_total,
                    "pcu": round(snapshot.ns_pcu, 2),
                    "pcu_load": round(snapshot.ns_pcu, 2),
                    "real_pcu_total": round(snapshot.ns_pcu, 2),
                    "capacity_per_lane": 2,
                    "sub_lanes": 2,
                    "vehicles": ns_vehicles,
                    "overtaking_count": sum(1 for v in ns_vehicles if v.get("is_overtaking")),
                    "lane_sharing_active": any(v.get("lane_sharing") for v in ns_vehicles),
                    "turning_count": sum(1 for v in ns_vehicles if v.get("is_turning")),
                    "blinker_active_count": sum(1 for v in ns_vehicles if v.get("blinker") in ("LEFT", "RIGHT")),
                },
                "EW": {
                    "lanes": [lane_cells(ew_lane_fill), lane_cells(ew_lane_fill)],
                    "eastbound_lane": lane_cells(ew_lane_fill),
                    "westbound_lane": lane_cells(ew_lane_fill),
                    "vehicle_count": ew_total,
                    "real_vehicle_total": ew_total,
                    "pcu": round(snapshot.ew_pcu, 2),
                    "pcu_load": round(snapshot.ew_pcu, 2),
                    "real_pcu_total": round(snapshot.ew_pcu, 2),
                    "capacity_per_lane": 2,
                    "sub_lanes": 2,
                    "vehicles": ew_vehicles,
                    "overtaking_count": sum(1 for v in ew_vehicles if v.get("is_overtaking")),
                    "lane_sharing_active": any(v.get("lane_sharing") for v in ew_vehicles),
                    "turning_count": sum(1 for v in ew_vehicles if v.get("is_turning")),
                    "blinker_active_count": sum(1 for v in ew_vehicles if v.get("blinker") in ("LEFT", "RIGHT")),
                },
            },
        },
        "vehicles": snapshot.vehicles,
        "overtaking_vehicles_count": sum(1 for v in snapshot.vehicles if v.get("is_overtaking")),
        "lane_sharing_vehicles_count": sum(1 for v in snapshot.vehicles if v.get("lane_sharing")),
        "turning_vehicles_count": sum(1 for v in snapshot.vehicles if v.get("is_turning")),
        "blinker_active_count": sum(1 for v in snapshot.vehicles if v.get("blinker") in ("LEFT", "RIGHT")),
        "capacity_per_lane": 2,
        "signals": {
            "arms": arm_colors,
            "N": {"color": arm_colors["N"], "time_in_color_sec": round(snapshot.elapsed_in_state, 2)},
            "S": {"color": arm_colors["S"], "time_in_color_sec": round(snapshot.elapsed_in_state, 2)},
            "E": {"color": arm_colors["E"], "time_in_color_sec": round(snapshot.elapsed_in_state, 2)},
            "W": {"color": arm_colors["W"], "time_in_color_sec": round(snapshot.elapsed_in_state, 2)},
            "active_corridor": snapshot.active_corridor.value,
            "light_state": snapshot.light_state.value,
            "sub_phase": snapshot.sub_phase,
            "arrow_l": snapshot.arrow_l,
            "arrow_r": snapshot.arrow_r,
            "elapsed_in_state_sec": round(snapshot.elapsed_in_state, 2),
            "min_green_remaining_sec": round(snapshot.time_remaining_min_green, 2),
        },
        "cycle_count": snapshot.cycle_count,
        "server_epoch": snapshot.server_epoch,
        "note": (
            "Simplified digitalized representation derived directly from "
            "live controller state and real per-corridor vehicle totals — "
            "cell fill and light colors are not independently animated or "
            "randomized."
        ),
    }
