import type { PrismaClient } from "@restoos/db";
import type { OnboardingRequest } from "@restoos/shared";

// Onboarding (M1-T2) creates the tenant: Organization → OwnerAccount (OWNER) → first Outlet, in one
// transaction. It runs before any TenantContext exists, so it lives in lib/ like identity.ts.

export class AlreadyOnboardedError extends Error {
  constructor() {
    super("This account already has a restaurant set up");
    this.name = "AlreadyOnboardedError";
  }
}

export async function completeOnboarding(
  prisma: PrismaClient,
  userId: string,
  input: OnboardingRequest,
): Promise<{ organizationId: string; outletId: string }> {
  try {
    return await prisma.$transaction(async (tx) => {
      // Checked inside the transaction; the unique authUserId also stops a racing double-submit.
      const existing = await tx.ownerAccount.findUnique({ where: { authUserId: userId } });
      if (existing) throw new AlreadyOnboardedError();

      const organization = await tx.organization.create({
        data: {
          name: input.organization.name,
          legalName: input.organization.legalName,
          gstin: input.organization.gstin ?? null,
        },
      });
      await tx.ownerAccount.create({
        data: { organizationId: organization.id, authUserId: userId, role: "OWNER" },
      });
      const outlet = await tx.outlet.create({
        data: {
          organizationId: organization.id,
          code: input.outlet.code,
          name: input.outlet.name,
          address: input.outlet.address,
          stateCode: input.outlet.stateCode,
          gstin: input.outlet.gstin ?? null,
          fssaiNumber: input.outlet.fssaiNumber ?? null,
          pricesIncludeTax: input.outlet.pricesIncludeTax,
        },
      });
      return { organizationId: organization.id, outletId: outlet.id };
    });
  } catch (err) {
    // Unique violation on OwnerAccount.authUserId = a concurrent submit won the race.
    if (err instanceof Error && "code" in err && err.code === "P2002") throw new AlreadyOnboardedError();
    throw err;
  }
}
