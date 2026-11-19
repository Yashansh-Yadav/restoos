import "server-only";
import { readyListSchema } from "@restoos/shared";
import { apiFetchAsUser } from "@/lib/api-server";

/** First render of /staff/ready; null when signed out. */
export const getReadyListForStaff = () => apiFetchAsUser("/api/staff/ready", readyListSchema);
