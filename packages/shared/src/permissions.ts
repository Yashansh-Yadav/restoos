// Roles and permissions (plan §5.4, M1-T4). Code-defined; owners may customise in phase 2.
// The API enforces these on every route (rule 4); the web app only uses them to hide UI.

export const PERMISSIONS = [
  "menu.edit",
  "menu.toggleStock",
  "floor.edit",
  "table.assign",
  /** Move guests to another table / merge tables (M5-T7, audited). */
  "table.move",
  "order.create",
  "order.voidItem",
  "kot.updateStatus",
  "bill.create",
  "bill.discount",
  "bill.cancel",
  "bill.reprint",
  "payment.record",
  "bell.respond",
  "reports.view",
  "staff.manage",
  "billing.manageSubscription",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Owner-side roles (OwnerAccount) and outlet staff roles (Employee). */
export const ROLES = ["OWNER", "ADMIN", "MANAGER", "CASHIER", "BUTLER", "KITCHEN"] as const;
export type Role = (typeof ROLES)[number];

const ALL: readonly Permission[] = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: ALL,
  // Co-owner/partner: everything except paying for RestoOS (decision log 2026-11-16).
  ADMIN: ALL.filter((p) => p !== "billing.manageSubscription"),
  MANAGER: ALL.filter((p) => p !== "billing.manageSubscription"),
  CASHIER: [
    "menu.toggleStock",
    "table.move", // the counter usually handles seating (user decision 2026-11-19)
    "order.create",
    "bill.create",
    "bill.discount", // capped by outlet.maxCashierDiscountBps — checked with the resource in can()
    "bill.reprint",
    "payment.record",
    "bell.respond",
  ],
  BUTLER: ["order.create", "bell.respond"],
  KITCHEN: ["menu.toggleStock", "kot.updateStatus"],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}
