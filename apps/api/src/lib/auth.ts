import { prismaAdapter } from "@better-auth/prisma-adapter";
import { redisStorage } from "@better-auth/redis-storage";
import type { PrismaClient } from "@restoos/db";
import { INDIAN_MOBILE_E164 } from "@restoos/shared";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { phoneNumber } from "better-auth/plugins";
import type { Redis } from "ioredis";
import type { ApiEnv } from "../env";
import { checkOtpThrottle } from "./otp/throttle";
import type { OtpProvider } from "./otp/provider";

// Owner authentication (M1-T1, CLAUDE.md rule 11): Google OAuth 2.0 + mobile OTP only.
// No email/password anywhere — those routes are disabled below. Staff PIN login is separate (M1-T6).

/** Phone-only owners need an email for Better Auth; `.invalid` is reserved and never deliverable. */
export const PHONE_EMAIL_DOMAIN = "phone.restoos.invalid";
export const placeholderEmail = (phone: string) =>
  `${phone.replace(/\D/g, "")}@${PHONE_EMAIL_DOMAIN}`;
export const isPlaceholderEmail = (email: string) => email.endsWith(`@${PHONE_EMAIL_DOMAIN}`);

/** Every password-based route Better Auth or its plugins expose. Owners never have passwords. */
export const DISABLED_AUTH_PATHS = [
  "/sign-up/email",
  "/sign-in/email",
  "/sign-in/phone-number",
  "/phone-number/request-password-reset",
  "/phone-number/reset-password",
  "/request-password-reset",
  "/reset-password",
  "/change-password",
  "/set-password",
  "/change-email",
  "/send-verification-email",
  "/verify-email",
];

export type AuthDeps = {
  prisma: PrismaClient;
  redis: Redis;
  env: Pick<
    ApiEnv,
    "APP_URL" | "BETTER_AUTH_SECRET" | "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "NODE_ENV"
  > &
    Partial<Pick<ApiEnv, "OTP_SENDS_PER_IP_PER_MINUTE">>;
  otp: OtpProvider;
  /** Better Auth's per-IP limits. Off in most tests so they can sign in repeatedly. */
  rateLimit?: boolean;
};

export function createAuth({ prisma, redis, env, otp, rateLimit = true }: AuthDeps) {
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            prompt: "select_account" as const,
          },
        }
      : {};

  return betterAuth({
    appName: "RestoOS",
    // The browser talks to the API through the web origin (/api is same-origin), so that's our base.
    baseURL: env.APP_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    secondaryStorage: redisStorage({ client: redis, keyPrefix: "auth:" }),
    session: {
      storeSessionInDatabase: true, // sessions stay in Postgres; Redis only holds limits/caches
      expiresIn: 60 * 60 * 24 * 30, // owners stay signed in for 30 days…
      updateAge: 60 * 60 * 24, // …refreshed at most once a day
    },
    emailAndPassword: { enabled: false },
    disabledPaths: DISABLED_AUTH_PATHS,
    socialProviders: google,
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google", "phone-number"],
        // Phone owners have a placeholder email, so their Google email never matches.
        allowDifferentEmails: true,
      },
    },
    plugins: [
      phoneNumber({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        phoneNumberValidator: (phone) => INDIAN_MOBILE_E164.test(phone),
        // Don't await: the response must not reveal how long sending takes.
        sendOTP: ({ phoneNumber: phone, code }) => {
          void otp.send(phone, code);
        },
        signUpOnVerification: {
          getTempEmail: placeholderEmail,
          getTempName: (phone) => `Owner ${phone.slice(-4)}`,
        },
      }),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/phone-number/send-otp") return;
        const body = ctx.body as { phoneNumber?: unknown } | undefined;
        const phone = typeof body?.phoneNumber === "string" ? body.phoneNumber : "";
        if (!INDIAN_MOBILE_E164.test(phone)) return; // the plugin rejects it with a clear error
        const result = await checkOtpThrottle(redis, phone);
        if (!result.allowed) {
          throw new APIError(
            "TOO_MANY_REQUESTS",
            {
              code: "OTP_THROTTLED",
              message: `Please wait ${result.retryAfterSeconds}s before requesting another code.`,
            },
            { "Retry-After": String(result.retryAfterSeconds) },
          );
        }
      }),
    },
    rateLimit: {
      enabled: rateLimit,
      storage: "secondary-storage",
      window: 60,
      max: 100,
      // Per IP. Kept moderate because Indian mobile carriers put many users behind shared
      // (CGNAT) IPs; the per-phone throttle in hooks.before is what protects the SMS bill.
      customRules: {
        "/phone-number/send-otp": { window: 60, max: env.OTP_SENDS_PER_IP_PER_MINUTE ?? 10 },
        "/phone-number/verify": { window: 60, max: 2 * (env.OTP_SENDS_PER_IP_PER_MINUTE ?? 10) },
      },
    },
    advanced: {
      // Requests arrive through our own proxy (Next rewrite in dev, Caddy in production), which
      // sets X-Forwarded-For. The API port is never exposed publicly.
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
      useSecureCookies: env.NODE_ENV === "production",
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
