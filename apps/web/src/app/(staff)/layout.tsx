import { QueryProvider } from "@/lib/query-provider";

// Staff area (restaurant devices). Each page checks the staff session itself (pair → PIN), so
// this layout only provides TanStack Query for the client screens (floor, assignments).
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
