import type { Page } from "@playwright/test";

export const PROFILE_UUID = "11111111-2222-4333-8444-555555555555";
export const PROFILE_ID = "ARV-7K3P-9QXM-2D4F";

export const profile = (overrides: Record<string, unknown> = {}) => ({
  id: PROFILE_UUID, public_id: PROFILE_ID, status: "unknown", arrival_date: null, city: "ottawa", province: "ontario",
  has_children: true, has_seniors: false, languages: ["en"], preferred_language: "en", needs: [], created_at: "2026-09-26T12:00:00Z",
  first_name: "Amira", city_name: null, country_of_origin: "SY", gender: "woman", self_age_group: "adult", adults: 2, seniors: 0,
  children_0_5: 1, children_6_17: 1, disability_adult: false, disability_senior: false, disability_child: false,
  other_languages: ["en"], analytics_consent: false, ...overrides,
});

const row = (item: string, person: string, label: string, title: string, essential = false, status = "todo") => ({
  item_id: item, person_key: person, person_label: label, title, summary: `${title}.`, essential, in_person: true,
  status, completed_at: null,
});

export const checklist = (lang: string) => {
  const ar = lang === "ar";
  return {
    profile_id: PROFILE_ID, language: lang, done: 1, total: 5, current_phase: "first_3_days", notes: [],
    phases: [
      { id: "first_3_days", label: ar ? "الأيام الثلاثة الأولى" : "First 3 days", done: 1, total: 2, items: [
        row("rap_orientation", "household", ar ? "عائلتك" : "Your family", ar ? "قابل موظف إعادة التوطين" : "Meet your resettlement worker", false, "done"),
        row("ifhp", "household", ar ? "عائلتك" : "Your family", ar ? "افهم تغطيتك الصحية المؤقتة" : "Understand your temporary health coverage"),
      ] },
      { id: "first_2_weeks", label: ar ? "الأسبوعان الأولان" : "First 2 weeks", done: 0, total: 3, items: [
        row("sin", "self", "Amira", ar ? "قدّم طلب رقم التأمين الاجتماعي" : "Apply for a Social Insurance Number", true),
        row("health_card", "self", "Amira", ar ? "قدّم طلب البطاقة الصحية" : "Apply for an Ontario health card (OHIP)", true),
        row("health_card", "child-1", ar ? "الطفل 1" : "Child 1", ar ? "قدّم طلب البطاقة الصحية" : "Apply for an Ontario health card (OHIP)", true),
      ] },
    ],
  };
};

export const programs = (lang: string) => ({
  profile_id: PROFILE_ID, language: lang, notes: [],
  programs: [
    { id: "healthy_smiles", group: "children", level: "ontario", title: lang === "ar" ? "ابتسامات صحية أونتاريو" : "Healthy Smiles Ontario", summary: "Free dental care for children.", has_location: false },
    { id: "linc", group: "everyone", level: "federal", title: lang === "ar" ? "دروس اللغة المجانية" : "Free English or French classes", summary: "Language classes for adults.", has_location: true },
  ],
});

