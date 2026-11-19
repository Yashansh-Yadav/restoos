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

// M5-T7 acceptance: a cashier moves T1's guests to free T2 (the kitchen ticket follows live),
// then joins T3's order to T2 (T3 is freed). Butlers don't get the Move button.

test("cashier moves guests to a free table and joins two tables", async ({
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
  await addTables(page, 3);
  const kitchenPin = await addStaffMember(page, "Imran", "Kitchen");
  const butlerPin = await addStaffMember(page, "Rahul", "Butler");
  const cashierPin = await addStaffMember(page, "Asha", "Cashier");
  const kitchen = await signedInTablet(page, browser, "Imran", kitchenPin);
  const butler = await signedInTablet(page, browser, "Rahul", butlerPin);
  const cashier = await signedInTablet(page, browser, "Asha", cashierPin);

  // Butler sends Butter Chicken on T1 and Packaged Water on T3; no Move button for butlers.
  const send = async (label: string, dish: RegExp) => {
    await butler.goto("/staff/floor");
    await hydrated(butler, "h1");
    await tableTile(butler, label).click();
    await hydrated(butler, "h1");
    await butler.getByRole("button", { name: dish }).first().click();
    await butler.getByRole("button", { name: "Send to Kitchen" }).last().click();
    await expect(butler.getByText(/Sent to kitchen — KOT #\d+/)).toBeVisible({ timeout: 15_000 });
  };
  await send("T1", /^Butter Chicken/);
  await expect(butler.getByRole("button", { name: "Move" })).toHaveCount(0);
  await send("T3", /^Packaged Water/);

  await kitchen.goto("/staff/kitchen");
  await hydrated(kitchen, "h1");
  await expect(kitchen.getByRole("article", { name: /^KOT 1, table T1/ })).toBeVisible();

  // Cashier: T1 → Move → T2 → Move to T2.
  await cashier.goto("/staff/floor");
  await hydrated(cashier, "h1");
  await tableTile(cashier, "T1").click();
  await hydrated(cashier, "h1");
  await cashier.getByRole("button", { name: "Move" }).click();
  const sheet = cashier.getByRole("dialog", { name: "Move T1" });
  await expect(sheet.getByRole("button", { name: /^T3,/ })).toHaveCount(0); // not free
  await sheet.getByRole("button", { name: /^T2, Free/ }).click();
  await sheet.getByRole("button", { name: "Move to T2" }).click();
  await expect(cashier.getByText("Moved from T1")).toBeVisible({ timeout: 15_000 });
  await expect(cashier.getByRole("heading", { level: 1 })).toHaveText("T2");
  await cashier.getByRole("button", { name: /No new items/ }).click();
  await expect(cashier.getByRole("dialog", { name: "Order" })).toContainText("Butter Chicken");
  await cashier.keyboard.press("Escape");

  // The kitchen ticket now says T2, live.
  await expect(kitchen.getByRole("article", { name: /^KOT 1, table T2/ })).toBeVisible({
    timeout: 5_000,
  });

  // Cashier: T3 → Move → Join Another Table → T2.
  await cashier.goto("/staff/floor");
  await hydrated(cashier, "h1");
  await expect(tableTile(cashier, "T1")).toHaveAccessibleName(/Free/);
  await tableTile(cashier, "T3").click();
  await hydrated(cashier, "h1");
  await cashier.getByRole("button", { name: "Move" }).click();
  const join = cashier.getByRole("dialog", { name: "Move T3" });
  await join.getByRole("tab", { name: "Join Another Table" }).click();
  await join.getByRole("button", { name: /^T2, Ordered/ }).click();
  await expect(join.getByText("Add T3's orders to T2? T3 becomes free.")).toBeVisible();
  await join.getByRole("button", { name: "Join T2" }).click();
  await expect(cashier.getByText("T3 joined T2")).toBeVisible({ timeout: 15_000 });
  await cashier.getByRole("button", { name: /No new items/ }).click();
  const order = cashier.getByRole("dialog", { name: "Order" });
  await expect(order).toContainText("Butter Chicken");
  await expect(order).toContainText("Packaged Water");

  await butler.goto("/staff/floor");
  await hydrated(butler, "h1");
  await expect(tableTile(butler, "T3")).toHaveAccessibleName(/Free/);
  await expect(kitchen.getByRole("article", { name: /^KOT 2, table T2/ })).toBeVisible({
    timeout: 5_000,
  });

  await kitchen.context().close();
  await butler.context().close();
  await cashier.context().close();
});
