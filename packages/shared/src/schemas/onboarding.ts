import { z } from "zod";
import { FSSAI_FORMAT, GST_STATE_CODES, isValidGstin, OUTLET_INVOICE_CODE } from "../india";

// Onboarding wizard (M1-T2): one schema per step so the web form validates step by step, and
// the full request schema (same rules) is enforced again by the API (rule 10).

const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} needs at least ${min} characters`)
    .max(max, `${label} can be at most ${max} characters`);

/** Optional field: "" or whitespace counts as not provided. */
const optionalText = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isValidGstin, "Check the GSTIN — it should be 15 characters, e.g. 27AAPFU0939F1ZV");

export const businessStepSchema = z.object({
  name: trimmed(2, 80, "Brand name"),
  legalName: trimmed(2, 120, "Legal name"),
  gstin: optionalText(gstin),
});

export const outletStepSchema = z
  .object({
    name: trimmed(2, 80, "Outlet name"),
    address: trimmed(10, 300, "Address"),
    stateCode: z.enum(GST_STATE_CODES, { error: "Choose the state" }),
    gstin: optionalText(gstin),
    fssaiNumber: optionalText(z.string().trim().regex(FSSAI_FORMAT, "FSSAI number has 14 digits")),
  })
  .refine((o) => !o.gstin || o.gstin.startsWith(o.stateCode), {
    path: ["gstin"],
    message: "This GSTIN belongs to another state — its first two digits must match the state",
  });

export const billingStepSchema = z.object({
  pricesIncludeTax: z.boolean(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(OUTLET_INVOICE_CODE, "Use exactly 2 letters or digits, e.g. ST"),
});

export const onboardingRequestSchema = z.object({
  organization: businessStepSchema,
  outlet: outletStepSchema.and(billingStepSchema),
});
export type OnboardingRequest = z.infer<typeof onboardingRequestSchema>;
export type OnboardingInput = z.input<typeof onboardingRequestSchema>;

export const onboardingResponseSchema = z.object({
  organizationId: z.string(),
  outletId: z.string(),
});
