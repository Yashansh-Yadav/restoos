// Test harness for auth integration tests: real Fastify app + Better Auth + test DB + Redis db 1.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb, resetTestDb } from "@restoos/db/testing";
import { loadRootEnv } from "@restoos/shared/env/node";
import type { LightMyRequestResponse } from "fastify";
import { buildApp, type App } from "../app";
import { DEV_AUTH_SECRET } from "../env";
import type { PrismaClient } from "@restoos/db";
import { createAuth, type Auth } from "../lib/auth";
import { ConsoleOtpProvider } from "../lib/otp/provider";
import { createRedis, type Redis } from "../lib/redis";
import { createLocalDiskStorage, type FileStorage } from "../lib/storage";

loadRootEnv();

export const ORIGIN = "http://localhost:3000";
const quiet = { info: () => undefined };

/** Redis logical db 1 — never the dev data in db 0. */
function testRedisUrl(): string {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6380");
  url.pathname = "/1";
  return url.toString();
}

export type HarnessOptions = {
  rateLimit?: boolean;
  /** Adds test-only routes before the app starts (e.g. to exercise preHandlers). */
  setup?: (
    app: App,
    deps: { auth: Auth; prisma: PrismaClient; redis: Redis; storage: FileStorage },
  ) => void | Promise<void>;
};

export async function createAuthHarness(options: HarnessOptions = {}) {
  const prisma = createTestDb("api");
  const redis = createRedis(testRedisUrl());
  await resetTestDb(prisma);
  await redis.flushdb();
  // Uploaded files go to a throwaway folder per harness.
  const storageDir = await mkdtemp(join(tmpdir(), "restoos-files-"));
  const storage = createLocalDiskStorage(storageDir);

  const otp = new ConsoleOtpProvider(quiet);
  const auth = createAuth({
    prisma,
    redis,
    otp,
    rateLimit: options.rateLimit ?? false,
    env: {
      APP_URL: ORIGIN,
      BETTER_AUTH_SECRET: DEV_AUTH_SECRET,
      GOOGLE_CLIENT_ID: "test-google-client",
      GOOGLE_CLIENT_SECRET: "test-google-secret",
      NODE_ENV: "test",
    },
  });
  const app: App = await buildApp({
    docs: false,
    deps: { prisma, redis, storage, auth, appUrl: ORIGIN, googleEnabled: true, devOtp: otp },
  });
  await options.setup?.(app, { auth, prisma, redis, storage });

  /** Cookie jar: keeps whatever Set-Cookie the API returns, like a browser would. */
  const jar = new Map<string, string>();
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const remember = (res: LightMyRequestResponse) => {
    for (const c of res.cookies) {
      if (c.maxAge === 0 || c.value === "") jar.delete(c.name);
      else jar.set(c.name, c.value);
    }
    return res;
  };

  const request = async (
    method: "GET" | "POST",
    url: string,
    payload?: object,
    headers: Record<string, string> = {},
  ) =>
    remember(
      await app.inject({
        method,
        url,
        ...(payload ? { payload } : {}),
        headers: {
          origin: ORIGIN,
          cookie: cookieHeader(),
          "x-forwarded-for": "203.0.113.7",
          ...headers,
        },
      }),
    );

  /** Full phone-OTP sign-in; returns the verify response. */
  const signInWithPhone = async (phoneNumber: string, extra: object = {}) => {
    const sent = await request("POST", "/api/auth/phone-number/send-otp", { phoneNumber });
    if (sent.statusCode !== 200)
      throw new Error(`send-otp failed: ${sent.statusCode} ${sent.body}`);
    const code = otp.lastCode(phoneNumber);
    return request("POST", "/api/auth/phone-number/verify", { phoneNumber, code, ...extra });
  };

  const close = async () => {
    await app.close();
    await Promise.allSettled([
      prisma.$disconnect(),
      redis.quit(),
      rm(storageDir, { recursive: true, force: true }),
    ]);
  };

  return {
    app,
    prisma,
    redis,
    storage,
    storageDir,
    otp,
    jar,
    request,
    signInWithPhone,
    close,
    clearCookies: () => jar.clear(),
  };
}

/** An unsigned JWT — Better Auth only decodes Google's id_token from the server-side code exchange. */
export function fakeGoogleIdToken(claims: Record<string, unknown>): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "none", typ: "JWT" })}.${b64({
    iss: "https://accounts.google.com",
    aud: "test-google-client",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3_600,
    ...claims,
  })}.`;
}
