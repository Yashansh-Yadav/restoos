import { ChevronRight, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe } from "@/features/auth/api";
import { SignOutButton } from "@/features/auth/components/sign-out-button";

export const metadata: Metadata = { title: "Owner" };

// Owner home. M1-T2 shows the restaurant just set up; the "Today" dashboard arrives in M10.
export default async function OwnerPage() {
  const me = await getMe();
  if (!me?.owner) redirect("/login"); // the (owner) layout already routes; this narrows the type

  const { organizationName, outlets } = me.owner;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-primary" translate="no">
          RestoOS
        </p>
        <h1 className="text-[28px] leading-tight font-bold text-balance break-words">
          {organizationName}
        </h1>
        <p className="text-base text-body">
          Your restaurant is set up. Add your team next; menu and billing follow.
        </p>
      </div>
      <section className="flex flex-col gap-3" aria-labelledby="outlets-heading">
        <h2 id="outlets-heading" className="text-sm font-medium text-muted-foreground">
          Outlets
        </h2>
        <ul className="flex flex-col gap-2">
          {outlets.map((o) => (
            <li
              key={o.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-4 py-3"
            >
              <span className="min-w-0 truncate text-base font-semibold">{o.name}</span>
              <span
                className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold tabular-nums"
                translate="no"
                aria-label={`Invoice code ${o.code}`}
              >
                {o.code}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <nav aria-label="Manage" className="flex flex-col gap-2">
        <Link
          href="/owner/staff"
          className="flex min-h-touch-staff items-center gap-3 rounded-md border border-border px-4 py-3 transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Users className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="flex flex-1 flex-col">
            <span className="text-base font-semibold">Staff</span>
            <span className="text-sm text-muted-foreground">Add your team and set their PINs</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      </nav>
      <SignOutButton />
    </main>
  );
}
