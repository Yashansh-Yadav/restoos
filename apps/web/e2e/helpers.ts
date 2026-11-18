import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** A random valid Indian mobile, so parallel/back-to-back runs never hit the per-number cooldown. */
export const randomMobile = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;

/** Signs in a new owner by phone OTP (console provider; code read via the dev-only hook). */
export async function signInWithPhone(page: Page, request: APIRequestContext, local: string) {
  await page.goto("/login");
  await page.getByLabel("Mobile Number").fill(local);
  await page.getByRole("button", { name: "Send Code" }).click();
  await expect(page.getByLabel("Verification Code")).toBeFocused();

  const res = await request.get(`/api/dev/last-otp?phone=${encodeURIComponent(`+91${local}`)}`);
  const { code } = (await res.json()) as { code: string | null };
  expect(code).toMatch(/^\d{6}$/);
  // Typing the 6th digit submits on its own (one tap saved).
  await page.getByLabel("Verification Code").fill(code ?? "");
}

/** New owner fills the 3-step onboarding wizard → lands on /owner. */
export async function onboard(page: Page) {
  const next = page.getByRole("button", { name: "Continue" });
  await page.getByLabel("Brand Name").fill("Saffron Table");
  await page.getByLabel("Legal Name").fill("Saffron Table Hospitality Pvt Ltd");
  await next.click();
  await page.getByLabel("Address").fill("12 Hill Road, Bandra West, Mumbai 400050");
  await page.getByLabel("State").selectOption("27");
  await next.click();
  await page.getByRole("button", { name: "Finish Setup" }).click();
  await expect(page).toHaveURL(/\/owner$/);
}
