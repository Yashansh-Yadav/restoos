import type { PrismaClient } from "@restoos/db";
import { ALWAYS_ON_FEATURES, UNLIMITED, type FeatureKey, type LimitKey } from "@restoos/shared";

// Entitlements (plan §5.5) — STUB until M12-T1. Code checks features/limits, never plan names.
// Resolution: the outlet's live subscription → its plan; else a live licence → its plan; else
// the Growth plan (stand-in until trials/subscriptions exist, M12-T2). No Redis cache yet.
// POS_CORE and OFFLINE are always on: billing, KOT and printing never stop (rule 5).

/** Stand-in plan for outlets without a subscription or licence. M12-T1/T2 replace this. */
export const STUB_DEFAULT_PLAN_KEY = "GROWTH";

export type Entitlements = {
  hasFeature(outletId: string, feature: FeatureKey): Promise<boolean>;
  /** The limit, or Infinity when unlimited (or when no plan defines it). */
  getLimit(outletId: string, limit: LimitKey): Promise<number>;
};

export function createEntitlements(prisma: PrismaClient): Entitlements {
  async function resolve(outletId: string) {
    // Statuses are kept current by the M12 jobs; CORE_MODE leaves only the always-on features.
    // Limits still come from the plan in core mode.
    const subscription = await prisma.subscription.findFirst({
      where: { outletId, status: { not: "CANCELLED" } },
      select: { planId: true, status: true },
    });
    const licence = subscription
      ? null
      : await prisma.licence.findFirst({
          where: { outletId },
          select: { planId: true, status: true },
        });
    const source = subscription ?? licence;
    const rows = await prisma.planFeature.findMany({
      where: source ? { planId: source.planId } : { plan: { key: STUB_DEFAULT_PLAN_KEY } },
      select: { featureKey: true, limitValue: true },
    });
    return {
      coreMode: source?.status === "CORE_MODE",
      plan: new Map(rows.map((f) => [f.featureKey, f.limitValue])),
    };
  }

  return {
    async hasFeature(outletId, feature) {
      if (ALWAYS_ON_FEATURES.includes(feature)) return true;
      const { coreMode, plan } = await resolve(outletId);
      return !coreMode && plan.has(feature);
    },
    async getLimit(outletId, limit) {
      const value = (await resolve(outletId)).plan.get(limit);
      return value === undefined || value === null || value === UNLIMITED ? Infinity : value;
    },
  };
}
