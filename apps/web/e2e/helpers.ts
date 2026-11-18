import { expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";

/** A random valid Indian mobile, so parallel/back-to-back runs never hit the per-number cooldown. */
export const randomMobile = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;

/** Signs in a new owner by phone OTP (console provider; code read via the dev-only hook). */
export async function signInWithPhone(page: Page, request: APIRequestContext, local: string) {
  await page.goto("/login");
  await page.getByLabel("Mobile Number").fill(local);
  await page.getByRole("button", { name: "Send Code" }).click();
  await expect(page.getByLabel("Verification Code")).toBeFocused();

  const res = await request.get(`/api/dev/last-otp?phone=${encodeURIComponent(`+91${local}`)}`);
  const { code } = (await res.json()) as { code: string | null };
  expect(code).toMatch(/^\d{6}$/);
  // Typing the 6th digit submits on its own (one tap saved).
  await page.getByLabel("Verification Code").fill(code ?? "");
}

/** New owner fills the 3-step onboarding wizard → lands on /owner. */
export async function onboard(page: Page) {
  const next = page.getByRole("button", { name: "Continue" });
  await page.getByLabel("Brand Name").fill("Saffron Table");
  await page.getByLabel("Legal Name").fill("Saffron Table Hospitality Pvt Ltd");
  await next.click();
  await page.getByLabel("Address").fill("12 Hill Road, Bandra West, Mumbai 400050");
  await page.getByLabel("State").selectOption("27");
  await next.click();
  await page.getByRole("button", { name: "Finish Setup" }).click();
  await expect(page).toHaveURL(/\/owner$/);
}

/** Owner: first section "Main Hall" with tables T1…Tn (floor editor, M3-T1). */
export async function addTables(page: Page, count: number) {
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
  await add.getByLabel("To").fill(String(count));
  await add
    .getByRole("button", { name: `Add ${count} ${count === 1 ? "Table" : "Tables"}` })
    .click();
  await expect(add).toBeHidden({ timeout: 15_000 });
}

/** Owner: adds a staff member with the suggested PIN; returns the PIN. */
export async function addStaffMember(page: Page, name: string, role: string) {
  await page.goto("/owner/staff");
  await page.getByRole("button", { name: "Add Staff" }).click();
  const staff = page.getByRole("dialog", { name: "Add Staff" });
  await staff.getByLabel("Name").fill(name);
  await staff.getByText(role, { exact: true }).click();
  const pin = await staff.getByLabel("PIN").inputValue();
  await staff.getByRole("button", { name: "Add Staff" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  return pin;
}

/** Owner pairs a new tablet; the staff member signs in with their PIN (their shift starts). */
export async function signedInTablet(page: Page, browser: Browser, name: string, pin: string) {
  await page.goto("/owner/devices");
  await page.getByRole("button", { name: "Add Device" }).click();
  await page.getByRole("dialog").getByLabel("Device Name").fill(`Tablet for ${name}`);
  await page.getByRole("button", { name: "Add & Get Code" }).click();
  const code = ((await page.getByLabel(/^Pairing code/).textContent()) ?? "").replace(/\D/g, "");

  const tablet = await (await browser.newContext({ viewport: page.viewportSize() })).newPage();
  await tablet.goto("/staff/pair");
  await tablet.getByLabel("Pairing Code").fill(code);
  await expect(tablet.getByRole("heading", { name: "Who's Signing In?" })).toBeVisible();
  await expect(async () => {
    await tablet.getByRole("button", { name: new RegExp(name) }).click({ timeout: 2_000 });
    await expect(tablet.getByRole("heading", { name })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await tablet.keyboard.type(pin);
  await expect(tablet.getByText(/^On shift since/)).toBeVisible({ timeout: 15_000 });
  return tablet;
}

/** A floor tile by table label (FloorGrid's accessible name starts "Table T1,"). */
export const tableTile = (page: Page, label: string) =>
  page.getByRole("button", { name: new RegExp(`^Table ${label},`) });
