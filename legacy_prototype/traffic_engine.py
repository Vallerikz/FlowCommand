"""
traffic_engine.py
==================
Adaptive Traffic Signal Control (ATSC) engine for a single, isolated
two-corridor junction: North-South (NS) and East-West (EW).

Design basis — IRC 93:1985 ("Guidelines for the Design of At-Grade
Intersections")
-----------------------------------------------------------------
  * Amber clearance:   3 s hard minimum before a phase can drop to red.
  * All-red buffer:    a short inter-green period during which both
                        corridors are red, letting the intersection clear.
  * Lost time:         each phase change costs 2-4 s of "lost" capacity
                        (start-up lag on the incoming green + tail-end
                        under-utilisation on the outgoing green). This is
                        tracked and folded into cycle-length accounting —
                        it does not lengthen amber/all-red themselves.
  * Cycle length:      40-120 s is treated as the *optimal* operating band
                        for an isolated junction. The controller actively
                        governs toward this band: if honouring a corridor's
                        max green would push the full NS+EW cycle past
                        120 s, the effective green ceiling for that cycle
                        is tightened (never below the 15 s hard floor).
  * Green bounds:       15 s hard minimum / 60 s hard maximum per phase,
                        irrespective of density — the maximum exists purely
                        to prevent starving the waiting corridor.

This module is intentionally framework-agnostic (no FastAPI/asyncio
import) so `AdaptiveJunctionController` is a plain, synchronous, easily
unit-testable state machine. Real-time orchestration — the 1 Hz WebSocket
broadcast and the OpenCV-driven arrival simulator — lives in `server.py`.
"""

from __future__ import annotations

import random
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Dict, Optional


# ─────────────────────────────────────────────────────────────────────────
# Enums
# ─────────────────────────────────────────────────────────────────────────

class Corridor(str, Enum):
    NS = "NS"  # North-South
    EW = "EW"  # East-West


class SignalState(str, Enum):
    GREEN = "GREEN"
    AMBER = "AMBER"
    ALL_RED = "ALL_RED"


class VehicleClass(str, Enum):
    TWO_WHEELER = "TWO_WHEELER"
    AUTO_RICKSHAW = "AUTO_RICKSHAW"
    CAR = "CAR"
    LCV = "LCV"
    BUS_TRUCK = "BUS_TRUCK"


class PhaseStatus(str, Enum):
    """Human-readable reason code for why the controller is doing what it's doing."""
    MIN_GREEN_HOLD = "MIN_GREEN_HOLD"          # inside the inviolable min-green floor
    EXTENDING = "EXTENDING"                     # active corridor still denser than waiting one
    DENSITY_YIELD = "DENSITY_YIELD"             # waiting corridor now denser -> ending phase
    MAX_GREEN_CAP = "MAX_GREEN_CAP"             # hit the 60s anti-starvation ceiling
    CYCLE_BUDGET_CAP = "CYCLE_BUDGET_CAP"       # hit the dynamically-shrunk 40-120s cycle cap
    AMBER_CLEARANCE = "AMBER_CLEARANCE"         # in the 3s amber interval
    ALL_RED_CLEARANCE = "ALL_RED_CLEARANCE"     # in the inter-green all-red buffer


# ─────────────────────────────────────────────────────────────────────────
# Constants — IRC 93:1985 timing envelope
# ─────────────────────────────────────────────────────────────────────────

# Standard Passenger Car Unit (PCU) equivalence factors used in Indian
# signal-design practice for mixed traffic streams.
PCU_WEIGHTS: Dict[VehicleClass, float] = {
    VehicleClass.TWO_WHEELER: 0.5,
    VehicleClass.AUTO_RICKSHAW: 0.8,
    VehicleClass.CAR: 1.0,
    VehicleClass.LCV: 1.5,
    VehicleClass.BUS_TRUCK: 3.0,
}

AMBER_CLEARANCE_SECONDS: float = 3.0     # hard minimum amber (never shortened)
ALL_RED_CLEARANCE_SECONDS: float = 2.0   # inter-green all-red buffer

LOST_TIME_MIN_SECONDS: float = 2.0       # per-phase lost-time band (bookkeeping only)
LOST_TIME_MAX_SECONDS: float = 4.0

MIN_GREEN_SECONDS: float = 15.0          # hard floor
MAX_GREEN_SECONDS: float = 60.0          # hard ceiling (anti-starvation)

CYCLE_TIME_MIN_SECONDS: float = 40.0     # optimal cycle-length band
CYCLE_TIME_MAX_SECONDS: float = 120.0


# ─────────────────────────────────────────────────────────────────────────
# Data model
# ─────────────────────────────────────────────────────────────────────────

