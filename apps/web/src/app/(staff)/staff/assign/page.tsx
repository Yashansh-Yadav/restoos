import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AssignBoard } from "@/features/assignments/components/assign-board";
import { getAssignmentBoard } from "@/features/assignments/server";
import { getStaffMe } from "@/features/staff-auth/server";

export const metadata: Metadata = { title: "Assign Tables" };

// M3-T3: the manager gives butlers their tables for this shift.
export default async function AssignPage() {
  const me = await getStaffMe();
  if (!me) redirect("/staff");

  const allowed = me.permissions.includes("table.assign");
  const board = allowed ? await getAssignmentBoard() : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 px-4 pt-4 pb-10 sm:px-6 sm:pt-8">
      <Link
        href="/staff"
        className="-ml-3 inline-flex min-h-touch items-center gap-1 self-start rounded-sm px-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
        Home
      </Link>
      {board ? (
        <AssignBoard initial={board} />
      ) : (
        <p className="rounded-md bg-muted px-4 py-6 text-base text-body">
          Tables are given out by the manager. Ask them which tables are yours today.
        </p>
      )}
    </main>
  );
}
