// Onboarding answers before the profile is created, and the rules that turn them into a profile.
// Seven questions: name, city, country of origin, gender, 65 or older, who came with you, disability (yes/no).
// Kept free of React so it is easy to test and reason about.

import type { Gender, OnboardingQuestion, ProfileInput } from "@/lib/types";

export type Others = { adults: number; seniors: number; children_0_5: number; children_6_17: number };

export type Draft = {
  first_name: string | null;
  city_name: string | null;
  /** ISO code when the country was recognised; the name as said is kept either way (country_text). */
  country_of_origin: string | null;
  country_text: string | null;
  gender: Gender | null;
  self_age_group: "adult" | "senior" | null;
  /** Family members who came with the person, NOT counting the person. */
  others: Others;
  disability: boolean | null;
  analytics_consent: boolean;
  /** Questions answered or skipped, so going back shows what was chosen. */
  answered: OnboardingQuestion[];
};

export const EMPTY_DRAFT: Draft = {
  first_name: null,
  city_name: null,
  country_of_origin: null,
  country_text: null,
  gender: null,
  self_age_group: null,
  others: { adults: 0, seniors: 0, children_0_5: 0, children_6_17: 0 },
  disability: null,
  analytics_consent: false,
  answered: [],
};

export const QUESTIONS: readonly OnboardingQuestion[] = [
  "first_name",
  "city",
  "country_of_origin",
  "gender",
  "self_age",
  "household",
  "disability",
];

/** Required questions must be answered before moving on; the others have "Skip". */
export const REQUIRED: readonly OnboardingQuestion[] = ["self_age", "household", "disability"];

export function totals(d: Draft): Others {
  const self = d.self_age_group ?? "adult";
  return {
    adults: d.others.adults + (self === "adult" ? 1 : 0),
    seniors: d.others.seniors + (self === "senior" ? 1 : 0),
    children_0_5: d.others.children_0_5,
    children_6_17: d.others.children_6_17,
  };
}

export function isAnswered(d: Draft, q: OnboardingQuestion): boolean {
  switch (q) {
    case "self_age":
      return d.self_age_group !== null;
    case "disability":
      return d.disability !== null;
    default:
      return d.answered.includes(q);
  }
}

export function markAnswered(d: Draft, q: OnboardingQuestion): Draft {
  return d.answered.includes(q) ? d : { ...d, answered: [...d.answered, q] };
}

export const isOttawa = (city: string | null): boolean => !city || /ottawa|أوتاوا|اوتاوا|ओटावा|渥太华/i.test(city);

/** The request body for POST /api/profile. */
export function toProfileInput(d: Draft, locale: string): ProfileInput {
  const t = totals(d);
  const kids = t.children_0_5 + t.children_6_17;
  const flag = (present: boolean): boolean | null => (d.disability === null ? null : d.disability && present);
  const city = d.city_name?.trim() || null;
  const ottawa = isOttawa(city);
  return {
    preferred_language: locale,
    languages: [locale],
    first_name: d.first_name?.trim() || null,
    city: city ? (ottawa ? "ottawa" : "other") : "unknown",
    city_name: city && !ottawa ? city : null,
    province: ottawa ? "ontario" : "unknown",
    country_of_origin: d.country_of_origin,
    gender: d.gender,
    self_age_group: d.self_age_group ?? "adult",
    ...t,
    has_children: kids > 0,
    has_seniors: t.seniors > 0,
    disability_adult: flag(t.adults > 0),
    disability_senior: flag(t.seniors > 0),
    disability_child: flag(kids > 0),
    other_languages: [],
    analytics_consent: d.analytics_consent,
  };
}
