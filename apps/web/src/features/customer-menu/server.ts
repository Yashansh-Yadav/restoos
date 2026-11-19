import "server-only";
import { QR_TOKEN_FORMAT, type PublicMenu } from "@restoos/shared";
import { ApiError } from "@/lib/api";
import { getPublicMenu } from "./api";

export type PublicMenuResult =
  { kind: "ok"; menu: PublicMenu } | { kind: "not-found" } | { kind: "error" };

/** First render of /t/<token>. A bad or rotated token is "not found"; anything else, "error". */
export async function loadPublicMenu(qrToken: string): Promise<PublicMenuResult> {
  if (!QR_TOKEN_FORMAT.test(qrToken)) return { kind: "not-found" };
  try {
    return { kind: "ok", menu: await getPublicMenu(qrToken) };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return { kind: "not-found" };
    return { kind: "error" };
  }
}
