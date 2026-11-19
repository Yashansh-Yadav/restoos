import { QrCode, WifiOff } from "lucide-react";
import { getTranslations } from "next-intl/server";

// The table page when there's no menu to show (M5-T6a): an old/rotated QR code, or the API
// can't be reached. Translated; "Try Again" is a plain link so it works without JavaScript.
export async function MenuUnavailable({
  reason,
  retryHref,
}: {
  reason: "not-found" | "error";
  retryHref: string;
}) {
  const t = await getTranslations("customer.errors");
  const Icon = reason === "not-found" ? QrCode : WifiOff;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <Icon className="size-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-2xl font-bold text-balance">
        {reason === "not-found" ? t("notFoundTitle") : t("loadTitle")}
      </h1>
      <p className="text-base text-pretty text-muted-foreground">
        {reason === "not-found" ? t("notFoundBody") : t("loadBody")}
      </p>
      {reason === "error" ? (
        <a
          href={retryHref}
          className="inline-flex h-12 items-center rounded-sm bg-primary px-6 text-base font-semibold text-primary-foreground"
        >
          {t("retry")}
        </a>
      ) : null}
    </main>
  );
}
