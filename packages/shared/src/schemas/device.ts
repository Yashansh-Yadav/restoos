import { z } from "zod";
import { staffRoleSchema } from "../enums";

// Devices + staff sign-in (M1-T6, plan §6.3). The owner registers a device and gets a one-time
// 8-digit pairing code; the device redeems it for a long-lived cookie; staff then tap their name
// and enter their PIN on that device.

export const PAIRING_CODE_DIGITS = 8;
/** Minutes a pairing code stays valid. */
export const PAIRING_CODE_TTL_MINUTES = 10;
/** Wrong PINs allowed per device within the window before it locks. */
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MINUTES = 5;

export const pairingCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(z.string().length(PAIRING_CODE_DIGITS, "Enter all 8 digits of the pairing code"));

export const deviceSchema = z.object({
  id: z.string(),
  code: z.string(),
  label: z.string(),
  isStation: z.boolean(),
  paired: z.boolean(),
  lastSeenAt: z.iso.datetime().nullable(),
});
export type Device = z.infer<typeof deviceSchema>;

export const registerDeviceSchema = z.object({
  label: z
    .string()
    .trim()
    .min(2, "Name the device, e.g. Counter tablet")
    .max(40, "Keep the name under 40 characters"),
  isStation: z.boolean().default(false),
});
export type RegisterDeviceInput = z.input<typeof registerDeviceSchema>;

export const pairingCodeResponseSchema = z.object({
  device: deviceSchema,
  pairingCode: z.string().length(PAIRING_CODE_DIGITS),
  expiresAt: z.iso.datetime(),
});
export type PairingCodeResponse = z.infer<typeof pairingCodeResponseSchema>;

export const deviceListResponseSchema = z.object({ devices: z.array(deviceSchema) });

/** POST /api/device/pair */
export const pairDeviceSchema = z.object({ code: pairingCodeSchema });
export const pairDeviceResponseSchema = z.object({
  device: z.object({ label: z.string(), outletName: z.string() }),
});

/** GET /api/device/staff — who can sign in on this device (names only, no contact details). */
export const deviceStaffSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: staffRoleSchema,
  /** So the PIN pad can sign in on the last digit without a Done tap. */
  pinLength: z.number().int().min(4).max(6),
});
export const deviceStaffResponseSchema = z.object({
  device: z.object({ label: z.string(), outletName: z.string() }),
  staff: z.array(deviceStaffSchema),
});
export type DeviceStaff = z.infer<typeof deviceStaffResponseSchema>;

/** POST /api/device/login — no weak-PIN rule here: it only has to match. */
export const staffLoginSchema = z.object({
  employeeId: z.string().min(1),
  pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4 to 6 digits"),
});

/** GET /api/staff/me */
export const staffMeResponseSchema = z.object({
  employee: z.object({ id: z.string(), name: z.string(), role: staffRoleSchema }),
  outlet: z.object({ id: z.string(), name: z.string() }),
  device: z.object({ id: z.string(), label: z.string() }),
  permissions: z.array(z.string()),
  sessionExpiresAt: z.iso.datetime(),
  /** The open shift, if on duty (M1-T7). */
  shift: z.object({ id: z.string(), startedAt: z.iso.datetime() }).nullable(),
  /** The outlet starts shifts on first sign-in of the day; otherwise staff tap Start Shift. */
  autoStartShift: z.boolean(),
  /** IANA zone for showing times (e.g. "Asia/Kolkata"). */
  timeZone: z.string(),
});
export type StaffMe = z.infer<typeof staffMeResponseSchema>;

/** POST /api/staff/shift/start */
export const shiftSchema = z.object({ id: z.string(), startedAt: z.iso.datetime() });

/** GET/PATCH /api/owner/outlet/settings (M1-T7: shift auto-start; more settings later). */
export const outletSettingsSchema = z.object({ autoStartShift: z.boolean() });
export const updateOutletSettingsSchema = outletSettingsSchema.partial();
export type OutletSettings = z.infer<typeof outletSettingsSchema>;
