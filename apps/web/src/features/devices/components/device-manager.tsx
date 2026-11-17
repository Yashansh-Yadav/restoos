"use client";

import { registerDeviceSchema, type Device, type PairingCodeResponse } from "@restoos/shared";
import { ChevronRight, Loader2, MonitorSmartphone, Plus } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useDevices, useNewPairingCode, useRegisterDevice, useUnpairDevice } from "../hooks";

// /owner/devices (M1-T6): register restaurant devices and pair them with a one-time code.
// English for now; owner screens move to the i18n helper when it lands.

type Mode = { kind: "add" } | { kind: "manage"; device: Device } | null;

const relative = new Intl.RelativeTimeFormat("en-IN", { numeric: "auto" });
function lastSeen(iso: string | null): string {
  if (!iso) return "Never used";
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return `Last used ${relative.format(minutes, "minute")}`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `Last used ${relative.format(hours, "hour")}`;
  return `Last used ${relative.format(Math.round(hours / 24), "day")}`;
}

const errorMessage = (err: unknown) =>
  err instanceof ApiError && err.status !== 500
    ? err.message
    : "Couldn't save. Check your connection and try again.";

export function DeviceManager({
  outletId,
  initial,
}: {
  outletId: string;
  initial: { devices: Device[] };
}) {
  const { data } = useDevices(outletId, initial);
  const [mode, setMode] = useState<Mode>(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] leading-tight font-bold">Devices</h1>
          <p className="text-sm text-pretty text-muted-foreground">
            Tablets and phones your staff sign in on with their PIN.
          </p>
        </div>
        <Button onClick={() => setMode({ kind: "add" })}>
          <Plus aria-hidden="true" />
          Add Device
        </Button>
      </div>

      {data.devices.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border px-6 py-12 text-center">
          <MonitorSmartphone className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-base font-semibold">No devices yet</p>
          <p className="max-w-xs text-sm text-pretty text-muted-foreground">
            Add your counter tablet, kitchen tablet or a staff phone. You&apos;ll get a code to
            enter on it once.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {data.devices.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => setMode({ kind: "manage", device: d })}
                className="flex min-h-touch-staff w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                aria-label={`Manage ${d.label}, ${d.paired ? "paired" : "not paired"}`}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-base font-semibold">{d.label}</span>
                  <span className="text-sm text-muted-foreground" suppressHydrationWarning>
                    {lastSeen(d.lastSeenAt)}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    d.paired
                      ? "bg-muted text-foreground"
                      : "border border-border text-muted-foreground",
                  )}
                >
                  {d.paired ? "Paired" : "Not paired"}
                </span>
                <span
                  className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold tabular-nums"
                  translate="no"
                  aria-label={`Invoice code ${d.code}`}
                >
                  {d.code}
                </span>
                <ChevronRight
                  className="size-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        {mode?.kind === "add" ? (
          <AddDeviceSheet outletId={outletId} onClose={() => setMode(null)} />
        ) : mode?.kind === "manage" ? (
          <ManageDeviceSheet
            key={mode.device.id}
            outletId={outletId}
            device={mode.device}
            onClose={() => setMode(null)}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function AddDeviceSheet({ outletId, onClose }: { outletId: string; onClose: () => void }) {
  const ids = { label: useId(), station: useId(), error: useId() };
  const [label, setLabel] = useState("");
  const [isStation, setIsStation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [issued, setIssued] = useState<PairingCodeResponse | null>(null);
  const register = useRegisterDevice(outletId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = registerDeviceSchema.safeParse({ label, isStation });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the name");
      document.getElementById(ids.label)?.focus();
      return;
    }
    try {
      setIssued(await register.mutateAsync(parsed.data));
    } catch (err) {
      setFormError(errorMessage(err));
    }
  }

  if (issued) return <PairingCodeView issued={issued} onDone={onClose} />;

  return (
    <SheetContent title="Add Device">
      <form className="flex flex-col gap-5 pt-2" onSubmit={(e) => void onSubmit(e)} noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.label}>Device Name</Label>
          <Input
            id={ids.label}
            name="label"
            autoComplete="off"
            placeholder="e.g. Counter tablet…"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${ids.error}`}
          />
          {error ? (
            <p id={ids.error} className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : (
            <p id={ids.error} className="text-sm text-muted-foreground">
              Something staff will recognise, like &ldquo;Kitchen tablet&rdquo;.
            </p>
          )}
        </div>

        <label
          htmlFor={ids.station}
          className="flex min-h-touch cursor-pointer items-start gap-3 rounded-md border border-input px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
        >
          <input
            id={ids.station}
            type="checkbox"
            checked={isStation}
            onChange={(e) => setIsStation(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-foreground"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-base font-semibold">Shared Station</span>
            <span className="text-sm text-body">
              A fixed screen everyone can hear, like the kitchen tablet. It gets loud service-bell
              alerts.
            </span>
          </span>
        </label>

        {formError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        ) : null}
        <Button type="submit" disabled={register.isPending}>
          {register.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {register.isPending ? "Adding…" : "Add & Get Code"}
        </Button>
      </form>
    </SheetContent>
  );
}

function ManageDeviceSheet({
  outletId,
  device,
  onClose,
}: {
  outletId: string;
  device: Device;
  onClose: () => void;
}) {
  const [issued, setIssued] = useState<PairingCodeResponse | null>(null);
  const [confirmUnpair, setConfirmUnpair] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const newCode = useNewPairingCode(outletId);
  const unpair = useUnpairDevice(outletId);

  if (issued) return <PairingCodeView issued={issued} onDone={onClose} />;

  return (
    <SheetContent
      title={device.label}
      description={`${device.paired ? "Paired" : "Not paired"} · ${lastSeen(device.lastSeenAt)} · Code ${device.code}`}
    >
      <div className="flex flex-col gap-4 pt-2">
        <p className="text-sm text-pretty text-body">
          {device.paired
            ? "Moving to a new tablet, or reset the browser? Get a new code and enter it there. This device then stops working."
            : "Get a code and enter it on the device to start using it."}
        </p>
        <Button
          disabled={newCode.isPending}
          onClick={() => {
            setFormError(null);
            newCode
              .mutateAsync(device.id)
              .then(setIssued, (err: unknown) => setFormError(errorMessage(err)));
          }}
        >
          {newCode.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {newCode.isPending ? "Getting Code…" : "Get Pairing Code"}
        </Button>

        {device.paired ? (
          confirmUnpair ? (
            <div
              className="flex flex-col gap-3 rounded-md border border-destructive/40 p-4"
              role="group"
              aria-label="Confirm unpair"
            >
              <p className="text-sm text-body">
                Everyone signed in on {device.label} is signed out, and it needs a new code to be
                used again.
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={() => setConfirmUnpair(false)}>
                  Keep Paired
                </Button>
                <Button
                  variant="destructive"
                  disabled={unpair.isPending}
                  onClick={() => {
                    unpair
                      .mutateAsync(device.id)
                      .then(onClose, (err: unknown) => setFormError(errorMessage(err)));
                  }}
                >
                  {unpair.isPending ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : null}
                  Unpair {device.label}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => setConfirmUnpair(true)}
            >
              Unpair
            </Button>
          )
        ) : null}
        {formError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        ) : null}
      </div>
    </SheetContent>
  );
}

/** The one-time code, big, with a live countdown and what to do with it. */
function PairingCodeView({ issued, onDone }: { issued: PairingCodeResponse; onDone: () => void }) {
  const expiresAt = new Date(issued.expiresAt).getTime();
  const [left, setLeft] = useState(() => Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(
      () => setLeft(Math.max(0, Math.round((expiresAt - Date.now()) / 1000))),
      1000,
    );
    return () => clearInterval(t);
  }, [expiresAt]);
  const expired = left === 0;
  const code = issued.pairingCode;
  const origin = typeof window === "undefined" ? "" : window.location.host;

  return (
    <SheetContent
      title={`Pair ${issued.device.label}`}
      description="Use this code once, on the device."
    >
      <div className="flex flex-col gap-6 pt-2">
        <div
          className={cn(
            "flex flex-col items-center gap-2 rounded-md bg-muted px-4 py-6",
            expired && "opacity-50",
          )}
        >
          <p
            className="text-[40px] leading-none font-bold tracking-[0.15em] tabular-nums sm:text-5xl"
            translate="no"
            aria-label={`Pairing code ${code.split("").join(" ")}`}
          >
            {code.slice(0, 4)}&nbsp;{code.slice(4)}
          </p>
          {/* The countdown ticks silently; only expiry is announced. */}
          {expired ? (
            <p role="status" className="text-sm font-medium text-muted-foreground">
              Expired. Close and get a new code.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground tabular-nums">
              Expires in{" "}
              <span aria-hidden="true">
                {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
              </span>
              <span className="sr-only">10 minutes</span>
            </p>
          )}
        </div>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-base text-body">
          <li>
            On the device, open
            {/* Own line so the address doesn't break mid-word; wraps only if it's too long. */}
            <span
              className="block font-semibold [overflow-wrap:anywhere] text-foreground"
              translate="no"
            >
              {origin}/staff/pair
            </span>
          </li>
          <li>Enter the 8-digit code above.</li>
          <li>Staff then tap their name and enter their PIN.</li>
        </ol>
        <Button onClick={onDone}>Done</Button>
      </div>
    </SheetContent>
  );
}
