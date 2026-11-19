// Locales for customer-facing screens (M5-T6a, next-intl). No locale in the URL — the printed
// QR link stays /t/<token> — so the choice lives in a cookie; without one, the phone's language
// decides (Hindi if preferred over English), else English.

export const LOCALES = ["en", "hi"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
/** next-intl's conventional cookie name; set by the language toggle for a year. */
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const isLocale = (v: unknown): v is Locale =>
  typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** Best supported language from an Accept-Language header (q-values respected). */
function fromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part, i) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { lang: tag.toLowerCase().split("-")[0] ?? "", weight, i };
    })
    .filter((r) => r.lang && Number.isFinite(r.weight) && r.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.i - b.i);
  for (const r of ranked) if (isLocale(r.lang)) return r.lang;
  return null;
}

/** Cookie first, then the browser's languages, then English. */
export function resolveLocale(
  cookie: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  if (isLocale(cookie)) return cookie;
  return fromAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}

/** Browser only: keep the guest's language choice for a year (the language toggle). */
export function rememberLocale(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}
