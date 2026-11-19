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

// M5-T1 acceptance: an order of 3 simple items for a table = table tap + 3 item taps + Send,
// counted with a click counter that survives page navigations.

test("butler takes an order in 5 taps", async ({ page, request, browser }) => {
  await signInWithPhone(page, request, randomMobile());
  await expect(page).toHaveURL(/\/onboarding$/);
  await onboard(page);

  // Menu: the template's examples (Butter Chicken ₹320 @5%, Packaged Water ₹40 @18%,
  // Paneer Tikka Half ₹140 / Full ₹220 @5%). Floor: T1, T2. A butler on a tablet.
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
  await addTables(page, 2);
  const pin = await addStaffMember(page, "Rahul", "Butler");
  const tablet = await signedInTablet(page, browser, "Rahul", pin);

  // Count every real tap from here on (kept in sessionStorage across pages).
  await tablet.addInitScript(() => {
    addEventListener(
      "click",
      (e) => {
        if (e.isTrusted) {
          sessionStorage.setItem("taps", String(Number(sessionStorage.getItem("taps") ?? 0) + 1));
        }
      },
      true,
    );
  });
  await tablet.goto("/staff/floor");
  await hydrated(tablet, "h1");
  await tablet.evaluate(() => sessionStorage.setItem("taps", "0"));

  // 1 tap: the table.
  await tableTile(tablet, "T1").click();
  await expect(tablet.getByRole("heading", { name: "T1" })).toBeVisible();
  await hydrated(tablet, "h1");

  // 3 taps: the dishes (Popular shows them).
  const dish = (name: string) => tablet.getByRole("button", { name: new RegExp(`^${name}`) });
  await dish("Butter Chicken").click();
  await dish("Packaged Water").click();
  await dish("Butter Chicken").click();
  await expect(dish("Butter Chicken")).toHaveAccessibleName(/2 in order$/);
  // 2 × ₹320 + ₹40 = ₹680, GST ₹32 + ₹7.20 → ₹719.20 → ₹719.
  await expect(tablet.getByText(/3 new · ₹719/)).toBeVisible();

  // 1 tap: Send.
  await tablet.getByRole("button", { name: "Send to Kitchen" }).last().click();
  await expect(tablet.getByText("Sent to kitchen — KOT #1")).toBeVisible({ timeout: 15_000 });
  expect(await tablet.evaluate(() => Number(sessionStorage.getItem("taps")))).toBe(5);

  // The table is now Ordered, and the sent items are listed.
  await expect(tablet.getByRole("banner").getByText("Ordered", { exact: true })).toBeVisible();
  await tablet.reload();
  await hydrated(tablet, "h1");
  await tablet.getByRole("button", { name: /No new items/ }).click();
  const order = tablet.getByRole("dialog", { name: "Order" });
  await expect(order.getByRole("heading", { name: "Already sent" })).toBeVisible();
  await expect(order.getByText("Butter Chicken")).toBeVisible();
  await expect(order.getByText("Packaged Water (1 L)")).toBeVisible();
  await expect(order.getByText("Sent", { exact: true }).first()).toBeVisible();
  await tablet.keyboard.press("Escape");

  // A dish with sizes opens its options; a stepper changes the count.
  await dish("Paneer Tikka").click();
  const options = tablet.getByRole("dialog", { name: "Paneer Tikka" });
  await options.getByText("Full", { exact: true }).click();
  await options.getByRole("button", { name: /^Add · ₹220/ }).click();
  await expect(tablet.getByText(/1 new · ₹231/)).toBeVisible();
  await tablet.getByRole("button", { name: /1 new/ }).click();
  await order.getByRole("button", { name: "One more Paneer Tikka (Full)" }).click();
  await expect(order.getByRole("button", { name: "Send to Kitchen" })).toBeEnabled();
  await tablet.keyboard.press("Escape");
  await expect(tablet.getByText(/2 new · ₹462/)).toBeVisible();
  // The next send is the day's second kitchen ticket.
  await tablet.getByRole("button", { name: "Send to Kitchen" }).last().click();
  await expect(tablet.getByText("Sent to kitchen — KOT #2")).toBeVisible({ timeout: 15_000 });

  // Back on the floor, T1 reads Ordered.
  await tablet.goto("/staff/floor");
  await expect(tableTile(tablet, "T1")).toHaveAccessibleName(/, Ordered/, { timeout: 15_000 });

  await tablet.context().close();
});
