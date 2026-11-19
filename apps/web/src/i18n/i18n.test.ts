import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import hi from "../../messages/hi.json";
import { resolveLocale } from "./locale";

// Every English string has a Hindi one (and the other way round), none left empty.
function leaves(obj: unknown, prefix = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object") for (const [kk, vv] of leaves(v, key)) out.set(kk, vv);
      else out.set(key, v);
    }
  }
  return out;
}

describe("messages (M5-T6a)", () => {
  it("en and hi have the same keys and no empty strings", () => {
    const e = leaves(en);
    const h = leaves(hi);
    expect([...h.keys()].sort()).toEqual([...e.keys()].sort());
    for (const [k, v] of [...e, ...h]) {
      expect(typeof v === "string" && v.trim().length > 0, k).toBe(true);
    }
  });

  it("keeps the same {placeholders} in both languages", () => {
    const e = leaves(en);
    const h = leaves(hi);
    const vars = (s: unknown) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [k, v] of e) expect(vars(h.get(k)), k).toEqual(vars(v));
  });
});

describe("resolveLocale", () => {
  it("prefers the cookie, then the browser languages, then English", () => {
    expect(resolveLocale("hi", "en-IN,en;q=0.9")).toBe("hi");
    expect(resolveLocale("fr", "hi-IN,hi;q=0.9,en;q=0.8")).toBe("hi");
    expect(resolveLocale(undefined, "en-IN,hi;q=0.9")).toBe("en");
    expect(resolveLocale(undefined, "ta-IN,hi;q=0.8,en;q=0.5")).toBe("hi");
    expect(resolveLocale(undefined, "en;q=0.4,hi;q=0.7")).toBe("hi");
    expect(resolveLocale(undefined, "ta,te")).toBe("en");
    expect(resolveLocale(null, null)).toBe("en");
    expect(resolveLocale(undefined, "hi;q=0")).toBe("en");
  });
});
