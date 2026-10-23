import type { Metadata } from "next";
import { PlaceholderScreen } from "@/components/placeholder-screen";

export const metadata: Metadata = { title: "Menu" };

// Customer entry from the table QR code (plan §1). Real menu in M5-T6.
export default async function TablePage({ params }: PageProps<"/t/[tableToken]">) {
  const { tableToken } = await params;
  return <PlaceholderScreen title={`Table ${tableToken}`} milestone="M5-T6" />;
}
