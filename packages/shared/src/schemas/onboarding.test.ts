import { describe, expect, it } from "vitest";
import { billingStepSchema, businessStepSchema, onboardingRequestSchema, outletStepSchema } from "./onboarding";

const outlet = {
  name: "Saffron Table — Bandra",
  address: "12 Hill Road, Bandra West, Mumbai 400050",
  stateCode: "27",
};

const fieldErrors = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  (r.error?.issues ?? []).map((i) => i.path.join("."));

describe("onboarding schemas", () => {
  it("accepts a minimal valid business and outlet", () => {
    expect(businessStepSchema.safeParse({ name: "Saffron Table", legalName: "Saffron Table Hospitality Pvt Ltd" }).success).toBe(true);
    expect(outletStepSchema.safeParse(outlet).success).toBe(true);
  });

  it("treats blank optional fields as not provided and normalises GSTIN case", () => {
    const r = outletStepSchema.parse({ ...outlet, gstin: "  27aapfu0939f1zv ", fssaiNumber: "" });
    expect(r.gstin).toBe("27AAPFU0939F1ZV");
    expect(r.fssaiNumber).toBeUndefined();
  });

  it("rejects a GSTIN with a typo (checksum) or from another state", () => {
    expect(fieldErrors(outletStepSchema.safeParse({ ...outlet, gstin: "27AAPFU0939F1ZW" }))).toEqual(["gstin"]);
    expect(fieldErrors(outletStepSchema.safeParse({ ...outlet, stateCode: "29", gstin: "27AAPFU0939F1ZV" }))).toEqual(["gstin"]);
  });

  it("checks state, FSSAI and short/long text", () => {
    expect(fieldErrors(outletStepSchema.safeParse({ ...outlet, stateCode: "25" }))).toEqual(["stateCode"]);
    expect(fieldErrors(outletStepSchema.safeParse({ ...outlet, fssaiNumber: "1234" }))).toEqual(["fssaiNumber"]);
    expect(fieldErrors(outletStepSchema.safeParse({ ...outlet, address: "short" }))).toEqual(["address"]);
  });

  it("requires a 2-character invoice code (upper-cased)", () => {
    expect(billingStepSchema.parse({ pricesIncludeTax: false, code: "st" }).code).toBe("ST");
    for (const code of ["S", "STB", "S-", ""]) {
      expect(billingStepSchema.safeParse({ pricesIncludeTax: true, code }).success, code).toBe(false);
    }
  });

  it("combines everything into the API request", () => {
    const r = onboardingRequestSchema.safeParse({
      organization: { name: "Saffron Table", legalName: "Saffron Table Hospitality Pvt Ltd" },
      outlet: { ...outlet, pricesIncludeTax: false, code: "ST" },
    });
    expect(r.success).toBe(true);
  });
});
