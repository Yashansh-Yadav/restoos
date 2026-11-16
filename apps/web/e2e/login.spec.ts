import { expect, test } from "@playwright/test";
import { randomMobile, signInWithPhone } from "./helpers";

// M1-T1 acceptance: an owner signs in with a mobile OTP (console provider in dev/CI) and, being
// new, lands on onboarding. The code is read via the dev-only /api/dev/last-otp hook.

test("phone OTP sign-in creates the owner and routes to onboarding", async ({ page, request }) => {
  const local = randomMobile();

  await page.goto("/owner");
  await expect(page).toHaveURL(/\/login$/);

  await signInWithPhone(page, request, local);
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { level: 1, name: "Your Business" })).toBeVisible();
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
