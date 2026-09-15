import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { ApiError, apiRequest } from "@/lib/api";
import { useLiveSocket } from "@/lib/useLiveSocket";
import type { JunctionState, ModulationState } from "@/lib/junction";
import { AppShell, BackendUnreachableBanner, ConnectionBanner, RequireAuth } from "@/components/AppShell";
import { CameraFeed } from "@/components/junction/CameraFeed";
import { ModulationGrid } from "@/components/junction/ModulationGrid";
import { OverrideControls } from "@/components/junction/OverrideControls";
import { SignalStatePanel } from "@/components/junction/SignalStatePanel";

export const Route = createFileRoute("/command")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Command Centre — Live Junction Signal Control | VIMS" },
      {
        name: "description",
        content:
          "Live adaptive signal state, lane occupancy and regulation overrides for the North-South and East-West corridors.",
      },
      { property: "og:title", content: "Command Centre — Live Junction Signal Control | VIMS" },
      {
        property: "og:description",
        content:
          "Monitor corridor vehicle counts, PCU load and per-arm signals at 1 Hz, and issue confirmed signal overrides.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <CommandCentre />
    </RequireAuth>
  ),
});

function CommandCentre() {
  const telemetry = useLiveSocket<JunctionState>("/ws/junction-telemetry");
  const modulation = useLiveSocket<ModulationState>("/ws/junction-modulation");

  const [snapshot, setSnapshot] = useState<JunctionState | null>(null);
  const [modSnapshot, setModSnapshot] = useState<ModulationState | null>(null);
  const [offline, setOffline] = useState(false);

  // One REST read on load so the panels are populated before the first push.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiRequest<JunctionState>("/api/junction/state"),
      apiRequest<ModulationState>("/api/junction/modulation/state"),
    ])
      .then(([state, mod]) => {
        if (cancelled) return;
        setSnapshot(state);
        setModSnapshot(mod);
        setOffline(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setOffline(error instanceof ApiError && error.offline);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const state = telemetry.data ?? snapshot;
  const grid = modulation.data ?? modSnapshot;
  const worstStatus = telemetry.status === "open" ? modulation.status : telemetry.status;

  return (
    <AppShell lastUpdate={telemetry.lastUpdate ?? modulation.lastUpdate}>
      <BackendUnreachableBanner show={offline} />
      <ConnectionBanner status={worstStatus} />

      <h1 className="mb-3 mt-3 text-xl font-bold text-primary">Command Centre</h1>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <SignalStatePanel state={state} />
          <OverrideControls state={state} />
        </div>
        <div className="space-y-4">
          <CameraFeed />
        </div>
        <div className="space-y-4">
          <ModulationGrid state={grid} />
        </div>
      </div>
    </AppShell>
  );
}
