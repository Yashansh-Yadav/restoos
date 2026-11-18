import { expect, test } from "@playwright/test";
import { onboard, randomMobile, signInWithPhone } from "./helpers";

// M1-T6 acceptance: pair a device → PIN login as butler → sees butler home; wrong PIN ×5 → locked.

test("pair a device, sign in as a butler with a PIN, and lock after 5 wrong PINs", async ({
  page,
  request,
  browser,
}) => {
  // Owner: onboard, add a butler (keep the suggested PIN), register a device.
  await signInWithPhone(page, request, randomMobile());
  await expect(page).toHaveURL(/\/onboarding$/);
  await onboard(page);

  await page.goto("/owner/staff");
  await page.getByRole("button", { name: "Add Staff" }).click();
  const add = page.getByRole("dialog", { name: "Add Staff" });
  await add.getByLabel("Name").fill("Arjun");
  const pin = await add.getByLabel("PIN").inputValue();
  await add.getByRole("button", { name: "Add Staff" }).click();
  await page.getByRole("button", { name: "Done" }).click();

  await page.goto("/owner/devices");
  await page.getByRole("button", { name: "Add Device" }).click();
  await page.getByRole("dialog").getByLabel("Device Name").fill("Counter tablet");
  await page.getByRole("button", { name: "Add & Get Code" }).click();
  const codeText = await page.getByLabel(/^Pairing code/).textContent();
  const code = (codeText ?? "").replace(/\D/g, "");
  expect(code).toMatch(/^\d{8}$/);

  // The restaurant's tablet: a fresh browser with no owner session.
  const tablet = await (await browser.newContext({ viewport: page.viewportSize() })).newPage();
  await tablet.goto("/staff");
  await expect(tablet).toHaveURL(/\/staff\/pair$/);
  await tablet.getByLabel("Pairing Code").fill(code); // submits on the 8th digit
  await expect(tablet.getByRole("heading", { name: "Who's Signing In?" })).toBeVisible();

  // Tap name → PIN (signs in on the last digit, no extra tap). The page was just fully loaded,
  // so retry the tap until React has hydrated and the PIN pad opens.
  const openPad = () =>
    expect(async () => {
      await tablet.getByRole("button", { name: /Arjun/ }).click({ timeout: 2_000 });
      await expect(tablet.getByRole("heading", { name: "Arjun" })).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
  await openPad();
  await tablet.keyboard.type(pin);
  await expect(tablet.getByRole("heading", { name: "Hi Arjun" })).toBeVisible();
  await expect(tablet.getByText("Butler", { exact: true })).toBeVisible();
  // M1-T7: the first sign-in of the day starts the shift.
  await expect(tablet.getByText(/^On shift since/)).toBeVisible();

  // Quick switch: back to the names, still paired; the shift keeps running.
  await tablet.getByRole("button", { name: "Switch User" }).click();
  await expect(tablet.getByRole("heading", { name: "Who's Signing In?" })).toBeVisible();
  await openPad();
  await tablet.keyboard.type(pin);
  await expect(tablet.getByText(/^On shift since/)).toBeVisible();

  // End Shift (with a confirm) closes the shift and signs out.
  await expect(async () => {
    await tablet.getByRole("button", { name: "End Shift" }).first().click({ timeout: 2_000 });
    await expect(tablet.getByRole("group", { name: "Confirm end of shift" })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 20_000 });
  await tablet
    .getByRole("group", { name: "Confirm end of shift" })
    .getByRole("button", { name: "End Shift" })
    .click();
  await expect(tablet.getByRole("heading", { name: "Who's Signing In?" })).toBeVisible();

  // Wrong PIN ×5 → locked, the pad is disabled.
  await openPad();
  for (const expected of [
    "4 of 5 tries left",
    "3 of 5 tries left",
    "2 of 5 tries left",
    "1 try left",
  ]) {
    await tablet.keyboard.type("9999");
    await expect(tablet.getByRole("alert").filter({ hasText: expected })).toBeVisible();
  }
  await tablet.keyboard.type("9999");
  await expect(tablet.getByRole("alert").filter({ hasText: "Too many wrong PINs" })).toBeVisible();
  await expect(tablet.getByRole("button", { name: "1", exact: true })).toBeDisabled();

  await tablet.context().close();
});
