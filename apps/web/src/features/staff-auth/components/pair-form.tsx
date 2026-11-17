"use client";

import { PAIRING_CODE_DIGITS } from "@restoos/shared";
import { Loader2 } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { pairDevice } from "../api";

// /staff/pair: enter the owner's one-time code once; the device then stays paired.

export function PairForm() {
  const ids = { code: useId(), error: useId() };
  const ref = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(value: string) {
    if (busy) return;
    if (value.length !== PAIRING_CODE_DIGITS) {
      setError("Enter all 8 digits of the pairing code.");
      ref.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await pairDevice(value);
      // Device identity changed: full load so the staff area re-reads it.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional full reload on auth change
      window.location.assign("/staff");
    } catch (err) {
      setBusy(false);
      setCode("");
      setError(
        err instanceof ApiError && err.status !== 500
          ? err.message
          : "Couldn't pair. Check the internet connection and try again.",
      );
      ref.current?.focus();
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void submit(code);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.code}>Pairing Code</Label>
        <Input
          ref={ref}
          id={ids.code}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          spellCheck={false}
          maxLength={9}
          placeholder="1234 5678…"
          value={code.length > 4 ? `${code.slice(0, 4)} ${code.slice(4)}` : code}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, PAIRING_CODE_DIGITS);
            setCode(digits);
            setError(null);
            if (digits.length === PAIRING_CODE_DIGITS) void submit(digits); // saves a tap
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={ids.error}
          className="h-touch-hero text-center text-3xl font-semibold tracking-[0.2em] tabular-nums"
        />
        {error ? (
          <p id={ids.error} role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : (
          <p id={ids.error} className="text-sm text-muted-foreground">
            The owner gets this code under Owner → Devices. It works once, for 10 minutes.
          </p>
        )}
      </div>
      <Button type="submit" size="staff" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {busy ? "Pairing…" : "Pair This Device"}
      </Button>
    </form>
  );
}
