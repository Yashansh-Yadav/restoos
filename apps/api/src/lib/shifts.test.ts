import { describe, expect, it } from "vitest";
import { businessDateOf, startOfDay } from "./shifts";

describe("startOfDay", () => {
  it("returns local midnight in India as a UTC instant", () => {
    // 10:42 IST on 17 Nov = 05:12 UTC → midnight IST = 16 Nov 18:30 UTC.
    expect(startOfDay(new Date("2026-11-17T05:12:00Z"), "Asia/Kolkata").toISOString()).toBe(
      "2026-11-16T18:30:00.000Z",
    );
  });

  it("handles times after midnight IST that are still 'yesterday' in UTC", () => {
    // 00:30 IST on 17 Nov = 19:00 UTC on 16 Nov.
    expect(startOfDay(new Date("2026-11-16T19:00:00Z"), "Asia/Kolkata").toISOString()).toBe(
      "2026-11-16T18:30:00.000Z",
    );
    // 23:59 IST on 16 Nov still belongs to 16 Nov.
    expect(startOfDay(new Date("2026-11-16T18:29:00Z"), "Asia/Kolkata").toISOString()).toBe(
      "2026-11-15T18:30:00.000Z",
    );
  });

  it("works for other zones too", () => {
    expect(startOfDay(new Date("2026-11-17T12:00:00Z"), "UTC").toISOString()).toBe(
      "2026-11-17T00:00:00.000Z",
    );
  });
});

describe("businessDateOf (M5-T2)", () => {
  it("uses the outlet's local date: IST midnight, not UTC", () => {
    // 18:29 UTC = 23:59 IST on the 18th; 18:31 UTC = 00:01 IST on the 19th.
    expect(businessDateOf(new Date("2026-11-18T18:29:00Z"), "Asia/Kolkata")).toBe("2026-11-18");
    expect(businessDateOf(new Date("2026-11-18T18:31:00Z"), "Asia/Kolkata")).toBe("2026-11-19");
  });

  it("works for other zones", () => {
    expect(businessDateOf(new Date("2026-11-19T03:00:00Z"), "America/New_York")).toBe("2026-11-18");
  });
});
