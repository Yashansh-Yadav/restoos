import { expect, test } from "@playwright/test";
import {
  addStaffMember,
  addTables,
  onboard,
  randomMobile,
  signedInTablet,
  signInWithPhone,
  tableToken,
} from "./helpers";

// M5-T6a acceptance: a guest scans T1's QR and gets the live menu — Veg Only, search, the Hindi
// toggle (remembered), and a kitchen stock change showing up within 2 s with no reload (the
// customer half of M4-T3's acceptance). An unknown QR code gets a friendly screen.

test("guest menu: veg filter, search, Hindi toggle and live stock", async ({
  page,
  request,
  browser,
}) => {
  await signInWithPhone(page, request, randomMobile());
  await expect(page).toHaveURL(/\/onboarding$/);
  await onboard(page);

  await page.goto("/owner/menu");
  await page.getByRole("button", { name: "Excel" }).click();
  const [template] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: /Download Template/ }).click(),
  ]);
  await page.locator('input[type="file"]').setInputFiles(await template.path());
  await page
    .getByRole("dialog", { name: "Check Your Sheet" })
    .getByRole("button", { name: "Import 3 Items" })
    .click({ timeout: 30_000 });
  await expect(page.getByRole("dialog", { name: "Menu Imported" })).toBeVisible({
    timeout: 30_000,
  });
  await addTables(page, 1);
  const kitchenPin = await addStaffMember(page, "Imran", "Kitchen");
  const kitchen = await signedInTablet(page, browser, "Imran", kitchenPin);
  const token = await tableToken(page, "T1");

  // The guest: a fresh phone, English browser, no login.
  const guestContext = await browser.newContext({
    ...(page.viewportSize() ? { viewport: page.viewportSize() } : {}),
    locale: "en-IN",
  });
  const guest = await guestContext.newPage();
  await guest.goto(`/t/${token}`);
  await expect(guest.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(guest.getByText("Table T1")).toBeVisible();
  const dish = (name: string) => guest.getByRole("listitem").filter({ hasText: name });
  await expect(dish("Butter Chicken")).toBeVisible();
  await expect(dish("Paneer Tikka")).toContainText("from ₹140");
  await expect(guest.getByRole("navigation", { name: "Menu sections" })).toContainText("Drinks");

  // Veg Only hides Butter Chicken; off again brings it back.
  const veg = guest.getByRole("switch", { name: /Veg Only/ });
  await veg.click();
  await expect(veg).toHaveAttribute("aria-checked", "true");
  await expect(dish("Butter Chicken")).toHaveCount(0);
  await expect(dish("Paneer Tikka")).toBeVisible();
  await veg.click();
  await expect(dish("Butter Chicken")).toBeVisible();

  // Search.
  const search = guest.getByRole("searchbox", { name: "Search dishes" });
  await search.fill("paneer");
  await expect(dish("Paneer Tikka")).toBeVisible();
  await expect(dish("Butter Chicken")).toHaveCount(0);
  await search.fill("pizza");
  await expect(guest.getByText("No dishes match “pizza”")).toBeVisible();
  await guest.getByRole("button", { name: "Clear" }).last().click();
  await expect(dish("Butter Chicken")).toBeVisible();

  // Live: the kitchen marks Butter Chicken out of stock → the guest sees it within 2 s.
  await guest.waitForTimeout(1_000); // let the guest's socket join first
  await kitchen.getByRole("link", { name: /Item Stock/ }).click();
  const stock = kitchen.getByRole("switch", { name: /^Butter Chicken:/ });
  await expect(async () => {
    await stock.click({ timeout: 2_000 });
    await expect(stock).toHaveAttribute("aria-checked", "false", { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(dish("Butter Chicken")).toContainText("Out of stock", { timeout: 2_000 });
  // …and back in stock.
  await stock.click();
  await expect(stock).toHaveAttribute("aria-checked", "true");
  await expect(dish("Butter Chicken")).not.toContainText("Out of stock", { timeout: 2_000 });

  // Hindi: names and UI switch, the English name stays under it; remembered after a reload.
  await guest.getByRole("button", { name: "हिन्दी" }).click();
  await expect(guest.getByText("टेबल T1")).toBeVisible();
  await expect(dish("बटर चिकन")).toContainText("Butter Chicken");
  await expect(guest.getByRole("navigation", { name: "मेन्यू के भाग" })).toContainText(
    "मुख्य व्यंजन",
  );
  await expect(guest.locator("[lang=hi]").first()).toBeVisible();
  await guest.reload();
  await expect(guest.getByRole("searchbox", { name: "व्यंजन खोजें" })).toBeVisible();
  await guest.getByRole("button", { name: "English" }).click();
  await expect(guest.getByText("Table T1")).toBeVisible();

  // A QR code that doesn't exist (or was replaced).
  await guest.goto("/t/AAAAAAAAAAAAAAAAAAAAAA");
  await expect(guest.getByRole("heading", { name: "This QR code isn't active" })).toBeVisible();

  await guestContext.close();
  await kitchen.context().close();
});

test("a Hindi phone opens the menu in Hindi", async ({ browser, page, request }) => {
  await signInWithPhone(page, request, randomMobile());
  await onboard(page);
  await addTables(page, 1);
  const token = await tableToken(page, "T1");
  const ctx = await browser.newContext({ locale: "hi-IN" });
  const guest = await ctx.newPage();
  await guest.goto(`/t/${token}`);
  await expect(guest.getByText("टेबल T1")).toBeVisible();
  await expect(guest.getByRole("searchbox", { name: "व्यंजन खोजें" })).toBeVisible();
  await ctx.close();
});
