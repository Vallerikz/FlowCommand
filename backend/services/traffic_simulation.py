"""
VIMS — Indian Road Traffic Simulation Engine
============================================
Simulates realistic, heterogeneous Indian traffic dynamics across junction corridors:
- Heterogeneous vehicle mix: Motorcycles, Autos, Cars, LCVs (Tempos), Buses & Trucks.
- Dynamic Indian-style overtaking: Agile bikes and cars dynamically overtake slow-moving
  trucks and tempos by utilizing lateral sub-lane gaps.
- 2-Vehicles-Per-Lane Logic: Real Indian traffic lanes accommodate two vehicles abreast
  (two bikes in parallel, bike + car sharing lane, or dual-queued vehicles at stopline).
- Rich Vehicle Tooltip Details: Complete vehicle registration, telemetry, speed,
  lane position, coordinates, and compliance metadata for frontend minimap hover tooltips.
"""

from __future__ import annotations

import math
import random
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple, Any

from backend.traffic_engine import Corridor, LightState, VehicleClass, PCU_WEIGHTS


# ──────────────────────────────────────────────────────────────────────────
# Vehicle Class Configuration & Indian Road Characteristics
# ──────────────────────────────────────────────────────────────────────────

@dataclass
class VehicleClassConfig:
    vehicle_class: VehicleClass
    display_name: str
    pcu: float
    min_speed_kmh: float
    max_speed_kmh: float
    acceleration_mps2: float
    length_m: float
    width_m: float
    overtake_tendency: float  # 0.0 to 1.0 likelihood to initiate overtake when blocked
    color: str                # hex color for minimap rendering
    sample_models: List[str]


CLASS_CONFIGS: Dict[VehicleClass, VehicleClassConfig] = {
    VehicleClass.MOTORCYCLE: VehicleClassConfig(
        vehicle_class=VehicleClass.MOTORCYCLE,
        display_name="Motorcycle / Two-Wheeler",
        pcu=0.5,
        min_speed_kmh=35.0,
        max_speed_kmh=58.0,
        acceleration_mps2=3.0,
        length_m=2.1,
        width_m=0.8,
        overtake_tendency=0.85,
        color="#38bdf8",  # vibrant sky blue
        sample_models=[
            "Bajaj Pulsar 150",
            "Royal Enfield Classic 350",
            "Honda Activa 6G",
            "TVS Apache RTR 160",
            "Hero Splendor Plus",
            "Yamaha FZ-S FI",
            "Suzuki Access 125",
            "KTM Duke 200",
        ],
    ),
    VehicleClass.AUTO: VehicleClassConfig(
        vehicle_class=VehicleClass.AUTO,
        display_name="Auto-Rickshaw (3-Wheeler)",
        pcu=0.8,
        min_speed_kmh=28.0,
        max_speed_kmh=44.0,
        acceleration_mps2=1.8,
        length_m=2.7,
        width_m=1.3,
        overtake_tendency=0.70,
        color="#eab308",  # energetic yellow
        sample_models=[
            "Bajaj RE Compact Auto",
            "Piaggio Ape City Plus",
            "Mahindra Alfa Dx",
            "TVS King Deluxe",
            "Bajaj Maxima Z CNG",
        ],
    ),
    VehicleClass.CAR: VehicleClassConfig(
        vehicle_class=VehicleClass.CAR,
        display_name="Passenger Car (LMV)",
        pcu=1.0,
        min_speed_kmh=38.0,
        max_speed_kmh=62.0,
        acceleration_mps2=2.2,
        length_m=3.9,
        width_m=1.7,
        overtake_tendency=0.60,
        color="#10b981",  # emerald green
        sample_models=[
            "Maruti Suzuki Swift VXi",
            "Hyundai Creta SX",
            "Tata Nexon EV",
            "Mahindra Thar LX",
            "Honda City ZX",
            "Maruti Suzuki Baleno",
            "Kia Seltos HTX",
            "Tata Punch Creative",
        ],
    ),
    VehicleClass.LCV: VehicleClassConfig(
        vehicle_class=VehicleClass.LCV,
        display_name="Light Commercial Vehicle (Tempo)",
        pcu=1.5,
        min_speed_kmh=24.0,
        max_speed_kmh=38.0,
        acceleration_mps2=1.2,
        length_m=4.4,
        width_m=1.8,
        overtake_tendency=0.18,
        color="#a855f7",  # purple
        sample_models=[
            "Tata Ace Gold (Chota Hathi)",
            "Mahindra Bolero Maxi Truck",
            "Ashok Leyland Dost+",
            "Tata 407 Light Commercial",
            "Maruti Suzuki Super Carry",
        ],
    ),
    VehicleClass.BUS_TRUCK: VehicleClassConfig(
        vehicle_class=VehicleClass.BUS_TRUCK,
        display_name="Heavy Vehicle (Bus / Truck)",
        pcu=3.0,
        min_speed_kmh=18.0,
        max_speed_kmh=32.0,
        acceleration_mps2=0.8,
        length_m=8.6,
        width_m=2.4,
        overtake_tendency=0.03,
        color="#f97316",  # heavy orange
        sample_models=[
            "Ashok Leyland 1618 Cargo Truck",
            "PMPML City Transit Bus (Tata Starbus)",
            "BharatBenz 2823C Heavy Tipper",
            "Tata Signa 2823.K Transit",
            "Eicher Pro 3015 Truck",
            "Maharashtra State Road Transport (MSRTC Bus)",
        ],
    ),
}

# Indian RTO Plate Presets with authentic city codes
INDIAN_PLATE_REGIONS = [
    ("MH12", "Pune Central", "Maharashtra"),
    ("MH14", "Pimpri-Chinchwad", "Maharashtra"),
    ("MH01", "Mumbai South", "Maharashtra"),
    ("MH02", "Mumbai West", "Maharashtra"),
    ("MH04", "Thane", "Maharashtra"),
    ("DL04", "Delhi West", "Delhi"),
    ("DL08", "Delhi North", "Delhi"),
    ("KA01", "Bangalore Central", "Karnataka"),
    ("KA03", "Bangalore East", "Karnataka"),
    ("GJ01", "Ahmedabad", "Gujarat"),
]

