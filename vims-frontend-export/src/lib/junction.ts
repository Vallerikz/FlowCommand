/** Shared shapes for junction telemetry / modulation payloads. */

export type Corridor = "NS" | "EW";
export type LightState = "GREEN" | "AMBER" | "RED" | string;

export type CorridorCounts = {
  vehicle_count?: number;
  vehicles?: number;
  count?: number;
  pcu?: number;
  pcu_load?: number;
  classes?: Record<string, number>;
  breakdown?: Record<string, number>;
  class_counts?: Record<string, number>;
};

export type JunctionState = {
  active_corridor?: Corridor;
  light_state?: LightState;
  phase?: string;
  time_in_phase?: number;
  time_in_phase_sec?: number;
  min_green_remaining?: number;
  min_green_remaining_sec?: number;
  total_vehicle_count?: number;
  total_pcu?: number;
  vehicle_counts?: Partial<Record<Corridor, CorridorCounts>>;
  corridors?: Partial<Record<Corridor, CorridorCounts>>;
  [key: string]: unknown;
};

export type ArmSignal = {
  color?: LightState;
  light?: LightState;
  state?: LightState;
  time_in_color?: number;
  time_in_color_sec?: number;
  seconds_in_color?: number;
};

export type ModulationState = {
  grid?: {
    corridors?: Partial<
      Record<
        Corridor,
        {
          lanes?: number[][];
          vehicle_count?: number;
          pcu?: number;
          pcu_load?: number;
        }
      >
    >;
  };
  signals?: Record<string, ArmSignal>;
  [key: string]: unknown;
};

export const VEHICLE_CLASSES = ["motorcycle", "car", "auto", "lcv", "bus_truck"] as const;

export const CLASS_LABELS: Record<string, string> = {
  motorcycle: "Motorcycle",
  car: "Car",
  auto: "Auto",
  lcv: "LCV",
  bus_truck: "Bus / Truck",
  bus: "Bus",
  truck: "Truck",
};

export function corridorCounts(
  state: JunctionState | null,
  corridor: Corridor,
): CorridorCounts | null {
  if (!state) return null;
  return state.vehicle_counts?.[corridor] ?? state.corridors?.[corridor] ?? null;
}

export function vehicleCount(counts: CorridorCounts | null): number | null {
  if (!counts) return null;
  const value = counts.vehicle_count ?? counts.vehicles ?? counts.count;
  return typeof value === "number" ? value : null;
}

export function pcuLoad(counts: CorridorCounts | null): number | null {
  if (!counts) return null;
  const value = counts.pcu ?? counts.pcu_load;
  return typeof value === "number" ? value : null;
}

export function classBreakdown(counts: CorridorCounts | null): Record<string, number> | null {
  if (!counts) return null;
  return counts.classes ?? counts.breakdown ?? counts.class_counts ?? null;
}

export function firstNumber(...values: unknown[]): number | null {
  for (const value of values) if (typeof value === "number" && !Number.isNaN(value)) return value;
  return null;
}

export function armColor(signal: ArmSignal | undefined): LightState | null {
  if (!signal) return null;
  return signal.color ?? signal.light ?? signal.state ?? null;
}

export function armSeconds(signal: ArmSignal | undefined): number | null {
  if (!signal) return null;
  return firstNumber(signal.time_in_color, signal.time_in_color_sec, signal.seconds_in_color);
}