@dataclass
class VehicleCounts:
    """Raw per-class vehicle counts for one corridor, sampled from detection."""
    two_wheeler: int = 0
    auto_rickshaw: int = 0
    car: int = 0
    lcv: int = 0
    bus_truck: int = 0

    def total_vehicles(self) -> int:
        return self.two_wheeler + self.auto_rickshaw + self.car + self.lcv + self.bus_truck

    def pcu_total(self) -> float:
        return (
            self.two_wheeler * PCU_WEIGHTS[VehicleClass.TWO_WHEELER]
            + self.auto_rickshaw * PCU_WEIGHTS[VehicleClass.AUTO_RICKSHAW]
            + self.car * PCU_WEIGHTS[VehicleClass.CAR]
            + self.lcv * PCU_WEIGHTS[VehicleClass.LCV]
            + self.bus_truck * PCU_WEIGHTS[VehicleClass.BUS_TRUCK]
        )


@dataclass
class JunctionSnapshot:
    """Serializable view of controller state at a single instant."""
    active_corridor: Corridor
    signal_state: SignalState
    elapsed_time: float
    ns_pcu: float
    ew_pcu: float
    phase_status: PhaseStatus
    cycle_count: int
    current_cycle_green_cap: float
    last_cycle_length: Optional[float]

    def to_payload(self) -> Dict:
        """Exact wire schema required by the telemetry WebSocket."""
        return {
            "active_corridor": self.active_corridor.value,
            "signal_state": self.signal_state.value,
            "elapsed_time": round(self.elapsed_time, 2),
            "ns_pcu": round(self.ns_pcu, 2),
            "ew_pcu": round(self.ew_pcu, 2),
            "phase_status": self.phase_status.value,
            # Extra diagnostic fields — additive, do not break the required schema.
            "cycle_count": self.cycle_count,
            "green_cap_this_cycle": round(self.current_cycle_green_cap, 2),
            "last_cycle_length_sec": (
                round(self.last_cycle_length, 2) if self.last_cycle_length is not None else None
            ),
        }


# ─────────────────────────────────────────────────────────────────────────
# Controller
# ─────────────────────────────────────────────────────────────────────────

