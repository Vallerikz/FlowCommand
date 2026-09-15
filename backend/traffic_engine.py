"""
VIMS — Adaptive Junction Signal Arbitration Engine
Implements a Passenger-Car-Unit (PCU) weighted, density-adaptive traffic
phase controller for junction corridor signal arbitration.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Optional, List, Any

class Corridor(str, Enum):
    NS = "NS"  # North-South
    EW = "EW"  # East-West


class LightState(str, Enum):
    GREEN = "GREEN"
    AMBER = "AMBER"
    ALL_RED = "ALL_RED"


class SubPhase(str, Enum):
    THROUGH = "THROUGH"
    THROUGH_AMBER = "THROUGH_AMBER"
    TURN_LEFT_ARROW = "TURN_LEFT_ARROW"
    TURN_RIGHT_ARROW = "TURN_RIGHT_ARROW"
    TURN_AMBER = "TURN_AMBER"
    ALL_RED = "ALL_RED"


class VehicleClass(str, Enum):
    MOTORCYCLE = "MOTORCYCLE"
    AUTO = "AUTO"
    CAR = "CAR"
    LCV = "LCV"
    BUS_TRUCK = "BUS_TRUCK"


# Passenger Car Unit (PCU) equivalence weights.
PCU_WEIGHTS: Dict[VehicleClass, float] = {
    VehicleClass.MOTORCYCLE: 0.5,
    VehicleClass.AUTO: 0.8,
    VehicleClass.CAR: 1.0,
    VehicleClass.LCV: 1.5,
    VehicleClass.BUS_TRUCK: 3.0,
}

# Safety-critical timing constraints (seconds).
MIN_GREEN_SECONDS: float = 15.0
MAX_GREEN_SECONDS: float = 60.0
AMBER_SECONDS: float = 4.0
ALL_RED_SECONDS: float = 2.0
TURN_ARROW_SECONDS: float = 7.0
TURN_AMBER_SECONDS: float = 2.5


# ──────────────────────────────────────────────────────────────────────────
# Data model
# ──────────────────────────────────────────────────────────────────────────

@dataclass
class VehicleCounts:
    """Raw per-class vehicle counts for one corridor at a point in time."""
    motorcycle: int = 0
    auto: int = 0
    car: int = 0
    lcv: int = 0
    bus_truck: int = 0

    def as_dict(self) -> Dict[str, int]:
        return {
            "motorcycle": self.motorcycle,
            "auto": self.auto,
            "car": self.car,
            "lcv": self.lcv,
            "bus_truck": self.bus_truck,
        }

    def total_vehicles(self) -> int:
        return self.motorcycle + self.auto + self.car + self.lcv + self.bus_truck

    def pcu_total(self) -> float:
        """Weighted Passenger Car Unit load for this corridor."""
        return (
            self.motorcycle * PCU_WEIGHTS[VehicleClass.MOTORCYCLE]
            + self.auto * PCU_WEIGHTS[VehicleClass.AUTO]
            + self.car * PCU_WEIGHTS[VehicleClass.CAR]
            + self.lcv * PCU_WEIGHTS[VehicleClass.LCV]
            + self.bus_truck * PCU_WEIGHTS[VehicleClass.BUS_TRUCK]
        )


@dataclass
class JunctionSnapshot:
    """Immutable-ish view of controller state at a given instant, ready to serialize."""
    active_corridor: Corridor
    light_state: LightState
    elapsed_in_state: float
    time_remaining_min_green: float
    ns_pcu: float
    ew_pcu: float
    ns_vehicle_counts: Dict[str, int]
    ew_vehicle_counts: Dict[str, int]
    ns_vehicle_total: int
    ew_vehicle_total: int
    cycle_count: int
    server_epoch: float
    vehicles: List[Dict[str, Any]] = field(default_factory=list)
    sub_phase: str = "THROUGH"
    arrow_l: str = "OFF"
    arrow_r: str = "OFF"

    def to_payload(self) -> Dict:
        ns_counts_dict = {
            **self.ns_vehicle_counts,
            "vehicle_count": self.ns_vehicle_total,
            "pcu": round(self.ns_pcu, 2),
        }
        ew_counts_dict = {
            **self.ew_vehicle_counts,
            "vehicle_count": self.ew_vehicle_total,
            "pcu": round(self.ew_pcu, 2),
        }
        # 2 Perpendicular Lanes calculation with turn arrow states and sub-phases
        if self.active_corridor == Corridor.NS:
            ns_sub_phase = self.sub_phase
            ns_arrow_l = self.arrow_l
            ns_arrow_r = self.arrow_r
            if self.sub_phase == SubPhase.THROUGH.value or (self.light_state == LightState.GREEN and self.sub_phase not in (SubPhase.TURN_LEFT_ARROW.value, SubPhase.TURN_RIGHT_ARROW.value)):
                ns_signal = "GREEN"
            elif self.sub_phase in (SubPhase.THROUGH_AMBER.value, SubPhase.TURN_AMBER.value) or self.light_state == LightState.AMBER:
                ns_signal = "AMBER"
            else:
                ns_signal = "RED"

            ew_sub_phase = SubPhase.ALL_RED.value
            ew_arrow_l = "OFF"
            ew_arrow_r = "OFF"
            ew_signal = "RED"
        else:
            ew_sub_phase = self.sub_phase
            ew_arrow_l = self.arrow_l
            ew_arrow_r = self.arrow_r
            if self.sub_phase == SubPhase.THROUGH.value or (self.light_state == LightState.GREEN and self.sub_phase not in (SubPhase.TURN_LEFT_ARROW.value, SubPhase.TURN_RIGHT_ARROW.value)):
                ew_signal = "GREEN"
            elif self.sub_phase in (SubPhase.THROUGH_AMBER.value, SubPhase.TURN_AMBER.value) or self.light_state == LightState.AMBER:
                ew_signal = "AMBER"
            else:
                ew_signal = "RED"

            ns_sub_phase = SubPhase.ALL_RED.value
            ns_arrow_l = "OFF"
            ns_arrow_r = "OFF"
            ns_signal = "RED"

        ns_vehicles = [v for v in self.vehicles if v.get("corridor") == "NS"]
        ew_vehicles = [v for v in self.vehicles if v.get("corridor") == "EW"]

        # Math Safety: Guard all divisions against len == 0 and 0.0 denominators
        ns_veh_len = len(ns_vehicles)
        ew_veh_len = len(ew_vehicles)
        all_veh_len = len(self.vehicles)

        ns_avg_speed = (
            round(sum(v.get("speed_kmh", 0.0) for v in ns_vehicles) / ns_veh_len, 1)
            if ns_veh_len > 0 else 0.0
        )
        ew_avg_speed = (
            round(sum(v.get("speed_kmh", 0.0) for v in ew_vehicles) / ew_veh_len, 1)
            if ew_veh_len > 0 else 0.0
        )
        all_avg_speed = (
            round(sum(v.get("speed_kmh", 0.0) for v in self.vehicles) / all_veh_len, 1)
            if all_veh_len > 0 else 0.0
        )

        # Throughput estimation (vehicles/hour based on flow Q = density * speed)
        # 120m corridor segment = 0.12 km
        ns_throughput = round(ns_veh_len * (ns_avg_speed / 0.12), 1) if ns_veh_len > 0 and ns_avg_speed > 0 else 0.0
        ew_throughput = round(ew_veh_len * (ew_avg_speed / 0.12), 1) if ew_veh_len > 0 and ew_avg_speed > 0 else 0.0
        total_throughput = round(ns_throughput + ew_throughput, 1)

        total_pcu = self.ns_pcu + self.ew_pcu
        if self.ew_pcu > 0.0:
            pcu_density_ratio = round(self.ns_pcu / self.ew_pcu, 2)
        elif self.ns_pcu > 0.0:
            pcu_density_ratio = round(self.ns_pcu / 0.1, 2)
        else:
            pcu_density_ratio = 1.0

        corridor_balance_delta = round((self.ns_pcu - self.ew_pcu) / total_pcu, 2) if total_pcu > 0.0 else 0.0

        return {
            "active_corridor": self.active_corridor.value,
            "light_state": self.light_state.value,
            "sub_phase": self.sub_phase,
            "arrow_l": self.arrow_l,
            "arrow_r": self.arrow_r,
            "time_in_phase": round(self.elapsed_in_state, 2),
            "time_in_phase_sec": round(self.elapsed_in_state, 2),
            "elapsed_in_state_sec": round(self.elapsed_in_state, 2),
            "min_green_remaining": round(self.time_remaining_min_green, 2),
            "min_green_remaining_sec": round(self.time_remaining_min_green, 2),
            "total_vehicle_count": self.ns_vehicle_total + self.ew_vehicle_total,
            "total_pcu": round(total_pcu, 2),
            "pcu_density_ratio": pcu_density_ratio,
            "corridor_balance_delta": corridor_balance_delta,
            "average_speed_kmh": all_avg_speed,
            "throughput_vph": total_throughput,
            "pcu": {
                "NS": round(self.ns_pcu, 2),
                "EW": round(self.ew_pcu, 2),
            },
            "vehicle_counts": {
                "NS": ns_counts_dict,
                "EW": ew_counts_dict,
            },
            "vehicle_totals": {
                "NS": self.ns_vehicle_total,
                "EW": self.ew_vehicle_total,
            },
            "vehicles": self.vehicles,
            "active_vehicles": self.vehicles,
            "capacity_per_lane": 2,
            "max_vehicles_abreast_per_lane": 2,
            "overtaking_vehicles_count": sum(1 for v in self.vehicles if v.get("is_overtaking")),
            "lane_sharing_vehicles_count": sum(1 for v in self.vehicles if v.get("lane_sharing")),
            "turning_vehicles_count": sum(1 for v in self.vehicles if v.get("is_turning")),
            "blinker_active_count": sum(1 for v in self.vehicles if v.get("blinker") in ("LEFT", "RIGHT")),
            "junction": {
                "junction_id": "JUNC-01-CENTRAL",
                "name": "JM-FC Central Junction",
                "intersection_type": "SINGLE_JUNCTION_2_LANE_PERPENDICULAR",
                "geometry": {
                    "corridors_count": 2,
                    "orientation": "perpendicular_90_deg",
                    "lanes": [
                        {
                            "id": "LANE-1-NS",
                            "name": "North-South Corridor",
                            "corridor": "NS",
                            "angle_deg": 0,
                            "orientation": "vertical",
                            "capacity_abreast": 2,
                            "sub_lanes": 2,
                        },
                        {
                            "id": "LANE-2-EW",
                            "name": "East-West Corridor",
                            "corridor": "EW",
                            "angle_deg": 90,
                            "orientation": "horizontal",
                            "capacity_abreast": 2,
                            "sub_lanes": 2,
                        },
                    ],
                },
                "active_corridor": self.active_corridor.value,
                "active_lane_id": f"LANE-1-NS" if self.active_corridor == Corridor.NS else "LANE-2-EW",
            },
            "lanes": {
                "NS": {
                    "lane_id": "LANE-1-NS",
                    "lane_number": 1,
                    "name": "North-South Lane",
                    "corridor": "NS",
                    "orientation": "vertical",
                    "angle_deg": 0,
                    "signal_state": ns_signal,
                    "arrow_l": ns_arrow_l,
                    "arrow_r": ns_arrow_r,
                    "sub_phase": ns_sub_phase,
                    "pcu": round(self.ns_pcu, 2),
                    "vehicle_total": self.ns_vehicle_total,
                    "vehicle_counts": ns_counts_dict,
                    "queue_length_m": round(self.ns_pcu * 5.2, 1),
                    "occupancy_rate": min(1.0, round(self.ns_pcu / 40.0, 2)),
                    "density_level": "LOW" if self.ns_pcu < 12 else ("MODERATE" if self.ns_pcu < 25 else "HIGH"),
                    "average_speed_kmh": ns_avg_speed,
                    "throughput_vph": ns_throughput,
                    "pcu_density_ratio": pcu_density_ratio,
                    "capacity_per_segment": 2,
                    "max_vehicles_abreast": 2,
                    "sub_lanes": 2,
                    "vehicles": ns_vehicles,
                    "sub_lane_0_vehicles": [v for v in ns_vehicles if v.get("sub_lane") == 0],
                    "sub_lane_1_vehicles": [v for v in ns_vehicles if v.get("sub_lane") == 1],
                    "overtaking_count": sum(1 for v in ns_vehicles if v.get("is_overtaking")),
                    "lane_sharing_active": any(v.get("lane_sharing") for v in ns_vehicles),
                    "turning_count": sum(1 for v in ns_vehicles if v.get("is_turning")),
                    "blinker_active_count": sum(1 for v in ns_vehicles if v.get("blinker") in ("LEFT", "RIGHT")),
                },
                "EW": {
                    "lane_id": "LANE-2-EW",
                    "lane_number": 2,
                    "name": "East-West Lane",
                    "corridor": "EW",
                    "orientation": "horizontal",
                    "angle_deg": 90,
                    "signal_state": ew_signal,
                    "arrow_l": ew_arrow_l,
                    "arrow_r": ew_arrow_r,
                    "sub_phase": ew_sub_phase,
                    "pcu": round(self.ew_pcu, 2),
                    "vehicle_total": self.ew_vehicle_total,
                    "vehicle_counts": ew_counts_dict,
                    "queue_length_m": round(self.ew_pcu * 5.2, 1),
                    "occupancy_rate": min(1.0, round(self.ew_pcu / 40.0, 2)),
                    "density_level": "LOW" if self.ew_pcu < 12 else ("MODERATE" if self.ew_pcu < 25 else "HIGH"),
                    "average_speed_kmh": ew_avg_speed,
                    "throughput_vph": ew_throughput,
                    "pcu_density_ratio": round(self.ew_pcu / self.ns_pcu, 2) if self.ns_pcu > 0.0 else (round(self.ew_pcu / 0.1, 2) if self.ew_pcu > 0.0 else 1.0),
                    "capacity_per_segment": 2,
                    "max_vehicles_abreast": 2,
                    "sub_lanes": 2,
                    "vehicles": ew_vehicles,
                    "sub_lane_0_vehicles": [v for v in ew_vehicles if v.get("sub_lane") == 0],
                    "sub_lane_1_vehicles": [v for v in ew_vehicles if v.get("sub_lane") == 1],
                    "overtaking_count": sum(1 for v in ew_vehicles if v.get("is_overtaking")),
                    "lane_sharing_active": any(v.get("lane_sharing") for v in ew_vehicles),
                    "turning_count": sum(1 for v in ew_vehicles if v.get("is_turning")),
                    "blinker_active_count": sum(1 for v in ew_vehicles if v.get("blinker") in ("LEFT", "RIGHT")),
                },
            },
            "cycle_count": self.cycle_count,
            "server_epoch": self.server_epoch,
            "constraints": {
                "min_green_sec": MIN_GREEN_SECONDS,
                "max_green_sec": MAX_GREEN_SECONDS,
                "amber_sec": AMBER_SECONDS,
                "all_red_sec": ALL_RED_SECONDS,
                "turn_arrow_sec": TURN_ARROW_SECONDS,
                "turn_amber_sec": TURN_AMBER_SECONDS,
            },
        }


# ──────────────────────────────────────────────────────────────────────────
# Controller
# ──────────────────────────────────────────────────────────────────────────

class AdaptiveJunctionController:
    """
    Density-adaptive two-corridor signal arbitrator.

    Usage:
        controller = AdaptiveJunctionController()
        controller.update_detection(Corridor.NS, VehicleCounts(car=12, bus_truck=1))
        controller.update_detection(Corridor.EW, VehicleCounts(car=3))
        snapshot = controller.tick()   # call once per control-loop iteration
    """

    def __init__(
        self,
        initial_active: Corridor = Corridor.NS,
        min_green: float = MIN_GREEN_SECONDS,
        max_green: float = MAX_GREEN_SECONDS,
        amber_time: float = AMBER_SECONDS,
        all_red_time: float = ALL_RED_SECONDS,
        turn_arrow_time: float = TURN_ARROW_SECONDS,
        turn_amber_time: float = TURN_AMBER_SECONDS,
        clock: Optional[callable] = None,
    ) -> None:
        self._clock = clock or time.monotonic

        self.min_green = min_green
        self.max_green = max_green
        self.amber_time = amber_time
        self.all_red_time = all_red_time
        self.turn_arrow_time = turn_arrow_time
        self.turn_amber_time = turn_amber_time

        self.active_corridor: Corridor = initial_active
        self.light_state: LightState = LightState.ALL_RED
        self.sub_phase: SubPhase = SubPhase.TURN_LEFT_ARROW
        self.arrow_l: str = "GREEN"
        self.arrow_r: str = "OFF"
        self._state_entered_at: float = self._clock()

        self.cycle_count: int = 0

        # Live vehicle telemetry, keyed by corridor.
        self._counts: Dict[Corridor, VehicleCounts] = {
            Corridor.NS: VehicleCounts(),
            Corridor.EW: VehicleCounts(),
        }

        # The corridor that is NOT currently active is always waiting/red.
        self._pending_corridor: Optional[Corridor] = None
        self._simulation_engine: Optional[Any] = None

    def set_simulation_engine(self, engine: Any) -> None:
        """Attach a simulation engine that generates dynamic vehicles and counts."""
        self._simulation_engine = engine

    # ── Telemetry ingestion ──────────────────────────────────────────

    def update_detection(self, corridor: Corridor, counts: VehicleCounts) -> None:
        """Feed the latest simulated/real YOLO vehicle counts for a corridor."""
        self._counts[corridor] = counts

    def force_corridor_green(self, corridor: Corridor) -> None:
        """Manual priority or emergency wave override for traffic regulation."""
        if self.active_corridor == corridor and self.sub_phase == SubPhase.THROUGH:
            self._state_entered_at = self._clock()
            return
        self._pending_corridor = corridor
        now = self._clock()
        if self.sub_phase == SubPhase.THROUGH:
            self._transition_to_sub_phase(SubPhase.THROUGH_AMBER, now)
        elif self.sub_phase == SubPhase.ALL_RED:
            self.active_corridor = corridor
            self.cycle_count += 1
            self._transition_to_sub_phase(SubPhase.TURN_LEFT_ARROW, now)
        else:
            self._transition_to_sub_phase(SubPhase.ALL_RED, now)

    def force_all_red(self) -> None:
        """All-Red emergency intersection hold."""
        now = self._clock()
        self._transition_to_sub_phase(SubPhase.ALL_RED, now)

    def _waiting_corridor(self) -> Corridor:
        return Corridor.EW if self.active_corridor == Corridor.NS else Corridor.NS

    def _pcu(self, corridor: Corridor) -> float:
        return self._counts[corridor].pcu_total()

    # ── Core state machine ───────────────────────────────────────────

    def tick(self) -> JunctionSnapshot:
        """
        Advance the state machine based on wall-clock elapsed time, sub-phases,
        turn arrows, and PCU densities, then return a serializable snapshot.

        Must be called periodically (the router drives this at 1 Hz), but the
        logic itself is elapsed-time based, not tick-count based, so it is
        safe to call at any cadence.
        """
        now = self._clock()
        elapsed = now - self._state_entered_at

        # Step simulation if attached
        live_vehicles = []
        if self._simulation_engine is not None:
            self._simulation_engine.tick(
                self.active_corridor,
                self.light_state,
                dt=1.0,
                sub_phase=self.sub_phase.value,
                arrow_l=self.arrow_l,
                arrow_r=self.arrow_r,
            )
            ns_raw = self._simulation_engine.get_corridor_counts(Corridor.NS)
            ew_raw = self._simulation_engine.get_corridor_counts(Corridor.EW)
            self._counts[Corridor.NS] = VehicleCounts(**ns_raw)
            self._counts[Corridor.EW] = VehicleCounts(**ew_raw)
            live_vehicles = self._simulation_engine.get_all_vehicles_tooltip_payload()

        # 6-phase sequence progression (LEADING PROTECTED TURN PHASING):
        # 1. TURN_LEFT_ARROW (left arrow GREEN, circular lens RED)
        # 2. TURN_RIGHT_ARROW (right arrow GREEN, circular lens RED)
        # 3. TURN_AMBER (arrows OFF, amber clearance)
        # 4. THROUGH (circular GREEN light turns ON for straight traffic)
        # 5. THROUGH_AMBER (circular amber clearance)
        # 6. ALL_RED (all-red junction clearance) -> switch corridor -> TURN_LEFT_ARROW
        if self.sub_phase == SubPhase.TURN_LEFT_ARROW:
            if elapsed >= self.turn_arrow_time:
                self._transition_to_sub_phase(SubPhase.TURN_RIGHT_ARROW, now)
        elif self.sub_phase == SubPhase.TURN_RIGHT_ARROW:
            if elapsed >= self.turn_arrow_time:
                self._transition_to_sub_phase(SubPhase.TURN_AMBER, now)
        elif self.sub_phase == SubPhase.TURN_AMBER:
            if elapsed >= self.turn_amber_time:
                self._transition_to_sub_phase(SubPhase.THROUGH, now)
        elif self.sub_phase == SubPhase.THROUGH:
            self._evaluate_green_phase(elapsed)
        elif self.sub_phase == SubPhase.THROUGH_AMBER:
            if elapsed >= self.amber_time:
                self._transition_to_sub_phase(SubPhase.ALL_RED, now)
        elif self.sub_phase == SubPhase.ALL_RED:
            if elapsed >= self.all_red_time:
                # Swap active corridor and start TURN_LEFT_ARROW for the newly active one.
                self.active_corridor = self._pending_corridor or self._waiting_corridor()
                self._pending_corridor = None
                self.cycle_count += 1
                self._transition_to_sub_phase(SubPhase.TURN_LEFT_ARROW, now)

        return self._snapshot(now, vehicles=live_vehicles)

    def _evaluate_green_phase(self, elapsed: float) -> None:
        """
        Decide whether the active GREEN phase should end, based on:
          - Minimum Green: never end before min_green has elapsed.
          - Maximum Green: force an end once max_green has elapsed
            (starvation prevention for the waiting corridor).
          - Adaptive density rule: once min_green has elapsed, keep GREEN
            as long as the active corridor's PCU density is still higher
            than the waiting corridor's PCU density; end it the moment the
            waiting corridor's density is greater or equal (i.e. the active
            corridor has been "regulated" down).
        """
        if elapsed < self.min_green:
            return  # Hard floor — cannot end phase yet regardless of density.

        if elapsed >= self.max_green:
            self._end_green_phase()
            return

        active_density = self._pcu(self.active_corridor)
        waiting_density = self._pcu(self._waiting_corridor())

        if active_density <= waiting_density:
            # Active corridor's density has dropped to/below the waiting
            # corridor's — regulate by handing the green over.
            self._end_green_phase()

    def _end_green_phase(self) -> None:
        self._pending_corridor = self._waiting_corridor()
        now = self._clock()
        self._transition_to_sub_phase(SubPhase.THROUGH_AMBER, now)

    def _transition_to_sub_phase(self, new_sub_phase: SubPhase, at_time: float) -> None:
        """Advances controller to a specific sub-phase and assigns matching arrow and light states."""
        self.sub_phase = new_sub_phase
        self._state_entered_at = at_time
        if new_sub_phase == SubPhase.THROUGH:
            self.light_state = LightState.GREEN
            self.arrow_l = "OFF"
            self.arrow_r = "OFF"
        elif new_sub_phase == SubPhase.THROUGH_AMBER:
            self.light_state = LightState.AMBER
            self.arrow_l = "OFF"
            self.arrow_r = "OFF"
        elif new_sub_phase == SubPhase.TURN_LEFT_ARROW:
            self.light_state = LightState.ALL_RED
            self.arrow_l = "GREEN"
            self.arrow_r = "OFF"
        elif new_sub_phase == SubPhase.TURN_RIGHT_ARROW:
            self.light_state = LightState.ALL_RED
            self.arrow_l = "OFF"
            self.arrow_r = "GREEN"
        elif new_sub_phase == SubPhase.TURN_AMBER:
            self.light_state = LightState.AMBER
            self.arrow_l = "OFF"
            self.arrow_r = "OFF"
        elif new_sub_phase == SubPhase.ALL_RED:
            self.light_state = LightState.ALL_RED
            self.arrow_l = "OFF"
            self.arrow_r = "OFF"

    def _transition_to(self, new_state: LightState, at_time: float) -> None:
        """Backward-compatible transition for callers passing LightState."""
        if new_state == LightState.GREEN:
            self._transition_to_sub_phase(SubPhase.THROUGH, at_time)
        elif new_state == LightState.AMBER:
            self._transition_to_sub_phase(SubPhase.THROUGH_AMBER, at_time)
        elif new_state == LightState.ALL_RED:
            self._transition_to_sub_phase(SubPhase.ALL_RED, at_time)

    # ── Snapshot / serialization ─────────────────────────────────────

    def _snapshot(self, now: float, vehicles: Optional[List[Dict[str, Any]]] = None) -> JunctionSnapshot:
        elapsed = now - self._state_entered_at
        remaining_min_green = 0.0
        if self.sub_phase == SubPhase.THROUGH:
            remaining_min_green = max(0.0, self.min_green - elapsed)

        ns_counts = self._counts[Corridor.NS]
        ew_counts = self._counts[Corridor.EW]

        return JunctionSnapshot(
            active_corridor=self.active_corridor,
            light_state=self.light_state,
            elapsed_in_state=elapsed,
            time_remaining_min_green=remaining_min_green,
            ns_pcu=ns_counts.pcu_total(),
            ew_pcu=ew_counts.pcu_total(),
            ns_vehicle_counts=ns_counts.as_dict(),
            ew_vehicle_counts=ew_counts.as_dict(),
            ns_vehicle_total=ns_counts.total_vehicles(),
            ew_vehicle_total=ew_counts.total_vehicles(),
            cycle_count=self.cycle_count,
            server_epoch=time.time(),
            vehicles=vehicles or [],
            sub_phase=self.sub_phase.value,
            arrow_l=self.arrow_l,
            arrow_r=self.arrow_r,
        )
