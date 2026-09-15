const TONE: Record<string, string> = {
  GREEN: "bg-signal-green",
  AMBER: "bg-signal-amber",
  YELLOW: "bg-signal-amber",
  RED: "bg-signal-red",
};

function toneFor(color: string | null | undefined): string {
  if (!color) return "bg-muted";
  return TONE[color.toUpperCase()] ?? "bg-muted";
}

/** Circular per-arm indicator. Unknown state renders neutral, never a guess. */
export function SignalLight({
  color,
  size = "md",
  label,
}: {
  color: string | null | undefined;
  size?: "sm" | "md";
  label?: string;
}) {
  const dimension = size === "sm" ? "size-5" : "size-8";
  return (
    <span
      className={`inline-block rounded-full ring-2 ring-border ${dimension} ${toneFor(color)}`}
      role="img"
      aria-label={label ?? `Signal ${color ?? "state unknown"}`}
    />
  );
}

/** Square colour-coded chip with the state written out. */
export function SignalChip({ color }: { color: string | null | undefined }) {
  const text = color ? color.toUpperCase() : "UNKNOWN";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`size-6 rounded-sm ring-2 ring-border ${toneFor(color)}`} aria-hidden />
      <span className="font-display text-2xl font-bold tracking-wide">{text}</span>
    </span>
  );
}
