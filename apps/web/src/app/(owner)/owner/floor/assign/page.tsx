import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AssignBoard } from "@/features/assignments/components/assign-board";
import { getAssignmentBoard } from "@/features/assignments/server";
import { getMe } from "@/features/auth/api";

export const metadata: Metadata = { title: "Assign Tables" };

// M3-T3 for owners without a manager on the floor: same board, with the outlet header.
export default async function OwnerAssignPage({
  searchParams,
}: {
  searchParams: Promise<{ outlet?: string }>;
}) {
  const me = await getMe();
  if (!me?.owner) redirect("/login");
  const { outlet: wanted } = await searchParams;
  const outlet = me.owner.outlets.find((o) => o.id === wanted) ?? me.owner.outlets[0];
  if (!outlet) redirect("/onboarding");

  const board = await getAssignmentBoard(outlet.id);
  if (!board) redirect("/login");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <nav aria-label="Breadcrumb">
        <Link
          href={`/owner/floor?outlet=${encodeURIComponent(outlet.id)}`}
          className="-ml-3 inline-flex min-h-touch items-center gap-1 rounded-sm px-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
          Floor & Tables
        </Link>
      </nav>
      <AssignBoard initial={board} outletId={outlet.id} />
    </main>
  );
}
