import type { Metadata } from "next";
import { PlaceholderScreen } from "@/components/placeholder-screen";

export const metadata: Metadata = { title: "Owner" };

export default function OwnerPage() {
  return <PlaceholderScreen title="Owner" milestone="M1 and M10" />;
}
