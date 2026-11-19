import type messages from "../../messages/en.json";
import type { Locale } from "./locale";

// Type-safe message keys (next-intl AppConfig): a typo in t("…") fails the typecheck.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
