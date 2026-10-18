import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const report = JSON.parse(
  readFileSync(
    new URL("../fixtures/morrow-report.json", import.meta.url),
    "utf8",
  ),
);
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

async function routeAudit(page: Page) {
  await page.route("**/api/audit", async (route) => {
    const events = [
      {
        runId: "fixture",
        type: "phase",
        message: "Reading public pages and collecting evidence.",
      },
      { runId: "fixture", type: "page", message: "Read a public HTML page." },
      {
        runId: "fixture",
        type: "resource",
        kind: "llms_txt",
        state: "valid",
        message: "/llms.txt: found and valid.",
      },
      { runId: "fixture", type: "result", report },
    ];
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/x-ndjson" },
      body: events.map((e) => JSON.stringify(e)).join("\n") + "\n",
    });
  });
}

test("landing page states the purpose and is responsive", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /See what search engines and AI agents/,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Your website URL")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Analyze a website/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Free hosted website check" }),
  ).toHaveAttribute(
    "href",
    "https://www.infoholder.io/app-studio/en/tools/site-check",
  );
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({
    path: `test-results/sitelens-landing-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("rejects a non-public destination", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Your website URL").fill("http://127.0.0.1");
  await page.getByRole("button", { name: /Analyze a website/ }).click();
  await expect(
    page.getByText("Enter a public HTTP(S) website URL.", { exact: true }),
  ).toBeVisible();
});

test("keyboard-only audit renders the report with findings, files and exports", async ({
  page,
}) => {
  await routeAudit(page);
  await page.goto("/");
  await page.getByLabel("Your website URL").focus();
  await page.keyboard.type("https://morrow-coffee.example.com/");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { level: 2, name: "morrow-coffee.example.com" }),
  ).toBeVisible();
  await expect(page.locator("[data-dimension]")).toHaveCount(3);
  await expect(
    page.getByRole("heading", { name: "What to fix first" }),
  ).toBeVisible();
  // The fixture's manifest is malformed on purpose, so it must be first-class work.
  await expect(
    page.locator(".finding-card[data-check='resource-business-actions']"),
  ).toBeVisible();
  await expect(page.locator("table.resources tbody tr")).toHaveCount(11);
  await expect(page.locator("tr[data-resource='llms_txt'] .state")).toHaveText(
    "Found and valid",
  );
  await expect(
    page.locator("tr[data-resource='mcp_server_card'] .state"),
  ).toHaveText("Not published");
  // The hosted checker is offered after the report; no report data goes into the link.
  await expect(
    page.getByRole("link", { name: /Open the free website checker/ }),
  ).toHaveAttribute(
    "href",
    "https://www.infoholder.io/app-studio/en/tools/site-check",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  expect((await download).suggestedFilename()).toBe(
    "sitelens-morrow-coffee.example.com.json",
  );
  await expect(page.getByText("JSON report downloaded.")).toBeVisible();
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({
    path: `test-results/sitelens-report-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("dark mode keeps the report readable", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await routeAudit(page);
  await page.goto("/");
  await page
    .getByLabel("Your website URL")
    .fill("https://morrow-coffee.example.com/");
  await page.getByRole("button", { name: /Analyze a website/ }).click();
  await expect(page.locator("[data-dimension]")).toHaveCount(3);
  const colors = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return { bg: body.backgroundColor, fg: body.color };
  });
  expect(colors.bg).not.toBe(colors.fg);
  expect(colors.bg).toBe("rgb(15, 23, 20)");
  expect(await noOverflow(page)).toBe(true);
  await page.screenshot({
    path: `test-results/sitelens-report-dark-${test.info().project.name}.png`,
    fullPage: true,
  });
});
