// Onboarding answers before the profile is created (docs/REDESIGN.md section 4.1), and the rules that turn them
// into a profile. Kept free of React so it is easy to test and reason about.

import type { Gender, OnboardingQuestion, ProfileInput } from "@/lib/types";

export type Others = { adults: number; seniors: number; children_0_5: number; children_6_17: number };
export type DisabilityAnswer = { adult: boolean; senior: boolean; child: boolean } | "none" | "prefer_not" | null;

export type Draft = {
  first_name: string | null;
  city: "ottawa" | "other" | null;
  city_name: string | null;
  province: "ontario" | "other" | null;
  country_of_origin: string | null;
  gender: Gender | null;
  self_age_group: "adult" | "senior" | null;
  /** Family members who came with the person, NOT counting the person. */
  others: Others;
  /** Children the person mentioned by voice without saying their age (the tap screen asks for it). */
  children_age_unknown: number;
  disability: DisabilityAnswer;
  other_languages: string[];
  analytics_consent: boolean;
  /** Questions answered or skipped, so going back shows what was chosen. */
  answered: OnboardingQuestion[];
};

export const EMPTY_DRAFT: Draft = {
  first_name: null,
  city: null,
  city_name: null,
  province: null,
  country_of_origin: null,
  gender: null,
  self_age_group: null,
  others: { adults: 0, seniors: 0, children_0_5: 0, children_6_17: 0 },
  children_age_unknown: 0,
  disability: null,
  other_languages: [],
  analytics_consent: false,
  answered: [],
};

export const MAX_COUNT = 20;

/** Required questions must be answered before moving on; the others have "Skip". */
export const REQUIRED: readonly OnboardingQuestion[] = ["city", "province", "self_age", "household"];

/** The questions to ask, in order. The province follow-up only appears when the city is not Ottawa. */
export function questionsFor(d: Draft): OnboardingQuestion[] {
  const out: OnboardingQuestion[] = ["first_name", "city"];
  if (d.city === "other") out.push("province");
  out.push("country_of_origin", "gender", "self_age", "household", "disability", "languages_spoken");
  return out;
}

export function totals(d: Draft): { adults: number; seniors: number; children_0_5: number; children_6_17: number } {
  const self = d.self_age_group ?? "adult";
  return {
    adults: d.others.adults + (self === "adult" ? 1 : 0),
    seniors: d.others.seniors + (self === "senior" ? 1 : 0),
    children_0_5: d.others.children_0_5,
    children_6_17: d.others.children_6_17,
  };
}

export const familySize = (d: Draft): number => {
  const t = totals(d);
  return t.adults + t.seniors + t.children_0_5 + t.children_6_17;
};

/** Which disability groups exist in this family (the question only offers those). */
export function groupsPresent(d: Draft): { adult: boolean; senior: boolean; child: boolean } {
  const t = totals(d);
  return { adult: t.adults > 0, senior: t.seniors > 0, child: t.children_0_5 + t.children_6_17 > 0 };
}

export function isAnswered(d: Draft, q: OnboardingQuestion): boolean {
  switch (q) {
    case "city":
      return d.city === "ottawa" || (d.city === "other" && Boolean(d.city_name?.trim()));
    case "province":
      return d.province !== null;
    case "self_age":
      return d.self_age_group !== null;
    case "household":
      return d.answered.includes("household") && d.children_age_unknown === 0;
    default:
      return d.answered.includes(q);
  }
}

const clamp = (n: unknown): number => Math.max(0, Math.min(MAX_COUNT, Math.round(Number(n) || 0)));

/** Merge a value understood from a voice answer (backend onboarding.to_value) into the draft. */
export function applyVoiceValue(d: Draft, q: OnboardingQuestion, value: Record<string, unknown>): Draft {
  const next: Draft = { ...d, answered: d.answered.includes(q) ? d.answered : [...d.answered, q] };
  switch (q) {
    case "first_name":
      return { ...next, first_name: (value.first_name as string | null) ?? null };
    case "city":
      return {
        ...next,
        city: (value.city as Draft["city"]) ?? null,
        city_name: (value.city_name as string | null) ?? null,
        province: value.city === "ottawa" ? "ontario" : d.city === "ottawa" ? null : d.province,
      };
    case "province":
      return { ...next, province: (value.province as Draft["province"]) ?? null };
    case "country_of_origin":
      return { ...next, country_of_origin: (value.country_of_origin as string | null) ?? null };
    case "gender":
      return { ...next, gender: (value.gender as Gender | null) ?? null };
    case "self_age":
      return { ...next, self_age_group: (value.self_age_group as Draft["self_age_group"]) ?? null };
    case "household":
      return {
        ...next,
        others: {
          adults: clamp(value.other_adults),
          seniors: clamp(value.other_seniors),
          children_0_5: clamp(value.children_0_5),
          children_6_17: clamp(value.children_6_17),
        },
        children_age_unknown: clamp(value.children_age_unknown),
      };
    case "disability": {
      const a = value.disability_adult, s = value.disability_senior, c = value.disability_child;
      if (a === null && s === null && c === null) return { ...next, disability: "prefer_not" };
      if (a === false && s === false && c === false) return { ...next, disability: "none" };
      return { ...next, disability: { adult: a === true, senior: s === true, child: c === true } };
    }
    case "languages_spoken":
      return { ...next, other_languages: ((value.other_languages as string[]) ?? []).slice(0, 10) };
  }
}

export function markAnswered(d: Draft, q: OnboardingQuestion): Draft {
  return d.answered.includes(q) ? d : { ...d, answered: [...d.answered, q] };
}

/** The request body for POST /api/profile. */
export function toProfileInput(d: Draft, locale: string): ProfileInput {
  const t = totals(d);
  const present = groupsPresent(d);
  const dis = d.disability;
  const flag = (g: "adult" | "senior" | "child"): boolean | null => {
    if (dis === null || dis === "prefer_not") return null;
    if (dis === "none") return false;
    return dis[g] && present[g];
  };
  return {
    preferred_language: locale,
    languages: [locale],
    first_name: d.first_name?.trim() || null,
    city: d.city ?? "unknown",
    city_name: d.city === "other" ? d.city_name?.trim() || null : null,
    province: d.city === "ottawa" ? "ontario" : (d.province ?? "unknown"),
    country_of_origin: d.country_of_origin,
    gender: d.gender,
    self_age_group: d.self_age_group ?? "adult",
    ...t,
    has_children: t.children_0_5 + t.children_6_17 > 0,
    has_seniors: t.seniors > 0,
    disability_adult: flag("adult"),
    disability_senior: flag("senior"),
    disability_child: flag("child"),
    other_languages: d.other_languages.filter((l) => l !== locale),
    analytics_consent: d.analytics_consent,
  };
}
