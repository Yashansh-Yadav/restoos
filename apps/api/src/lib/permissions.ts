import { roleHasPermission, type Permission } from "@restoos/shared";
import type { Actor } from "./tenant";

// can() — the single permission check (plan §5.4). Routes use requirePermission() (plugins/tenant.ts);
// checks that depend on the resource (e.g. the cashier discount cap) call can() with it.

/** Extra facts some permissions depend on. */
export type PermissionResource = {
  /** bill.discount: the discount being applied, and the outlet's cap for cashiers. */
  discount?: { discountBps: number; maxCashierDiscountBps: number };
};

export function can(
  actor: Actor,
  permission: Permission,
  resource: PermissionResource = {},
): boolean {
  if (actor.kind === "system") return true;
  if (!roleHasPermission(actor.role, permission)) return false;

  if (permission === "bill.discount" && actor.role === "CASHIER" && resource.discount) {
    return resource.discount.discountBps <= resource.discount.maxCashierDiscountBps;
  }
  return true;
}
