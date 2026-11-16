import { redirect } from "next/navigation";
import { getMe } from "@/features/auth/api";

// Owner area guard (M1-T1): signed out → /login; signed in without a restaurant → /onboarding.
// The API enforces access on every request anyway (rule 4); this only routes the user.
export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.needsOnboarding) redirect("/onboarding");
  return children;
}
