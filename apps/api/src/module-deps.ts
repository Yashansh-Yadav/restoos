import type { PrismaClient } from "@restoos/db";
import type { Auth } from "./lib/auth";
import { createEntitlements, type Entitlements } from "./lib/entitlements";
import { createEventBus, type EventBus } from "./lib/events";
import type { Redis } from "./lib/redis";
import { createStaffAuth, type StaffAuth } from "./lib/staff-auth";
import type { FileStorage } from "./lib/storage";
import type { Realtime } from "./socket/realtime";
import { createTenantDbFactory, type GetTenantDb } from "./lib/tenant";
import {
  createFeatureGuard,
  createActorResolver,
  createTenantResolver,
  type ResolveActor,
  requireOutlet,
  requirePermission,
} from "./plugins/tenant";

// What a tenant feature module receives (built once in app.ts). Never the raw Prisma client
// (rule 3): data goes through getTenantDb(tenantOf(request)); pre-tenant work (device pairing,
// PIN sign-in) through the bound staffAuth service.
export type ModuleDeps = {
  getTenantDb: GetTenantDb;
  entitlements: Entitlements;
  staffAuth: StaffAuth;
  resolveTenant: ReturnType<typeof createTenantResolver>;
  /** The same auth rules for non-HTTP callers (the Socket.io handshake, M4-T1). */
  resolveActor: ResolveActor;
  requirePermission: typeof requirePermission;
  requireOutlet: typeof requireOutlet;
  requireFeature: ReturnType<typeof createFeatureGuard>;
  /** Set Secure on our cookies (APP_URL is https). */
  secureCookies: boolean;
  /** Public web origin (APP_URL), e.g. for customer links printed on QR cards. */
  appUrl: string;
  /** Uploaded files (menu photos). */
  storage: FileStorage;
  /** publishEvent() after successful writes; routed to Socket.io rooms (M4-T2). */
  events: EventBus;
  /** Cut off live sockets (sign-out, QR rotation…); a no-op without Socket.io. */
  realtime: Realtime;
};

export function buildModuleDeps({
  auth,
  prisma,
  redis,
  storage,
  events,
  appUrl = "http://localhost:3000",
  realtime = { disconnect: () => undefined },
  log,
}: {
  auth: Auth;
  prisma: PrismaClient;
  redis: Redis;
  storage: FileStorage;
  /** The app's bus (buildApp); tests may omit it to get a private one. */
  events?: EventBus;
  appUrl?: string;
  realtime?: Realtime;
  log?: (event: string, data: Record<string, unknown>) => void;
}): ModuleDeps {
  const entitlements = createEntitlements(prisma);
  const staffAuth = createStaffAuth({ prisma, redis, log });
  return {
    getTenantDb: createTenantDbFactory(prisma),
    entitlements,
    staffAuth,
    resolveTenant: createTenantResolver({ auth, prisma, staffAuth }),
    resolveActor: createActorResolver({ auth, prisma, staffAuth }),
    requirePermission,
    requireOutlet,
    requireFeature: createFeatureGuard(entitlements),
    secureCookies: appUrl.startsWith("https://"),
    appUrl: appUrl.replace(/\/+$/, ""),
    storage,
    realtime,
    events: events ?? createEventBus((err) => log?.("event.listener_failed", { err: String(err) })),
  };
}
