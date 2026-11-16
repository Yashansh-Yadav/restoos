// M1-T1 acceptance (API side): phone OTP + Google sign-in, linking, limits, no passwords.
import { meResponseSchema } from "@restoos/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthHarness, fakeGoogleIdToken, ORIGIN } from "../../test/auth-harness";

type Harness = Awaited<ReturnType<typeof createAuthHarness>>;
let h: Harness;

const PHONE = "+919876543210";

afterEach(async () => {
  vi.unstubAllGlobals();
  await h.close();
});

const me = async () => {
  const res = await h.request("GET", "/api/me");
  return {
    status: res.statusCode,
    body: res.statusCode === 200 ? meResponseSchema.parse(res.json()) : res.json<unknown>(),
  };
};

/** Stubs Google's token endpoint; everything else uses the real fetch. */
function mockGoogle(claims: Record<string, unknown>) {
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return Promise.resolve(
        Response.json({
          access_token: "google-access-token",
          id_token: fakeGoogleIdToken(claims),
          expires_in: 3_600,
          token_type: "Bearer",
          scope: "openid email profile",
        }),
      );
    }
    return realFetch(input, init);
  });
}

/** Runs the Google redirect dance: start (sign-in or link) → Google → our callback. */
async function completeGoogle(start: { url: string; payload: object }) {
  const begin = await h.request("POST", start.url, start.payload);
  expect(begin.statusCode, begin.body).toBe(200);
  const { url } = begin.json<{ url: string }>();
  const google = new URL(url);
  expect(google.hostname).toBe("accounts.google.com");
  expect(google.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/callback/google`);
  const state = google.searchParams.get("state") ?? "";
  const callback = await h.request(
    "GET",
    `/api/auth/callback/google?code=fake-code&state=${state}`,
  );
  expect([302, 303], callback.body).toContain(callback.statusCode);
  return callback;
}

describe("phone OTP sign-in", () => {
  beforeEach(async () => {
    h = await createAuthHarness();
  });

  it("creates the owner on first login and routes them to onboarding", async () => {
    const res = await h.signInWithPhone(PHONE);
    expect(res.statusCode, res.body).toBe(200);
    expect(h.jar.size).toBeGreaterThan(0); // session cookie set

    const { status, body } = await me();
    expect(status).toBe(200);
    expect(body).toMatchObject({
      user: { phoneNumber: PHONE, email: null, linked: { phone: true, google: false } },
      owner: null,
      needsOnboarding: true,
    });
    const user = await h.prisma.user.findFirstOrThrow();
    expect(user.email).toBe("919876543210@phone.restoos.invalid");
    expect(await h.prisma.account.count({ where: { password: { not: null } } })).toBe(0);
  });

  it("signs the same owner back in instead of creating a second account", async () => {
    await h.signInWithPhone(PHONE);
    const first = (await me()).body as { user: { id: string } };
    h.clearCookies();
    await h.redis.flushdb(); // skip the 30 s resend cooldown
    await h.signInWithPhone(PHONE);
    const second = (await me()).body as { user: { id: string } };
    expect(second.user.id).toBe(first.user.id);
    expect(await h.prisma.user.count()).toBe(1);
  });

  it("blocks the code after 3 wrong attempts", async () => {
    await h.request("POST", "/api/auth/phone-number/send-otp", { phoneNumber: PHONE });
    const code = h.otp.lastCode(PHONE) ?? "";
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 3; i++) {
      const res = await h.request("POST", "/api/auth/phone-number/verify", {
        phoneNumber: PHONE,
        code: wrong,
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    }
    const right = await h.request("POST", "/api/auth/phone-number/verify", {
      phoneNumber: PHONE,
      code,
    });
    expect(right.statusCode).toBeGreaterThanOrEqual(400);
    expect((await me()).status).toBe(401);
  });

  it("rejects a code after it expires (5 minutes)", async () => {
    await h.request("POST", "/api/auth/phone-number/send-otp", { phoneNumber: PHONE });
    const code = h.otp.lastCode(PHONE);
    // OTPs live in Redis (secondary storage) with an expiry timestamp; jump the clock past it.
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 301_000 });
    try {
      const res = await h.request("POST", "/api/auth/phone-number/verify", {
        phoneNumber: PHONE,
        code,
      });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    } finally {
      vi.useRealTimers();
    }
    expect((await me()).status).toBe(401);
  });

  it("throttles OTP sends per phone number (30 s cooldown)", async () => {
    const first = await h.request("POST", "/api/auth/phone-number/send-otp", {
      phoneNumber: PHONE,
    });
    expect(first.statusCode).toBe(200);
    const again = await h.request("POST", "/api/auth/phone-number/send-otp", {
      phoneNumber: PHONE,
    });
    expect(again.statusCode).toBe(429);
    expect(again.json()).toMatchObject({ code: "OTP_THROTTLED" });
    expect(Number(again.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("accepts Indian mobile numbers only", async () => {
    for (const phoneNumber of ["+14155552671", "+915876543210", "9876543210"]) {
      const res = await h.request("POST", "/api/auth/phone-number/send-otp", { phoneNumber });
      expect(res.statusCode, phoneNumber).toBe(400);
    }
  });

  it("requires a session for /api/me", async () => {
    const { status, body } = await me();
    expect(status).toBe(401);
    expect(body).toEqual({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue" } });
  });
});

describe("no email/password anywhere (rule 11)", () => {
  beforeEach(async () => {
    h = await createAuthHarness();
  });

  it.each([
    ["/api/auth/sign-up/email", { email: "a@b.co", password: "Password123!", name: "A" }],
    ["/api/auth/sign-in/email", { email: "a@b.co", password: "Password123!" }],
    ["/api/auth/sign-in/phone-number", { phoneNumber: PHONE, password: "Password123!" }],
    ["/api/auth/phone-number/request-password-reset", { phoneNumber: PHONE }],
  ])("%s is not available", async (url, payload) => {
    const res = await h.request("POST", url, payload);
    expect(res.statusCode).toBe(404);
    expect(await h.prisma.user.count()).toBe(0);
  });
});

describe("Google sign-in (Google's token endpoint mocked)", () => {
  beforeEach(async () => {
    h = await createAuthHarness();
  });

  it("creates the owner from the Google profile and starts a session", async () => {
    mockGoogle({
      sub: "google-123",
      email: "asha@gmail.com",
      email_verified: true,
      name: "Asha Rao",
    });
    await completeGoogle({
      url: "/api/auth/sign-in/social",
      payload: { provider: "google", callbackURL: `${ORIGIN}/owner` },
    });
    const { status, body } = await me();
    expect(status).toBe(200);
    expect(body).toMatchObject({
      user: {
        name: "Asha Rao",
        email: "asha@gmail.com",
        phoneNumber: null,
        linked: { google: true, phone: false },
      },
      needsOnboarding: true,
    });
  });

  it("lets a Google owner add their phone (one user, both methods)", async () => {
    mockGoogle({ sub: "google-456", email: "ravi@gmail.com", email_verified: true, name: "Ravi" });
    await completeGoogle({
      url: "/api/auth/sign-in/social",
      payload: { provider: "google", callbackURL: `${ORIGIN}/owner` },
    });
    const res = await h.signInWithPhone(PHONE, { updatePhoneNumber: true });
    expect(res.statusCode, res.body).toBe(200);

    const { body } = await me();
    expect(body).toMatchObject({
      user: { email: "ravi@gmail.com", phoneNumber: PHONE, linked: { google: true, phone: true } },
    });
    expect(await h.prisma.user.count()).toBe(1);
  });

  it("lets a phone owner link Google (one user, both methods)", async () => {
    await h.signInWithPhone(PHONE);
    const before = (await me()).body as { user: { id: string } };

    mockGoogle({
      sub: "google-789",
      email: "meera@gmail.com",
      email_verified: true,
      name: "Meera",
    });
    await completeGoogle({
      url: "/api/auth/link-social",
      payload: { provider: "google", callbackURL: `${ORIGIN}/owner` },
    });

    const after = (await me()).body as {
      user: { id: string; linked: { google: boolean; phone: boolean } };
    };
    expect(after.user.id).toBe(before.user.id);
    expect(after.user.linked).toEqual({ google: true, phone: true });
    expect(await h.prisma.user.count()).toBe(1);
  });
});

describe("rate limits", () => {
  it("limits OTP requests per IP (10 per minute)", async () => {
    h = await createAuthHarness({ rateLimit: true });
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) {
      const phoneNumber = `+9198000000${String(i).padStart(2, "0")}`;
      codes.push(
        (await h.request("POST", "/api/auth/phone-number/send-otp", { phoneNumber })).statusCode,
      );
    }
    expect(codes).toEqual([...Array<number>(10).fill(200), 429]);
  });
});

describe("auth config + dev hook", () => {
  beforeEach(async () => {
    h = await createAuthHarness();
  });

  it("tells the login page which methods are available", async () => {
    const res = await h.request("GET", "/api/auth-config");
    expect(res.json()).toEqual({ google: true, phone: true });
  });

  it("exposes the last console OTP outside production (E2E only)", async () => {
    await h.request("POST", "/api/auth/phone-number/send-otp", { phoneNumber: PHONE });
    const res = await h.request("GET", `/api/dev/last-otp?phone=${encodeURIComponent(PHONE)}`);
    expect(res.json()).toEqual({ code: h.otp.lastCode(PHONE) });
  });
});
