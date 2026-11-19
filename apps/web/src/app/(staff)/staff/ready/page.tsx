import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ReadyListView } from "@/features/ready/components/ready-list";
import { getReadyListForStaff } from "@/features/ready/server";
import { getStaffMe } from "@/features/staff-auth/server";

export const metadata: Metadata = { title: "Ready to Serve" };

// M5-T4: food waiting at the pass for butlers, cashiers and managers.
export default async function ReadyPage() {
  const me = await getStaffMe();
  if (!me) redirect("/staff");
  const list = me.permissions.includes("order.create") ? await getReadyListForStaff() : null;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 px-4 pt-4 pb-10 sm:px-6 sm:pt-8">
      <Link
        href="/staff/floor"
        className="-ml-3 inline-flex min-h-touch items-center gap-1 self-start rounded-sm px-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
        Floor
      </Link>
      {list ? (
        <ReadyListView initial={list} />
      ) : (
        <p className="rounded-md bg-muted px-4 py-6 text-base text-body">
          Serving is done by butlers, cashiers and managers.
        </p>
      )}
    </main>
  );
}
