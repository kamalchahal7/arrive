import { expect, type Page, test } from "@playwright/test";
import { mockApi, PROFILE_ID, withProfile } from "./fixtures";

// docs/REDESIGN.md R2: onboarding works by tapping only, by voice (Arabic), and in text mode for a language
// without speech support. The API is mocked (tests/fixtures.ts); read-aloud answers 503 so the app shows text.

/** "Speak" into the fake microphone for a moment once it is really recording, then press stop. */
async function speakFor(page: Page) {
  const stop = page.getByRole("button", { name: "انتهيت من الكلام" });
  await expect(stop).toBeEnabled();
  await page.waitForTimeout(1500);
  await stop.click();
}

async function press(page: Page, name: string | RegExp) {
  const button = page.getByRole("button", { name }).first();
  await button.focus();
  await page.keyboard.press("Enter");
}

test("tap-only onboarding in English creates the right household profile", async ({ page }) => {
  const log = await mockApi(page, "en");
  await page.goto("/en");
  await page.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/onboarding/);
  await page.getByRole("button", { name: "Start" }).click();

  await expect(page.getByRole("heading", { name: "What should I call you?" })).toBeVisible();
  await page.getByLabel("Your first name").fill("Amira");
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("button", { name: "Ottawa" }).click();
  await page.getByRole("button", { name: "Syria" }).click();
  await page.getByRole("button", { name: "Woman" }).click();
  await page.getByRole("button", { name: "No, under 65" }).click();

  await expect(page.getByRole("heading", { name: "Who arrived in Canada with you?" })).toBeVisible();
  await page.getByRole("button", { name: "One more: Adults (18 to 64)" }).click();
  await page.getByRole("button", { name: "One more: Children (0 to 5 years)" }).click();
  await page.getByRole("button", { name: "One more: Children (6 to 17 years)" }).click();
  await expect(page.getByText("Family of 4")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("button", { name: "A child" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: /^العربية/ }).click();
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Is this right?" })).toBeVisible();
  await expect(page.getByText("2 adults, 1 child aged 0 to 5, 1 child aged 6 to 17")).toBeVisible();
  // Consent is off by default.
  await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  await page.screenshot({ path: "test-results/onboarding-summary-en.png", fullPage: true });
  await page.getByRole("button", { name: "Create my checklist" }).click();

  await expect(page.getByText(PROFILE_ID)).toBeVisible();
  const created = log.find((r) => r.path === "/profile" && r.method === "POST")?.body as Record<string, unknown>;
  expect(created).toMatchObject({
    first_name: "Amira", city: "ottawa", province: "ontario", country_of_origin: "SY", gender: "woman",
    self_age_group: "adult", adults: 2, seniors: 0, children_0_5: 1, children_6_17: 1,
    disability_adult: false, disability_senior: false, disability_child: true, other_languages: ["ar"],
    analytics_consent: false, preferred_language: "en",
  });
  expect(await page.evaluate(() => localStorage.getItem("arrive.profileId"))).toBe(PROFILE_ID);

  await page.getByRole("button", { name: "Go to my checklist" }).click();
  await expect(page).toHaveURL(/\/en\/home/);
  await expect(page.getByRole("heading", { name: "Hello, Amira" })).toBeVisible();
  await expect(page.getByText("1 of 5 done")).toBeVisible();
});

test("tap-only onboarding in Arabic, keyboard only, asks the province when the city is not Ottawa", async ({ page }) => {
  const log = await mockApi(page, "ar");
  await page.goto("/ar/onboarding");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await press(page, "ابدأ");
  await press(page, "تخطَّ"); // no name
  await press(page, "مدينة أخرى");
  await page.getByLabel("اسم مدينتك").fill("Toronto");
  await press(page, "التالي");
  await expect(page.getByRole("heading", { name: "هل مدينتك في أونتاريو؟" })).toBeVisible();
  await press(page, "نعم، في أونتاريو");
  await press(page, "تخطَّ"); // country
  await press(page, "أفضّل ألا أقول");
  await press(page, "نعم، 65 أو أكثر");
  await press(page, "جئت وحدي");
  await press(page, "أفضّل ألا أقول");
  await press(page, "التالي");
  await press(page, "التالي"); // no other languages
  await expect(page.getByRole("heading", { name: "هل هذا صحيح؟" })).toBeVisible();
  await page.screenshot({ path: "test-results/onboarding-summary-ar.png", fullPage: true });
  await press(page, "أنشئ قائمتي");
  await expect(page.getByText(PROFILE_ID)).toBeVisible();
  const created = log.find((r) => r.path === "/profile" && r.method === "POST")?.body as Record<string, unknown>;
  expect(created).toMatchObject({
    first_name: null, city: "other", city_name: "Toronto", province: "ontario", gender: "prefer_not_to_say",
    self_age_group: "senior", adults: 0, seniors: 1, children_0_5: 0, children_6_17: 0,
    disability_adult: null, disability_senior: null, disability_child: null,
  });
});

