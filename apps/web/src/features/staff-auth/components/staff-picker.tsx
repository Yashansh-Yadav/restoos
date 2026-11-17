"use client";

import { PIN_MAX_ATTEMPTS, type DeviceStaff } from "@restoos/shared";
import { ChevronLeft, Delete, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { staffLogin } from "../api";

// Staff sign-in on a paired device (M1-T6): tap your name → PIN pad. The pad submits on the last
// digit (PIN length is known per person), so sign-in = 1 tap + the PIN. Physical keyboards work too.
// English for now (staff Hindi is phase 2, plan §16).

type Person = DeviceStaff["staff"][number];

const ROLE_LABEL: Record<Person["role"], string> = {
  MANAGER: "Manager",
  CASHIER: "Cashier",
  BUTLER: "Butler",
  KITCHEN: "Kitchen",
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

export function StaffPicker({ data }: { data: DeviceStaff }) {
  const [person, setPerson] = useState<Person | null>(null);

  if (person) return <PinPad person={person} onBack={() => setPerson(null)} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          {data.device.outletName} · {data.device.label}
        </p>
        <h1 className="text-[28px] leading-tight font-bold">Who&apos;s Signing In?</h1>
      </div>
      {data.staff.length === 0 ? (
        <p className="rounded-md bg-muted px-4 py-6 text-base text-pretty text-body">
          No staff yet. Ask the owner to add the team under Owner → Staff.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.staff.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setPerson(p)}
                className="flex min-h-[112px] w-full [touch-action:manipulation] flex-col items-center justify-center gap-2 rounded-md border border-border px-3 py-4 text-center transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-secondary"
              >
                <span
                  className="flex size-12 items-center justify-center rounded-full bg-muted text-lg font-bold"
                  aria-hidden="true"
                >
                  {initials(p.name)}
                </span>
                <span className="w-full truncate text-base font-semibold">{p.name}</span>
                <span className="text-sm text-muted-foreground">{ROLE_LABEL[p.role]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

function PinPad({ person, onBack }: { person: Person; onBack: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockMinutes, setLockMinutes] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const busyRef = useRef(false);
  const pinRef = useRef("");

  const lockedLeft = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;
  const locked = lockedLeft > 0;

  useEffect(() => {
    if (!lockedUntil) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  const submit = useCallback(
    async (value: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setMessage(null);
      try {
        await staffLogin(person.id, value);
        // Signed in: full load so the staff area renders as this person.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional full reload on auth change
        window.location.assign("/staff");
        return;
      } catch (err) {
        pinRef.current = "";
        setPin("");
        if (err instanceof ApiError && err.code === "PIN_LOCKED") {
          const seconds = Number(
            (err.details as { retryAfterSeconds?: number })?.retryAfterSeconds ?? 300,
          );
          setNow(Date.now());
          setLockedUntil(Date.now() + seconds * 1000);
          setLockMinutes(Math.max(1, Math.ceil(seconds / 60)));
          setMessage(null);
        } else if (err instanceof ApiError && err.code === "WRONG_PIN") {
          const left = Number((err.details as { attemptsLeft?: number })?.attemptsLeft ?? 0);
          setMessage(
            left === 1
              ? "Wrong PIN. 1 try left before this device locks."
              : `Wrong PIN. ${left} of ${PIN_MAX_ATTEMPTS} tries left.`,
          );
        } else {
          setMessage("Couldn't sign in. Check the internet connection and try again.");
        }
      }
      busyRef.current = false;
      setBusy(false);
    },
    [person.id],
  );

  const press = useCallback(
    (digit: string) => {
      if (busyRef.current || locked) return;
      // The ref holds the digits so each key press submits at most once (no side effects
      // inside a state updater, which React may run twice).
      const next = pinRef.current + digit;
      if (next.length > person.pinLength) return;
      pinRef.current = next;
      setMessage(null);
      setPin(next);
      if (next.length === person.pinLength) void submit(next);
    },
    [locked, person.pinLength, submit],
  );
  const backspace = useCallback(() => {
    pinRef.current = pinRef.current.slice(0, -1);
    setPin(pinRef.current);
  }, []);

  // Physical keyboards (counter tablets with a keyboard, desktop testing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") backspace();
      else if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, backspace, onBack]);

  const keyClass =
    "flex size-[72px] items-center justify-center rounded-full text-[28px] font-semibold tabular-nums transition-colors duration-150 [touch-action:manipulation] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Back to names"
          className="-ml-3"
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-2xl leading-tight font-bold">{person.name}</h1>
          <p className="text-sm text-muted-foreground">
            {ROLE_LABEL[person.role]} · Enter your PIN
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div
          className="flex gap-4"
          role="img"
          aria-label={`${pin.length} of ${person.pinLength} digits entered`}
        >
          {Array.from({ length: person.pinLength }, (_, i) => (
            <span
              key={i}
              className={cn(
                "size-4 rounded-full border-2 border-foreground transition-colors duration-150",
                i < pin.length ? "bg-foreground" : "bg-transparent",
              )}
            />
          ))}
        </div>
        <p
          className={cn(
            "min-h-6 text-center text-sm font-medium",
            locked || message ? "text-destructive" : "text-muted-foreground",
          )}
          role={locked || message ? "alert" : undefined}
        >
          {locked ? (
            <>
              Too many wrong PINs. Try again in{" "}
              {/* Visible countdown ticks silently; screen readers hear the wait once. */}
              <span aria-hidden="true" className="tabular-nums">
                {Math.floor(lockedLeft / 60)}:{String(lockedLeft % 60).padStart(2, "0")}
              </span>
              <span className="sr-only">{lockMinutes} minutes</span>.
            </>
          ) : (
            (message ?? (busy ? "Signing in…" : " "))
          )}
        </p>
      </div>

      {/* Thumb zone: the pad sits at the bottom of the screen on phones. */}
      <div className="mt-auto grid grid-cols-3 justify-items-center gap-x-6 gap-y-4 self-center pb-[env(safe-area-inset-bottom)]">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            className={cn(keyClass, "bg-muted hover:bg-secondary active:bg-secondary")}
            disabled={busy || locked}
            onClick={() => press(k)}
          >
            {k}
          </button>
        ))}
        <span aria-hidden="true" className="size-[72px]">
          {busy ? (
            <Loader2 className="m-auto mt-6 size-6 animate-spin text-muted-foreground" />
          ) : null}
        </span>
        <button
          type="button"
          className={cn(keyClass, "bg-muted hover:bg-secondary active:bg-secondary")}
          disabled={busy || locked}
          onClick={() => press("0")}
        >
          0
        </button>
        <button
          type="button"
          className={cn(keyClass, "hover:bg-muted")}
          disabled={busy || locked || pin.length === 0}
          onClick={backspace}
          aria-label="Delete last digit"
        >
          <Delete className="size-7" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
