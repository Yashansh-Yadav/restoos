import { expect, test, type Page } from "@playwright/test";
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

// M5-T3 acceptance: a butler's send appears on the kitchen display live; the kitchen taps it
// through New → Preparing → Ready, and can undo a mis-tap.

test("kitchen display: live tickets, tap to advance, undo", async ({ page, request, browser }) => {
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
  const kitchen = await signedInTablet(page, browser, "Imran", kitchenPin);
  const butler = await signedInTablet(page, browser, "Rahul", butlerPin);
  const phone = (kitchen.viewportSize()?.width ?? 1280) < 768;
  const column = async (p: Page, name: "New" | "Preparing" | "Ready") => {
    if (phone) await p.getByRole("tab", { name: new RegExp(`^${name}`) }).click();
  };

  // Kitchen opens its display: empty, live.
  await kitchen.getByRole("link", { name: /Kitchen Display/ }).click();
  await expect(kitchen.getByRole("heading", { name: "Kitchen" })).toBeVisible();
  await expect(kitchen.getByRole("status").filter({ hasText: "Live" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(kitchen.getByText("No new tickets.")).toBeVisible();

  // Butler sends 2 × Butter Chicken for T1.
  await butler.goto("/staff/floor");
  await hydrated(butler, "h1");
  await tableTile(butler, "T1").click();
  await hydrated(butler, "h1");
  const dish = butler.getByRole("button", { name: /^Butter Chicken/ });
  await dish.click();
  await dish.click();
  await butler.getByRole("button", { name: "Send to Kitchen" }).last().click();
  await expect(butler.getByText("Sent to kitchen — KOT #1")).toBeVisible({ timeout: 15_000 });

  // It appears on the kitchen display without a reload.
  const ticket = kitchen.getByRole("article", { name: /^KOT 1, table T1/ });
  await expect(ticket).toBeVisible({ timeout: 5_000 });
  await expect(ticket).toContainText("2 ×");
  await expect(ticket).toContainText("Butter Chicken");

  // Start cooking → Preparing; Undo → back to New.
  await ticket.getByRole("button", { name: "Start Cooking" }).click();
  await kitchen.getByRole("button", { name: "Undo" }).click();
  await column(kitchen, "New");
  await expect(ticket.getByRole("button", { name: "Start Cooking" })).toBeVisible();

  // Start → Mark Ready → waiting for the butler.
  await ticket.getByRole("button", { name: "Start Cooking" }).click();
  await column(kitchen, "Preparing");
  await ticket.getByRole("button", { name: "Mark Ready" }).click();
  await column(kitchen, "Ready");
  await expect(ticket).toContainText("Waiting for the butler");
  await kitchen.reload();
  await column(kitchen, "Ready");
  await expect(kitchen.getByRole("article", { name: /^KOT 1, table T1/ })).toContainText(
    "Waiting for the butler",
  );

  await kitchen.context().close();
  await butler.context().close();
});
