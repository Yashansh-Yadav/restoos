"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { rememberLocale, type Locale } from "@/i18n/locale";
import { cn } from "@/lib/utils";

// EN | हिं (M5-T6a): remembers the guest's choice in a cookie and re-renders on the server —
// no reload, scroll kept. Each label is written in its own language so it's findable either way.

const OPTIONS: { locale: Locale; label: string; name: string }[] = [
  { locale: "en", label: "EN", name: "English" },
  { locale: "hi", label: "हिं", name: "हिन्दी" },
];

export function LanguageToggle() {
  const t = useTranslations("customer.menu");
  const current = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(locale: Locale) {
    if (locale === current) return;
    rememberLocale(locale);
    startTransition(() => router.refresh());
  }

  return (
    <div
      role="group"
      aria-label={t("language")}
      aria-busy={pending}
      className="flex shrink-0 rounded-full border border-input p-0.5"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.locale}
          type="button"
          lang={o.locale}
          aria-label={o.name}
          aria-pressed={current === o.locale}
          onClick={() => choose(o.locale)}
          className={cn(
            "inline-flex min-h-touch min-w-touch items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors duration-150",
            current === o.locale
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
