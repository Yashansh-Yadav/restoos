import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffMe } from "@/features/staff-auth/server";
import { StockBoard } from "@/features/stock/components/stock-board";
import { getStockForStaff } from "@/features/stock/server";

export const metadata: Metadata = { title: "Item Stock" };

// M2-T4: kitchen / cashier / manager mark dishes in or out of stock.
export default async function StockPage() {
  const me = await getStaffMe();
  if (!me) redirect("/staff");

  const allowed = me.permissions.includes("menu.toggleStock");
  const stock = allowed ? await getStockForStaff() : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-4 pt-4 pb-10 sm:px-6 sm:pt-8">
      <Link
        href="/staff"
        className="-ml-3 inline-flex min-h-touch items-center gap-1 self-start rounded-sm px-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
        Home
      </Link>
      {stock ? (
        <StockBoard initial={stock} />
      ) : (
        <p className="rounded-md bg-muted px-4 py-6 text-base text-body">
          Item stock is changed by the kitchen, cashier or manager. Ask them to mark a dish out of
          stock.
        </p>
      )}
    </main>
  );
}
