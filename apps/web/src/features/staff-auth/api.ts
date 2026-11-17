import { pairDeviceResponseSchema } from "@restoos/shared";
import { z } from "zod";
import { apiFetch } from "@/lib/api";

// Browser calls for device pairing + staff PIN sign-in (M1-T6). Cookies are httpOnly and set
// by the API on the same origin.

const same: RequestInit = { credentials: "same-origin" };

export const pairDevice = (code: string) =>
  apiFetch("/api/device/pair", pairDeviceResponseSchema, {
    ...same,
    method: "POST",
    body: JSON.stringify({ code }),
  });

export const staffLogin = (employeeId: string, pin: string) =>
  apiFetch("/api/device/login", z.undefined(), {
    ...same,
    method: "POST",
    body: JSON.stringify({ employeeId, pin }),
  });

export const staffLogout = () =>
  apiFetch("/api/staff/logout", z.undefined(), { ...same, method: "POST" });
