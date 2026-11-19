import type { Prisma } from "./generated/prisma/client";

// How each model is isolated between restaurants (plan §5.3, M1-T3). apps/api's getTenantDb(ctx)
// reads this map to add tenant filters to every query. It is typed as a Record over every model
// name, so adding a model to schema.prisma without classifying it here is a compile error; a unit
// test (tenancy.test.ts) checks each entry against the real columns in schema.prisma.

export type ModelScope =
  /** The Organization row itself — scoped by its `id`. */
  | "organization-root"
  /** Has `organizationId`, no `outletId`. */
  | "organization"
  /** Has `organizationId` and a required `outletId`. */
  | "outlet"
  /** Has `organizationId` and a nullable `outletId` (org-level rows have none). */
  | "outlet-optional"
  /** Shared catalogue (plans) — tenants may read, never write. */
  | "global"
  /** Better Auth tables — never reachable through a tenant client. */
  | "auth";

export const MODEL_SCOPE = {
  Organization: "organization-root",
  OwnerAccount: "organization",
  User: "auth",
  Session: "auth",
  Account: "auth",
  Verification: "auth",
  Outlet: "organization",
  Employee: "outlet",
  Device: "outlet",
  StaffSession: "organization",
  Shift: "outlet",
  PushSubscription: "organization",
  Section: "outlet",
  DiningTable: "outlet",
  TableAssignment: "outlet",
  TableSession: "outlet",
  MenuCategory: "outlet",
  MenuItem: "outlet",
  ItemVariant: "organization",
  AddOnGroup: "outlet",
  AddOn: "organization",
  ItemAddOnGroup: "organization",
  MenuImport: "outlet",
  Order: "outlet",
  OrderItem: "organization",
  Kot: "outlet",
  KotCounter: "outlet",
  InvoiceBlock: "outlet",
  Bill: "outlet",
  Payment: "organization",
  Customer: "organization",
  CustomerConsent: "organization",
  Feedback: "outlet",
  BellEvent: "outlet",
  BellAttempt: "organization",
  Plan: "global",
  PlanFeature: "global",
  Subscription: "outlet",
  Licence: "outlet",
  AddOnPurchase: "outlet",
  PlatformInvoice: "organization",
  MessageCredit: "organization",
  AuditLog: "outlet-optional",
} as const satisfies Record<Prisma.ModelName, ModelScope>;

export type ModelName = keyof typeof MODEL_SCOPE;

/** Scope of a model by its Prisma name (as passed to query extensions); undefined if unknown. */
export function modelScope(model: string): ModelScope | undefined {
  return (MODEL_SCOPE as Record<string, ModelScope>)[model];
}
