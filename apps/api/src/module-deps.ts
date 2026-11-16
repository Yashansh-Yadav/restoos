import type { PrismaClient } from "@restoos/db";
import type { Auth } from "./lib/auth";
import { createEntitlements, type Entitlements } from "./lib/entitlements";
import { createTenantDbFactory, type GetTenantDb } from "./lib/tenant";
import { createFeatureGuard, createTenantResolver, requirePermission } from "./plugins/tenant";

// What a tenant feature module receives (built once in app.ts). Never the raw Prisma client
// (rule 3): data goes through getTenantDb(tenantOf(request)).
export type ModuleDeps = {
  getTenantDb: GetTenantDb;
  entitlements: Entitlements;
  resolveTenant: ReturnType<typeof createTenantResolver>;
  requirePermission: typeof requirePermission;
  requireFeature: ReturnType<typeof createFeatureGuard>;
};

export function buildModuleDeps({
  auth,
  prisma,
}: {
  auth: Auth;
  prisma: PrismaClient;
}): ModuleDeps {
  const entitlements = createEntitlements(prisma);
  return {
    getTenantDb: createTenantDbFactory(prisma),
    entitlements,
    resolveTenant: createTenantResolver({ auth, prisma }),
    requirePermission,
    requireFeature: createFeatureGuard(entitlements),
  };
}
