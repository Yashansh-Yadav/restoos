import { formatIndianMobile } from "@restoos/shared";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMe } from "@/features/auth/api";
import { SignOutButton } from "@/features/auth/components/sign-out-button";

export const metadata: Metadata = { title: "Set Up Your Restaurant" };

// Placeholder: the onboarding wizard (organisation → outlet) is built in M1-T2.
export default async function OnboardingPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!me.needsOnboarding) redirect("/owner");

  const who =
    me.user.email ?? (me.user.phoneNumber ? formatIndianMobile(me.user.phoneNumber) : me.user.name);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-primary" translate="no">
          RestoOS
        </p>
        <h1 className="text-[28px] leading-tight font-bold text-balance">Set Up Your Restaurant</h1>
        <p className="text-base text-pretty text-body">
          You&apos;re signed in as{" "}
          <span className="font-semibold text-foreground tabular-nums">{who}</span>. Next, add your
          business and first outlet — this step arrives with the onboarding wizard.
        </p>
      </div>
      <SignOutButton />
    </main>
  );
}