INDIAN_OWNERS = [
    ("Kavita Suresh Patil", "ACTIVE", 3, "Speed violation & signal jump challans pending"),
    ("Rajesh Kumar Sharma", "ACTIVE", 0, "No pending violations. Verified owner."),
    ("Amit Deshmukh", "ACTIVE", 1, "Lane obstruction challan pending"),
    ("Pooja Mehta", "ACTIVE", 0, "Clean record. Commercial driver."),
    ("Sunil Tukaram Shinde", "ACTIVE", 2, "Over-speeding violation (64 km/h in 40 km/h zone)"),
    ("Santosh Jagtap", "ACTIVE", 0, "No active offenses."),
    ("Vikas Tukaram More", "ACTIVE", 1, "Stopline encroachment recorded"),
    ("Anand Kulkarni", "ACTIVE", 0, "Clean record."),
    ("Ganesh Shinde", "ACTIVE", 0, "Commercial permit valid."),
    ("Bharat Logistics Corp", "ACTIVE", 4, "Commercial route permit audit pending"),
    ("Pune Mahanagar Parivahan (PMPML)", "ACTIVE", 0, "Municipal transit fleet. Priority clearance authorized."),
    ("Western Infrastructure Ltd", "ACTIVE", 1, "Overweight cargo permit pending inspection"),
]


# ──────────────────────────────────────────────────────────────────────────
# Simulated Vehicle Entity
# ──────────────────────────────────────────────────────────────────────────

