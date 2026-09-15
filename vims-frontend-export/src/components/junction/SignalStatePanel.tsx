import { SignalChip } from "@/components/SignalLight";
import {
  CLASS_LABELS,
  classBreakdown,
  corridorCounts,
  firstNumber,
  pcuLoad,
  vehicleCount,
  type Corridor,
  type JunctionState,
} from "@/lib/junction";

function Metric({ label, value, suffix }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div>
      <span className="label-caps">{label}</span>
      <p className="data-value text-xl font-semibold">
        {value === null ? "—" : `${value}${suffix ?? ""}`}
      </p>
    </div>
  );
}

function CorridorCard({ state, corridor }: { state: JunctionState | null; corridor: Corridor }) {
  const counts = corridorCounts(state, corridor);
  const breakdown = classBreakdown(counts);
  const entries = breakdown ? Object.entries(breakdown) : [];

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-baseline justify-between">
        <h4 className="font-display text-base font-bold">{corridor}</h4>
        <p className="data-value text-sm">
          {vehicleCount(counts) ?? "—"} veh · {pcuLoad(counts)?.toFixed(1) ?? "—"} PCU
        </p>
      </div>
      {entries.length ? (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {entries.map(([key, value]) => (
            <div key={key} className="flex justify-between gap-2 border-b border-border/60 pb-0.5">
              <dt className="text-muted-foreground">{CLASS_LABELS[key] ?? key}</dt>
              <dd className="data-value">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          No class breakdown reported for this corridor.
        </p>
      )}
    </div>
  );
}

export function SignalStatePanel({ state }: { state: JunctionState | null }) {
  const timeInPhase = firstNumber(state?.time_in_phase, state?.time_in_phase_sec);
  const minGreen = firstNumber(state?.min_green_remaining, state?.min_green_remaining_sec);

  const nsCount = vehicleCount(corridorCounts(state, "NS"));
  const ewCount = vehicleCount(corridorCounts(state, "EW"));
  const total =
    firstNumber(state?.total_vehicle_count) ??
    (nsCount !== null && ewCount !== null ? nsCount + ewCount : null);
  const totalPcu =
    firstNumber(state?.total_pcu) ??
    (() => {
      const a = pcuLoad(corridorCounts(state, "NS"));
      const b = pcuLoad(corridorCounts(state, "EW"));
      return a !== null && b !== null ? Number((a + b).toFixed(1)) : null;
    })();

  return (
    <section className="panel" aria-label="Signal state">
      <h3 className="panel-header">Signal State</h3>
      <div className="space-y-4 p-4">
        {!state ? (
          <p className="text-sm text-muted-foreground">
            Waiting for the first snapshot from the junction controller.
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="label-caps">Active corridor</span>
            <p className="font-display text-3xl font-bold tracking-wide">
              {state?.active_corridor ?? "—"}
            </p>
          </div>
          <div>
            <span className="label-caps">Active light</span>
            <div className="mt-0.5">
              <SignalChip color={state?.light_state ?? null} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-4">
          <Metric label="Time in phase" value={timeInPhase} suffix="s" />
          <Metric label="Min green left" value={minGreen} suffix="s" />
          <Metric label="Total vehicles" value={total} />
          <div>
            <span className="label-caps">Total PCU</span>
            <p className="data-value text-xl font-semibold">{totalPcu?.toFixed(1) ?? "—"}</p>
          </div>
        </div>

        {state?.phase ? (
          <p className="text-xs text-muted-foreground">
            Controller phase: <span className="data-value">{state.phase}</span>
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <CorridorCard state={state} corridor="NS" />
          <CorridorCard state={state} corridor="EW" />
        </div>
      </div>
    </section>
  );
}
