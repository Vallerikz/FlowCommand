export type LookupResult = {
  success?: boolean;
  source?: string;
  registration?: Record<string, unknown>;
  vehicle?: Record<string, unknown>;
  insurance?: Record<string, unknown>;
  pucc?: Record<string, unknown>;
  challans?: unknown[];
  pending_challans?: unknown[];
  [key: string]: unknown;
};

function text(record: Record<string, unknown> | undefined, ...keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="border-b border-border/60 py-1.5">
      <span className="label-caps">{label}</span>
      <p className="data-value text-sm">{value ?? "Not provided by the registry"}</p>
    </div>
  );
}

export function SourceLabel({ source }: { source?: string | undefined }) {
  const value = source ?? "UNKNOWN";
  return (
    <span className="text-[11px] text-muted-foreground">
      Source: <span className="data-value">{value}</span>
      {value === "DEMO_DATA" ? <em className="italic"> (Demo data for UI testing)</em> : null}
    </span>
  );
}

export function statusIsExpired(value: string | null): boolean {
  return Boolean(value && /expired|invalid|lapsed/i.test(value));
}

export function VehicleRecord({ result }: { result: LookupResult }) {
  const reg = result.registration;
  const veh = result.vehicle;
  const ins = result.insurance;
  const pucc = result.pucc;

  const insuranceStatus = text(ins, "status", "state");
  const puccStatus = text(pucc, "status", "state");
  const challans = (result.pending_challans ?? result.challans ?? []) as unknown[];

  const insExpired = statusIsExpired(insuranceStatus);
  const puccExpired = statusIsExpired(puccStatus);

  return (
    <div className="space-y-4">
      <div className="grid gap-x-6 sm:grid-cols-2">
        <Field label="Plate" value={text(reg, "plate", "registration_number", "number")} />
        <Field label="Owner" value={text(reg, "owner", "owner_name", "name")} />
        <Field label="State" value={text(reg, "state")} />
        <Field label="RTO" value={text(reg, "rto", "rto_code", "rto_name")} />
        <Field
          label="Registration date"
          value={text(reg, "registration_date", "registered_on", "date")}
        />
        <Field label="Make / Model" value={text(veh, "make_model", "model", "make")} />
        <Field label="Colour" value={text(veh, "color", "colour")} />
        <Field label="Fuel" value={text(veh, "fuel", "fuel_type")} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div
          className={`rounded-md border p-3 ${
            insExpired ? "border-destructive/50 bg-destructive/10" : "border-border"
          }`}
        >
          <span className="label-caps">Insurance</span>
          <p
            className={`data-value text-lg font-bold ${insExpired ? "text-destructive" : "text-ok"}`}
          >
            {insuranceStatus ?? "Not reported"}
          </p>
          <p className="text-xs text-muted-foreground">
            Valid until: {text(ins, "valid_until", "valid_till", "expiry", "expires_on") ?? "—"}
          </p>
        </div>
        <div
          className={`rounded-md border p-3 ${
            puccExpired ? "border-destructive/50 bg-destructive/10" : "border-border"
          }`}
        >
          <span className="label-caps">PUCC</span>
          <p
            className={`data-value text-lg font-bold ${puccExpired ? "text-destructive" : "text-ok"}`}
          >
            {puccStatus ?? "Not reported"}
          </p>
          <p className="text-xs text-muted-foreground">
            Valid until: {text(pucc, "valid_until", "valid_till", "expiry") ?? "—"}
          </p>
        </div>
      </div>

      <div>
        <span className="label-caps mb-1">Pending challans</span>
        {challans.length ? (
          <ul className="space-y-1 text-sm">
            {challans.map((item, i) => {
              const record = (item ?? {}) as Record<string, unknown>;
              return (
                <li key={i} className="rounded-md border border-border px-3 py-2">
                  <span className="data-value">
                    {text(record, "challan_no", "id", "number") ?? `Challan ${i + 1}`}
                  </span>
                  {" — "}
                  {text(record, "offence", "violation", "reason") ?? "Reason not provided"}
                  {text(record, "amount", "fine") ? (
                    <span className="data-value"> · ₹{text(record, "amount", "fine")}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            The registry returned no pending challans for this vehicle.
          </p>
        )}
      </div>

      <SourceLabel source={typeof result.source === "string" ? result.source : undefined} />
    </div>
  );
}

export { text as recordText };
