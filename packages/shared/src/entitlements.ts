// Entitlement keys (plan §5.5). Code checks features and limits, never plan names.
// Resolution lives in apps/api/src/lib/entitlements.ts; plans are seeded from packages/db.

export const FEATURE_KEYS = [
  "POS_CORE",
  "QR_MENU",
  "OFFLINE",
  "BELL_SYSTEM",
  "STAFF_ANALYTICS",
  "CUSTOMER_SELF_ORDER",
  "WHATSAPP_BILLS",
  "CRM",
  "REVIEW_FLOW_FULL",
  "INVENTORY",
  "AGGREGATORS",
  "AI_INSIGHTS",
  "MULTI_OUTLET",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const LIMIT_KEYS = ["MAX_STAFF", "MAX_OUTLETS"] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

/** Stored in PlanFeature.limitValue to mean "no limit". */
export const UNLIMITED = -1;

/** Always on, whatever the plan or its status: billing, KOT and printing never stop (rule 5). */
export const ALWAYS_ON_FEATURES: readonly FeatureKey[] = ["POS_CORE", "OFFLINE"];
