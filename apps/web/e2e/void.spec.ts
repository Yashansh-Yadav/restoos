import { expect, test } from "@playwright/test";
import {
  addStaffMember,
  addTables,
  hydrated,
  onboard,
  randomMobile,
  signedInTablet,
  signInWithPhone,
  tableTile,
} from "./helpers";

// M5-T5 acceptance: a manager voids 1 of 2 sent items with a reason → the order shows it struck
// through and the total drops; the kitchen board shows the VOID line live; butlers get no Void.

test("manager voids a sent item with a reason; the kitchen sees it live", async ({
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
  const butlerPin = await addStaffMember(page, "Rahul", "Butler");
  const managerPin = await addStaffMember(page, "Meena", "Manager");
  const kitchen = await signedInTablet(page, browser, "Imran", kitchenPin);
  const butler = await signedInTablet(page, browser, "Rahul", butlerPin);
  const manager = await signedInTablet(page, browser, "Meena", managerPin);

  // Butler sends 2 × Butter Chicken; his order sheet has no Void.
  await butler.goto("/staff/floor");
  await hydrated(butler, "h1");
  await tableTile(butler, "T1").click();
  await hydrated(butler, "h1");
  const dish = butler.getByRole("button", { name: /^Butter Chicken/ });
  await dish.click();
  await dish.click();
  await butler.getByRole("button", { name: "Send to Kitchen" }).last().click();
  await expect(butler.getByText("Sent to kitchen — KOT #1")).toBeVisible({ timeout: 15_000 });
  await butler.getByRole("button", { name: /No new items/ }).click();
  const butlerOrder = butler.getByRole("dialog", { name: "Order" });
  await expect(butlerOrder.getByText("Butter Chicken")).toBeVisible();
  await expect(butlerOrder.getByRole("button", { name: /^Void/ })).toHaveCount(0);

  // The kitchen has the ticket open.
  await kitchen.goto("/staff/kitchen");
  await hydrated(kitchen, "h1");
  const ticket = kitchen.getByRole("article", { name: /^KOT 1, table T1/ });
  await expect(ticket).toContainText("2 × Butter Chicken");

  // Manager: T1 → Order → Void → 1 → "Guest changed mind" → confirm.
  await manager.goto("/staff/floor");
  await hydrated(manager, "h1");
  await tableTile(manager, "T1").click();
  await hydrated(manager, "h1");
  const totalBefore = await manager.getByText(/^Table total/).textContent();
  await manager.getByRole("button", { name: /No new items/ }).click();
  const order = manager.getByRole("dialog", { name: "Order" });
  await order.getByRole("button", { name: "Void 2 × Butter Chicken" }).click();
  const sheet = manager.getByRole("dialog", { name: "Void 2 × Butter Chicken" });
  const confirm = sheet.getByRole("button", { name: /^Void 1 Item/ });
  await expect(confirm).toBeDisabled(); // a reason is required
  await sheet.getByRole("button", { name: "Guest changed mind" }).click();
  await confirm.click();
  await expect(manager.getByText("Voided 1 × Butter Chicken")).toBeVisible({ timeout: 15_000 });
  await expect(manager.getByText(/^Table total/)).not.toHaveText(totalBefore ?? "", {
    timeout: 5_000,
  });

  // The order lists 1 still active and 1 void, with its reason.
  await manager.getByRole("button", { name: /No new items/ }).click();
  await expect(order.getByText("Void · Guest changed mind")).toBeVisible();
  await expect(order.getByRole("button", { name: "Void 1 × Butter Chicken" })).toBeVisible();

  // The kitchen sees it live: 1 to cook, 1 struck through as VOID.
  await expect(ticket).toContainText("1 × Butter Chicken", { timeout: 5_000 });
  await expect(ticket.getByText("VOID", { exact: true })).toBeVisible();

  await kitchen.context().close();
  await butler.context().close();
  await manager.context().close();
});
