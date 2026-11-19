import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CustomerMenu } from "@/features/customer-menu/components/customer-menu";
import { MenuUnavailable } from "@/features/customer-menu/components/menu-unavailable";
import { loadPublicMenu } from "@/features/customer-menu/server";

// Customer entry from the table QR code (plan §1, M5-T6a): the outlet's live menu. No login.
// Ordering from here arrives in M5-T6b; the bell in M8.

export async function generateMetadata({
  params,
}: PageProps<"/t/[tableToken]">): Promise<Metadata> {
  const t = await getTranslations("customer.menu");
  const result = await loadPublicMenu((await params).tableToken);
  return {
    title: result.kind === "ok" ? `${t("title")} · ${result.menu.outlet.name}` : t("title"),
    robots: { index: false, follow: false },
  };
}

export default async function TablePage({ params }: PageProps<"/t/[tableToken]">) {
  const { tableToken } = await params;
  const result = await loadPublicMenu(tableToken);
  if (result.kind !== "ok") {
    return <MenuUnavailable reason={result.kind} retryHref={`/t/${tableToken}`} />;
  }
  return <CustomerMenu qrToken={tableToken} initial={result.menu} />;
}
