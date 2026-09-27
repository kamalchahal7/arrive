import { expect, test } from "@playwright/test";
import { mockApi, PROFILE_ID, withProfile } from "./fixtures";

// docs/REDESIGN.md R3: home screen, item detail, staff card with a fragment-only QR code, ID card.

test("home shows the greeting, progress and the current phase, and a tick is saved", async ({ page }) => {
  const log = await mockApi(page, "en");
  await withProfile(page);
  await page.goto("/en/home");
  await expect(page.getByRole("heading", { name: "Hello, Amira" })).toBeVisible();
  await expect(page.getByText("1 of 5 done")).toBeVisible();
  // The current phase is open, the next one is closed.
  await expect(page.getByRole("button", { name: /First 3 days/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /First 2 weeks/ })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: /First 2 weeks/ }).click();

  const box = page.getByRole("checkbox", { name: "Apply for a Social Insurance Number, for Amira" });
  await expect(box).toHaveAttribute("aria-checked", "false");
  await box.click();
  await expect(box).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("2 of 5 done")).toBeVisible();
  const patch = log.find((r) => r.method === "PATCH" && r.path === `/checklist/${PROFILE_ID}/items`);
  expect(patch?.body).toEqual({ items: [{ item_id: "sin", person_key: "self", status: "done" }] });

  await expect(page.getByRole("heading", { name: "Programs for your family" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Healthy Smiles Ontario/ })).toBeVisible();
  await page.getByRole("button", { name: "More help" }).click();
  for (const name of ["Talk to a person", "Scan a letter", "Is this real?", "Accessibility settings", "How Arrive works"]) {
    await expect(page.getByRole("link", { name })).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: "Talk to a person" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ask the avatar" })).toBeVisible();
  await page.screenshot({ path: "test-results/home-en.png", fullPage: true });
});

test("a tick made offline is kept on the phone and sent later", async ({ page }) => {
  const log = await mockApi(page, "en");
  await withProfile(page);
  await page.goto("/en/home");
  await page.getByRole("button", { name: /First 3 days/ }).isVisible();
  // Lose the connection for progress updates only.
  await page.route(/\/api\/checklist\/.*\/items/, (route) => route.abort("internetdisconnected"));
  await page.getByRole("checkbox", { name: /Understand your temporary health coverage/ }).click();
  await expect(page.getByText("Saved on this phone. It will be sent when you are back online.")).toBeVisible();
  const queued = await page.evaluate(() => localStorage.getItem("arrive.pendingProgress"));
  expect(JSON.parse(queued ?? "[]")).toEqual([{ item_id: "ifhp", person_key: "household", status: "done" }]);

  await page.unroute(/\/api\/checklist\/.*\/items/);
  await page.reload();
  await expect(page.getByRole("checkbox", { name: /Understand your temporary health coverage/ })).toHaveAttribute("aria-checked", "true");
  expect(log.filter((r) => r.method === "PATCH").at(-1)?.body).toEqual({
    items: [{ item_id: "ifhp", person_key: "household", status: "done" }],
  });
  expect(await page.evaluate(() => localStorage.getItem("arrive.pendingProgress"))).toBe("[]");
});