@dataclass
class SimulatedVehicle:
    """
    Rich simulated vehicle entity modeling realistic Indian mixed-traffic
    behavior with 2-vehicles-per-lane support, dynamic overtaking, and
    detailed tooltip data.
    """
    id: str
    corridor: Corridor
    lane_id: str                      # e.g. "LANE-1-NS" or "LANE-2-EW"
    lane_number: int                  # 1 or 2
    sub_lane: int                     # 0 = Left/Inner, 1 = Right/Outer (ALLOWS 2 VEHICLES PER LANE!)
    sub_lane_name: str                # "Left Sub-Lane" or "Right Sub-Lane"
    vehicle_class: VehicleClass
    make_model: str
    plate_number: str
    pcu: float

    # Kinematics
    position_m: float                 # 0.0 (entry) to 125.0 (exit), stopline at 90.0m
    speed_kmh: float
    target_speed_kmh: float
    lateral_offset: float             # Normalized lateral position across lane width (-0.40 to +0.40)
    target_lateral_offset: float

    # Status & Overtaking
    status: str                       # "CRUISING", "OVERTAKING", "LANE_SPLITTING", "QUEUED", "STOPPED", "ACCELERATING"
    is_overtaking: bool = False
    overtake_target_id: Optional[str] = None
    overtake_target_desc: Optional[str] = None
    overtake_progress: float = 0.0    # 0.0 to 1.0 progress of overtake maneuver
    overtake_boost: float = 1.0

    # 2-Vehicles-Per-Lane Sharing
    lane_sharing: bool = False
    lane_sharing_with_id: Optional[str] = None
    lane_sharing_with_desc: Optional[str] = None

    # Turn Intent & Blinker Telemetry (U-turns, Inter-Corridor Turns, Indicators)
    turn_intent: str = "straight"       # "straight", "turn_left", "turn_right", "u_turn"
    turn_blinker: Optional[str] = None # "left", "right", None
    blinker: str = "NONE"              # "NONE", "LEFT", "RIGHT"
    is_turning: bool = False           # True while actively executing the turn arc in junction
    target_corridor: Optional[str] = None # "NS" or "EW"
    turn_progress: float = 0.0         # 0.0 to 1.0 progress through turn arc
    yield_waiting: bool = False        # True while yielding to oncoming priority traffic

    # Hover Tooltip / Registration metadata
    owner_name: str = "Registered Citizen"
    rc_status: str = "ACTIVE"
    fuel_type: str = "PETROL"
    rto: str = "Pune Central (MH-12)"
    state: str = "Maharashtra"
    insurance_status: str = "ACTIVE"
    insurance_valid_until: str = "2027-08-15"
    pucc_status: str = "VALID"
    pucc_valid_until: str = "2027-04-10"
    pending_challans: int = 0
    challan_notes: str = "None"
    violation_alert: Optional[str] = None
    color: str = "#38bdf8"
    length_m: float = 3.8
    width_m: float = 1.7
    spawned_at: float = field(default_factory=time.time)

    # 2D Minimap Coordinates (normalized 0.0 to 1.0 & 400x400 px)
    x_norm: float = 0.5
    y_norm: float = 0.5
    x_px: int = 200
    y_px: int = 200
    heading_deg: float = 0.0

    def compute_coordinates(self) -> None:
        """
        Maps the 1D longitudinal position and lateral offset onto a standardized
        400x400 minimap grid and normalized [0, 1] coordinate system.
        Supports smooth U-turn arcs and inter-corridor turn curves.

        Junction layout:
        - NS corridor: Vertical travel (North to South). Center line x = 0.50.
          Stopline at y = 0.40 (160px). Junction box: y in [0.40, 0.60]. Exit at y = 0.95.
          Sub-lane 0 (left): x ~ 0.47, Sub-lane 1 (right): x ~ 0.53.
        - EW corridor: Horizontal travel (West to East). Center line y = 0.50.
          Stopline at x = 0.40 (160px). Junction box: x in [0.40, 0.60]. Exit at x = 0.95.
          Sub-lane 0 (top): y ~ 0.47, Sub-lane 1 (bottom): y ~ 0.53.
        """
        progress = max(0.0, min(1.0, self.position_m / 120.0))

        if not self.is_turning:
            if self.corridor == Corridor.NS:
                # Regular Southbound travel (North to South)
                self.heading_deg = 180.0
                lane_width_norm = 0.09  # visual width of full lane
                self.x_norm = 0.50 + (self.lateral_offset * lane_width_norm)
                self.y_norm = 0.05 + (progress * 0.90)
            else:
                # Regular Eastbound travel (West to East)
                self.heading_deg = 90.0
                lane_width_norm = 0.09
                self.y_norm = 0.50 + (self.lateral_offset * lane_width_norm)
                self.x_norm = 0.05 + (progress * 0.90)
        else:
            # Active Turn Trajectory Modeling
            tp = max(0.0, min(1.0, self.turn_progress))
            t_intent = str(self.turn_intent).lower()
            if self.corridor == Corridor.NS:
                if t_intent in ("u_turn", "uturn"):
                    # Indian U-turn: sweeps 180 deg right across median opening at junction box
                    # Center of U-turn loop around (0.50, 0.44), radius ~0.04
                    angle = math.pi * tp  # 0 to pi
                    self.x_norm = 0.50 + (0.04 * math.sin(angle))
                    self.y_norm = 0.44 - (0.04 * math.cos(angle))
                    self.heading_deg = (180.0 + (180.0 * tp)) % 360.0
                elif t_intent in ("turn_left", "left"):
                    # Southbound turning Left into Eastbound (NS -> EW)
                    angle = (math.pi / 2.0) * tp
                    self.x_norm = 0.47 + (0.09 * (1.0 - math.cos(angle)))
                    self.y_norm = 0.40 + (0.10 * math.sin(angle))
                    self.heading_deg = 180.0 - (90.0 * tp)
                elif t_intent in ("turn_right", "right"):
                    # Southbound turning Right across junction into Westbound (NS -> EW)
                    angle = (math.pi / 2.0) * tp
                    self.x_norm = 0.53 - (0.11 * math.sin(angle))
                    self.y_norm = 0.42 + (0.09 * (1.0 - math.cos(angle)))
                    self.heading_deg = 180.0 + (90.0 * tp)
            else:
                # Corridor.EW: Eastbound approaching from West (left)
                if t_intent in ("u_turn", "uturn"):
                    # U-turn right across horizontal median
                    angle = math.pi * tp
                    self.y_norm = 0.50 + (0.04 * math.sin(angle))
                    self.x_norm = 0.44 - (0.04 * math.cos(angle))
                    self.heading_deg = (90.0 + (180.0 * tp)) % 360.0
                elif t_intent in ("turn_left", "left"):
                    # Eastbound turning Left into Northbound (EW -> NS)
                    angle = (math.pi / 2.0) * tp
                    self.y_norm = 0.47 - (0.09 * (1.0 - math.cos(angle)))
                    self.x_norm = 0.40 + (0.10 * math.sin(angle))
                    self.heading_deg = 90.0 - (90.0 * tp)
                elif t_intent in ("turn_right", "right"):
                    # Eastbound turning Right into Southbound (EW -> NS)
                    angle = (math.pi / 2.0) * tp
                    self.y_norm = 0.53 + (0.11 * math.sin(angle))
                    self.x_norm = 0.42 + (0.09 * (1.0 - math.cos(angle)))
                    self.heading_deg = 90.0 + (90.0 * tp)

        # Scale to 400x400 canvas pixels
        self.x_px = int(round(self.x_norm * 400))
        self.y_px = int(round(self.y_norm * 400))

    def to_tooltip_dict(self) -> Dict[str, Any]:
        """
        Produces the complete, rich dictionary consumable by the frontend
        minimap hover tooltip component with zero client-side calculation needed.
        """
        stopline_dist = round(max(0.0, 90.0 - self.position_m), 1)

        status_badge = self.status
        if self.yield_waiting:
            status_badge = "YIELDING (ONCOMING TRAFFIC CLEARANCE)"
        elif self.is_turning:
            status_badge = f"EXECUTING {self.turn_intent.replace('_', ' ')}"
        elif self.is_overtaking:
            status_badge = "OVERTAKING DYNAMICALLY"
        elif self.lane_sharing:
            status_badge = "SHARING LANE (2 VEHICLES ABREAST)"
        elif self.status == "STOPPED":
            status_badge = "QUEUED AT SIGNAL"

        return {
            "id": self.id,
            "plate": self.plate_number,
            "plate_number": self.plate_number,
            "make_model": self.make_model,
            "model": self.make_model,
            "vehicle_class": self.vehicle_class.value.lower(),
            "display_class": CLASS_CONFIGS[self.vehicle_class].display_name,
            "speed_kmh": round(self.speed_kmh, 1),
            "target_speed_kmh": round(self.target_speed_kmh, 1),
            "pcu": self.pcu,
            "corridor": self.corridor.value,
            "lane_id": self.lane_id,
            "lane_number": self.lane_number,
            "sub_lane": self.sub_lane,
            "sub_lane_name": self.sub_lane_name,
            "lateral_offset": round(self.lateral_offset, 2),
            "position_m": round(self.position_m, 1),
            "distance_to_stopline_m": stopline_dist,
            "progress_pct": round((self.position_m / 120.0) * 100.0, 1),
            "status": self.status,
            "status_badge": status_badge,
            "is_overtaking": self.is_overtaking,
            "overtake_target": self.overtake_target_desc,
            "overtake_target_id": self.overtake_target_id,
            "overtake_progress_pct": round(self.overtake_progress * 100.0, 1) if self.is_overtaking else 0,
            "lane_sharing": self.lane_sharing,
            "lane_sharing_with_id": self.lane_sharing_with_id,
            "lane_sharing_with": self.lane_sharing_with_desc,
            "lane_sharing_info": (
                f"Sharing Lane {self.lane_number} side-by-side with {self.lane_sharing_with_desc}"
                if self.lane_sharing else "Solo in Lane Slot"
            ),
            # Turn Intent & Blinker Telemetry
            "turn_intent": self.turn_intent,
            "turn_blinker": self.turn_blinker,
            "blinker": self.blinker,
            "is_turning": self.is_turning,
            "target_corridor": self.target_corridor,
            "turn_progress_pct": round(self.turn_progress * 100.0, 1) if self.is_turning else 0,
            "yield_waiting": self.yield_waiting,
            # Indian Registration Details
            "owner_name": self.owner_name,
            "rc_status": self.rc_status,
            "fuel_type": self.fuel_type,
            "rto": self.rto,
            "state": self.state,
            "insurance_status": self.insurance_status,
            "insurance_valid_until": self.insurance_valid_until,
            "pucc_status": self.pucc_status,
            "pucc_valid_until": self.pucc_valid_until,
            "pending_challans": self.pending_challans,
            "challan_notes": self.challan_notes,
            "violation_alert": self.violation_alert,
            "compliance_badge": "FLAGGED" if self.violation_alert or self.pending_challans > 2 else "VERIFIED",
            # Minimap coordinates
            "color": self.color,
            "x_norm": round(self.x_norm, 4),
            "y_norm": round(self.y_norm, 4),
            "x_px": self.x_px,
            "y_px": self.y_px,
            "heading_deg": self.heading_deg,
            "length_m": self.length_m,
            "width_m": self.width_m,
            # Pre-formatted HTML/text lines for lightweight tooltip rendering
            "tooltip_lines": [
                f"<b>{self.plate_number}</b> — {self.make_model}",
                f"<b>Type:</b> {CLASS_CONFIGS[self.vehicle_class].display_name} (PCU {self.pcu})",
                f"<b>Speed:</b> {round(self.speed_kmh, 1)} km/h • <b>Status:</b> {status_badge}",
                f"<b>Lane:</b> {self.lane_id} ({self.sub_lane_name})",
                f"<b>Turn Intent:</b> {self.turn_intent.replace('_', ' ').title()} • <b>Blinker:</b> {self.turn_blinker or 'None'} ({self.blinker})",
                f"<b>Lane Sharing:</b> {'Yes (2 Vehicles Abreast)' if self.lane_sharing else 'Single slot'}",
                f"<b>Overtaking:</b> {'Yes ➜ ' + str(self.overtake_target_desc) if self.is_overtaking else 'No'}",
                f"<b>Owner:</b> {self.owner_name} ({self.rto})",
                f"<b>RC / PUCC:</b> {self.rc_status} / {self.pucc_status} • Challans: {self.pending_challans}",
            ],
        }


