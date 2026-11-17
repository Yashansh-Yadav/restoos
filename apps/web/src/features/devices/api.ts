import {
  deviceListResponseSchema,
  deviceSchema,
  pairingCodeResponseSchema,
  type RegisterDeviceInput,
} from "@restoos/shared";
import { apiFetch } from "@/lib/api";
import { OUTLET_HEADER } from "@/features/staff/api";

// Browser calls for /api/owner/devices (M1-T6).

const opts = (outletId: string, init: RequestInit = {}): RequestInit => ({
  ...init,
  credentials: "same-origin",
  headers: { [OUTLET_HEADER]: outletId },
});

export const listDevices = (outletId: string) =>
  apiFetch("/api/owner/devices", deviceListResponseSchema, opts(outletId));

export const registerDevice = (outletId: string, body: RegisterDeviceInput) =>
  apiFetch(
    "/api/owner/devices",
    pairingCodeResponseSchema,
    opts(outletId, { method: "POST", body: JSON.stringify(body) }),
  );

export const newPairingCode = (outletId: string, id: string) =>
  apiFetch(
    `/api/owner/devices/${encodeURIComponent(id)}/pairing-code`,
    pairingCodeResponseSchema,
    opts(outletId, { method: "POST" }),
  );

export const unpairDevice = (outletId: string, id: string) =>
  apiFetch(
    `/api/owner/devices/${encodeURIComponent(id)}/unpair`,
    deviceSchema,
    opts(outletId, { method: "POST" }),
  );
