import { kitchenBoardSchema, kotStageSchema, type KotStage } from "@restoos/shared";
import { z } from "zod";
import { apiFetch } from "@/lib/api";

// Kitchen display (M5-T3). Kitchen tablets send their staff session cookie.

export const getKitchenBoard = () =>
  apiFetch("/api/staff/kitchen", kitchenBoardSchema, { credentials: "same-origin" });

export const moveKot = (kotId: string, to: KotStage) =>
  apiFetch(
    `/api/staff/kots/${encodeURIComponent(kotId)}/stage`,
    z.object({ id: z.string(), number: z.number().int(), stage: kotStageSchema }),
    { method: "POST", credentials: "same-origin", body: JSON.stringify({ to }) },
  );
