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

// M5-T4 acceptance: the kitchen marks a ticket ready → the butler sees it live on the floor and
// in Ready to Serve → one tap "Served" takes it off the kitchen board.

test("butler serves food the kitchen marked ready", async ({ page, request, browser }) => {
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

  // Rahul looks after T1 and sends 1 × Butter Chicken.
  await page.goto("/owner/floor/assign");
  await expect(async () => {
    await tableTile(page, "T1").click({ timeout: 2_000 });
    await expect(tableTile(page, "T1")).toHaveAccessibleName(/with Rahul$/, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await butler.goto("/staff/floor");
  await hydrated(butler, "h1");
  await tableTile(butler, "T1").click();
  await hydrated(butler, "h1");
  await butler.getByRole("button", { name: /^Butter Chicken/ }).click();
  await butler.getByRole("button", { name: "Send to Kitchen" }).last().click();
  await expect(butler.getByText("Sent to kitchen — KOT #1")).toBeVisible({ timeout: 15_000 });

  // Butler goes back to the floor and waits there.
  await butler.getByRole("link", { name: "Floor" }).click();
  await expect(butler.getByRole("link", { name: /Ready to Serve \(0\)/ })).toBeVisible();

  // Kitchen: Start Cooking → Mark Ready.
  await kitchen.goto("/staff/kitchen");
  await hydrated(kitchen, "h1");
  const ticket = kitchen.getByRole("article", { name: /^KOT 1, table T1/ });
  await ticket.getByRole("button", { name: "Start Cooking" }).click();
  if (phone) await kitchen.getByRole("tab", { name: /^Preparing/ }).click();
  await ticket.getByRole("button", { name: "Mark Ready" }).click();
  if (phone) await kitchen.getByRole("tab", { name: /^Ready/ }).click();
  await expect(ticket).toContainText("Waiting for the butler");

  // The butler's floor shows it live: badge on T1 and the Ready to Serve count.
  await expect(butler.getByRole("link", { name: /Ready to Serve \(1\)/ })).toBeVisible({
    timeout: 5_000,
  });
  await expect(tableTile(butler, "T1")).toHaveAccessibleName(/food ready to serve/);

  // Ready to Serve → Served.
  await butler.getByRole("link", { name: /Ready to Serve \(1\)/ }).click();
  const card = butler.getByRole("article", { name: "Table T1, KOT 1" });
  await expect(card).toContainText("Butter Chicken");
  await card.getByRole("button", { name: "Served" }).click();
  await expect(butler.getByText(/Nothing waiting/)).toBeVisible();
  await expect(butler.getByRole("status").filter({ hasText: "KOT #1 served" })).toBeVisible();

  // Gone from the kitchen board, live.
  await expect(kitchen.getByRole("article", { name: /^KOT 1, table T1/ })).toHaveCount(0, {
    timeout: 5_000,
  });

  await kitchen.context().close();
  await butler.context().close();
});
