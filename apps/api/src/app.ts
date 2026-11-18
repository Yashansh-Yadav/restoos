import fastifyCookie from "@fastify/cookie";
import type { PrismaClient } from "@restoos/db";
import Fastify, { type FastifyServerOptions } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Auth } from "./lib/auth";
import { createEventBus, type EventBus } from "./lib/events";
import { createIdentityService } from "./lib/identity";
import { createPublicMenu } from "./lib/public-menu";
import { createOnboardingService } from "./lib/onboarding";
import { REQUEST_ID_HEADER, requestIdOptions } from "./lib/logger";
import type { ConsoleOtpProvider } from "./lib/otp/provider";
import type { Redis } from "./lib/redis";
import type { FileStorage } from "./lib/storage";
import { devRoutes } from "./modules/dev/routes";
import { fileRoutes } from "./modules/files/routes";
import { assignmentRoutes } from "./modules/assignments/routes";
import { floorRoutes } from "./modules/floor/routes";
import { healthRoutes } from "./modules/health/routes";
import { deviceAuthRoutes } from "./modules/device-auth/routes";
import { deviceRoutes } from "./modules/devices/routes";
import { menuRoutes } from "./modules/menu/routes";
import { meRoutes } from "./modules/me/routes";
import { buildModuleDeps } from "./module-deps";
import { onboardingRoutes } from "./modules/onboarding/routes";
import { outletSettingsRoutes } from "./modules/outlet-settings/routes";
import { publicRoutes } from "./modules/public/routes";
import { staffRoutes } from "./modules/staff/routes";
import { registerAuthHandler } from "./plugins/auth";
import { registerDocs } from "./plugins/docs";
import { registerErrorHandling, type ServerErrorHook } from "./plugins/errors";

/** Runtime dependencies. Omitted in DB-free unit tests, so auth routes aren't registered there. */
export type AppDeps = {
  prisma: PrismaClient;
  redis: Redis;
  /** File storage (local disk in dev/tests, S3 in production). */
  storage: FileStorage;
  auth: Auth;
  /** Public web origin (APP_URL) — Better Auth runs on it via the same-origin /api proxy. */
  appUrl: string;
  googleEnabled: boolean;
  /** Set only in development/test with the console OTP provider: enables GET /api/dev/last-otp. */
  devOtp?: ConsoleOtpProvider;
};

export type BuildAppOptions = {
  logger?: FastifyServerOptions["logger"];
  /** Serve OpenAPI docs at /api/docs. Defaults to on outside production. */
  docs?: boolean;
  /** Called for every 5xx — server.ts wires it to Sentry (reportError). */
  onServerError?: ServerErrorHook;
  deps?: AppDeps;
};

declare module "fastify" {
  interface FastifyInstance {
    /** publishEvent()/subscribe for this app — M4 attaches Socket.io here. */
    events: EventBus;
  }
}

/** Builds the API without listening — shared by server.ts, worker.ts and tests (app.inject). */
export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? false,
    ...requestIdOptions(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandling(app, { onServerError: options.onServerError });

  // Echo the request id so users/support can quote it and it can be found in logs and Sentry.
  app.addHook("onRequest", async (req, reply) => {
    void reply.header(REQUEST_ID_HEADER, req.id);
  });

  // One event bus per app: routes publish after writes; listeners (M2-T5 cache, M4 sockets) subscribe.
  const events = createEventBus((err) => app.log.error({ err }, "event listener failed"));
  app.decorate("events", events);

  // Device + staff session cookies (M1-T6). Better Auth parses its own.
  await app.register(fastifyCookie);

  if (options.docs ?? process.env.NODE_ENV !== "production") {
    await registerDocs(app);
  }

  const deps = options.deps;
  if (deps) registerAuthHandler(app, deps.auth, deps.appUrl);

  // Every route lives under /api (plan §7). Add one register() per module.
  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      if (deps) {
        // The raw client stays here and in lib/: modules get bound services or getTenantDb(ctx)
        // (rule 3, enforced by lint on src/modules/**).
        const identity = createIdentityService(deps.prisma);
        const onboarding = createOnboardingService(deps.prisma);
        await api.register(meRoutes({ ...deps, identity }));
        await api.register(onboardingRoutes({ auth: deps.auth, onboarding }));

        // Tenant feature modules (rule 3: getTenantDb + resolveTenant/requirePermission).
        const moduleDeps = buildModuleDeps({
          ...deps,
          events,
          log: (event, data) => app.log.warn({ event, ...data }, event),
        });
        await api.register(staffRoutes(moduleDeps));
        await api.register(deviceRoutes(moduleDeps));
        await api.register(deviceAuthRoutes(moduleDeps));
        await api.register(outletSettingsRoutes(moduleDeps));
        await api.register(menuRoutes(moduleDeps));
        await api.register(floorRoutes(moduleDeps));
        await api.register(assignmentRoutes(moduleDeps));

        // Customer menu (M2-T5): cached per outlet, busted by any menu/stock/settings change.
        const publicMenu = createPublicMenu({
          prisma: deps.prisma,
          redis: deps.redis,
          log: (event, data) => app.log.warn({ event, ...data }, event),
        });
        events.subscribe((_ctx, e) => {
          if (
            e.name === "menu.changed" ||
            e.name === "menu.stockChanged" ||
            e.name === "outlet.settingsChanged"
          ) {
            return publicMenu.bust(e.payload.outletId);
          }
        });
        await api.register(publicRoutes({ publicMenu }));
        if (deps.storage.servesFiles) await api.register(fileRoutes(deps.storage));
        if (deps.devOtp && process.env.NODE_ENV !== "production") {
          await api.register(devRoutes(deps.devOtp));
        }
      }
    },
    { prefix: "/api" },
  );

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
