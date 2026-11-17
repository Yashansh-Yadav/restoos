import "server-only";
import { deviceStaffResponseSchema, staffMeResponseSchema } from "@restoos/shared";
import { apiFetchAsUser } from "@/lib/api-server";

/** The staff member signed in on this device, or null. */
export const getStaffMe = () => apiFetchAsUser("/api/staff/me", staffMeResponseSchema);

/** Who can sign in on this device, or null when the device isn't paired. */
export const getDeviceStaff = () => apiFetchAsUser("/api/device/staff", deviceStaffResponseSchema);
