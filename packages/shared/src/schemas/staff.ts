import { z } from "zod";
import { staffRoleSchema } from "../enums";
import { toIndianE164 } from "./auth";

// Staff management (M1-T5). Staff log in on a paired device by tapping their name and entering a
// PIN (M1-T6), so PINs needn't be unique — but obvious ones are refused.

const PIN_FORMAT = /^\d{4,6}$/;

/** All one digit (1111), or a straight run up or down (1234, 4321, 123456, 987654). */
export function isWeakPin(pin: string): boolean {
  if (!PIN_FORMAT.test(pin)) return true;
  const d = [...pin].map(Number);
  const steps = new Set(d.slice(1).map((v, i) => v - (d[i] ?? 0)));
  return steps.size === 1 && [0, 1, -1].includes([...steps][0] ?? 99);
}

/** A random 4-digit PIN that passes the weak-PIN rules (uses the platform CSPRNG). */
export function suggestPin(): string {
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const pin = String((buf[0] ?? 0) % 10_000).padStart(4, "0");
    if (!isWeakPin(pin)) return pin;
  }
}

export const pinSchema = z
  .string()
  .trim()
  .regex(PIN_FORMAT, "PIN must be 4 to 6 digits")
  .refine((p) => !isWeakPin(p), "Too easy to guess — avoid repeated digits or runs like 1234");

const nameSchema = z
  .string()
  .trim()
  .min(2, "Name needs at least 2 characters")
  .max(60, "Name can be at most 60 characters");

/** Optional Indian mobile: "" → not given; anything else must be a valid number (stored E.164). */
const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    const e164 = toIndianE164(v);
    if (!e164) {
      ctx.addIssue({ code: "custom", message: "Enter a 10-digit Indian mobile number" });
      return z.NEVER;
    }
    return e164;
  });

export const employeeSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  role: staffRoleSchema,
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type Employee = z.infer<typeof employeeSchema>;

export const createEmployeeSchema = z.object({
  name: nameSchema,
  phone: phoneSchema.nullable().optional(),
  role: staffRoleSchema,
  pin: pinSchema,
});
export type CreateEmployeeInput = z.input<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z
  .object({
    name: nameSchema.optional(),
    phone: phoneSchema.nullable().optional(),
    role: staffRoleSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change");
export type UpdateEmployeeInput = z.input<typeof updateEmployeeSchema>;

export const setPinSchema = z.object({ pin: pinSchema });

export const staffListResponseSchema = z.object({
  employees: z.array(employeeSchema),
  /** Active staff vs the plan's MAX_STAFF; max is null when unlimited. */
  limit: z.object({ used: z.number().int(), max: z.number().int().nullable() }),
});
export type StaffList = z.infer<typeof staffListResponseSchema>;
