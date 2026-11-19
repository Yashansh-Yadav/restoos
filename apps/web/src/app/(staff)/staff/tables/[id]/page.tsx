import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OrderScreen } from "@/features/order/components/order-screen";
import { getOrderPadForStaff } from "@/features/order/server";
import { getStaffMe } from "@/features/staff-auth/server";

export const metadata: Metadata = { title: "Take Order" };

// M5-T1: the butler taps a table on the floor and lands here — order straight away.
export default async function TablePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getStaffMe();
  if (!me) redirect("/staff");
  const { id } = await params;
  if (!me.permissions.includes("order.create")) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-4 py-8">
        <p className="rounded-md bg-muted px-4 py-6 text-base text-body">
          Orders are taken by butlers, cashiers and managers.
        </p>
        <Link href="/staff" className="text-base font-medium underline">
          Back to Home
        </Link>
      </main>
    );
  }
  const pad = await getOrderPadForStaff(id);
  if (!pad) redirect("/staff");
  return (
    <OrderScreen
      tableId={id}
      initial={pad}
      canVoid={me.permissions.includes("order.voidItem")}
    />
  );
}
