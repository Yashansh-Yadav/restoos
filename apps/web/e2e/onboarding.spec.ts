import { expect, test } from "@playwright/test";
import { randomMobile, signInWithPhone } from "./helpers";

// M1-T2 acceptance: a new owner sets up the business and first outlet in 3 steps and lands on
// the owner home showing the restaurant. Back keeps what was typed.

test("new owner completes onboarding in 3 steps", async ({ page, request }) => {
  await signInWithPhone(page, request, randomMobile());
  await expect(page).toHaveURL(/\/onboarding$/);
  const next = page.getByRole("button", { name: "Continue" });

  // Step 1 — empty submit shows fixes inline and focuses the first invalid field.
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  await next.click();
  await expect(page.getByLabel("Brand Name")).toBeFocused();
  await expect(page.getByText("Brand name needs at least 2 characters")).toBeVisible();

  await page.getByLabel("Brand Name").fill("Saffron Table");
  await page.getByLabel("Legal Name").fill("Saffron Table Hospitality Pvt Ltd");
  await page.getByLabel(/Business GSTIN/).fill("27aapfu0939f1zw"); // typo in the check digit
  await next.click();
  await expect(page.getByText(/Check the GSTIN/)).toBeVisible();
  await page.getByLabel(/Business GSTIN/).fill("27aapfu0939f1zv");
  await next.click();

  // Step 2 — outlet name, GSTIN and state carry over from step 1.
  await expect(page.getByRole("heading", { level: 1, name: "Your Outlet" })).toBeFocused();
  await expect(page.getByLabel("Outlet Name")).toHaveValue("Saffron Table");
  await expect(page.getByLabel(/Outlet GSTIN/)).toHaveValue("27AAPFU0939F1ZV");
  await expect(page.getByLabel("State")).toHaveValue("27");
  await page.getByLabel("Outlet Name").fill("Saffron Table — Bandra");
  await page.getByLabel("Address").fill("12 Hill Road, Bandra West, Mumbai 400050");

  // Back keeps values; forward again keeps step 2's edits.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByLabel("Brand Name")).toHaveValue("Saffron Table");
  await next.click();
  await expect(page.getByLabel("Outlet Name")).toHaveValue("Saffron Table — Bandra");
  await next.click();

  // Step 3 — invoice code suggested from the brand, with a live bill-number preview.
  await expect(page.getByText("Step 3 of 3")).toBeVisible();
  await expect(page.getByLabel("Invoice Code")).toHaveValue("ST");
  await expect(page.getByText(/^ST-\d{4}-D1000001$/)).toBeVisible();
  await page.getByText("Yes, Prices Include GST").click();
  await page.getByRole("button", { name: "Finish Setup" }).click();

  await expect(page).toHaveURL(/\/owner$/);
  await expect(page.getByRole("heading", { level: 1, name: "Saffron Table" })).toBeVisible();
  await expect(page.getByText("Saffron Table — Bandra")).toBeVisible();

  // Onboarding is one-time: the wizard now sends you to the owner home.
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/owner$/);
});
