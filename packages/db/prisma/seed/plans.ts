// Plans and entitlements — plan §15. Prices in paise, excluding 18% GST; editable later from /admin.
// Feature/limit keys live in packages/shared (entitlements.ts) since M1-T4.
import {
  FEATURE_KEYS,
  LIMIT_KEYS,
  UNLIMITED,
  type FeatureKey,
  type LimitKey,
} from "@restoos/shared";

import type { PrismaClient } from "../../src/index";

export { FEATURE_KEYS, LIMIT_KEYS, UNLIMITED, type FeatureKey, type LimitKey };

/** Upserts every plan with its features and limits (seed, and tests via @restoos/db/testing). */
export async function upsertPlans(db: PrismaClient): Promise<void> {
  for (const p of PLANS) {
    const data = {
      name: p.name,
      kind: p.kind,
      monthlyPrice: p.monthlyPrice ?? null,
      annualPrice: p.annualPrice ?? null,
      oneTimePrice: p.oneTimePrice ?? null,
      amcPrice: p.amcPrice ?? null,
    };
    const plan = await db.plan.upsert({
      where: { key: p.key },
      create: { key: p.key, ...data },
      update: data,
    });
    await db.planFeature.deleteMany({ where: { planId: plan.id } });
    await db.planFeature.createMany({
      data: [
        ...p.features.map((featureKey) => ({ planId: plan.id, featureKey, limitValue: null })),
        ...LIMIT_KEYS.map((featureKey) => ({
          planId: plan.id,
          featureKey,
          limitValue: p.limits[featureKey],
        })),
      ],
    });
  }
}

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
