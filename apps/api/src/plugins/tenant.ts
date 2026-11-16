import type { PrismaClient } from "@restoos/db";
import type { FeatureKey, Permission } from "@restoos/shared";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import type { Auth } from "../lib/auth";
import type { Entitlements } from "../lib/entitlements";
import { can } from "../lib/permissions";
import type { TenantContext } from "../lib/tenant";

// Request authorisation (M1-T4). Every tenant route chains these preHandlers:
//   preHandler: [resolveTenant, requirePermission("staff.manage"), requireFeature("BELL_SYSTEM")]
// resolveTenant turns the session into request.tenant (a TenantContext for getTenantDb);
// the others reject with the shared error shape. Staff (device + PIN) sessions join in M1-T6.

declare module "fastify" {
  interface FastifyRequest {
    /** Set by resolveTenant; read it via tenantOf(request). */
    tenant?: TenantContext;
  }
}

/** Header an owner uses to pick the outlet they're working in (verified against their org). */
export const OUTLET_HEADER = "x-outlet-id";

const deny = (reply: FastifyReply, status: number, code: string, message: string) =>
  reply.code(status).send({ error: { code, message } });

/** The resolved tenant; throws if a route forgot resolveTenant (a bug, so a 500). */
export function tenantOf(request: FastifyRequest): TenantContext {
  if (!request.tenant) throw new Error("resolveTenant must run before this handler");
  return request.tenant;
}

export function createTenantResolver({
  auth,
  prisma,
}: {
  auth: Auth;
  prisma: PrismaClient;
}): preHandlerAsyncHookHandler {
  return async function resolveTenant(request, reply) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return deny(reply, 401, "UNAUTHENTICATED", "Sign in to continue");

    const owner = await prisma.ownerAccount.findUnique({
      where: { authUserId: session.user.id },
      select: { organizationId: true, role: true },
    });
    if (!owner) {
      return deny(reply, 403, "ONBOARDING_REQUIRED", "Set up your restaurant first");
    }

    const ctx: TenantContext = {
      organizationId: owner.organizationId,
      actor: { kind: "owner", userId: session.user.id, role: owner.role },
    };
    const outletId = request.headers[OUTLET_HEADER];
    if (typeof outletId === "string" && outletId !== "") {
      const outlet = await prisma.outlet.count({
        where: { id: outletId, organizationId: owner.organizationId },
      });
      if (outlet === 0) {
        return deny(reply, 403, "OUTLET_FORBIDDEN", "That outlet isn't part of your restaurant");
      }
      ctx.outletId = outletId;
    }
    request.tenant = ctx;
  };
}

/** For outlet-level routes: the owner must have picked an outlet (x-outlet-id). */
export const requireOutlet: preHandlerAsyncHookHandler = async function requireOutlet(
  request,
  reply,
) {
  if (!tenantOf(request).outletId) {
    return deny(reply, 400, "OUTLET_REQUIRED", `Choose an outlet (${OUTLET_HEADER} header)`);
  }
};

/** The outlet of an outlet-level route (after requireOutlet). */
export function outletOf(request: FastifyRequest): string {
  const { outletId } = tenantOf(request);
  if (!outletId) throw new Error("requireOutlet must run before this handler");
  return outletId;
}

export function requirePermission(permission: Permission): preHandlerAsyncHookHandler {
  return async function checkPermission(request, reply) {
    if (!can(tenantOf(request).actor, permission)) {
      return deny(reply, 403, "FORBIDDEN", "You don't have permission to do this");
    }
  };
}

/**
 * Plan check for an outlet feature. Needs an outlet in context. Never put this on billing, KOT
 * or printing routes (rule 5) — those features are always on anyway.
 */
export function createFeatureGuard(entitlements: Entitlements) {
  return function requireFeature(feature: FeatureKey): preHandlerAsyncHookHandler {
    return async function checkFeature(request, reply) {
      const { outletId } = tenantOf(request);
      if (!outletId) {
        return deny(reply, 400, "OUTLET_REQUIRED", `Choose an outlet (${OUTLET_HEADER} header)`);
      }
      if (!(await entitlements.hasFeature(outletId, feature))) {
        return deny(
          reply,
          403,
          "FEATURE_NOT_IN_PLAN",
          "This feature isn't included in your plan. Upgrade to use it.",
        );
      }
    };
  };
}