test("item detail in Arabic follows the spec order and works with the keyboard", async ({ page }) => {
  await mockApi(page, "ar");
  await withProfile(page, "ar");
  await page.goto("/ar/item/health_card");
  await expect(page.getByRole("heading", { level: 1, name: "قدّم طلب البطاقة الصحية في أونتاريو" })).toBeVisible();
  await expect(page.getByText("أساسي").first()).toBeVisible();
  // Per-person rows: the child is already done.
  await expect(page.getByRole("button", { name: /الطفل 1/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("لا توجد صورة لهذا المكان بعد")).toBeVisible();
  const map = page.locator("iframe");
  await expect(map).toHaveAttribute("src", /openstreetmap\.org\/export\/embed\.html\?bbox=.*marker=45\.4208154,-75\.6901177/);
  await expect(page.getByRole("link", { name: /افتح في خرائط Google/ })).toHaveAttribute(
    "href",
    /google\.com\/maps\/search\/\?api=1&query=ServiceOntario/,
  );
  await expect(page.getByRole("link", { name: /613-232-9634/ })).toHaveAttribute("href", "tel:6132329634");
  await expect(page.getByText("غير متوفر بعد")).toBeVisible(); // hours not known yet
  const doc = page.getByRole("checkbox", { name: "نموذج التسجيل" });
  await doc.focus();
  await page.keyboard.press("Space");
  await expect(doc).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("list").filter({ hasText: "اذهب إلى ServiceOntario" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Apply for OHIP and get a health card/ })).toBeVisible();
  await expect(page.getByText(/26 سبتمبر 2026|٢٦ سبتمبر ٢٠٢٦/)).toBeVisible(); // a local date, not a day early
  await page.screenshot({ path: "test-results/item-ar.png", fullPage: true });
});

test("the staff card opens on a clerk's phone from the QR code with no request to the backend", async ({ page, browser }) => {
  await mockApi(page, "ar");
  await withProfile(page, "ar");
  await page.goto("/ar/item/health_card");
  await page.getByRole("button", { name: "أظهر بطاقتي" }).click();
  await expect(page).toHaveURL(/\/ar\/card#1\./);
  const cardUrl = page.url();
  const card = page.getByRole("article");
  await expect(card).toContainText("Hello, my name is Amira.");
  await expect(card).toContainText("I am here to apply for Ontario health cards (OHIP) for my family.");
  await expect(card).toContainText("I speak Arabic (and also English).");
  await expect(card).toContainText("Bonjour, je m'appelle Amira.");
  await expect(card).toContainText("Je parle arabe (et aussi anglais).");
  await expect(card).toContainText("Your Permanent Resident card or COPR");
  await expect(card).toContainText("مرحبًا، اسمي Amira.");
  await expect(card).toContainText(PROFILE_ID);
  await expect(page.getByRole("img", { name: "رمز QR لهذه البطاقة" })).toBeVisible();
  await expect(page.getByRole("link", { name: "رجوع" })).toBeVisible();
  await page.screenshot({ path: "test-results/staff-card-ar.png", fullPage: true });

  // The clerk's phone: a fresh browser with nothing stored. Count every request.
  const clerk = await browser.newContext();
  const clerkPage = await clerk.newPage();
  const requests: string[] = [];
  clerkPage.on("request", (r) => requests.push(r.url()));
  await clerkPage.goto(cardUrl);
  await expect(clerkPage.getByRole("article")).toContainText("Hello, my name is Amira.");
  await expect(clerkPage.getByRole("button", { name: "Larger text / Texte plus grand" })).toBeVisible();
  await expect(clerkPage.getByRole("link", { name: "رجوع" })).toHaveCount(0);
  const fragment = cardUrl.split("#")[1];
  expect(requests.filter((u) => u.includes("/api/"))).toEqual([]);
  expect(requests.filter((u) => u.includes(fragment.slice(0, 24)))).toEqual([]);
  await clerk.close();

  // Back on the person's phone: the landscape "Show to staff" view.
  await page.getByRole("button", { name: "أظهر للموظف" }).click();
  await expect(page.locator(".staff-landscape")).toContainText("I speak Arabic");
  await page.getByRole("button", { name: "أغلق عرض الموظف" }).click();
});

test("a broken or edited card link shows a clear message", async ({ page }) => {
  await page.goto("/en/card#1.not-a-real-card");
  await expect(page.getByText("This card could not be read. Ask the person to show it again.")).toBeVisible();
});

test("the ID card shows the ID, the family and a QR code, and the QR link reopens the profile", async ({ page }) => {
  await mockApi(page, "en");
  await withProfile(page);
  await page.goto("/en/home");
  await page.getByRole("link", { name: "My ID" }).click();
  await expect(page).toHaveURL(/\/en\/id/);
  await expect(page.getByText("Amira", { exact: true })).toBeVisible();
  await expect(page.getByText(PROFILE_ID)).toBeVisible();
  await expect(page.getByText("Family of 4")).toBeVisible();
  await expect(page.getByRole("img", { name: "QR code with your Arrive ID" })).toBeVisible();
  await expect(page.getByText("You can show this card when you introduce yourself.")).toBeVisible();

  await page.goto(`/en/onboarding#open=${PROFILE_ID}`);
  await expect(page.getByLabel("Your Arrive ID")).toHaveValue(PROFILE_ID);
});

test("Tigrinya pages have no read-aloud button", async ({ page }) => {
  await mockApi(page, "ti");
  await withProfile(page, "ti");
  await page.goto("/ti/item/health_card");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator("button:has(svg.lucide-volume-2)")).toHaveCount(0);
});
