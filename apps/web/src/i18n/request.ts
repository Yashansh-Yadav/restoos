import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import type en from "../../messages/en.json";
import { LOCALE_COOKIE, resolveLocale } from "./locale";

// next-intl request config (M5-T6a): the locale for this request and its messages.
export default getRequestConfig(async () => {
  const locale = resolveLocale(
    (await cookies()).get(LOCALE_COOKIE)?.value,
    (await headers()).get("accept-language"),
  );
  const messages = (await import(`../../messages/${locale}.json`)) as { default: typeof en };
  return { locale, messages: messages.default };
});
