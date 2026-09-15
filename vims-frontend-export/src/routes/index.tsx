import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { API_URL } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "VIMS Sign In — Traffic Signal Control & ANPR" },
      {
        name: "description",
        content:
          "Sign in to VIMS to control adaptive traffic signals, run plate recognition and check vehicle registry records.",
      },
      { property: "og:title", content: "VIMS Sign In — Traffic Signal Control & ANPR" },
      {
        property: "og:description",
        content:
          "Law enforcement and citizen access to the VIMS adaptive traffic signal and vehicle registry console.",
      },
    ],
  }),
  component: LoginPage,
});

const DIVISIONS = [
  "Traffic & Transport Enforcement",
  "State Police",
  "Federal Intelligence",
  "Forensic Cyber",
  "Armed Forces Command",
];

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

function LoginPage() {
  const { login, isAuthenticated, ready, user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"law" | "citizen">("law");

  const [badgeId, setBadgeId] = useState("TRF0001");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");

  const [identifier, setIdentifier] = useState("");
  const [citizenOtp, setCitizenOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);

  // Already signed in? Go straight to the right console.
  useEffect(() => {
    if (!ready || !isAuthenticated) return;
    const role = typeof user?.role === "string" ? user.role : null;
    navigate({ to: role === "citizen" ? "/citizen" : "/command", replace: true });
  }, [ready, isAuthenticated, user, navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setOffline(false);
    setBusy(true);
    try {
      if (tab === "law") {
        if (!/^\d{6}$/.test(otp)) throw new ApiError("The OTP must be exactly 6 digits.", 400);
        const account = await login({
          role: "law",
          badge_id: badgeId.trim(),
          division: DIVISIONS[0]!,
          password,
          otp,
        });
        navigate({ to: account?.role === "citizen" ? "/citizen" : "/command", replace: true });
      } else {
        if (!identifier.trim()) throw new ApiError("Enter your mobile number or email.", 400);
        if (!/^\d{6}$/.test(citizenOtp))
          throw new ApiError("The OTP must be exactly 6 digits.", 400);
        await login({ role: "citizen", email: identifier.trim(), otp: citizenOtp });
        navigate({ to: "/citizen", replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setOffline(err.offline);
      } else {
        setError("Something went wrong while signing in. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="gov-stripe h-1" aria-hidden />
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex flex-col items-center text-center">
            <ShieldCheck className="size-10 text-primary" aria-hidden />
            <h1 className="mt-2 text-2xl font-bold text-primary">VIMS</h1>
            <p className="label-caps mt-1">Vehicle Integrated Management System</p>
          </div>

          <div className="panel overflow-hidden">
            <div role="tablist" aria-label="Access type" className="grid grid-cols-2">
              {(
                [
                  ["law", "Law Enforcement"],
                  ["citizen", "Citizen Portal"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => {
                    setTab(value);
                    setError(null);
                  }}
                  className={`border-b-2 px-3 py-3 font-display text-xs font-bold uppercase tracking-[0.14em] transition-colors ${
                    tab === value
                      ? "border-primary bg-card text-primary"
                      : "border-transparent bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <form className="space-y-4 p-5" onSubmit={submit}>
              {tab === "law" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="badge" className="label-caps">
                      Badge ID
                    </Label>
                    <Input
                      id="badge"
                      value={badgeId}
                      onChange={(e) => setBadgeId(e.target.value.toUpperCase())}
                      autoComplete="username"
                      required
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="label-caps">
                      Password
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="division" className="label-caps">
                      Division
                    </Label>
                    <select
                      id="division"
                      disabled
                      aria-describedby="division-note"
                      value={DIVISIONS[0]}
                      className="h-9 w-full rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground"
                    >
                      {DIVISIONS.map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                    <p id="division-note" className="text-xs text-muted-foreground">
                      Assigned from your badge ID by the server — shown for information only.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="otp" className="label-caps">
                      One-time code
                    </Label>
                    <Input
                      id="otp"
                      inputMode="numeric"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      placeholder="6 digits"
                      required
                      className="font-mono tracking-[0.4em]"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="identifier" className="label-caps">
                      Mobile number or email
                    </Label>
                    <Input
                      id="identifier"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="citizen-otp" className="label-caps">
                      One-time code
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="citizen-otp"
                        inputMode="numeric"
                        maxLength={6}
                        value={citizenOtp}
                        onChange={(e) => setCitizenOtp(e.target.value.replace(/\D/g, ""))}
                        placeholder="6 digits"
                        required
                        className="font-mono tracking-[0.4em]"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setOtpSent(true)}
                        disabled={!identifier.trim()}
                      >
                        Send code
                      </Button>
                    </div>
                    {otpSent ? (
                      <p className="text-xs text-muted-foreground">
                        No message is actually sent in this build — enter any 6 digits accepted by
                        the server.
                      </p>
                    ) : null}
                  </div>
                </>
              )}

              {error ? <ErrorNote message={error} /> : null}
              {offline ? (
                <p className="text-xs text-muted-foreground">
                  The console expects the VIMS server at <span className="font-mono">{API_URL}</span>
                  . Start it and try again.
                </p>
              ) : null}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Signing in…" : "Login"}
              </Button>

              {tab === "law" ? (
                <p className="text-xs text-muted-foreground">
                  Demo access: badge <span className="font-mono">TRF0001</span>, the password set in{" "}
                  <span className="font-mono">VIMS_DEMO_OFFICER_PASSWORD</span> (default{" "}
                  <span className="font-mono">demo-pass-change-me</span>), and any 6-digit code.
                </p>
              ) : null}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
