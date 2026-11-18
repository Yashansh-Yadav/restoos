import { expect, test } from "@playwright/test";
import {
  addStaffMember,
  addTables,
  onboard,
  randomMobile,
  signedInTablet,
  signInWithPhone,
  tableTile,
} from "./helpers";

// M4-T3 acceptance (user decision 2026-11-18: staff ↔ owner until the customer menu, M5-T6):
// a change on one device shows up on another within 2 s, with no reload.

test("stock and table changes reach other screens live", async ({ page, request, browser }) => {
  await signInWithPhone(page, request, randomMobile());
  await expect(page).toHaveURL(/\/onboarding$/);
  await onboard(page);

  // Menu: the template's 3 example dishes. Floor: T1.
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

  // A cook and a butler on their own tablets; the butler looks after T1.
  const kitchenPin = await addStaffMember(page, "Imran", "Kitchen");
  const butlerPin = await addStaffMember(page, "Rahul", "Butler");
  const kitchen = await signedInTablet(page, browser, "Imran", kitchenPin);
  const butler = await signedInTablet(page, browser, "Rahul", butlerPin);
  await page.goto("/owner/floor/assign");
  await expect(async () => {
    await tableTile(page, "T1").click({ timeout: 2_000 });
    await expect(tableTile(page, "T1")).toHaveAccessibleName(/with Rahul$/, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  // Butler has the floor open; it says it's live.
  await butler.getByRole("link", { name: /^Floor/ }).click();
  await expect(butler.getByRole("status").filter({ hasText: "Live" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(tableTile(butler, "T1")).toHaveAccessibleName(/Free/);

  // Owner has the menu open on Starters.
  await page.goto("/owner/menu");
  await page.getByRole("button", { name: /^Starters/ }).click();
  const ownerRow = page.getByRole("button", { name: /^Veg Paneer Tikka/ });
  await expect(ownerRow).not.toContainText("Out of stock");
  // Give the owner's socket a moment to join before the change happens.
  await page.waitForTimeout(1_000);

  // Kitchen taps Paneer Tikka out of stock → the owner's open menu shows it within 2 s.
  await kitchen.getByRole("link", { name: /Item Stock/ }).click();
  const paneer = kitchen.getByRole("switch", { name: /^Paneer Tikka:/ });
  await expect(async () => {
    await paneer.click({ timeout: 2_000 });
    await expect(paneer).toHaveAttribute("aria-checked", "false", { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(ownerRow).toContainText("Out of stock", { timeout: 2_000 });

  // The owner seats T1 (through the API) → the butler's floor shows it within 2 s.
  const me = (await (await page.request.get("/api/me")).json()) as {
    owner: { outlets: { id: string }[] };
  };
  const outletId = me.owner.outlets[0]?.id ?? "";
  const floor = (await (
    await page.request.get("/api/owner/floor", { headers: { "x-outlet-id": outletId } })
  ).json()) as { sections: { tables: { id: string; label: string }[] }[] };
  const t1 = floor.sections[0]?.tables.find((t) => t.label === "T1");
  const seat = await page.request.post(`/api/staff/tables/${t1?.id ?? ""}/status`, {
    headers: { "x-outlet-id": outletId },
    data: { event: "seat" },
  });
  expect(seat.status()).toBe(200);
  await expect(tableTile(butler, "T1")).toHaveAccessibleName(/Seated/, { timeout: 2_000 });

  await kitchen.context().close();
  await butler.context().close();
});
