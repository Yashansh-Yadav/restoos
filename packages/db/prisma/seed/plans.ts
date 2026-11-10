// Plans and entitlements — plan §15. Prices in paise, excluding 18% GST; editable later from /admin.
// Feature/limit keys move to packages/shared with the entitlements module (M12-T1).

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

export type PlanSeed = {
  key: string;
  name: string;
  kind: "SUBSCRIPTION" | "LIFETIME";
  monthlyPrice?: number;
  annualPrice?: number;
  oneTimePrice?: number;
  amcPrice?: number;
  features: readonly FeatureKey[];
  limits: Record<LimitKey, number>;
};

const core = ["POS_CORE", "QR_MENU", "OFFLINE"] as const;
const growth = [
  ...core,
  "BELL_SYSTEM",
  "STAFF_ANALYTICS",
  "CUSTOMER_SELF_ORDER",
  "WHATSAPP_BILLS",
  "CRM",
  "REVIEW_FLOW_FULL",
] as const;

// INVENTORY and AGGREGATORS are add-on purchases on Growth/Lifetime, so they are not plan features there.
export const PLANS: readonly PlanSeed[] = [
  {
    key: "STARTER",
    name: "Starter",
    kind: "SUBSCRIPTION",
    monthlyPrice: 99_900,
    annualPrice: 999_000,
    features: core,
    limits: { MAX_STAFF: 5, MAX_OUTLETS: 1 },
  },
  {
    key: "GROWTH",
    name: "Growth",
    kind: "SUBSCRIPTION",
    monthlyPrice: 249_900,
    annualPrice: 2_499_000,
    features: growth,
    limits: { MAX_STAFF: 20, MAX_OUTLETS: 1 },
  },
  {
    key: "PRO",
    name: "Pro",
    kind: "SUBSCRIPTION",
    monthlyPrice: 449_900,
    annualPrice: 4_499_000,
    features: FEATURE_KEYS,
    limits: { MAX_STAFF: UNLIMITED, MAX_OUTLETS: UNLIMITED },
  },
  {
    key: "LIFETIME_GROWTH",
    name: "Lifetime Growth",
    kind: "LIFETIME",
    oneTimePrice: 3_499_900,
    amcPrice: 999_900,
    features: growth,
    limits: { MAX_STAFF: 20, MAX_OUTLETS: 1 },
  },
];
