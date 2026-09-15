import { AlertTriangle, Check } from "lucide-react";
import { useState } from "react";

import { ApiError, apiRequest } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { JunctionState } from "@/lib/junction";

type Command = "FORCE_NS" | "FORCE_EW" | "ALL_RED" | "RESUME_AUTO";

const COMMANDS: Array<{
  command: Command;
  label: string;
  confirm: string;
  variant: "destructive" | "secondary";
}> = [
  {
    command: "FORCE_NS",
    label: "Force NS Green",
    confirm: "Force the North-South corridor to green for 60 seconds?",
    variant: "destructive",
  },
  {
    command: "FORCE_EW",
    label: "Force EW Green",
    confirm: "Force the East-West corridor to green for 60 seconds?",
    variant: "destructive",
  },
  {
    command: "ALL_RED",
    label: "Emergency All-Red",
    confirm: "Hold every approach at red? All traffic through this junction will be stopped.",
    variant: "destructive",
  },
  {
    command: "RESUME_AUTO",
    label: "Resume Auto",
    confirm: "Hand control back to the adaptive controller?",
    variant: "secondary",
  },
];

export function OverrideControls({ state }: { state: JunctionState | null }) {
  const [pending, setPending] = useState<Command | null>(null);
  const [sending, setSending] = useState<Command | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeCorridor = state?.active_corridor ?? null;
  const light = (state?.light_state ?? "").toString().toUpperCase();

  const disabledReason = (command: Command): string | null => {
    if (command === "FORCE_NS" && activeCorridor === "NS" && light === "GREEN")
      return "North-South is already green.";
    if (command === "FORCE_EW" && activeCorridor === "EW" && light === "GREEN")
      return "East-West is already green.";
    return null;
  };

  const send = async (command: Command) => {
    setSending(command);
    setError(null);
    setResult(null);
    try {
      const res = await apiRequest<{ success?: boolean; message?: string }>(
        "/api/junction/regulation-override",
        { method: "POST", body: { command } },
      );
      setResult(res?.message ?? `Server accepted ${command}.`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "The override could not be sent. Try again.",
      );
    } finally {
      setSending(null);
    }
  };

  const pendingSpec = COMMANDS.find((c) => c.command === pending) ?? null;

  return (
    <section className="panel" aria-label="Regulation override">
      <h3 className="panel-header">
        Regulation Override
        <span className="font-sans text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
          Law enforcement only
        </span>
      </h3>
      <div className="space-y-3 p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {COMMANDS.map((spec) => {
            const reason = disabledReason(spec.command);
            return (
              <Button
                key={spec.command}
                variant={spec.variant}
                size="lg"
                title={reason ?? undefined}
                disabled={Boolean(reason) || sending !== null}
                aria-describedby={reason ? `${spec.command}-reason` : undefined}
                onClick={() => setPending(spec.command)}
                className={`h-12 font-display text-sm font-bold uppercase tracking-[0.1em] ${
                  sending === spec.command ? "ring-4 ring-ring" : ""
                }`}
              >
                {sending === spec.command ? "Sending…" : spec.label}
              </Button>
            );
          })}
        </div>

        {COMMANDS.map((spec) => {
          const reason = disabledReason(spec.command);
          return reason ? (
            <p key={spec.command} id={`${spec.command}-reason`} className="sr-only">
              {reason}
            </p>
          ) : null;
        })}

        {result ? (
          <p className="flex items-start gap-2 rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">
            <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
            {result}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm signal override</AlertDialogTitle>
            <AlertDialogDescription>{pendingSpec?.confirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingSpec) void send(pendingSpec.command);
                setPending(null);
              }}
            >
              Send override
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
