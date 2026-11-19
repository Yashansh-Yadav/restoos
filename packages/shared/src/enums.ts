import { z } from "zod";

// zod mirrors of the Prisma enums (packages/db/prisma/schema.prisma). Used to validate API
// input/output and by the web app, which never imports @restoos/db. A unit test in packages/db
// fails if these drift from the generated Prisma enums.

export const orgRoleSchema = z.enum(["OWNER", "ADMIN"]);
export const staffRoleSchema = z.enum(["MANAGER", "CASHIER", "BUTLER", "KITCHEN"]);
export const orderingModeSchema = z.enum(["VIEW_ONLY", "SELF_ORDER_APPROVAL", "SELF_ORDER"]);
export const tableStatusSchema = z.enum([
  "FREE",
  "OCCUPIED",
  "ORDERED",
  "BILL_REQUESTED",
  "PAID",
  "CLEANING",
]);
export const dietTypeSchema = z.enum(["VEG", "NON_VEG", "EGG"]);
export const importStatusSchema = z.enum(["VALIDATED", "COMMITTED", "FAILED"]);
export const orderSourceSchema = z.enum(["STAFF", "CUSTOMER", "AGGREGATOR"]);
export const orderStatusSchema = z.enum(["PENDING_APPROVAL", "OPEN", "BILLED", "CANCELLED"]);
export const orderItemStatusSchema = z.enum([
  "NEW",
  "SENT",
  "PREPARING",
  "READY",
  "SERVED",
  "VOIDED",
]);
export const billStatusSchema = z.enum(["UNPAID", "PARTIALLY_PAID", "PAID", "CANCELLED"]);
export const paymentModeSchema = z.enum(["CASH", "CARD", "UPI", "OTHER"]);
export const paymentStatusSchema = z.enum(["PENDING", "SUCCEEDED", "FAILED"]);
export const consentPurposeSchema = z.enum(["TRANSACTIONAL", "MARKETING"]);
export const bellTargetSchema = z.enum(["BUTLER", "CASHIER", "MANAGER"]);
export const bellStatusSchema = z.enum([
  "NOTIFYING",
  "ACCEPTED",
  "DONE",
  "CANCELLED",
  "UNANSWERED",
]);
export const attemptOutcomeSchema = z.enum(["ACCEPTED", "DECLINED_BUSY", "MISSED", "SUPERSEDED"]);
export const declineReasonSchema = z.enum([
  "WITH_ANOTHER_TABLE",
  "IN_KITCHEN",
  "ON_BREAK",
  "OTHER",
]);
export const planKindSchema = z.enum(["SUBSCRIPTION", "LIFETIME"]);
export const billingIntervalSchema = z.enum(["MONTHLY", "ANNUAL"]);
export const subscriptionStatusSchema = z.enum([
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "GRACE",
  "CORE_MODE",
  "CANCELLED",
]);
export const licenceStatusSchema = z.enum(["ACTIVE", "AMC_DUE", "GRACE", "CORE_MODE"]);

export type OrderingMode = z.infer<typeof orderingModeSchema>;
export type StaffRole = z.infer<typeof staffRoleSchema>;
export type TableStatus = z.infer<typeof tableStatusSchema>;
export type DietType = z.infer<typeof dietTypeSchema>;
export type OrderItemStatus = z.infer<typeof orderItemStatusSchema>;
export type BillStatus = z.infer<typeof billStatusSchema>;
export type PaymentMode = z.infer<typeof paymentModeSchema>;
export type BellTarget = z.infer<typeof bellTargetSchema>;
export type BellStatus = z.infer<typeof bellStatusSchema>;

/** Keyed by the Prisma enum name — used by the drift test in packages/db. */
export const enumSchemas = {
  OrgRole: orgRoleSchema,
  StaffRole: staffRoleSchema,
  OrderingMode: orderingModeSchema,
  TableStatus: tableStatusSchema,
  DietType: dietTypeSchema,
  ImportStatus: importStatusSchema,
  OrderSource: orderSourceSchema,
  OrderStatus: orderStatusSchema,
  OrderItemStatus: orderItemStatusSchema,
  BillStatus: billStatusSchema,
  PaymentMode: paymentModeSchema,
  PaymentStatus: paymentStatusSchema,
  ConsentPurpose: consentPurposeSchema,
  BellTarget: bellTargetSchema,
  BellStatus: bellStatusSchema,
  AttemptOutcome: attemptOutcomeSchema,
  DeclineReason: declineReasonSchema,
  PlanKind: planKindSchema,
  BillingInterval: billingIntervalSchema,
  SubscriptionStatus: subscriptionStatusSchema,
  LicenceStatus: licenceStatusSchema,
} as const;
