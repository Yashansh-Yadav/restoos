import { describe, expect, it } from "vitest";
import { startOfDay } from "./shifts";

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
