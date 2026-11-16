import { describe, expect, it } from "vitest";
import { formatIndianMobile, indianMobileSchema, otpCodeSchema, toIndianE164 } from "./auth";

describe("formatIndianMobile", () => {
  it("groups the digits for display and leaves anything else untouched", () => {
    expect(formatIndianMobile("+919876543210")).toBe("+91 98765 43210");
    expect(formatIndianMobile("+14155552671")).toBe("+14155552671");
  });
});

describe("toIndianE164", () => {
  it("normalises the ways owners type Indian mobile numbers", () => {
    for (const input of [
      "9876543210",
      "98765 43210",
      "+91 98765-43210",
      "09876543210",
      "919876543210",
      "0091 9876543210",
    ]) {
      expect(toIndianE164(input), input).toBe("+919876543210");
    }
  });

  it("rejects landlines, short numbers and other countries", () => {
    for (const input of ["", "12345", "5876543210", "+14155552671", "98765432101", "abcdefghij"]) {
      expect(toIndianE164(input), input).toBeNull();
    }
  });
});

describe("schemas", () => {
  it("validates E.164 Indian mobiles and 6-digit codes", () => {
    expect(indianMobileSchema.safeParse("+919876543210").success).toBe(true);
    expect(indianMobileSchema.safeParse("9876543210").success).toBe(false);
    expect(otpCodeSchema.safeParse("123456").success).toBe(true);
    expect(otpCodeSchema.safeParse("12345").success).toBe(false);
  });
});
