import { expect, test } from "@playwright/test";

// M1-T1 acceptance: an owner signs in with a mobile OTP (console provider in dev/CI) and, being
// new, lands on onboarding. The code is read via the dev-only /api/dev/last-otp hook.

/** A random valid Indian mobile, so parallel/back-to-back runs never hit the per-number cooldown. */
const randomMobile = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
test("phone OTP sign-in creates the owner and routes to onboarding", async ({ page, request }) => {
  const local = randomMobile();

  await page.goto("/owner");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Mobile Number").fill(local);
  await page.getByRole("button", { name: "Send Code" }).click();
  await expect(page.getByLabel("Verification Code")).toBeFocused();

  const res = await request.get(`/api/dev/last-otp?phone=${encodeURIComponent(`+91${local}`)}`);
  const { code } = (await res.json()) as { code: string | null };
  expect(code).toMatch(/^\d{6}$/);

  // Typing the 6th digit submits on its own (one tap saved).
  await page.getByLabel("Verification Code").fill(code ?? "");
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Set Up Your Restaurant" }),
  ).toBeVisible();
  await expect(page.getByText(`+91 ${local.slice(0, 5)} ${local.slice(5)}`)).toBeVisible();

  // Signed in: the login page sends you onwards; signing out brings it back.
  await page.goto("/login");
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("button", { name: "Sign Out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("a wrong code shows a fix and keeps you on the code step", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Mobile Number").fill(randomMobile());
  await page.getByRole("button", { name: "Send Code" }).click();
  await page.getByLabel("Verification Code").fill("000000");
  // Scope to the form: Next.js also renders a (hidden) route announcer with role="alert".
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Check the SMS and try again",
  );
  await expect(page.getByLabel("Verification Code")).toHaveValue("");
});
