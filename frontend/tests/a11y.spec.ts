import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { deflateRawSync } from "node:zlib";
import { mockApi, PROFILE_ID, withProfile } from "./fixtures";

// A "Show my card" link as the app makes it (lib/cardPayload.ts): "1." + base64url(deflate-raw(JSON)).
const payload = `#1.${deflateRawSync(
  Buffer.from(
    JSON.stringify({ v: 2, n: "Amira", l: "ar", g: "Woman", c: "Syria", i: "sin", a: "apply for my Social Insurance Number", d: ["Passport"], id: PROFILE_ID }),
  ),
).toString("base64url")}`;

const PAGES = ["", "/onboarding", "/home", "/item/sin", "/item/food_bank", "/id", "/assistant", "/end", `/card${payload}`];

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`);
}

for (const locale of ["en", "ar"]) {
  for (const path of PAGES) {
    test(`axe: /${locale}${path.split("#")[0]} has no serious or critical issues`, async ({ page }) => {
      await mockApi(page, locale);
      await withProfile(page, locale);
      await page.goto(`/${locale}${path}`);
      await page.waitForLoadState("networkidle");
      expect(await axe(page)).toEqual([]);
    });
  }
}

for (const locale of ["fr", "hi", "zh", "es"]) {
  for (const path of ["", "/home", "/item/ohip"]) {
    test(`axe: /${locale}${path} has no serious or critical issues`, async ({ page }) => {
      await mockApi(page, locale);
      await withProfile(page, locale);
      await page.goto(`/${locale}${path}`);
      await page.waitForLoadState("networkidle");
      expect(await axe(page)).toEqual([]);
    });
  }
}

test("axe: the English staff page", async ({ page }) => {
  await page.goto(`/en/for-staff${payload}`);
  await expect(page.getByRole("article")).toContainText("I speak Arabic.");
  expect(await axe(page)).toEqual([]);
});

test("Arabic is right-to-left; the other five languages are left-to-right", async ({ page }) => {
  for (const [locale, dir] of [["ar", "rtl"], ["en", "ltr"], ["fr", "ltr"], ["hi", "ltr"], ["zh", "ltr"], ["es", "ltr"]]) {
    await page.goto(`/${locale}`);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
  }
});

test("skip link is the first thing keyboard users reach", async ({ page }) => {
  await page.goto("/en/home");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
});
