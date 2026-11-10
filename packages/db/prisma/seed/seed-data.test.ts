import { describe, expect, it } from "vitest";
import { ADD_ON_GROUPS, MENU } from "./menu";
import { FEATURE_KEYS, LIMIT_KEYS, PLANS, UNLIMITED } from "./plans";
import { DEMO_SECTIONS, DEMO_STAFF } from "./tenant";

const GST_RATES_BPS = new Set([0, 500, 1_200, 1_800, 2_800]);
const isPaise = (n: number) => Number.isInteger(n) && n >= 0;

describe("seed menu", () => {
  const items = MENU.flatMap((c) => c.items);

  it("has about 30 items across 6 categories", () => {
    expect(MENU).toHaveLength(6);
    expect(items).toHaveLength(30);
  });

  it("uses unique item codes", () => {
    expect(new Set(items.map((i) => i.code)).size).toBe(items.length);
  });

  it("stores every price as integer paise (variants and add-ons too)", () => {
    for (const i of items) {
      expect(isPaise(i.price), i.code).toBe(true);
      for (const v of i.variants ?? []) expect(isPaise(v.price), `${i.code} ${v.name}`).toBe(true);
    }
    for (const g of Object.values(ADD_ON_GROUPS)) {
      for (const a of g.addOns) expect(isPaise(a.price), a.name).toBe(true);
    }
  });

  it("uses only valid GST rates and mixes several of them", () => {
    for (const i of items) expect(GST_RATES_BPS.has(i.taxRateBps), i.code).toBe(true);
    expect(new Set(items.map((i) => i.taxRateBps)).size).toBeGreaterThan(1);
  });

  it("gives every item a Hindi name and HSN/SAC code", () => {
    for (const i of items) {
      expect(i.nameHi.length, i.code).toBeGreaterThan(0);
      expect(i.hsnSac, i.code).toMatch(/^\d{4,8}$/);
    }
  });

  it("keeps add-on group min/max consistent", () => {
    for (const g of Object.values(ADD_ON_GROUPS)) {
      expect(g.minSelect).toBeLessThanOrEqual(g.maxSelect);
      expect(g.maxSelect).toBeLessThanOrEqual(g.addOns.length);
    }
  });
});

describe("seed plans (plan §15)", () => {
  const byKey = Object.fromEntries(PLANS.map((p) => [p.key, p]));

  it("defines the four plans", () => {
    expect(Object.keys(byKey).sort()).toEqual(["GROWTH", "LIFETIME_GROWTH", "PRO", "STARTER"]);
  });

  it("gates the bell system: off on Starter, on from Growth", () => {
    expect(byKey.STARTER?.features).not.toContain("BELL_SYSTEM");
    expect(byKey.GROWTH?.features).toContain("BELL_SYSTEM");
    expect(byKey.LIFETIME_GROWTH?.features).toContain("BELL_SYSTEM");
  });

  it("keeps core POS features on every plan", () => {
    for (const p of PLANS)
      expect(p.features).toEqual(expect.arrayContaining(["POS_CORE", "OFFLINE"]));
  });

  it("gives Pro every feature and unlimited staff/outlets", () => {
    expect([...(byKey.PRO?.features ?? [])].sort()).toEqual([...FEATURE_KEYS].sort());
    expect(byKey.PRO?.limits).toEqual({ MAX_STAFF: UNLIMITED, MAX_OUTLETS: UNLIMITED });
  });

  it("sets staff limits 5 / 20 / 20", () => {
    expect(byKey.STARTER?.limits.MAX_STAFF).toBe(5);
    expect(byKey.GROWTH?.limits.MAX_STAFF).toBe(20);
    expect(byKey.LIFETIME_GROWTH?.limits.MAX_STAFF).toBe(20);
  });

  it("stores prices as integer paise and defines every limit", () => {
    for (const p of PLANS) {
      for (const price of [p.monthlyPrice, p.annualPrice, p.oneTimePrice, p.amcPrice]) {
        if (price !== undefined) expect(isPaise(price), p.key).toBe(true);
      }
      for (const k of LIMIT_KEYS) expect(Number.isInteger(p.limits[k]), `${p.key} ${k}`).toBe(true);
    }
  });
});

describe("seed demo tenant (plan §6.2)", () => {
  it("has 12 tables across 2 sections", () => {
    expect(DEMO_SECTIONS).toHaveLength(2);
    expect(DEMO_SECTIONS.reduce((n, s) => n + s.tables, 0)).toBe(12);
  });

  it("has 1 manager, 1 cashier, 3 butlers, 1 kitchen with unique 4-6 digit PINs", () => {
    const count = (r: string) => DEMO_STAFF.filter((s) => s.role === r).length;
    expect([count("MANAGER"), count("CASHIER"), count("BUTLER"), count("KITCHEN")]).toEqual([
      1, 1, 3, 1,
    ]);
    for (const s of DEMO_STAFF) expect(s.pin).toMatch(/^\d{4,6}$/);
    expect(new Set(DEMO_STAFF.map((s) => s.pin)).size).toBe(DEMO_STAFF.length);
  });
});
