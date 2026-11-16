"use client";

import { formatIndianMobile, toIndianE164 } from "@restoos/shared";
import { Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { GoogleMark } from "./google-mark";

// Owner sign-in (M1-T1): Google or mobile OTP only — no passwords (CLAUDE.md rule 11).
// English for now; owner screens move to the i18n helper when it lands.

const RESEND_SECONDS = 30;

type Step = { kind: "phone" } | { kind: "code"; phone: string };

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const ids = { phone: useId(), code: useId(), error: useId() };
  const codeRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>({ kind: "phone" });
  const [phoneInput, setPhoneInput] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1_000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step.kind === "code") codeRef.current?.focus();
  }, [step]);

  async function sendCode(phone: string) {
    setBusy("send");
    setError(null);
    const { error: err } = await authClient.phoneNumber.sendOtp({ phoneNumber: phone });
    setBusy(null);
    if (err) {
      setError(
        err.status === 429
          ? (err.message ?? "Too many requests. Wait a moment, then try again.")
          : "Couldn't send a code to this number. Check it and try again.",
      );
      if (err.status === 429) setCooldown(RESEND_SECONDS);
      return false;
    }
    setCooldown(RESEND_SECONDS);
    return true;
  }

  async function onSubmitPhone(e: FormEvent) {
    e.preventDefault();
    const phone = toIndianE164(phoneInput);
    if (!phone) {
      setError("Enter a 10-digit Indian mobile number, e.g. 98765 43210.");
      phoneRef.current?.focus();
      return;
    }
    if (await sendCode(phone)) {
      setCode("");
      setStep({ kind: "code", phone });
    }
  }

  async function verify(value: string) {
    if (step.kind !== "code" || busy) return;
    setBusy("verify");
    setError(null);
    const { error: err } = await authClient.phoneNumber.verify({
      phoneNumber: step.phone,
      code: value,
    });
    if (err) {
      setBusy(null);
      setCode("");
      setError(
        err.status === 403
          ? "Too many wrong tries. Request a new code below."
          : "That code didn't match or has expired. Check the SMS and try again.",
      );
      codeRef.current?.focus();
      return;
    }
    // Sign-in changed who you are: do a full page load so nothing rendered or cached while
    // signed out is reused. The owner area then decides where to go (onboarding for new owners).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional full reload on auth change
    window.location.assign("/owner");
  }

  async function signInWithGoogle() {
    setBusy("google");
    setError(null);
    const { error: err } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/owner",
    });
    if (err) {
      setBusy(null);
      setError("Google sign-in didn't start. Try again, or use your mobile number.");
    }
  }

  const errorText = error ? (
    <p id={ids.error} role="alert" className="text-sm font-medium text-destructive">
      {error}
    </p>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      {googleEnabled && step.kind === "phone" ? (
        <>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => void signInWithGoogle()}
            disabled={busy !== null}
          >
            {busy === "google" ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <GoogleMark />
            )}
            Continue with Google
          </Button>
          <div className="flex items-center gap-3 text-sm text-muted-foreground" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            or use your mobile number
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      {step.kind === "phone" ? (
        <form className="flex flex-col gap-4" onSubmit={(e) => void onSubmitPhone(e)} noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.phone}>Mobile Number</Label>
            <div className="flex items-stretch gap-2">
              <span
                className="flex h-12 items-center rounded-sm border border-input bg-muted px-3 text-base text-body tabular-nums"
                translate="no"
              >
                +91
              </span>
              <Input
                ref={phoneRef}
                id={ids.phone}
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98765 43210…"
                maxLength={14}
                spellCheck={false}
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? ids.error : undefined}
                className="tabular-nums"
              />
            </div>
            {errorText}
          </div>
          <Button type="submit" className="w-full" disabled={busy !== null}>
            {busy === "send" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {busy === "send" ? "Sending Code…" : "Send Code"}
          </Button>
          <p className="text-sm text-muted-foreground">
            You&apos;ll get a 6-digit code by SMS. Standard SMS rates may apply.
          </p>
        </form>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length !== 6) {
              setError("Enter all 6 digits from the SMS.");
              codeRef.current?.focus();
              return;
            }
            void verify(code);
          }}
          noValidate
        >
          <p className="text-base text-body" aria-live="polite">
            Enter the 6-digit code sent to{" "}
            <span className="font-semibold whitespace-nowrap text-foreground tabular-nums">
              {formatIndianMobile(step.phone)}
            </span>
            .{" "}
            <button
              type="button"
              className="inline-flex min-h-touch items-center font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => {
                setStep({ kind: "phone" });
                setError(null);
              }}
            >
              Change Number
            </button>
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.code}>Verification Code</Label>
            <Input
              ref={codeRef}
              id={ids.code}
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              spellCheck={false}
              value={code}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(digits);
                if (digits.length === 6) void verify(digits); // saves a tap
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? ids.error : undefined}
              className="text-center text-2xl font-semibold tracking-[0.4em] tabular-nums"
            />
            {errorText}
          </div>
          <Button type="submit" className="w-full" disabled={busy !== null}>
            {busy === "verify" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {busy === "verify" ? "Signing In…" : "Verify & Sign In"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="self-center"
            disabled={cooldown > 0 || busy !== null}
            onClick={() => void sendCode(step.phone)}
          >
            {cooldown > 0 ? (
              <span className="tabular-nums">
                Resend Code in 0:{String(cooldown).padStart(2, "0")}
              </span>
            ) : (
              "Resend Code"
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
