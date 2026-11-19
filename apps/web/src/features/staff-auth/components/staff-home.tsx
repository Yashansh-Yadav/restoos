"use client";

import type { StaffMe } from "@restoos/shared";
import {
  Armchair,
  ChefHat,
  ChevronRight,
  Clock,
  LayoutGrid,
  Loader2,
  LogOut,
  PackageX,
  Play,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { endShift, staffLogout, startShift } from "../api";

// Staff home (M1-T6/T7): who's signed in, their shift, Switch User. Each role's real screens
// replace the "coming" list in their milestones (tables M4, kitchen M5, billing M7, bell M8).
// - Switch User: hand the device over mid-shift (the shift keeps running).
// - End Shift: done for the day — closes the shift and signs out.

const ROLE: Record<StaffMe["employee"]["role"], { label: string; coming: string[] }> = {
  BUTLER: { label: "Butler", coming: ["Your tables and orders", "Service bell alerts"] },
  CASHIER: { label: "Cashier", coming: ["Bills, payments and printing", "Service bell alerts"] },
  KITCHEN: { label: "Kitchen", coming: ["Kitchen order tickets (KOT) board"] },
  MANAGER: {
    label: "Manager",
    coming: ["Floor and tables", "Orders, voids and discounts", "Bills and reports"],
  },
};

/** The tapped End Shift button unmounts when the confirm opens: keep focus in the confirm. */
const focusOnMount = (el: HTMLButtonElement | null) => el?.focus();

const reload = () => {
  // Auth/shift state changed: full load so the staff area re-reads who's here.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional full reload on auth change
  window.location.assign("/staff");
};

export function StaffHome({ me }: { me: StaffMe }) {
  const [busy, setBusy] = useState<"switch" | "start" | "end" | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const role = ROLE[me.employee.role];
  const since = me.shift
    ? new Intl.DateTimeFormat("en-IN", { timeZone: me.timeZone, timeStyle: "short" }).format(
        new Date(me.shift.startedAt),
      )
    : null;

  const fail = (err: unknown) => {
    setBusy(null);
    setError(
      err instanceof ApiError && err.status === 401
        ? "You've been signed out. Sign in again with your PIN."
        : "Couldn't update your shift. Check the internet connection and try again.",
    );
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {me.outlet.name} · {me.device.label}
        </p>
        <h1 className="text-[28px] leading-tight font-bold break-words">Hi {me.employee.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">
            {role.label}
          </span>
          {since ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-sm font-semibold text-success"
              suppressHydrationWarning
            >
              <Clock className="size-4" aria-hidden="true" />
              On shift since {since}
            </span>
          ) : (
            <span className="rounded-full border border-border px-3 py-1 text-sm font-semibold text-muted-foreground">
              Not on shift
            </span>
          )}
        </div>
      </div>

      {me.permissions.includes("kot.updateStatus") ? (
        <Link
          href="/staff/kitchen"
          className="flex min-h-touch-hero [touch-action:manipulation] items-center gap-4 rounded-md border border-border px-4 py-3 transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-secondary"
        >
          <ChefHat className="size-7 shrink-0" aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-lg font-semibold">Kitchen Display</span>
            <span className="text-sm text-muted-foreground">
              Tickets to cook — tap to start and mark ready
            </span>
          </span>
          <ChevronRight className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : null}

      {me.permissions.includes("order.create") ? (
        <Link
          href="/staff/floor"
          className="flex min-h-touch-hero [touch-action:manipulation] items-center gap-4 rounded-md border border-border px-4 py-3 transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-secondary"
        >
          <Armchair className="size-7 shrink-0" aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-lg font-semibold">Floor</span>
            <span className="text-sm text-muted-foreground">
              Every table at a glance — seat guests, clear tables
            </span>
          </span>
          <ChevronRight className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : null}

      {me.permissions.includes("table.assign") ? (
        <Link
          href="/staff/assign"
          className="flex min-h-touch-hero [touch-action:manipulation] items-center gap-4 rounded-md border border-border px-4 py-3 transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-secondary"
        >
          <LayoutGrid className="size-7 shrink-0" aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-lg font-semibold">Assign Tables</span>
            <span className="text-sm text-muted-foreground">
              Give butlers their tables for this shift
            </span>
          </span>
          <ChevronRight className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : null}

      {me.permissions.includes("menu.toggleStock") ? (
        <Link
          href="/staff/stock"
          className="flex min-h-touch-hero [touch-action:manipulation] items-center gap-4 rounded-md border border-border px-4 py-3 transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-secondary"
        >
          <PackageX className="size-7 shrink-0" aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-lg font-semibold">Item Stock</span>
            <span className="text-sm text-muted-foreground">
              Mark a dish out of stock in one tap
            </span>
          </span>
          <ChevronRight className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : null}

      <section
        aria-labelledby="coming-heading"
        className="flex flex-col gap-3 rounded-md border border-border p-4"
      >
        <h2 id="coming-heading" className="text-base font-semibold">
          Your screens are on the way
        </h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-base text-body">
          {role.coming.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>

      {/* Thumb zone: actions at the bottom. */}
      <div className="mt-auto flex flex-col gap-3 pb-[env(safe-area-inset-bottom)]">
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}

        {!me.shift ? (
          <Button
            size="hero"
            className="w-full"
            disabled={busy !== null}
            onClick={() => {
              setBusy("start");
              setError(null);
              startShift().then(reload, fail);
            }}
          >
            {busy === "start" ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Play aria-hidden="true" />
            )}
            {busy === "start" ? "Starting…" : "Start Shift"}
          </Button>
        ) : confirmEnd ? (
          <div
            className="flex flex-col gap-3 rounded-md border border-border p-4"
            role="group"
            aria-label="Confirm end of shift"
          >
            <p className="text-base text-body">
              End your shift and sign out? The next person can sign in on this device.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                ref={focusOnMount}
                variant="secondary"
                size="staff"
                onClick={() => setConfirmEnd(false)}
              >
                Keep Working
              </Button>
              <Button
                size="staff"
                disabled={busy !== null}
                onClick={() => {
                  setBusy("end");
                  setError(null);
                  endShift().then(reload, fail);
                }}
              >
                {busy === "end" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                {busy === "end" ? "Ending…" : "End Shift"}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="staff"
            className="w-full"
            disabled={busy !== null}
            onClick={() => setConfirmEnd(true)}
          >
            <LogOut aria-hidden="true" />
            End Shift
          </Button>
        )}

        <Button
          variant="ghost"
          size="staff"
          className="w-full"
          disabled={busy !== null}
          onClick={() => {
            setBusy("switch");
            // Ends this staff session only; the shift keeps running and the device stays paired.
            void staffLogout().finally(reload);
          }}
        >
          {busy === "switch" ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Users aria-hidden="true" />
          )}
          {busy === "switch" ? "Switching…" : "Switch User"}
        </Button>
      </div>
    </div>
  );
}
