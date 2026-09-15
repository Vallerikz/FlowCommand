import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";

import { ApiError, apiRequest } from "@/lib/api";
import { AppShell, BackendUnreachableBanner, RequireAuth } from "@/components/AppShell";
import { VehicleRecord, type LookupResult } from "@/components/VehicleRecord";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/citizen")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Citizen Portal — Check Your Vehicle Status | VIMS" },
      {
        name: "description",
        content:
          "Enter your registration plate to see owner details, insurance and PUCC validity, and any pending challans.",
      },
      { property: "og:title", content: "Citizen Portal — Check Your Vehicle Status | VIMS" },
      {
        property: "og:description",
        content:
          "Look up insurance, PUCC and pending challan details for your vehicle, and start a dispute if something looks wrong.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <CitizenPortal />
    </RequireAuth>
  ),
});

function CitizenPortal() {
  const [plate, setPlate] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setOffline(false);
    setBusy(true);
    setResult(null);
    try {
      const res = await apiRequest<LookupResult>("/api/vehicle/lookup", {
        method: "POST",
        body: { plate: plate.trim().toUpperCase() },
      });
      setResult(res);
      if (res.source === "NOT_FOUND" || res.success === false) {
        setError("No record was found for that plate. Check the characters and try again.");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setOffline(err.offline);
      } else {
        setError("The lookup could not be completed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <BackendUnreachableBanner show={offline} />
      <h1 className="mb-1 mt-3 text-xl font-bold text-primary">Citizen Portal</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Check your vehicle's registry status and any pending fines.
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
        <section className="panel">
          <h3 className="panel-header">Vehicle Lookup</h3>
          <form className="space-y-3 p-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="plate" className="label-caps">
                Registration plate
              </Label>
              <Input
                id="plate"
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                placeholder="MH12DE1433"
                required
                className="font-mono tracking-[0.15em]"
              />
              <p className="text-xs text-muted-foreground">
                Examples: <span className="font-mono">MH12DE1433</span> (new format),{" "}
                <span className="font-mono">DL04CAF5571</span> (older format).
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={busy || !plate.trim()}>
              {busy ? "Checking…" : "Check status"}
            </Button>
            {error ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}
          </form>
        </section>

        <section className="panel">
          <h3 className="panel-header">Result</h3>
          <div className="space-y-4 p-4">
            {result ? (
              <>
                <VehicleRecord result={result} />
                <div className="border-t border-border pt-3">
                  <Button variant="secondary" onClick={() => setDisputeOpen((v) => !v)}>
                    Dispute a challan
                  </Button>
                  {disputeOpen ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Online disputes are not open yet in this build. Keep your plate number and the
                      challan number handy and raise it with your local traffic office.
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Enter a plate on the left to see its registry details.
              </p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
