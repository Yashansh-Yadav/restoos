import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe } from "@/features/auth/api";
import { MenuManager } from "@/features/menu/components/menu-manager";
import { getOwnerMenu } from "@/features/menu/server";

export const metadata: Metadata = { title: "Menu" };

// M2-T1. Same outlet choice as /owner/staff: ?outlet= if it's the owner's, else the first.
export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ outlet?: string }>;
}) {
  const me = await getMe();
  if (!me?.owner) redirect("/login");
  const { outlet: wanted } = await searchParams;
  const outlet = me.owner.outlets.find((o) => o.id === wanted) ?? me.owner.outlets[0];
  if (!outlet) redirect("/onboarding");

  const menu = await getOwnerMenu(outlet.id);
  if (!menu) redirect("/login");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="flex items-center justify-between gap-3">
        <Link
          href="/owner"
          className="-ml-3 inline-flex min-h-touch items-center gap-1 rounded-sm px-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
          {me.owner.organizationName}
        </Link>
        {outlet.name !== me.owner.organizationName ? (
          <span className="truncate text-sm text-muted-foreground">{outlet.name}</span>
        ) : null}
      </nav>
      <MenuManager outletId={outlet.id} initial={menu} />
    </main>
  );
}
