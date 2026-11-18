import { expect, test } from "@playwright/test";
import { onboard, randomMobile, signInWithPhone } from "./helpers";

// M2-T4 acceptance: kitchen staff mark a dish out of stock in one tap; the owner sees it.

test("kitchen marks a dish out of stock from the staff app", async ({ page, request, browser }) => {
  await signInWithPhone(page, request, randomMobile());
  await expect(page).toHaveURL(/\/onboarding$/);
  await onboard(page);

  // Menu: import the template's 3 example dishes.
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
  await page.keyboard.press("Escape");

  // Kitchen staff + a paired tablet.
  await page.goto("/owner/staff");
  await page.getByRole("button", { name: "Add Staff" }).click();
  const add = page.getByRole("dialog", { name: "Add Staff" });
  await add.getByLabel("Name").fill("Imran");
  await add.getByText("Kitchen", { exact: true }).click();
  const pin = await add.getByLabel("PIN").inputValue();
  await add.getByRole("button", { name: "Add Staff" }).click();
  await page.getByRole("button", { name: "Done" }).click();

  await page.goto("/owner/devices");
  await page.getByRole("button", { name: "Add Device" }).click();
  await page.getByRole("dialog").getByLabel("Device Name").fill("Kitchen tablet");
  await page.getByRole("button", { name: "Add & Get Code" }).click();
  const code = ((await page.getByLabel(/^Pairing code/).textContent()) ?? "").replace(/\D/g, "");

  const tablet = await (await browser.newContext({ viewport: page.viewportSize() })).newPage();
  await tablet.goto("/staff/pair");
  await tablet.getByLabel("Pairing Code").fill(code);
  await expect(tablet.getByRole("heading", { name: "Who's Signing In?" })).toBeVisible();
  await expect(async () => {
    await tablet.getByRole("button", { name: /Imran/ }).click({ timeout: 2_000 });
    await expect(tablet.getByRole("heading", { name: "Imran" })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await tablet.keyboard.type(pin);

  // Home → Item Stock (2 taps) → one tap marks Paneer Tikka out of stock.
  await tablet.getByRole("link", { name: /Item Stock/ }).click();
  await expect(tablet.getByRole("heading", { name: "Item Stock" })).toBeVisible();
  await expect(tablet.getByText("Everything is available.")).toBeVisible();
  const paneer = tablet.getByRole("switch", { name: /^Paneer Tikka:/ });
  await expect(async () => {
    await paneer.click({ timeout: 2_000 });
    await expect(paneer).toHaveAttribute("aria-checked", "false", { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(tablet.getByText("1 item is out of stock.")).toBeVisible();

  // The owner's menu shows it.
  await page.goto("/owner/menu");
  await page.getByRole("button", { name: /^Starters/ }).click();
  await expect(page.getByRole("button", { name: /^Veg Paneer Tikka/ })).toContainText(
    "Out of stock",
  );

  await tablet.context().close();
});
