"use client";

import type { StaffMe } from "@restoos/shared";
import { Loader2, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { staffLogout } from "../api";

// Staff home (M1-T6): who's signed in + Switch User. Each role's real screens replace the
// "coming" list in their milestones (tables M4, kitchen M5, billing M7, bell M8).

const ROLE: Record<StaffMe["employee"]["role"], { label: string; coming: string[] }> = {
  BUTLER: { label: "Butler", coming: ["Your tables and orders", "Service bell alerts"] },
  CASHIER: { label: "Cashier", coming: ["Bills, payments and printing", "Service bell alerts"] },
  KITCHEN: { label: "Kitchen", coming: ["Kitchen order tickets (KOT) board", "Item stock on/off"] },
  MANAGER: {
    label: "Manager",
    coming: ["Floor and tables", "Orders, voids and discounts", "Bills and reports"],
  },
};

export function StaffHome({ me }: { me: StaffMe }) {
  const [busy, setBusy] = useState(false);
  const role = ROLE[me.employee.role];

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {me.outlet.name} · {me.device.label}
        </p>
        <h1 className="text-[28px] leading-tight font-bold break-words">Hi {me.employee.name}</h1>
        <span className="self-start rounded-full bg-muted px-3 py-1 text-sm font-semibold">
          {role.label}
        </span>
      </div>

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

      <div className="mt-auto pb-[env(safe-area-inset-bottom)]">
        <Button
          variant="secondary"
          size="staff"
          className="w-full"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            // Ends this staff session only; the device stays paired for the next person.
            void staffLogout().finally(() => {
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional full reload on auth change
              window.location.assign("/staff");
            });
          }}
        >
          {busy ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Users aria-hidden="true" />
          )}
          {busy ? "Switching…" : "Switch User"}
        </Button>
      </div>
    </div>
  );
}
