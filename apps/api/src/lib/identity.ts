import type { PrismaClient } from "@restoos/db";
import type { MeResponse } from "@restoos/shared";
import { isPlaceholderEmail } from "./auth";

// Who is signed in (pre-tenant): an authenticated user may not have an organisation yet.
// Lives in lib/ (not modules/) because it runs before a TenantContext exists (rule 3).

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  phoneNumber?: string | null;
  phoneNumberVerified?: boolean | null;
};

/** Bound to the raw client in app.ts, so route modules never hold it (rule 3). */
export type IdentityService = { getMe(user: SessionUser): Promise<MeResponse> };

export function createIdentityService(prisma: PrismaClient): IdentityService {
  return { getMe: (user) => getMe(prisma, user) };
}

export async function getMe(prisma: PrismaClient, user: SessionUser): Promise<MeResponse> {
  const [accounts, owner] = await Promise.all([
    prisma.account.findMany({ where: { userId: user.id }, select: { providerId: true } }),
    prisma.ownerAccount.findUnique({
      where: { authUserId: user.id },
      select: {
        organizationId: true,
        role: true,
        organization: {
          select: {
            name: true,
            outlets: {
              select: { id: true, name: true, code: true },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    }),
  ]);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: isPlaceholderEmail(user.email) ? null : user.email,
      phoneNumber: user.phoneNumberVerified ? (user.phoneNumber ?? null) : null,
      image: user.image ?? null,
      linked: {
        google: accounts.some((a) => a.providerId === "google"),
        phone: Boolean(user.phoneNumberVerified && user.phoneNumber),
      },
    },
    owner: owner && {
      organizationId: owner.organizationId,
      organizationName: owner.organization.name,
      role: owner.role,
      outlets: owner.organization.outlets,
    },
    needsOnboarding: owner === null,
  };
}
