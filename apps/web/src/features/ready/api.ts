import { readyListSchema } from "@restoos/shared";
import { z } from "zod";
import { apiFetch } from "@/lib/api";

// Ready to serve (M5-T4). Staff devices send their session cookie.

export const getReadyList = () =>
  apiFetch("/api/staff/ready", readyListSchema, { credentials: "same-origin" });

export const markServed = (kotId: string, served: boolean) =>
  apiFetch(
    `/api/staff/kots/${encodeURIComponent(kotId)}/served`,
    z.object({ id: z.string(), number: z.number().int(), served: z.boolean() }),
    { method: "POST", credentials: "same-origin", body: JSON.stringify({ served }) },
  );
