// Test harness for auth integration tests: real Fastify app + Better Auth + test DB + Redis db 1.
import { createTestDb, resetTestDb } from "@restoos/db/testing";
import { loadRootEnv } from "@restoos/shared/env/node";
import type { LightMyRequestResponse } from "fastify";
import { buildApp, type App } from "../app";
import { DEV_AUTH_SECRET } from "../env";
import { createAuth } from "../lib/auth";
import { ConsoleOtpProvider } from "../lib/otp/provider";
import { createRedis } from "../lib/redis";

loadRootEnv();

export const ORIGIN = "http://localhost:3000";
const quiet = { info: () => undefined };

/** Redis logical db 1 — never the dev data in db 0. */
function testRedisUrl(): string {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6380");
  url.pathname = "/1";
  return url.toString();
}

export async function createAuthHarness(options: { rateLimit?: boolean } = {}) {
  const prisma = createTestDb("api");
  const redis = createRedis(testRedisUrl());
  await resetTestDb(prisma);
  await redis.flushdb();

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
    deps: { prisma, auth, appUrl: ORIGIN, googleEnabled: true, devOtp: otp },
  });

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
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  };

  return {
    app,
    prisma,
    redis,
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
