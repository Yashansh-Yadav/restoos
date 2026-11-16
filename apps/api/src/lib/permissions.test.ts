import { describe, expect, it } from "vitest";
import { can } from "./permissions";
import type { Actor } from "./tenant";

const staff = (role: "MANAGER" | "CASHIER" | "BUTLER" | "KITCHEN"): Actor => ({
  kind: "staff",
  employeeId: "e1",
  role,
});
const cap = (discountBps: number) => ({ discount: { discountBps, maxCashierDiscountBps: 1000 } });

describe("can()", () => {
  it("follows the role matrix", () => {
    expect(can({ kind: "owner", userId: "u", role: "OWNER" }, "billing.manageSubscription")).toBe(
      true,
    );
    expect(can({ kind: "owner", userId: "u", role: "ADMIN" }, "billing.manageSubscription")).toBe(
      false,
    );
    expect(can(staff("BUTLER"), "order.create")).toBe(true);
    expect(can(staff("KITCHEN"), "bill.create")).toBe(false);
  });

  it("lets system jobs do anything", () => {
    expect(can({ kind: "system", reason: "test" }, "bill.cancel")).toBe(true);
  });

  it("caps cashier discounts at the outlet setting; managers are uncapped", () => {
    expect(can(staff("CASHIER"), "bill.discount", cap(1000))).toBe(true);
    expect(can(staff("CASHIER"), "bill.discount", cap(1001))).toBe(false);
    expect(can(staff("MANAGER"), "bill.discount", cap(5000))).toBe(true);
    expect(can(staff("BUTLER"), "bill.discount", cap(0))).toBe(false);
  });
});
