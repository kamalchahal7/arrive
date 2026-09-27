import { expect, test } from "@playwright/test";
import { mockApi, PROFILE_ID } from "./fixtures";

// docs/REDESIGN.md R6: the full Amira flow on a phone-sized screen in Arabic, language choice to staff card.
test("Amira in Arabic: language, onboarding by tapping, checklist, health card step, staff card", async ({ page }) => {
  await mockApi(page, "ar");
  await page.goto("/en");
  await page.getByRole("link", { name: "العربية" }).click();
  await page.getByRole("button", { name: "ابدأ" }).click();
  await page.getByLabel("اسمك الأول").fill("Amira");
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("button", { name: "أوتاوا" }).click();
  await page.getByRole("button", { name: "تخطَّ" }).click();
  await page.getByRole("button", { name: "امرأة" }).click();
  await page.getByRole("button", { name: "لا، أقل من 65" }).click();
  await page.getByRole("button", { name: /واحد أكثر: بالغون/ }).click();
  await page.getByRole("button", { name: /واحد أكثر: أطفال \(0/ }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("button", { name: "لا أحد" }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("button", { name: "أنشئ قائمتي" }).click();
  await expect(page.getByText(PROFILE_ID)).toBeVisible();
  await page.getByRole("button", { name: "اذهب إلى قائمتي" }).click();

  await expect(page).toHaveURL(/\/ar\/home/);
  await expect(page.getByRole("heading", { name: "مرحبًا، Amira" })).toBeVisible();
  await page.getByRole("button", { name: /الأسبوعان الأولان/ }).click();
  await page.getByRole("link", { name: /قدّم طلب البطاقة الصحية/ }).first().click();
  await expect(page).toHaveURL(/\/ar\/item\/health_card/);
  await page.getByRole("button", { name: "أظهر بطاقتي" }).click();
  await expect(page).toHaveURL(/\/ar\/card#1\./);
  await expect(page.getByRole("article")).toContainText("Hello, my name is Amira.");
  await expect(page.getByRole("img", { name: "رمز QR لهذه البطاقة" })).toBeVisible();
  await page.screenshot({ path: "test-results/amira-staff-card-ar.png", fullPage: true });
});
