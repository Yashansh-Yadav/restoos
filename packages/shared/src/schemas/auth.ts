import { z } from "zod";
import { orgRoleSchema } from "../enums";

// Owner auth contracts (M1-T1), shared by apps/api and apps/web.

/** Indian mobile numbers only for the MVP: +91 followed by 10 digits starting 6–9 (E.164). */
export const INDIAN_MOBILE_E164 = /^\+91[6-9]\d{9}$/;

/**
 * Normalises what an owner types ("98765 43210", "+91-98765-43210", "09876543210") to
 * "+919876543210". Returns null if it isn't a valid Indian mobile number.
 */
export function toIndianE164(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+91")) digits = digits.slice(3);
  else if (digits.startsWith("0091")) digits = digits.slice(4);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  const e164 = `+91${digits}`;
  return INDIAN_MOBILE_E164.test(e164) ? e164 : null;
}

/** "+919876543210" → "+91 98765 43210" for display. */
export function formatIndianMobile(e164: string): string {
  return INDIAN_MOBILE_E164.test(e164) ? `+91 ${e164.slice(3, 8)} ${e164.slice(8)}` : e164;
}

export const indianMobileSchema = z
  .string()
  .regex(INDIAN_MOBILE_E164, "Enter a 10-digit Indian mobile number");

export const otpCodeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code");

/** GET /api/me — who is signed in and whether they still need to set up their restaurant. */
export const meResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    /** Only real addresses (from Google); phone-only owners have none. */
    email: z.string().nullable(),
    phoneNumber: z.string().nullable(),
    image: z.string().nullable(),
    linked: z.object({ google: z.boolean(), phone: z.boolean() }),
  }),
  owner: z
    .object({
      organizationId: z.string(),
      organizationName: z.string(),
      role: orgRoleSchema,
      outlets: z.array(z.object({ id: z.string(), name: z.string(), code: z.string() })),
    })
    .nullable(),
  needsOnboarding: z.boolean(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
export type OwnerSummary = NonNullable<MeResponse["owner"]>;

/** GET /api/auth-config — which sign-in methods the login page should offer. */
export const authConfigSchema = z.object({
  google: z.boolean(),
  phone: z.boolean(),
});
export type AuthConfig = z.infer<typeof authConfigSchema>;
