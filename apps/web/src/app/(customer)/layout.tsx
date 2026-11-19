import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { QueryProvider } from "@/lib/query-provider";

// Customer pages (M5-T6a): the guest's language (cookie, else the phone's languages) on this
// subtree — staff and owner screens stay English — plus TanStack Query for live data. Only the
// customer messages go to the browser.
export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <div lang={locale} className="min-h-dvh">
      <NextIntlClientProvider locale={locale} messages={{ customer: messages.customer }}>
        <QueryProvider>{children}</QueryProvider>
      </NextIntlClientProvider>
    </div>
  );
}
