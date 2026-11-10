import { expect, test } from "@playwright/test";

// M0-T4 smoke test: the app boots, navigation works, the API is reachable through /api, and the
// basic mobile rules hold (no sideways scroll, touch targets ≥ 44px — CLAUDE.md rule 12).

test("index lists the four surfaces and opens Owner", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "RestoOS" })).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Surfaces" });
  for (const name of ["Owner", "Staff", "Customer", "Platform Admin"]) {
    await expect(nav.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
  }

  await nav.getByRole("link", { name: /^Owner/ }).click();
  await expect(page).toHaveURL(/\/owner$/);
  await expect(page.getByRole("heading", { level: 1, name: "Owner" })).toBeVisible();
});

test("the browser reaches the Fastify API through /api", async ({ page }) => {
  await page.goto("/");
  const body = await page.evaluate(
    async () => (await fetch("/api/health")).json() as Promise<unknown>,
  );
  expect(body).toEqual({ ok: true });
});

for (const path of ["/", "/owner", "/staff", "/admin", "/t/demo"]) {
  test(`${path} fits the screen and keeps touch targets ≥ 44px`, async ({ page }) => {
    await page.goto(path);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, "horizontal scroll").toBeLessThanOrEqual(0);

    // Only our own document — Next's dev overlay lives in a shadow root.
    const tooSmall = await page.locator("a, button").evaluateAll((els) =>
      els
        .filter((el) => el.getRootNode() === document)
        .map((el) => ({ text: el.textContent?.trim() ?? "", h: el.getBoundingClientRect().height }))
        .filter((t) => t.h > 0 && t.h < 44),
    );
    expect(tooSmall).toEqual([]);
  });
}
