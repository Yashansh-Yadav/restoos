import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { KitchenBoardView } from "@/features/kitchen/components/kitchen-board";
import { getKitchenBoardForStaff } from "@/features/kitchen/server";
import { getStaffMe } from "@/features/staff-auth/server";

export const metadata: Metadata = { title: "Kitchen" };

// M5-T3: the kitchen tablet's board of tickets.
export default async function KitchenPage() {
  const me = await getStaffMe();
  if (!me) redirect("/staff");
  const board = me.permissions.includes("kot.updateStatus")
    ? await getKitchenBoardForStaff()
    : null;
  return (
    <div className="mx-auto w-full max-w-7xl">
      <Link
        href="/staff"
        className="mx-4 mt-3 -ml-0 inline-flex min-h-touch items-center gap-1 rounded-sm px-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring sm:mx-6"
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
        Home
      </Link>
      {board ? (
        <KitchenBoardView initial={board} />
      ) : (
        <p className="m-4 rounded-md bg-muted px-4 py-6 text-base text-body">
          The kitchen display is for the kitchen and managers.
        </p>
      )}
    </div>
  );
}
