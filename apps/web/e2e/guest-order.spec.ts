import { expect, test } from "@playwright/test";
import {
  addStaffMember,
  addTables,
  hydrated,
  onboard,
  randomMobile,
  signedInTablet,
  signInWithPhone,
  tableToken,
  tableTile,
} from "./helpers";

// M5-T6b acceptance: the owner turns on "Guests Order, Staff Approve" → a guest orders from the
// QR menu → the butler sees it waiting on the floor and taps Approve & Send → the guest sees
// "Sent to the kitchen" live and the kitchen has KOT #1. A second order is turned down (the
// guest sees why), and in direct mode a guest order goes straight to the kitchen.

test("guest orders from the QR menu; staff approve or turn it down", async ({
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

  // Owner: guests order, staff approve.
  await page.goto("/owner/staff");
  await hydrated(page, "main");
  await page.getByRole("radio", { name: /Guests Order, Staff Approve/ }).check();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  const kitchen = await signedInTablet(page, browser, "Imran", kitchenPin);
  const butler = await signedInTablet(page, browser, "Rahul", butlerPin);
  const token = await tableToken(page, "T1");
  await butler.goto("/staff/floor");
  await hydrated(butler, "h1");

  // Guest: Butter Chicken + Paneer Tikka (Full) → Place Order.
  const guestContext = await browser.newContext({
    ...(page.viewportSize() ? { viewport: page.viewportSize() } : {}),
    locale: "en-IN",
  });
  const guest = await guestContext.newPage();
  await guest.goto(`/t/${token}`);
  await hydrated(guest, "h1");
  await guest.getByRole("button", { name: "Add Butter Chicken" }).click();
  await expect(guest.getByRole("group", { name: "Butter Chicken" })).toContainText("1");
  await guest.getByRole("button", { name: "Add Paneer Tikka" }).click();
  const choices = guest.getByRole("dialog", { name: "Choose for Paneer Tikka" });
  const addToOrder = choices.getByRole("button", { name: /^Add to Order/ });
  await expect(addToOrder).toBeDisabled(); // a size is required
  await choices.getByRole("radio", { name: /Full/ }).check();
  await expect(addToOrder).toHaveText("Add to Order · ₹220");
  await addToOrder.click();
  await guest.getByRole("button", { name: /2 items · ₹540/ }).click();
  const cart = guest.getByRole("dialog", { name: "Your Order" });
  await expect(cart).toContainText("Paneer Tikka (Full)");
  await cart.getByRole("button", { name: "Place Order" }).click();
  await expect(guest.getByText("Order sent — waiting for the staff to confirm.")).toBeVisible({
    timeout: 15_000,
  });
  await expect(guest.getByRole("region", { name: "Your Orders" })).toContainText(
    "Waiting for staff",
  );

  // Butler: T1 shows the waiting order live → open it → Approve & Send.
  await expect(tableTile(butler, "T1")).toHaveAccessibleName(/order waiting for approval/, {
    timeout: 5_000,
  });
  await tableTile(butler, "T1").click();
  await hydrated(butler, "h1");
  const waiting = butler.getByRole("article", { name: "Guest order waiting for approval" });
  await expect(waiting).toContainText("Butter Chicken");
  await expect(waiting).toContainText("Paneer Tikka (Full)");
  await waiting.getByRole("button", { name: "Approve & Send" }).click();
  await expect(butler.getByText("Guest order sent — KOT #1")).toBeVisible({ timeout: 15_000 });

  // Guest sees it live; the kitchen has the ticket.
  await expect(guest.getByRole("region", { name: "Your Orders" })).toContainText(
    "Sent to the kitchen",
    { timeout: 5_000 },
  );
  await kitchen.goto("/staff/kitchen");
  await expect(kitchen.getByRole("article", { name: /^KOT 1, table T1/ })).toContainText(
    "Butter Chicken",
  );

  // A second guest order, turned down with a reason the guest sees.
  await guest.getByRole("button", { name: /Add Packaged Water/ }).click();
  await guest.getByRole("button", { name: /1 item · ₹40/ }).click();
  await cart.getByRole("button", { name: "Place Order" }).click();
  await expect(guest.getByText("Order sent — waiting for the staff to confirm.")).toBeVisible({
    timeout: 15_000,
  });
  const second = butler.getByRole("article", { name: "Guest order waiting for approval" });
  await expect(second).toContainText("Packaged Water", { timeout: 5_000 });
  await second.getByRole("button", { name: "Not Now" }).click();
  await second.getByRole("button", { name: "Item not available" }).click();
  await expect(butler.getByText("Guest order turned down")).toBeVisible();
  await expect(guest.getByRole("region", { name: "Your Orders" })).toContainText(
    "Reason: Item not available",
    { timeout: 5_000 },
  );

  // Direct mode: straight to the kitchen, no approval.
  await page.goto("/owner/staff");
  await hydrated(page, "main");
  await page.getByRole("radio", { name: /Straight to the Kitchen/ }).check();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await guest.reload();
  await hydrated(guest, "h1");
  await guest.getByRole("button", { name: /Add Packaged Water/ }).click();
  await guest.getByRole("button", { name: /1 item · ₹40/ }).click();
  await cart.getByRole("button", { name: "Place Order" }).click();
  await expect(guest.getByText("Order sent to the kitchen.")).toBeVisible({ timeout: 15_000 });
  await expect(kitchen.getByRole("article", { name: /^KOT 2, table T1/ })).toContainText(
    "Packaged Water",
    { timeout: 5_000 },
  );

  await guestContext.close();
  await kitchen.context().close();
  await butler.context().close();
});
