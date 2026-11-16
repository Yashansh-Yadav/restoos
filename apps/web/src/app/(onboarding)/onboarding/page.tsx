import { formatIndianMobile } from "@restoos/shared";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMe } from "@/features/auth/api";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { OnboardingWizard } from "@/features/onboarding/components/onboarding-wizard";

export const metadata: Metadata = { title: "Set Up Your Restaurant" };

// M1-T2: a signed-in owner without a restaurant sets up the business and first outlet here.
export default async function OnboardingPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!me.needsOnboarding) redirect("/owner");

  const who =
    me.user.email ?? (me.user.phoneNumber ? formatIndianMobile(me.user.phoneNumber) : me.user.name);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-8 px-4 pt-8 pb-12 sm:pt-16">
      <header className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-primary" translate="no">
          RestoOS
        </p>
        <p className="min-w-0 truncate text-sm text-muted-foreground tabular-nums">{who}</p>
      </header>
      <OnboardingWizard />
      <footer className="mt-auto flex justify-center pt-4">
        <SignOutButton variant="ghost" />
      </footer>
    </main>
  );
}