export const itemDetail = (lang: string, id: string) => {
  const ar = lang === "ar";
  return {
    id, kind: id === "linc" || id === "healthy_smiles" ? "program" : "checklist", language: lang,
    title: ar ? "قدّم طلب البطاقة الصحية في أونتاريو" : "Apply for an Ontario health card (OHIP)",
    summary: ar ? "كل فرد في العائلة يحتاج بطاقة صحية." : "Everyone in your family needs a health card.",
    level: "ontario", phase: "first_2_weeks", phase_label: ar ? "الأسبوعان الأولان" : "First 2 weeks", group: null,
    essential: true, in_person: true,
    documents: ar ? ["نموذج التسجيل", "بطاقة الإقامة الدائمة"] : ["A completed registration form", "Your Permanent Resident card or COPR"],
    steps: ar ? ["اذهب إلى ServiceOntario", "أحضر وثائقك"] : ["Go to a ServiceOntario centre", "Bring your documents"],
    eligibility: ["Children 17 and under"], how_to_apply: ["Ask your dentist"],
    notes: [],
    location: {
      name: "ServiceOntario - Ottawa City Hall", institution: "ServiceOntario", address: "110 Laurier Avenue West, Ottawa, Ontario K1P 1J1",
      phone: "613-232-9634", hours: null, lat: 45.4208154, lon: -75.6901177, map_query: "ServiceOntario Ottawa City Hall", photo: null, verified: false,
    },
    source: { url: "https://www.ontario.ca/page/apply-ohip-and-get-health-card", title: "Apply for OHIP and get a health card", last_checked: "2026-09-26" },
    staff_card: true,
    rows: [
      { person_key: "self", person_label: "Amira", status: "todo" },
      { person_key: "child-1", person_label: ar ? "الطفل 1" : "Child 1", status: "done" },
    ],
    reviewed: false,
    disclaimer: "This is information, not legal or tax advice.",
  };
};

export type ApiLog = { path: string; method: string; body: unknown }[];

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

type Options = {
  /** What /api/onboarding/answer returns, per question key. */
  answers?: Record<string, { value: Record<string, unknown>; confirmation: string; heard?: string }>;
};

/** Mocks every call to the Arrive API used by the newcomer pages. Returns a log of the requests. */
export async function mockApi(page: Page, lang: string, options: Options = {}): Promise<ApiLog> {
  const log: ApiLog = [];
  await page.route(/\/api\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, "");
    const method = req.method();
    let body: unknown = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    log.push({ path, method, body });
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (path.startsWith("/roadmap/steps/")) return route.fulfill({ status: 204 });
    if (path.startsWith("/roadmap/")) return json(roadmap(lang));
    if (path === "/ask") return json(answer(lang));
    if (path === "/profile" && method === "POST") return json(profile({ ...(body as object), preferred_language: lang }), 201);
    if (path.startsWith("/profile/") && method === "GET") {
      return path.endsWith(PROFILE_ID) ? json(profile({ preferred_language: lang })) : json({ error: "profile_not_found" }, 404);
    }
    if (path.startsWith("/profile/")) return json(profile({ ...(body as object) }));
    if (path.startsWith("/checklist/")) return method === "GET" ? json(checklist(lang)) : json({ updated: 1, done: 2, total: 5 });
    if (path.startsWith("/programs/")) return json(programs(lang));
    if (path.startsWith("/items/")) {
      const itemLang = url.searchParams.get("lang") ?? lang;
      return json(itemDetail(itemLang, path.split("/")[2]));
    }
    if (path === "/onboarding/answer") {
      const form = req.postDataBuffer()?.toString("latin1") ?? "";
      const key = /name="question_key"\r\n\r\n([a-z_]+)/.exec(form)?.[1] ?? "";
      const a = options.answers?.[key];
      if (!a) return json({ question_key: key, understood: false, declined: false, value: {}, confirmation: "Sorry, I did not understand.", heard: "" });
      return json({ question_key: key, understood: true, declined: false, heard: "", ...a });
    }
    // No read-aloud in tests: the app falls back to text, as it does for a language without speech.
    if (path === "/tts") return json({ error: "tts_not_configured" }, 503);
    if (path === "/voice/session") return json({ error: "voice_not_configured" }, 503);
    return json({ error: "internal_error" }, 500);
  });
  return log;
}

/** A device that already has a profile (and, like after onboarding, the profile cached on the phone). */
export async function withProfile(page: Page, lang = "en") {
  await page.addInitScript(
    ({ id, cached }) => {
      try {
        localStorage.setItem("arrive.profileId", id);
        localStorage.setItem("arrive.profile", JSON.stringify(cached));
      } catch {
        /* ignore */
      }
    },
    { id: PROFILE_ID, cached: profile({ preferred_language: lang }) },
  );
}
