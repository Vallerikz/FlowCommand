import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, LogOut, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { useAuth } from "@/lib/auth";
import { API_URL } from "@/lib/config";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/command", label: "Command Centre" },
  { to: "/dashboard", label: "ANPR Dashboard" },
  { to: "/citizen", label: "Citizen Portal" },
] as const;

export function BackendUnreachableBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      role="alert"
      className="border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
    >
      <span className="font-semibold">Cannot connect to the VIMS server</span> at{" "}
      <span className="font-mono">{API_URL}</span>. Start the server, then reload this page. No
      figures are shown while the connection is down.
    </div>
  );
}

export function ConnectionBanner({ status }: { status: "connecting" | "open" | "reconnecting" }) {
  if (status === "open") return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-warn/40 bg-warn/10 px-3 py-1.5 text-xs text-warn"
    >
      <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
      {status === "connecting"
        ? "Connecting to the live junction feed…"
        : "Connection lost — reconnecting every 3 seconds. Figures below are the last ones received."}
    </div>
  );
}

export function AppShell({
  children,
  lastUpdate,
}: {
  children: ReactNode;
  lastUpdate?: Date | null;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [signingOut, setSigningOut] = useState(false);

  const handleLogout = async () => {
    setSigningOut(true);
    await logout();
    navigate({ to: "/", replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="gov-stripe h-1" aria-hidden />
      <header className="border-b border-border bg-surface text-surface-foreground">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
          <ShieldCheck className="size-7 shrink-0 text-signal-amber" aria-hidden />
          <div className="mr-auto leading-tight">
            <p className="font-display text-lg font-bold tracking-wide">VIMS</p>
            <p className="text-[11px] uppercase tracking-[0.16em] opacity-75">
              Vehicle Integrated Management System
            </p>
          </div>
          <div className="text-right text-xs leading-snug">
            <p className="font-mono font-semibold">
              {user?.badge_id ?? user?.email ?? user?.name ?? "Session active"}
            </p>
            <p className="opacity-75">{user?.division ?? user?.role ?? "—"}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={handleLogout} disabled={signingOut}>
            <LogOut className="size-4" aria-hidden />
            {signingOut ? "Signing out…" : "Logout"}
          </Button>
        </div>
        <nav aria-label="Sections" className="mx-auto max-w-[1600px] px-2">
          <ul className="flex gap-1 overflow-x-auto">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.to);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    className={`inline-block whitespace-nowrap border-b-2 px-3 py-2 font-display text-[13px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                      active
                        ? "border-signal-amber text-surface-foreground"
                        : "border-transparent text-surface-foreground/65 hover:text-surface-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 sm:px-4">{children}</main>

      <footer className="border-t border-border px-4 py-3 text-center text-[11px] text-muted-foreground">
        VIMS junction control ·{" "}
        {lastUpdate
          ? `Last update ${lastUpdate.toLocaleTimeString()}`
          : "No live update received yet"}
      </footer>
    </div>
  );
}

/** Client-side gate: bounces unauthenticated visitors back to the login page. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, ready } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !isAuthenticated) navigate({ to: "/", replace: true });
  }, [ready, isAuthenticated, navigate]);

  if (!ready || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-sm text-muted-foreground">
        Checking your session…
      </div>
    );
  }
  return <>{children}</>;
}
