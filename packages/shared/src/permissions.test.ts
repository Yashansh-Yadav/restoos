// M1-T4 acceptance: every role × permission, written out exactly as plan §5.4 (+ ADMIN).
import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
  roleHasPermission,
  type Permission,
} from "./permissions";

// Columns: OWNER ADMIN MANAGER CASHIER BUTLER KITCHEN  (1 = allowed)
// prettier-ignore
const MATRIX: Record<Permission, [number, number, number, number, number, number]> = {
  "menu.edit":                  [1, 1, 1, 0, 0, 0],
  "menu.toggleStock":           [1, 1, 1, 1, 0, 1],
  "floor.edit":                 [1, 1, 1, 0, 0, 0],
  "table.assign":               [1, 1, 1, 0, 0, 0],
  "table.move":                 [1, 1, 1, 1, 0, 0],
  "order.create":               [1, 1, 1, 1, 1, 0],
  "order.voidItem":             [1, 1, 1, 0, 0, 0],
  "kot.updateStatus":           [1, 1, 1, 0, 0, 1],
  "bill.create":                [1, 1, 1, 1, 0, 0],
  "bill.discount":              [1, 1, 1, 1, 0, 0],
  "bill.cancel":                [1, 1, 1, 0, 0, 0],
  "bill.reprint":               [1, 1, 1, 1, 0, 0],
  "payment.record":             [1, 1, 1, 1, 0, 0],
  "bell.respond":               [1, 1, 1, 1, 1, 0],
  "reports.view":               [1, 1, 1, 0, 0, 0],
  "staff.manage":               [1, 1, 1, 0, 0, 0],
  "billing.manageSubscription": [1, 0, 0, 0, 0, 0],
};

const cases = PERMISSIONS.flatMap((permission) =>
  ROLES.map((role, i) => ({ role, permission, allowed: MATRIX[permission][i] === 1 })),
);

describe("permissions matrix (plan §5.4)", () => {
  it("covers every permission × role", () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...PERMISSIONS].sort());
    expect(cases).toHaveLength(PERMISSIONS.length * ROLES.length);
  });

  it.each(cases)("$role → $permission: $allowed", ({ role, permission, allowed }) => {
    expect(roleHasPermission(role, permission)).toBe(allowed);
  });

  it("lists only known permissions, without duplicates", () => {
    for (const role of ROLES) {
      const list = ROLE_PERMISSIONS[role];
      expect(new Set(list).size).toBe(list.length);
      for (const p of list) expect(PERMISSIONS).toContain(p);
    }
  });
});
