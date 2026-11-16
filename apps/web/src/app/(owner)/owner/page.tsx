import type { Metadata } from "next";
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
          Your restaurant is set up. Menu and billing come next.
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
      <SignOutButton />
    </main>
  );
}
