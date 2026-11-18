import "server-only";
import { assignmentBoardSchema } from "@restoos/shared";
import { OUTLET_HEADER } from "@/features/staff/api";
import { apiFetchAsUser } from "@/lib/api-server";

/** First render of the assignment board; null when signed out. Owners pass their outlet. */
export const getAssignmentBoard = (outletId?: string) =>
  apiFetchAsUser(
    "/api/staff/assignments",
    assignmentBoardSchema,
    outletId ? { [OUTLET_HEADER]: outletId } : {},
  );