class AdaptiveJunctionController:
    """
    Density-adaptive, PCU-weighted, two-corridor signal arbitrator.

    Lifecycle per cycle:
        GREEN(active) -> AMBER -> ALL_RED -> GREEN(other) -> ...

    Usage:
        controller = AdaptiveJunctionController()
        controller.update_detection(Corridor.NS, VehicleCounts(car=12, bus_truck=1))
        controller.update_detection(Corridor.EW, VehicleCounts(car=3))
        snapshot = controller.tick()   # call at 1 Hz from the broadcast loop
    """

    def __init__(
        self,
        initial_active: Corridor = Corridor.NS,
        min_green: float = MIN_GREEN_SECONDS,
        max_green: float = MAX_GREEN_SECONDS,
        amber_time: float = AMBER_CLEARANCE_SECONDS,
        all_red_time: float = ALL_RED_CLEARANCE_SECONDS,
        cycle_min: float = CYCLE_TIME_MIN_SECONDS,
        cycle_max: float = CYCLE_TIME_MAX_SECONDS,
        clock: Optional[Callable[[], float]] = None,
        rng: Optional[random.Random] = None,
    ) -> None:
        if min_green < 0 or max_green < min_green:
            raise ValueError("max_green must be >= min_green >= 0")
        if amber_time < AMBER_CLEARANCE_SECONDS:
            raise ValueError(
                f"amber_time must be >= IRC 93:1985 minimum of "
                f"{AMBER_CLEARANCE_SECONDS}s"
            )

        self._clock = clock or time.monotonic
        self._rng = rng or random.Random()

        self.min_green = min_green
        self.max_green = max_green
        self.amber_time = amber_time
        self.all_red_time = all_red_time
        self.cycle_min = cycle_min
        self.cycle_max = cycle_max

        self.active_corridor: Corridor = initial_active
        self.signal_state: SignalState = SignalState.GREEN
        self._state_entered_at: float = self._clock()
        self._phase_status: PhaseStatus = PhaseStatus.MIN_GREEN_HOLD

        self.cycle_count: int = 0
        self._pending_corridor: Optional[Corridor] = None

        self._counts: Dict[Corridor, VehicleCounts] = {
            Corridor.NS: VehicleCounts(),
            Corridor.EW: VehicleCounts(),
        }

        # Cycle-length governance: each cycle's green cap is (re)derived so
        # that NS-green + EW-green + fixed clearance overhead stays inside
        # [cycle_min, cycle_max] wherever the hard per-phase bounds allow it.
        self._current_cycle_green_cap: float = self.max_green
        self._last_cycle_length: Optional[float] = None
        self._cycle_started_at: float = self._state_entered_at
        self._recompute_cycle_green_cap()

    # ── Telemetry ingestion ────────────────────────────────────────────

    def update_detection(self, corridor: Corridor, counts: VehicleCounts) -> None:
        """Feed the latest detected per-class vehicle counts for a corridor."""
        self._counts[corridor] = counts

    def _waiting_corridor(self) -> Corridor:
        return Corridor.EW if self.active_corridor == Corridor.NS else Corridor.NS

    def _pcu(self, corridor: Corridor) -> float:
        return self._counts[corridor].pcu_total()

    # ── Cycle-length governance (40-120s optimal band) ──────────────────

    def _sample_lost_time(self) -> float:
        """2-4s of lost capacity attributed to each phase change (IRC 93:1985)."""
        return self._rng.uniform(LOST_TIME_MIN_SECONDS, LOST_TIME_MAX_SECONDS)

    def _recompute_cycle_green_cap(self) -> None:
        """
        Derive the effective green ceiling for THIS cycle so that a full
        NS+EW cycle (both greens + both ambers + both all-reds + two lost-
        time allowances) stays within [cycle_min, cycle_max] whenever the
        hard per-phase bounds leave room to do so. The hard MAX_GREEN_CAP
        is always respected — this can only ever tighten it, never relax it.
        """
        overhead_per_phase = self.amber_time + self.all_red_time + self._sample_lost_time()
        fixed_overhead_total = 2 * overhead_per_phase

        # Budget left for (NS green + EW green) combined if we target the
        # top of the optimal band.
        green_budget_for_cycle = max(0.0, self.cycle_max - fixed_overhead_total)
        per_corridor_cap = green_budget_for_cycle / 2.0

        # Never go below the hard floor, never above the hard ceiling.
        cap = max(self.min_green, min(self.max_green, per_corridor_cap))
        self._current_cycle_green_cap = cap

    # ── Core state machine ───────────────────────────────────────────

    def tick(self) -> JunctionSnapshot:
        """
        Advance the state machine based on wall-clock elapsed time and the
        latest PCU densities, then return a serializable snapshot. Elapsed-
        time based (not tick-count based), so safe to call at any cadence,
        though the broadcast loop drives it at 1 Hz.
        """
        now = self._clock()
        elapsed = now - self._state_entered_at

        if self.signal_state == SignalState.GREEN:
            self._evaluate_green_phase(elapsed)
        elif self.signal_state == SignalState.AMBER:
            self._phase_status = PhaseStatus.AMBER_CLEARANCE
            if elapsed >= self.amber_time:
                self._transition_to(SignalState.ALL_RED, now)
        elif self.signal_state == SignalState.ALL_RED:
            self._phase_status = PhaseStatus.ALL_RED_CLEARANCE
            if elapsed >= self.all_red_time:
                self._start_next_green(now)

        return self._snapshot(now)

    def _evaluate_green_phase(self, elapsed: float) -> None:
        """
        End-of-green decision:
          1. Hard floor  -> never end before min_green.
          2. Dynamic cycle-budget cap -> end once this cycle's governed
             green ceiling is reached (<= hard max_green, see above).
          3. Hard ceiling -> absolute backstop, in case the dynamic cap
             logic ever computed something looser than max_green.
          4. Adaptive density rule -> once min_green has elapsed, extend
             GREEN only while the active corridor's PCU density still
             exceeds the waiting corridor's; yield the instant it doesn't.
        """
        if elapsed < self.min_green:
            self._phase_status = PhaseStatus.MIN_GREEN_HOLD
            return

        if elapsed >= self.max_green:
            self._phase_status = PhaseStatus.MAX_GREEN_CAP
            self._end_green_phase()
            return

        if elapsed >= self._current_cycle_green_cap:
            self._phase_status = PhaseStatus.CYCLE_BUDGET_CAP
            self._end_green_phase()
            return

        active_density = self._pcu(self.active_corridor)
        waiting_density = self._pcu(self._waiting_corridor())

        if active_density <= waiting_density:
            self._phase_status = PhaseStatus.DENSITY_YIELD
            self._end_green_phase()
        else:
            self._phase_status = PhaseStatus.EXTENDING

    def _end_green_phase(self) -> None:
        self._pending_corridor = self._waiting_corridor()
        now = self._clock()
        self._transition_to(SignalState.AMBER, now)

    def _start_next_green(self, now: float) -> None:
        self.active_corridor = self._pending_corridor or self._waiting_corridor()
        self._pending_corridor = None
        self.cycle_count += 1

        self._last_cycle_length = now - self._cycle_started_at
        self._cycle_started_at = now
        self._recompute_cycle_green_cap()

        self._transition_to(SignalState.GREEN, now)
        self._phase_status = PhaseStatus.MIN_GREEN_HOLD

    def _transition_to(self, new_state: SignalState, at_time: float) -> None:
        self.signal_state = new_state
        self._state_entered_at = at_time

    # ── Snapshot / serialization ─────────────────────────────────────

    def _snapshot(self, now: float) -> JunctionSnapshot:
        elapsed = now - self._state_entered_at
        ns_counts = self._counts[Corridor.NS]
        ew_counts = self._counts[Corridor.EW]

        return JunctionSnapshot(
            active_corridor=self.active_corridor,
            signal_state=self.signal_state,
            elapsed_time=elapsed,
            ns_pcu=ns_counts.pcu_total(),
            ew_pcu=ew_counts.pcu_total(),
            phase_status=self._phase_status,
            cycle_count=self.cycle_count,
            current_cycle_green_cap=self._current_cycle_green_cap,
            last_cycle_length=self._last_cycle_length,
        )
