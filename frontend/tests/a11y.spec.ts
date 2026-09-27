import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mockApi, withProfile } from "./fixtures";

const PAGES = ["", "/onboarding", "/home", "/roadmap", "/ask", "/letters", "/scam-check", "/help", "/settings", "/trust"];

for (const locale of ["en", "ar"]) {
  for (const path of PAGES) {
    test(`axe: /${locale}${path} has no serious or critical issues`, async ({ page }) => {
      await mockApi(page, locale);
      await withProfile(page);
      await page.goto(`/${locale}${path}`);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
    });
  }
}

test("Arabic pages are right-to-left", async ({ page }) => {
  await page.goto("/ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
});

test("skip link is the first thing keyboard users reach", async ({ page }) => {
  await page.goto("/en/ask");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
});

test("Amira asks a question in Arabic and sees the official source", async ({ page }) => {
  await mockApi(page, "ar");
  await page.goto("/ar/ask");
  await page.getByRole("textbox", { name: "سؤالك" }).fill("كيف أحصل على بطاقة صحية؟");
  await page.keyboard.press("Enter");
  await expect(page.getByText("ServiceOntario").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Apply for OHIP/ })).toBeVisible();
  await page.screenshot({ path: "test-results/amira-answer-ar.png", fullPage: true });
});

for (const locale of ["prs", "ps", "ti"]) {
  for (const path of ["", "/onboarding", "/home"]) {
    test(`axe: /${locale}${path} has no serious or critical issues`, async ({ page }) => {
      await mockApi(page, locale);
      await withProfile(page);
      await page.goto(`/${locale}${path}`);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
    });
  }
}

test("Dari and Pashto are right-to-left, Tigrinya is left-to-right", async ({ page }) => {
  for (const [locale, dir] of [["prs", "rtl"], ["ps", "rtl"], ["ti", "ltr"]]) {
    await page.goto(`/${locale}`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
  }
});
