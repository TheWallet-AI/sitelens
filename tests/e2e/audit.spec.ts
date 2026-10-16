import { test, expect } from "@playwright/test";
test("English audit entry is responsive and labelled", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Can they read it/ }),
  ).toBeVisible();
  await expect(page.getByLabel("Your website URL")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/sitelens-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test("rejects a non-public destination", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Your website URL").fill("http://127.0.0.1");
  await page.getByRole("button", { name: "Check my website" }).click();
  await expect(
    page.getByText("Enter a public HTTP(S) website URL.", { exact: true }),
  ).toBeVisible();
});