test.describe("voice", () => {
  // Chromium runs with a fake microphone (playwright.config.ts), so recording works without a person.
  test.use({ permissions: ["microphone"] });

  test("Arabic onboarding answers by voice, with confirmation", async ({ page }) => {
    await mockApi(page, "ar", {
      answers: {
        first_name: { value: { first_name: "أميرة" }, confirmation: "اسمكِ أميرة، هل هذا صحيح؟", heard: "اسمي أميرة" },
        household: {
          value: { other_adults: 1, other_seniors: 0, children_0_5: 1, children_6_17: 2, children_age_unknown: 0 },
          confirmation: "وصلتِ مع زوجك وثلاثة أطفال، هل هذا صحيح؟",
        },
      },
    });
    await page.goto("/ar/onboarding");
    await page.getByRole("button", { name: "ابدأ" }).click();

    await page.getByRole("button", { name: "أجب بالكلام" }).click();
    await expect(page.getByText("أستمع…")).toBeVisible();
    await speakFor(page);
    await expect(page.getByText("اسمكِ أميرة، هل هذا صحيح؟")).toBeVisible();
    await expect(page.getByText("سمعت: «اسمي أميرة»")).toBeVisible();
    await page.screenshot({ path: "test-results/onboarding-voice-confirm-ar.png", fullPage: true });
    await page.getByRole("button", { name: "نعم، هذا صحيح" }).click();

    // A voice answer that was not understood keeps the tap alternative.
    await expect(page.getByRole("heading", { name: "في أي مدينة تعيش الآن؟" })).toBeVisible();
    await page.getByRole("button", { name: "أجب بالكلام" }).click();
    await speakFor(page);
    await expect(page.getByText("Sorry, I did not understand.")).toBeVisible();
    await expect(page.getByRole("button", { name: "نعم، هذا صحيح" })).toHaveCount(0);
    await page.getByRole("button", { name: "اكتب أو المس بدلًا من ذلك" }).click();
    await page.getByRole("button", { name: "أوتاوا" }).click();

    await page.getByRole("button", { name: "تخطَّ" }).click(); // country
    await page.getByRole("button", { name: "تخطَّ" }).click(); // gender
    await page.getByRole("button", { name: "لا، أقل من 65" }).click();
    await page.getByRole("button", { name: "أجب بالكلام" }).click();
    await speakFor(page);
    await page.getByRole("button", { name: "نعم، هذا صحيح" }).click();
    await expect(page.getByRole("heading", { name: "هل لدى أحد في عائلتك إعاقة أو مرض طويل الأمد؟" })).toBeVisible();
    await page.getByRole("button", { name: "تخطَّ" }).click();
    await page.getByRole("button", { name: "تخطَّ" }).click();
    await expect(page.getByText("أميرة")).toBeVisible();
    await expect(page.getByText("عائلة من 5 أشخاص")).toBeVisible();
  });
});

test("Tigrinya works in text mode: no microphone, a clear note, tap answers", async ({ page }) => {
  await mockApi(page, "ti");
  await page.goto("/ti/onboarding");
  await expect(page.locator("html")).toHaveAttribute("lang", "ti");
  await expect(page.getByRole("note")).toContainText("ትግርኛ");
  await page.screenshot({ path: "test-results/onboarding-intro-ti.png", fullPage: true });
  await page.locator("main button.btn-primary").click(); // Start
  await expect(page.locator("h1")).toBeVisible();
  // No voice controls at all for a language without speech-to-text or read-aloud.
  await expect(page.locator("button:has(svg.lucide-mic)")).toHaveCount(0);
  await expect(page.locator("button:has(svg.lucide-rotate-ccw)")).toHaveCount(0);
  await page.locator("main input").fill("Selam");
  await page.locator("main button.btn-primary").click();
  await expect(page.locator("h1")).not.toHaveText("");
  await page.screenshot({ path: "test-results/onboarding-question-ti.png", fullPage: true });
});

test("an Arrive ID reopens a checklist on another phone", async ({ page }) => {
  await mockApi(page, "en");
  await page.goto("/en/onboarding");
  await page.getByRole("button", { name: "I already have an Arrive ID" }).click();
  await page.getByLabel("Your Arrive ID").fill("arv 7k3p 9qxm 2d4f");
  await page.getByRole("button", { name: "Open my checklist" }).click();
  await expect(page).toHaveURL(/\/en\/home/);
  expect(await page.evaluate(() => localStorage.getItem("arrive.profileId"))).toBe(PROFILE_ID);
});

test("an unknown Arrive ID shows a clear message", async ({ page }) => {
  await mockApi(page, "en");
  await page.goto("/en/onboarding");
  await page.getByRole("button", { name: "I already have an Arrive ID" }).click();
  await page.getByLabel("Your Arrive ID").fill("ARV-AAAA-BBBB-CCCC");
  await page.getByRole("button", { name: "Open my checklist" }).click();
  await expect(page.locator("#restore-error")).toHaveText("We could not find this ID. Please check it and try again.");
  await page.getByLabel("Your Arrive ID").fill("hello");
  await page.getByRole("button", { name: "Open my checklist" }).click();
  await expect(page.locator("#restore-error")).toContainText("does not look like an Arrive ID");
});

test("returning users go from the language screen straight to their checklist", async ({ page }) => {
  await mockApi(page, "fr");
  await withProfile(page);
  await page.goto("/en");
  await page.getByRole("link", { name: "Français" }).click();
  await expect(page).toHaveURL(/\/fr\/home/);
});
