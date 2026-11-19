import "server-only";
import { kitchenBoardSchema } from "@restoos/shared";
import { apiFetchAsUser } from "@/lib/api-server";

/** First render of /staff/kitchen; null when signed out. */
export const getKitchenBoardForStaff = () =>
  apiFetchAsUser("/api/staff/kitchen", kitchenBoardSchema);
