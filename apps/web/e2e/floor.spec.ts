import { expect, test } from "@playwright/test";
import { onboard, randomMobile, signInWithPhone } from "./helpers";

// M3-T1 acceptance: owner sets up a section, bulk-adds tables, arranges and edits them.

test("owner sets up the floor: section, bulk tables, layout, edit", async ({ page, request }) => {
  await signInWithPhone(page, request, randomMobile());
  await expect(page).toHaveURL(/\/onboarding$/);
  await onboard(page);

  await page.goto("/owner");
  await page.getByRole("link", { name: /Floor & Tables/ }).click();
  await expect(page.getByRole("heading", { name: "Floor & Tables" })).toBeVisible();

  // First section.
  await page.getByRole("button", { name: "Add Your First Section" }).click();
  const sections = page.getByRole("dialog", { name: "Sections" });
  await sections.getByLabel("New Section").fill("Main Hall");
  await sections.getByRole("button", { name: "Add Section" }).click();
  await expect(sections.getByRole("button", { name: "Rename Main Hall" })).toBeVisible({
    timeout: 15_000,
  });
  await sections.getByRole("button", { name: "Done" }).click();

  // Bulk-add T1–T6.
  await page.getByRole("button", { name: "Add Tables" }).first().click();
  const add = page.getByRole("dialog", { name: "Add Tables" });
  await add.getByLabel("To").fill("6");
  await expect(add.getByText("Creates 6 tables: T1, T2 … T6")).toBeVisible();
  await add.getByRole("button", { name: "Add 6 Tables" }).click();
  await expect(add).toBeHidden({ timeout: 15_000 });
  for (const label of ["T1", "T2", "T3", "T4", "T5", "T6"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^Table ${label},`) })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: /^Table T1, 4 seats, row 1 column 1$/ })).toBeVisible();

  // Move T1 right (swaps with T2), save, and the layout survives a reload.
  await page.getByRole("button", { name: /^Table T1,/ }).click();
  await page.getByRole("button", { name: "Move T1 right" }).click();
  await expect(page.getByText("2 tables moved — not saved yet")).toBeVisible();
  await page.getByRole("button", { name: "Save Layout" }).click();
  // The bar (not just the button, which turns into "Saving…") goes once the save lands.
  await expect(page.getByText(/not saved yet/)).toBeHidden({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole("button", { name: /^Table T1, 4 seats, row 1 column 2$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Table T2, 4 seats, row 1 column 1$/ })).toBeVisible();

  // Edit T2: 6 seats.
  await page.getByRole("button", { name: /^Table T2,/ }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Table T2" });
  await edit.getByText("6", { exact: true }).click();
  await edit.getByRole("button", { name: "Save Changes" }).click();
  await expect(edit).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /^Table T2, 6 seats,/ })).toBeVisible();
});