# ──────────────────────────────────────────────────────────────────────────
# Indian Road Traffic Simulation Engine
# ──────────────────────────────────────────────────────────────────────────

class IndianTrafficSimulationEngine:
    """
    High-fidelity Indian Road Traffic Simulator implementing:
    1. Realistic heterogeneous vehicle mix with Indian models & plates.
    2. Dynamic overtaking logic (bikes/cars overtaking trucks/tempos).
    3. 2-vehicles-per-lane concurrency (dual sub-lanes per roadway lane).
    4. Full state export for minimap hover tooltips and live WebSockets.
    """

    STOP_LINE_M: float = 90.0
    INTERSECTION_EXIT_M: float = 120.0

    def __init__(self, target_vehicles_per_corridor: int = 12) -> None:
        self.target_count: int = target_vehicles_per_corridor
        self._vehicles: Dict[Corridor, List[SimulatedVehicle]] = {
            Corridor.NS: [],
            Corridor.EW: [],
        }
        self._plate_counter: int = 1000
        self._last_tick_time: float = time.time()

        # Seed initial vehicles across both corridors
        self._seed_initial_vehicles(Corridor.NS, count=10)
        self._seed_initial_vehicles(Corridor.EW, count=8)

    # ── Factory Helpers ───────────────────────────────────────────────

    def _generate_plate(self, vclass: VehicleClass) -> Tuple[str, str, str]:
        """Generates an authentic Indian license plate number based on class."""
        self._plate_counter += 1
        region, rto, state = random.choice(INDIAN_PLATE_REGIONS)
        series_letter = random.choice(["AB", "CD", "EF", "GH", "JK", "MN", "PQ", "RS"])
        num = 1000 + (self._plate_counter % 8999)

        if vclass in (VehicleClass.LCV, VehicleClass.BUS_TRUCK, VehicleClass.AUTO):
            # Commercial yellow board plate convention
            plate = f"{region}T{num}"
        else:
            plate = f"{region}{series_letter}{num}"

        return plate, rto, state

    def _create_vehicle(
        self,
        corridor: Corridor,
        position_m: float,
        vclass: Optional[VehicleClass] = None,
        sub_lane: Optional[int] = None,
    ) -> SimulatedVehicle:
        """Instantiates a realistic Indian vehicle with full registry profile."""
        if vclass is None:
            # Indian road vehicle distribution weights
            # ~35% Motorcycles, ~18% Autos, ~32% Cars, ~8% LCVs (tempos), ~7% Heavy trucks/buses
            vclass = random.choices(
                population=[
                    VehicleClass.MOTORCYCLE,
                    VehicleClass.AUTO,
                    VehicleClass.CAR,
                    VehicleClass.LCV,
                    VehicleClass.BUS_TRUCK,
                ],
                weights=[35, 18, 32, 8, 7],
                k=1,
            )[0]

        cfg = CLASS_CONFIGS[vclass]
        plate, rto, state = self._generate_plate(vclass)
        owner_tuple = random.choice(INDIAN_OWNERS)

        # Lane assignment: allow 2 vehicles in a single lane
        # If sub_lane is not specified, balance between sub_lane 0 (curb) and 1 (median)
        if sub_lane is None:
            corridor_vehs = self._vehicles[corridor]
            sub0_count = sum(1 for v in corridor_vehs if v.sub_lane == 0)
            sub1_count = sum(1 for v in corridor_vehs if v.sub_lane == 1)
            sub_lane = 0 if sub0_count <= sub1_count else 1

        # Turn intent and blinker assignment based on Indian road lane rules:
        # Curb lane (sub_lane 0): 18% left turn (turn_blinker = 'left'), 82% straight (turn_blinker = None)
        # Median lane (sub_lane 1): 1% U-turn (turn_blinker = 'right'), 12% right turn (turn_blinker = 'right'), 87% straight (turn_blinker = None)
        if sub_lane == 0:
            sub_lane_name = "Left Sub-Lane (Curb)"
            roll = random.random()
            if roll < 0.18:
                turn_intent = "turn_left"
                turn_blinker = "left"
                blinker = "LEFT"
                target_corridor = "EW" if corridor == Corridor.NS else "NS"
            else:
                turn_intent = "straight"
                turn_blinker = None
                blinker = "NONE"
                target_corridor = None
        else:
            sub_lane_name = "Right Sub-Lane (Median)"
            roll = random.random()
            if roll < 0.01:
                turn_intent = "u_turn"
                turn_blinker = "right"
                blinker = "RIGHT"
                target_corridor = corridor.value
            elif roll < 0.01 + 0.12:  # 0.13
                turn_intent = "turn_right"
                turn_blinker = "right"
                blinker = "RIGHT"
                target_corridor = "EW" if corridor == Corridor.NS else "NS"
            else:
                turn_intent = "straight"
                turn_blinker = None
                blinker = "NONE"
                target_corridor = None

        # Lateral offsets: 0 = left (-0.28), 1 = right (+0.28)
        base_lateral = -0.28 if sub_lane == 0 else 0.28
        # Add micro-jitter (Indian roads weaving)
        jitter = random.uniform(-0.06, 0.06)
        lateral_offset = base_lateral + jitter

        lane_id = "LANE-1-NS" if corridor == Corridor.NS else "LANE-2-EW"
        lane_num = 1 if corridor == Corridor.NS else 2

        # Desired cruising speed
        target_speed = random.uniform(cfg.min_speed_kmh, cfg.max_speed_kmh)

        fuel_type = "PETROL"
        if vclass in (VehicleClass.LCV, VehicleClass.BUS_TRUCK):
            fuel_type = "DIESEL"
        elif vclass == VehicleClass.AUTO:
            fuel_type = "CNG"
        elif "EV" in random.choice(cfg.sample_models):
            fuel_type = "ELECTRIC"

        veh_id = f"VEH-{corridor.value}-{plate[-4:]}"

        veh = SimulatedVehicle(
            id=veh_id,
            corridor=corridor,
            lane_id=lane_id,
            lane_number=lane_num,
            sub_lane=sub_lane,
            sub_lane_name=sub_lane_name,
            vehicle_class=vclass,
            make_model=random.choice(cfg.sample_models),
            plate_number=plate,
            pcu=cfg.pcu,
            position_m=position_m,
            speed_kmh=target_speed * random.uniform(0.75, 1.0),
            target_speed_kmh=target_speed,
            lateral_offset=lateral_offset,
            target_lateral_offset=base_lateral,
            status="CRUISING",
            turn_intent=turn_intent,
            turn_blinker=turn_blinker,
            blinker=blinker,
            target_corridor=target_corridor,
            owner_name=owner_tuple[0],
            rc_status=owner_tuple[1],
            fuel_type=fuel_type,
            rto=rto,
            state=state,
            insurance_status="ACTIVE" if random.random() > 0.08 else "EXPIRED",
            insurance_valid_until=f"202{random.randint(6, 9)}-{random.randint(1, 12):02d}-15",
            pucc_status="VALID" if random.random() > 0.12 else "EXPIRED",
            pucc_valid_until=f"202{random.randint(6, 8)}-{random.randint(1, 12):02d}-20",
            pending_challans=owner_tuple[2],
            challan_notes=owner_tuple[3],
            violation_alert=None if owner_tuple[2] < 2 else owner_tuple[3],
            color=cfg.color,
            length_m=cfg.length_m,
            width_m=cfg.width_m,
        )
        veh.compute_coordinates()
        return veh

    def _seed_initial_vehicles(self, corridor: Corridor, count: int) -> None:
        """Distributes vehicles along the corridor approach (staggered positions)."""
        # Spaced out along 15m to 85m
        positions = sorted(random.sample(range(12, 85), min(count, 14)))
        for i, pos in enumerate(positions):
            # Alternate sub-lanes to immediately show 2-vehicles-per-lane
            sub = i % 2
            vclass = None
            if i == 2:
                vclass = VehicleClass.BUS_TRUCK
            elif i == 3:
                vclass = VehicleClass.LCV
            elif i in (0, 1):
                vclass = VehicleClass.MOTORCYCLE
            elif i in (4, 5):
                vclass = VehicleClass.CAR

            veh = self._create_vehicle(corridor, position_m=float(pos), vclass=vclass, sub_lane=sub)
            # Ensure immediate turn & blinker activity on startup for demonstration
            if i == 1:
                veh.turn_intent = "turn_right"
                veh.turn_blinker = "right"
                veh.blinker = "RIGHT"
                veh.target_corridor = "EW" if corridor == Corridor.NS else "NS"
            elif i == 4:
                veh.turn_intent = "turn_left"
                veh.turn_blinker = "left"
                veh.blinker = "LEFT"
                veh.target_corridor = "EW" if corridor == Corridor.NS else "NS"
            elif i == 5:
                veh.turn_intent = "u_turn"
                veh.turn_blinker = "right"
                veh.blinker = "RIGHT"
                veh.target_corridor = corridor.value

            self._vehicles[corridor].append(veh)

    # ── Simulation Update Step ────────────────────────────────────────

    def tick(
        self,
        active_corridor: Corridor,
        light_state: LightState,
        dt: float = 1.0,
        sub_phase: str = "THROUGH",
        arrow_l: str = "OFF",
        arrow_r: str = "OFF",
    ) -> None:
        """
        Advances the simulation by dt seconds:
        - Evaluates light state, sub-phases & turn arrow gating at stop line.
        - Executes dynamic Indian-style overtaking logic.
        - Executes U-turns and inter-corridor turns with blinker indicator telemetry.
        - Enforces collision safety and yielding to oncoming traffic.
        - Updates 2-vehicles-per-lane concurrency and sub-lane lateral positions.
        - Injects micro-speed fluctuations.
        - Spawns new vehicles to maintain corridor density.
        """
        dt = max(0.1, min(2.0, dt))
        inter_corridor_transfers: List[Tuple[SimulatedVehicle, Corridor]] = []

        for corridor in (Corridor.NS, Corridor.EW):
            is_active = (corridor == active_corridor)
            is_green = (is_active and light_state == LightState.GREEN and sub_phase == "THROUGH")
            is_amber = (is_active and (light_state == LightState.AMBER or sub_phase in ("THROUGH_AMBER", "TURN_AMBER")))
            is_red = not is_green and not is_amber
            corridor_sub_phase = sub_phase if is_active else "ALL_RED"
            corridor_arrow_l = arrow_l if is_active else "OFF"
            corridor_arrow_r = arrow_r if is_active else "OFF"

            vehicles = self._vehicles[corridor]
            # Sort by position descending (furthest down the lane / closest to exit first)
            vehicles.sort(key=lambda v: v.position_m, reverse=True)

            # Process vehicles from front to back
            for i, veh in enumerate(vehicles):
                transferred_corridor = self._update_vehicle_kinematics(
                    veh=veh,
                    corridor_vehicles=vehicles,
                    index=i,
                    is_green=is_green,
                    is_amber=is_amber,
                    is_red=is_red,
                    dt=dt,
                    sub_phase=corridor_sub_phase,
                    arrow_l=corridor_arrow_l,
                    arrow_r=corridor_arrow_r,
                )
                if transferred_corridor is not None:
                    inter_corridor_transfers.append((veh, transferred_corridor))

            # Prune vehicles that have cleared the corridor exit (> 122m)
            self._vehicles[corridor] = [
                v for v in vehicles
                if v.position_m < self.INTERSECTION_EXIT_M and not any(v.id == t[0].id for t in inter_corridor_transfers)
            ]

            # Replenish vehicles if below target count
            while len(self._vehicles[corridor]) < self.target_count:
                closest_start = min([v.position_m for v in self._vehicles[corridor]], default=999.0)
                if closest_start > 8.0:
                    new_veh = self._create_vehicle(corridor, position_m=random.uniform(0.0, 5.0))
                    self._vehicles[corridor].append(new_veh)
                else:
                    break

            # Detect and tag lane-sharing pairs (2 vehicles abreast in the same lane)
            self._update_lane_sharing_tags(corridor)

        # Complete inter-corridor transfers (e.g. NS -> EW or EW -> NS)
        for veh, target_corridor in inter_corridor_transfers:
            veh.corridor = target_corridor
            veh.lane_id = "LANE-2-EW" if target_corridor == Corridor.EW else "LANE-1-NS"
            veh.lane_number = 2 if target_corridor == Corridor.EW else 1
            veh.position_m = 96.0  # Entering the target corridor clearance path
            veh.is_turning = False
            veh.turn_intent = "straight"
            veh.turn_blinker = None
            veh.blinker = "NONE"
            veh.status = "CRUISING"
            veh.compute_coordinates()
            self._vehicles[target_corridor].append(veh)

    def _update_vehicle_kinematics(
        self,
        veh: SimulatedVehicle,
        corridor_vehicles: List[SimulatedVehicle],
        index: int,
        is_green: bool,
        is_amber: bool,
        is_red: bool,
        dt: float,
        sub_phase: str = "THROUGH",
        arrow_l: str = "OFF",
        arrow_r: str = "OFF",
    ) -> Optional[Corridor]:
        """
        Kinematics update for a single vehicle including overtaking, braking, traffic light rules,
        turn arrow gating, U-turn execution, inter-corridor turns, and blinker indicator telemetry.
        Returns target Corridor if an inter-corridor turn completes, otherwise None.
        """
        cfg = CLASS_CONFIGS[veh.vehicle_class]
        completed_transfer_corridor: Optional[Corridor] = None

        # Normalize intent and blinker
        intent_lower = str(veh.turn_intent).lower()
        blinker_lower = str(veh.turn_blinker).lower() if veh.turn_blinker else None

        is_left_turn = (blinker_lower == "left" or intent_lower in ("turn_left", "left"))
        is_right_turn = (blinker_lower == "right" or intent_lower in ("turn_right", "right", "u_turn", "uturn"))
        is_straight = not is_left_turn and not is_right_turn

        # 1. Blinker / Turn Signal Telemetry Management
        if is_left_turn:
            veh.blinker = "LEFT"
        elif is_right_turn:
            veh.blinker = "RIGHT"
        elif veh.is_overtaking:
            target_sub = 1 - veh.sub_lane
            veh.blinker = "RIGHT" if target_sub == 1 else "LEFT"
        else:
            veh.blinker = "NONE"

        # 2. Identify vehicle ahead in the SAME sub-lane
        lead_same_sub: Optional[SimulatedVehicle] = None
        lead_dist_same = 999.0

        for other in corridor_vehicles:
            if other.id != veh.id and other.sub_lane == veh.sub_lane and other.position_m > veh.position_m:
                dist = other.position_m - veh.position_m - other.length_m
                if dist < lead_dist_same:
                    lead_dist_same = dist
                    lead_same_sub = other

        # 3. Check for vehicle ahead in the ADJACENT sub-lane (for overtaking clearance)
        target_sub_lane = 1 - veh.sub_lane
        adj_clear = True
        for other in corridor_vehicles:
            if other.id != veh.id and other.sub_lane == target_sub_lane:
                if abs(other.position_m - veh.position_m) < 8.0:
                    adj_clear = False
                    break

        # 4. Dynamic Overtaking Logic (Indian Road Style)
        # Slower trucks and tempos are dynamically overtaken by agile bikes, autos, and cars
        if lead_same_sub is not None and lead_dist_same < 18.0 and not veh.is_turning and is_straight and veh.position_m < 70.0:
            speed_diff_kmh = veh.speed_kmh - lead_same_sub.speed_kmh
            lead_is_slow = lead_same_sub.vehicle_class in (VehicleClass.BUS_TRUCK, VehicleClass.LCV) or lead_same_sub.speed_kmh < 30.0

            if (speed_diff_kmh > 4.0 or lead_is_slow) and adj_clear and not veh.is_overtaking:
                if random.random() < cfg.overtake_tendency:
                    veh.is_overtaking = True
                    veh.overtake_target_id = lead_same_sub.id
                    veh.overtake_target_desc = f"{lead_same_sub.make_model} ({CLASS_CONFIGS[lead_same_sub.vehicle_class].display_name})"
                    veh.overtake_progress = 0.0
                    veh.overtake_boost = random.uniform(1.15, 1.28)  # Indian acceleration burst
                    veh.status = "LANE_SPLITTING" if veh.vehicle_class == VehicleClass.MOTORCYCLE else "OVERTAKING"
                    veh.target_lateral_offset = 0.28 if target_sub_lane == 1 else -0.28

        # Advance ongoing overtake
        if veh.is_overtaking:
            veh.overtake_progress = min(1.0, veh.overtake_progress + (dt * 0.35))
            diff = veh.target_lateral_offset - veh.lateral_offset
            veh.lateral_offset += diff * min(1.0, dt * 2.5)

            target_veh = next((v for v in corridor_vehicles if v.id == veh.overtake_target_id), None)
            if target_veh is not None and veh.position_m > (target_veh.position_m + target_veh.length_m + 3.0):
                veh.is_overtaking = False
                veh.sub_lane = target_sub_lane
                veh.sub_lane_name = "Left Sub-Lane" if veh.sub_lane == 0 else "Right Sub-Lane"
                veh.status = "CRUISING"
                veh.overtake_boost = 1.0
                veh.target_lateral_offset = -0.28 if veh.sub_lane == 0 else 0.28
            elif target_veh is None or veh.overtake_progress >= 1.0:
                veh.is_overtaking = False
                veh.sub_lane = target_sub_lane
                veh.sub_lane_name = "Left Sub-Lane" if veh.sub_lane == 0 else "Right Sub-Lane"
                veh.status = "CRUISING"
                veh.overtake_boost = 1.0

        # 5. Stop Line Gating Logic & Permitted Movement Check
        # - Left-turn vehicles (turn_blinker == 'left') only proceed when arrow_l == 'GREEN'
        # - Right-turn / U-turn vehicles (turn_blinker == 'right') only proceed when arrow_r == 'GREEN'
        # - Straight vehicles (turn_blinker is None) only proceed when light_state == 'GREEN' and sub_phase == 'THROUGH'
        if is_left_turn:
            movement_permitted = (arrow_l == "GREEN")
        elif is_right_turn:
            movement_permitted = (arrow_r == "GREEN")
        else:
            movement_permitted = (is_green and sub_phase in ("THROUGH", "GREEN"))

        # 6. Turn Arc Initiation & Opposing Traffic Yielding
        must_yield = False
        if not veh.is_turning and 85.0 <= veh.position_m <= 92.0:
            if is_left_turn:
                if arrow_l == "GREEN":
                    veh.yield_waiting = False
                    veh.is_turning = True
                    veh.turn_progress = 0.0
                    veh.status = "EXECUTING TURN LEFT"
            elif is_right_turn:
                if arrow_r == "GREEN":
                    # Check for conflicting vehicles in intersection conflict zone (82m to 105m)
                    has_conflict = False
                    for other in corridor_vehicles:
                        if other.id != veh.id and 82.0 <= other.position_m <= 105.0 and other.speed_kmh > 15.0:
                            if abs(other.position_m - veh.position_m) < 12.0:
                                has_conflict = True
                                break

                    if has_conflict:
                        must_yield = True
                        veh.yield_waiting = True
                        veh.status = "YIELDING"
                    else:
                        veh.yield_waiting = False
                        veh.is_turning = True
                        veh.turn_progress = 0.0
                        veh.status = f"EXECUTING {intent_lower.upper().replace('_', ' ')}"

        # 7. Turn Execution & Arc Progress
        if veh.is_turning:
            veh.turn_progress = min(1.0, veh.turn_progress + (dt * 0.35))
            veh.status = f"EXECUTING {intent_lower.upper().replace('_', ' ')}"

            if veh.turn_progress >= 1.0:
                if intent_lower in ("u_turn", "uturn"):
                    # U-turn complete: loops around median into return flow
                    veh.is_turning = False
                    veh.turn_intent = "straight"
                    veh.turn_blinker = None
                    veh.blinker = "NONE"
                    veh.status = "CRUISING"
                    veh.position_m = 98.0
                    veh.target_lateral_offset = -0.28
                    veh.sub_lane = 0
                    veh.sub_lane_name = "Left Sub-Lane"
                elif intent_lower in ("turn_left", "left", "turn_right", "right"):
                    # Inter-corridor turn complete: trigger transfer
                    target_corridor_enum = Corridor.EW if veh.corridor == Corridor.NS else Corridor.NS
                    completed_transfer_corridor = target_corridor_enum

        # 8. Speed Target & Braking / Stopping
        stop_line_dist = self.STOP_LINE_M - veh.position_m
        target_speed_mps = (veh.target_speed_kmh * veh.overtake_boost) / 3.6

        if veh.is_turning:
            # Controlled turning speed (~20 km/h)
            target_speed_mps = min(target_speed_mps, 20.0 / 3.6)

        jitter_mps = random.uniform(-0.5, 0.5)
        target_speed_mps = max(3.0, target_speed_mps + jitter_mps)

        must_stop = False
        target_stop_pos = self.STOP_LINE_M - 2.0  # 88m stop line

        if must_yield:
            must_stop = True
            target_stop_pos = min(target_stop_pos, 88.0)
        elif not movement_permitted:
            # The signal for this vehicle's movement is NOT green!
            if 0 < stop_line_dist < 60.0:
                must_stop = True
                if lead_same_sub is not None and lead_same_sub.position_m > veh.position_m:
                    target_stop_pos = min(target_stop_pos, lead_same_sub.position_m - lead_same_sub.length_m - 2.0)
            elif stop_line_dist <= 0 and not veh.is_turning:
                # Crossed stopline before light changed; clear intersection
                target_speed_mps = max(target_speed_mps, 42.0 / 3.6)
        else:
            # Movement IS green / permitted!
            if lead_same_sub is not None and lead_same_sub.position_m > veh.position_m:
                dist = lead_same_sub.position_m - veh.position_m - lead_same_sub.length_m
                if dist < 2.5:
                    must_stop = True
                    target_stop_pos = min(target_stop_pos, lead_same_sub.position_m - lead_same_sub.length_m - 2.0)
                elif dist < 12.0:
                    target_speed_mps = min(target_speed_mps, max(0.0, lead_same_sub.speed_kmh / 3.6))
            if stop_line_dist <= 0 and not veh.is_turning:
                target_speed_mps = max(target_speed_mps, 42.0 / 3.6)

        # Kinematics integration
        current_speed_mps = veh.speed_kmh / 3.6

        if must_stop and veh.position_m < target_stop_pos:
            dist_to_stop = target_stop_pos - veh.position_m
            if dist_to_stop < 1.0:
                current_speed_mps = 0.0
                if not veh.yield_waiting:
                    veh.status = "STOPPED"
            else:
                decel = max(1.2, (current_speed_mps ** 2) / (2.0 * max(0.5, dist_to_stop)))
                current_speed_mps = max(0.0, current_speed_mps - (decel * dt))
                if not veh.yield_waiting:
                    veh.status = "DECELERATING"
        elif not must_stop:
            if current_speed_mps < target_speed_mps:
                accel = cfg.acceleration_mps2
                if veh.vehicle_class == VehicleClass.MOTORCYCLE:
                    accel *= 1.4  # Bikes launch quickest
                current_speed_mps = min(target_speed_mps, current_speed_mps + (accel * dt))
                if veh.status == "STOPPED":
                    veh.status = "ACCELERATING"
            else:
                current_speed_mps = max(target_speed_mps, current_speed_mps - (1.5 * dt))
                if not veh.is_overtaking and not veh.is_turning and not veh.yield_waiting:
                    veh.status = "CRUISING"

        veh.speed_kmh = current_speed_mps * 3.6
        veh.position_m += current_speed_mps * dt

        lat_diff = veh.target_lateral_offset - veh.lateral_offset
        veh.lateral_offset += lat_diff * min(1.0, dt * 1.5)

        veh.compute_coordinates()
        return completed_transfer_corridor

    def _update_lane_sharing_tags(self, corridor: Corridor) -> None:
        """
        Scans all vehicles in this corridor to identify vehicles that are currently
        occupying the single roadway lane abreast (2-vehicles-per-lane).
        """
        vehicles = self._vehicles[corridor]
        for v in vehicles:
            v.lane_sharing = False
            v.lane_sharing_with_id = None
            v.lane_sharing_with_desc = None

        sub0 = [v for v in vehicles if v.sub_lane == 0]
        sub1 = [v for v in vehicles if v.sub_lane == 1]

        for v0 in sub0:
            for v1 in sub1:
                if abs(v0.position_m - v1.position_m) <= (max(v0.length_m, v1.length_m) + 3.5):
                    v0.lane_sharing = True
                    v0.lane_sharing_with_id = v1.id
                    v0.lane_sharing_with_desc = f"{v1.make_model} ({v1.plate_number})"

                    v1.lane_sharing = True
                    v1.lane_sharing_with_id = v0.id
                    v1.lane_sharing_with_desc = f"{v0.make_model} ({v0.plate_number})"

    # ── Export & Telemetry Feed ───────────────────────────────────────

    def get_corridor_counts(self, corridor: Corridor) -> Dict[str, int]:
        """Calculates live per-class vehicle counts directly from simulated vehicles."""
        counts = {
            "motorcycle": 0,
            "auto": 0,
            "car": 0,
            "lcv": 0,
            "bus_truck": 0,
        }
        for v in self._vehicles[corridor]:
            counts[v.vehicle_class.value.lower()] += 1
        return counts

    def get_all_vehicles_tooltip_payload(self) -> List[Dict[str, Any]]:
        """Returns the full list of all active vehicles formatted for hover tooltips."""
        payload: List[Dict[str, Any]] = []
        for corridor in (Corridor.NS, Corridor.EW):
            for v in self._vehicles[corridor]:
                payload.append(v.to_tooltip_dict())
        return payload

    def get_corridor_vehicles(self, corridor: Corridor) -> List[Dict[str, Any]]:
        """Returns active vehicles for a specific corridor formatted for hover tooltips."""
        return [v.to_tooltip_dict() for v in self._vehicles[corridor]]

    def get_simulation_summary(self) -> Dict[str, Any]:
        """Summary statistics for monitoring and debugging."""
        all_vehs = self._vehicles[Corridor.NS] + self._vehicles[Corridor.EW]
        overtaking_count = sum(1 for v in all_vehs if v.is_overtaking)
        lane_sharing_count = sum(1 for v in all_vehs if v.lane_sharing)
        turning_count = sum(1 for v in all_vehs if v.is_turning)
        blinker_active_count = sum(1 for v in all_vehs if v.blinker in ("LEFT", "RIGHT"))
        left_turn_count = sum(1 for v in all_vehs if str(v.turn_blinker).lower() == "left" or str(v.turn_intent).lower() in ("turn_left", "left"))
        right_turn_count = sum(1 for v in all_vehs if str(v.turn_blinker).lower() == "right" or str(v.turn_intent).lower() in ("turn_right", "right", "u_turn", "uturn"))
        straight_count = sum(1 for v in all_vehs if (v.turn_blinker is None or v.turn_blinker == "NONE") and str(v.turn_intent).lower() in ("straight", "none"))
        u_turn_count = sum(1 for v in all_vehs if str(v.turn_intent).lower() in ("u_turn", "uturn"))
        inter_corridor_turn_count = sum(1 for v in all_vehs if str(v.turn_intent).lower() in ("turn_left", "turn_right", "left", "right"))

        return {
            "total_active_vehicles": len(all_vehs),
            "ns_vehicle_count": len(self._vehicles[Corridor.NS]),
            "ew_vehicle_count": len(self._vehicles[Corridor.EW]),
            "overtaking_vehicles_count": overtaking_count,
            "lane_sharing_vehicles_count": lane_sharing_count,
            "turning_vehicles_count": turning_count,
            "blinker_active_count": blinker_active_count,
            "turn_left_count": left_turn_count,
            "turn_right_count": right_turn_count,
            "straight_count": straight_count,
            "u_turn_count": u_turn_count,
            "inter_corridor_turn_count": inter_corridor_turn_count,
            "capacity_per_lane": 2,
            "simulation_mode": "INDIAN_ROAD_DYNAMIC_OVERTAKING_DUAL_SLOT_WITH_TURNS",
        }


# Global simulation instance shared across router & controller
simulation_engine = IndianTrafficSimulationEngine()
