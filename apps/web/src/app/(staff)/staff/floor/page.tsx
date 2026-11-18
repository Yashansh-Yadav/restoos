import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffMe } from "@/features/staff-auth/server";
import { StaffFloorView } from "@/features/staff-floor/components/staff-floor";
import { getStaffFloorForStaff } from "@/features/staff-floor/server";

export const metadata: Metadata = { title: "Floor" };

// M3-T4: butlers, cashiers and managers see every table's status; butlers start on their own.
export default async function StaffFloorPage() {
  const me = await getStaffMe();
  if (!me) redirect("/staff");

  const allowed = me.permissions.includes("order.create");
  const floor = allowed ? await getStaffFloorForStaff() : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 px-4 pt-4 pb-10 sm:px-6 sm:pt-8">
      <Link
        href="/staff"
        className="-ml-3 inline-flex min-h-touch items-center gap-1 self-start rounded-sm px-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
        Home
      </Link>
      {floor ? (
        <StaffFloorView initial={floor} />
      ) : (
        <p className="rounded-md bg-muted px-4 py-6 text-base text-body">
          The floor view is for butlers, cashiers and managers.
        </p>
      )}
    </main>
  );
}
