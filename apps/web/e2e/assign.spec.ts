import { expect, test } from "@playwright/test";
import { onboard, randomMobile, signInWithPhone } from "./helpers";

// M3-T3 acceptance: a butler on shift gets tables with one tap each (tap butler → tap tables).

test("owner gives an on-shift butler their tables", async ({ page, request, browser }) => {
  await signInWithPhone(page, request, randomMobile());
  await expect(page).toHaveURL(/\/onboarding$/);
  await onboard(page);

  // Floor: Main Hall with T1–T4.
  await page.goto("/owner/floor");
  await page.getByRole("button", { name: "Add Your First Section" }).click();
  const sections = page.getByRole("dialog", { name: "Sections" });
  await sections.getByLabel("New Section").fill("Main Hall");
  await sections.getByRole("button", { name: "Add Section" }).click();
  await expect(sections.getByRole("button", { name: "Rename Main Hall" })).toBeVisible({
    timeout: 15_000,
  });
  await sections.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Add Tables" }).first().click();
  const add = page.getByRole("dialog", { name: "Add Tables" });
  await add.getByLabel("To").fill("4");
  await add.getByRole("button", { name: "Add 4 Tables" }).click();
  await expect(add).toBeHidden({ timeout: 15_000 });

  // A butler who signs in on a tablet (their shift starts).
  await page.goto("/owner/staff");
  await page.getByRole("button", { name: "Add Staff" }).click();
  const staff = page.getByRole("dialog", { name: "Add Staff" });
  await staff.getByLabel("Name").fill("Rahul");
  await staff.getByText("Butler", { exact: true }).click();
  const pin = await staff.getByLabel("PIN").inputValue();
  await staff.getByRole("button", { name: "Add Staff" }).click();
  await page.getByRole("button", { name: "Done" }).click();

  await page.goto("/owner/devices");
  await page.getByRole("button", { name: "Add Device" }).click();
  await page.getByRole("dialog").getByLabel("Device Name").fill("Floor tablet");
  await page.getByRole("button", { name: "Add & Get Code" }).click();
  const code = ((await page.getByLabel(/^Pairing code/).textContent()) ?? "").replace(/\D/g, "");

  const tablet = await (await browser.newContext({ viewport: page.viewportSize() })).newPage();
  await tablet.goto("/staff/pair");
  await tablet.getByLabel("Pairing Code").fill(code);
  await expect(tablet.getByRole("heading", { name: "Who's Signing In?" })).toBeVisible();
  await expect(async () => {
    await tablet.getByRole("button", { name: /Rahul/ }).click({ timeout: 2_000 });
    await expect(tablet.getByRole("heading", { name: "Rahul" })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await tablet.keyboard.type(pin);
  await expect(tablet.getByText(/^On shift since/)).toBeVisible({ timeout: 15_000 });

  // Floor → Assign Butlers: Rahul is picked; T1 and T2 are one tap each.
  await page.goto("/owner/floor");
  await page.getByRole("link", { name: "Assign Butlers" }).click();
  await expect(page.getByRole("heading", { name: "Assign Tables" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Rahul/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const tile = (label: string) =>
    page.getByRole("button", { name: new RegExp(`^Table ${label},`) });
  await tile("T1").click();
  await tile("T2").click();
  await expect(tile("T1")).toHaveAccessibleName(/with Rahul$/);
  await expect(tile("T2")).toHaveAccessibleName(/with Rahul$/);
  await expect(page.getByRole("button", { name: /^Rahul/ })).toContainText("2 tables");

  // Saved: a reload keeps it; tapping T2 again takes it off.
  await expect(async () => {
    await page.reload();
    await expect(tile("T2")).toHaveAccessibleName(/with Rahul$/, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  // (Retried: a tap right after the reload can land before the page is interactive.)
  await expect(async () => {
    await tile("T2").click({ timeout: 2_000 });
    await expect(tile("T2")).toHaveAccessibleName(/free$/, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await page.reload();
  await expect(tile("T1")).toHaveAccessibleName(/with Rahul$/);
  await expect(tile("T2")).toHaveAccessibleName(/free$/);

  await tablet.context().close();
});
