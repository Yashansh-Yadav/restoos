import { describe, expect, it } from "vitest";
import { bulkTablesSchema, labelRange, tableLabelSchema } from "./floor";

describe("labelRange", () => {
  it("numbers tables from a prefix", () => {
    expect(labelRange("T", "1", 5)).toEqual(["T1", "T2", "T3", "T4", "T5"]);
    expect(labelRange("t", 9, 11)).toEqual(["T9", "T10", "T11"]);
    expect(labelRange("", "1", 3)).toEqual(["1", "2", "3"]);
  });

  it("pads when From has a leading zero", () => {
    expect(labelRange("A", "01", 3)).toEqual(["A01", "A02", "A03"]);
    expect(labelRange("VIP-", "001", 2)).toEqual(["VIP-001", "VIP-002"]);
  });
});

describe("table labels", () => {
  it("normalise to upper case without spaces", () => {
    expect(tableLabelSchema.parse(" t 12 ")).toBe("T12");
    expect(tableLabelSchema.safeParse("Table#1").success).toBe(false);
    expect(tableLabelSchema.safeParse("TOOLONG12").success).toBe(false);
  });
});

describe("bulkTablesSchema", () => {
  const ok = { sectionId: "s1", prefix: "T", from: "1", to: 20 };
  it("accepts T1–T20 and defaults seats", () => {
    expect(bulkTablesSchema.parse(ok)).toMatchObject({ prefix: "T", seats: 4 });
  });
  it.each([
    [{ ...ok, from: "5", to: 4 }, "at least"],
    [{ ...ok, from: "1", to: 101 }, "At most 100"],
    [{ ...ok, prefix: "TABLES" }, "Keep the prefix short"],
  ])("rejects %j", (input, message) => {
    const r = bulkTablesSchema.safeParse(input);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.message).join(" ")).toContain(message);
  });
});
