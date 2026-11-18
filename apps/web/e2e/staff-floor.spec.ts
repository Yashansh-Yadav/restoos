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

// M3-T4 acceptance: a butler sees their tables on the floor and moves one through seat → free.

test("butler seats guests at their table from the floor view", async ({
  page,
  request,
  browser,
}) => {
  await signInWithPhone(page, request, randomMobile());
  await expect(page).toHaveURL(/\/onboarding$/);
  await onboard(page);
  await addTables(page, 3);
  const pin = await addStaffMember(page, "Rahul", "Butler");
  const tablet = await signedInTablet(page, browser, "Rahul", pin);

  // The owner gives Rahul T1.
  await page.goto("/owner/floor/assign");
  await expect(async () => {
    await tableTile(page, "T1").click({ timeout: 2_000 });
    await expect(tableTile(page, "T1")).toHaveAccessibleName(/with Rahul$/, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  // Butler: Home → Floor opens on "My Tables".
  await tablet.getByRole("link", { name: /^Floor/ }).click();
  await expect(tablet.getByRole("heading", { name: "Floor" })).toBeVisible();
  await expect(tablet.getByRole("button", { name: "My Tables" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const t1 = tableTile(tablet, "T1");
  await expect(t1).toHaveAccessibleName(/Free, with Rahul$/);

  // Tap T1 → Seat Guests (2 taps).
  const sheet = tablet.getByRole("dialog", { name: "Table T1" });
  await expect(async () => {
    await t1.click({ timeout: 2_000 });
    await expect(sheet).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await sheet.getByRole("button", { name: "Seat Guests" }).click();
  await expect(t1).toHaveAccessibleName(/Seated, with Rahul$/, { timeout: 15_000 });

  // Guests left before ordering → free again; cleaning isn't offered for a free table.
  await t1.click();
  await expect(sheet.getByText("just now")).toBeVisible();
  await sheet.getByRole("button", { name: "Guests Left" }).click();
  await expect(t1).toHaveAccessibleName(/Free, with Rahul$/, { timeout: 15_000 });
  await t1.click();
  await expect(sheet.getByRole("button", { name: "Seat Guests" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Mark Cleaned" })).toHaveCount(0);
  await tablet.keyboard.press("Escape");

  // "All" shows everyone's tables.
  await tablet.getByRole("button", { name: "All" }).click();
  await expect(tableTile(tablet, "T2")).toHaveAccessibleName(/^Table T2, 4 seats, Free$/);

  await tablet.context().close();
});
