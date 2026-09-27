import { expect, type Page, test } from "@playwright/test";
import { type ApiLog, mockApi, PROFILE_ID, withProfile } from "./fixtures";

// Read-aloud is off in tests (fixtures: /tts returns 503), so the intro shows a Start button instead of moving on by
// itself after Aba's greeting. The voice path itself needs the real ElevenLabs agent and is checked by hand.
async function start(page: Page, locale: string) {
  await page.goto(`/${locale}/onboarding`);
  await page.locator("main button.btn-primary").click();
}

const profileBody = (log: ApiLog) => log.find((r) => r.path === "/profile" && r.method === "POST")?.body as Record<string, unknown>;

test("tap-only onboarding in English: seven questions and the right household profile", async ({ page }) => {
  const log = await mockApi(page, "en");
  await page.goto("/en/onboarding");
  await expect(page.getByRole("heading", { name: "Hello, I am Aba." })).toBeVisible();
  await expect(page.getByText("Nothing you tell me is shared")).toHaveCount(0);
  await page.locator("main button.btn-primary").click();

  await expect(page.getByText("Question 1 of 7")).toBeVisible();
  await expect(page.getByRole("heading", { name: "What should I call you?" })).toHaveCount(1);
  await page.getByRole("textbox", { name: "Name" }).fill("Amira");
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Which city are you placed in?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Another city" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "City" }).fill("Ottawa");
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("textbox", { name: "Country of origin" }).fill("Syria");
  await page.getByRole("button", { name: "Next" }).click();

  const genders = page.locator("main ul button");
  await expect(genders).toHaveText(["Man", "Woman", "Another gender", "Prefer not to say"]);
  await page.getByRole("button", { name: "Woman" }).click();

  await page.getByRole("button", { name: "No", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Who is arriving with you?" })).toBeVisible();
  await expect(page.getByText("Just you")).toHaveCount(0);
  await page.getByRole("button", { name: "One more: Adults (18 to 64)" }).click();
  await page.getByRole("button", { name: "One more: Children (6 to 17)" }).click();
  await page.getByRole("button", { name: "One more: Children (0 to 5)" }).click();
  await expect(page.getByRole("button", { name: "I came alone" })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.locator("main ul button")).toHaveText(["Yes", "No"]);
  await page.getByRole("button", { name: "Yes", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Is this right?" })).toBeVisible();
  await expect(page.getByText("Other languages")).toHaveCount(0);
  await expect(page.locator("dl")).toContainText("Syria");
  await page.getByRole("button", { name: "Make my checklist" }).click();

  await expect(page.getByRole("heading", { name: "Your checklist is ready" })).toBeVisible();
  await expect(page.getByText(PROFILE_ID)).toBeVisible();
  expect(profileBody(log)).toMatchObject({
    first_name: "Amira", city: "ottawa", province: "ontario", country_of_origin: "SY", gender: "woman",
    self_age_group: "adult", adults: 2, seniors: 0, children_0_5: 1, children_6_17: 1,
    disability_adult: true, disability_child: true, disability_senior: false, other_languages: [],
  });
});

test("Arabic onboarding is right-to-left with English + Arabic labels", async ({ page }) => {
  const log = await mockApi(page, "ar");
  await start(page, "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("h1")).toContainText("What should I call you?");
  await expect(page.locator("h1")).toContainText("بماذا أناديك؟");
  await page.getByRole("textbox", { name: /الاسم/ }).fill("أميرة");
  await page.getByRole("button", { name: /التالي/ }).click();
  await page.getByRole("button", { name: /تخطَّ/ }).click(); // city
  await page.getByRole("button", { name: /تخطَّ/ }).click(); // country
  await page.getByRole("button", { name: /تخطَّ/ }).click(); // gender
  await page.getByRole("button", { name: /نعم/ }).click(); // 65 or older
  await page.getByRole("button", { name: /جئت وحدي/ }).click();
  await page.getByRole("button", { name: /^No \/ لا$|لا/ }).last().click();
  await page.getByRole("button", { name: /أعدّ قائمتي/ }).click();
  await expect(page.getByRole("heading", { name: /قائمتك جاهزة/ })).toBeVisible();
  expect(profileBody(log)).toMatchObject({ first_name: "أميرة", self_age_group: "senior", adults: 0, seniors: 1, preferred_language: "ar" });
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
});

test("the language screen has exactly the six languages; returning users go to their checklist", async ({ page }) => {
  await mockApi(page, "fr");
  await withProfile(page);
  await page.goto("/en");
  await expect(page.locator("main ul a")).toHaveText(["English", "Français", "العربية", "हिन्दी", "中文", "Español"]);
  await page.getByRole("link", { name: "Français" }).click();
  await expect(page).toHaveURL(/\/fr\/home/);
});
