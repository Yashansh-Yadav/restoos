import "server-only";
import { staffFloorSchema } from "@restoos/shared";
import { apiFetchAsUser } from "@/lib/api-server";

/** First render of /staff/floor (staff device session); null when signed out. */
export const getStaffFloorForStaff = () => apiFetchAsUser("/api/staff/floor", staffFloorSchema);
