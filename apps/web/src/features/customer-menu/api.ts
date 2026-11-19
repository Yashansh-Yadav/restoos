import { publicMenuSchema } from "@restoos/shared";
import { apiFetch } from "@/lib/api";

// Customer menu (M5-T6a): public, no login — the table's QR token is the only key.
export const getPublicMenu = (qrToken: string) =>
  apiFetch(`/api/public/table/${encodeURIComponent(qrToken)}`, publicMenuSchema, {
    cache: "no-store",
  });
