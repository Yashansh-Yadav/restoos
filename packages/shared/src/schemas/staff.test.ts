import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  createEmployeeSchema,
  isWeakPin,
  pinSchema,
  suggestPin,
  updateEmployeeSchema,
} from "./staff";

describe("PIN rules", () => {
  it.each(["1111", "0000", "1234", "4321", "123456", "987654", "12345", "999999"])(
    "rejects the weak PIN %s",
    (pin) => {
      expect(isWeakPin(pin)).toBe(true);
      expect(pinSchema.safeParse(pin).success).toBe(false);
    },
  );

  it.each(["4827", "1001", "3003", "905172", "1235"])("accepts %s", (pin) => {
    expect(pinSchema.parse(pin)).toBe(pin);
  });

  it.each(["123", "1234567", "12a4", ""])("rejects the badly formed %s", (pin) => {
    expect(pinSchema.safeParse(pin).success).toBe(false);
  });

  it("only ever suggests strong 4-digit PINs", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const pin = suggestPin();
        expect(pin).toMatch(/^\d{4}$/);
        expect(isWeakPin(pin)).toBe(false);
      }),
      { numRuns: 500 },
    );
  });
});

describe("employee inputs", () => {
  it("normalises the mobile number and treats blank as none", () => {
    const base = { name: " Meera ", role: "MANAGER", pin: "4827" };
    expect(createEmployeeSchema.parse({ ...base, phone: "98765 43210" })).toMatchObject({
      name: "Meera",
      phone: "+919876543210",
    });
    expect(createEmployeeSchema.parse({ ...base, phone: "" }).phone).toBeNull();
    expect(createEmployeeSchema.safeParse({ ...base, phone: "12345" }).success).toBe(false);
  });

  it("needs at least one change", () => {
    expect(updateEmployeeSchema.safeParse({}).success).toBe(false);
    expect(updateEmployeeSchema.parse({ isActive: false })).toEqual({ isActive: false });
  });
});
