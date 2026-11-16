import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthConfig, getMe } from "@/features/auth/api";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = { title: "Sign In" };

export default async function LoginPage() {
  const me = await getMe();
  if (me) redirect(me.needsOnboarding ? "/onboarding" : "/owner");
  const config = await getAuthConfig();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4 py-12">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-primary" translate="no">
          RestoOS
        </p>
        <h1 className="text-[28px] leading-tight font-bold text-balance">
          Sign In to Your Restaurant
        </h1>
        <p className="text-base text-pretty text-body">
          For owners and managers. New here? Signing in creates your account.
        </p>
      </div>
      <LoginForm googleEnabled={config.google} />
      <p className="text-sm text-pretty text-muted-foreground">
        Staff sign in on the restaurant&apos;s tablet with their PIN.
      </p>
    </main>
  );
}
