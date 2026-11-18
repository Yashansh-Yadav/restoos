import { expect, test } from "@playwright/test";
import { onboard, randomMobile, signInWithPhone } from "./helpers";

// M1-T5 acceptance: an owner adds a butler with the suggested PIN, edits the role, and
// deactivates them — all from /owner/staff.

test("owner adds, edits and deactivates a staff member", async ({ page, request }) => {
  await signInWithPhone(page, request, randomMobile());
  await expect(page).toHaveURL(/\/onboarding$/);
  await onboard(page);

  await page.getByRole("link", { name: /Staff/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Staff" })).toBeVisible();
  await expect(page.getByText("No staff yet")).toBeVisible();

  // Add: the PIN field comes pre-filled with a strong suggestion.
  await page.getByRole("button", { name: "Add Staff" }).click();
  const sheet = page.getByRole("dialog", { name: "Add Staff" });
  await sheet.getByLabel("Name").fill("Arjun");
  await sheet.getByText("Butler", { exact: true }).click();
  const pin = await sheet.getByLabel("PIN").inputValue();
  expect(pin).toMatch(/^\d{4}$/);
  await sheet.getByRole("button", { name: "Add Staff" }).click();

  // The PIN is shown once to hand over.
  const ready = page.getByRole("dialog", { name: "PIN Ready" });
  await expect(ready.getByText(pin)).toBeVisible();
  await ready.getByRole("button", { name: "Done" }).click();

  const row = page.getByRole("button", { name: /^Edit Arjun, Butler/ });
  await expect(row).toBeVisible();
  await expect(page.getByText("1 of 20 active staff on your plan")).toBeVisible();

  // Edit the role.
  await row.click();
  const edit = page.getByRole("dialog", { name: "Edit Arjun" });
  await edit.getByText("Cashier", { exact: true }).click();
  await edit.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("button", { name: /^Edit Arjun, Cashier/ })).toBeVisible();

  // Deactivate behind a confirm step.
  await page.getByRole("button", { name: /^Edit Arjun/ }).click();
  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  await page.getByRole("button", { name: "Deactivate Arjun" }).click();
  await expect(page.getByRole("button", { name: "Edit Arjun, Cashier, inactive" })).toBeVisible();
  await expect(page.getByText("0 of 20 active staff on your plan")).toBeVisible();
});
