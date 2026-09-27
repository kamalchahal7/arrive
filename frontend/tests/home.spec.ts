import { expect, test } from "@playwright/test";
import { mockApi, PROFILE_ID, withProfile } from "./fixtures";

// The fixture profile: Amira, an adult with one child aged 0-5 and one aged 6-17, no disability, from Syria.

test("home: the five phases, the checklist filtered by the family, government-run programs, no More help", async ({ page }) => {
  await mockApi(page, "en");
  await withProfile(page);
  await page.goto("/en/home");
  await expect(page.getByRole("heading", { name: "Hello, Amira" })).toBeVisible();
  await expect(page.locator("h3 button")).toContainText(["Day 1–3", "Week 1", "Weeks 2–4", "Months 2–3", "Months 4–6"]);
  await expect(page.getByText("More help")).toHaveCount(0);

  await page.getByRole("button", { name: /Weeks 2–4/ }).click();
  await expect(page.getByRole("link", { name: "Enroll your children in school" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Register for childcare" })).toBeVisible();
  await expect(page.getByRole("link", { name: /disability support/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Services for seniors" })).toHaveCount(0);

  const programs = page.locator("#programs-title ~ ul a");
  await expect(page.getByRole("heading", { name: "Government-run programs" })).toBeVisible();
  await expect(programs.first()).toHaveText("Ottawa Public Library – newcomer services");
  await expect(programs.filter({ hasText: "EarlyON" })).toHaveCount(1);
  await expect(programs.filter({ hasText: "ODSP" })).toHaveCount(0);

  const tick = page.getByRole("checkbox", { name: "Done: Confirm your health coverage (IFHP)" });
  await tick.click();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Done: Confirm your health coverage (IFHP)" })).toHaveAttribute("aria-checked", "true");
  await page.screenshot({ path: "test-results/home-en.png", fullPage: true });
});

test("a senior with a disability sees the seniors and disability items and programs, in that order", async ({ page }) => {
  const overrides = { self_age_group: "senior", adults: 0, seniors: 1, children_0_5: 0, children_6_17: 0, disability_senior: true };
  await mockApi(page, "en", { profile: overrides });
  await withProfile(page, "en", overrides);
  await page.goto("/en/home");
  await page.getByRole("button", { name: /Weeks 2–4/ }).click();
  await expect(page.getByRole("link", { name: "Services for seniors" })).toBeVisible();
  await expect(page.getByRole("link", { name: /disability support/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Enroll your children in school" })).toHaveCount(0);
  const titles = await page.locator("#programs-title ~ ul a").allInnerTexts();
  expect(titles.indexOf("Council on Aging of Ottawa")).toBeLessThan(titles.indexOf("CNIB Ottawa (Canadian National Institute for the Blind)"));
  expect(titles.indexOf("Ottawa Food Bank")).toBeLessThan(titles.indexOf("Council on Aging of Ottawa"));
});

test("checklist item: location, Google Maps, documents, the three standard steps; the ID button opens the QR", async ({ page }) => {
  const log = await mockApi(page, "en");
  await withProfile(page);
  await page.goto("/en/item/sin");
  await expect(page.getByRole("heading", { name: "Get your Social Insurance Number (SIN)" })).toBeVisible();
  await expect(page.getByText("360 Albert St, Ottawa ON K1R 7X7")).toBeVisible();
  await expect(page.getByRole("link", { name: /1-866-274-6627/ })).toHaveAttribute("href", "tel:18662746627");
  await expect(page.getByRole("link", { name: "Open Google Maps" })).toHaveAttribute("href", /google\.com\/maps/);
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.locator("main img")).toHaveCount(0);
  await expect(page.getByText(/Draft/)).toHaveCount(0);
  await expect(page.getByText("Who this is for")).toHaveCount(0);
  const steps = page.locator("ol li");
  await expect(steps.nth(0)).toContainText("Meet the front desk worker");
  await expect(steps.nth(1)).toContainText("Tap your ID button");
  await expect(steps.nth(2)).toContainText("Show the worker");
  await expect(page.getByRole("link", { name: "Apply for a SIN (canada.ca)" })).toBeVisible();

  await steps.nth(1).getByRole("button", { name: "My ID" }).click();
  await expect(page).toHaveURL(/\/en\/card#/);
  await expect(page.getByText("For staff")).toBeVisible();
  await expect(page.getByText("Your information is being shared.")).toBeVisible();
  await expect(page.getByRole("img", { name: "QR code for staff" })).toBeVisible();
  await expect(page.getByText("Larger text")).toHaveCount(0);

  // The staff member's phone: the English page from the QR code, built only from the fragment.
  const hash = new URL(page.url()).hash;
  const before = log.length;
  await page.goto(`/en/for-staff${hash}`);
  const card = page.getByRole("article");
  await expect(card).toContainText("Hello, my name is Amira.");
  await expect(card).toContainText("I am here to apply for my Social Insurance Number.");
  await expect(card).toContainText("I speak English.");
  await expect(page.locator("main")).toContainText("Syria");
  await expect(page.locator("main")).toContainText(PROFILE_ID);
  expect(log.slice(before)).toEqual([]);
});

test("every checklist item has the three standard steps and the ID button", async ({ page }) => {
  await mockApi(page, "en");
  await withProfile(page);
  for (const id of ["ifhp", "ohip", "school", "ccb", "community"]) {
    await page.goto(`/en/item/${id}`);
    await expect(page.locator("ol li").nth(1)).toContainText("Tap your ID button");
    await expect(page.locator("ol li").nth(1).getByRole("button", { name: "My ID" })).toBeVisible();
  }
});

test("program page: description, who, how to apply, and 'I'm interested' is logged once", async ({ page }) => {
  const log = await mockApi(page, "en");
  await withProfile(page);
  await page.goto("/en/item/food_bank");
  await expect(page.getByRole("heading", { name: "Ottawa Food Bank" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Who can get it" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How to apply" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Google Maps" })).toBeVisible();
  await page.getByRole("button", { name: "I'm interested" }).click();
  await expect(page.getByRole("button", { name: "Thank you, we noted your interest." })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("button", { name: "Thank you, we noted your interest." })).toBeDisabled();
  const interests = log.filter((r) => r.path === "/events" && (r.body as { event?: string })?.event === "program_interest");
  expect(interests).toHaveLength(1);
  expect(interests[0].body).toMatchObject({ target_id: "food_bank", profile_id: PROFILE_ID });
});

test("ID card: the Arrive ID and the onboarding answers, no QR code", async ({ page }) => {
  await mockApi(page, "ar");
  await withProfile(page, "ar");
  await page.goto("/ar/id");
  const card = page.getByRole("article");
  await expect(card).toContainText(PROFILE_ID);
  await expect(card).toContainText("Gender");
  await expect(card).toContainText("الجنس");
  await expect(card).toContainText("Amira");
  await expect(page.getByRole("img")).toHaveCount(0);
  await page.screenshot({ path: "test-results/id-ar.png", fullPage: true });
});
