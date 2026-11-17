import { expect, test, type Page } from "@playwright/test";
import { randomMobile, signInWithPhone } from "./helpers";

// M2-T1 acceptance: an owner builds a menu — category, item with sizes and a photo — edits the
// price and hides the item.

/** 40×40 PNG generated with sharp — a real image the API converts to WebP. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAASklEQVRYhe3YsQ0AMAwCwczBIOxfMlZ2SJPmJPeWkM0Lzpovcywuqee44p3KQMYyAxKFxcBiYXGwGFgsLA4WpcUI5lVFTPmSZw0uFDHWWw5T+DoAAAAASUVORK5CYII=",
  "base64",
);

async function onboard(page: Page) {
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

test("owner adds a category and an item with sizes and a photo, edits and hides it", async ({
  page,
  request,
}) => {
  await signInWithPhone(page, request, randomMobile());
  await expect(page).toHaveURL(/\/onboarding$/);
  await onboard(page);

  await page.getByRole("link", { name: /^Menu/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Menu" })).toBeVisible();

  // M2-T2: the Excel template downloads as .xlsx.
  await page.getByRole("button", { name: "Excel" }).click();
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: /Download Template/ }).click(),
  ]);
  expect(file.suggestedFilename()).toBe("restoos-menu-template.xlsx");
  await page.keyboard.press("Escape");

  // First category.
  await page.getByRole("button", { name: "Add Your First Category" }).click();
  const cats = page.getByRole("dialog", { name: "Categories" });
  await cats.getByLabel("New Category", { exact: true }).fill("Mains");
  await cats.getByRole("button", { name: "Add Category" }).click();
  await expect(cats.getByRole("button", { name: "Rename Mains" })).toBeVisible();
  await cats.getByRole("button", { name: "Done" }).click();

  // Item with sizes, GST 5% (default) and a photo.
  await page.getByRole("button", { name: "Add Item" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Add Item" });
  await sheet.getByLabel("Name", { exact: true }).fill("Paneer Tikka");
  await sheet.getByLabel("Price (₹)").fill("220");
  await sheet.getByRole("button", { name: "Add Size" }).click(); // "Half" at ₹220
  await sheet.getByLabel("Size 1 price in rupees").fill("140");
  await sheet.getByRole("button", { name: "Add Size" }).click(); // "Full"
  await sheet.getByLabel("Size 2 price in rupees").fill("220");
  await sheet.locator('input[type="file"]').setInputFiles({
    name: "paneer.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await expect(sheet.getByRole("img", { name: "Photo of Paneer Tikka" })).toBeVisible();
  await sheet.getByRole("button", { name: "Add Item" }).click();
  // Saving = create + photo conversion (the first sharp run is slow on a cold server).
  await expect(sheet).toBeHidden({ timeout: 30_000 });

  const row = page.getByRole("button", { name: /Paneer Tikka/ });
  await expect(row).toContainText("from ₹140");
  await expect(row.locator("img")).toHaveAttribute("src", /\/api\/files\/menu\/.+\.webp$/);

  // Edit the Half price.
  await row.click();
  const edit = page.getByRole("dialog", { name: "Edit Paneer Tikka" });
  await edit.getByLabel("Size 1 price in rupees").fill("150");
  await edit.getByRole("button", { name: "Save Changes" }).click();
  await expect(row).toContainText("from ₹150");

  // Hide it (behind a confirm).
  await row.click();
  await page.getByRole("button", { name: "Hide from Menu" }).click();
  await page.getByRole("button", { name: "Hide Paneer Tikka" }).click();
  await expect(page.getByRole("button", { name: /Paneer Tikka/ })).toContainText("Hidden");
});
