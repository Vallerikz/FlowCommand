import { SignalLight } from "@/components/SignalLight";
import { armColor, armSeconds, type Corridor, type ModulationState } from "@/lib/junction";

const ARMS = ["N", "S", "E", "W"] as const;
const CELLS = 8;
const LANES = 2;
/** PCU per cell — fixed scale, so a filled cell always means the same thing. */
const PCU_PER_CELL = 2.5;

function laneCells(
  lanes: number[][] | undefined,
  laneIndex: number,
  corridorPcu: number | null,
): boolean[] {
  const provided = lanes?.[laneIndex];
  if (Array.isArray(provided)) {
    return Array.from({ length: CELLS }, (_, i) => (provided[i] ?? 0) > 0);
  }
  if (corridorPcu === null) return Array.from({ length: CELLS }, () => false);
  // Derived deterministically from the controller's PCU load, split across lanes.
  const filled = Math.min(CELLS, Math.floor(corridorPcu / LANES / PCU_PER_CELL));
  return Array.from({ length: CELLS }, (_, i) => i < filled);
}

function CorridorGrid({
  corridor,
  data,
}: {
  corridor: Corridor;
  data: ModulationState["grid"] extends infer _ ? Record<string, unknown> | undefined : never;
}) {
  const record = (data ?? {}) as {
    lanes?: number[][];
    vehicle_count?: number;
    pcu?: number;
    pcu_load?: number;
  };
  const pcu = typeof record.pcu === "number" ? record.pcu : (record.pcu_load ?? null);
  const count = typeof record.vehicle_count === "number" ? record.vehicle_count : null;

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-baseline justify-between">
        <h4 className="font-display text-sm font-bold tracking-[0.1em]">{corridor} CORRIDOR</h4>
        <p className="data-value text-xs">
          {count ?? "—"} veh · {typeof pcu === "number" ? pcu.toFixed(1) : "—"} PCU
        </p>
      </div>
      <div className="mt-2 space-y-1.5">
        {Array.from({ length: LANES }, (_, laneIndex) => (
          <div key={laneIndex} className="flex items-center gap-2">
            <span className="label-caps w-12 shrink-0">Lane {laneIndex + 1}</span>
            <div className="flex flex-1 gap-1">
              {laneCells(record.lanes, laneIndex, typeof pcu === "number" ? pcu : null).map(
                (occupied, cellIndex) => (
                  <span
                    key={cellIndex}
                    title={`Cell ${cellIndex} (${cellIndex === 0 ? "at stop line" : `${cellIndex} back`})`}
                    className={`h-5 flex-1 rounded-sm border border-border ${
                      occupied ? "bg-signal-green-soft" : "bg-card"
                    }`}
                  />
                ),
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        Cell 0 is at the stop line. One filled cell = {PCU_PER_CELL} PCU.
      </p>
    </div>
  );
}

export function ModulationGrid({ state }: { state: ModulationState | null }) {
  const corridors = state?.grid?.corridors;

  return (
    <section className="panel" aria-label="Traffic modulation">
      <h3 className="panel-header">Traffic Modulation</h3>
      <div className="space-y-3 p-4">
        {!state ? (
          <p className="text-sm text-muted-foreground">Waiting for the lane occupancy feed.</p>
        ) : null}
        <CorridorGrid corridor="NS" data={corridors?.NS as never} />
        <CorridorGrid corridor="EW" data={corridors?.EW as never} />

        <div className="border-t border-border pt-3">
          <span className="label-caps mb-2">Per-arm signal</span>
          <div className="grid grid-cols-4 gap-2">
            {ARMS.map((arm) => {
              const signal = state?.signals?.[arm];
              const color = armColor(signal);
              const seconds = armSeconds(signal);
              return (
                <div
                  key={arm}
                  className="flex flex-col items-center gap-1 rounded-md border border-border py-2"
                >
                  <span className="font-display text-sm font-bold">{arm}</span>
                  <SignalLight color={color} label={`Arm ${arm} ${color ?? "unknown"}`} />
                  <span className="data-value text-[11px]">{color ?? "—"}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {seconds === null ? "—" : `${seconds}s`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
