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

// M3-T4 acceptance: a butler sees their tables on the floor and moves one through seat → free
// (since M5-T1 via the table's order screen).

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

  // Tap T1 → its order screen (M5-T1); "Seat Only" seats guests without ordering yet.
  await expect(async () => {
    await t1.click({ timeout: 2_000 });
    await expect(tablet).toHaveURL(/\/staff\/tables\//, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  const header = tablet.getByRole("banner");
  await expect(async () => {
    await header.getByRole("button", { name: "Seat Only" }).click({ timeout: 2_000 });
    await expect(header.getByText("Seated", { exact: true })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  // Guests left before ordering → free again.
  await header.getByRole("button", { name: "Guests Left" }).click();
  await expect(header.getByText("Free", { exact: true })).toBeVisible({ timeout: 15_000 });
  await header.getByRole("link", { name: "Floor" }).click();
  await expect(t1).toHaveAccessibleName(/Free, with Rahul$/, { timeout: 15_000 });

  // "All" shows everyone's tables.
  await tablet.getByRole("button", { name: "All" }).click();
  await expect(tableTile(tablet, "T2")).toHaveAccessibleName(/^Table T2, 4 seats, Free$/);

  await tablet.context().close();
});
