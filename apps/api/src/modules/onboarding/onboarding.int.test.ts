// M1-T2: onboarding creates the tenant (organisation + owner + first outlet) exactly once.
import { apiErrorSchema, meResponseSchema } from "@restoos/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthHarness } from "../../test/auth-harness";

type Harness = Awaited<ReturnType<typeof createAuthHarness>>;
let h: Harness;

const valid = {
  organization: {
    name: "Saffron Table",
    legalName: "Saffron Table Hospitality Pvt Ltd",
    gstin: "27AAPFU0939F1ZV",
  },
  outlet: {
    name: "Saffron Table — Bandra",
    address: "12 Hill Road, Bandra West, Mumbai 400050",
    stateCode: "27",
    gstin: "27aapfu0939f1zv",
    fssaiNumber: "11526999000123",
    pricesIncludeTax: true,
    code: "st",
  },
};

beforeEach(async () => {
  h = await createAuthHarness();
});

afterEach(async () => {
  await h.close();
});

const onboard = (body: unknown) => h.request("POST", "/api/onboarding", body as object);

describe("POST /api/onboarding", () => {
  it("creates the organisation, owner and first outlet, and /api/me stops asking for onboarding", async () => {
    await h.signInWithPhone("+919876543210");
    const res = await onboard(valid);
    expect(res.statusCode, res.body).toBe(201);

    const outlet = await h.prisma.outlet.findFirstOrThrow({ include: { organization: true } });
    expect(outlet).toMatchObject({
      code: "ST",
      gstin: "27AAPFU0939F1ZV",
      stateCode: "27",
      pricesIncludeTax: true,
      fssaiNumber: "11526999000123",
      organization: { name: "Saffron Table", legalName: "Saffron Table Hospitality Pvt Ltd" },
    });
    const owner = await h.prisma.ownerAccount.findFirstOrThrow();
    expect(owner).toMatchObject({ organizationId: outlet.organizationId, role: "OWNER" });

    const me = meResponseSchema.parse((await h.request("GET", "/api/me")).json());
    expect(me).toMatchObject({
      needsOnboarding: false,
      owner: {
        organizationName: "Saffron Table",
        role: "OWNER",
        outlets: [{ id: outlet.id, name: "Saffron Table — Bandra", code: "ST" }],
      },
    });
  });

  it("refuses a second onboarding and creates nothing extra", async () => {
    await h.signInWithPhone("+919876543210");
    expect((await onboard(valid)).statusCode).toBe(201);
    const again = await onboard(valid);
    expect(again.statusCode).toBe(409);
    expect(apiErrorSchema.parse(again.json()).error.code).toBe("ALREADY_ONBOARDED");
    expect(await h.prisma.organization.count()).toBe(1);
    expect(await h.prisma.outlet.count()).toBe(1);
  });

  it("allows only one success when the same owner double-submits at once", async () => {
    await h.signInWithPhone("+919876543210");
    const results = await Promise.all([onboard(valid), onboard(valid)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(await h.prisma.organization.count()).toBe(1);
  });

  it.each([
    ["a GSTIN with a typo", { outlet: { ...valid.outlet, gstin: "27AAPFU0939F1ZW" } }],
    ["a GSTIN from another state", { outlet: { ...valid.outlet, stateCode: "29" } }],
    ["a 3-character invoice code", { outlet: { ...valid.outlet, code: "STB" } }],
    ["an unknown state", { outlet: { ...valid.outlet, stateCode: "25", gstin: undefined } }],
  ])("rejects %s with a 400 and saves nothing", async (_label, patch) => {
    await h.signInWithPhone("+919876543210");
    const res = await onboard({ ...valid, ...patch });
    expect(res.statusCode).toBe(400);
    expect(apiErrorSchema.parse(res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(await h.prisma.organization.count()).toBe(0);
  });

  it("requires sign-in", async () => {
    const res = await onboard(valid);
    expect(res.statusCode).toBe(401);
    expect(await h.prisma.organization.count()).toBe(0);
  });
});
