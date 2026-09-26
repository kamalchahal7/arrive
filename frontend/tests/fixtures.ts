import type { Page } from "@playwright/test";

export const PROFILE_ID = "11111111-2222-4333-8444-555555555555";

const roadmap = (lang: string) => ({
  profile_id: PROFILE_ID,
  language: lang,
  weeks_since_arrival: 2,
  done: 1,
  total: 4,
  steps: [
    step("s1", "sin", lang === "ar" ? "احصل على رقم التأمين الاجتماعي" : "Get your Social Insurance Number (SIN)", "done", false),
    step("s2", "ohip", lang === "ar" ? "قدّم طلب البطاقة الصحية" : "Apply for your Ontario health card (OHIP)", "todo", true, [{ id: "child_benefit", title: "Canada Child Benefit" }]),
    step("s3", "bank_account", lang === "ar" ? "افتح حسابًا مصرفيًا" : "Open a bank account", "todo", false),
    step("s4", "child_benefit", lang === "ar" ? "قدّم طلب إعانة الطفل" : "Apply for the Canada Child Benefit", "todo", false),
  ],
});

function step(id: string, template: string, title: string, status: string, now: boolean, unlocks: { id: string; title: string }[] = []) {
  return {
    id, template_id: template, custom: false, title, summary: `${title}.`, documents: ["Permanent resident card or COPR"],
    where: "ServiceOntario", timing_label: "Suggested: in your first 2 weeks", due_date: "2026-10-10", status, is_now: now,
    topic: "health_card", source: { url: "https://www.ontario.ca/page/apply-ohip-and-get-health-card", title: "Apply for OHIP and get a health card", last_checked: "2026-09-26" },
    unlocks, reviewed: false, rule_may_have_changed: false,
  };
}

const answer = (lang: string) => ({
  request_id: "99999999-2222-4333-8444-555555555555",
  status: "answered",
  language: lang,
  topic: "health_card",
  urgency: "normal",
  emergency: false,
  emergency_message: null,
  possible_scam: false,
  answer: lang === "ar" ? "يمكنك التقديم على البطاقة الصحية في مكتب ServiceOntario." : "You can apply for a health card at a ServiceOntario centre.",
  steps: lang === "ar" ? ["احضر وثائقك", "اذهب إلى ServiceOntario"] : ["Bring your documents", "Go to ServiceOntario"],
  sources: [{ id: 1, source_id: 1, title: "Apply for OHIP and get a health card", url: "https://www.ontario.ca/page/apply-ohip-and-get-health-card", section: null, last_checked: "2026-09-26" }],
  follow_ups: [lang === "ar" ? "ما الوثائق التي أحتاجها؟" : "What documents do I need?"],
  message: null,
  handoff_suggested: false,
  handoff_reason: null,
  disclaimer: "This is information, not legal or tax advice.",
});

/** Mocks every call to the Arrive API used by the newcomer pages. */
export async function mockApi(page: Page, lang: string) {
  await page.route(/\/api\//, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, "");
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path.startsWith("/roadmap/steps/")) return route.fulfill({ status: 204 });
    if (path.startsWith("/roadmap/")) return json(roadmap(lang));
    if (path === "/ask") return json(answer(lang));
    if (path === "/profile") return json({ id: PROFILE_ID }, 201);
    if (path.startsWith("/profile/")) return json({ id: PROFILE_ID });
    if (path === "/voice/session") return json({ error: "voice_not_configured" }, 503);
    return json({ error: "internal_error" }, 500);
  });
}

export async function withProfile(page: Page) {
  await page.addInitScript((id) => {
    try {
      localStorage.setItem("arrive.profileId", id);
    } catch {
      /* ignore */
    }
  }, PROFILE_ID);
}
